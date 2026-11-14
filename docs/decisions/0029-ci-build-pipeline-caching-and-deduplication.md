# 0029. Optimización de la tubería de CI/CD, deduplicación de `quality-gate` y cachés nativas (Fase 6)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 6 de la auditoría de producción ([`docs/Improvements/AUDITS/auditoria_produccion_bflow.md`](../Improvements/AUDITS/auditoria_produccion_bflow.md), hallazgo **AUD-09**). Modifica la tubería de empaquetado y distribución (`.github/workflows/ci.yml`, `.github/workflows/build-ios.yml`, `.github/workflows/build-android.yml` y `.github/workflows/release.yml`), lo que exige ADR previo conforme a `AGENTS.md` §5.2.5. Complementa los ADR [0001](0001-dual-mode-architecture-and-apple-free-tier.md), [0009](0009-android-build-environment.md) y [0023](0023-e2e-maestro-and-automated-release.md).
- **Autores:** DevOps, Architect, Reviewer y Documentation Expert

---

## 1. Contexto y problemas verificados

La revisión directa de los workflows en `.github/workflows/` y de `.gitignore` confirmó cuatro cuellos de botella en compilación y consumo de minutos de GitHub Actions:

1. **Triple ejecución del `quality-gate` en cada `push` a `main` y ausencia de caché de Jest en CI:**
   - `ci.yml`, `build-ios.yml` y `build-android.yml` se disparan simultáneamente en cada `push` a `main`, ejecutando tres veces en paralelo `npm ci --legacy-peer-deps`, `npm run typecheck`, `npm run lint` y `npm test -- --coverage --ci`.
   - Aunque la Fase 5 configuró `cacheDirectory: '<rootDir>/.jest-cache'` en `jest.config.js`, ningún workflow persistía `.jest-cache` con `actions/cache@v4`, pagando una caché fría de transformación Babel en cada ejecución.
   - Además, los cambios exclusivos de documentación (`docs/**`, `*.md`) disparaban los workflows nativos en `macos-26` (cuyo costo por minuto en repositorios privados es 10× respecto a Linux) y `ubuntu-latest`.
2. **Caché de CocoaPods rota en `build-ios.yml`:**
   - `/ios` está excluido en `.gitignore` (flujo CNG / Expo Prebuild).
   - El paso `npx expo prebuild --platform ios --clean --no-install` genera `ios/Podfile`, pero al usar `--no-install` **no ejecuta `pod install`** y, por tanto, **`ios/Podfile.lock` no existe** cuando se evalúa el paso `Cache CocoaPods`.
   - La expresión `hashFiles('ios/Podfile.lock')` evaluaba siempre a cadena vacía (`""`), generando una clave fija sin invalidación real al cambiar dependencias nativas o de `package-lock.json`.
3. **Compilación de pods C/C++/ObjC sin `ccache` en `build-ios.yml`:**
   - `xcodebuild build` recompilaba desde cero en cada ejecución efímera las dependencias nativas pesadas de React Native, Reanimated y Expo Modules sin caché de compilador (`ccache`), aunque sí pasaba `COMPILER_INDEX_STORE_ENABLE=NO`.
4. **Doble invocación de Gradle con `--no-daemon` y 4 ABIs en `build-android.yml`:**
   - Se lanzaban dos procesos separados (`./gradlew assembleRelease --no-daemon` y luego `./gradlew bundleRelease --no-daemon`), arrancando dos veces la JVM en frío, repitiendo el grafo de tareas y compilando las 4 arquitecturas (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`), incluidas las dos de emulador que no se distribuyen en dispositivos físicos. Tampoco se activaban explícitamente `org.gradle.caching=true` ni `org.gradle.parallel=true` en la invocación de Gradle.

---

## 2. Decisiones

### 2.1. Deduplicación del `quality-gate` en `push` a `main`, caché de `.jest-cache` y `paths-ignore`

- **Omisión condicional del `quality-gate` en builds sobre `push` a `main`:** en `build-ios.yml` y `build-android.yml`, la condición del job `quality-gate` pasa a:
  ```yaml
  if: ${{ !inputs.skip_quality_gate && !(github.event_name == 'push' && github.ref == 'refs/heads/main') }}
  ```
  De este modo, en cada `push` a `main` la puerta de calidad se ejecuta **una sola vez** en `ci.yml` (que corre en paralelo y verifica también `verify-phase0-fixture` y `workflow-guards`). Cuando el disparo es un tag `v*` o un `workflow_dispatch` manual, los workflows de build conservan su `quality-gate` propio; cuando los llama `release.yml` mediante `workflow_call`, se sigue omitiendo vía `skip_quality_gate: true`.
- **Caché de `.jest-cache` en `actions/cache@v4`:** se añade en `ci.yml`, `build-ios.yml`, `build-android.yml` y `release.yml` con clave `${{ runner.os }}-jest-${{ hashFiles('package-lock.json', 'babel.config.js', 'jest.config.js', 'tsconfig.json') }}` y respaldo `${{ runner.os }}-jest-`.
- **Concurrencia:** `ci.yml`, `build-ios.yml` y `build-android.yml` declaran `concurrency` con `cancel-in-progress: true` para cancelar ejecuciones obsoletas ante commits consecutivos (en `build-ios.yml` y `build-android.yml` usando `inputs.ref || github.ref` para no cancelar un release en curso, ADR 0023).
- **Exclusión de rutas de documentación (`paths-ignore`):** `build-ios.yml` y `build-android.yml` añaden bajo `on.push`:
  ```yaml
  paths-ignore:
    - 'docs/**'
    - '*.md'
    - '**/*.md'
  ```

### 2.2. Caché válida de CocoaPods y `ccache` en `build-ios.yml`

- **Clave de CocoaPods basada en archivos existentes:** se corrige la clave de `Cache CocoaPods` a:
  ```yaml
  key: ${{ runner.os }}-pods-${{ hashFiles('ios/Podfile', 'package-lock.json') }}
  restore-keys: |
    ${{ runner.os }}-pods-
  ```
  Ambos archivos existen inmediatamente después de `npx expo prebuild --platform ios --clean --no-install`.
- **Configuración y caché de `ccache`:**
  - Se definen `USE_CCACHE: '1'` y `CCACHE_DIR: ~/Library/Caches/ccache` en `env` del job `build-unsigned-ipa` (expandido a `$HOME/Library/Caches/ccache` en `GITHUB_ENV`).
  - Se cachea `~/Library/Caches/ccache` con `actions/cache@v4` usando clave `${{ runner.os }}-ccache-${{ hashFiles('ios/Podfile', 'package-lock.json') }}`.
  - Si `ccache` no viene preinstalado en el runner `macos-26`, se instala con `HOMEBREW_NO_AUTO_UPDATE=1 brew install ccache` y se fija `--max-size=2G`.
  - Se mantiene `COMPILER_INDEX_STORE_ENABLE=NO` en `xcodebuild build` para evitar indexación innecesaria en un runner efímero.

### 2.3. Invocación única de Gradle y ABIs ARM en `build-android.yml`

- Se unifican `assembleRelease` y `bundleRelease` en un único paso y una sola JVM:
  ```bash
  ./gradlew assembleRelease bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
    -Dorg.gradle.caching=true \
    -Dorg.gradle.parallel=true
  ```
  - Compartir una sola invocación evita el doble arranque en frío de Gradle y reutiliza las tareas de compilación JS/hermes/recursos compartidas.
  - Restringir `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a` elimina la compilación nativa C++/NDK de `x86` y `x86_64` (reservadas a emuladores; `e2e.yml` conserva `-PreactNativeArchitectures=${{ env.EMULATOR_ARCH }}` con `x86_64`).
  - `org.gradle.caching=true` y `org.gradle.parallel=true` habilitan el aprovechamiento completo de `gradle/actions/setup-gradle@v4`.

### 2.4. Guardias estáticas en `scripts/workflow-guards.test.mjs`

Se amplía `scripts/workflow-guards.test.mjs` para verificar automáticamente que todos los workflows YAML parsean con `js-yaml`, conservan `concurrency` con `cancel-in-progress: true`, cachean `.jest-cache`, omiten el `quality-gate` duplicado en `push` a `main`, mantienen `paths-ignore`, usan la clave correcta de CocoaPods (`ios/Podfile` + `package-lock.json`), configuran `ccache` y ejecutan Gradle en una sola invocación ARM con caché y paralelismo activos.

---

## 3. Alternativas descartadas

| Alternativa | Motivo del descarte |
| :--- | :--- |
| Encadenar `build-ios.yml` y `build-android.yml` mediante `workflow_run` después de `ci.yml` | Desvincula el estado de compilación del commit/PR en GitHub UI, pierde el filtrado directo por `paths-ignore` de `on.push` y obliga a gestionar `ref` manualmente entre workflows. |
| Eliminar por completo el job `quality-gate` de `build-ios.yml` y `build-android.yml` | Dejaría sin verificación previa los disparos por `workflow_dispatch` o push de tags `v*` desde un equipo local, donde `ci.yml` no corre por tag. |
| Compilar únicamente `arm64-v8a` en `build-android.yml` | Excluiría dispositivos Android físicos de 32 bits (`armeabi-v7a`); incluir `arm64-v8a,armeabi-v7a` cubre el parque de dispositivos reales y elimina solo las ABIs de emulador (`x86`, `x86_64`). |
| Activar el demonio de Gradle (quitar `--no-daemon`) | En runners efímeros de CI con un único comando de Gradle, el daemon queda residente en RAM compitiendo con R8/NDK y sin ejecuciones posteriores que amortizen su memoria. |

---

## 4. Consecuencias

- En cada `push` a `main` con cambios de código, la suite de tests y chequeos corre 1 vez (`ci.yml`) en lugar de 3.
- En commits que toquen exclusivamente `docs/**` o archivos `*.md`, `build-ios.yml` y `build-android.yml` no se ejecutan.
- La caché de CocoaPods en `build-ios.yml` pasa a tener clave válida determinística y se invalida al cambiar `ios/Podfile` o `package-lock.json`.
- `build-android.yml` compila el `.apk` de prueba y el `.aab` en un único proceso Gradle y exclusivamente para arquitecturas ARM (`arm64-v8a,armeabi-v7a`).
- Si en el futuro un cambio en `package.json` afecta el comportamiento de `ios/Podfile` sin alterar `ios/Podfile` ni `package-lock.json` (por ejemplo, cambios en `app.json` de plugins nativos), será necesario añadir `app.json` a `hashFiles(...)` o limpiar manualmente la caché de Actions si un plugin cambia sin tocar `Podfile`.

---

## 5. Verificación

| Comprobación | Resultado |
| :--- | :--- |
| Parseo YAML de los 5 workflows en `.github/workflows/` (`js-yaml`, dentro de `workflow-guards.test.mjs`) | 5 workflows válidos (`build-android.yml`, `build-ios.yml`, `ci.yml`, `e2e.yml`, `release.yml`) |
| `npm run test:scripts` (`scripts/release.test.mjs` + `scripts/workflow-guards.test.mjs`) | 27/27 tests en verde (14 de `release.test.mjs` y 13 de `workflow-guards.test.mjs`, incluyendo 5 nuevos tests de invariantes del ADR 0029) |
| `npm run typecheck` (`tsc --noEmit`) | 0 errores |
| `npm run lint` (`node scripts/lint-check.mjs`) | 0 errores (236 archivos fuente verificados) |
| `node scripts/check-src-tests-guard.mjs` | En verde (`CI Heuristic Guard Passed`) |

### No verificado

- **Ejecución real en GitHub Actions (`macos-26` y `ubuntu-latest`):** desde este entorno Windows 11 no se ha ejecutado ninguno de los workflows ni se han medido tiempos reales de compilación, tasa de aciertos de `ccache`, `Cache CocoaPods`, `.jest-cache` o Gradle build cache en los runners remotos.
- **Instalación y soporte de `ccache` por `xcodebuild` con React Native / Expo en `macos-26`:** la interacción efectiva de `USE_CCACHE=1` y la ruta de `CCACHE_DIR` durante `pod install` y `xcodebuild` solo podrá confirmarse en una ejecución real en `macos-26`.
