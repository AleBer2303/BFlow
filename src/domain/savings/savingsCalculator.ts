/**
 * src/domain/savings/savingsCalculator.ts
 *
 * Universal pure savings and reserve buckets calculator:
 * - Primary reserve bucket: `openingBalance + paid contributions from linked concepts`.
 * - General savings bucket:
 *   - `currentBalance` (Live cash box = `openingBalance + netCashFlow + directSavingsContributions`)
 *   - `projectedAfterPendingExpenses` (`currentBalance - pendingExpenses`)
 *   - `projectedEndOfMonth` (`openingBalance + projectedNetFlow + directSavingsContributions`)
 * - Custom user-defined savings buckets with linked contributions.
 * - Total Savings: sum of all active bucket balances.
 */

import { assertValidMonthKey } from '../date/monthKey';
import {
  Concept,
  MonthEntry,
  MonthlyBudgetSummary,
  SavingsBucket,
} from '../models/types';
import { sumMoneyIntegers } from '../money/money';

export interface ReserveBucketSummary {
  bucketId: string;
  name: string;
  openingBalance: number;
  paidContributionsThisMonth: number;
  pendingContributionsThisMonth: number;
  currentBalance: number;
  projectedBalanceIfAllPaid: number;
  contributingEntries: ReadonlyArray<{
    entryId: string;
    conceptId: string;
    conceptName: string;
    amount: number;
    status: 'pending' | 'completed';
  }>;
}

/** @deprecated use ReserveBucketSummary */
export type MotoBucketSummary = ReserveBucketSummary;

export interface GeneralSavingsBucketSummary {
  bucketId: 'savings';
  name: string;
  openingBalance: number;
  netCashFlowContribution: number;
  currentBalance: number;
  projectedAfterPendingExpenses: number;
  projectedFullMonthBalance: number;
}

export interface CustomSavingsBucketSummary {
  id: string;
  bucketId: string;
  name: string;
  openingBalance: number;
  paidContributionsThisMonth: number;
  pendingContributionsThisMonth: number;
  currentBalance: number;
  projectedBalanceIfAllPaid: number;
  contributingEntries: ReadonlyArray<{
    entryId: string;
    conceptId: string;
    conceptName: string;
    amount: number;
    status: 'pending' | 'completed';
  }>;
}

export interface MonthlySavingsSummary {
  monthKey: string;
  hasReserveBucket: boolean;
  hasMotoBucket: boolean;
  reserve: ReserveBucketSummary;
  /** @deprecated use reserve */
  moto: ReserveBucketSummary;
  hasSavingsBucket: boolean;
  savings: GeneralSavingsBucketSummary;
  customBuckets: CustomSavingsBucketSummary[];
  totalCurrentSavings: number;
  totalProjectedAfterPendingExpenses: number;
}

export function calculateMonthlySavingsSummary(
  buckets: readonly SavingsBucket[],
  concepts: readonly Concept[],
  entries: readonly MonthEntry[],
  budgetSummary: MonthlyBudgetSummary,
  monthKey: string
): MonthlySavingsSummary {
  assertValidMonthKey(monthKey);

  const reserveBucket = buckets.find((b) => b.id === 'reserve' || b.id === 'moto');
  const savingsBucket = buckets.find((b) => b.id === 'savings');
  const hasReserveBucket = Boolean(reserveBucket);
  const hasSavingsBucket = Boolean(savingsBucket);

  const reserveBucketId = reserveBucket?.id ?? 'reserve';
  const reserveConceptIds = new Set(
    concepts
      .filter(
        (c) =>
          !c.archived &&
          (c.savingsContribution?.bucketId === reserveBucketId ||
            (reserveBucketId === 'moto' && c.savingsContribution?.bucketId === 'reserve') ||
            (reserveBucketId === 'reserve' && c.savingsContribution?.bucketId === 'moto'))
      )
      .map((c) => c.id)
  );

  const monthEntries = entries.filter((e) => e.monthKey === monthKey);
  const reserveEntries = hasReserveBucket
    ? monthEntries.filter((e) => reserveConceptIds.has(e.conceptId))
    : [];

  const paidContributionsThisMonth = hasReserveBucket
    ? sumMoneyIntegers(
        reserveEntries.filter((e) => e.status === 'completed').map((e) => e.actualAmount)
      )
    : 0;
  const pendingContributionsThisMonth = hasReserveBucket
    ? sumMoneyIntegers(
        reserveEntries.filter((e) => e.status === 'pending').map((e) => e.plannedAmount)
      )
    : 0;

  const reserveOpening = reserveBucket?.openingBalance ?? 0;
  const reserveCurrentBalance = hasReserveBucket ? reserveOpening + paidContributionsThisMonth : 0;
  const reserveProjectedBalanceIfAllPaid = hasReserveBucket
    ? reserveCurrentBalance + pendingContributionsThisMonth
    : 0;

  // Also include any explicit expense contributions linked directly to the 'savings' bucket
  const directSavingsConceptIds = new Set(
    concepts
      .filter((c) => !c.archived && c.savingsContribution?.bucketId === 'savings')
      .map((c) => c.id)
  );
  const directSavingsPaid = hasSavingsBucket
    ? sumMoneyIntegers(
        monthEntries
          .filter((e) => directSavingsConceptIds.has(e.conceptId) && e.status === 'completed')
          .map((e) => e.actualAmount)
      )
    : 0;

  const savingsOpening = savingsBucket?.openingBalance ?? 0;
  const savingsCurrentBalance = hasSavingsBucket
    ? savingsOpening + budgetSummary.netCashFlow + directSavingsPaid
    : 0;
  const savingsProjectedAfterPendingExpenses = hasSavingsBucket
    ? savingsCurrentBalance - budgetSummary.pendingExpenses
    : 0;
  const savingsProjectedFullMonthBalance = hasSavingsBucket
    ? savingsOpening + budgetSummary.projectedNetFlow + directSavingsPaid
    : 0;

  const extraBuckets = buckets.filter(
    (b) => b.id !== reserveBucketId && b.id !== 'moto' && b.id !== 'savings'
  );
  const customBuckets: CustomSavingsBucketSummary[] = extraBuckets.map((cb) => {
    const linkedConceptIds = new Set(
      concepts
        .filter((c) => !c.archived && c.savingsContribution?.bucketId === cb.id)
        .map((c) => c.id)
    );
    const cbEntries = monthEntries.filter((e) => linkedConceptIds.has(e.conceptId));
    const cbPaid = sumMoneyIntegers(
      cbEntries.filter((e) => e.status === 'completed').map((e) => e.actualAmount)
    );
    const cbPending = sumMoneyIntegers(
      cbEntries.filter((e) => e.status === 'pending').map((e) => e.plannedAmount)
    );
    const cbCurrentBalance = cb.openingBalance + cbPaid;

    return {
      id: cb.id,
      bucketId: cb.id,
      name: cb.name,
      openingBalance: cb.openingBalance,
      paidContributionsThisMonth: cbPaid,
      pendingContributionsThisMonth: cbPending,
      currentBalance: cbCurrentBalance,
      projectedBalanceIfAllPaid: cbCurrentBalance + cbPending,
      contributingEntries: cbEntries.map((e) => ({
        entryId: e.id,
        conceptId: e.conceptId,
        conceptName: e.conceptName,
        amount: e.status === 'completed' ? e.actualAmount : e.plannedAmount,
        status: e.status,
      })),
    };
  });

  const customBucketsTotal = sumMoneyIntegers(customBuckets.map((cb) => cb.currentBalance));
  const customBucketsProjectedTotal = sumMoneyIntegers(
    customBuckets.map((cb) => cb.projectedBalanceIfAllPaid)
  );

  const totalCurrentSavings = reserveCurrentBalance + savingsCurrentBalance + customBucketsTotal;
  const totalProjectedAfterPendingExpenses =
    reserveProjectedBalanceIfAllPaid +
    savingsProjectedAfterPendingExpenses +
    customBucketsProjectedTotal;

  const reserveSummary: ReserveBucketSummary = {
    bucketId: reserveBucketId,
    name: reserveBucket?.name ?? 'Fondo de Reserva',
    openingBalance: reserveOpening,
    paidContributionsThisMonth,
    pendingContributionsThisMonth,
    currentBalance: reserveCurrentBalance,
    projectedBalanceIfAllPaid: reserveProjectedBalanceIfAllPaid,
    contributingEntries: reserveEntries.map((e) => ({
      entryId: e.id,
      conceptId: e.conceptId,
      conceptName: e.conceptName,
      amount: e.status === 'completed' ? e.actualAmount : e.plannedAmount,
      status: e.status,
    })),
  };

  return {
    monthKey,
    hasReserveBucket,
    hasMotoBucket: hasReserveBucket,
    reserve: reserveSummary,
    moto: reserveSummary,
    hasSavingsBucket,
    savings: {
      bucketId: 'savings',
      name: savingsBucket?.name ?? 'Ahorros',
      openingBalance: savingsOpening,
      netCashFlowContribution: budgetSummary.netCashFlow,
      currentBalance: savingsCurrentBalance,
      projectedAfterPendingExpenses: savingsProjectedAfterPendingExpenses,
      projectedFullMonthBalance: savingsProjectedFullMonthBalance,
    },
    customBuckets,
    totalCurrentSavings,
    totalProjectedAfterPendingExpenses,
  };
}
