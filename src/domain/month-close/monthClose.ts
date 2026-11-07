/**
 * src/domain/month-close/monthClose.ts
 *
 * Universal month-close and balance rollover calculator:
 * - Freezes an immutable `MonthSnapshot` for `closingMonthKey`.
 * - Automatically rolls over closing debt balances as the `openingBalance` of `nextMonthKey`.
 * - Automatically rolls over closing savings and reserve balances as the `openingBalance` of `nextMonthKey`.
 * - Idempotently initializes the checklist for `nextMonthKey` via `ensureMonthPlan`.
 */

import { calculateMonthlyBudgetSummary } from '../budget/budgetCalculator';
import { calculateChecklistProgress, ensureMonthPlan } from '../checklist/checklist';
import { addMonthsToMonthKey, assertValidMonthKey } from '../date/monthKey';
import { calculateDebtsSummary } from '../debts/debtCalculator';
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
  const debtSummary = calculateDebtsSummary(
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
    closingDebts: debtSummary.debts.map((d) => {
      const origDebt = input.debts.find((orig) => orig.id === d.debtId);
      return {
        debtId: d.debtId,
        name: d.name,
        ...(d.lender ? { lender: d.lender } : {}),
        ...(origDebt?.groupKey ? { groupKey: origDebt.groupKey } : {}),
        openingBalance: d.openingBalance,
        paidPrincipal: d.appliedPrincipalThisMonth,
        closingBalance: d.remainingBalance,
        ...(d.monthlyInterestRate !== undefined
          ? { monthlyInterestRate: d.monthlyInterestRate }
          : origDebt?.monthlyInterestRate !== undefined
            ? { monthlyInterestRate: origDebt.monthlyInterestRate }
            : {}),
        ...(d.annualInterestRate !== undefined
          ? { annualInterestRate: d.annualInterestRate }
          : origDebt?.annualInterestRate !== undefined
            ? { annualInterestRate: origDebt.annualInterestRate }
            : {}),
        ...(d.interestRateType ?? origDebt?.interestRateType
          ? { interestRateType: d.interestRateType ?? origDebt?.interestRateType }
          : {}),
        ...(d.monthlyInstallment !== undefined
          ? { monthlyInstallment: d.monthlyInstallment }
          : origDebt?.monthlyInstallment !== undefined
            ? { monthlyInstallment: origDebt.monthlyInstallment }
            : {}),
      };
    }),
    totalClosingDebt: debtSummary.totalRemainingDebt,
    closingSavings: {
      reserveClosingBalance: savingsSummary.reserve.currentBalance,
      motoClosingBalance: savingsSummary.reserve.currentBalance,
      savingsClosingBalance: savingsSummary.savings.currentBalance,
      totalClosingSavings: savingsSummary.totalCurrentSavings,
    },
  };

  const nextMonthKey = addMonthsToMonthKey(input.closingMonthKey, 1);

  const nextMonthDebts: Debt[] = debtSummary.debts.map((d) => {
    const origDebt = input.debts.find((orig) => orig.id === d.debtId);
    const interestRate =
      d.monthlyInterestRate ??
      origDebt?.monthlyInterestRate ??
      (origDebt?.annualInterestRate !== undefined
        ? Math.round((origDebt.annualInterestRate / 12) * 10000) / 10000
        : 0);
    const accruedInterest =
      interestRate > 0 && d.remainingBalance > 0
        ? Math.round(d.remainingBalance * (interestRate / 100))
        : 0;
    const nextOpeningBalance = Math.max(0, d.remainingBalance + accruedInterest);

    return {
      id: d.debtId,
      groupKey: origDebt?.groupKey ?? 'General',
      name: d.name,
      lender: d.lender,
      openingBalance: nextOpeningBalance,
      monthKey: nextMonthKey,
      ...(origDebt?.monthlyInterestRate !== undefined || d.monthlyInterestRate !== undefined
        ? { monthlyInterestRate: interestRate }
        : {}),
      ...(origDebt?.annualInterestRate !== undefined
        ? { annualInterestRate: origDebt.annualInterestRate }
        : d.annualInterestRate !== undefined
          ? { annualInterestRate: d.annualInterestRate }
          : {}),
      ...(d.interestRateType ?? origDebt?.interestRateType
        ? { interestRateType: d.interestRateType ?? origDebt?.interestRateType }
        : {}),
      ...(d.monthlyInstallment !== undefined
        ? { monthlyInstallment: d.monthlyInstallment }
        : origDebt?.monthlyInstallment !== undefined
          ? { monthlyInstallment: origDebt.monthlyInstallment }
          : {}),
    };
  });

  const reserveBucket = input.savingsBuckets.find((b) => b.id === 'reserve' || b.id === 'moto');
  const nextMonthSavingsBuckets: SavingsBucket[] = [
    ...(savingsSummary.hasReserveBucket
      ? [
          {
            id: reserveBucket?.id ?? 'reserve',
            name: reserveBucket?.name ?? 'Fondo de Reserva',
            openingBalance: savingsSummary.reserve.currentBalance,
          },
        ]
      : []),
    ...(savingsSummary.hasSavingsBucket
      ? [
          {
            id: 'savings',
            name: input.savingsBuckets.find((b) => b.id === 'savings')?.name ?? 'Ahorros',
            openingBalance: savingsSummary.savings.currentBalance,
          },
        ]
      : []),
    ...savingsSummary.customBuckets.map((cb) => ({
      id: cb.bucketId,
      name: cb.name,
      openingBalance: cb.currentBalance,
    })),
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
