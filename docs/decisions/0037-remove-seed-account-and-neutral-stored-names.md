# 0037. Sin cuenta semilla: datos de ejemplo neutros y migración de los nombres guardados

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Sustituye el adaptador `legacySeedHealing.ts` del ADR [0036](0036-legacy-seed-healing-adapter-and-generic-debt-cascade.md) (su §2.2, el orden de la cascada, sigue vigente). Retoma el objetivo del ADR [0005](0005-universal-domain-refactoring-and-bias-elimination.md) y cambia lo decidido en el [0027](0027-local-crypto-hardening-env-config-and-dependencies.md) sobre `EXPO_PUBLIC_OWNER_SEED_EMAIL`.
- **Autores:** Architect, QA Engineer y Reviewer

---

## 1. Contexto y problema

BFlow nació para reemplazar un Excel mensual, y el código conservaba su huella aunque el dominio ya fuera genérico:

1. **Una cuenta especial.** El correo de `EXPO_PUBLIC_OWNER_SEED_EMAIL` recibía al entrar los datos de octubre de 2026 del Excel (`seedOctober2026IfEmpty`), nunca veía el asistente y tenía saneamientos propios en la carga (ADR 0036). El store, la autenticación y el repositorio en memoria preguntaban por ese correo, y varias rutas caían a `'2026-10'` como mes por defecto.
2. **Datos del Excel en el código.** El modo vitrina, el repositorio en memoria y la mayoría de los tests usaban esos datos: nombres de personas y marcas, la moto, la deuda FUNFAMI y celdas del Excel. El dominio aún tenía reglas para `exp_cuota_funfami` y una cuota por defecto de 1.800.000.
3. **Nombres del Excel en Firestore.** Los documentos guardaban `savingsBuckets/moto`, `monthSnapshots.closingSavings.motoClosingBalance`, `concepts.idealMotoCategoryKey`, `provisionPlans/moto_ideal` y `users/{uid}.seededOctober2026`.

---

## 2. Decisión

### 2.1. Sin cuenta semilla

1. Se eliminan `EXPO_PUBLIC_OWNER_SEED_EMAIL` (con `platform/mode/ownerSeedEmail.ts`, `check-build-env.mjs` y los dos workflows de build), `seedOctober2026IfEmpty`, `legacySeedHealing.ts` y toda rama «propietario» del store, la autenticación y la carga. Todas las cuentas siguen las mismas reglas: un usuario nuevo empieza en enero del año en curso y ve el asistente.
2. La cuenta que antes era la semilla ya tiene datos y `onboardingCompleted: true`, así que carga como cualquier otra. Lo que perdió es el saneamiento automático de los valores erróneos del ADR 0036.

### 2.2. Datos de ejemplo neutros (`src/data/sample/sampleWorkspace.ts`)

1. Un presupuesto de ejemplo que no es de nadie, con las mismas cifras que tenía la semilla (para que los tests sigan midiendo lo mismo) y con ids y nombres genéricos: `inc_salary`, `exp_loan_installment`, `debt_auto_loan`, fondo `reserve`, plan con `prov_*` y `goal_planned_purchase`.
2. `buildSampleWorkspace(monthKey)` lo arma para cualquier mes. El modo vitrina usa el mes actual. Los tests fijan uno con `BFLOW_SAMPLE_MONTH_KEY` en `jest.setup.js`, para que sus cifras no dependan del día en que corren; ningún build define esa variable.
3. Solo lo recibe el usuario local `DEMO_USER` (`uid: 'local-demo'`, `demo@bflow.example`, «Usuario de ejemplo»), que nunca llega a Firebase.
4. `fixtures/october-2026.json`, sacado del Excel, solo se usa en `domain/__tests__/golden-october-2026.test.ts`. Ese test lo lee a través de la misma migración del §2.3, y sus valores no cambian: también prueba que los datos viejos dan las mismas cifras.

### 2.3. Nombres guardados (`src/data/migrations/legacyFieldMigration.ts`)

| Dónde | Antes | Ahora |
| :--- | :--- | :--- |
| `savingsBuckets/{id}` | id `moto` | id `reserve` |
| `concepts.savingsContribution` | `bucketId: 'moto'` | `bucketId: 'reserve'` |
| `concepts` | `idealMotoCategoryKey` | `provisionCategoryKey` |
| `monthSnapshots.closingSavings` | `motoClosingBalance` | `reserveClosingBalance` |
| `provisionPlans/{id}` | id `moto_ideal` | id `default` |
| `users/{uid}` | `seededOctober2026` | se borra |

1. Es el único archivo de `src/` que conoce los nombres viejos. Los mappers de `firestoreSchemas.ts` traducen al leer y al escribir, así que el dominio, el store y las vistas solo ven los nombres nuevos.
2. `loadFullCloudAccount` vuelve a escribir en segundo plano los documentos que encuentra con nombres viejos: los conceptos y los meses cerrados afectados, el fondo (escribe `reserve` y borra `moto`), el plan (escribe `default` y borra `moto_ideal`) y quita `seededOctober2026`. Si falla sin red, la siguiente carga lo reintenta.
3. Si existen a la vez `moto` y `reserve`, gana `reserve` y `moto` se borra.
4. El plan se lee de `default` y, solo si no existe, de `moto_ideal`. Una cuenta que aún no tiene plan hace una lectura más por carga (2 documentos en vez de 1) hasta guardar uno; las demás leen lo mismo que antes (7 `getDocs`, 35 documentos en la cuenta de ejemplo).
5. **Caché y cola.** La caché local sube a la versión 3: la de una versión anterior se descarta y la cuenta se descarga otra vez por los mappers. La cola offline traduce los ids de fondo de las operaciones guardadas antes del cambio.
6. **Reglas.** `firestore.rules` acepta `provisionCategoryKey` y conserva `idealMotoCategoryKey` y `seededOctober2026` como claves heredadas: un guardado con `merge` sobre un documento que aún no se reescribió las sigue llevando.

### 2.4. Dominio y vistas

1. `buildDebtPaymentsForInstallment` ya no trata `exp_cuota_funfami` ni `ALL_FUNFAMI`; la proyección de deudas usa 0 como cuota por defecto (antes, 1.800.000 de la semilla). `calculateDebtsSummary` reconoce la cuota del mes por sus abonos y, sin abonos, por el id.
2. Sin alias del Excel en el dominio: `IdealMotoPlan`, `FunfamiDebtSummary`, `calculateFunfamiDebtSummary`, `domain/moto-ideal/`, las propiedades `moto` y `hasMotoBucket` y los campos `excel*`/`*Moto*`/`*Ideal*` del resumen de provisiones. `DEFAULT_DEBT_GROUP_KEY` (`'General'`) reemplaza al grupo `FUNFAMI`.
3. `DebtsWorkspaceView` y `SavingsAndProvisionsView` reemplazan a `DebtsFunfamiView` y `SavingsAndMotoIdealView`, con `testID` neutros (también en los flujos de Maestro), y el campo del store `idealMotoPlan` pasa a `provisionPlan`.
4. La edición del fondo de reserva enviaba el id literal `'moto'`; ahora envía el id del fondo.

---

## 3. Consecuencias

- **Positivas:**
  - Ningún archivo de `src/` fuera de `legacyFieldMigration.ts` y de los tests de migración nombra la semilla, octubre de 2026, la moto o FUNFAMI, y los tests ya no llevan datos personales.
  - Todas las cuentas siguen las mismas reglas, y el modo vitrina muestra el mes actual.
- **Compensaciones:**
  - La cuenta que era la semilla pierde los saneamientos del ADR 0036. Si aún tuviera alguno de esos valores, habría que corregirlo a mano.
  - Se pierden dos reglas de la carga para cuentas creadas por versiones muy antiguas: ignorar `2026-10` como mes de fondos o como mes activo cuando no había datos en ese mes. Una cuenta así vería octubre de 2026 en su lista de meses.
  - Tras actualizar, cada dispositivo descarga la cuenta completa una vez (por la nueva versión de la caché).
  - La primera carga de cada cuenta con nombres viejos escribe esos documentos otra vez (unos pocos lotes).
- **Pendiente de verificar:**
  - Nada se probó contra el emulador de Firestore ni contra el proyecto real: las reescrituras en segundo plano, el `deleteField()` sobre `users/{uid}` y las reglas con las claves nuevas. **Hay que desplegar `firestore.rules` antes de distribuir este build**: con las reglas anteriores, guardar un concepto con `provisionCategoryKey` sería rechazado.
  - Cuando todas las cuentas se hayan cargado con este build, se pueden borrar `legacyFieldMigration.ts`, la lectura de `moto_ideal` y las claves heredadas de `firestore.rules`.
