# 0027. CSPRNG estricto, token del dispositivo aislado, configuración por entorno y dependencias

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 2 de la auditoría de producción (`docs/Improvements/AUDITS/auditoria_produccion_bflow.md`, AUD-04 y AUD-05). Continúa los ADR [0015](0015-native-persistence-sqlite-kv-store.md) y [0016](0016-local-storage-encryption-and-secure-store.md). Aplica `AGENTS.md` §5.2, puntos 1 (librería nueva y actualización mayor) y 5 (workflows de build).
- **Autores:** Architect, Security Auditor, QA Engineer, Reviewer y Documentation Expert

---

## 1. Contexto y problema

1. **Aleatoriedad predecible en nativo.** `randomBytes()` usaba `globalThis.crypto.getRandomValues` y, si no existía, `Math.random()` con `Date.now()`. Hermes no trae WebCrypto: en `node_modules/react-native`, `expo` y `expo-modules-core` no hay ninguna implementación de `getRandomValues`, y `expo-crypto` no estaba instalado. En iOS y Android, por tanto, el token de 256 bits y los IV de AES salían siempre del generador no criptográfico.
2. **La llave junto al cifrado.** En nativo, si `SecureStore.setItem` fallaba, el token del dispositivo se escribía en texto plano en `expo-sqlite/kv-store`, la misma base que guarda el cifrado. En Web, token y cifrado compartían `localStorage`.
3. **Proyecto y correo escritos en el código.** `firebaseConfig.ts` traía la configuración del proyecto de producción como valor por defecto, y `authAdapter.ts` y `budgetRepository.ts` el correo personal del propietario.
4. **Dependencias.** `npm audit --omit=dev` daba 18 vulnerabilidades (6 altas, 11 moderadas, 1 baja).

## 2. Decisión

### 2.1. CSPRNG estricto

`src/platform/storage/secureRandom.ts` resuelve la fuente en este orden: WebCrypto y, si no existe, `getRandomValues` de **`expo-crypto`** (`SecRandomCopyBytes` en iOS, `SecureRandom` en Android). No hay tercer paso.

- Sin fuente, `randomBytes()` lanza `SecureRandomUnavailableError`. `persistentStorage.setItem` ya capturaba los errores de cifrado: el valor queda en memoria y no se escribe nada en disco.
- Una salida de 16 bytes o más toda en ceros también se rechaza. No es un caso teórico: bajo Jest, el módulo nativo simulado de `expo-crypto` no escribe nada y devuelve ceros.
- Se usa `getRandomValues` y no `getRandomBytes`, porque este último recurre a `Math.random()` en desarrollo con depuración remota.
- `rotateDeviceSecretToken()` devuelve `null` si no puede generar un token; el anterior se descarta igualmente, así que el cifrado antiguo queda ilegible.

`expo-crypto` (`~58.0.7`, la versión de `bundledNativeModules.json` del SDK 58) es un módulo nativo nuevo. Viene incluido en Expo Go.

### 2.2. Token del dispositivo: nunca junto al cifrado

El token es el único valor que llega al backend en texto plano; el resto ya está cifrado.

**Nativo (`storageBackend.native.ts`).** El token solo se escribe en el Keychain o el Keystore. Si la escritura falla, vive en memoria hasta que se cierra la app. Un token que una versión anterior dejó en SQLite se mueve al Keychain en la primera lectura y se borra de SQLite, tanto si la migración funciona como si no.

Las claves de sesión (`bflow.auth.session.v1`, `firebase:authUser:*`) conservan su comportamiento: son cifrado, y un valor mayor de 1.800 bytes o un fallo de SecureStore las lleva a SQLite, que no guarda la llave. Cerrarlas también habría cerrado la sesión en cada arranque, porque el usuario de Firebase cifrado supera ese tamaño.

**Web (`storageBackend.ts`).** El token va a `sessionStorage`; el cifrado sigue en `localStorage`. Sin `sessionStorage`, el token queda en memoria. Un token antiguo en `localStorage` se migra y se borra.

Consecuencias en Web, que son el precio de la separación:

- `sessionStorage` es por pestaña y se borra al cerrarla. La caché local del presupuesto, la sesión guardada por BFlow, el estado del limitador de intentos (ADR 0026) y la cola de escrituras pendientes ya no sobreviven a cerrar la pestaña ni se comparten entre pestañas. Una pestaña nueva no puede descifrar lo que escribió otra y lo purga.
- La sesión de Firebase Auth usa su propia persistencia (`browserLocalPersistence`) y la de Firestore su caché en IndexedDB: el usuario sigue autenticado y la cuenta se vuelve a leer de la nube, con las lecturas que eso cuesta.
- **Lo que no protege:** un script inyectado en la pestaña abierta lee `sessionStorage` igual que `localStorage`. La separación protege el cifrado que queda en disco cuando la pestaña ya se cerró, no frente a XSS en una sesión viva.

### 2.3. Configuración de Firebase solo por entorno

`resolveFirebaseEnvironment()` lee `EXPO_PUBLIC_FIREBASE_*` y devuelve su origen:

| Origen | Cuándo | Resultado |
| :--- | :--- | :--- |
| `environment` | Están `API_KEY`, `PROJECT_ID` y `APP_ID` | Se usan las variables |
| `offline-mock` | Tests sin variables, o modo vitrina siempre | Proyecto ficticio `demo-bflow` |
| `missing` | Build real sin variables | `getFirebaseApp()` lanza un error explícito |

Un valor vacío (como los de `.env.example`) o de relleno cuenta como ausente. Las variables se leen con acceso estático (`process.env.EXPO_PUBLIC_X`), la única forma que Metro sustituye al empaquetar.

Como el código ya no trae un proyecto, **los workflows de build lo reciben de las variables del repositorio** (`vars.EXPO_PUBLIC_FIREBASE_*`) y `scripts/check-build-env.mjs` corta el build si falta alguna obligatoria. `e2e.yml` no cambia: compila en modo vitrina.

Estos valores identifican el proyecto ante Firebase; no son secretos y siguen incrustados en el binario. Quitarlos del repositorio evita que un fork o un build ajeno apunte por defecto al proyecto de producción. La protección real son las reglas de Firestore, la restricción de la API key en Google Cloud y App Check (pendientes, sección 4 de la auditoría). La API key anterior sigue en el historial de git.

### 2.4. Correo del propietario de la semilla

`src/platform/mode/ownerSeedEmail.ts` decide qué cuentas reciben la semilla de octubre de 2026:

- `EXPO_PUBLIC_OWNER_SEED_EMAIL` (opcional). Sin ella, en un build real ninguna cuenta es propietaria y todas arrancan vacías.
- En tests y en modo vitrina se añade `demo.owner@bflow.example`, una dirección de dominio reservado. `DEMO_OWNER_USER` y los tests la usan en lugar del correo personal.

Si se define la variable, el correo queda incrustado en el bundle, igual que antes. Alternativa descartada por ahora: comparar contra un hash del correo, que no lo expondría; no se pidió y la variable es opcional.

### 2.5. Dependencias

| Paquete | Cambio | Motivo |
| :--- | :--- | :--- |
| `zod` | `^3.24.2` → `^4.6.7` (mayor) | GHSA-mrhx-c7xc-m3w5. Único ajuste de código: `z.ZodType<Concept, unknown>` en `firestoreSchemas.ts` |
| `@grpc/grpc-js` | `overrides` → `^1.14.7` | GHSA-m9gg-hp2v-232j y GHSA-f596-whhp-79r4; `firebase` fija `~1.9.0` |
| `@xmldom/xmldom` | `overrides` en `@bacons/xcode` → `^0.8.15` | 15 avisos en `0.7.13` |
| `uuid` | `overrides` en `@bacons/xcode` → `^11.1.1` | GHSA-w5hq-g745-h8pq |
| `expo-crypto` | Nuevo, `~58.0.7` | Sección 2.1 |

Resultado medido: **18 → 9 vulnerabilidades (0 altas; 8 moderadas, 1 baja)**.

Quedan sin corregir `deepmerge` (sin versión corregida), `glob` y `minimatch` (la corrección está en otra versión mayor). Llegan por `expo`, `@expo/fingerprint` y `@bacons/apple-targets`: son herramientas de compilación que procesan archivos del propio repositorio y no entran en el bundle de la app. Forzar otra versión mayor dentro del CLI de Expo podía romper el prebuild, que este equipo no puede ejecutar.

## 3. Alternativas descartadas

- **Solo lanzar el error, sin `expo-crypto`.** En iOS y Android no habría ninguna fuente y no se guardaría nada: ni sesión ni caché.
- **Cerrar también las claves de sesión cuando falla SecureStore.** Ver 2.2.
- **Compartir el token entre pestañas** (`BroadcastChannel`). Más superficie y complejidad para una caché que se reconstruye sola.
- **`npm audit fix --force`.** Bajaba `firebase` a 9.14 y `expo` a 52.

## 4. Verificación

- Tests: `src/platform/storage/__tests__/secureStorageHardening.test.ts`, `src/data/__tests__/firebaseEnvironment.test.ts`, `src/platform/mode/__tests__/ownerSeedEmail.test.ts` y tres guardias nuevas en `scripts/workflow-guards.test.mjs`.
- **Sin verificar:** no se compiló ni se ejecutó ningún `.apk` o `.ipa`. `expo-crypto` en un dispositivo, el comportamiento real del Keychain y el Keystore cuando fallan, y los `overrides` de `@bacons/xcode` durante un prebuild de iOS quedan por confirmar en el primer build de GitHub Actions. La guardia de `plugins/__tests__/expoModulesRuntimeVersion.test.js` (ADR 0019) cubre la alineación del runtime de `expo-crypto`.
- Medido: `npm run typecheck` y `npm run lint` en 0 errores; `npm test -- --coverage --ci` con 80 suites y 1.045 tests en verde y 98,92 % de sentencias en `src/domain/`.
- En el navegador (`npm run web:demo`, 2026-11-13): tras pulsar «Sincronizar ahora», `sessionStorage` contiene `bflow.security.device_token.v1` (64 caracteres hexadecimales), `localStorage` no lo contiene y su única entrada de BFlow empieza por `enc:v1:`. Con un `.env` que define el proyecto real, el cliente de Firebase se inicializó contra `demo-bflow`. No se probó el modo real (`npm run web`) ni el comportamiento con dos pestañas.

## 5. Qué debe hacer quien mantiene el proyecto

1. Crear en GitHub (Settings → Secrets and variables → Actions → Variables) las seis `EXPO_PUBLIC_FIREBASE_*` y, si se quiere conservar la semilla del propietario, `EXPO_PUBLIC_OWNER_SEED_EMAIL`. Sin las tres obligatorias, `build-android.yml` y `build-ios.yml` fallan a propósito.
2. Añadir `EXPO_PUBLIC_OWNER_SEED_EMAIL` al `.env` local si esa cuenta debe seguir tratándose como propietaria.
