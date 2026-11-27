# Plan consolidado de pendientes de las auditorías — BFlow

> **Tipo Diátaxis:** *Reference* (estado verificado) + *How-To* (fases con prompts).
> **Fecha de verificación:** 2026-11-26 · **Rama:** `audit` (desde `develop` en `25e2b91`).
> **Fuentes:** [`auditoria_produccion_bflow.md`](auditoria_produccion_bflow.md) (hallazgos `AUD-01` a `AUD-09`) y [`auditoria_documentacion_clean_code_y_optimizacion.md`](auditoria_documentacion_clean_code_y_optimizacion.md) (hallazgos `DOC-*`, `BUG-*`, `CC-*`, `OPT-*`).

> [!IMPORTANT]
> Cada estado de este documento se comprobó hoy sobre el código de la rama `audit` (búsquedas en `src/`, lectura de los archivos citados, `npm audit --omit=dev`, `npm run typecheck`, `npm run lint` y una corrida completa de Jest). Las líneas citadas son las de hoy, no las de las auditorías originales, que ya se desplazaron. Lo que no se pudo comprobar desde este entorno está marcado como **sin verificar**.

---

## 1. Línea base medida hoy

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck` | 0 errores |
| `npm run lint` | 0 errores (281 archivos fuente) |
| `npx jest` (completo, sin cobertura) | **101 suites, 1.360 tests, 0 fallos, 23,2 s** |
| `npm audit --omit=dev` | **8 vulnerabilidades moderadas**, 0 altas (antes: 18, de ellas 6 altas) |
| `firestore.rules` | 623 líneas |
| `assets/icon.png` y `assets/adaptive-icon.png` | 890.512 bytes cada uno |
| `src/data/repositories/budgetRepository.ts` | 2.703 líneas (`loadFullCloudAccount` ocupa las líneas 1240–1912, ~670 líneas) |
| `src/features/onboarding/components/InitialAccountSetupView.tsx` | 1.025 líneas, 10 `useState` |

---

## 2. Estado de la auditoría de producción (`AUD-01` a `AUD-09`)

Las seis fases de esa auditoría ya tienen commit (`81eef52`, `6292ba8`, `b4ab90f`, `4951a3f`, `0ebc27c`/`5a86c32`, `6041716`) y ADR (0026 a 0029). Lo que queda es residual:

| ID | Estado | Evidencia de hoy | Qué falta |
| :--- | :---: | :--- | :--- |
| **AUD-01** Límite de intentos y esperas | ✅ Hecho en el cliente · ⏳ App Check | `src/platform/auth/authRateLimiter.ts` lo usan `AuthScreen`, `AccountProfileWorkspaceView`, `AccountProfileForms`, `EmailVerificationScreen` e `index.tsx`. No hay ninguna referencia a App Check en `src/` ni en `package.json`. | Integrar App Check (Fase 5) y las comprobaciones de consola (§5). |
| **AUD-02** Política de contraseñas | ✅ Hecho | `src/domain/auth/passwordPolicy.ts` + checklist en `AuthScreen.tsx`. | Activar la misma política en Firebase Console (§5). |
| **AUD-03** `email_verified` | ✅ Cliente · ⚖️ Reglas por decisión | `index.tsx:292`, `:298`, `:404`, `:430` y `:613` no sincronizan sin verificación. `firestore.rules` no exige `email_verified`; el ADR 0026 §2.5 lo decidió así para no dejar fuera a las cuentas anteriores. | Nada en código. Si se quiere endurecer, hace falta una migración y un ADR nuevo (Fase 5, opcional). |
| **AUD-04** Criptografía y secretos | ✅ Casi todo · ⏳ Pepper | `secureRandom.ts` sin respaldo `Math.random`; token en Keychain/Keystore o `sessionStorage`; Firebase por `EXPO_PUBLIC_FIREBASE_*`; sin correos personales en `src/`. Queda `DEFAULT_APPLICATION_PEPPER` en `src/platform/storage/storageCipher.ts:22`. | Decidir y documentar el pepper por defecto (Fase 5). |
| **AUD-05** Dependencias | 🟡 Parcial | 8 moderadas: `glob` 9–14.0.1 y `minimatch` 7–11.0.0, transitivas de `@expo/fingerprint` → `expo` y de `@bacons/apple-targets/node_modules/@expo/config-plugins`. `npm audit fix --force` propone bajar a `expo@52`, así que no sirve. | Evaluar `overrides` compatibles o esperar al upstream (Fase 5). |
| **AUD-06** Lag en Android al cambiar de pestaña | ✅ Hecho | `ActionRevealSlot` ya no anima al montar oculto (`ChecklistWorkspaceView.tsx:141-163`); keep-alive en `index.tsx:127-196`; `useIsTabActive` en la curva y los gráficos; interpolaciones memoizadas en `AppPressable.tsx:233-294`; el dock se separó en `dock/LiquidGlassDock` y `dock/FlatPillDock`. | Validar en un Android físico (sin verificar en hardware). |
| **AUD-07** Rendimiento general | 🟡 Parcial | Hecho: historial acotado (ADR 0028), widget sin serializar si no cambia (`widgetAdapter.native.ts:112-116`), cortocircuito O(1) en `isEquivalentCloudAccount` (`accountCache.ts:78-92`), formularios aislados. El punto de `three.js` en Android quedó **sustituido por el ADR 0032** (las tres pieles dibujan la escena 3D). | Iconos PNG siguen en 890 KB (objetivo < 250 KB); el cifrado AES/HMAC sigue en JS síncrono (se suaviza en la Fase 2). |
| **AUD-08** Tiempos de tests | ✅ Hecho | 23,2 s para 101 suites; el objetivo era < 45–60 s. | Nada. |
| **AUD-09** Compilado en GitHub Actions | ✅ Hecho | `concurrency`, `paths-ignore`, `quality-gate` omitido en `push` a `main`, caché de Pods con `ios/Podfile` + `package-lock.json`, `ccache` (el `Podfile` de la plantilla de Expo lee `USE_CCACHE`), `COMPILER_INDEX_STORE_ENABLE=NO` y una sola invocación de Gradle con 2 ABI. | Sin verificar el efecto real del `ccache` en un run de macOS: revisar `ccache --show-stats` en el próximo build. |

---

## 3. Estado de la auditoría de documentación, clean code y optimización

### 3.1. Bugs de la cola offline e integridad (`BUG-*`) — **todos siguen abiertos**

| ID | Estado | Evidencia de hoy |
| :--- | :---: | :--- |
| **BUG-01** | ❌ Abierto | `deleteEntryById` encola `type: 'delete_or_reset_entry'` (`createBudgetSlice.ts:639`) aunque en línea llama a `deleteEntryCompletely`. Al drenar, `offlineWriteQueue.ts:404` ejecuta `deleteOrResetEntry`, que en conceptos no múltiples deja el movimiento en `pending` en vez de borrarlo. |
| **BUG-02** | ❌ Abierto | `getOperationTargetKey` (`offlineWriteQueue.ts:131-171`) lee `payload.id`/`entry.id`/`concept.id`/`debt.id`, pero `delete_concept` envía `{ conceptId }` (`createBudgetSlice.ts:474`), `delete_debt` envía `{ debtId }` (`createDebtsSlice.ts:238`) y el borrado de `createBudgetSlice.ts:639` envía `{ entryId }` sin `entry`. Todos devuelven `null` y no se deduplican. `save_custom_concept_and_entry` cae en `default → null`. El `payload` sigue siendo `Record<string, unknown>` (`offlineWriteQueue.ts:49`). |
| **BUG-03** | ❌ Abierto | `completeInitialAccountSetup` (`createAuthSlice.ts:505-521`) muestra «Se sincronizará al conectar», pero no encola nada ni usa `executeOptimisticCloudWrite`. |
| **BUG-04** | ❌ Abierto | `deleteSavingsBucket` limpia `savingsContribution` solo en memoria (`createSavingsSlice.ts:178-185`); el repositorio borra únicamente el documento del fondo (`budgetRepository.ts:2538-2543`). `deleteDebt` borra solo el documento de la deuda (`budgetRepository.ts:2480-2485`); el slice tampoco quita `debtPayments` ni `defaultTargetDebtId` en memoria (`createDebtsSlice.ts:215-250`). |

### 3.2. Optimización (`OPT-*`)

| ID | Estado | Evidencia de hoy |
| :--- | :---: | :--- |
| **OPT-01** | ❌ Abierto | Las 6 pestañas son `React.memo` sin props, pero se suscriben al store y ninguna lee `useIsTabActive()` para congelar sus cálculos. Las ocultas siguen recalculando con cada mutación. |
| **OPT-02** | ❌ Abierto | El guardado se programa dos veces: `index.tsx:343` y `triggerWidgetSync → persistHydratedAccountSnapshot` (`sliceTypes.ts:403-444`), más 4 llamadas directas en `createProvisionsSlice.ts`. `savePersistedAccount` y `updatePersistedAccountRevision` siguen llamando a `readValidatedEnvelope` (`accountCache.ts:160` y `:203`), que descifra y parsea toda la cuenta. |
| **OPT-03** | ✅ Casi resuelto | El onboarding pasó de 26 a 10 `useState` y reutiliza los formularios del workspace (`27a7987`). Queda el tamaño del archivo (va en CC-01). |
| **OPT-04** | 🟡 Parcial | `buildMonthlyHistory` ya se limita a una ventana de 6 meses y solo calcula en vivo el mes activo y los abiertos: impacto bajo. En `loadFullCloudAccount` siguen 3 `filter(... monthKey === ...)` dentro del bucle de meses. `addMonthEntry` sigue haciendo 2 `getDocs` (`budgetRepository.ts:2004` y `:2010`). |
| **OPT-05** | ❌ Abierto | `aes256EncryptBlock` reserva `new Uint8Array(16)` por bloque (`storageCipher.ts:328`). |
| **OPT-06** | ❌ Abierto | 30 `new FirestoreBudgetRepository()` en los slices (Budget 12, Debts 4, Accounts 3, Auth 3, Savings 3, Sync 3, Provisions 2). `swapStyle` de `ThemeToggleIconButton` se recrea en cada render (`BrandAndThemeIcons.tsx:92-99`). |

### 3.3. Clean code (`CC-*`)

| ID | Estado | Evidencia de hoy |
| :--- | :---: | :--- |
| **CC-01** | ❌ Abierto | `budgetRepository.ts` creció a 2.703 líneas y `loadFullCloudAccount` a ~670. El onboarding bajó a 1.025 líneas y ya no tiene la errata «ve al al final». |
| **CC-02** | 🟡 Parcial | **Slugs:** 7 copias sin `normalize('NFD')` (`createAuthSlice.ts:212`, `:231`, `:274`, `:316`; `createBudgetSlice.ts:231`; `createProvisionsSlice.ts:43`; `createSavingsSlice.ts:106`) y 1 con tildes (`InitialAccountSetupView.tsx:78`). **Tasas:** 8 conversiones `/12` y `*12` (`createAuthSlice.ts:237-239`, `createDebtsSlice.ts:36-42` y `:115-123`, `DebtForm.tsx:200-202`). **Montos:** 16 `replace(/[^0-9]/g…)`/`replace(/\D/g…)` en `features` y `design-system`, cuando ya existe `parseCurrencyInteger` (`money.ts:72`). **Formularios de checklist:** la háptica ya es coherente, pero `ChecklistAddMovementForm` (662 líneas) y `ChecklistEditEntryForm` (473) siguen duplicando el monto, los chips y la frecuencia. **Editar / Eliminar:** `ActionModeToggleRow`/`InlineItemActionPill` solo se usan en Ahorros; Checklist y Deudas mantienen su propia versión. |
| **CC-03** | 🟡 Parcial | Ya resuelto: `zzSpikeGesture.test.tsx` se borró, y los imports de `createBudgetSlice` ya se usan (línea 959). Sigue abierto: `applyCloudWorkspace` sin llamadores (`createSyncSlice.ts:73`, `sliceTypes.ts:203`); `_defaultMotoOpening`/`_defaultSavingsOpening` (`budgetRepository.ts:164-165`); props muertas en `AnalyticsAndHistoryView.tsx:224-235` y `DebtsFunfamiView.tsx:57-62`; `EMPTY_PROVISION_PLAN` importado y sin uso (`createProvisionsSlice.ts:8`). |
| **CC-04** | 🟡 Parcial | Ya resuelto: el `fontSize: 20` literal. Sigue abierto: `testID` distinto por piel (`WorkspaceShell.tsx:550`, `:607`, `:655`) y `borderRadius` 10/8/6 literal; `Platform.OS === 'ios' ? 44 : …` (`AccountProfileWorkspaceView.tsx:426`); háptica en `onPressIn` (`AnalyticsAndHistoryView.tsx:121`; `BrandAndThemeIcons.tsx:44`, `:106` y `:216`); emojis `☁️` (`WorkspaceShell.tsx:561`, `:616`, `:666`) y `✨` (`AnalyticsAndHistoryView.tsx:315`, `DebtsFunfamiView.tsx:665`, `SummaryOverview.tsx:102`); `BFlow v1.0.0` hardcodeado (`AccountProfileWorkspaceView.tsx:640`) frente a `0.1.0` en `package.json` (`expo-constants` ya está instalado). |
| **CC-05** | ❌ Abierto (y más amplio) | Saneamiento con `14_800_000`/`13_800_000`/`16_880_000` (`budgetRepository.ts:1450-1452`); `debt_cb300f_moto`/`debt_esp_ia`/`debt_especializacion` (`budgetRepository.ts:1677-1680` y `:1746-1749`; `DebtsFunfamiView.tsx:456`). **Nuevo:** también en el dominio, en `debtCalculator.ts:126-127` (orden de prioridad «Backward compat priority for fixture»). |
| **CC-06** | ❌ Abierto | `proxyBatch … as unknown as ReturnType<typeof writeBatch>` en `budgetRepository.ts:2355-2362` y `:2385-2395`. |

### 3.4. Documentación (`DOC-*`)

| ID | Estado | Evidencia de hoy |
| :--- | :---: | :--- |
| **DOC-01** | ❌ Abierto | `README.md:9` dice `Tests-123`, `:394` dice «123 tests» y `:199`/`:395` dicen 503 líneas (hoy: 101 suites, 1.360 tests y 623 líneas). `PERF_BASELINE.md` §2 dice Expo `~58.0.21` (hoy `~58.0.26`), Zod `^3.24.2` (hoy `^4.6.7`) y el proyecto `bflow-deaeb` fijo; §4 dice que los iconos pesan 1.774 KB (hoy 890 KB). |
| **DOC-02** | ❌ Abierto | Hay enlaces `file:///` en `README.md` (6), `docs/decisions/0006-*.md` (6) y **`DESIGN.md:3`** (1, nuevo, ruta `D0604763`). Las dos auditorías de esta carpeta también los usan. `README.md:30` apunta al ancla rota `#-variables-de-entorno`. |
| **DOC-03** | ❌ Abierto | El árbol de `README.md` no incluye `src/domain/provisions/`, `src/domain/models/`, `src/platform/dialogs/` ni los nuevos `src/domain/accounts/` y `src/features/accounts/` (ADR 0034). |
| **DOC-04** | ❌ Abierto | Los ADR 0001, 0002 y 0003 siguen como `Propuesto (Fase 0)`. |
| **DOC-05** | ❌ Abierto | `docs/guides/iloader-signing-guide.md` no tiene la cabecera Diátaxis. |
| **DOC-06** | ❌ Abierto | El JSDoc de `hapticService.ts:6` y `:55` dice `onPressIn`; `DESIGN.md:223` dice `onPress`. |
| **DOC-07** | ❌ Abierto | Ningún script revisa enlaces de los `.md`. |

---

## 4. Plan de implementación por fases

Las fases van **de mayor a menor riesgo para los datos del usuario**. La documentación va al final, para que las cifras (tests, líneas, tamaños) reflejen el estado definitivo. Cada fase se trabaja en su propia rama a partir de `audit` y se puede ejecutar sin depender de las demás, salvo lo indicado.

| Fase | Tema | Hallazgos | Riesgo | ¿ADR? |
| :---: | :--- | :--- | :---: | :---: |
| **1** | Cola offline e integridad de borrados | BUG-01, BUG-02, BUG-03, BUG-04 | Alto (datos) | Sí: enmienda al 0017 o un ADR nuevo (borrado en cascada) |
| **2** | Rendimiento de runtime y caché cifrada | OPT-01, OPT-02, OPT-04, OPT-05, OPT-06, AUD-07 (cifrado) | Medio | No (registrar en `PERF_BASELINE.md`) |
| **3** | DRY, código muerto y reglas de diseño | CC-02, CC-03, CC-04 | Bajo/Medio | No |
| **4** | Refactor estructural del repositorio y del onboarding | CC-01, CC-05, CC-06 | Medio | Sí, si se elimina el saneamiento o cambia el orden de deudas en el dominio |
| **5** | Seguridad residual y preparación para tiendas | AUD-01 (App Check), AUD-04 (pepper), AUD-05, AUD-07 (iconos), AUD-03 (opcional) | Medio | Sí para App Check |
| **6** | Documentación y Docs-as-Code | DOC-01 a DOC-07 | Nulo | No |

---

### Fase 1 — Cola offline e integridad de borrados (`BUG-01` a `BUG-04`)

**Objetivo:** que todo lo que el usuario borre o configure sin conexión llegue igual a Firestore al reconectar, y que los borrados no dejen referencias huérfanas en la nube.

```markdown
Actúa coordinando Architect, QA Engineer, Security Auditor y Reviewer según `AGENTS.md`. Apóyate en `/firebase-firestore-modeling`, `/clean-code` y `/write-tests-for-change`. Rama: `fix/offline-queue-integrity` desde `audit`.

Implementa la Fase 1 de `docs/Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md` (verificada el 2026-11-26). Antes de tocar código, escribe un test que reproduzca cada fallo y compruébalo en rojo.

1. **Payload tipado (base para BUG-01 y BUG-02)** — `src/platform/storage/offlineWriteQueue.ts`:
   - Sustituye `payload: Record<string, unknown>` (línea 49) por una unión discriminada `QueuedWriteOperation` por `type`, con el payload exacto que envía cada slice.
   - Mantén la lectura de colas ya guardadas en el dispositivo: valida con Zod y descarta (con aviso en `syncMessage`) las operaciones antiguas que no encajen, sin lanzar.

2. **BUG-01**: añade el tipo `'delete_entry_completely'`, despáchalo a `repo.deleteEntryCompletely(uid, entryId)` en `executeQueuedOperation` y úsalo en `deleteEntryById` (`src/features/budget/store/slices/createBudgetSlice.ts:639`). El otro borrado (`createBudgetSlice.ts:698`) sigue con `'delete_or_reset_entry'`.

3. **BUG-02**: reescribe `getOperationTargetKey` (`offlineWriteQueue.ts:131-171`) sobre la unión tipada:
   - `entryId`, `conceptId`, `debtId`, `accountId` y `bucketId` resuelven la misma clave que su operación de guardado.
   - `save_custom_concept_and_entry` usa la clave de su `entry`.
   - Define la compactación: un borrado reemplaza los guardados pendientes del mismo objetivo, y guardar después de borrar conserva el orden FIFO.
   - Cubre con tests: editar y luego borrar el mismo movimiento sin red deja una sola operación de borrado.

4. **BUG-03**: en `completeInitialAccountSetup` (`src/features/budget/store/slices/createAuthSlice.ts:505-521`), cambia el `try/catch` manual por `executeOptimisticCloudWrite` con un tipo nuevo `'save_initial_account_setup'` (idempotente: `saveInitialAccountSetup` debe poder repetirse sin duplicar documentos). Mantén el rollback ante errores permanentes.

5. **BUG-04** — `src/data/repositories/budgetRepository.ts` y los slices:
   - `deleteSavingsBucket` (`:2538`): en el mismo `writeBatch`, quita `savingsContribution` de los `concepts` que apuntan al fondo.
   - `deleteDebt` (`:2480`): en el mismo lote, quita `defaultTargetDebtId` de los `concepts` y decide qué hacer con `users/{uid}/debtPayments` de esa deuda (borrarlos o conservarlos como historial). Documenta la decisión en un ADR (`docs/decisions/0035-*.md`) y respeta el límite de 500 operaciones por lote.
   - `createDebtsSlice.ts:215-250`: aplica en memoria la misma limpieza y revierte todo en el `catch` (`AGENTS.md` §6.2).
   - Si cambian los campos que se escriben, revisa `firestore.rules` y añade tests en `src/data/__tests__/`.

6. **Definition of Done (`AGENTS.md` §4)**: tests de la cola (FIFO, deduplicación, compactación, drenado, rollback) en `src/platform/storage/__tests__/` y de los slices en `src/features/budget/store/__tests__/`; `npm run typecheck`, `npm run lint`, `node scripts/check-src-tests-guard.mjs audit` y `npm test` en verde. Indica qué no se pudo verificar contra el emulador de Firestore.
```

---

### Fase 2 — Rendimiento de runtime y caché cifrada (`OPT-01`, `OPT-02`, `OPT-04`, `OPT-05`, `OPT-06`, `AUD-07`)

**Objetivo:** que marcar una fila del checklist recalcule solo la pestaña visible y que guardar la caché no descifre la cuenta entera cada vez.

```markdown
Actúa coordinando Architect, UI Builder, QA Engineer y Documentation Expert según `AGENTS.md`. Apóyate en `/react-performance`, `/react-best-practices` y `/write-tests-for-change`. Rama: `perf/hidden-tabs-and-cache` desde `audit`.

Implementa la Fase 2 de `docs/Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md`. Mide antes y después cada punto (commits de render con `src/features/__tests__/renderCommits.test.tsx`, conteo de llamadas a calculadores y a `persistentStorage.getItem`/`setItem`).

1. **OPT-01, pestañas ocultas congeladas** (`src/app/index.tsx:127-196` y `src/features/*/components/*Tab.tsx`):
   - Mientras `useIsTabActive()` sea `false`, ninguna pestaña oculta debe volver a ejecutar sus selectores ni sus `useMemo` de dominio (`useActiveMonthSummaries`, `useChartHistory`). Por ejemplo: congelar la última instantánea de los selectores, o un `memo` con comparador que ignore los cambios del store mientras está oculta.
   - Al reactivarse, la pestaña recalcula una vez y muestra datos actuales.
   - Añade un test: con las 5 pestañas visitadas, marcar una fila del checklist solo vuelve a pintar `ChecklistTab`, en las 3 pieles.

2. **OPT-02, un solo punto de guardado** (`src/app/index.tsx:343`, `src/features/budget/store/slices/sliceTypes.ts:403-444`, `createProvisionsSlice.ts`):
   - Deja un único disparador de `schedulePersistedAccountSave`.
   - En `src/platform/storage/accountCache.ts:160` y `:203`, guarda en memoria los metadatos del sobre (`uid`, `dataRevision`, `historySyncedAt`, `savedAt`) para que `savePersistedAccount` y `updatePersistedAccountRevision` no llamen a `readValidatedEnvelope` (que descifra y parsea toda la cuenta).
   - Mantén `historySyncedAt` (ADR 0028) y la invalidación al cambiar de usuario.

3. **OPT-04, índices por mes** (`src/data/repositories/budgetRepository.ts`):
   - Agrupa `entries` y `debtPayments` en un `Map<monthKey, …>` antes del bucle de meses de `loadFullCloudAccount` (hoy hay 3 `filter` por mes).
   - En `addMonthEntry` (`:2004` y `:2010`), recibe del store los conceptos y movimientos del mes en lugar de hacer 2 `getDocs`, igual que se hizo en `deleteOrResetEntry` (R-14). Ajusta `phase4FirestoreReads.test.ts` si cambia el conteo de lecturas.

4. **OPT-05 / AUD-07, cifrado**: en `src/platform/storage/storageCipher.ts:328`, reutiliza un único `state` de 16 bytes en `aes256CtrTransform`. La salida tiene que ser idéntica byte a byte: compruébalo con un test de vectores conocidos y con datos cifrados antes del cambio.

5. **OPT-06**:
   - Sustituye las 30 llamadas a `new FirestoreBudgetRepository()` de los slices por un getter perezoso compartido (por ejemplo `getBudgetRepository()` en `sliceTypes.ts`) que los tests puedan reemplazar.
   - Memoiza `swapStyle` en `ThemeToggleIconButton` (`src/design-system/components/BrandAndThemeIcons.tsx:92-99`).

6. **Definition of Done**: registra el antes y el después en `PERF_BASELINE.md` (sección nueva §20); `npm run typecheck`, `npm run lint`, `node scripts/check-src-tests-guard.mjs audit` y `npm test`. Indica que la fluidez en un Android físico queda sin verificar.
```

---

### Fase 3 — DRY, código muerto y reglas de diseño (`CC-02`, `CC-03`, `CC-04`)

**Objetivo:** una sola fuente para slugs, tasas y montos; un único componente para Editar / Eliminar; y cero desviaciones de `DESIGN.md` y `AGENTS.md` §7.

```markdown
Actúa coordinando UI Builder, Architect, QA Engineer y Reviewer según `AGENTS.md`. Apóyate en `/refactor-code`, `/clean-code`, `/mobile-design` y `/write-tests-for-change`. Rama: `refactor/dry-and-design-rules` desde `audit`.

Implementa la Fase 3 de `docs/Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md`.

1. **Helpers puros en `src/domain/`** (exportados desde `src/domain/index.ts`, con tests y cobertura ≥ 90 %):
   - `toSlugId(value)`, con `normalize('NFD')`, para sustituir las 8 copias: `createAuthSlice.ts:212`, `:231`, `:274` y `:316`; `createBudgetSlice.ts:231`; `createProvisionsSlice.ts:43`; `createSavingsSlice.ts:106`; `InitialAccountSetupView.tsx:78`. **Ojo:** solo afecta a ids nuevos. Comprueba que ningún flujo regenera el id de un concepto existente a partir de su nombre; si alguno lo hace, conserva el id guardado.
   - `annualToMonthlyRate`/`monthlyToAnnualRate` en `src/domain/debts/`, para las 8 conversiones de `createAuthSlice.ts:237-239`, `createDebtsSlice.ts:36-42` y `:115-123` y `DebtForm.tsx:200-202`.
   - Sustituye los 16 `replace(/[^0-9]/g…)`/`replace(/\D/g…)` de `features` y `design-system` por `parseCurrencyInteger` (`src/domain/money/money.ts:72`) o por un helper nuevo si hace falta otra semántica.

2. **Componentes compartidos**:
   - Lleva `ActionModeToggleRow` e `InlineItemActionPill` (hoy solo en `SavingsAndMotoIdealView.tsx`) a `src/design-system/components/` y úsalos en `ChecklistWorkspaceView.tsx` y `DebtsFunfamiView.tsx`. Respeta `RevealDown`, la háptica `warning` al eliminar y `confirmDestructive`.
   - Extrae las piezas comunes de `ChecklistAddMovementForm.tsx` y `ChecklistEditEntryForm.tsx` (tarjeta del monto, chips de deuda, ahorro y cuenta, frecuencia) sin subir su estado de texto a la vista (ADR 0028).

3. **Código muerto**: borra `applyCloudWorkspace` (`createSyncSlice.ts:73`, `sliceTypes.ts:203`), los parámetros `_defaultMotoOpening`/`_defaultSavingsOpening` (`budgetRepository.ts:164-165`), las props muertas de `AnalyticsAndHistoryView.tsx:224-235` y `DebtsFunfamiView.tsx:57-62` (y de sus llamadores), y el import `EMPTY_PROVISION_PLAN` (`createProvisionsSlice.ts:8`).

4. **Reglas de diseño**:
   - `WorkspaceShell.tsx:550`, `:607` y `:655`: un solo `testID="pending-offline-sync-badge"` en las 3 pieles y `radius` del tema. Actualiza los tests y los flujos de `e2e/` que usen los ids antiguos (`scripts/workflow-guards.test.mjs` lo comprueba).
   - Cambia los emojis `☁️` y `✨` por iconos SVG del sistema de diseño o por texto (`WorkspaceShell.tsx:561`, `:616` y `:666`; `AnalyticsAndHistoryView.tsx:315`; `DebtsFunfamiView.tsx:665`; `SummaryOverview.tsx:102`). Los `✓`, `○` y `✕` de las listas de requisitos y del botón de cerrar pueden quedarse si se leen bien con lector de pantalla.
   - Pasa la háptica de `onPressIn` a `onPress` (`AnalyticsAndHistoryView.tsx:121`; `BrandAndThemeIcons.tsx:44`, `:106` y `:216`), según `DESIGN.md` §6.3.
   - `AccountProfileWorkspaceView.tsx:426`: quita `Platform.OS === 'ios' ? 44 : …` y usa los insets seguros o un token.
   - `AccountProfileWorkspaceView.tsx:640`: lee la versión de `Constants.expoConfig?.version` (de `expo-constants`) con un respaldo seguro.
   - Evalúa si `TactilePressable` todavía hace falta: su único consumidor, `MonthlyCurveSection.tsx`, le pasa `haptic="none"`.

5. **Definition of Done**: pruebas en las 3 pieles (`ios`, `android`, `web`); `npm run typecheck`, `npm run lint`, `node scripts/check-src-tests-guard.mjs audit`, `npm test` y `npm run test:scripts`. Si algún cambio visual se nota, revísalo en `npm run web:demo` con `?skin=ios|android|web`.
```

---

### Fase 4 — Refactor estructural del repositorio y del onboarding (`CC-01`, `CC-05`, `CC-06`)

**Objetivo:** dividir los dos archivos más grandes sin cambiar ningún contrato público ni ningún valor de los tests dorados. **Requisito:** haber terminado antes la Fase 1, que toca el mismo repositorio.

```markdown
Actúa coordinando Architect, QA Engineer y Reviewer según `AGENTS.md`. Apóyate en `/refactor-code`, `/clean-code`, `/firebase-firestore-modeling`, `/domain-budget-rules` y `/write-tests-for-change`. Rama: `refactor/split-repository-and-onboarding` desde `audit`, con la Fase 1 ya integrada.

Implementa la Fase 4 de `docs/Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md`, con refactors atómicos y los tests en verde tras cada paso.

1. **Dividir `src/data/repositories/budgetRepository.ts` (2.703 líneas)** sin romper las importaciones actuales (que `budgetRepository.ts` siga reexportando todo):
   - `budgetRepositoryTypes.ts`: `BudgetRepository`, `FullCloudAccountData` y tipos.
   - `inMemoryBudgetRepository.ts`.
   - `accountHydration.ts`: `loadFullCloudAccount` (hoy de la línea 1240 a la 1912, unas 670 líneas) en funciones pequeñas y puras: negociación de `dataRevision`, lectura en paralelo, ventana de historial (ADR 0028), cálculo de `needsOnboarding` y de los meses disponibles, y encadenamiento de saldos mes a mes.
   - `firestoreBudgetRepository.ts`.

2. **CC-06**: sustituye `proxyBatch … as unknown as ReturnType<typeof writeBatch>` (`budgetRepository.ts:2355-2362` y `:2385-2395`) por un recolector tipado de escrituras (lista de `{ ref, data }`) que luego se aplica al `WriteBatch` real.

3. **CC-05, datos de la cuenta semilla en código universal (ADR 0005)**:
   - Saca el saneamiento de `14_800_000`/`13_800_000`/`16_880_000` (`budgetRepository.ts:1450-1452`) y el de `debt_cb300f_moto`/`debt_esp_ia`/`debt_especializacion` (`:1677-1680` y `:1746-1749`) a un adaptador explícito `legacySeedHealing.ts`, aislado y con tests. Si se demuestra que ya no hay cuentas afectadas, elimínalo y regístralo en un ADR.
   - Quita el respaldo a `debt_cb300f_moto` de `DebtsFunfamiView.tsx:456`.
   - `src/domain/debts/debtCalculator.ts:126-127` prioriza `debt_cb300f_moto` «por compatibilidad con el fixture». Sustitúyelo por un criterio genérico (orden por `sortOrder`, por fecha de creación o por la deuda objetivo explícita) que mantenga en verde `domain/__tests__/golden-october-2026.test.ts`. Si el resultado dorado cambia, detente: requiere ADR y validación contra el Excel.

4. **CC-01, onboarding**: divide `src/features/onboarding/components/InitialAccountSetupView.tsx` (1.025 líneas) en un componente por paso (`OnboardingPeriodStep`, `OnboardingSavingsStep`, `OnboardingDebtsStep`, `OnboardingIncomesStep`, `OnboardingExpensesStep`, `OnboardingProvisionsStep`), sin cambiar `testID`, textos ni flujo.

5. **Definition of Done**: el mismo número de lecturas en `phase4FirestoreReads.test.ts` (7 `getDocs` y 35 documentos, o los que deje la Fase 2), cobertura de `src/domain/` ≥ 90 %, tests dorados intactos, `npm run typecheck`, `npm run lint`, `node scripts/check-src-tests-guard.mjs audit` y `npm test`.
```

---

### Fase 5 — Seguridad residual y preparación para tiendas (`AUD-01`, `AUD-03`, `AUD-04`, `AUD-05`, `AUD-07`)

**Objetivo:** cerrar lo que queda antes de publicar: App Check, el pepper por defecto, las dependencias y el peso de los iconos.

```markdown
Actúa coordinando Security Auditor, Architect, DevOps y Documentation Expert según `AGENTS.md`. Apóyate en `/security-audit`, `/firebase-firestore-modeling` y `/clean-code`. Rama: `chore/store-readiness` desde `audit`.

Implementa la Fase 5 de `docs/Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md`. Separa lo que se puede hacer en código de lo que solo puede hacer el propietario en una consola, y marca esto último como `needs_validation`.

1. **App Check (AUD-01)**: investiga y redacta un ADR (`docs/decisions/00xx-app-check.md`) con la opción viable para este stack (Firebase JS SDK en Expo, Modo A y Modo B): reCAPTCHA Enterprise en Web; para iOS y Android, un proveedor personalizado o un módulo nativo (App Attest / DeviceCheck y Play Integrity), teniendo en cuenta el límite de 2 App IDs y la firma con `iloader`. Implementa Web si es viable; en nativo, deja la integración detrás de una variable `EXPO_PUBLIC_*` y documenta cómo pasar a *enforce* en la consola sin bloquear a los usuarios actuales.

2. **Pepper por defecto (AUD-04)** (`src/platform/storage/storageCipher.ts:22` y `:431-434`): decide entre exigir `EXPO_PUBLIC_LOCAL_CIPHER_PEPPER` en los builds reales (y añadirla a `scripts/check-build-env.mjs`) o documentar en el ADR 0027 que el pepper no es un secreto (viaja en el bundle) y que la protección real es el token del dispositivo. Si cambia, el dato cifrado existente tiene que seguir descifrándose: añade un test de migración.

3. **Dependencias (AUD-05)**: las 8 moderadas restantes son `glob` 9–14.0.1 y `minimatch` 7–11.0.0, transitivas de `@expo/fingerprint` → `expo` y de `@bacons/apple-targets/node_modules/@expo/config-plugins`. Prueba `overrides` en `package.json` con versiones corregidas y compatibles; descarta `npm audit fix --force` (baja a `expo@52`). Valida con `npm ci`, `npm run typecheck`, `npm test`, `npm run test:scripts` y `npx expo prebuild --platform android --no-install` en local. Si no hay arreglo compatible, documenta el riesgo aceptado: son herramientas de build, no código del bundle.

4. **Iconos (AUD-07)**: comprime `assets/icon.png` y `assets/adaptive-icon.png` (890.512 bytes cada uno, 1024 × 1024) a menos de 250 KB sin pérdida visible, con `scripts/optimize-assets.mjs` o una cuantización PNG equivalente. Conserva dimensiones, transparencia y la zona segura del icono adaptativo, y compara antes y después visualmente.

5. **Opcional (AUD-03)**: si se quiere exigir `email_verified` en `firestore.rules`, propón primero en un ADR la migración de las cuentas anteriores a `EMAIL_VERIFICATION_ENFORCED_SINCE_MS`, con tests de reglas en el emulador. No lo apliques sin aprobación.

6. **Definition of Done**: actualiza `.env.example`, `README.md` y `docs/guides/firebase-auth-hardening-guide.md`; `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:scripts`, y vuelve a ejecutar `npm audit --omit=dev` para dejar el resultado en el ADR.
```

---

### Fase 6 — Documentación y Docs-as-Code (`DOC-01` a `DOC-07`)

**Objetivo:** que README, PERF_BASELINE, DESIGN y los ADR digan la verdad del código y que un script lo vigile. Va al final para que las cifras sean las definitivas.

```markdown
Actúa como `documentation-expert` (`.agents/agents/documentation-expert.md`) aplicando `AGENTS.md` §5 (Diátaxis y Docs-as-Code). Rama: `docs/sync-and-link-guard` desde `audit`, después de integrar las fases anteriores.

Implementa la Fase 6 de `docs/Improvements/AUDITS/plan_consolidado_pendientes_auditorias.md`. **Mide cada cifra en el momento de escribirla** (no copies las de este plan, que son del 2026-11-26).

1. **DOC-02, enlaces**: cambia todos los `file:///` por rutas relativas en `README.md` (6), `docs/decisions/0006-*.md` (6), `DESIGN.md:3` y las dos auditorías de `docs/Improvements/AUDITS/`. Corrige el ancla rota `#-variables-de-entorno` de `README.md:30`.

2. **DOC-01, cifras**:
   - `README.md`: el badge de tests (`:9`), «123 tests» (`:394`), las 503 líneas de `firestore.rules` (`:199` y `:395`) y el ahorro de los iconos.
   - `PERF_BASELINE.md` §2 y §4: versiones reales de `package.json` (Expo, Zod, Jest), el proyecto Firebase configurado por `EXPO_PUBLIC_FIREBASE_*` (ADR 0027) y el peso real de `assets/*.png`, con la fecha de corte.

3. **DOC-03, árbol de `README.md`**: añade `src/domain/provisions/`, `src/domain/models/`, `src/domain/accounts/`, `src/features/accounts/` y `src/platform/dialogs/`, y revisa que `modules/bflow-widgets/`, `e2e/`, `src/domain/auth/` y `src/platform/perf/` aparezcan como carpetas del árbol.

4. **DOC-04 y DOC-05**: cambia el estado de los ADR 0001, 0002 y 0003 a «Aceptado» con notas de sustitución (0002 → ADR 0018 en lugar de `onSnapshot`, 0020 en lugar de `react-native-gifted-charts`, 0021 en lugar de `bflow-native-bridge`, y `exactOptionalPropertyTypes` no se activó), sin reescribir su contenido histórico. Añade a `docs/guides/iloader-signing-guide.md` la cabecera `> **Tipo Diátaxis:** How-To Guide` y el enlace al ADR 0001.

5. **DOC-06**: alinea el JSDoc de `src/platform/haptics/hapticService.ts` (líneas 6 y 55) y de `TactilePressable.tsx` con `DESIGN.md` §6.3 (háptica en `onPress`). Si la Fase 3 retiró `TactilePressable`, solo `hapticService`.

6. **DOC-07, guardia**: crea `scripts/docs-link-guard.mjs`, ejecutado por `npm run lint` y con test en `npm run test:scripts`. Debe fallar si algún `.md` versionado (fuera de `node_modules`) contiene `file:///`, un enlace relativo a un archivo que no existe o un ancla interna que no existe.

7. **Definition of Done**: `npm run lint`, `npm run test:scripts` y `npm run typecheck` en verde. Actualiza también el `CLAUDE.md` del proyecto (quita el aviso de los enlaces `file:///` del README cuando ya no sea cierto).
```

---

## 5. Comprobaciones externas pendientes (`needs_validation`)

Estas no se pueden hacer desde el repositorio; las tiene que hacer el propietario del proyecto Firebase:

1. **Firebase Console → Authentication → Settings → Password policy**: la misma política que `passwordPolicy.ts`, para que el enlace de restablecimiento la exija.
2. **Authentication → Settings → User actions**: *Email enumeration protection* activada.
3. **App Check**: registrar las apps iOS, Android y Web (depende del ADR de la Fase 5) y empezar en modo de supervisión antes de *enforce*.
4. **Google Cloud Console → Credentials**: restringir la `apiKey` de Firebase a *Identity Toolkit*, *Token Service* y *Cloud Firestore*, y a los identificadores `com.bflow.app` y los dominios web autorizados.
5. **Dispositivos**: Android físico (cambio rápido de pestañas, dock, háptica), el fallo real de SecureStore y `expo-crypto` en el `.ipa`/`.apk`, y `ccache --show-stats` en un build de macOS.
6. **Emulador o Firestore real**: `getCountFromServer` y la consulta por `updatedAt` (ADR 0028), cuentas financieras (ADR 0034) y los borrados en cascada de la Fase 1.
