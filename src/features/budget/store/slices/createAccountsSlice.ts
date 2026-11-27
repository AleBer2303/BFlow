/**
 * src/features/budget/store/slices/createAccountsSlice.ts
 *
 * Credit cards and debit accounts (ADR 0034). Accounts are not per month like debts: there is
 * one list, and each account's balance is derived from the movements linked to it
 * (`calculateFinancialAccountsSummary`). Every write follows the store pattern: optimistic
 * `set`, widget sync, cloud write with rollback on a permanent error.
 */

import {
  isValidAccountDay,
  normalizeLastFourDigits,
  type FinancialAccount,
} from '../../../../domain';
import { executeOptimisticCloudWrite } from '../../../../platform/storage/offlineWriteQueue';
import {
  getBudgetRepository,
  getStoreInitialState,
  isRealAuthUser,
  triggerWidgetSync,
  type AccountsSlice,
  type FinancialAccountInput,
  type SliceCreator,
} from './sliceTypes';

function toSafeAmount(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const rounded = Math.max(0, Math.round(value));
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

/**
 * Builds the stored account from the form fields: trims the texts, keeps whole non-negative
 * amounts, and keeps only the fields that belong to its type.
 */
export function buildFinancialAccount(
  id: string,
  openingMonthKey: string,
  input: FinancialAccountInput
): FinancialAccount {
  const lastFourDigits = normalizeLastFourDigits(input.lastFourDigits);
  const account: FinancialAccount = {
    id,
    type: input.type,
    name: input.name.trim(),
    institution: input.institution.trim(),
    openingBalance: toSafeAmount(input.openingBalance) ?? 0,
    openingMonthKey,
    ...(lastFourDigits ? { lastFourDigits } : {}),
  };

  if (input.type === 'debit') {
    if (input.debitKind) account.debitKind = input.debitKind;
    return account;
  }

  const creditLimit = toSafeAmount(input.creditLimit);
  if (creditLimit !== undefined && creditLimit > 0) account.creditLimit = creditLimit;
  if (isValidAccountDay(input.statementDay)) account.statementDay = input.statementDay;
  if (isValidAccountDay(input.paymentDueDay)) account.paymentDueDay = input.paymentDueDay;
  if (
    input.monthlyInterestRate !== undefined &&
    Number.isFinite(input.monthlyInterestRate) &&
    input.monthlyInterestRate > 0 &&
    input.monthlyInterestRate <= 100
  ) {
    account.monthlyInterestRate = Number(input.monthlyInterestRate.toFixed(4));
  }
  return account;
}

export const createAccountsSlice: SliceCreator<AccountsSlice> = (set, get) => {
  const initial = getStoreInitialState();
  return {
    financialAccounts: initial.financialAccounts,

    createFinancialAccount: async (monthKey, input) => {
      if (!input.name.trim() || !input.institution.trim()) return null;
      const state = get();
      const previousAccounts = state.financialAccounts;
      const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const account = buildFinancialAccount(id, monthKey, input);

      set({ financialAccounts: [...state.financialAccounts, account] });
      triggerWidgetSync(get());

      const authUser = state.authUser;
      if (isRealAuthUser(authUser)) {
        const uid = authUser.uid;
        await executeOptimisticCloudWrite({
          uid,
          operation: { type: 'save_financial_account', payload: { account } },
          performCloudWrite: async () => {
            await getBudgetRepository().saveFinancialAccount(uid, account);
          },
          rollback: () => set({ financialAccounts: previousAccounts }),
          friendlyErrorMessage: 'No se pudo guardar la tarjeta o cuenta en la nube.',
          setStoreState: set,
          onWidgetSync: () => triggerWidgetSync(get()),
        });
      }
      return account;
    },

    updateFinancialAccount: async (accountId, updates) => {
      const state = get();
      const current = state.financialAccounts.find((a) => a.id === accountId);
      if (!current || !updates.name.trim() || !updates.institution.trim()) return;
      const previousAccounts = state.financialAccounts;
      const updated = buildFinancialAccount(current.id, current.openingMonthKey, {
        ...updates,
        type: current.type,
      });

      set({
        financialAccounts: state.financialAccounts.map((a) => (a.id === accountId ? updated : a)),
      });
      triggerWidgetSync(get());

      const authUser = state.authUser;
      if (isRealAuthUser(authUser)) {
        const uid = authUser.uid;
        await executeOptimisticCloudWrite({
          uid,
          operation: { type: 'save_financial_account', payload: { account: updated } },
          performCloudWrite: async () => {
            await getBudgetRepository().saveFinancialAccount(uid, updated);
          },
          rollback: () => set({ financialAccounts: previousAccounts }),
          friendlyErrorMessage: 'No se pudo actualizar la tarjeta o cuenta en la nube.',
          setStoreState: set,
          onWidgetSync: () => triggerWidgetSync(get()),
        });
      }
    },

    deleteFinancialAccount: async (accountId) => {
      const state = get();
      if (!state.financialAccounts.some((a) => a.id === accountId)) return;
      const previousAccounts = state.financialAccounts;

      set({ financialAccounts: state.financialAccounts.filter((a) => a.id !== accountId) });
      triggerWidgetSync(get());

      const authUser = state.authUser;
      if (isRealAuthUser(authUser)) {
        const uid = authUser.uid;
        await executeOptimisticCloudWrite({
          uid,
          operation: { type: 'delete_financial_account', payload: { accountId } },
          performCloudWrite: async () => {
            await getBudgetRepository().deleteFinancialAccount(uid, accountId);
          },
          rollback: () => set({ financialAccounts: previousAccounts }),
          friendlyErrorMessage: 'No se pudo eliminar la tarjeta o cuenta en la nube.',
          setStoreState: set,
          onWidgetSync: () => triggerWidgetSync(get()),
        });
      }
    },
  };
};
