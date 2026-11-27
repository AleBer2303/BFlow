/**
 * src/features/budget/store/persistedAccountFields.ts
 *
 * Which parts of the store are saved to the device cache, and whether any of them changed.
 *
 * Store updates are immutable, so a field that changed is a new reference: comparing ten
 * references replaces serializing the whole account on every store change (a sync message,
 * a tab change), whose cost grew with the history.
 */

import type { StoreApi } from 'zustand';
import type { FullCloudAccountData } from '../../../data/repositories/budgetRepository';
import { schedulePersistedAccountSave } from '../../../platform/storage/accountCache';
import type { BudgetStoreState } from './slices';

export const PERSISTED_ACCOUNT_FIELDS = [
  'activeMonthKey',
  'availableMonths',
  'concepts',
  'entries',
  'debtsByMonth',
  'debtPayments',
  'savingsBucketsByMonth',
  'provisionPlan',
  'closedSnapshots',
  'financialAccounts',
  'needsOnboarding',
] as const satisfies readonly (keyof BudgetStoreState)[];

export type PersistedAccountFields = Pick<
  BudgetStoreState,
  (typeof PERSISTED_ACCOUNT_FIELDS)[number]
>;

/** True when there is no previous save to compare with, or any saved field is a new value. */
export function havePersistedAccountFieldsChanged(
  previous: PersistedAccountFields | null,
  next: PersistedAccountFields
): boolean {
  if (previous === null) {
    return true;
  }
  return PERSISTED_ACCOUNT_FIELDS.some((field) => previous[field] !== next[field]);
}

/** Sessions that never have a device cache: the local showcase user. */
const LOCAL_ONLY_UIDS: ReadonlySet<string> = new Set(['local-demo']);

export function buildPersistedAccountData(state: PersistedAccountFields): FullCloudAccountData {
  return {
    activeMonthKey: state.activeMonthKey,
    availableMonths: state.availableMonths,
    concepts: state.concepts,
    entries: state.entries,
    debtsByMonth: state.debtsByMonth,
    debtPayments: state.debtPayments,
    savingsBucketsByMonth: state.savingsBucketsByMonth,
    provisionPlan: state.provisionPlan,
    closedSnapshots: state.closedSnapshots,
    financialAccounts: state.financialAccounts,
    needsOnboarding: state.needsOnboarding,
  };
}

/**
 * The only trigger of the device cache save (OPT-02, R-06). Every change of a persisted field
 * schedules one debounced save, whatever made it: an action, a rollback or a plain `setState`.
 * Before, `src/app/index.tsx`, `triggerWidgetSync` and the provisions slice each scheduled
 * their own, so one action built the payload two or three times.
 */
export function startPersistedAccountAutoSave(store: StoreApi<BudgetStoreState>): () => void {
  let lastSaved: { uid: string; fields: PersistedAccountFields } | null = null;
  return store.subscribe((state) => {
    const uid = state.authUser?.uid;
    if (!uid || LOCAL_ONLY_UIDS.has(uid) || !state.isAccountHydrated) {
      return;
    }
    const previous = lastSaved?.uid === uid ? lastSaved.fields : null;
    if (!havePersistedAccountFieldsChanged(previous, state)) {
      return;
    }
    lastSaved = { uid, fields: state };
    schedulePersistedAccountSave(uid, buildPersistedAccountData(state));
  });
}
