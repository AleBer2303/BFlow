/**
 * src/features/budget/store/useBudgetStore.ts
 *
 * Reactive Zustand store orchestrating BFlow's domain calculators,
 * Authentication Gate (`authUser: BFlowAuthUser | null`), persistent cloud session,
 * October 2026 golden seed data, month rollover ("2026-10" -> "2026-11"),
 * and real-time Cloud Firestore synchronization (`bflow-deaeb`).
 */

import { create } from 'zustand';
import {
  FirestoreBudgetRepository,
  type FullCloudAccountData,
} from '../../../data/repositories/budgetRepository';
import { buildOctober2026SeedPayload } from '../../../data/seed/october2026SeedData';
import {
  closeMonthAndRollover,
  deleteMovement,
  registerMovement,
  uncompleteMovement,
  type CloseMonthResult,
  type Concept,
  type Debt,
  type DebtPayment,
  type IdealMotoPlan,
  type MonthEntry,
  type MonthSnapshot,
  type RegisterOrCompleteMovementInput,
  type SavingsBucket,
} from '../../../domain';
import {
  DEMO_OWNER_USER,
  loadPersistedSession,
  type BFlowAuthUser,
} from '../../../platform/auth/authAdapter';

export type BFlowWorkspaceTab = 'summary' | 'checklist' | 'debts' | 'savings' | 'analytics';

export interface BudgetStoreState {
  activeTab: BFlowWorkspaceTab;
  activeMonthKey: string;
  availableMonths: string[];
  concepts: Concept[];
  entries: MonthEntry[];
  debtsByMonth: Record<string, Debt[]>;
  debtPayments: DebtPayment[];
  savingsBucketsByMonth: Record<string, SavingsBucket[]>;
  idealMotoPlan: IdealMotoPlan;
  closedSnapshots: Record<string, MonthSnapshot>;
  authUser: BFlowAuthUser | null;
  syncMessage: string;
  isSyncing: boolean;

  setActiveTab: (tab: BFlowWorkspaceTab) => void;
  setActiveMonthKey: (monthKey: string) => void;
  setAuthUser: (user: BFlowAuthUser | null) => void;
  requireAuthenticationGate: () => void;
  setSyncStatus: (message: string, isSyncing?: boolean) => void;
  applyCloudWorkspace: (payload: {
    monthKey: string;
    concepts: Concept[];
    entries: MonthEntry[];
    debts: Debt[];
    debtPayments: DebtPayment[];
    savingsBuckets: SavingsBucket[];
    provisionPlan: IdealMotoPlan;
    closedSnapshot?: MonthSnapshot;
  }) => void;
  applyFullCloudAccount: (payload: FullCloudAccountData) => void;
  toggleEntryStatus: (entryId: string, completedAtDateIso?: string) => Promise<void>;
  addOrCompleteMovement: (input: RegisterOrCompleteMovementInput) => Promise<void>;
  removeOrResetEntry: (entryId: string) => Promise<void>;
  closeCurrentMonth: (closedAtIso?: string) => Promise<CloseMonthResult>;
  resetToOctober2026GoldenState: () => void;
}

function resolveDefaultInitialAuthUser(): BFlowAuthUser | null {
  if (process.env.NODE_ENV === 'test') {
    return DEMO_OWNER_USER;
  }
  return loadPersistedSession();
}

function buildInitialState(authUserOverride?: BFlowAuthUser | null) {
  const seed = buildOctober2026SeedPayload();
  const resolvedUser =
    authUserOverride !== undefined ? authUserOverride : resolveDefaultInitialAuthUser();

  return {
    activeTab: 'summary' as BFlowWorkspaceTab,
    activeMonthKey: '2026-10',
    availableMonths: ['2026-10'],
    concepts: seed.concepts,
    entries: seed.entries,
    debtsByMonth: {
      '2026-10': seed.debts,
    },
    debtPayments: seed.debtPayments,
    savingsBucketsByMonth: {
      '2026-10': seed.savingsBuckets,
    },
    idealMotoPlan: seed.provisionPlan,
    closedSnapshots: {} as Record<string, MonthSnapshot>,
    authUser: resolvedUser,
    syncMessage: resolvedUser
      ? `Sincronizado con Cloud Firestore (${resolvedUser.email ?? resolvedUser.uid})`
      : 'Inicia sesión para cargar tu presupuesto desde Firebase',
    isSyncing: false,
  };
}

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  ...buildInitialState(),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveMonthKey: (monthKey) => set({ activeMonthKey: monthKey }),

  setAuthUser: (user) => set({ authUser: user }),

  requireAuthenticationGate: () => set({ authUser: null }),

  setSyncStatus: (message, isSyncing = false) => set({ syncMessage: message, isSyncing }),

  applyCloudWorkspace: (payload) =>
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
        [payload.monthKey]: payload.savingsBuckets,
      },
      idealMotoPlan: payload.provisionPlan,
      closedSnapshots: payload.closedSnapshot
        ? { ...state.closedSnapshots, [payload.monthKey]: payload.closedSnapshot }
        : state.closedSnapshots,
    })),

  applyFullCloudAccount: (payload) =>
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
    }),

  toggleEntryStatus: async (entryId, completedAtDateIso = '2026-10-28') => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const wasCompleted = target.status === 'completed';
    const nextEntries = wasCompleted
      ? uncompleteMovement(state.entries, entryId)
      : registerMovement(state.entries, state.concepts, {
          monthKey: target.monthKey,
          conceptId: target.conceptId,
          actualAmount: target.plannedAmount,
          completedAt: completedAtDateIso,
        });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    const concept = state.concepts.find((c) => c.id === target.conceptId);

    let nextDebtPayments = state.debtPayments;
    if (concept?.linkedDebtGroup && updatedEntry) {
      const targetDebtId = concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
      const paymentId = `${updatedEntry.id}_${targetDebtId}`;
      const existingPayment = state.debtPayments.find((dp) => dp.id === paymentId);
      const nextPayment: DebtPayment = {
        id: paymentId,
        entryId: updatedEntry.id,
        monthKey: updatedEntry.monthKey,
        debtId: targetDebtId,
        principalAmount: updatedEntry.actualAmount,
        interestAmount: existingPayment?.interestAmount ?? 0,
        totalApplied: updatedEntry.actualAmount + (existingPayment?.interestAmount ?? 0),
        completedAt: updatedEntry.completedAt,
        active: updatedEntry.status === 'completed',
      };
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.id !== paymentId),
        nextPayment,
      ];
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });

    if (state.authUser?.provider === 'firebase') {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.toggleEntryCompletion(state.authUser.uid, entryId, target.monthKey, {
          actualAmount: target.plannedAmount,
          completedAtDateIso,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al sincronizar en Firestore';
        set({ syncMessage: `Aviso Firestore: ${msg}` });
      }
    }
  },

  addOrCompleteMovement: async (input) => {
    const state = get();
    const nextEntries = registerMovement(state.entries, state.concepts, input);
    const concept = state.concepts.find((c) => c.id === input.conceptId);

    let nextDebtPayments = state.debtPayments;
    if (concept?.linkedDebtGroup) {
      const updatedEntry = nextEntries.find(
        (e) => e.monthKey === input.monthKey && e.conceptId === input.conceptId
      );
      if (updatedEntry) {
        const targetDebtId = concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
        const paymentId = `${updatedEntry.id}_${targetDebtId}`;
        const nextPayment: DebtPayment = {
          id: paymentId,
          entryId: updatedEntry.id,
          monthKey: updatedEntry.monthKey,
          debtId: targetDebtId,
          principalAmount: updatedEntry.actualAmount,
          interestAmount: 0,
          totalApplied: updatedEntry.actualAmount,
          completedAt: updatedEntry.completedAt,
          active: true,
        };
        nextDebtPayments = [
          ...state.debtPayments.filter((dp) => dp.id !== paymentId),
          nextPayment,
        ];
      }
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });

    if (state.authUser?.provider === 'firebase') {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.addMonthEntry(state.authUser.uid, input);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al guardar movimiento en Firestore';
        set({ syncMessage: `Aviso Firestore: ${msg}` });
      }
    }
  },

  removeOrResetEntry: async (entryId) => {
    const state = get();
    const nextEntries = deleteMovement(state.entries, state.concepts, entryId);
    set({ entries: nextEntries });

    if (state.authUser?.provider === 'firebase') {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteOrResetEntry(state.authUser.uid, entryId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al eliminar en Firestore';
        set({ syncMessage: `Aviso Firestore: ${msg}` });
      }
    }
  },

  closeCurrentMonth: async (closedAtIso = '2026-10-31T23:59:59-05:00') => {
    const state = get();
    const currentMonthKey = state.activeMonthKey;
    const currentDebts =
      state.debtsByMonth[currentMonthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const currentBuckets =
      state.savingsBucketsByMonth[currentMonthKey] ??
      state.savingsBucketsByMonth['2026-10'] ??
      [];
    const currentDebtPayments = state.debtPayments.filter(
      (dp) => dp.monthKey === currentMonthKey
    );

    const result = closeMonthAndRollover({
      closingMonthKey: currentMonthKey,
      closedAtIso,
      concepts: state.concepts,
      entries: state.entries,
      debts: currentDebts,
      debtPayments: currentDebtPayments,
      savingsBuckets: currentBuckets,
    });

    const otherMonthsEntries = state.entries.filter((e) => e.monthKey !== result.nextMonthKey);

    set({
      activeMonthKey: result.nextMonthKey,
      availableMonths: state.availableMonths.includes(result.nextMonthKey)
        ? state.availableMonths
        : [...state.availableMonths, result.nextMonthKey],
      entries: [...otherMonthsEntries, ...result.nextMonthEntries],
      debtsByMonth: {
        ...state.debtsByMonth,
        [result.nextMonthKey]: result.nextMonthDebts,
      },
      savingsBucketsByMonth: {
        ...state.savingsBucketsByMonth,
        [result.nextMonthKey]: result.nextMonthSavingsBuckets,
      },
      closedSnapshots: {
        ...state.closedSnapshots,
        [currentMonthKey]: result.snapshot,
      },
    });

    if (state.authUser?.provider === 'firebase') {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.closeMonth(state.authUser.uid, currentMonthKey, closedAtIso);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al cerrar mes en Firestore';
        set({ syncMessage: `Aviso Firestore: ${msg}` });
      }
    }

    return result;
  },

  resetToOctober2026GoldenState: () => {
    set(buildInitialState(DEMO_OWNER_USER));
  },
}));
