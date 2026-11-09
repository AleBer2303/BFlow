/**
 * src/domain/overview/monthlyCurve.ts
 *
 * Day-by-day reconstruction of the month's essential figures for the Summary curve.
 * Every series is anchored to the figure the rest of the app already shows, so the
 * curve can never disagree with it: dated movements only decide the shape.
 * Monetary values stay safe integers.
 */

import { assertValidMonthKey } from '../date/monthKey';
import type { DebtSummaryResult } from '../debts/debtCalculator';
import type { Concept, DebtPayment, MonthEntry, MonthlyBudgetSummary } from '../models/types';
import { assertSafeMoneyInteger } from '../money/money';
import type { MonthlySavingsSummary } from '../savings/savingsCalculator';

export type MonthlyCurveMetricId = 'flow' | 'income' | 'expenses' | 'savings' | 'debt';

export const MONTHLY_CURVE_METRIC_IDS: readonly MonthlyCurveMetricId[] = [
  'flow',
  'income',
  'expenses',
  'savings',
  'debt',
];

export interface MonthlyCurveInput {
  monthKey: string;
  /** Today in the app timezone, as "YYYY-MM-DD". */
  todayIso: string;
  entries: readonly MonthEntry[];
  concepts: readonly Concept[];
  debtPayments: readonly DebtPayment[];
  budget: MonthlyBudgetSummary;
  savings: MonthlySavingsSummary;
  debts: Pick<DebtSummaryResult, 'totalRemainingDebt'>;
}

export interface MonthlyCurveSeries {
  id: MonthlyCurveMetricId;
  /** Index 0 is the opening value; index N is the close of day N, up to `cutoffDay`. */
  values: readonly number[];
  /** Value at month end if everything still pending is completed. */
  projectedClose: number;
  scaleMin: number;
  scaleMax: number;
}

export interface MonthlyCurve {
  monthKey: string;
  daysInMonth: number;
  /** Last day with known data: today, or the month's last day once it has ended. */
  cutoffDay: number;
  isCurrentMonth: boolean;
  hasProjection: boolean;
  series: Record<MonthlyCurveMetricId, MonthlyCurveSeries>;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

function getDaysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year as number, month as number, 0)).getUTCDate();
}

function resolveCutoffDay(monthKey: string, todayIso: string, daysInMonth: number): number {
  if (!ISO_DATE_REGEX.test(todayIso)) {
    throw new RangeError(`Invalid todayIso "${todayIso}". Expected format "YYYY-MM-DD".`);
  }

  const currentMonthKey = todayIso.slice(0, 7);
  if (monthKey < currentMonthKey) {
    return daysInMonth;
  }
  // A future month has no history yet, so its curve only holds the opening point.
  return monthKey > currentMonthKey ? 1 : Number(todayIso.slice(8, 10));
}

/**
 * Places a movement on the curve. Movements with no usable date open the month, and
 * none can land after the cutoff, so the last point always holds the current total.
 */
function resolveMovementDay(
  completedAt: string | undefined,
  monthKey: string,
  cutoffDay: number
): number {
  if (!completedAt || !ISO_DATE_REGEX.test(completedAt)) {
    return 1;
  }

  const movementMonthKey = completedAt.slice(0, 7);
  if (movementMonthKey < monthKey) {
    return 1;
  }
  if (movementMonthKey > monthKey) {
    return cutoffDay;
  }
  return Math.min(Math.max(Number(completedAt.slice(8, 10)), 1), cutoffDay);
}

function addDelta(deltas: number[], day: number, amount: number): void {
  deltas[day] = (deltas[day] ?? 0) + amount;
}

function buildSeries(
  id: MonthlyCurveMetricId,
  currentValue: number,
  projectedClose: number,
  deltas: readonly number[],
  cutoffDay: number
): MonthlyCurveSeries {
  assertSafeMoneyInteger(currentValue, id);
  assertSafeMoneyInteger(projectedClose, id);

  const totalDelta = deltas.reduce((sum, delta) => sum + delta, 0);
  const values: number[] = [assertSafeMoneyInteger(currentValue - totalDelta, id)];
  for (let day = 1; day <= cutoffDay; day += 1) {
    values.push(assertSafeMoneyInteger((values[day - 1] as number) + (deltas[day] ?? 0), id));
  }

  const scaleMin = Math.min(0, ...values, projectedClose);
  const scaleMax = Math.max(...values, projectedClose);

  return {
    id,
    values,
    projectedClose,
    scaleMin,
    scaleMax: scaleMax === scaleMin ? scaleMin + 1 : scaleMax,
  };
}

function buildContributionsByEntry(
  savings: MonthlySavingsSummary,
  concepts: ReadonlyMap<string, Concept>,
  completedEntries: readonly MonthEntry[]
): Map<string, number> {
  const contributions = new Map<string, number>();

  for (const contribution of [
    ...savings.reserve.contributingEntries,
    ...savings.customBuckets.flatMap((bucket) => bucket.contributingEntries),
  ]) {
    if (contribution.status === 'completed') {
      contributions.set(contribution.entryId, contribution.amount);
    }
  }

  if (savings.hasSavingsBucket) {
    for (const entry of completedEntries) {
      const concept = concepts.get(entry.conceptId);
      if (concept && !concept.archived && concept.savingsContribution?.bucketId === 'savings') {
        contributions.set(entry.id, entry.actualAmount);
      }
    }
  }
  return contributions;
}

function sumPendingContributions(savings: MonthlySavingsSummary): number {
  return savings.customBuckets.reduce(
    (sum, bucket) => sum + bucket.pendingContributionsThisMonth,
    savings.reserve.pendingContributionsThisMonth
  );
}

function sumPendingDebtInstallments(
  monthEntries: readonly MonthEntry[],
  concepts: ReadonlyMap<string, Concept>
): number {
  return monthEntries.reduce((sum, entry) => {
    const concept = concepts.get(entry.conceptId);
    const isDebtInstallment = Boolean(concept?.linkedDebtGroup || concept?.defaultTargetDebtId);
    return entry.status === 'pending' && isDebtInstallment ? sum + entry.plannedAmount : sum;
  }, 0);
}

export function buildMonthlyCurve(input: MonthlyCurveInput): MonthlyCurve {
  const { monthKey, todayIso, entries, concepts, debtPayments, budget, savings, debts } = input;
  assertValidMonthKey(monthKey);

  const daysInMonth = getDaysInMonth(monthKey);
  const cutoffDay = resolveCutoffDay(monthKey, todayIso, daysInMonth);
  const hasProjection = cutoffDay < daysInMonth;

  const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
  const monthEntries = entries.filter((entry) => entry.monthKey === monthKey);
  const completedEntries = monthEntries.filter((entry) => entry.status === 'completed');
  const completedById = new Map(completedEntries.map((entry) => [entry.id, entry]));
  const contributions = buildContributionsByEntry(savings, conceptsById, completedEntries);

  const incomeDeltas: number[] = [];
  const expenseDeltas: number[] = [];
  const flowDeltas: number[] = [];
  const savingsDeltas: number[] = [];
  const debtDeltas: number[] = [];

  for (const entry of completedEntries) {
    const day = resolveMovementDay(entry.completedAt, monthKey, cutoffDay);
    const signedAmount = entry.type === 'income' ? entry.actualAmount : -entry.actualAmount;

    addDelta(entry.type === 'income' ? incomeDeltas : expenseDeltas, day, entry.actualAmount);
    addDelta(flowDeltas, day, signedAmount);
    addDelta(
      savingsDeltas,
      day,
      (savings.hasSavingsBucket ? signedAmount : 0) + (contributions.get(entry.id) ?? 0)
    );
  }

  for (const payment of debtPayments) {
    const entry = completedById.get(payment.entryId);
    if (payment.monthKey === monthKey && payment.active && entry) {
      const day = resolveMovementDay(entry.completedAt ?? payment.completedAt, monthKey, cutoffDay);
      addDelta(debtDeltas, day, -payment.principalAmount);
    }
  }

  const pendingFlow = budget.pendingIncome - budget.pendingExpenses;
  const pendingSavings =
    (savings.hasSavingsBucket ? pendingFlow : 0) + sumPendingContributions(savings);
  const pendingDebt = sumPendingDebtInstallments(monthEntries, conceptsById);

  const projectionOf = (currentValue: number, pendingChange: number): number =>
    hasProjection ? currentValue + pendingChange : currentValue;

  return {
    monthKey,
    daysInMonth,
    cutoffDay,
    isCurrentMonth: todayIso.slice(0, 7) === monthKey,
    hasProjection,
    series: {
      flow: buildSeries(
        'flow',
        budget.netCashFlow,
        projectionOf(budget.netCashFlow, pendingFlow),
        flowDeltas,
        cutoffDay
      ),
      income: buildSeries(
        'income',
        budget.receivedIncome,
        projectionOf(budget.receivedIncome, budget.pendingIncome),
        incomeDeltas,
        cutoffDay
      ),
      expenses: buildSeries(
        'expenses',
        budget.paidExpenses,
        projectionOf(budget.paidExpenses, budget.pendingExpenses),
        expenseDeltas,
        cutoffDay
      ),
      savings: buildSeries(
        'savings',
        savings.totalCurrentSavings,
        projectionOf(savings.totalCurrentSavings, pendingSavings),
        savingsDeltas,
        cutoffDay
      ),
      debt: buildSeries(
        'debt',
        debts.totalRemainingDebt,
        projectionOf(
          debts.totalRemainingDebt,
          -Math.min(pendingDebt, debts.totalRemainingDebt)
        ),
        debtDeltas,
        cutoffDay
      ),
    },
  };
}
