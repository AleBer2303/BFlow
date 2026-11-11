# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BFlow es una app de presupuesto personal multiplataforma (iOS, Android y Web; Expo SDK 58 / React Native 0.88 / React 19 / TypeScript estricto / Zustand / Cloud Firestore) que reemplaza un Excel mensual. Las reglas de ingeniería completas (roles de agentes, Definition of Done, protocolo de documentación Diátaxis, criterios de ADR) viven en [`AGENTS.md`](AGENTS.md) y **son vinculantes**; este archivo solo resume lo esencial y añade lo que hay que leer en varios archivos para entender.

Idioma: comunicación, comentarios, ADRs y commits en español; código, identificadores y claves de datos en inglés.

## Comandos

```bash
npm ci --legacy-peer-deps      # instalar (.npmrc ya fija legacy-peer-deps). postinstall parchea node_modules/@bacons/apple-targets (ExtensionStorageModule.swift)
npm run web                    # Modo A en navegador (flujo diario en Windows), con Firebase real
npm run web:demo               # Modo vitrina: sesión demo + seed, sin Firebase. ?skin=ios|android|web y ?theme=dark|light
npm start                      # Expo Go (QR); `npm run ios` / `npm run android` abren en simulador/dispositivo
npm run typecheck              # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run lint                   # NO es ESLint: scripts/lint-check.mjs (ver "Reglas que aplica el lint")
npm test                       # jest --watchAll=false (preset jest-expo)
npm test -- --coverage --ci    # igual que CI
npx jest src/domain/debts                       # un directorio/archivo
npx jest path/to/file.test.ts -t "nombre del test"   # un solo test
npm run test:phase0            # paridad del fixture dorado (node --test scripts/verify-phase0-fixture.test.mjs)
node scripts/check-src-tests-guard.mjs origin/main   # guardia: cambios en src/ exigen tests en el mismo rango
```

Antes de dar algo por terminado: `typecheck`, `lint` y `npm test` en 0 errores (AGENTS.md §4). Para saltar la guardia de tests en un commit, `[skip-test-guard]` en el mensaje.

Notas de tests:
- Solo se descubren archivos `**/__tests__/**/*.test.[jt]s?(x)`; un `*.test.ts` fuera de `__tests__/` no corre.
- La cobertura solo se mide sobre `src/domain/`. `jest.config.js` aplica umbral global 80%, pero la regla del proyecto (AGENTS.md) exige ≥ 90% en sentencias y líneas.
- `scripts/extract-excel-fixture.mjs` (`npm run extract:excel`) necesita `docs/reference/Control_Ingresos_y_gastos_mensuales.xlsx`, que **no está en el repo**; CI valida solo los JSON ya generados en `fixtures/`. No regenerar los fixtures sin ese Excel.
- `.github/workflows/e2e.yml` (Maestro) es un stub; no existe `e2e/`.

## Reglas que aplica el lint (`scripts/lint-check.mjs`)

1. `src/domain/` no puede importar `react`, `react-native`, `expo*`, `firebase*`, `zustand` ni `data/platform/design-system/features/app`.
2. Prohibido literal `'#RRGGBB'` en `src/app/` y `src/features/` (usar `src/design-system/tokens.ts`).
3. Prohibido `console.log` en `src/` (fuera de tests).
4. `expo-glass-effect` y `@react-native-google-signin/google-signin` solo pueden importarse desde `src/platform/**/*.native.{ts,tsx}`.
5. `expo-blur` solo puede importarse en `src/platform/glass/GlassSurface.tsx` y `src/design-system/components/IosWheelPickerModal.tsx` (Liquid Glass es exclusivo de la piel iOS).
6. Prohibido el `Pressable` de React Native en `src/app/` y `src/features/`: usar `AppPressable`.

## Arquitectura

Flujo de datos de extremo a extremo:

```
src/app/index.tsx  ──(hooks/props)──>  features/*/components
        │                                     │
        └── useBudgetStore (Zustand) <────────┘
               │  slices: auth · sync · budget · debts · savings · provisions
               ├── domain/*            cálculo puro (resúmenes, checklist, deudas, cierre de mes)
               ├── data/repositories   FirestoreBudgetRepository (users/{uid}/...)
               └── platform/*          auth, storage (caché offline), widgets, haptics, glass
```

- **`src/app/index.tsx`** es una única pantalla grande (~550 líneas) que hace de orquestador: puerta de autenticación (`AuthScreen` si no hay `authUser`), sincronización con la nube (`syncUserCloudAccount`: hidrata primero desde `platform/storage/accountCache`, luego `FirestoreBudgetRepository.loadFullCloudAccount`), selección de pestaña (`summary | checklist | debts | savings | analytics | account`) y derivación de todos los resúmenes con `useMemo` llamando a funciones de `domain`. `_layout.tsx` monta `BFlowThemeProvider` y el `Stack`, reserva la barra de estado en Android y sincroniza el fondo del sistema (`platform/system/systemChrome`, con variante `.web.ts` que inyecta foco, tipografía y variables CSS). El contenido se pinta dentro de `features/shell/WorkspaceShell` (cabecera, columna centrada y navegación de la piel). Las pantallas de `features/` reciben datos ya calculados por props.
- **Store** (`src/features/budget/store/`): `useBudgetStore.ts` solo compone los slices de `slices/`; los tipos, helpers y `buildInitialState` están en `slices/sliceTypes.ts`. Patrón de escritura en cada acción: (1) calcular el nuevo estado con funciones puras de `domain`, (2) `set()` optimista, (3) `triggerWidgetSync`, (4) si `isRealAuthUser(...)`, persistir con `FirestoreBudgetRepository` y, **en el `catch`, revertir al estado previo** y poner un `syncMessage` amigable (AGENTS.md §6.2 lo exige para toda escritura).
- **Comportamiento distinto en tests**: con `NODE_ENV === 'test'`, `buildInitialState` precarga el seed de octubre 2026 con el usuario demo `DEMO_OWNER_USER`, y `isRealAuthUser` solo acepta uids que empiecen por `uid_cloud_test`, así que los tests del store no tocan Firestore. Fuera de test, un usuario que no sea el email "owner" arranca con un workspace vacío. `src/app/index.tsx` omite listeners de sesión/widget en test.
- **Dominio** (`src/domain/`): exporta todo desde `src/domain/index.ts` (los consumidores importan de `'../domain'`). Tras el ADR 0005 el dominio es genérico (`calculateDebtsSummary`, `calculateProvisionPlanSummary`, `formatCurrency`, `toAppMonthKey`/`toAppIsoDate`) y conserva alias retrocompatibles (`formatCop`, `toBogotaMonthKey`, `calculateFunfamiDebtSummary`, `moto-ideal/` re-exporta `provisions/`). Preferir los nombres universales en código nuevo. Los tests dorados (`domain/__tests__/golden-october-2026.test.ts`) comparan contra `fixtures/october-2026.json`; cualquier cambio de fórmula debe mantenerlos verdes y requiere ADR.
- **Dinero y fechas**: enteros validados con `Number.isSafeInteger`, nunca decimales; `Math.ceil` en divisiones de provisiones; `monthKey`/fechas en `America/Bogota`. El saldo de una deuda nunca se almacena: se deriva de apertura − abonos completados (`debtPayments`). AGENTS.md menciona `format(amount)`; la función real es `formatCurrency` (`formatCop` como alias).
- **Datos** (`src/data/`): `FirestoreBudgetRepository` (~2.400 líneas en `repositories/budgetRepository.ts`) implementa la interfaz `BudgetRepository`; hay una `InMemoryBudgetRepository` en el mismo archivo para pruebas. Todo vive bajo `users/{uid}/{concepts,entries,debts,debtPayments,savingsBuckets,provisionPlans,monthSnapshots}`; los `entries` usan id `${monthKey}_${conceptId}` y las consultas se acotan por `monthKey` (límite Spark). Los mappers Zod de `mappers/firestoreSchemas.ts` validan en ambos sentidos (usar `stripUndefinedFields` antes de escribir). Si cambias esquema o `firestore.rules` (503 líneas, deny-by-default, validación de campos), hace falta ADR y actualizar `firestore.indexes.json` si procede. `firebaseConfig.ts` usa caché persistente solo en web (IndexedDB) y en memoria en nativo; incluye una config pública de respaldo, sobreescribible con `EXPO_PUBLIC_FIREBASE_*`.
- **Doble modo** (`src/platform/`): `mode/runtimeMode.ts` resuelve `mode-a-web | mode-a-expo-go | mode-b-native-ipa`. Los adaptadores con variante nativa se separan por extensión de Metro: `widgetAdapter.ts` (Modo A: valida el `WidgetSnapshotV1` con Zod y lo guarda en memoria) vs `widgetAdapter.native.ts` (Modo B: escribe en el App Group vía `@bacons/apple-targets`). El contrato `WidgetSnapshotV1` (`platform/widgets/widgetSnapshot.ts`) debe mantenerse sincronizado con los modelos Swift de `targets/widgets/` (un único target de extensión para respetar el límite de 2 App IDs). `GlassSurface` usa `expo-blur` en Modo A (y `View` plano en web).
- **Sistema de diseño** (`src/design-system/`, documentado en `DESIGN.md`): todo color/espaciado/radio/tipografía sale de `useBFlowTheme()`; cifras monetarias con `CurrencyText` (tabular-nums); áreas táctiles ≥ `minTouchTarget` del tema (44 en iOS y Web, 48 en Android); háptica vía `hapticService`.
- **Curva del mes** (`src/domain/overview/`, `src/features/summary/`): el escenario lo decide el token `skinSpec.curveStage`. Solo iOS (`scene-3d`) la dibuja con three.js/`expo-gl` (ADR 0007 y 0008). Android y Web (`vector`) usan `MonthlyCurveVectorStage` (SVG animado por `scene/vectorCurveAnimator.ts`): Web nunca descarga three.js (ADR 0011 y 0012) y Android no monta ningún `GLView`, porque allí la superficie de `expo-gl` no refrescaba los cuadros y la curva se veía quieta (ADR 0014). Si la escena 3D no puede dibujar en iOS (incluida la superficie GL que no llega en `GL_CONTEXT_TIMEOUT_MS`), se usa esa misma curva vectorial con gesto táctil. Ambas comparten la geometría de `scene/curveGeometry.ts` y los tiempos de `scene/curveMotion.ts`.

## Multiplataforma: tres pieles (ADR 0010 y 0011)

Reglas vinculantes en `AGENTS.md` §7; tokens y breakpoints en `DESIGN.md` §10 y §11; pasos en `docs/guides/multiplatform-validation-guide.md`.

- **Piel = plataforma.** `useBFlowTheme()` devuelve `skin` (`ios` Liquid Glass · `android` Material 3 · `web` plano), `skinSpec` y los tokens de esa piel (`palettesBySkin`, `radiusBySkin`, `typographyBySkin` en `tokens.ts`). Los exports sueltos `palettes`, `radius` y `typography` son la piel iOS y existen solo por compatibilidad. `colors.glass.*` conserva el nombre, pero en Android y Web es un relleno **opaco**.
- **Las features no ramifican por plataforma.** La diferencia vive en: `GlassSurface` (material), `AppPressable` (ripple / hover / objetivo táctil), `usePrimaryActionLook` (botón principal), `WorkspaceShell` y `design-system/components/navigation/` (dock iOS, `MaterialNavigationBar`, `WebAppHeader` + `WebTabBar`). Todas comparten `WORKSPACE_TABS` y los testID `workspace-tab-<id>`.
- **Responsive.** `useResponsiveLayout()` (función pura `resolveResponsiveLayout`): clases `compact` < 600 ≤ `medium` < 840 ≤ `expanded`, columna centrada con tope 560 / 600 / 1280, márgenes Web 24 / 48 / 80. `ResponsiveColumns` reparte paneles; `minCardWidthForAmounts` decide si dos tarjetas con cifras comparten fila. Ancho mínimo 320. No usar `Dimensions.get` ni anchos fijos en features.
- **Tests por piel.** Jest corre como iOS: sin `skin` el proveedor entrega la piel iOS. Forzar con `<BFlowThemeProvider skin="android" | "web">` y cambiar el ancho con `Dimensions.set({ window, screen })` dentro de `act`. Si un test cierra sesión o activa el onboarding, restaurar el store en `beforeEach` (`useBudgetStore.setState({ authUser: DEMO_OWNER_USER, needsOnboarding: false })` antes de `resetToOctober2026GoldenState()`). Referencias: `features/shell/__tests__/workspacePlatforms.test.tsx`, `design-system/__tests__/skinTokens.test.ts`.
- **Modo vitrina** (`platform/mode/demoMode.ts`, `EXPO_PUBLIC_BFLOW_DEMO=1`): `resolveDefaultInitialAuthUser` devuelve `DEMO_OWNER_USER`, `index.tsx` no se suscribe a Firebase Auth y, como ese usuario no es "real", ninguna acción escribe en Firestore. `?skin=` y `?theme=` solo se leen en este modo. No definir la variable en builds reales.
- **Sin verificar en dispositivo Android:** la piel Android se validó con tests y en el navegador. Ripple, insets de borde a borde y háptica están pendientes de prueba en hardware.
- **Skill `design-taste-frontend`:** se aplicó su sistema a la piel Web, no sus scripts (`consistency.mjs`, `check.mjs`), que solo leen HTML estático. `.taste-skill/history.json` guarda lo repartido.
- **Shell de este entorno:** los heredocs de bash con comillas invertidas fallan; para ediciones grandes, escribir un script `.mjs` con la herramienta de archivos y ejecutarlo con `node`.

## CI / entorno

- `ci.yml` (ubuntu, Node 22, push a `main`/`develop` y PR a `main`): fixture dorado → guardia de tests (solo PR) → `typecheck` → `lint` → `npm test -- --coverage --ci`. `build-ios.yml` genera el `.ipa` sin firmar en macOS para `iloader` y `build-android.yml` el `.apk`/`.aab` con keystore de depuración (cambios en ambos requieren ADR).
- **Release de Android y R8 (ADR 0013):** el `.apk` se compila con R8 (`android.enableMinifyInReleaseBuilds=true` en la plantilla del SDK) y Expo Go no, así que un fallo de minificación solo aparece en el `.apk`. `android/` no está en git: las reglas keep viven en `plugins/withAndroidKeepRules.js` (declarado en `app.json`, tests en `plugins/__tests__/`). Hoy conserva `expo.modules.gl.**`, porque `expo-gl` busca `GLContext.flush()` por nombre vía JNI y no trae reglas de consumidor; sin la regla la app se cierra al montar el primer `GLView` (el Resumen, justo tras iniciar sesión).
- **Runtime de expo-modules (ADR 0019):** los módulos de Expo llegan como AAR precompilados (`node_modules/<pkg>/local-maven-repo`) y deben coincidir con el `expoModulesV2Version` de `expo-modules-core`. Si no coinciden, el `.apk` se cierra al abrir (`Cannot find native module 'ExpoSQLite'`), pero Expo Go funciona. Al actualizar un módulo de Expo, actualiza también `expo` (`npx expo install --fix`). La guardia es `plugins/__tests__/expoModulesRuntimeVersion.test.js`. Para compilar el release en este Windows (ruta con espacio) ver ADR 0019 §4.1.
- `.env` está ignorado; la plantilla es `.env.example`. Si cambias variables de entorno o dependencias, actualiza `.env.example`, `package.json` y `README.md`.
- `scripts/setup-claude.sh` enlaza `.agents/skills` → `.claude/skills` y `.agents/workflows` → `.claude/commands` (junctions en Windows) y fija `core.hooksPath=.githooks`; ese directorio todavía no existe en el repo.
- `README.md` contiene enlaces `file:///` a una ruta de otra máquina y cifras (tests, cobertura) que pueden estar desactualizadas; no tomarlos como evidencia sin medir.
