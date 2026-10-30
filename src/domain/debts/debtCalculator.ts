/**
 * src/domain/debts/debtCalculator.ts
 *
 * Pure FUNFAMI debt control calculator (Resolving Inconsistency #3):
 * - Debt balance only decreases when `Cuota FUNFAMI` entry is `completed` (`¿Pagado? = TRUE`).
 * - Unchecking the installment immediately restores the debt balance to opening (`$8.000.000`).
 * - Confirmed rule (#6): 100% of the installment goes to principal (`0` interest) and defaults
 *   to reducing `CB300F - MOTO` (`$4.400.000 - $1.800.000 = $2.600.000`), while also supporting
 *   explicit custom allocations across debts as long as their sum equals the installment amount.
 * - Includes payoff projection (`monthsRemaining`, `estimatedPayoffMonthKey`).
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
  openingBalance: number;
  monthlyInterestRate?: number;
  accruedInterestThisMonth: number;
  appliedPrincipalThisMonth: number;
  remainingBalance: number;
  reductionRatio: number;
}

export interface DebtPayoffProjection {
  remainingMonths: number;
  estimatedPayoffMonthKey: string | null;
}

export interface FunfamiDebtSummary {
  monthKey: string;
  openingTotalDebt: number;
  appliedInstallmentThisMonth: number;
  totalRemainingDebt: number;
  isInstallmentPaid: boolean;
  debts: DebtItemStatus[];
  projection: DebtPayoffProjection;
}

/**
 * Generates or validates DebtPayment records for a `Cuota FUNFAMI` MonthEntry.
 * - If `entry.status !== 'completed'`, returns payments with `active: false` so debt is not reduced.
 * - If no `customAllocations` are provided, applies the confirmed default priority:
 *   reduces `debt_cb300f_moto` first up to its opening balance, and spills any remainder into `debt_esp_ia`.
 */
export function buildDebtPaymentsForInstallment(
  installmentEntry: MonthEntry,
  debts: readonly Debt[],
  customAllocations?: readonly DebtAllocationInput[]
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

  // Default confirmed rule: prioritize CB300F - MOTO first, then remaining FUNFAMI debts in order
  const funfamiDebts = debts.filter((d) => !d.groupKey || d.groupKey === 'FUNFAMI');
  const orderedDebts = [...funfamiDebts].sort((a, b) => {
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

/**
 * Calculates the FUNFAMI debt summary for `monthKey`.
 * Ensures a payment only reduces debt if BOTH `payment.active === true` AND its linked
 * `MonthEntry` in `entries` has `status === 'completed'`.
 */
export function calculateFunfamiDebtSummary(
  debts: readonly Debt[],
  entries: readonly MonthEntry[],
  monthKey: string,
  explicitPayments?: readonly DebtPayment[],
  defaultMonthlyInstallment = 1_800_000
): FunfamiDebtSummary {
  assertValidMonthKey(monthKey);

  const monthEntries = entries.filter((e) => e.monthKey === monthKey);
  const completedEntryIds = new Set(
    monthEntries.filter((e) => e.status === 'completed').map((e) => e.id)
  );

  const funfamiEntry = monthEntries.find((e) => e.conceptId === 'exp_cuota_funfami');
  const resolvedPayments =
    explicitPayments && explicitPayments.length > 0
      ? explicitPayments
      : funfamiEntry
        ? buildDebtPaymentsForInstallment(funfamiEntry, debts)
        : [];

  const activePayments = resolvedPayments.filter(
    (p) => p.monthKey === monthKey && p.active && completedEntryIds.has(p.entryId)
  );

  const debtItems: DebtItemStatus[] = debts.map((debt) => {
    const appliedPrincipalThisMonth = sumMoneyIntegers(
      activePayments.filter((p) => p.debtId === debt.id).map((p) => p.principalAmount)
    );
    const principalAfterPayments = Math.max(0, debt.openingBalance - appliedPrincipalThisMonth);
    const interestRate = debt.monthlyInterestRate ?? 0;
    const accruedInterestThisMonth =
      interestRate > 0 && principalAfterPayments > 0
        ? Math.round(principalAfterPayments * (interestRate / 100))
        : 0;
    const remainingBalance = principalAfterPayments;
    const reductionRatio =
      debt.openingBalance === 0 ? 1 : appliedPrincipalThisMonth / debt.openingBalance;

    return {
      debtId: debt.id,
      name: debt.name,
      lender: debt.lender,
      openingBalance: debt.openingBalance,
      monthlyInterestRate: debt.monthlyInterestRate,
      accruedInterestThisMonth,
      appliedPrincipalThisMonth,
      remainingBalance,
      reductionRatio,
    };
  });

  const openingTotalDebt = sumMoneyIntegers(debtItems.map((d) => d.openingBalance));
  const appliedInstallmentThisMonth = sumMoneyIntegers(
    debtItems.map((d) => d.appliedPrincipalThisMonth)
  );
  const totalRemainingDebt = sumMoneyIntegers(debtItems.map((d) => d.remainingBalance));

  const installmentForProjection = funfamiEntry?.plannedAmount ?? defaultMonthlyInstallment;
  const projection = projectDebtPayoff(totalRemainingDebt, installmentForProjection, monthKey);

  return {
    monthKey,
    openingTotalDebt,
    appliedInstallmentThisMonth,
    totalRemainingDebt,
    isInstallmentPaid: Boolean(funfamiEntry && funfamiEntry.status === 'completed'),
    debts: debtItems,
    projection,
  };
}
