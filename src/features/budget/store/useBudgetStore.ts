/**
 * src/features/budget/store/useBudgetStore.ts
 *
 * Reactive Zustand store for BFlow orchestrating domain calculators,
 * Authentication Gate, persistent cloud session, October 2026 golden seed data,
 * month rollover and real-time Cloud Firestore synchronization.
 *
 * Modularized into focused domain slices:
 * - createAuthSlice: user profile, authentication, onboarding, account reset
 * - createSyncSlice: tabs, active month, cloud workspace & account hydration, widgets
 * - createBudgetSlice: concepts, entries/movements, month close/reopen/delete
 * - createDebtsSlice: debts by month, installment cascading, interest calculation
 * - createSavingsSlice: savings buckets, opening balances, savings linkages
 * - createProvisionsSlice: provisions plan, recurring funds, target goals
 */

import { create } from 'zustand';
import {
  createAuthSlice,
  createBudgetSlice,
  createDebtsSlice,
  createProvisionsSlice,
  createSavingsSlice,
  createSyncSlice,
  getStoreInitialState,
  type BudgetStoreState,
} from './slices';

export * from './slices';

export const useBudgetStore = create<BudgetStoreState>((set, get, store) => ({
  ...getStoreInitialState(),
  ...createAuthSlice(set, get, store),
  ...createSyncSlice(set, get, store),
  ...createBudgetSlice(set, get, store),
  ...createDebtsSlice(set, get, store),
  ...createSavingsSlice(set, get, store),
  ...createProvisionsSlice(set, get, store),
}));
