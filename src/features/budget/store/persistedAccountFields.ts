/**
 * src/features/budget/store/persistedAccountFields.ts
 *
 * Which parts of the store are saved to the device cache, and whether any of them changed.
 *
 * Store updates are immutable, so a field that changed is a new reference: comparing ten
 * references replaces serializing the whole account on every store change (a sync message,
 * a tab change), whose cost grew with the history.
 */

import type { BudgetStoreState } from './slices';

export const PERSISTED_ACCOUNT_FIELDS = [
  'activeMonthKey',
  'availableMonths',
  'concepts',
  'entries',
  'debtsByMonth',
  'debtPayments',
  'savingsBucketsByMonth',
  'idealMotoPlan',
  'closedSnapshots',
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
