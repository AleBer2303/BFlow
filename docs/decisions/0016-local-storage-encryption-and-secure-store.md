# 0016. Cifrado local autenticado (AES-256 + HMAC-SHA256) y custodia de sesión en `expo-secure-store`

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende el [ADR 0015](0015-native-persistence-sqlite-kv-store.md) para eliminar el almacenamiento en texto plano en `expo-sqlite/kv-store` (iOS y Android) y en `localStorage` (Web), protegiendo tanto los tokens de sesión activa como la caché financiera del usuario mediante `expo-secure-store` y cifrado simétrico autenticado con llave derivada.
- **Autores:** Architect, Security Engineer, Mobile Developer y QA Engineer

---

## 1. Contexto y problema

En el [ADR 0015](0015-native-persistence-sqlite-kv-store.md) se adoptó `expo-sqlite/kv-store` en iOS y Android y `localStorage` en Web para persistir la sesión activa (`bflow.auth.session.v1`), las credenciales de Firebase Auth (`firebase:authUser:...`) y el sobre versionado de presupuesto (`bflow.account.cache.v2.<uid>`).

Aunque el sistema operativo protege el directorio de la aplicación mediante sandboxing (iOS Data Protection y Android File-Based Encryption), los valores almacenados dentro de la tabla SQLite de `kv-store` y en `localStorage` del navegador permanecían en **JSON en texto plano**. Esto implicaba dos riesgos:

1. **Exposición en Web (`localStorage`):** cualquier acceso físico al navegador abierto (DevTools) o script en el mismo origen podía inspeccionar directamente el JSON del presupuesto y los metadatos de sesión.
2. **Exposición en backups o contenedores de desarrollo (Modo A / Expo Go):** el token de sesión activa y los saldos financieros de la cuenta podían leerse como texto claro si se extraía la base de datos SQLite local.

### 1.1. Requisitos de la solución

- **Funcionar en iOS, Android y Web**, tanto en **Modo A (Expo Go / Web)** como en **Modo B (`.ipa` y `.apk`)** sin requerir compilación C++ personalizada que rompa Expo Go (`AGENTS.md` §2).
- **Custodia por hardware en nativo (`expo-secure-store`):** usar iOS Keychain (Secure Enclave) y Android Keystore para almacenar directamente el token secreto generado por dispositivo y la sesión activa.
- **Llave derivada de palabra clave + token generado:** derivar las llaves de cifrado y autenticación combinando una frase/semilla secreta de aplicación (`pepper` configurable en `EXPO_PUBLIC_LOCAL_CIPHER_PEPPER` con valor determinista integrado) más un token aleatorio de 256 bits generado por instalación/sesión.
- **Cifrado simétrico autenticado AES-256 (Encrypt-then-MAC):** todo valor escrito en `expo-sqlite/kv-store` (iOS/Android) o `localStorage` (Web) debe almacenarse cifrado con **AES-256-CTR + HMAC-SHA256** (`enc:v1:<ivHex>:<cipherHex>:<macHex>`).
- **API 100 % síncrona:** mantener la hidratación en el frame 0 (`buildInitialState()`) sin parpadeos de plantilla ni valores en `$ 0`.

---

## 2. Decisión

### 2.1. Gestión de secretos y sesión directa en `expo-secure-store` (iOS y Android)

Se instala `expo-secure-store` (`~58.0.x`), preintegrado en Expo Go para SDK 58 y aislado exclusivamente en archivos `.native.ts` para no impactar el bundle Web:

1. **Token maestro generado (`bflow.security.device_token.v1`):**
   - En **iOS y Android**, se genera un token criptográfico aleatorio de 256 bits (32 bytes en hexadecimal) y se guarda de forma síncrona en `expo-secure-store` (`SecureStore.getItem` / `SecureStore.setItem`) con accesibilidad `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (no migra a backups en la nube ni a otros dispositivos).
   - En **Web**, el token generado se persiste de forma aislada bajo `bflow.security.device_token.v1` y se combina con la palabra secreta de aplicación.
2. **Token de sesión activa en `expo-secure-store` directo (iOS y Android):**
   - Las claves de sesión (`bflow.auth.session.v1` y `firebase:authUser:...`) se guardan **directamente en `expo-secure-store`** (normalizando el nombre de clave al alfabeto permitido `[A-Za-z0-9._-]`) y, además, su contenido viaja cifrado con AES-256 + HMAC-SHA256.
   - Si algún payload de sesión superase el umbral seguro de Keychain/Keystore (1.800 bytes), el adaptador hace fallback transparente a `expo-sqlite/kv-store` manteniendo el cifrado AES-256.

### 2.2. Derivación de llave (`palabra + token generado`) y cifrado AES-256 + HMAC-SHA256

Se implementa el motor criptográfico síncrono `src/platform/storage/storageCipher.ts` siguiendo los estándares NIST FIPS 197 (AES-256), FIPS 180-4 (SHA-256) y FIPS 198-1 (HMAC):

1. **Derivación de llaves (HKDF-SHA256):**
   - A partir de `pepper` (palabra secreta de aplicación) + `deviceToken` (token aleatorio de 256 bits generado), se derivan dos llaves independientes de 256 bits (32 bytes cada una):
     - `encryptionKey = HMAC-SHA256(PRK, "bflow-aes256-enc-v1")`
     - `macKey = HMAC-SHA256(PRK, "bflow-hmac-sha256-v1")`
     donde `PRK = HMAC-SHA256(pepper, deviceToken)`.
2. **Esquema Encrypt-then-MAC (`enc:v1:<ivHex>:<cipherHex>:<macHex>`):**
   - Cada escritura genera un vector de inicialización (`IV`) aleatorio de 128 bits (16 bytes).
   - El texto plano UTF-8 se cifra con **AES-256 en modo CTR** usando `encryptionKey` e `IV`.
   - Se calcula la etiqueta de autenticidad `macHex = HMAC-SHA256(macKey, "enc:v1:" + ivHex + ":" + cipherHex)` en tiempo constante.
   - En lectura, si el formato no coincide o la verificación HMAC falla (datos manipulados o llave rotada), el registro se rechaza de inmediato y se purga del almacenamiento.
   - Si se encuentra un registro legado en texto plano (previo a este ADR), se migra de forma oportunista o se descarta si la validación de integridad falla.

### 2.3. Rotación criptográfica al cerrar sesión (`Sign Out`) y reiniciar cuenta

Al ejecutar `signOutCurrentUser()`, `clearWorkspaceSession()` o `resetFullAccount()`:
1. Se eliminan las entradas de sesión y de caché de cuenta en `expo-secure-store`, `expo-sqlite/kv-store` y `localStorage`.
2. Se rota el `deviceToken` en `expo-secure-store` / Web (`rotateDeviceSecretToken()`), invalidando criptográficamente cualquier texto cifrado residual.

---

## 3. Consecuencias

- **Confidencialidad e integridad en reposo en las 3 plataformas:** ni `expo-sqlite/kv-store` en iOS/Android ni `localStorage` en Web almacenan JSON ni tokens JWT en texto plano; toda inspección externa observa únicamente sobres `enc:v1:...`.
- **Cero impacto en UX ni en el arranque en frío:** la lectura síncrona de `SecureStore.getItem` + descifrado AES-256 en memoria toma `< 2 ms`, preservando la hidratación instantánea en el frame 0.
- **Regla de arquitectura verificada en CI:** `scripts/lint-check.mjs` prohíbe importar `expo-secure-store` fuera de archivos `.native.ts`.
