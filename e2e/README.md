# Cómo ejecutar las pruebas E2E con Maestro

Guía How-To (Diátaxis). Explica cómo correr los flujos de `e2e/` en un emulador Android desde Windows 11 y qué cubre cada uno. Las decisiones están en el [ADR 0023](../docs/decisions/0023-e2e-maestro-and-automated-release.md).

> **Estado de verificación.** Los flujos y el workflow están escritos y su sintaxis YAML está validada, pero **todavía no se han ejecutado** en un emulador ni en GitHub Actions: el equipo donde se escribieron no tiene `adb` ni Maestro. Los comandos de esta guía tampoco se probaron aquí. Cuando se ejecuten por primera vez, actualiza este aviso y la sección «No verificado» del ADR.

## Qué cubren

Todos arrancan la app con el estado limpio y esperan el espacio de trabajo (`subflows/launch-demo.yaml`).

| Flujo | Qué comprueba | `testID` que usa |
| :--- | :--- | :--- |
| `flows/01-launch-summary.yaml` | La app abre con la sesión demo, sin pantalla de inicio de sesión, y muestra el Resumen de octubre 2026 con «Checklist 6 de 12» | `workspace-shell`, `auth-gate-screen` (ausente), `workspace-tab-summary`, `net-flow-hero-card`, `golden-net-flow`, `checklist-progress-badge`, `income-summary-card`, `expense-summary-card`, `monthly-curve-section` |
| `flows/02-navigate-tabs.yaml` | Las 6 pestañas montan su pantalla | `workspace-tab-{summary,checklist,debts,savings,analytics,account}`, `checklist-workspace-view`, `debts-funfami-view`, `savings-and-moto-ideal-view`, `analytics-and-history-view`, `account-profile-workspace-view` |
| `flows/03-checklist-toggle.yaml` | Marcar «Gemini Pro» lo saca de Pendientes (6 → 5) y lo lleva a Completados (6 → 7); desmarcarlo lo devuelve | `checklist-filter-{all,pending,completed}`, `checklist-workspace-item-2026-10_exp_gemini_pro` |
| `flows/04-add-movement-cancel.yaml` | El formulario de nuevo movimiento se abre y se cierra sin crear nada (siguen siendo 12 ítems) | `open-add-movement-modal-button`, `add-movement-modal-card`, `modal-type-expense`, `modal-type-income` |
| `flows/05-theme-toggle.yaml` | El botón de tema alterna claro y oscuro en ambos sentidos | `theme-toggle-button` y su etiqueta de accesibilidad («Cambiar a modo claro» / «Cambiar a modo oscuro») |

Los flujos seleccionan por `testID` y solo usan los que existen en `src/`. `scripts/workflow-guards.test.mjs` lo comprueba en CI: si renombras un `testID` que usa un flujo, ese test falla.

No cubren: inicio de sesión real, Firestore, onboarding, widgets ni iOS. El modo vitrina no escribe en la nube.

## Requisitos

- Android SDK con `adb` y un emulador (AVD) `x86_64`. CI usa API 34.
- JDK 17.
- [Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro). En Windows se instala descomprimiendo `maestro.zip` de sus releases y añadiendo la carpeta `bin` al `PATH`, o dentro de WSL. CI fija la versión 2.12.1.

## 1. Compilar el APK de E2E (modo vitrina)

Los flujos necesitan un binario compilado con `EXPO_PUBLIC_BFLOW_DEMO=1`: sesión demo con el seed de octubre 2026, sin Firebase ni credenciales. Con un binario normal, la app se queda en el inicio de sesión y todos los flujos fallan en el arranque.

En PowerShell, desde la raíz del repositorio:

```powershell
$env:EXPO_PUBLIC_BFLOW_DEMO = '1'
npx expo prebuild --platform android --clean --no-install
cd android
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=x86_64" --no-daemon
cd ..
Remove-Item Env:EXPO_PUBLIC_BFLOW_DEMO
```

El APK queda en `android\app\build\outputs\apk\release\app-release.apk`.

- Se usa la variante `release` porque lleva el JavaScript embebido (no hace falta Metro) y pasa por R8, igual que el `.apk` publicado.
- En este equipo, la ruta del proyecto tiene un espacio y es larga. Para que Gradle compile hacen falta los pasos del [ADR 0019 §4.1](../docs/decisions/0019-expo-modules-runtime-alignment.md).
- Borra la variable al terminar (`Remove-Item`): si se queda definida en la terminal, el siguiente build saldría en modo vitrina.

**Este APK es solo para pruebas.** No lo publiques, no lo adjuntes a un Release y no lo instales en un teléfono con datos reales: usa el mismo paquete (`com.bflow.app`) que la app real.

## 2. Instalar en el emulador

Con el emulador arrancado:

```powershell
adb devices
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

## 3. Ejecutar los flujos

```powershell
maestro test e2e                                    # todos, en el orden de e2e/config.yaml
maestro test e2e/flows/03-checklist-toggle.yaml     # uno solo
maestro studio                                      # inspeccionar la pantalla y sus id
```

Las capturas (`takeScreenshot`) y los logs de cada ejecución quedan en `%USERPROFILE%\.maestro\tests\`.

## En GitHub Actions

`.github/workflows/e2e.yml` hace lo mismo en `ubuntu-latest`: compila el APK de vitrina, arranca un emulador con KVM y ejecuta `e2e/run-android-ci.sh`.

- Se lanza a mano (Actions → *Maestro E2E Tests* → *Run workflow*) y cada lunes a las 02:00 de Bogotá.
- Si falla, sube el artefacto `maestro-e2e-artifacts` con el informe JUnit, las capturas, los logs de Maestro y el `logcat`.
- El APK no se sube como artefacto ni se adjunta a ningún Release.

## Añadir un flujo

1. Crea `e2e/flows/NN-nombre.yaml` con `appId: com.bflow.app`, `name: NN-nombre` y, como primer paso, `- runFlow: ../subflows/launch-demo.yaml`.
2. Selecciona por `id` con `testID` que ya existan en `src/`. Si falta uno, añádelo en el componente con sus tests.
3. Añade el nombre a `flowsOrder` en `e2e/config.yaml`.
4. Ejecuta `node --test scripts/workflow-guards.test.mjs`.

## Si algo falla

| Síntoma | Causa probable |
| :--- | :--- |
| Todos los flujos fallan esperando `workspace-shell` | El APK no se compiló en modo vitrina, o la app se cierra al abrir. Mira `logcat.txt` (ADR 0013 y 0019) |
| Un `id` no se encuentra | El `testID` cambió en `src/`, o Android no lo expone en esa vista. Compruébalo con `maestro studio` |
| «Pendientes (6)» no aparece | Cambió el seed de octubre 2026 (`fixtures/seed-october-2026.json`) |
