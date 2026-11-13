/**
 * src/features/budget/store/slices/createDebtsSlice.ts
 *
 * Debts, interest rate conversions and debt installment cascading slice.
 */

import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import {
  buildDebtPaymentsForInstallment,
  type Debt,
  type DebtInterestRateType,
  type MonthEntry,
} from '../../../../domain';
import { executeOptimisticCloudWrite } from '../../../../platform/storage/offlineWriteQueue';
import {
  getStoreInitialState,
  isRealAuthUser,
  triggerWidgetSync,
  type DebtsSlice,
  type SliceCreator,
} from './sliceTypes';

export const createDebtsSlice: SliceCreator<DebtsSlice> = (set, get) => {
  const initial = getStoreInitialState();
  return {
    debtsByMonth: initial.debtsByMonth,
    debtPayments: initial.debtPayments,

  createDebt: async (monthKey, input) => {
    const state = get();
    const previousDebtsByMonth = state.debtsByMonth;
    const id = `debt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rateType: DebtInterestRateType = input.interestRateType ?? 'monthly';
    const resolvedMonthlyRate =
      rateType === 'annual' && input.annualInterestRate !== undefined
        ? Number((input.annualInterestRate / 12).toFixed(4))
        : input.monthlyInterestRate;
    const resolvedAnnualRate =
      rateType === 'annual' && input.annualInterestRate !== undefined
        ? input.annualInterestRate
        : input.monthlyInterestRate !== undefined
          ? Number((input.monthlyInterestRate * 12).toFixed(4))
          : undefined;
    const safeInstallment =
      input.monthlyInstallment !== undefined && input.monthlyInstallment >= 0
        ? Math.round(input.monthlyInstallment)
        : undefined;

    const newDebt: Debt = {
      id,
      groupKey: input.groupKey ?? 'PERSONAL',
      name: input.name.trim(),
      lender: input.lender.trim(),
      openingBalance: Math.max(0, Math.round(input.openingBalance)),
      monthKey,
      interestRateType: rateType,
      ...(resolvedMonthlyRate !== undefined && resolvedMonthlyRate >= 0
        ? { monthlyInterestRate: resolvedMonthlyRate }
        : {}),
      ...(resolvedAnnualRate !== undefined && resolvedAnnualRate >= 0
        ? { annualInterestRate: resolvedAnnualRate }
        : {}),
      ...(safeInstallment !== undefined ? { monthlyInstallment: safeInstallment } : {}),
    };

    const fallbackMonth = state.availableMonths[state.availableMonths.length - 1] ?? monthKey;
    const currentDebts = state.debtsByMonth[monthKey] ?? state.debtsByMonth[fallbackMonth] ?? [];
    const nextDebts = [...currentDebts, newDebt];

    set({
      debtsByMonth: {
        ...state.debtsByMonth,
        [monthKey]: nextDebts,
      },
    });
    triggerWidgetSync(get());

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_debt',
          payload: { debt: newDebt },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveDebt(uid, newDebt);
        },
        rollback: () => {
          set({ debtsByMonth: previousDebtsByMonth });
        },
        friendlyErrorMessage: 'No se pudo guardar la deuda en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }

    return newDebt;
  },

  updateDebt: async (monthKey, debtId, updates) => {
    const state = get();
    const previousDebtsByMonth = state.debtsByMonth;
    const fallbackMonth = state.availableMonths[state.availableMonths.length - 1] ?? monthKey;
    const currentDebts = state.debtsByMonth[monthKey] ?? state.debtsByMonth[fallbackMonth] ?? [];
    let updatedDebt: Debt | null = null;
    const nextDebts = currentDebts.map((d) => {
      if (d.id !== debtId) return d;
      const rateType: DebtInterestRateType =
        updates.interestRateType ?? d.interestRateType ?? 'monthly';
      const resolvedMonthlyRate =
        rateType === 'annual' && updates.annualInterestRate !== undefined
          ? Number((updates.annualInterestRate / 12).toFixed(4))
          : updates.monthlyInterestRate !== undefined
            ? updates.monthlyInterestRate
            : d.monthlyInterestRate;
      const resolvedAnnualRate =
        rateType === 'annual' && updates.annualInterestRate !== undefined
          ? updates.annualInterestRate
          : updates.monthlyInterestRate !== undefined
            ? Number((updates.monthlyInterestRate * 12).toFixed(4))
            : d.annualInterestRate;
      const resolvedInstallment =
        updates.monthlyInstallment !== undefined
          ? Math.max(0, Math.round(updates.monthlyInstallment))
          : d.monthlyInstallment;

      updatedDebt = {
        ...d,
        monthKey,
        interestRateType: rateType,
        ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
        ...(updates.lender !== undefined ? { lender: updates.lender.trim() } : {}),
        ...(updates.openingBalance !== undefined
          ? { openingBalance: Math.max(0, Math.round(updates.openingBalance)) }
          : {}),
        ...(resolvedMonthlyRate !== undefined
          ? { monthlyInterestRate: resolvedMonthlyRate }
          : {}),
        ...(resolvedAnnualRate !== undefined
          ? { annualInterestRate: resolvedAnnualRate }
          : {}),
        ...(resolvedInstallment !== undefined
          ? { monthlyInstallment: resolvedInstallment }
          : {}),
      };
      return updatedDebt;
    });

    const nextDebtsByMonth: Record<string, Debt[]> = {
      ...state.debtsByMonth,
      [monthKey]: nextDebts,
    };

    if (updatedDebt) {
      const targetUpdated = updatedDebt as Debt;
      for (const [mk, list] of Object.entries(nextDebtsByMonth)) {
        if (mk === monthKey) continue;
        if (!list.some((d) => d.id === debtId)) continue;
        nextDebtsByMonth[mk] = list.map((d) =>
          d.id === debtId
            ? {
                ...d,
                name: targetUpdated.name,
                lender: targetUpdated.lender,
                ...(targetUpdated.interestRateType
                  ? { interestRateType: targetUpdated.interestRateType }
                  : {}),
                ...(targetUpdated.monthlyInterestRate !== undefined
                  ? { monthlyInterestRate: targetUpdated.monthlyInterestRate }
                  : {}),
                ...(targetUpdated.annualInterestRate !== undefined
                  ? { annualInterestRate: targetUpdated.annualInterestRate }
                  : {}),
                ...(targetUpdated.monthlyInstallment !== undefined
                  ? { monthlyInstallment: targetUpdated.monthlyInstallment }
                  : {}),
              }
            : d
        );
      }
    }

    set({
      debtsByMonth: nextDebtsByMonth,
    });
    triggerWidgetSync(get());

    const authUser = state.authUser;
    if (updatedDebt && isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      const nonNullDebt = updatedDebt;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_debt',
          payload: { debt: nonNullDebt },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveDebt(uid, nonNullDebt);
        },
        rollback: () => {
          set({ debtsByMonth: previousDebtsByMonth });
        },
        friendlyErrorMessage: 'No se pudo actualizar la deuda en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  deleteDebt: async (monthKey, debtId) => {
    const state = get();
    const previousDebtsByMonth = state.debtsByMonth;
    const nextDebtsByMonth: Record<string, Debt[]> = {};
    for (const [mk, list] of Object.entries(state.debtsByMonth)) {
      nextDebtsByMonth[mk] = list.filter((d) => d.id !== debtId);
    }
    if (!nextDebtsByMonth[monthKey]) {
      nextDebtsByMonth[monthKey] = [];
    }

    set({
      debtsByMonth: nextDebtsByMonth,
    });
    triggerWidgetSync(get());

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'delete_debt',
          payload: { debtId },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.deleteDebt(uid, debtId);
        },
        rollback: () => {
          set({ debtsByMonth: previousDebtsByMonth });
        },
        friendlyErrorMessage: 'No se pudo eliminar la deuda en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  updateInstallmentAmount: async (monthKey, newAmount) => {
    return get().updateFunfamiInstallmentAmount(monthKey, newAmount);
  },

  updateFunfamiInstallmentAmount: async (monthKey, newAmountCop) => {
    const state = get();
    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

    const safeAmount = Math.max(0, Math.round(newAmountCop));
    if (safeAmount <= 0) return;

    const installmentEntry = state.entries.find(
      (e) =>
        e.monthKey === monthKey &&
        (e.conceptId === 'exp_cuota_funfami' ||
          e.conceptName.toLowerCase().includes('cuota') ||
          e.conceptId.includes('cuota'))
    );
    if (!installmentEntry) return;

    const updatedEntry: MonthEntry = {
      ...installmentEntry,
      plannedAmount: safeAmount,
      actualAmount: safeAmount,
    };

    const nextEntries = state.entries.map((e) => (e.id === installmentEntry.id ? updatedEntry : e));
    const monthDebts = state.debtsByMonth[monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const cascadedPayments = buildDebtPaymentsForInstallment(updatedEntry, monthDebts);

    const nextDebtPayments = [
      ...state.debtPayments.filter((dp) => dp.entryId !== installmentEntry.id),
      ...cascadedPayments,
    ];

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_or_update_entry',
          payload: {
            entry: updatedEntry,
            debtPayments: cascadedPayments,
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveOrUpdateEntry(
            uid,
            updatedEntry,
            undefined,
            cascadedPayments
          );
        },
        rollback: () => {
          set({
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'No se pudo actualizar la cuota en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },
};
};
