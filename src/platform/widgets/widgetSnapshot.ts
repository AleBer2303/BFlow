import { z } from 'zod';

import {
  calculateChecklistProgress,
  calculateDebtsSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  Concept,
  Debt,
  DebtPayment,
  isValidMonthKey,
  MonthEntry,
  SavingsBucket,
} from '../../domain';

export const WIDGET_STORAGE_KEY = 'bflow_widget_snapshot_v1';

export interface WidgetPendingItemV1 {
  id: string;
  name: string;
  amountCop: number;
  type: 'income' | 'expense';
}

export interface WidgetSnapshotV1 {
  schemaVersion: 1;
  updatedAtIso: string;
  monthKey: string;
  netCashFlowCop: number;
  receivedIncomeCop: number;
  paidExpensesCop: number;
  pendingExpensesCop: number;
  checklistCompleted: number;
  checklistTotal: number;
  totalDebtCop: number;
  openingDebtCop: number;
  motoSavingsCop: number;
  generalSavingsCop: number;
  totalSavingsCop: number;
  topPendingItems: WidgetPendingItemV1[];
}

const safeIntegerSchema = z
  .number()
  .int()
  .refine((val) => Number.isSafeInteger(val), {
    message: 'Amount must be a safe integer (no decimals or floats)',
  });

const nonNegativeIntegerSchema = safeIntegerSchema.refine((val) => val >= 0, {
  message: 'Amount must be a non-negative safe integer',
});

export const widgetPendingItemV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amountCop: nonNegativeIntegerSchema,
  type: z.enum(['income', 'expense']),
});

export const widgetSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1),
  updatedAtIso: z.string().min(1),
  monthKey: z.string().refine((val) => isValidMonthKey(val), {
    message: 'Invalid monthKey format (expected YYYY-MM)',
  }),
  netCashFlowCop: safeIntegerSchema,
  receivedIncomeCop: nonNegativeIntegerSchema,
  paidExpensesCop: nonNegativeIntegerSchema,
  pendingExpensesCop: nonNegativeIntegerSchema,
  checklistCompleted: z.number().int().min(0),
  checklistTotal: z.number().int().min(0),
  totalDebtCop: nonNegativeIntegerSchema,
  openingDebtCop: nonNegativeIntegerSchema,
  motoSavingsCop: safeIntegerSchema,
  generalSavingsCop: safeIntegerSchema,
  totalSavingsCop: safeIntegerSchema,
  topPendingItems: z.array(widgetPendingItemV1Schema).max(6),
});

export interface BuildWidgetSnapshotInput {
  monthKey: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  debts: readonly Debt[];
  debtPayments?: readonly DebtPayment[];
  savingsBuckets: readonly SavingsBucket[];
  updatedAtIso?: string;
}

/**
 * Resolves the dynamic App Group identifier from the main or extension bundle identifier
 * (`group.<main_bundle_id>`) so sideloaders (`iloader`) that append team suffixes
 * (e.g. `com.bflow.app.TEAM123` or `com.bflow.app.TEAM123.widgets`) resolve to the
 * shared container cleanly.
 */
export function resolveDynamicAppGroupId(bundleIdentifier = 'com.bflow.app'): string {
  const trimmed = bundleIdentifier.trim() || 'com.bflow.app';
  const mainBundleId = trimmed.replace(/\.widgets$/i, '');
  return `group.${mainBundleId}`;
}

/**
 * Pure builder creating the normalized WidgetSnapshotV1 payload to be serialized
 * into the App Group container and read by iOS WidgetKit extensions.
 */
export function buildWidgetSnapshotV1(input: BuildWidgetSnapshotInput): WidgetSnapshotV1 {
  const budget = calculateMonthlyBudgetSummary(input.entries, input.monthKey);
  const checklist = calculateChecklistProgress(input.concepts, input.entries, input.monthKey);
  const debtSummary = calculateDebtsSummary(
    input.debts,
    input.entries,
    input.monthKey,
    input.debtPayments
  );
  const savings = calculateMonthlySavingsSummary(
    input.savingsBuckets,
    input.concepts,
    input.entries,
    budget,
    input.monthKey
  );

  const monthEntries = input.entries.filter((entry) => entry.monthKey === input.monthKey);
  const topPendingItems: WidgetPendingItemV1[] = monthEntries
    .filter((entry) => entry.status === 'pending')
    .sort((a, b) => b.plannedAmount - a.plannedAmount)
    .slice(0, 6)
    .map((entry) => ({
      id: entry.id,
      name: entry.conceptName,
      amountCop: entry.plannedAmount,
      type: entry.type,
    }));

  const snapshot: WidgetSnapshotV1 = {
    schemaVersion: 1,
    updatedAtIso: input.updatedAtIso ?? new Date().toISOString(),
    monthKey: input.monthKey,
    netCashFlowCop: budget.netCashFlow,
    receivedIncomeCop: budget.receivedIncome,
    paidExpensesCop: budget.paidExpenses,
    pendingExpensesCop: budget.pendingExpenses,
    checklistCompleted: checklist.completedCount,
    checklistTotal: checklist.totalTrackableCount,
    totalDebtCop: debtSummary.totalRemainingDebt,
    openingDebtCop: debtSummary.openingTotalDebt,
    motoSavingsCop: savings.reserve.currentBalance,
    generalSavingsCop: savings.savings.currentBalance,
    totalSavingsCop: savings.totalCurrentSavings,
    topPendingItems,
  };

  return widgetSnapshotV1Schema.parse(snapshot);
}
