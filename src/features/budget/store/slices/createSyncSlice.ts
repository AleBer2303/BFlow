/**
 * src/features/budget/store/slices/createSyncSlice.ts
 *
 * Workspace navigation, active month selection and cloud synchronization slice.
 */

import {
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
} from '../../../../data/repositories/budgetRepository';
import { savePersistedSession } from '../../../../platform/auth/authAdapter';
import {
  buildInitialState,
  isRealAuthUser,
  triggerWidgetSync,
  type SliceCreator,
  type SyncSlice,
} from './sliceTypes';

export const createSyncSlice: SliceCreator<SyncSlice> = (set, get) => {
  const initial = buildInitialState();
  return {
    activeTab: 'summary',
    activeMonthKey: initial.activeMonthKey,
    availableMonths: initial.availableMonths,
    syncMessage: '',
    isSyncing: initial.isSyncing,
    isAccountHydrated: initial.isAccountHydrated,

  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveMonthKey: (monthKey) => {
    const state = get();
    const nextAvailable = state.availableMonths.includes(monthKey)
      ? state.availableMonths
      : [...state.availableMonths, monthKey].sort();
    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: monthKey }
      : null;

    set({
      activeMonthKey: monthKey,
      availableMonths: nextAvailable,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      const repo = new FirestoreBudgetRepository();
      void repo.saveActiveMonthKey(state.authUser.uid, monthKey).catch(() => {
        // Non-fatal if offline
      });
    }
  },

  setSyncStatus: (message, isSyncing = false) => set({ syncMessage: message, isSyncing }),

  applyCloudWorkspace: (payload) => {
    set((state) => ({
      activeMonthKey: payload.monthKey,
      availableMonths: state.availableMonths.includes(payload.monthKey)
        ? state.availableMonths
        : [...state.availableMonths, payload.monthKey],
      concepts: payload.concepts,
      entries: [
        ...state.entries.filter((e) => e.monthKey !== payload.monthKey),
        ...payload.entries,
      ],
      debtsByMonth: {
        ...state.debtsByMonth,
        [payload.monthKey]: payload.debts,
      },
      debtPayments: [
        ...state.debtPayments.filter((dp) => dp.monthKey !== payload.monthKey),
        ...payload.debtPayments,
      ],
      savingsBucketsByMonth: {
        ...state.savingsBucketsByMonth,
        [payload.monthKey]: ensureStandardSavingsBuckets(payload.savingsBuckets),
      },
      idealMotoPlan: payload.provisionPlan,
      closedSnapshots: payload.closedSnapshot
        ? { ...state.closedSnapshots, [payload.monthKey]: payload.closedSnapshot }
        : state.closedSnapshots,
      isAccountHydrated: true,
    }));
    triggerWidgetSync(get());
  },

  applyFullCloudAccount: (payload) => {
    const currentUser = get().authUser;
    const updatedUser = currentUser
      ? { ...currentUser, activeMonthKey: payload.activeMonthKey }
      : null;

    set({
      activeMonthKey: payload.activeMonthKey,
      availableMonths: payload.availableMonths,
      concepts: payload.concepts,
      entries: payload.entries,
      debtsByMonth: payload.debtsByMonth,
      debtPayments: payload.debtPayments,
      savingsBucketsByMonth: payload.savingsBucketsByMonth,
      idealMotoPlan: payload.provisionPlan,
      closedSnapshots: payload.closedSnapshots,
      isAccountHydrated: true,
      needsOnboarding: payload.needsOnboarding ?? false,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());
  },

  syncActiveWidget: async () => {
    return triggerWidgetSync(get());
  },
};
};
