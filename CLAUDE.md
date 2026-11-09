# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BFlow es una app de presupuesto personal (Expo SDK 58 / React Native 0.88 / React 19 / TypeScript estricto / Zustand / Cloud Firestore) que reemplaza un Excel mensual. Las reglas de ingeniería completas (roles de agentes, Definition of Done, protocolo de documentación Diátaxis, criterios de ADR) viven en [`AGENTS.md`](AGENTS.md) y **son vinculantes**; este archivo solo resume lo esencial y añade lo que hay que leer en varios archivos para entender.

Idioma: comunicación, comentarios, ADRs y commits en español; código, identificadores y claves de datos en inglés.

## Comandos

```bash
npm ci --legacy-peer-deps      # instalar (.npmrc ya fija legacy-peer-deps). postinstall parchea node_modules/@bacons/apple-targets (ExtensionStorageModule.swift)
npm run web                    # Modo A en navegador (flujo diario en Windows)
npm start                      # Expo Go (QR); `npm run ios` abre en simulador/dispositivo
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

- **`src/app/index.tsx`** es una única pantalla grande (~800 líneas) que hace de orquestador: puerta de autenticación (`AuthScreen` si no hay `authUser`), sincronización con la nube (`syncUserCloudAccount`: hidrata primero desde `platform/storage/accountCache`, luego `FirestoreBudgetRepository.loadFullCloudAccount`), selección de pestaña (`summary | checklist | debts | savings | analytics | account`) y derivación de todos los resúmenes con `useMemo` llamando a funciones de `domain`. `_layout.tsx` solo monta `BFlowThemeProvider` y el `Stack`. Las pantallas de `features/` reciben datos ya calculados por props.
- **Store** (`src/features/budget/store/`): `useBudgetStore.ts` solo compone los slices de `slices/`; los tipos, helpers y `buildInitialState` están en `slices/sliceTypes.ts`. Patrón de escritura en cada acción: (1) calcular el nuevo estado con funciones puras de `domain`, (2) `set()` optimista, (3) `triggerWidgetSync`, (4) si `isRealAuthUser(...)`, persistir con `FirestoreBudgetRepository` y, **en el `catch`, revertir al estado previo** y poner un `syncMessage` amigable (AGENTS.md §6.2 lo exige para toda escritura).
- **Comportamiento distinto en tests**: con `NODE_ENV === 'test'`, `buildInitialState` precarga el seed de octubre 2026 con el usuario demo `DEMO_OWNER_USER`, y `isRealAuthUser` solo acepta uids que empiecen por `uid_cloud_test`, así que los tests del store no tocan Firestore. Fuera de test, un usuario que no sea el email "owner" arranca con un workspace vacío. `src/app/index.tsx` omite listeners de sesión/widget en test.
- **Dominio** (`src/domain/`): exporta todo desde `src/domain/index.ts` (los consumidores importan de `'../domain'`). Tras el ADR 0005 el dominio es genérico (`calculateDebtsSummary`, `calculateProvisionPlanSummary`, `formatCurrency`, `toAppMonthKey`/`toAppIsoDate`) y conserva alias retrocompatibles (`formatCop`, `toBogotaMonthKey`, `calculateFunfamiDebtSummary`, `moto-ideal/` re-exporta `provisions/`). Preferir los nombres universales en código nuevo. Los tests dorados (`domain/__tests__/golden-october-2026.test.ts`) comparan contra `fixtures/october-2026.json`; cualquier cambio de fórmula debe mantenerlos verdes y requiere ADR.
- **Dinero y fechas**: enteros validados con `Number.isSafeInteger`, nunca decimales; `Math.ceil` en divisiones de provisiones; `monthKey`/fechas en `America/Bogota`. El saldo de una deuda nunca se almacena: se deriva de apertura − abonos completados (`debtPayments`). AGENTS.md menciona `format(amount)`; la función real es `formatCurrency` (`formatCop` como alias).
- **Datos** (`src/data/`): `FirestoreBudgetRepository` (~2.400 líneas en `repositories/budgetRepository.ts`) implementa la interfaz `BudgetRepository`; hay una `InMemoryBudgetRepository` en el mismo archivo para pruebas. Todo vive bajo `users/{uid}/{concepts,entries,debts,debtPayments,savingsBuckets,provisionPlans,monthSnapshots}`; los `entries` usan id `${monthKey}_${conceptId}` y las consultas se acotan por `monthKey` (límite Spark). Los mappers Zod de `mappers/firestoreSchemas.ts` validan en ambos sentidos (usar `stripUndefinedFields` antes de escribir). Si cambias esquema o `firestore.rules` (503 líneas, deny-by-default, validación de campos), hace falta ADR y actualizar `firestore.indexes.json` si procede. `firebaseConfig.ts` usa caché persistente solo en web (IndexedDB) y en memoria en nativo; incluye una config pública de respaldo, sobreescribible con `EXPO_PUBLIC_FIREBASE_*`.
- **Doble modo** (`src/platform/`): `mode/runtimeMode.ts` resuelve `mode-a-web | mode-a-expo-go | mode-b-native-ipa`. Los adaptadores con variante nativa se separan por extensión de Metro: `widgetAdapter.ts` (Modo A: valida el `WidgetSnapshotV1` con Zod y lo guarda en memoria) vs `widgetAdapter.native.ts` (Modo B: escribe en el App Group vía `@bacons/apple-targets`). El contrato `WidgetSnapshotV1` (`platform/widgets/widgetSnapshot.ts`) debe mantenerse sincronizado con los modelos Swift de `targets/widgets/` (un único target de extensión para respetar el límite de 2 App IDs). `GlassSurface` usa `expo-blur` en Modo A (y `View` plano en web).
- **Sistema de diseño** (`src/design-system/`, documentado en `DESIGN.md`): todo color/espaciado/radio sale de `useBFlowTheme()`; cifras monetarias con `CurrencyText` (tabular-nums); áreas táctiles ≥ `MIN_TOUCH_TARGET_PT` (44); háptica vía `hapticService`.
- **En curso**: el ADR 0007 (escena 3D three.js/`expo-gl` en Resumen, con `src/domain/overview/` y `src/features/summary/`) está aceptado y las dependencias ya están en `package.json`, pero esos directorios aún no existen en `src/`.

## CI / entorno

- `ci.yml` (ubuntu, Node 22, push a `main`/`develop` y PR a `main`): fixture dorado → guardia de tests (solo PR) → `typecheck` → `lint` → `npm test -- --coverage --ci`. `build-ios.yml` genera el `.ipa` sin firmar en macOS para `iloader` (cambios ahí requieren ADR).
- `.env` está ignorado; la plantilla es `.env.example`. Si cambias variables de entorno o dependencias, actualiza `.env.example`, `package.json` y `README.md`.
- `scripts/setup-claude.sh` enlaza `.agents/skills` → `.claude/skills` y `.agents/workflows` → `.claude/commands` (junctions en Windows) y fija `core.hooksPath=.githooks`; ese directorio todavía no existe en el repo.
- `README.md` contiene enlaces `file:///` a una ruta de otra máquina y cifras (tests, cobertura) que pueden estar desactualizadas; no tomarlos como evidencia sin medir.
