/**
 * src/domain/analytics/chartSeries.ts
 *
 * Data behind the animated charts (Phase 6). Every figure comes from the calculators the
 * rest of the app already uses, so a chart can never disagree with a card:
 * - A closed month reads its frozen `MonthSnapshot` (the balances that rolled over).
 * - An open month is computed live with the same functions as the tabs.
 * The functions only reshape those figures; they add no formula. Money stays in safe
 * integers; shares are plain ratios used to draw, never stored.
 */

import { calculateMonthlyBudgetSummary } from '../budget/budgetCalculator';
import { addMonthsToMonthKey, assertValidMonthKey } from '../date/monthKey';
import { calculateDebtsSummary, type DebtPayoffProjection } from '../debts/debtCalculator';
import type {
  Concept,
  Debt,
  DebtPayment,
  MonthEntry,
  MonthlyBudgetSummary,
  MonthSnapshot,
  SavingsBucket,
} from '../models/types';
import { assertSafeMoneyInteger, sumMoneyIntegers } from '../money/money';
import { calculateMonthlySavingsSummary } from '../savings/savingsCalculator';

/** Months shown by the history charts: half a year fits a 320pt phone with readable bars. */
export const DEFAULT_CHART_HISTORY_MONTHS = 6;

/** Id of the slice that groups every concept beyond the largest ones. */
export const OTHER_SLICE_ID = '__other__';

export interface MonthlyHistoryInput {
  /** Months the account knows about, in any order. */
  monthKeys: readonly string[];
  /** The window ends here, so browsing an old month shows the months that led to it. */
  activeMonthKey: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  debtPayments: readonly DebtPayment[];
  debtsByMonth: Readonly<Record<string, readonly Debt[]>>;
  savingsBucketsByMonth: Readonly<Record<string, readonly SavingsBucket[]>>;
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  maxMonths?: number;
}

export interface MonthlyHistoryPoint {
  monthKey: string;
  isClosed: boolean;
  plannedIncome: number;
  receivedIncome: number;
  plannedExpenses: number;
  paidExpenses: number;
  pendingExpenses: number;
  netCashFlow: number;
  totalDebt: number;
  reserveName: string;
  reserveBalance: number;
  savingsName: string;
  savingsBalance: number;
  /** User-created buckets beyond the reserve and the general savings. */
  otherSavingsBalance: number;
  totalSavings: number;
  /** Paid contributions to the reserve bucket this month (what the ideal provision compares). */
  reserveContribution: number;
}

export interface DistributionSlice {
  id: string;
  label: string;
  amount: number;
  /** 0..1 share of the total. */
  share: number;
}

export interface ExpenseDistribution {
  monthKey: string;
  /** Paid plus pending expenses: what the month costs once the checklist is done. */
  total: number;
  slices: DistributionSlice[];
}

export interface PaidVsPendingSplit {
  paid: number;
  pending: number;
  total: number;
  /** 0..1 share already paid; 0 when there is nothing to pay. */
  paidShare: number;
}

export type ComparisonMetricId = 'receivedIncome' | 'paidExpenses' | 'netCashFlow';

export interface MonthComparisonRow {
  id: ComparisonMetricId;
  label: string;
  previous: number;
  current: number;
  delta: number;
}

export interface MonthComparison {
  previousMonthKey: string;
  currentMonthKey: string;
  rows: MonthComparisonRow[];
}

export interface DebtTrajectoryPoint {
  monthKey: string;
  balance: number;
  isProjected: boolean;
}

export interface DebtTrajectory {
  points: DebtTrajectoryPoint[];
  /** Months from the active month to the estimated payoff, or null when it cannot be projected. */
  remainingMonths: number | null;
  estimatedPayoffMonthKey: string | null;
}

const RESERVE_BUCKET_IDS = new Set(['reserve', 'moto']);
/** Same defaults as the savings calculator, so a snapshot and a live month read alike. */
const DEFAULT_RESERVE_NAME = 'Fondo de Reserva';
const DEFAULT_SAVINGS_NAME = 'Ahorros';

/** Sorted, de-duplicated months up to `activeMonthKey`, keeping the last `maxMonths`. */
export function resolveHistoryWindow(
  monthKeys: readonly string[],
  activeMonthKey: string,
  maxMonths = DEFAULT_CHART_HISTORY_MONTHS
): string[] {
  assertValidMonthKey(activeMonthKey);
  if (!Number.isSafeInteger(maxMonths) || maxMonths < 1) {
    throw new RangeError(`maxMonths must be a positive integer, got ${maxMonths}.`);
  }

  const months = new Set<string>([activeMonthKey]);
  for (const monthKey of monthKeys) {
    assertValidMonthKey(monthKey);
    if (monthKey <= activeMonthKey) {
      months.add(monthKey);
    }
  }
  return [...months].sort().slice(-maxMonths);
}

function bucketName(
  buckets: readonly SavingsBucket[],
  predicate: (bucket: SavingsBucket) => boolean,
  fallback: string
): string {
  const name = buckets.find(predicate)?.name.trim();
  return name ? name : fallback;
}

function buildPointFromSnapshot(
  snapshot: MonthSnapshot,
  buckets: readonly SavingsBucket[],
  reserveContribution: number
): MonthlyHistoryPoint {
  const { budget, closingSavings } = snapshot;
  const reserveBalance = closingSavings.reserveClosingBalance ?? closingSavings.motoClosingBalance;
  const savingsBalance = closingSavings.savingsClosingBalance;
  return {
    monthKey: snapshot.monthKey,
    isClosed: true,
    plannedIncome: budget.plannedIncome,
    receivedIncome: budget.receivedIncome,
    plannedExpenses: budget.plannedExpenses,
    paidExpenses: budget.paidExpenses,
    pendingExpenses: budget.pendingExpenses,
    netCashFlow: budget.netCashFlow,
    totalDebt: snapshot.totalClosingDebt,
    reserveName: bucketName(buckets, (b) => RESERVE_BUCKET_IDS.has(b.id), DEFAULT_RESERVE_NAME),
    reserveBalance,
    savingsName: bucketName(buckets, (b) => b.id === 'savings', DEFAULT_SAVINGS_NAME),
    savingsBalance,
    otherSavingsBalance: Math.max(
      0,
      closingSavings.totalClosingSavings - reserveBalance - savingsBalance
    ),
    totalSavings: closingSavings.totalClosingSavings,
    reserveContribution,
  };
}

/**
 * One point per month of the window, oldest first. Closed months read their snapshot;
 * open months are computed exactly like the tabs compute the active month.
 */
export function buildMonthlyHistory(input: MonthlyHistoryInput): MonthlyHistoryPoint[] {
  const window = resolveHistoryWindow(input.monthKeys, input.activeMonthKey, input.maxMonths);

  return window.map((monthKey) => {
    const buckets = input.savingsBucketsByMonth[monthKey] ?? [];
    const budget = calculateMonthlyBudgetSummary(input.entries, monthKey);
    // Contributions are not frozen in the snapshot; the month's entries still hold them.
    const savings = calculateMonthlySavingsSummary(
      buckets,
      input.concepts,
      input.entries,
      budget,
      monthKey
    );
    const reserveContribution = savings.reserve.paidContributionsThisMonth;

    const snapshot = input.closedSnapshots[monthKey];
    if (snapshot) {
      return buildPointFromSnapshot(snapshot, buckets, reserveContribution);
    }

    const debts = calculateDebtsSummary(
      input.debtsByMonth[monthKey] ?? [],
      input.entries,
      monthKey,
      input.debtPayments
    );
    const reserveBalance = savings.reserve.currentBalance;
    const savingsBalance = savings.savings.currentBalance;

    return {
      monthKey,
      isClosed: false,
      plannedIncome: budget.plannedIncome,
      receivedIncome: budget.receivedIncome,
      plannedExpenses: budget.plannedExpenses,
      paidExpenses: budget.paidExpenses,
      pendingExpenses: budget.pendingExpenses,
      netCashFlow: budget.netCashFlow,
      totalDebt: debts.totalRemainingDebt,
      reserveName: savings.reserve.name || DEFAULT_RESERVE_NAME,
      reserveBalance,
      savingsName: savings.savings.name || DEFAULT_SAVINGS_NAME,
      savingsBalance,
      otherSavingsBalance: sumMoneyIntegers(
        savings.customBuckets.map((bucket) => bucket.currentBalance)
      ),
      totalSavings: savings.totalCurrentSavings,
      reserveContribution,
    };
  });
}

function toShare(amount: number, total: number): number {
  return total > 0 ? amount / total : 0;
}

/**
 * Expenses of the month grouped by concept: paid entries count their actual amount,
 * pending ones their planned amount. The largest `maxSlices` keep their own slice and the
 * rest are grouped into "Otros", so the slices always add up to the total exactly.
 */
export function buildExpenseDistribution(
  entries: readonly MonthEntry[],
  monthKey: string,
  maxSlices = 5
): ExpenseDistribution {
  assertValidMonthKey(monthKey);
  if (!Number.isSafeInteger(maxSlices) || maxSlices < 1) {
    throw new RangeError(`maxSlices must be a positive integer, got ${maxSlices}.`);
  }

  const byConcept = new Map<string, { label: string; amount: number }>();
  for (const entry of entries) {
    if (entry.monthKey !== monthKey || entry.type !== 'expense') {
      continue;
    }
    const amount = assertSafeMoneyInteger(
      entry.status === 'completed' ? entry.actualAmount : entry.plannedAmount,
      'expense amount'
    );
    const current = byConcept.get(entry.conceptId);
    byConcept.set(entry.conceptId, {
      label: current?.label ?? entry.conceptName,
      amount: (current?.amount ?? 0) + amount,
    });
  }

  const ranked = [...byConcept.entries()]
    .map(([id, value]) => ({ id, ...value }))
    .filter((slice) => slice.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

  const total = sumMoneyIntegers(ranked.map((slice) => slice.amount));
  // A lone leftover concept keeps its own name instead of becoming "Otros".
  const ownSlices = ranked.length > maxSlices + 1 ? ranked.slice(0, maxSlices) : ranked;
  const rest = ranked.slice(ownSlices.length);

  const slices: DistributionSlice[] = ownSlices.map((slice) => ({
    ...slice,
    share: toShare(slice.amount, total),
  }));
  if (rest.length > 0) {
    const amount = sumMoneyIntegers(rest.map((slice) => slice.amount));
    slices.push({ id: OTHER_SLICE_ID, label: 'Otros', amount, share: toShare(amount, total) });
  }

  return { monthKey, total, slices };
}

/** Paid against still-pending expenses of the month (Excel B4 and B5). */
export function buildPaidVsPendingSplit(
  budget: Pick<MonthlyBudgetSummary, 'paidExpenses' | 'pendingExpenses'>
): PaidVsPendingSplit {
  const paid = assertSafeMoneyInteger(budget.paidExpenses, 'paidExpenses');
  const pending = assertSafeMoneyInteger(budget.pendingExpenses, 'pendingExpenses');
  const total = paid + pending;
  return { paid, pending, total, paidShare: toShare(paid, total) };
}

const COMPARISON_LABELS: Record<ComparisonMetricId, string> = {
  receivedIncome: 'Ingresos recibidos',
  paidExpenses: 'Gastos pagados',
  netCashFlow: 'Flujo neto',
};

/**
 * The last month of the history against the month before it.
 * @returns null when the history holds a single month.
 */
export function buildMonthComparison(
  history: readonly MonthlyHistoryPoint[]
): MonthComparison | null {
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  if (!current || !previous) {
    return null;
  }

  const ids: readonly ComparisonMetricId[] = ['receivedIncome', 'paidExpenses', 'netCashFlow'];
  return {
    previousMonthKey: previous.monthKey,
    currentMonthKey: current.monthKey,
    rows: ids.map((id) => ({
      id,
      label: COMPARISON_LABELS[id],
      previous: previous[id],
      current: current[id],
      delta: current[id] - previous[id],
    })),
  };
}

/**
 * Debt balance month by month, plus the estimated payoff month as a projected point at
 * zero. The projection is the one the Debts tab states (`projectDebtPayoff`).
 */
export function buildDebtTrajectory(
  history: readonly MonthlyHistoryPoint[],
  projection: DebtPayoffProjection
): DebtTrajectory {
  const points: DebtTrajectoryPoint[] = history.map((point) => ({
    monthKey: point.monthKey,
    balance: point.totalDebt,
    isProjected: false,
  }));
  const last = points[points.length - 1];
  const canProject =
    last !== undefined &&
    last.balance > 0 &&
    projection.estimatedPayoffMonthKey !== null &&
    Number.isFinite(projection.remainingMonths) &&
    projection.remainingMonths > 0;

  if (!canProject) {
    return {
      points,
      remainingMonths: last && last.balance <= 0 ? 0 : null,
      estimatedPayoffMonthKey: last && last.balance <= 0 ? last.monthKey : null,
    };
  }

  // The window ends at the active month, which is where the projection starts counting.
  const payoffMonthKey = addMonthsToMonthKey(last.monthKey, projection.remainingMonths);
  points.push({ monthKey: payoffMonthKey, balance: 0, isProjected: true });
  return {
    points,
    remainingMonths: projection.remainingMonths,
    estimatedPayoffMonthKey: payoffMonthKey,
  };
}
