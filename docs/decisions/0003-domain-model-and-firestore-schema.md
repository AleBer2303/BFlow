# ADR 0003: Modelo de Dominio, Mejoras Propuestas y Esquema Firestore (Plan Spark)

- **Estado:** Propuesto (Fase 0)
- **Fecha:** 2026-10-28
- **Contexto:** Diseño del dominio puro en `src/domain/` y modelado en Cloud Firestore bajo los límites gratuitos del Plan Spark (50.000 lecturas/día, 20.000 escrituras/día, 20.000 borrados/día, 1 GiB de almacenamiento).

---

## 1. Mejoras Propuestas sobre el Modelo de Dominio Base

Partiendo del modelo descrito en `README.md`, proponemos las siguientes mejoras para garantizar **idempotencia offline, trazabilidad contable exacta y paridad verificable con el Excel**:

### 1.1. `Concept` (Catálogo de Ingresos y Gastos)
```ts
export interface Concept {
  id: string; // slug estable: ej. "inc_salario_principal", "exp_cuota_funfami"
  name: string;
  type: 'income' | 'expense';
  group: 'fixed' | 'variable';
  defaultAmount: number; // entero en COP (>= 0)
  icon: string; // SF Symbol / Lucide icon name
  color: string; // token semántico del design system
  allowMultiplePerMonth: boolean;
  recurrence:
    | { kind: 'monthly' }
    | { kind: 'specific_months'; months: Array<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12> };
  linkedDebtId?: string; // ej. "funfami" o una deuda específica
   defaultDebtAllocationStrategy?: 'ask_on_complete' | 'fixed_split' | 'proportional';
  savingsContribution?: {
    bucketId: 'moto' | 'savings';
    onlyWhenCompleted: boolean; // true por defecto (resuelve Inconsistencia #4)
  };
  idealMotoCategoryId?: string; // permite cruzar Gasto Real vs Cuadro IDEAL (resuelve Inconsistencia #9)
  archived: boolean;
  order: number;
}
```
- **Mejora clave:** Añadir `idealMotoCategoryId?` opcional permite vincular conceptos del presupuesto (`Gasolina Moto/Carro`, `Parqueadero CEM`, `Seguro TR SURA`) con los renglones del cuadro **IDEAL de la moto** para comparar el costo real mensual frente al provisto sin duplicar registros.

### 1.2. `MonthEntry` (Equivalente a una fila mensual del Excel)
```ts
export interface MonthEntry {
  id: string; // Determinístico si !allowMultiplePerMonth: `${monthKey}_${conceptId}`
  monthKey: string; // "YYYY-MM" en zona America/Bogota
  conceptId: string;
  conceptSnapshot: {
    name: string;
    type: 'income' | 'expense';
    group: 'fixed' | 'variable';
  };
  plannedAmount: number; // Monto previsto del mes (COP entero)
  actualAmount: number; // Monto real ejecutado (por defecto igual a plannedAmount al crear/completar)
  status: 'pending' | 'completed';
  completedAt?: string; // ISO date "YYYY-MM-DD" (ej. "2026-10-21")
  note?: string;
  updatedAt: string;
}
```
- **Mejoras clave:**
  1. **ID determinístico `${monthKey}_${conceptId}`** para conceptos únicos por mes: si el usuario abre la app sin conexión en el iPhone y en web al mismo tiempo al iniciar un mes, `ensureMonthPlan("2026-11")` genera exactamente los mismos IDs de documento en Firestore, haciendo imposible crear entradas duplicadas al reconectar.
  2. **`conceptSnapshot` ligero:** Guarda `name`, `type` y `group` al momento del mes para que si meses después se renombra o archiva un concepto, el historial de meses cerrados conserve su fidelidad histórica.
  3. **`plannedAmount` vs `actualAmount` explícitos:** Permite medir tanto el presupuesto original como desviaciones reales en el gráfico "Previsto vs Real por mes".

### 1.3. `Debt` y `DebtPayment` (Módulo Deuda FUNFAMI)
```ts
export interface Debt {
  id: string; // "debt_cb300f_moto" | "debt_esp_ia"
  groupKey: string; // "FUNFAMI"
  name: string; // "CB300F - MOTO" | "ESP. IA"
  lender: string; // "FUNFAMI"
  initialOpeningBalance: number; // Apertura base (4.400.000 y 3.600.000 en 2026-10)
  initialMonthKey: string; // "2026-10"
  suggestedInstallment?: number;
  interestRateMonthlyBps?: number; // opcional si la cuota incluye intereses
  order: number;
}

export interface DebtPayment {
  id: string; // Determinístico: `${entryId}_${debtId}`
  entryId: string; // Referencia a la entrada de Cuota FUNFAMI ("2026-10_exp_cuota_funfami")
  monthKey: string; // "2026-10"
  debtId: string; // "debt_cb300f_moto" | "debt_esp_ia"
  principalAmount: number; // Abono a capital en COP entero
  interestAmount: number; // 0 si no aplica interés separado
  totalApplied: number; // principalAmount + interestAmount
  active: boolean; // Se activa/desactiva atómicamente con el checkbox de la entrada
}
```
- **Mejora clave:** El saldo nunca se edita sumando/restando sobre un campo mutable propenso a condiciones de carrera; **se deriva como función pura**:
  $$\text{SaldoActual}(d, \text{mes}) = d.\text{openingBalance} - \sum_{p \in \text{pagosActivosHasta}(\text{mes})} p.\text{principalAmount}$$
  Y si aún no se ha definido el reparto individual entre `CB300F - MOTO` y `ESP. IA` para una cuota pagada, el agregador de grupo `FUNFAMI` muestra el **Total Deuda del grupo ($6.200.000)** con un indicador de "Reparto pendiente de asignar" o aplica la regla de reparto configurada.

### 1.4. `SavingsBucket` y `MonthCarryOver` (Módulo Ahorros y Moto)
```ts
export interface SavingsBucket {
  id: 'moto' | 'savings';
  name: string; // "Moto" | "Ahorros"
  baseOpeningBalance: number; // En 2026-10: Moto = 1.600.000, Ahorros = 1.000.000
  baseMonthKey: string; // "2026-10"
}
```
- **Mejora clave:** Separamos en el cálculo puro dos métricas complementarias para cada bucket:
  - **`currentBalance` (En vivo / Regla Excel):** `openingBalance + aportesPagados` (para `moto`) y `openingBalance + netCashFlow` (para `savings`, dando `$2.080.000` en octubre 2026).
  - **`projectedBalanceAfterPending` (Proyectado tras pendientes):** Para `savings`, resta los gastos pendientes (`$2.080.000 - $450.000 = $1.630.000`), evitando que el usuario crea que puede gastar dinero comprometido en pagos aún no realizados.

### 1.5. `ProvisionPlan` ("Moto Ideal")
```ts
export interface ProvisionRecurringItem {
  id: string;
  name: string; // ej. "SOAT", "Gasolina", "Impuesto", "Mantenimiento", etc.
  excelRawName: string; // preserva el texto exacto del Excel (ej. "MANTEMIENTO")
  totalCost: number; // Costo del ciclo en COP entero (ej. SOAT anual 800.004 o mensual directo)
  periodMonths: number; // 1 = mensual, 12 = anual
  monthlyProvision: number; // Math.ceil(totalCost / periodMonths) en COP entero
  linkedConceptId?: string; // vínculo opcional con concepto del presupuesto
}

export interface ProvisionTargetGoal {
  id: string; // "goal_kit_arrastre_honda"
  name: string; // "Kit de arrastre Honda original"
  targetAmount: number; // 500.000
  savedAmount: number;
  targetDate?: string; // "YYYY-MM-DD"
  includedInExcelTotal: boolean; // false en el Excel original (explica los $872.667 vs $1.372.667)
}
```

---

## 2. Estructura en Cloud Firestore y Cálculo de Consumo (Plan Spark)

### Colecciones por Usuario
Bajo `users/{uid}/`:
- `concepts/{conceptId}` (~12 documentos)
- `entries/{entryId}` (~12 a 18 documentos por mes; consulta indexada por `where('monthKey', '==', currentMonthKey)`)
- `debts/{debtId}` (2 documentos: `CB300F - MOTO` y `ESP. IA`)
- `debtPayments/{paymentId}` (~2 documentos por mes)
- `savingsBuckets/{bucketId}` (2 documentos)
- `provisionPlans/moto_ideal` (1 documento con los 8 ítems recurrentes + 1 meta puntual)
- `monthSnapshots/{monthKey}` (1 documento resumen por mes cerrado para poblar gráficos anuales con 1 sola lectura por mes)

### Presupuesto de Lecturas y Escrituras vs. Límites de Firebase Spark
- **Límite gratuito del Plan Spark:** `50.000 lecturas/día` y `20.000 escrituras/día`.
- **Consumo real de BFlow (con persistencia offline activada):**
  - **Apertura inicial del mes (frío):** 12 (`concepts`) + 12 (`entries` de oct 2026) + 2 (`debts`) + 2 (`debtPayments`) + 2 (`savingsBuckets`) + 1 (`provisionPlans`) + 12 (`monthSnapshots` de 1 año) = **43 lecturas**.
  - **Aperturas siguientes el mismo día (con caché offline de Firestore):** **0 a 2 lecturas** (solo documentos que hayan cambiado).
  - **Marcar/desmarcar un ítem del checklist:** **1 escritura** en `entries/{id}` (+ **1 o 2 escrituras** en lote `writeBatch` si es la Cuota FUNFAMI que actualiza `debtPayments`).
  - **Total diario estimado de uso intensivo personal:** **< 100 lecturas/día (< 0,2% del límite Spark)** y **< 30 escrituras/día (< 0,15% del límite Spark)**.
  - **Conclusión:** El diseño se mantiene con un margen de seguridad superior al **99,8%** dentro de la capa gratuita de Firebase Spark.
