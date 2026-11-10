# 0013. Reglas keep de R8 para el release de Android (cierre al iniciar sesión)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende el [ADR 0009](0009-android-build-environment.md) (entorno de compilación Android). Afecta a la escena de la curva de los ADR [0007](0007-three-js-monthly-overview-scene.md) y [0008](0008-monthly-curve-replaces-tubes.md).
- **Autores:** Architect, Mobile Developer y QA Engineer

---

## 1. Contexto y problema

El `.apk` publicado por `build-android.yml` se cerraba solo al iniciar sesión o al crear una cuenta. En Expo Go, con el mismo JavaScript, no ocurría.

Las dos acciones terminan igual: `setAuthUser` deja de mostrar `AuthScreen` y monta el Resumen, que contiene el primer `GLView` de la app (la curva del mes). El cierre ocurre ahí, no en la autenticación.

### 1.1. Evidencia

| Hecho | Dónde se comprobó |
| :--- | :--- |
| El release de Android se compila con R8: `android.enableMinifyInReleaseBuilds=true` | `android/gradle.properties` generado por `npx expo prebuild --platform android` (plantilla `node_modules/expo/template.tgz`) |
| `expo-gl` busca un método Java por su nombre desde C++: `GetMethodID(GLContextClass, "flush", "()V")` | `node_modules/expo-gl/android/src/main/cpp/EXGLJniApi.cpp`, función `EXGLContextPrepare` |
| `expo-gl` no publica reglas de consumidor | No hay ningún `.pro` en `node_modules/expo-gl/android` ni `proguard.txt` dentro de `expo.modules.gl-58.0.4.aar` |
| Ninguna otra regla conserva `expo.modules.gl.GLContext` | Reglas de `expo-modules-core`, `expo`, `react-native` y de la plantilla |
| Entre las librerías revisadas es la única con búsquedas JNI por nombre y sin reglas | Dependencias directas con código Android y módulos base de Expo (`expo-asset`, `expo-font`, `expo-file-system`, `expo-keep-awake`, `expo-modules-core`): 18 paquetes |
| Los `.apk` publicados (`android-build-1` y `android-build-2`) salieron del commit `0c5f903` | `git tag` |

Con esto, R8 renombra `GLContext.flush()`. Cuando el `GLView` recibe su superficie, `EXGLContextPrepare` no encuentra el método, queda pendiente un `NoSuchMethodError` y se lanza en el hilo de JavaScript, lo que termina el proceso. Expo Go no pasa por R8.

El cambio de `android_ripple` del commit `9f61f69` no tiene relación con este cierre.

## 2. Decisión

1. **`plugins/withAndroidKeepRules.js`**, un config plugin local declarado en `app.json`. En cada prebuild añade a `android/app/proguard-rules.pro` un bloque delimitado con:

   ```proguard
   -keep class expo.modules.gl.** { *; }
   ```

   Se conserva el paquete completo y no solo `flush()`: es pequeño (7 archivos fuente) y así la regla no depende de qué otras partes alcance R8.
2. El plugin es idempotente (sustituye su bloque anterior) y no usa dependencias nuevas: `expo/config-plugins` ya viene con `expo`.
3. R8 sigue activo. Desactivarlo también evitaría el cierre, pero aumentaría el tamaño del `.apk` y dejaría sin probar la configuración que usa la plantilla.

### 2.1. Alternativas descartadas

| Alternativa | Motivo |
| :--- | :--- |
| `expo-build-properties` con `extraProguardRules` | Añade una dependencia y un cambio de `package-lock.json` para escribir una línea |
| Parchear `node_modules/expo-gl` en `postinstall` | Se rompe en silencio al actualizar el paquete |
| Editar `android/` a mano | El directorio no está en git y `expo prebuild --clean` lo regenera |

## 3. Consecuencias

- Toda regla keep futura del proyecto se añade a `KEEP_RULES` en el plugin, con un comentario que explique el motivo.
- Un módulo nativo nuevo que llegue a Java por nombre (JNI o reflexión) y no traiga reglas de consumidor fallará igual: solo en el `.apk`, nunca en Expo Go. Antes de darlo por bueno hay que probar el `.apk`.
- El test de contrato falla si `expo-gl` cambia su puente JNI. En ese caso la regla se revisa; si el paquete empieza a publicar sus propias reglas, se retira.

## 4. Validación

| Verificación | Resultado |
| :--- | :--- |
| `npx jest plugins` | 10 tests: combinación de reglas, idempotencia, sustitución de un bloque anterior, escritura en el proyecto generado, registro en `app.json` y contrato con `expo-gl` |
| `npx expo prebuild --platform android --no-install` en Windows 11 | `android/app/proguard-rules.pro` contiene el bloque después de las reglas de la plantilla; `android.enableMinifyInReleaseBuilds=true` |
| `npm run typecheck`, `npm run lint`, `npm test` | Sin errores |

**Sin verificar:** no se compiló el `.apk` ni se ejecutó en un teléfono. Este equipo no tiene el SDK de Android ni `adb`, así que tampoco se leyó el `logcat` del cierre: la causa se dedujo del código de las dependencias. La comprobación final es instalar el `.apk` que genere `build-android.yml` con este cambio e iniciar sesión.

Si el `.apk` nuevo aún se cerrara, el siguiente paso es capturar el motivo con `adb logcat -b crash` mientras se reproduce.
