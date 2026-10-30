/**
 * src/domain/month-close/monthClose.ts
 *
 * Pure month-close and automatic balance carry-over calculator (Resolving Inconsistency #6):
 * - Freezes a `MonthSnapshot` for `closingMonthKey` (`2026-10`).
 * - Automatically carries over closing debt balances (`CB300F - MOTO: 2_600_000`, `ESP. IA: 3_600_000`)
 *   as the `openingBalance` of `nextMonthKey` (`2026-11`).
 * - Automatically carries over closing savings balances (`Moto: 2_300_000`, `Ahorros: 2_080_000`)
 *   as the `openingBalance` of `nextMonthKey` (`2026-11`).
 * - Idempotently generates the `pending` checklist entries for `nextMonthKey` via `ensureMonthPlan`.
 */

import { calculateMonthlyBudgetSummary } from '../budget/budgetCalculator';
import { calculateChecklistProgress, ensureMonthPlan } from '../checklist/checklist';
import { addMonthsToMonthKey, assertValidMonthKey } from '../date/monthKey';
import { calculateFunfamiDebtSummary } from '../debts/debtCalculator';
import {
  Concept,
  Debt,
  DebtPayment,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../models/types';
import { calculateMonthlySavingsSummary } from '../savings/savingsCalculator';

export interface CloseMonthInput {
  closingMonthKey: string;
  closedAtIso: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  debts: readonly Debt[];
  debtPayments?: readonly DebtPayment[];
  savingsBuckets: readonly SavingsBucket[];
}

export interface CloseMonthResult {
  snapshot: MonthSnapshot;
  nextMonthKey: string;
  nextMonthDebts: Debt[];
  nextMonthSavingsBuckets: SavingsBucket[];
  nextMonthEntries: MonthEntry[];
}

export function closeMonthAndRollover(input: CloseMonthInput): CloseMonthResult {
  assertValidMonthKey(input.closingMonthKey);

  const budget = calculateMonthlyBudgetSummary(input.entries, input.closingMonthKey);
  const checklist = calculateChecklistProgress(
    input.concepts,
    input.entries,
    input.closingMonthKey
  );
  const debtSummary = calculateFunfamiDebtSummary(
    input.debts,
    input.entries,
    input.closingMonthKey,
    input.debtPayments
  );
  const savingsSummary = calculateMonthlySavingsSummary(
    input.savingsBuckets,
    input.concepts,
    input.entries,
    budget,
    input.closingMonthKey
  );

  const snapshot: MonthSnapshot = {
    monthKey: input.closingMonthKey,
    closedAtIso: input.closedAtIso,
    budget,
    checklist,
    closingDebts: debtSummary.debts.map((d) => ({
      debtId: d.debtId,
      name: d.name,
      openingBalance: d.openingBalance,
      paidPrincipal: d.appliedPrincipalThisMonth,
      closingBalance: d.remainingBalance,
    })),
    totalClosingDebt: debtSummary.totalRemainingDebt,
    closingSavings: {
      motoClosingBalance: savingsSummary.moto.currentBalance,
      savingsClosingBalance: savingsSummary.savings.currentBalance,
      totalClosingSavings: savingsSummary.totalCurrentSavings,
    },
  };

  const nextMonthKey = addMonthsToMonthKey(input.closingMonthKey, 1);

  const nextMonthDebts: Debt[] = debtSummary.debts.map((d) => {
    const origDebt = input.debts.find((orig) => orig.id === d.debtId);
    const interestRate = d.monthlyInterestRate ?? origDebt?.monthlyInterestRate ?? 0;
    const accruedInterest =
      interestRate > 0 && d.remainingBalance > 0
        ? Math.round(d.remainingBalance * (interestRate / 100))
        : 0;
    const nextOpeningBalance = Math.max(0, d.remainingBalance + accruedInterest);

    return {
      id: d.debtId,
      groupKey: origDebt?.groupKey ?? 'FUNFAMI',
      name: d.name,
      lender: d.lender,
      openingBalance: nextOpeningBalance,
      monthKey: nextMonthKey,
      ...(interestRate > 0 ? { monthlyInterestRate: interestRate } : {}),
    };
  });

  const nextMonthSavingsBuckets: SavingsBucket[] = [
    {
      id: 'moto',
      name: 'Moto',
      openingBalance: savingsSummary.moto.currentBalance,
    },
    {
      id: 'savings',
      name: 'Ahorros',
      openingBalance: savingsSummary.savings.currentBalance,
    },
  ];

  const existingNextMonthEntries = input.entries.filter((e) => e.monthKey === nextMonthKey);
  const nextMonthEntries = ensureMonthPlan(
    nextMonthKey,
    input.concepts,
    existingNextMonthEntries
  );

  return {
    snapshot,
    nextMonthKey,
    nextMonthDebts,
    nextMonthSavingsBuckets,
    nextMonthEntries,
  };
}
