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
  isEquivalentCloudAccount,
  loadPersistedAccount,
  savePersistedAccount,
} from '../../../../platform/storage/accountCache';
import {
  drainOfflineWriteQueue,
  getPendingOfflineWritesCount,
  hasPendingOfflineWrites,
} from '../../../../platform/storage/offlineWriteQueue';
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
    pendingOfflineWritesCount: initial.pendingOfflineWritesCount ?? 0,

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

  flushOfflineWrites: async () => {
    const user = get().authUser;
    if (!isRealAuthUser(user)) return;
    const repo = new FirestoreBudgetRepository();
    const result = await drainOfflineWriteQueue(user.uid, repo);
    set({
      pendingOfflineWritesCount: result.remaining,
      syncMessage:
        result.remaining === 0
          ? 'Todos los cambios locales se sincronizaron con la nube'
          : `${result.remaining} cambios pendientes por sincronizar`,
    });
    triggerWidgetSync(get());
  },

  refreshPendingOfflineWritesCount: () => {
    const user = get().authUser;
    const count = user?.uid ? getPendingOfflineWritesCount(user.uid) : 0;
    set({ pendingOfflineWritesCount: count });
  },

  syncUserCloudAccount: async (user, options) => {
    // 1. Instant offline cold-start: rehydrate from local cache if available
    const cached = loadPersistedAccount(user.uid);
    if (cached) {
      get().applyFullCloudAccount(cached);
    }

    set({ syncMessage: 'Cargando tu presupuesto e historial...', isSyncing: true });
    try {
      const repo = new FirestoreBudgetRepository();

      // Drain any pending offline writes first so cloud receives our local changes
      await drainOfflineWriteQueue(user.uid, repo);
      get().refreshPendingOfflineWritesCount();

      // R-09: If pending offline writes remain, DO NOT overwrite local state with outdated cloud data
      if (hasPendingOfflineWrites(user.uid)) {
        set({ syncMessage: 'Cambios locales pendientes por sincronizar', isSyncing: false });
        return;
      }

      const fullAccount = await repo.loadFullCloudAccount(user.uid, user.email, options);
      const currentUid = get().authUser?.uid;
      if (!currentUid || currentUid !== user.uid) {
        return;
      }
      if (hasPendingOfflineWrites(user.uid)) {
        set({ syncMessage: 'Cambios locales pendientes por sincronizar', isSyncing: false });
        return;
      }
      savePersistedAccount(user.uid, fullAccount);
      if (!isEquivalentCloudAccount(cached, fullAccount)) {
        get().applyFullCloudAccount(fullAccount);
      }
      set({ syncMessage: 'Sincronizado', isSyncing: false });
    } catch {
      const hasLocalData = loadPersistedAccount(user.uid) !== null;
      set({
        syncMessage: hasLocalData ? 'Modo sin conexión' : 'No fue posible conectar con el servidor',
        isSyncing: false,
      });
    }
  },
};
};
