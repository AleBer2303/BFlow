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
  openingBalance: number;
  netCashFlowContribution: number;
  currentBalance: number;
  projectedAfterPendingExpenses: number;
  projectedFullMonthBalance: number;
}

export interface MonthlySavingsSummary {
  monthKey: string;
  moto: MotoBucketSummary;
  savings: GeneralSavingsBucketSummary;
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

  if (!motoBucket || !savingsBucket) {
    throw new Error('Both "moto" and "savings" buckets are required to calculate savings summary.');
  }

  const motoConceptIds = new Set(
    concepts
      .filter((c) => !c.archived && c.savingsContribution?.bucketId === 'moto')
      .map((c) => c.id)
  );

  const monthEntries = entries.filter((e) => e.monthKey === monthKey);
  const motoEntries = monthEntries.filter((e) => motoConceptIds.has(e.conceptId));

  const paidContributionsThisMonth = sumMoneyIntegers(
    motoEntries.filter((e) => e.status === 'completed').map((e) => e.actualAmount)
  );
  const pendingContributionsThisMonth = sumMoneyIntegers(
    motoEntries.filter((e) => e.status === 'pending').map((e) => e.plannedAmount)
  );

  const motoCurrentBalance = motoBucket.openingBalance + paidContributionsThisMonth;
  const motoProjectedBalanceIfAllPaid =
    motoCurrentBalance + pendingContributionsThisMonth;

  const savingsCurrentBalance = savingsBucket.openingBalance + budgetSummary.netCashFlow;
  const savingsProjectedAfterPendingExpenses =
    savingsCurrentBalance - budgetSummary.pendingExpenses;
  const savingsProjectedFullMonthBalance =
    savingsBucket.openingBalance + budgetSummary.projectedNetFlow;

  const totalCurrentSavings = motoCurrentBalance + savingsCurrentBalance;
  const totalProjectedAfterPendingExpenses =
    motoCurrentBalance + savingsProjectedAfterPendingExpenses;

  return {
    monthKey,
    moto: {
      bucketId: 'moto',
      openingBalance: motoBucket.openingBalance,
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
      openingBalance: savingsBucket.openingBalance,
      netCashFlowContribution: budgetSummary.netCashFlow,
      currentBalance: savingsCurrentBalance,
      projectedAfterPendingExpenses: savingsProjectedAfterPendingExpenses,
      projectedFullMonthBalance: savingsProjectedFullMonthBalance,
    },
    totalCurrentSavings,
    totalProjectedAfterPendingExpenses,
  };
}
