# 0019. Alinear el runtime de expo-modules con los AAR precompilados (cierre al abrir el `.apk`)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende los ADR [0009](0009-android-build-environment.md) y [0013](0013-android-release-keep-rules.md). Afecta a la persistencia nativa del [ADR 0015](0015-native-persistence-sqlite-kv-store.md).
- **Autores:** Mobile Developer y QA Engineer

---

## 1. Contexto y problema

El `.apk` se cerraba al abrirlo, antes de mostrar la pantalla de inicio de sesión. En Expo Go la app funcionaba.

### 1.1. Evidencia

Se compiló el release en local (`assembleRelease`, solo `x86_64`) y se ejecutó en un emulador con API 36. El `logcat` mostró:

```
NoSuchMethodError: No static method register(Ljava/lang/String;Ljava/lang/Class;
  Lio/github/expo/modules/v2/modules/ModuleBuilder;Z)I in class
  Lio/github/expo/modules/v2/sharedobjects/SharedObjectRegistry;
  at cr1.<clinit>()                       // cr1 = expo.modules.sqlite.NativeDatabase
FATAL EXCEPTION: mqt_v_native
JavascriptException: Error: Cannot find native module 'ExpoSQLite'
```

| Hecho | Dónde se comprobó |
| :--- | :--- |
| `expo-sqlite` 58.0.15 se instala como AAR precompilado | `node_modules/expo-sqlite/local-maven-repo/.../expo.modules.sqlite-58.0.15.aar` |
| Ese AAR llama a `SharedObjectRegistry.register(String, Class, ModuleBuilder, boolean)` | `javap -c` sobre `expo.modules.sqlite.NativeDatabase` del AAR |
| `expo-modules-core` 58.0.28 declara `expoModulesV2Version = "0.2.6"`, cuyo `register` solo tiene 3 parámetros | `javap` sobre `expo-modules-v2-react-0.2.6` |
| `expo-modules-core` 58.0.29 y 58.0.30 declaran `0.2.7` | `npm pack` de ambas versiones |
| `expo-sqlite` 58.0.15 y `expo-modules-core` 58.0.29 se publicaron el mismo día; `package-lock.json` seguía fijando el core en 58.0.28 | `npm view ... time` |

No era R8: las reglas de `expo-modules-core` conservan `io.github.expo.modules.v2.**`. El método no existía en el runtime instalado. Expo Go trae su propio runtime nativo, por eso allí no fallaba.

`expo-sqlite/kv-store` se importa al cargar el módulo de almacenamiento (ADR 0015 y 0016), así que el error saltaba al arrancar, antes de pintar nada.

## 2. Decisión

1. Subir `expo` a `~58.0.23`. Esa versión exige `expo-modules-core ~58.0.30` (runtime `expo-modules-v2` 0.2.7). No se usa 58.0.24, publicada el mismo día de este cambio.
2. Añadir `plugins/__tests__/expoModulesRuntimeVersion.test.js`. El test falla si `package-lock.json` combina `expo-sqlite >= 58.0.15` con `expo-modules-core < 58.0.29`, o si el `expo-modules-core` instalado declara un runtime anterior a 0.2.7.
3. El resto de dependencias que `npx expo install --check` marca como desactualizadas no se toca aquí.

## 3. Consecuencias

- Cuando se actualice un módulo de Expo con AAR precompilado (`expo-sqlite`, `expo-secure-store`, `expo-gl`, etc.), también hay que actualizar `expo` para que `expo-modules-core` lo acompañe. Lo más seguro es `npx expo install --fix`.
- Igual que en el ADR 0013, este tipo de fallo solo aparece en el `.apk`. Antes de dar por bueno un cambio de dependencias nativas hay que instalar el `.apk` y abrirlo.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `.apk` release con `expo-modules-core` 58.0.28, emulador API 36 | Se cierra al abrir (traza de §1.1) |
| `.apk` release con `expo` 58.0.23 / `expo-modules-core` 58.0.30 | Abre y muestra la pantalla de inicio de sesión; sin `FATAL` en `logcat` |
| `npm run typecheck`, `npm run lint`, `npm test` | Sin errores |

**Sin verificar:** no se probó en un teléfono físico ni con las ABI `arm64-v8a`/`armeabi-v7a`. Tampoco se probó iniciar sesión en el `.apk`. Falta instalar el `.apk` que genere `build-android.yml`.

### 4.1. Compilar el release en este equipo Windows

La ruta del perfil (`C:\Users\ALEJO BERNAL`) tiene un espacio y la del proyecto es larga. Para compilar en local hizo falta:

- `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\gtmp` (si no, Gradle falla con "Unable to establish loopback connection").
- Copiar el proyecto a `C:\bf` y apuntar el SDK a una unión sin espacios (`C:\asdk`). Si no, CMake invoca a clang con el nombre corto `CLANG_~1`, clang no se reconoce como `clang++` y no enlaza `libc++`.
- Acortar `externalNativeBuild.cmake.buildStagingDirectory` en `android/app/build.gradle`, porque el `ninja` de CMake 3.22.1 no admite rutas de más de 260 caracteres.

CI (Ubuntu) no necesita nada de esto.
