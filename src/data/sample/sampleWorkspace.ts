/**
 * src/data/sample/sampleWorkspace.ts
 *
 * Neutral example budget for the showcase mode (`EXPO_PUBLIC_BFLOW_DEMO=1`), the in-memory
 * repository and the tests: a salary, a few recurring bills, one loan installment, a reserve
 * fund and a provision plan. It belongs to nobody and is built for any month (ADR 0037).
 */

import {
  addMonthsToMonthKey,
  assertValidMonthKey,
  toAppMonthKey,
} from "../../domain/date/monthKey";
import type {
  Concept,
  Debt,
  DebtPayment,
  MonthEntry,
  ProvisionItemSpec,
  ProvisionPlan,
  SavingsBucket,
} from "../../domain/models/types";

export interface SampleWorkspacePayload {
  monthKey: string;
  concepts: Concept[];
  entries: MonthEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsBuckets: SavingsBucket[];
  provisionPlan: ProvisionPlan;
}

/** Group of the example loans. */
export const SAMPLE_DEBT_GROUP_KEY = "General";

type ConceptRow = Omit<
  Concept,
  "archived" | "recurrence" | "allowMultiplePerMonth"
> &
  Partial<Pick<Concept, "recurrence" | "allowMultiplePerMonth">>;

const CONCEPTS: readonly ConceptRow[] = [
  {
    id: "inc_salary",
    name: "Salario",
    type: "income",
    group: "fixed",
    defaultAmount: 4_000_000,
    order: 1,
  },
  {
    id: "inc_bonus",
    name: "Bonificación",
    type: "income",
    group: "fixed",
    defaultAmount: 2_000_000,
    order: 2,
    recurrence: { kind: "specific_months", months: [6, 12] },
  },
  {
    id: "inc_other",
    name: "Otros ingresos",
    type: "income",
    group: "variable",
    defaultAmount: 0,
    order: 3,
    allowMultiplePerMonth: true,
  },
  {
    id: "exp_reserve_contribution",
    name: "Aporte a reserva",
    type: "expense",
    group: "fixed",
    defaultAmount: 500_000,
    order: 1,
    savingsContribution: { bucketId: "reserve", onlyWhenCompleted: true },
  },
  {
    id: "exp_loan_installment",
    name: "Cuota de préstamo",
    type: "expense",
    group: "fixed",
    defaultAmount: 1_800_000,
    order: 2,
    linkedDebtGroup: SAMPLE_DEBT_GROUP_KEY,
    defaultTargetDebtId: "debt_auto_loan",
  },
  {
    id: "exp_phone_plan",
    name: "Plan de celular",
    type: "expense",
    group: "fixed",
    defaultAmount: 100_000,
    order: 3,
  },
  {
    id: "exp_insurance",
    name: "Seguro",
    type: "expense",
    group: "fixed",
    defaultAmount: 130_000,
    order: 4,
  },
  {
    id: "exp_internet",
    name: "Internet",
    type: "expense",
    group: "fixed",
    defaultAmount: 100_000,
    order: 5,
  },
  {
    id: "exp_parking",
    name: "Parqueadero",
    type: "expense",
    group: "fixed",
    defaultAmount: 120_000,
    order: 6,
  },
  {
    id: "exp_fuel",
    name: "Gasolina",
    type: "expense",
    group: "fixed",
    defaultAmount: 200_000,
    order: 7,
    savingsContribution: { bucketId: "reserve", onlyWhenCompleted: true },
  },
  {
    id: "exp_subscriptions",
    name: "Suscripciones",
    type: "expense",
    group: "fixed",
    defaultAmount: 20_000,
    order: 8,
  },
  {
    id: "exp_credit_card",
    name: "Tarjeta de crédito",
    type: "expense",
    group: "variable",
    defaultAmount: 300_000,
    order: 9,
  },
  {
    id: "exp_gym",
    name: "Gimnasio",
    type: "expense",
    group: "variable",
    defaultAmount: 100_000,
    order: 10,
  },
  {
    id: "exp_other",
    name: "Otro",
    type: "expense",
    group: "variable",
    defaultAmount: 0,
    order: 11,
    allowMultiplePerMonth: true,
  },
];

/** Concepts with a movement this month, and the day it was completed (if it was). */
const MONTH_MOVEMENTS: ReadonlyArray<{
  conceptId: string;
  completedDay?: number;
}> = [
  { conceptId: "inc_salary", completedDay: 21 },
  { conceptId: "inc_bonus" },
  { conceptId: "exp_reserve_contribution", completedDay: 21 },
  { conceptId: "exp_loan_installment", completedDay: 27 },
  { conceptId: "exp_phone_plan" },
  { conceptId: "exp_insurance" },
  { conceptId: "exp_internet" },
  { conceptId: "exp_parking", completedDay: 21 },
  { conceptId: "exp_fuel", completedDay: 21 },
  { conceptId: "exp_subscriptions" },
  { conceptId: "exp_credit_card", completedDay: 21 },
  { conceptId: "exp_gym" },
];

type ProvisionRow = Pick<
  ProvisionItemSpec,
  "id" | "displayName" | "monthlyAmountCop"
> & {
  cycleCostCop: number;
  periodMonths: number;
  linkedConceptId?: string;
  /** `Math.ceil(cycleCost / periodMonths)` when it differs from the rounded monthly amount. */
  ceilMonthlyCop?: number;
};

const RECURRING_PROVISIONS: readonly ProvisionRow[] = [
  {
    id: "prov_insurance",
    displayName: "Seguro anual",
    monthlyAmountCop: 66_667,
    cycleCostCop: 800_000,
    periodMonths: 12,
  },
  {
    id: "prov_fuel",
    displayName: "Gasolina",
    monthlyAmountCop: 200_000,
    cycleCostCop: 200_000,
    periodMonths: 1,
    linkedConceptId: "exp_fuel",
  },
  {
    id: "prov_taxes",
    displayName: "Impuestos",
    monthlyAmountCop: 21_000,
    cycleCostCop: 252_000,
    periodMonths: 12,
  },
  {
    id: "prov_maintenance",
    displayName: "Mantenimiento",
    monthlyAmountCop: 200_000,
    cycleCostCop: 200_000,
    periodMonths: 1,
  },
  {
    id: "prov_parking",
    displayName: "Parqueadero",
    monthlyAmountCop: 210_000,
    cycleCostCop: 210_000,
    periodMonths: 1,
  },
  {
    id: "prov_equipment",
    displayName: "Equipo",
    monthlyAmountCop: 41_667,
    cycleCostCop: 500_000,
    periodMonths: 12,
  },
  {
    id: "prov_service",
    displayName: "Revisión",
    monthlyAmountCop: 50_000,
    cycleCostCop: 50_000,
    periodMonths: 1,
  },
  {
    id: "prov_replacements",
    displayName: "Repuestos",
    monthlyAmountCop: 83_333,
    cycleCostCop: 1_000_000,
    periodMonths: 12,
    ceilMonthlyCop: 83_334,
  },
];

/** The planned purchase is due this many months after the sample month. */
const PURCHASE_GOAL_MONTHS_AHEAD = 10;

function entryId(monthKey: string, conceptId: string): string {
  return `${monthKey}_${conceptId}`;
}

function buildEntries(
  monthKey: string,
  concepts: readonly Concept[],
): MonthEntry[] {
  return MONTH_MOVEMENTS.map(({ conceptId, completedDay }) => {
    const concept = concepts.find((c) => c.id === conceptId);
    if (!concept) throw new Error(`Sample concept ${conceptId} is missing`);
    const completedAt =
      completedDay !== undefined
        ? `${monthKey}-${String(completedDay).padStart(2, "0")}`
        : undefined;
    return {
      id: entryId(monthKey, conceptId),
      monthKey,
      conceptId,
      conceptName: concept.name,
      type: concept.type,
      group: concept.group,
      plannedAmount: concept.defaultAmount,
      actualAmount: concept.defaultAmount,
      status: completedAt ? "completed" : "pending",
      ...(completedAt ? { completedAt } : {}),
    };
  });
}

function buildProvisionPlan(monthKey: string): ProvisionPlan {
  const recurring: ProvisionItemSpec[] = RECURRING_PROVISIONS.map((row) => ({
    ...row,
    ceilMonthlyCop: row.ceilMonthlyCop ?? row.monthlyAmountCop,
    kind: "recurring_provision",
  }));
  const purchaseGoal: ProvisionItemSpec = {
    id: "goal_planned_purchase",
    displayName: "Compra planificada",
    monthlyAmountCop: 500_000,
    targetAmountCop: 500_000,
    targetMonthKey: addMonthsToMonthKey(monthKey, PURCHASE_GOAL_MONTHS_AHEAD),
    kind: "target_goal",
  };
  const recurringMonthlyTotalCop = recurring.reduce(
    (sum, item) => sum + item.monthlyAmountCop,
    0,
  );
  return {
    items: [...recurring, purchaseGoal],
    recurringMonthlyTotalCop,
    totalWithTargetGoalCop:
      recurringMonthlyTotalCop + (purchaseGoal.targetAmountCop ?? 0),
  };
}

/**
 * Month the example starts in: the current one. Tests pin it with `BFLOW_SAMPLE_MONTH_KEY`
 * (`jest.setup.js`) so their figures do not depend on the day they run; builds never set it.
 */
export function resolveSampleMonthKey(): string {
  const pinned = process.env.BFLOW_SAMPLE_MONTH_KEY;
  return pinned && /^\d{4}-(0[1-9]|1[0-2])$/.test(pinned)
    ? pinned
    : toAppMonthKey();
}

/** The example budget, starting in `monthKey` (see `resolveSampleMonthKey`). */
export function buildSampleWorkspace(
  monthKey: string = resolveSampleMonthKey(),
): SampleWorkspacePayload {
  assertValidMonthKey(monthKey);

  const concepts: Concept[] = CONCEPTS.map((row) => ({
    ...row,
    allowMultiplePerMonth: row.allowMultiplePerMonth ?? false,
    recurrence: row.recurrence ?? { kind: "monthly" },
    archived: false,
  }));
  const entries = buildEntries(monthKey, concepts);

  const debts: Debt[] = [
    {
      id: "debt_auto_loan",
      groupKey: SAMPLE_DEBT_GROUP_KEY,
      name: "Crédito de vehículo",
      lender: "Banco",
      openingBalance: 4_400_000,
      monthKey,
    },
    {
      id: "debt_education_loan",
      groupKey: SAMPLE_DEBT_GROUP_KEY,
      name: "Crédito educativo",
      lender: "Banco",
      openingBalance: 3_600_000,
      monthKey,
    },
  ];

  const installmentEntryId = entryId(monthKey, "exp_loan_installment");
  const debtPayments: DebtPayment[] = [
    {
      id: `${installmentEntryId}_debt_auto_loan`,
      entryId: installmentEntryId,
      monthKey,
      debtId: "debt_auto_loan",
      principalAmount: 1_800_000,
      interestAmount: 0,
      totalApplied: 1_800_000,
      completedAt: `${monthKey}-27`,
      active: true,
    },
  ];

  const savingsBuckets: SavingsBucket[] = [
    { id: "reserve", name: "Fondo de reserva", openingBalance: 1_600_000 },
    { id: "savings", name: "Ahorros", openingBalance: 1_000_000 },
  ];

  return {
    monthKey,
    concepts,
    entries,
    debts,
    debtPayments,
    savingsBuckets,
    provisionPlan: buildProvisionPlan(monthKey),
  };
}
