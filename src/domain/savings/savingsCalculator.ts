/**
 * src/domain/savings/savingsCalculator.ts
 *
 * Pure Savings & Moto calculator (Resolving Inconsistencies #4 and #5):
 * - Moto bucket (`K4` in Excel): `openingBalance (1_600_000) + paid contributions from linked concepts`
 *   (`CB300F 500_000 + Gasolina 200_000 = 2_300_000`). Only counts entries with `status === 'completed'`.
 * - Savings bucket (`K5` in Excel):
 *   - `currentBalance` (Live cash box = `openingBalance + netCashFlow` = `1_000_000 + 1_080_000 = 2_080_000`)
 *   - `projectedAfterPendingExpenses` (`currentBalance - pendingExpenses` = `2_080_000 - 450_000 = 1_630_000`)
 *   - `projectedEndOfMonth` (`openingBalance + projectedNetFlow` = `1_000_000 + 2_630_000 = 3_630_000`)
 * - Total Savings (`K6` in Excel): `moto.currentBalance + savings.currentBalance = 4_380_000`.
 */

import { assertValidMonthKey } from '../date/monthKey';
import {
  Concept,
  MonthEntry,
  MonthlyBudgetSummary,
  SavingsBucket,
} from '../models/types';
import { sumMoneyIntegers } from '../money/money';

export interface MotoBucketSummary {
  bucketId: 'moto';
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
  hasMotoBucket: boolean;
  hasSavingsBucket: boolean;
  moto: MotoBucketSummary;
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

  const motoBucket = buckets.find((b) => b.id === 'moto');
  const savingsBucket = buckets.find((b) => b.id === 'savings');
  const hasMotoBucket = Boolean(motoBucket);
  const hasSavingsBucket = Boolean(savingsBucket);

  const motoConceptIds = new Set(
    concepts
      .filter((c) => !c.archived && c.savingsContribution?.bucketId === 'moto')
      .map((c) => c.id)
  );

  const monthEntries = entries.filter((e) => e.monthKey === monthKey);
  const motoEntries = hasMotoBucket
    ? monthEntries.filter((e) => motoConceptIds.has(e.conceptId))
    : [];

  const paidContributionsThisMonth = hasMotoBucket
    ? sumMoneyIntegers(
        motoEntries.filter((e) => e.status === 'completed').map((e) => e.actualAmount)
      )
    : 0;
  const pendingContributionsThisMonth = hasMotoBucket
    ? sumMoneyIntegers(
        motoEntries.filter((e) => e.status === 'pending').map((e) => e.plannedAmount)
      )
    : 0;

  const motoOpening = motoBucket?.openingBalance ?? 0;
  const motoCurrentBalance = hasMotoBucket ? motoOpening + paidContributionsThisMonth : 0;
  const motoProjectedBalanceIfAllPaid = hasMotoBucket
    ? motoCurrentBalance + pendingContributionsThisMonth
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

  const extraBuckets = buckets.filter((b) => b.id !== 'moto' && b.id !== 'savings');
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
    const cbCurrent = cb.openingBalance + cbPaid;
    return {
      id: cb.id,
      bucketId: cb.id,
      name: cb.name,
      openingBalance: cb.openingBalance,
      paidContributionsThisMonth: cbPaid,
      pendingContributionsThisMonth: cbPending,
      currentBalance: cbCurrent,
      projectedBalanceIfAllPaid: cbCurrent + cbPending,
      contributingEntries: cbEntries.map((e) => ({
        entryId: e.id,
        conceptId: e.conceptId,
        conceptName: e.conceptName,
        amount: e.status === 'completed' ? e.actualAmount : e.plannedAmount,
        status: e.status,
      })),
    };
  });

  const customBucketsCurrentTotal = sumMoneyIntegers(
    customBuckets.map((cb) => cb.currentBalance)
  );

  const totalCurrentSavings =
    motoCurrentBalance + savingsCurrentBalance + customBucketsCurrentTotal;
  const totalProjectedAfterPendingExpenses =
    motoCurrentBalance + savingsProjectedAfterPendingExpenses + customBucketsCurrentTotal;

  return {
    monthKey,
    hasMotoBucket,
    hasSavingsBucket,
    moto: {
      bucketId: 'moto',
      name: motoBucket?.name ?? 'Fondo Moto',
      openingBalance: motoOpening,
      paidContributionsThisMonth,
      pendingContributionsThisMonth,
      currentBalance: motoCurrentBalance,
      projectedBalanceIfAllPaid: motoProjectedBalanceIfAllPaid,
      contributingEntries: motoEntries.map((e) => ({
        entryId: e.id,
        conceptId: e.conceptId,
        conceptName: e.conceptName,
        amount: e.status === 'completed' ? e.actualAmount : e.plannedAmount,
        status: e.status,
      })),
    },
    savings: {
      bucketId: 'savings',
      name: savingsBucket?.name ?? 'Fondo Ahorros',
      openingBalance: savingsOpening,
      netCashFlowContribution: hasSavingsBucket ? budgetSummary.netCashFlow : 0,
      currentBalance: savingsCurrentBalance,
      projectedAfterPendingExpenses: savingsProjectedAfterPendingExpenses,
      projectedFullMonthBalance: savingsProjectedFullMonthBalance,
    },
    customBuckets,
    totalCurrentSavings,
    totalProjectedAfterPendingExpenses,
  };
}
