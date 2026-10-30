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
  buildDebtPaymentsForInstallment,
  closeMonthAndRollover,
  deleteMovement,
  registerMovement,
  toBogotaIsoDate,
  uncompleteMovement,
  type CloseMonthResult,
  type Concept,
  type ConceptGroup,
  type ConceptType,
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
import {
  buildWidgetSnapshotV1,
  syncWidgetSnapshotNative,
  type WidgetSyncResult,
} from '../../../platform/widgets';

export type BFlowWorkspaceTab = 'summary' | 'checklist' | 'debts' | 'savings' | 'analytics';

export interface EditEntryUpdates {
  conceptName: string;
  actualAmount: number;
  plannedAmount?: number;
  note?: string;
}

export interface CreateCustomConceptInput {
  monthKey: string;
  name: string;
  type: ConceptType;
  group: ConceptGroup;
  amountCop: number;
  note?: string;
}

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
  createCustomConceptAndMovement: (input: CreateCustomConceptInput) => Promise<void>;
  editEntry: (entryId: string, updates: EditEntryUpdates) => Promise<void>;
  deleteEntryById: (entryId: string) => Promise<void>;
  removeOrResetEntry: (entryId: string) => Promise<void>;
  updateFunfamiInstallmentAmount: (monthKey: string, newAmountCop: number) => Promise<void>;
  closeCurrentMonth: (closedAtIso?: string) => Promise<CloseMonthResult>;
  reopenClosedMonth: (monthKey: string) => Promise<void>;
  deleteOrRevertMonth: (monthKey: string) => Promise<void>;
  resetToOctober2026GoldenState: () => void;
  syncActiveWidget: () => Promise<WidgetSyncResult>;
}

function triggerWidgetSync(state: BudgetStoreState): Promise<WidgetSyncResult> {
  try {
    const monthDebts =
      state.debtsByMonth[state.activeMonthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const monthSavings =
      state.savingsBucketsByMonth[state.activeMonthKey] ??
      state.savingsBucketsByMonth['2026-10'] ??
      [];
    const snapshot = buildWidgetSnapshotV1({
      monthKey: state.activeMonthKey,
      concepts: state.concepts,
      entries: state.entries,
      debts: monthDebts,
      debtPayments: state.debtPayments,
      savingsBuckets: monthSavings,
    });
    return syncWidgetSnapshotNative(snapshot);
  } catch {
    return Promise.resolve({
      synced: false,
      mode: 'mode-a-preview' as const,
      appGroupId: 'group.com.bflow.app',
    });
  }
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

  toggleEntryStatus: async (entryId, completedAtDateIso = toBogotaIsoDate()) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const wasCompleted = target.status === 'completed';
    const nextEntries = wasCompleted
      ? uncompleteMovement(state.entries, entryId)
      : registerMovement(state.entries, state.concepts, {
          monthKey: target.monthKey,
          conceptId: target.conceptId,
          actualAmount: target.actualAmount > 0 ? target.actualAmount : target.plannedAmount,
          completedAt: completedAtDateIso,
        });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    const concept = state.concepts.find((c) => c.id === target.conceptId);

    let nextDebtPayments = state.debtPayments;
    if (concept?.linkedDebtGroup && updatedEntry) {
      const monthDebts =
        state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
      const cascadedPayments = buildDebtPaymentsForInstallment(updatedEntry, monthDebts);
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (state.authUser?.provider === 'firebase') {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.toggleEntryCompletion(state.authUser.uid, entryId, target.monthKey, {
          actualAmount: target.actualAmount > 0 ? target.actualAmount : target.plannedAmount,
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
        const monthDebts =
          state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
        const cascadedPayments = buildDebtPaymentsForInstallment(updatedEntry, monthDebts);
        nextDebtPayments = [
          ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
          ...cascadedPayments,
        ];
      }
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

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

  createCustomConceptAndMovement: async (input) => {
    const state = get();
    const safeAmount = Math.max(0, Math.round(input.amountCop));
    const trimmedName = input.name.trim();
    if (!trimmedName || safeAmount <= 0) return;

    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const customConceptId = `${input.type === 'income' ? 'inc' : 'exp'}_custom_${slug}_${Date.now().toString(36)}`;
    const newConcept: Concept = {
      id: customConceptId,
      name: trimmedName,
      type: input.type,
      group: input.group,
      defaultAmount: safeAmount,
      recurrence: { kind: 'monthly' },
      allowMultiplePerMonth: false,
      archived: false,
      order: state.concepts.length + 1,
    };

    const newEntry: MonthEntry = {
      id: `${input.monthKey}_${customConceptId}`,
      monthKey: input.monthKey,
      conceptId: customConceptId,
      conceptName: trimmedName,
      type: input.type,
      group: input.group,
      plannedAmount: safeAmount,
      actualAmount: safeAmount,
      status: 'completed',
      completedAt: toBogotaIsoDate(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };

    set({
      concepts: [...state.concepts, newConcept],
      entries: [...state.entries, newEntry],
    });
    triggerWidgetSync(get());
  },

  editEntry: async (entryId, updates) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const safeActual = Math.max(0, Math.round(updates.actualAmount));
    const safePlanned =
      updates.plannedAmount !== undefined
        ? Math.max(0, Math.round(updates.plannedAmount))
        : safeActual;
    const nextName = updates.conceptName.trim() || target.conceptName;
    const trimmedNote = updates.note?.trim();

    const updatedEntry: MonthEntry = {
      ...target,
      conceptName: nextName,
      actualAmount: safeActual,
      plannedAmount: safePlanned,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };
    if (!trimmedNote && 'note' in updatedEntry) {
      delete (updatedEntry as { note?: string }).note;
    }

    const nextEntries = state.entries.map((e) => (e.id === entryId ? updatedEntry : e));
    const nextConcepts = state.concepts.map((c) =>
      c.id === target.conceptId ? { ...c, name: nextName, defaultAmount: safePlanned } : c
    );

    let nextDebtPayments = state.debtPayments;
    const concept = state.concepts.find((c) => c.id === target.conceptId);
    if (concept?.linkedDebtGroup) {
      const monthDebts =
        state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
      const cascadedPayments = buildDebtPaymentsForInstallment(updatedEntry, monthDebts);
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
    }

    set({
      entries: nextEntries,
      concepts: nextConcepts,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());
  },

  deleteEntryById: async (entryId) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const nextEntries = state.entries.filter((e) => e.id !== entryId);
    const nextDebtPayments = state.debtPayments.filter((dp) => dp.entryId !== entryId);

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

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

  removeOrResetEntry: async (entryId) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    const nextEntries = deleteMovement(state.entries, state.concepts, entryId);
    const concept = target ? state.concepts.find((c) => c.id === target.conceptId) : undefined;

    let nextDebtPayments = state.debtPayments;
    if (target && concept?.linkedDebtGroup) {
      nextDebtPayments = state.debtPayments.map((dp) => {
        if (dp.entryId !== entryId) return dp;
        const { completedAt: _removed, ...restPayment } = dp;
        return {
          ...restPayment,
          principalAmount: target.plannedAmount,
          totalApplied: target.plannedAmount + dp.interestAmount,
          active: false,
        };
      });
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

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

  updateFunfamiInstallmentAmount: async (monthKey, newAmountCop) => {
    const state = get();
    const safeAmount = Math.max(0, Math.round(newAmountCop));
    if (safeAmount <= 0) return;

    const funfamiEntry = state.entries.find(
      (e) => e.monthKey === monthKey && e.conceptId === 'exp_cuota_funfami'
    );
    if (!funfamiEntry) return;

    const updatedEntry: MonthEntry = {
      ...funfamiEntry,
      plannedAmount: safeAmount,
      actualAmount: safeAmount,
    };

    const nextEntries = state.entries.map((e) => (e.id === funfamiEntry.id ? updatedEntry : e));
    const monthDebts = state.debtsByMonth[monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const cascadedPayments = buildDebtPaymentsForInstallment(updatedEntry, monthDebts);

    const nextDebtPayments = [
      ...state.debtPayments.filter((dp) => dp.entryId !== funfamiEntry.id),
      ...cascadedPayments,
    ];

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
  },

  closeCurrentMonth: async (closedAtIso = new Date().toISOString()) => {
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
    triggerWidgetSync(get());

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

  reopenClosedMonth: async (monthKey) => {
    const state = get();
    const nextClosedSnapshots = { ...state.closedSnapshots };
    delete nextClosedSnapshots[monthKey];

    set({
      activeMonthKey: monthKey,
      closedSnapshots: nextClosedSnapshots,
    });
  },

  deleteOrRevertMonth: async (monthKey) => {
    const state = get();
    const sortedMonths = [...state.availableMonths].sort();

    if (sortedMonths.length <= 1) {
      // Only 1 month exists: simply clear any closed snapshot on it so it returns to open state
      const nextSnapshots = { ...state.closedSnapshots };
      delete nextSnapshots[monthKey];
      set({
        activeMonthKey: monthKey,
        closedSnapshots: nextSnapshots,
      });
      return;
    }

    const remainingMonths = sortedMonths.filter((m) => m !== monthKey);
    const targetIndex = sortedMonths.indexOf(monthKey);
    const fallbackMonth =
      remainingMonths[Math.max(0, targetIndex - 1)] ?? remainingMonths[0] ?? '2026-10';

    const nextDebtsByMonth = { ...state.debtsByMonth };
    delete nextDebtsByMonth[monthKey];

    const nextSavingsByMonth = { ...state.savingsBucketsByMonth };
    delete nextSavingsByMonth[monthKey];

    const nextSnapshots = { ...state.closedSnapshots };
    delete nextSnapshots[monthKey];
    // Also reopen the previous month snapshot so if the user closed it by accident, it's open again
    delete nextSnapshots[fallbackMonth];

    set({
      activeMonthKey: fallbackMonth,
      availableMonths: remainingMonths,
      entries: state.entries.filter((e) => e.monthKey !== monthKey),
      debtsByMonth: nextDebtsByMonth,
      savingsBucketsByMonth: nextSavingsByMonth,
      debtPayments: state.debtPayments.filter((dp) => dp.monthKey !== monthKey),
      closedSnapshots: nextSnapshots,
    });
  },

  resetToOctober2026GoldenState: () => {
    set(buildInitialState(DEMO_OWNER_USER));
    triggerWidgetSync(get());
  },

  syncActiveWidget: async () => {
    return triggerWidgetSync(get());
  },
}));
