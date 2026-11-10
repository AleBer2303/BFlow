# 0015. Persistencia nativa con `expo-sqlite/kv-store` y sobre versionado de caché

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Resuelve los hallazgos R-01, R-02 y R-03 de [`docs/Improvements/PERFORMANCE_AUDIT_2026-11-09.md`](../Improvements/PERFORMANCE_AUDIT_2026-11-09.md) (Fase 1). Modifica la persistencia introducida en el [ADR 0006](0006-quality-improvements-offline-cache-store-slicing-and-virtualization.md) §2.1 para abarcar las tres plataformas del [ADR 0010](0010-platform-skins-and-responsive-layout.md) (iOS, Android y Web).
- **Autores:** Architect, Mobile Developer y QA Engineer

---

## 1. Contexto y problema

La auditoría de rendimiento y persistencia detectó tres fallos P0 en la capa local de BFlow:

1. **R-01 — Sin persistencia en disco en iOS y Android:** `persistentStorageAdapter.ts` dependía únicamente de `globalThis.localStorage` con respaldo en un `Map` en memoria. En Hermes (Expo Go, `.ipa` en iOS y `.apk` en Android) `localStorage` no existe, por lo que tanto la sesión (`bflow.auth.session.v1`) como la caché de cuenta (`bflow.account.cache.*`) vivían solo en RAM y se perdían al cerrar el proceso. Los tests unitarios pasaban porque solo ejercitaban el `Map` en memoria dentro del mismo proceso.
2. **R-02 — Firebase Auth en memoria en nativo:** `getFirebaseAuth()` en `src/data/firebase/firebaseConfig.ts` inicializaba Firebase Auth con `inMemoryPersistence` cuando `Platform.OS !== 'web'`, obligando al usuario a autenticarse en cada arranque en frío en iOS y Android.
3. **R-03 — Datos financieros huérfanos tras cerrar sesión y caché sin contrato de versión ni propietario:** `clearPersistedAccount(uid)` no tenía ninguna llamada en el código de producción (`handleSignOut`, `clearWorkspaceSession`, `resetFullAccount`), dejando en el almacenamiento local el historial financiero tras salir o reiniciar la cuenta. Además, `accountCache.ts` guardaba `FullCloudAccountData` desnudo sin verificar la versión del esquema (`schemaVersion`) ni que el documento leído correspondiera al `uid` solicitado.

### 1.1. Requisitos de la solución

- **Funcionar en Modo A (Expo Go en iOS y Android + Web) y en Modo B (`.ipa` y `.apk`):** el desarrollo diario en Windows 11 usa Expo Go sin compilación nativa local (`AGENTS.md` §2).
- **Mantener una API de lectura/escritura síncrona** en `persistentStorage`: `buildInitialState()` hidrata el store de Zustand de forma síncrona al construir el estado inicial. Pasar a una interfaz asíncrona obligaría a reescribir todos los consumidores y tests del store.
- **No cargar SQLite ni WASM en Web:** en el navegador `localStorage` ya es síncrono, inmediato y no requiere un Web Worker ni cabeceras `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`.
- **Ser compatible con `getReactNativePersistence` de `firebase/auth` (`firebase@11`):** requiere un objeto con `getItem`, `setItem` y `removeItem` basados en promesas (`ReactNativeAsyncStorage`).

---

## 2. Alternativas evaluadas

| Criterio | `expo-sqlite/kv-store` | `@react-native-async-storage/async-storage` | `react-native-mmkv` | `expo-secure-store` |
| :--- | :--- | :--- | :--- | :--- |
| **API síncrona (`getItemSync` / `setItemSync`)** | **Sí** (JSI sobre SQLite) | No (solo asíncrona) | Sí (JSI sobre mmap) | Sí, pero limitada |
| **API asíncrona compatible con `ReactNativeAsyncStorage`** | **Sí** (`getItem`, `setItem`, `removeItem` son `async`) | Sí | Requiere adaptador manual | Requiere adaptador manual |
| **Incluido en Expo Go (Modo A, SDK 58)** | **Sí** (`expo-sqlite` viene preintegrado en Expo Go) | Sí | **No** (requiere Development Build / prebuild) | Sí |
| **Límite de tamaño por valor** | **Sin límite práctico** (206 KB a 60 meses cabe holgadamente) | ~2 MB en Android (`CursorWindow`) | Sin límite práctico | **2.048 bytes** (insuficiente para la caché de cuenta) |
| **Impacto en Web si se aísla por extensión `.native.ts`** | **0 bytes** (Metro resuelve `.ts` en Web) | 0 bytes | 0 bytes | 0 bytes |

### Motivos de descarte

- **`@react-native-async-storage/async-storage`:** carece de lectura síncrona. Usarlo en `persistentStorage` rompería la hidratación síncrona de `resolveDefaultInitialAuthUser()` y el contrato de `BFlowStorageAdapter`, además de exponer en Android el límite de `CursorWindow` cuando el JSON de la cuenta crece con los años.
- **`react-native-mmkv`:** su módulo JSI nativo no forma parte del binario de Expo Go; importarlo en Modo A rompe el flujo de desarrollo diario en Windows 11 (`AGENTS.md` §2).
- **`expo-secure-store`:** el límite de 2 KB en iOS Keychain / Android Keystore impide almacenar la caché de cuenta (6,5 KB con 1 mes; 206,5 KB con 60 meses según la medición de laboratorio).

---

## 3. Decisión

### 3.1. Backend de almacenamiento separado por plataforma de Metro

Se mantiene intacta la interfaz pública síncrona `BFlowStorageAdapter` en `src/platform/storage/persistentStorageAdapter.ts`, respaldada por un caché rápido en memoria (`memoryStore`) y un backend enchufable por plataforma:

- **`src/platform/storage/storageBackend.ts` (Web y Jest):** delega en `globalThis.localStorage` con aislamiento de errores.
- **`src/platform/storage/storageBackend.native.ts` (iOS y Android — Expo Go y builds nativos):** delega en `Storage.getItemSync`, `Storage.setItemSync`, `Storage.removeItemSync` y `Storage.clearSync` de `expo-sqlite/kv-store`.

Al aislar el import de `expo-sqlite/kv-store` exclusivamente en archivos `.native.ts`, el bundler de Web nunca incluye `expo-sqlite` ni su binario `.wasm`.

### 3.2. Persistencia de Firebase Auth por plataforma

Se extrae la resolución de `Persistence` de Firebase Auth a dos módulos hermanos bajo `src/data/firebase/`:

- **`src/data/firebase/authPersistence.ts` (Web y Jest):** devuelve `browserLocalPersistence` en navegador (`Platform.OS === 'web'`) e `inMemoryPersistence` en el entorno de tests Node.
- **`src/data/firebase/authPersistence.native.ts` (iOS y Android):** importa `Storage` de `expo-sqlite/kv-store` (cuya exportación por defecto implementa `getItem`, `setItem` y `removeItem` asíncronos compatibles con la interfaz `ReactNativeAsyncStorage`) y lo envuelve con `getReactNativePersistence` del punto de entrada de React Native de `@firebase/auth` (`firebase@11.10.0`), con respaldo a `inMemoryPersistence` si el entorno falla.

### 3.3. Sobre versionado para la caché de cuenta (`schemaVersion: 2`)

`src/platform/storage/accountCache.ts` reemplaza la clave `bflow.account.cache.v1.<uid>` por `bflow.account.cache.v2.<uid>` y envuelve el payload en un sobre verificable:

```ts
export const ACCOUNT_CACHE_SCHEMA_VERSION = 2;

export interface PersistedAccountEnvelopeV2 {
  schemaVersion: typeof ACCOUNT_CACHE_SCHEMA_VERSION;
  uid: string;
  savedAt: string;
  data: FullCloudAccountData;
}
```

`loadPersistedAccount(uid)` descarta (y borra del almacenamiento) cualquier valor que:
- no sea un objeto con `schemaVersion === 2`,
- tenga `envelope.uid !== uid` (impide fugas cruzadas entre cuentas),
- carezca de `savedAt` válido o de un objeto `data` con `activeMonthKey` en formato `"YYYY-MM"` y `availableMonths` como arreglo, o
- provenga del formato `v1` sin sobre (además purga de forma oportunista la clave legada `bflow.account.cache.v1.${uid}`).

### 3.4. Limpieza determinista al cerrar sesión y al reiniciar la cuenta

- `clearWorkspaceSession()` y `setAuthUser(null)` en `createAuthSlice.ts`, `handleSignOut()` en `src/app/index.tsx` y `signOutCurrentUser()` en `authAdapter.ts` invocan `clearPersistedAccount(uid)` para el UID saliente (tomado del estado activo o de la sesión persistida antes de borrarla).
- `resetFullAccount()` en `createAuthSlice.ts` invoca `clearPersistedAccount(state.authUser.uid)` para que un reinicio de cuenta no rehidrate el presupuesto anterior en el siguiente arranque.

---

## 4. Seguridad y evolución hacia cifrado local (ADR 0016)

Inicialmente `expo-sqlite/kv-store` almacenaba las parejas clave-valor en SQLite sin cifrado de motor (sin SQLCipher, ya que `useSQLCipher` no está soportado en Expo Go Modo A).

Mediante el **[ADR 0016](0016-local-storage-encryption-and-secure-store.md)** se añade una capa de cifrado autenticado a nivel de aplicación para iOS, Android y Web:

1. **Por qué no se activa SQLCipher:** en Expo SDK 58, `useSQLCipher` requiere compilación nativa personalizada (`expo-build-properties`) y **no está soportado en Expo Go (Modo A)**, lo que violaría la regla de Doble Modo (`AGENTS.md` §2). En su lugar, el [ADR 0016](0016-local-storage-encryption-and-secure-store.md) cifra todos los valores con **AES-256-CTR + HMAC-SHA256** antes de escribirlos en SQLite o `localStorage`.
2. **Custodia en hardware (`expo-secure-store`):** el token maestro generado por dispositivo y las claves de sesión activa se custodian en iOS Keychain / Android Keystore mediante `expo-secure-store`, derivando la llave de cifrado a partir de la palabra secreta de aplicación más el token generado.
2. **Qué datos quedan en SQLite local:**
   - El token de sesión y refresh token de Firebase Auth.
   - El perfil básico de sesión (`bflow.auth.session.v1`).
   - El sobre `PersistedAccountEnvelopeV2` con el presupuesto, deudas, ahorros e historial del usuario autenticado (`bflow.account.cache.v2.<uid>`).
   - **Nunca** se almacenan contraseñas en texto plano ni claves privadas de servidor.
3. **Mitigaciones aplicadas:**
   - **Aislamiento de sandbox del sistema operativo:** en iOS (Data Protection `NSFileProtectionCompleteUntilFirstUserAuthentication` por defecto del contenedor de la app) y en Android (directorio interno `/data/data/com.bflow.app/` con permisos de usuario Linux exclusivos de la app), ninguna otra aplicación instalada en un dispositivo no vulnerado (sin jailbreak ni root) puede leer el archivo SQLite.
   - **Borrado explícito en cierre de sesión y reinicio:** al ejecutar `handleSignOut`, `signOutCurrentUser`, `clearWorkspaceSession` o `resetFullAccount`, se eliminan de SQLite tanto la sesión como el sobre `bflow.account.cache.v2.<uid>` (y cualquier residuo `v1`).
   - **Validación estricta de `uid`:** el sobre exige coincidencia exacta entre la clave solicitada y `envelope.uid` antes de hidratar datos.

---

## 5. Consecuencias

- **Nuevos binarios requeridos para Modo B:** aunque Expo Go ya incluye `expo-sqlite`, los binarios autónomos `.ipa` (`build-ios.yml`) y `.apk`/`.aab` (`build-android.yml`) deben recompilarse para enlazar el módulo nativo `ExpoSQLite` en el próximo release.
- **Compatibilidad Android (R8):** las clases JNI de `expo-sqlite` (`NativeDatabaseBinding`, `NativeStatementBinding`, `NativeSessionBinding`) están anotadas con `@DoNotStrip` de `expo.modules.core.interfaces.DoNotStrip` (conservado por las reglas de consumidor de `expo-modules-core`), por lo que R8 no las renombra y no requieren entradas adicionales en `plugins/withAndroidKeepRules.js`.
- **Invalidación transparente de cachés `v1`:** los usuarios en Web que tuvieran una entrada `bflow.account.cache.v1.<uid>` la descartarán limpiamente en el primer arranque y guardarán el formato `v2` tras sincronizar con Firestore.
- **Pruebas realistas de persistencia:** `persistentStorageAdapter.ts` expone utilidades de prueba (`__resetMemoryCacheForTests`, `__setStorageBackendForTests`) que vacían el `Map` en memoria sin borrar el backend subyacente, obligando a los tests a demostrar que los datos realmente sobreviven a un reinicio de proceso.
