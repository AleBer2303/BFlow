# 0034. Tarjetas de crédito y cuentas débito vinculadas a los movimientos

- **Estado:** Aceptado
- **Fecha:** Noviembre 2026
- **Contexto:** Extiende los ADR [0003](0003-domain-model-and-firestore-schema.md), [0017](0017-offline-writes-persistent-queue-and-rollback.md), [0018](0018-account-data-revision-and-cache-validation.md) y [0028](0028-archived-history-window-and-widget-sync-coalescing.md).
- **Autores:** Architect, Domain Engineer, UI Builder y QA Engineer

---

## 1. Contexto y problema

1. El usuario quiere registrar sus **tarjetas de crédito** y **cuentas débito** desde la pestaña Deudas, vincularles gastos e ingresos, y ver en **Cierre** cuánto gastó con cada tarjeta o cuenta y cuánto le abonó o pagó.
2. La tarjeta de crédito debe guardar el **cupo**, el **día de corte**, el **día límite de pago** y el **valor pendiente de pago**. La cuenta débito, el **saldo** y lo pertinente (tipo de cuenta, entidad).
3. La opción debe estar en el formulario de **+ Nueva Deuda**, con un selector parecido al Gasto / Ingreso de **+ Nuevo Movimiento**, sin cambiar la interfaz visual existente.
4. Las deudas actuales (`debts` + `debtPayments`) son por mes, con cuota, interés y cascada de abonos. Una tarjeta no encaja en ese modelo: su saldo sube con cada compra y baja con cada pago, y no tiene una cuota fija.

---

## 2. Decisión

### 2.1. Modelo de dominio (`src/domain/accounts/financialAccounts.ts`)

1. **Entidad `FinancialAccount`** (`src/domain/models/types.ts`): `id`, `type` (`credit` | `debit`), `name`, `institution`, `lastFourDigits?` (4 dígitos, solo para mostrar), `openingBalance`, `openingMonthKey` y, según el tipo:
   - **Crédito:** `creditLimit?` (cupo), `statementDay?` (día de corte, 1..31), `paymentDueDay?` (día límite de pago, 1..31) y `monthlyInterestRate?` (informativa).
   - **Débito:** `debitKind?` (`savings` | `checking`).
2. **El saldo nunca se guarda**, igual que el de las deudas. Se deriva de `openingBalance` (saldo al inicio de `openingMonthKey`; en crédito, lo que se debía) más los movimientos **completados** vinculados desde ese mes.
3. **Vínculo en `MonthEntry`:** `accountId?` y `accountRole?` (`purchase` | `payment`). Efecto de cada movimiento:

   | Cuenta | Gasto | Ingreso |
   |---|---|---|
   | Débito | Salida (baja el saldo) | Entrada (sube el saldo) |
   | Crédito | Compra (sube lo pendiente); con `accountRole: 'payment'`, pago a la tarjeta (baja lo pendiente) | Abono o reembolso (baja lo pendiente) |

   El rol solo se guarda en gastos con tarjeta de crédito (`applyEntryAccountLink`).
4. **Resúmenes:** `calculateFinancialAccountMonthSummary` y `calculateFinancialAccountsSummary` devuelven, por mes, el saldo de apertura y de cierre, lo gastado (`spentThisMonth`) y lo pagado (`paidThisMonth`), el cupo disponible y el porcentaje de uso (tope 100%), y las próximas fechas de corte y de pago (`resolveNextMonthlyDate`, que lleva el día 31 al último día de los meses cortos). Las cuentas registradas después del mes consultado no aparecen.
5. Las cifras son enteros seguros (`assertSafeMoneyInteger`, `sumMoneyIntegers`). El débito admite saldo negativo (sobregiro) y el crédito un saldo a favor (pagos mayores a lo debido).
6. **Las tarjetas no suman al "Total Deudas"** de la pestaña Deudas ni a los snapshots de cierre: esa cifra y sus tests dorados (`fixtures/october-2026.json`) no cambian. Lo pendiente en tarjetas se muestra aparte, en "Tarjetas y cuentas" y en Cierre.

### 2.2. Datos y seguridad

1. **Colección nueva** `users/{uid}/financialAccounts/{accountId}`, validada con `financialAccountSchema` (Zod) en ambos sentidos.
2. **`firestore.rules`:** `isValidFinancialAccount` (campos permitidos, tipos, `lastFourDigits` de 4 dígitos, días enteros 1..31, tasa 0..100, montos enteros no negativos) y `match /financialAccounts/{accountId}`, donde la actualización no puede cambiar `id` ni `type`. `isValidEntry` admite `accountId` (1..120) y `accountRole` (`purchase` | `payment`). Sigue siendo deny-by-default.
3. **Repositorio:** `saveFinancialAccount` (escritura completa, sin `merge`, para que vaciar un campo opcional lo borre también en la nube) y `deleteFinancialAccount`, ambos por `commitUserDataMutationBatch` (ADR 0018). `loadFullCloudAccount` lee la colección en la misma ola paralela; `resetFullAccountInCloud` la borra. No hace falta un índice nuevo.
4. **Costo en el plan Spark:** cada carga completa hace una consulta más. Si la colección está vacía, Firestore cobra una lectura mínima: 35 documentos en lugar de 34 para la cuenta semilla (`phase4FirestoreReads.test.ts`). La carga que valida `dataRevision` (1 lectura) no cambia.
5. **Eliminar una cuenta** no reescribe los movimientos: conservan su `accountId` y el dominio ignora los ids sin cuenta. Así se evita una escritura por cada movimiento del historial.

### 2.3. Store, caché y cola offline

1. **`createAccountsSlice`:** `financialAccounts` (una lista, no por mes) y `createFinancialAccount`, `updateFinancialAccount` y `deleteFinancialAccount`, con el patrón de AGENTS.md §6.2 (cambio optimista, widget, nube y reversión ante un error permanente). `buildFinancialAccount` limpia los textos, redondea montos y conserva solo los campos del tipo.
2. **Movimientos:** `addOrCompleteMovement`, `createCustomConceptAndMovement` y `editEntry` aceptan `accountId` y `accountRole`. `null` quita el vínculo y `undefined` lo deja igual.
3. **Caché local:** `FullCloudAccountData.financialAccounts` es opcional, para leer las cachés escritas antes de este ADR (se leen como lista vacía). Se añadió a `PERSISTED_ACCOUNT_FIELDS`, al guardado de `index.tsx` y a `isEquivalentCloudAccount`.
4. **Cola offline (ADR 0017):** operaciones `save_financial_account` y `delete_financial_account`, que se agrupan por cuenta (`account_<id>`).

### 2.4. Interfaz

1. **Dónde vive cada cuenta** (`FinancialAccountScope`, `isSavingsAccount`):
   - Las tarjetas de crédito y las cuentas débito **corrientes** se registran y se ven en **Deudas**.
   - Las cuentas débito **de ahorros** (`debitKind: 'savings'`) se registran y se ven en **Ahorros**.
   - Una cuenta débito sin `debitKind` cuenta como corriente.
   - El tipo de cuenta lo fija la pestaña que abre el formulario, no el usuario: `FinancialAccountFormFields` (en `src/features/accounts/`, compartido por las dos pestañas) ya no tiene el selector Ahorros / Corriente.
   - Los movimientos (`AccountLinkFields`) y Cierre siguen viendo todas las cuentas, con la etiqueta `financialAccountKindLabel` (Crédito, Débito o Ahorros).
2. **+ Nueva Deuda** (`DebtForm`): al registrar aparece un control segmentado **Deuda · Crédito · Débito**, con el mismo estilo que Gasto / Ingreso. **Débito** registra solo cuentas corrientes («Registrar Cuenta Corriente»). Los campos de deuda no cambian (`DebtFormFields`). Tonos: deuda `debt`, crédito `savings` y débito `provisions`. Al editar, el tipo queda fijo y el selector no aparece.
3. **+ Nuevo Ahorro** (`SavingsForm`, antes «+ Nuevo Fondo»): un control segmentado **Fondo · Cuenta de ahorros** con el mismo estilo.
   - **Fondo** usa los campos de siempre (`SavingsBucketFields`, compartidos con el onboarding, que conserva su «+ Nuevo Fondo»).
   - **Cuenta de ahorros** registra una cuenta débito de ahorros.
   - Los botones de modo pasan a **Editar Ahorro** / **Eliminar Ahorro** y actúan sobre fondos y cuentas.
   - La sección **Cuentas de ahorro** va debajo de los fondos, con el saldo total y los depósitos del mes.
   - La tarjeta principal añade «En cuentas de ahorro: $X».
   - **El total de ahorros de los fondos no cambia:** el saldo de las cuentas no se suma a `totalCurrentSavings`, ni a los snapshots, ni a los widgets ni a la curva del mes.
4. **Deudas:** sección **Tarjetas y cuentas** (`FinancialAccountCard`) debajo de las obligaciones. El crédito muestra lo pendiente o el saldo a favor, la barra de uso del cupo, el cupo disponible, las próximas fechas de corte y de pago, y las compras y pagos del mes. El débito muestra el saldo (o el sobregiro) y las salidas y entradas del mes. Se editan y eliminan con los mismos botones Editar / Eliminar de las deudas, y eliminar pide confirmación (`confirmDestructive`).
5. **Movimientos:** en **Más opciones** de Nuevo Movimiento y de Editar, `AccountLinkFields` pregunta con qué tarjeta o cuenta se pagó o dónde se recibió. En un gasto con tarjeta de crédito pregunta además si fue **Compra con la tarjeta** o **Pago a la tarjeta**. La fila del checklist muestra la cuenta vinculada como insignia.
6. **Cierre:** `AccountsMonthPanel` muestra lo gastado con tarjetas, lo pagado a tarjetas, lo pendiente por pagar y el cupo disponible, una frase sobre si la deuda en tarjetas subió o bajó, las salidas, entradas y saldo de las cuentas débito y de ahorros, y una fila por cuenta con barras de gastado y pagado. Solo aparece si hay cuentas en el mes.
7. Todas las cifras pasan por `useAmountPrivacy` (el ojo del Resumen las oculta) y los objetivos táctiles usan `minTouchTarget`.

---

## 3. Consecuencias

- **Positivas:** El usuario ve en un solo lugar cuánto gastó con cada tarjeta, cuánto le pagó y cuánto le queda por pagar, sin tocar las fórmulas de deudas ni los tests dorados. Los saldos salen de los movimientos, así que editar o eliminar un movimiento corrige la cuenta sin pasos extra.
- **Compensaciones:**
  - Una consulta más por carga completa de la cuenta.
  - Los conceptos recurrentes no recuerdan la cuenta: los pendientes del mes siguiente nacen sin vínculo y hay que elegirla al completarlos.
  - Lo pendiente de una tarjeta es el saldo total, no el valor del extracto del periodo: la app no separa las compras por fecha de corte.
  - La tasa de interés de la tarjeta es informativa: no se calcula interés sobre lo pendiente.
- **Pendiente de verificar:** Las reglas nuevas no se han probado contra el emulador ni contra Firestore real, y hay que desplegar `firestore.rules` antes de usar la función con una cuenta real. La interfaz no se ha probado todavía en un dispositivo iOS o Android.
