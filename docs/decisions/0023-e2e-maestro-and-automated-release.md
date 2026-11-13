# 0023. Pruebas E2E con Maestro en emulador Android y release automatizado (Fase 8)

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Fase 8 de `PROMT BFLOW.md` («E2E Maestro + release automatizado»). Cambia la tubería de empaquetado y distribución (AGENTS.md §5.2.5): modifica `build-ios.yml` y `build-android.yml`, reescribe `e2e.yml` y añade `release.yml`. Se apoya en los ADR [0009](0009-android-build-environment.md) (entorno Android), [0013](0013-android-release-keep-rules.md) (R8), [0019](0019-expo-modules-runtime-alignment.md) (runtime de expo-modules) y [0010](0010-platform-skins-and-responsive-layout.md) (modo vitrina).
- **Autores:** DevOps, QA Engineer y Documentation Expert

---

## 1. Contexto y problema

### 1.1. E2E

- `.github/workflows/e2e.yml` era un stub: un `echo` en un runner `macos-15`. No existía `e2e/`.
- Los fallos de los ADR 0013 y 0019 tienen algo en común: la app funcionaba en Expo Go y en Jest, y **solo el `.apk` se cerraba** (al iniciar sesión y al abrir). Ninguna prueba automática instalaba el binario y lo abría.
- La piel Android se validó con tests y en el navegador, no en un dispositivo ni en un emulador (`CLAUDE.md`).
- Una prueba E2E necesita una sesión. Las cuentas reales exigen credenciales y escriben en Firestore.
- `PROMT BFLOW.md` pedía «Maestro sobre simulador iOS» y un recorrido «registro → completar Salario → … → historial». Este ADR se aparta de las dos cosas y lo justifica en §2.1 y §2.2.

### 1.2. Release

- El release era manual (`.agents/workflows/release.md`): editar la versión a mano, commit, tag y push. El documento citaba `app.config.ts` y `scripts/extract-excel-fixture.mjs`, que no existen en el repositorio.
- La versión vive en cuatro sitios y nada comprobaba que coincidieran: `package.json`, `package-lock.json` (raíz y `packages[""]`) y `app.json` (`expo.version`). Además está `expo.android.versionCode`. `expo.ios.buildNumber` no está definido.
- Con un tag `v*`, `build-ios.yml` y `build-android.yml` publicaban cada uno por su cuenta sobre el mismo Release, y el título lo ponía el último en terminar.
- **Hecho de GitHub Actions:** un push o un tag creado con `GITHUB_TOKEN` no dispara otros workflows. Un workflow de release que cree el tag no arranca los builds por su disparador `tags: v*`.

## 2. Decisiones

### 2.1. E2E en emulador Android sobre `ubuntu-latest`

`e2e.yml` compila un APK, arranca un emulador con KVM (`reactivecircus/android-emulator-runner@v2`, API 34, `x86_64`, perfil `pixel_6`) y ejecuta los flujos con Maestro CLI 2.12.1 (versión fijada).

Se elige Android frente al simulador de iOS por tres motivos:

1. **Cubre el hueco real.** Los dos cierres registrados (ADR 0013 y 0019) solo se veían en el `.apk`, y la piel Android es la que no se ha probado en dispositivo.
2. **Runner Linux.** En repositorios privados, GitHub factura el minuto de macOS a una tarifa superior a la de Linux. Hoy el repositorio es público y los runners estándar no se cobran (`docs/guides/iloader-signing-guide.md`), pero la tubería no debe depender de eso.
3. **Reutiliza el entorno ya decidido** en el ADR 0009: JDK 17, `expo prebuild --platform android` y Gradle.

Se mantiene únicamente bajo demanda (`workflow_dispatch`); el cron semanal de los lunes fue retirado para evitar el consumo recurrente de minutos de GitHub Actions. No se ejecuta en cada push ni en cada PR.

Caché: npm (`actions/setup-node`), Gradle (`gradle/actions/setup-gradle`) y el snapshot del AVD (`actions/cache`).

### 2.2. APK de E2E en modo vitrina, nunca publicado

El APK se compila con `EXPO_PUBLIC_BFLOW_DEMO=1` (modo vitrina, ADR 0010): la app arranca con la sesión demo y el seed de octubre 2026, y no habla con Firebase. Así los flujos no necesitan credenciales ni tocan datos reales.

AGENTS.md §7.6 prohíbe esa variable en builds reales y en workflows de publicación. Por eso:

- La variable se define **solo** en el paso de Gradle de `e2e.yml`.
- `e2e.yml` tiene `permissions: contents: read`, no crea Releases y no declara `workflow_call`.
- El APK **no se sube como artefacto ni se adjunta a ningún Release**. Solo se suben, si falla, el informe JUnit, las capturas, los logs de Maestro y el `logcat`.
- `scripts/workflow-guards.test.mjs` falla si la variable aparece en otro workflow o si `e2e.yml` gana permisos de escritura, un paso de Release o una subida que incluya el APK. Corre en `ci.yml`, `release.yml` y `e2e.yml`.

**Variante `release`, no `debug`.** Se compila con `assembleRelease -PreactNativeArchitectures=x86_64` y la keystore de depuración del prebuild:

- La variante `debug` no lleva el JavaScript embebido y necesitaría Metro en el runner.
- La variante `release` pasa por R8 (`android.enableMinifyInReleaseBuilds=true`) y usa los AAR precompilados, que es donde fallaron los ADR 0013 y 0019. El flujo de arranque sirve de prueba de humo para esa clase de errores.
- Solo se compila la ABI del emulador.

Diferencia con el `.apk` publicado: el modo vitrina no monta la autenticación ni Firestore, así que esas rutas no quedan cubiertas. El recorrido con registro que pedía `PROMT BFLOW.md` necesita una cuenta real o el emulador de Firebase dentro del runner; queda fuera de este cambio.

### 2.3. Flujos de Maestro

`e2e/` contiene `config.yaml`, cinco flujos en `flows/` y un paso compartido en `subflows/`. Cada flujo reinicia la app con `clearState` y es independiente.

| Flujo | Cubre |
| :--- | :--- |
| `01-launch-summary` | Arranque sin pantalla de inicio de sesión y Resumen de octubre 2026 |
| `02-navigate-tabs` | Las 6 pestañas (`workspace-tab-<id>`) montan su pantalla |
| `03-checklist-toggle` | Marcar y desmarcar un ítem, comprobado con los filtros y sus contadores |
| `04-add-movement-cancel` | Abrir el formulario de nuevo movimiento y cerrarlo sin crear nada |
| `05-theme-toggle` | Alternar tema claro y oscuro en ambos sentidos |

- Seleccionan por `testID` (en Android, `resource-id`) y solo usan los que existen en `src/`; no se añadió ninguno. La guardia de §2.2 también comprueba que cada `id` de `e2e/` exista en `src/`.
- Las aserciones de texto usan valores del seed dorado («Checklist 6 de 12», «Pendientes (6)»), que ya están fijados por `fixtures/` y sus tests.
- Guía de uso: [`e2e/README.md`](../../e2e/README.md).

### 2.4. `scripts/release.mjs`

Script de Node sin dependencias. Uso: `node scripts/release.mjs <patch|minor|major|X.Y.Z> [--dry-run] [--push] [--branch <rama>]`.

1. Comprueba que la versión sea la misma en los cuatro sitios y calcula la siguiente.
2. Comprueba que el árbol esté limpio, que la rama sea `main` y que el tag no exista. Informa todos los bloqueos a la vez.
3. Escribe la versión en `package.json`, `package-lock.json` y `app.json`, e incrementa `expo.android.versionCode`. Incrementa `expo.ios.buildNumber` solo si existe; no lo crea.
4. Crea el commit `chore(release): vX.Y.Z` y el tag anotado `vX.Y.Z`. Con `--push` hace `git push --atomic origin main vX.Y.Z`.

`--dry-run` muestra el plan y los bloqueos y no escribe archivos, commits ni tags. La lógica pura (bump, validaciones, serialización) está separada de git y del disco y tiene tests en `scripts/release.test.mjs`.

### 2.5. `release.yml` y reutilización de los builds

`release.yml` (`workflow_dispatch` con `bump` y `dry_run`) encadena cuatro fases:

```
quality-gate → prepare → build-ios + build-android → publish
```

- **quality-gate:** fixture dorado, tests de los scripts, `typecheck`, `lint` y Jest con cobertura. Falla si no se lanza desde `main`.
- **prepare:** `node scripts/release.mjs <bump> --push` con la identidad `github-actions[bot]`.
- **build-ios / build-android:** llaman a los workflows existentes como **workflows reutilizables** (`workflow_call`) con el tag como `ref`.
- **publish:** descarga los tres artefactos de la misma ejecución y crea el Release `BFlow vX.Y.Z` con `gh release create --generate-notes --verify-tag`.

**Por qué `workflow_call` y no `gh workflow run`.** Los dos esquivan la limitación de `GITHUB_TOKEN`. Con `workflow_call`, los builds son jobs de la misma ejecución: `publish` puede esperar a que terminen (`needs`), descargar sus artefactos y crear el Release una sola vez, con los tres binarios o ninguno. Con `gh workflow run`, serían ejecuciones separadas a las que habría que sondear, y cada una seguiría publicando por su cuenta.

Cambios en `build-ios.yml` y `build-android.yml` (los mismos en ambos, sin tocar los pasos de compilación):

- Disparador `workflow_call` con las entradas `ref` y `skip_quality_gate`.
- `actions/checkout` usa `ref: ${{ inputs.ref }}` (vacío en push: comportamiento de siempre).
- La puerta de calidad interna se omite si quien llama ya la pasó.
- Los pasos que publican el Release se omiten cuando llega `ref`: en ese caso publica `release.yml`.
- El grupo de concurrencia usa `inputs.ref || github.ref`, para que un push a `main` no cancele el build de un release en curso.

Los disparadores anteriores (push a `main`, tag `v*` y `workflow_dispatch`) se comportan igual que antes.

## 3. Alternativas descartadas

| Alternativa | Motivo |
| :--- | :--- |
| Simulador de iOS en macOS | No cubre el `.apk`, que es donde aparecieron los fallos; runner más caro si el repositorio deja de ser público |
| Variante `debug` con Metro en el runner | Necesita un servidor en segundo plano y no pasa por R8 |
| E2E con una cuenta real de prueba | Exige secretos en el repositorio y escribe en Firestore (límite Spark) |
| Subir el APK de vitrina como artefacto para depurar | Sería un binario en modo vitrina descargable; contradice AGENTS.md §7.6 |
| E2E en cada PR | Compilar el APK y arrancar el emulador en cada PR alarga la revisión; queda manual y semanal |
| Maestro Cloud o EAS Workflows | Servicios externos con cuenta y cuota propias |
| `gh workflow run` desde `release.yml` | Ejecuciones separadas; ver §2.5 |
| Token personal (PAT) para que el tag dispare los builds | Añade un secreto de larga duración que mantener |
| `npm version` | No actualiza `app.json` ni `versionCode` |
| `release-please` o `semantic-release` | Dependencias y convenciones nuevas para un proyecto de un solo mantenedor |
| Duplicar los pasos de build en `release.yml` | Dos copias que se desincronizan |

## 4. Consecuencias

- Cada `testID` que usa un flujo pasa a ser contrato: renombrarlo rompe `scripts/workflow-guards.test.mjs` en CI, no solo el E2E semanal.
- Cambiar el seed de octubre 2026 obliga a revisar los textos de los flujos.
- El release recomendado es un clic. Si un build falla después de `prepare`, el commit y el tag ya están en `main`: se corrige y se usa «Re-run failed jobs»; relanzar el workflow subiría la versión otra vez.
- `release.yml` hace push a `main` con `GITHUB_TOKEN`. Si se protege la rama, hay que permitir ese push o el job `prepare` fallará.
- El commit de release no dispara `ci.yml` ni los builds de `main` (mismo hecho de §1.2), así que no hay ejecuciones duplicadas en el camino automático. En el camino manual (`--push` desde un equipo) sí se disparan los builds de `main` y del tag, como antes.
- El `.aab` sigue firmado con la keystore de depuración (ADR 0009): no sirve para Google Play.
- `package.json` expone `npm run release` (`scripts/release.mjs`) y `npm run test:scripts` (los tests del script y las guardias de los workflows).

## 5. Verificación

| Verificación | Resultado |
| :--- | :--- |
| `node --test scripts/release.test.mjs` | 14 tests en verde: bump, comparación, argumentos, coherencia de versiones, `versionCode`, validaciones del repositorio y reescritura sin cambios de formato de los tres manifiestos reales |
| `node --test scripts/workflow-guards.test.mjs` | 5 tests en verde. Con un `id` inventado en un flujo, el test de `testID` falla, como debe |
| `node scripts/release.mjs patch --dry-run` en este repositorio | Plan `0.1.0 -> 0.1.1`, `versionCode 1 -> 2`; informa los dos bloqueos (árbol con cambios, rama distinta de `main`); no escribe nada |
| `node scripts/release.mjs minor` y `patch --push` en un repositorio temporal con un remoto local | Commit `chore(release): v0.2.0`, tag anotado, 5 líneas cambiadas en 3 archivos; push atómico de rama y tag; salidas `version` y `tag` en `GITHUB_OUTPUT` |
| Sintaxis YAML de los 5 workflows y los 7 archivos de `e2e/` | Se parsean con `js-yaml` 4.3.2; cada flujo tiene cabecera y lista de comandos |
| `bash -n e2e/run-android-ci.sh` | Sin errores de sintaxis |
| Opciones de Maestro (`--format`, `--output`, `--test-output-dir`) y claves de `config.yaml` | Contrastadas con el código fuente de Maestro en el tag `cli-2.12.1` |
| `-PreactNativeArchitectures` y `bundleCommand = "export:embed"` | Presentes en el `android/` generado por el prebuild en este equipo |

### No verificado

- **Los flujos de Maestro no se han ejecutado.** Este equipo no tiene `adb`, emulador ni Maestro. No se comprobó que cada `testID` aparezca en la jerarquía de Android (en especial los de vistas sin interacción, como `workspace-shell` o `checklist-workspace-view`), ni los tiempos de espera, ni que `scrollUntilVisible` encuentre el ítem del Checklist.
- **Ningún workflow se ha ejecutado en GitHub:** ni `e2e.yml`, ni `release.yml`, ni los cambios de `build-ios.yml` y `build-android.yml`. En particular, no se comprobó:
  - que `inputs.ref` y `inputs.skip_quality_gate` se evalúen como vacíos en los disparadores `push`, de modo que los builds de siempre sigan publicando;
  - que el push a `main` con `GITHUB_TOKEN` esté permitido en este repositorio;
  - que `actions/download-artifact` reúna los tres binarios en `dist/`;
  - que la imagen de sistema API 34 `default` `x86_64` y el perfil `pixel_6` estén disponibles en el runner.
- **El APK de vitrina no se ha compilado.** No se comprobó en un binario que `EXPO_PUBLIC_BFLOW_DEMO=1` llegue al bundle embebido por Gradle; se dedujo de que el bundle lo genera `expo export:embed` con el entorno del proceso.
- No se midió la duración del workflow de E2E ni la del release.
- Los comandos de `e2e/README.md` no se ejecutaron en Windows.
- iOS no tiene E2E.
