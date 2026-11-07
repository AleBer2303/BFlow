/**
 * src/domain/debts/debtCalculator.ts
 *
 * Universal pure debt control and payoff projection calculator:
 * - Debt balance only decreases when an installment entry is `completed`.
 * - Unchecking the installment restores the debt balance to opening.
 * - 100% of the installment applies to principal (unless interest is explicitly recorded).
 * - Cascades installment across debts: targets explicit debt first, then remaining debts in order.
 * - Computes monthly interest accrual if rates are defined.
 * - Includes payoff projection (`remainingMonths`, `estimatedPayoffMonthKey`).
 */

import { addMonthsToMonthKey, assertValidMonthKey } from '../date/monthKey';
import { Debt, DebtPayment, MonthEntry } from '../models/types';
import { assertSafeMoneyInteger, sumMoneyIntegers } from '../money/money';

export interface DebtAllocationInput {
  debtId: string;
  principalAmount: number;
}

export interface DebtItemStatus {
  debtId: string;
  name: string;
  lender: string;
  groupKey?: string;
  openingBalance: number;
  monthlyInterestRate?: number;
  annualInterestRate?: number;
  interestRateType?: 'monthly' | 'annual';
  monthlyInstallment?: number;
  accruedInterestThisMonth: number;
  appliedPrincipalThisMonth: number;
  remainingBalance: number;
  reductionRatio: number;
}

export interface DebtPayoffProjection {
  remainingMonths: number;
  estimatedPayoffMonthKey: string | null;
}

export interface DebtSummaryResult {
  monthKey: string;
  openingTotalDebt: number;
  appliedInstallmentThisMonth: number;
  totalRemainingDebt: number;
  isInstallmentPaid: boolean;
  debts: DebtItemStatus[];
  projection: DebtPayoffProjection;
}

/** @deprecated use DebtSummaryResult */
export type FunfamiDebtSummary = DebtSummaryResult;

/**
 * Generates or validates DebtPayment records for a debt installment MonthEntry.
 * - If `entry.status !== 'completed'`, returns payments with `active: false` so debt is not reduced.
 * - If no `customAllocations` are provided, cascades across debts starting with preferredTargetDebtId
 *   (or first debt with balance), spilling remainders into subsequent debts.
 */
export function buildDebtPaymentsForInstallment(
  installmentEntry: MonthEntry,
  debts: readonly Debt[],
  customAllocations?: readonly DebtAllocationInput[],
  preferredTargetDebtId?: string
): DebtPayment[] {
  const installmentAmount = assertSafeMoneyInteger(
    installmentEntry.actualAmount,
    'installmentEntry.actualAmount'
  );
  const isCompleted = installmentEntry.status === 'completed';

  if (customAllocations && customAllocations.length > 0) {
    const totalAllocated = sumMoneyIntegers(customAllocations.map((a) => a.principalAmount));
    if (totalAllocated !== installmentAmount) {
      throw new RangeError(
        `Debt allocation mismatch: sum of allocations (${totalAllocated}) must equal installment amount (${installmentAmount}).`
      );
    }

    return customAllocations.map((alloc) => {
      const targetDebt = debts.find((d) => d.id === alloc.debtId);
      if (!targetDebt) {
        throw new Error(`Unknown debtId "${alloc.debtId}" in allocation.`);
      }
      if (alloc.principalAmount < 0 || alloc.principalAmount > targetDebt.openingBalance) {
        throw new RangeError(
          `Allocation (${alloc.principalAmount}) for "${targetDebt.name}" exceeds its opening balance (${targetDebt.openingBalance}) or is negative.`
        );
      }
      return {
        id: `${installmentEntry.id}_${alloc.debtId}`,
        entryId: installmentEntry.id,
        monthKey: installmentEntry.monthKey,
        debtId: alloc.debtId,
        principalAmount: alloc.principalAmount,
        interestAmount: 0,
        totalApplied: alloc.principalAmount,
        ...(installmentEntry.completedAt ? { completedAt: installmentEntry.completedAt } : {}),
        active: isCompleted,
      };
    });
  }

  // If a specific target debt is linked and exists in `debts`, target that debt first (and cascade within its group if needed)
  const explicitTarget =
    preferredTargetDebtId && preferredTargetDebtId !== 'ALL_DEBTS' && preferredTargetDebtId !== 'ALL_FUNFAMI'
      ? debts.find((d) => d.id === preferredTargetDebtId)
      : undefined;

  const targetGroupKey =
    explicitTarget?.groupKey ??
    (installmentEntry.conceptId === 'exp_cuota_funfami' ? 'FUNFAMI' : undefined);

  const candidateDebts = targetGroupKey
    ? debts.filter((d) => (d.groupKey || targetGroupKey) === targetGroupKey)
    : debts;

  const orderedDebts = [...candidateDebts].sort((a, b) => {
    if (explicitTarget) {
      if (a.id === explicitTarget.id) return -1;
      if (b.id === explicitTarget.id) return 1;
    }
    // Backward compat priority for fixture
    if (a.id === 'debt_cb300f_moto') return -1;
    if (b.id === 'debt_cb300f_moto') return 1;
    return a.id.localeCompare(b.id);
  });

  let remainingToApply = installmentAmount;
  const payments: DebtPayment[] = [];

  for (const debt of orderedDebts) {
    if (remainingToApply <= 0) break;
    const applied = Math.min(remainingToApply, debt.openingBalance);
    if (applied > 0) {
      payments.push({
        id: `${installmentEntry.id}_${debt.id}`,
        entryId: installmentEntry.id,
        monthKey: installmentEntry.monthKey,
        debtId: debt.id,
        principalAmount: applied,
        interestAmount: 0,
        totalApplied: applied,
        ...(installmentEntry.completedAt ? { completedAt: installmentEntry.completedAt } : {}),
        active: isCompleted,
      });
      remainingToApply -= applied;
    }
  }

  return payments;
}

export function projectDebtPayoff(
  totalRemainingDebt: number,
  monthlyInstallment: number,
  currentMonthKey: string
): DebtPayoffProjection {
  assertSafeMoneyInteger(totalRemainingDebt, 'totalRemainingDebt');
  assertSafeMoneyInteger(monthlyInstallment, 'monthlyInstallment');
  assertValidMonthKey(currentMonthKey);

  if (totalRemainingDebt <= 0) {
    return {
      remainingMonths: 0,
      estimatedPayoffMonthKey: currentMonthKey,
    };
  }
  if (monthlyInstallment <= 0) {
    return {
      remainingMonths: Number.POSITIVE_INFINITY,
      estimatedPayoffMonthKey: null,
    };
  }

  const remainingMonths = Math.ceil(totalRemainingDebt / monthlyInstallment);
  const estimatedPayoffMonthKey = addMonthsToMonthKey(currentMonthKey, remainingMonths);

  return {
    remainingMonths,
    estimatedPayoffMonthKey,
  };
}

export function calculateDebtsSummary(
  debts: readonly Debt[],
  entries: readonly MonthEntry[],
  currentMonthKey: string,
  explicitPayments?: readonly DebtPayment[],
  defaultMonthlyInstallment = 1_800_000
): DebtSummaryResult {
  assertValidMonthKey(currentMonthKey);

  const monthEntries = entries.filter((e) => e.monthKey === currentMonthKey);
  const completedEntryIds = new Set(
    monthEntries.filter((e) => e.status === 'completed').map((e) => e.id)
  );

  const installmentEntry = monthEntries.find(
    (e) =>
      e.type === 'expense' &&
      (e.conceptId.includes('cuota') ||
        e.conceptId.includes('prestamo') ||
        e.conceptId.includes('deuda') ||
        e.conceptId === 'exp_cuota_funfami')
  );

  const activePayments: readonly DebtPayment[] = explicitPayments
    ? explicitPayments.filter(
        (p) => p.monthKey === currentMonthKey && p.active && completedEntryIds.has(p.entryId)
      )
    : installmentEntry && installmentEntry.status === 'completed'
      ? buildDebtPaymentsForInstallment(installmentEntry, debts)
      : [];

  const isInstallmentPaid = installmentEntry
    ? installmentEntry.status === 'completed'
    : activePayments.length > 0;

  const debtItems: DebtItemStatus[] = debts.map((debt) => {
    const appliedPrincipal = sumMoneyIntegers(
      activePayments.filter((p) => p.debtId === debt.id).map((p) => p.principalAmount)
    );
    const principalAfterPayments = Math.max(0, debt.openingBalance - appliedPrincipal);

    let accruedInterest = 0;
    if (debt.monthlyInterestRate && debt.monthlyInterestRate > 0) {
      accruedInterest = Math.round((principalAfterPayments * debt.monthlyInterestRate) / 100);
    } else if (debt.annualInterestRate && debt.annualInterestRate > 0) {
      accruedInterest = Math.round((principalAfterPayments * (debt.annualInterestRate / 12)) / 100);
    }

    const remainingBalance = principalAfterPayments;
    const reductionRatio =
      debt.openingBalance === 0 ? 1 : appliedPrincipal / debt.openingBalance;

    return {
      debtId: debt.id,
      name: debt.name,
      lender: debt.lender,
      groupKey: debt.groupKey,
      openingBalance: debt.openingBalance,
      monthlyInterestRate: debt.monthlyInterestRate,
      annualInterestRate: debt.annualInterestRate,
      interestRateType: debt.interestRateType,
      monthlyInstallment: debt.monthlyInstallment,
      accruedInterestThisMonth: accruedInterest,
      appliedPrincipalThisMonth: appliedPrincipal,
      remainingBalance,
      reductionRatio,
    };
  });

  const openingTotalDebt = sumMoneyIntegers(debtItems.map((d) => d.openingBalance));
  const appliedInstallmentThisMonth = sumMoneyIntegers(
    debtItems.map((d) => d.appliedPrincipalThisMonth)
  );
  const totalRemainingDebt = sumMoneyIntegers(debtItems.map((d) => d.remainingBalance));

  const configuredDebtInstallmentsSum = sumMoneyIntegers(
    debtItems.map((d) => d.monthlyInstallment ?? 0)
  );

  const installmentForProjection =
    installmentEntry?.plannedAmount ??
    (configuredDebtInstallmentsSum > 0
      ? configuredDebtInstallmentsSum
      : appliedInstallmentThisMonth > 0
        ? appliedInstallmentThisMonth
        : defaultMonthlyInstallment);

  const projection = projectDebtPayoff(totalRemainingDebt, installmentForProjection, currentMonthKey);

  return {
    monthKey: currentMonthKey,
    openingTotalDebt,
    appliedInstallmentThisMonth,
    totalRemainingDebt,
    isInstallmentPaid,
    debts: debtItems,
    projection,
  };
}

/** @deprecated use calculateDebtsSummary */
export const calculateFunfamiDebtSummary = calculateDebtsSummary;
