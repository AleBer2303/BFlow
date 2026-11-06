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
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
  isOwnerCanonicalEmail,
  type FullCloudAccountData,
  type InitialAccountSetupPayload,
} from '../../../data/repositories/budgetRepository';
import { buildOctober2026SeedPayload } from '../../../data/seed/october2026SeedData';
import {
  buildDebtPaymentsForInstallment,
  closeMonthAndRollover,
  deleteMovement,
  getMonthNumberFromMonthKey,
  registerMovement,
  sumMoneyIntegers,
  toBogotaIsoDate,
  toBogotaMonthKey,
  toggleMovementStatus,
  type CloseMonthResult,
  type Concept,
  type ConceptGroup,
  type ConceptType,
  type Debt,
  type DebtInterestRateType,
  type DebtPayment,
  type IdealMotoPlan,
  type MonthEntry,
  type MonthSnapshot,
  type ProvisionItemSpec,
  type RegisterOrCompleteMovementInput,
  type SavingsBucket,
} from '../../../domain';
import {
  DEMO_OWNER_USER,
  loadPersistedSession,
  savePersistedSession,
  type BFlowAuthUser,
} from '../../../platform/auth/authAdapter';
import {
  buildWidgetSnapshotV1,
  syncWidgetSnapshotNative,
  type WidgetSyncResult,
} from '../../../platform/widgets';

export type BFlowWorkspaceTab =
  | 'summary'
  | 'checklist'
  | 'debts'
  | 'savings'
  | 'analytics'
  | 'account';

export interface EditEntryUpdates {
  conceptName: string;
  actualAmount: number;
  plannedAmount?: number;
  note?: string;
  targetDebtId?: string | null;
  savingsBucketId?: string | null;
  persistMonthly?: boolean;
}

export interface CreateCustomConceptInput {
  monthKey: string;
  name: string;
  type: ConceptType;
  group: ConceptGroup;
  amountCop: number;
  note?: string;
  targetDebtId?: string | null;
  savingsBucketId?: string | null;
  persistMonthly?: boolean;
  markCompleted?: boolean;
}

export interface SaveProvisionItemInput {
  id?: string;
  name: string;
  amount: number;
  periodMonths: number;
  priority: string;
  kind: 'recurring' | 'target_goal';
  notes?: string;
}

export interface InitialOnboardingConfigInput {
  monthKey: string;
  incomes: Array<{
    name: string;
    amountCop: number;
    group: ConceptGroup;
    persistMonthly: boolean;
    completed?: boolean;
  }>;
  expenses: Array<{
    name: string;
    amountCop: number;
    group: ConceptGroup;
    persistMonthly: boolean;
    targetDebtKey?: string | null;
    savingsBucketKey?: string | null;
    completed?: boolean;
  }>;
  debts: Array<{
    key?: string;
    name: string;
    lender: string;
    openingBalanceCop: number;
    interestRate?: number;
    interestRateType?: DebtInterestRateType;
    monthlyInstallmentCop?: number;
  }>;
  savingsBuckets: Array<{
    id?: string;
    name: string;
    openingBalanceCop: number;
  }>;
  provisions?: Array<{
    name: string;
    amountCop: number;
    periodMonths: number;
    priority: string;
    kind: 'recurring' | 'target_goal';
    notes?: string;
  }>;
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
  needsOnboarding: boolean;

  setActiveTab: (tab: BFlowWorkspaceTab) => void;
  setActiveMonthKey: (monthKey: string) => void;
  setAuthUser: (user: BFlowAuthUser | null) => void;
  updateAuthUserProfile: (updates: {
    displayName?: string;
    email?: string;
    financialGoal?: string;
  }) => Promise<void>;
  clearWorkspaceSession: () => void;
  requireAuthenticationGate: () => void;
  setSyncStatus: (message: string, isSyncing?: boolean) => void;
  setNeedsOnboarding: (needsOnboarding: boolean) => void;
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
  addOrCompleteMovement: (
    input: RegisterOrCompleteMovementInput & {
      targetDebtId?: string | null;
      savingsBucketId?: string | null;
    }
  ) => Promise<void>;
  createCustomConceptAndMovement: (input: CreateCustomConceptInput) => Promise<void>;
  updateConcept: (
    conceptId: string,
    updates: {
      name?: string;
      defaultAmount?: number;
      group?: ConceptGroup;
      targetDebtId?: string | null;
      savingsBucketId?: string | null;
      persistMonthly?: boolean;
    }
  ) => Promise<void>;
  deleteConcept: (conceptId: string) => Promise<void>;
  createDebt: (
    monthKey: string,
    debt: {
      name: string;
      lender: string;
      openingBalance: number;
      monthlyInterestRate?: number;
      annualInterestRate?: number;
      interestRateType?: DebtInterestRateType;
      monthlyInstallment?: number;
      groupKey?: string;
    }
  ) => Promise<Debt>;
  updateDebt: (
    monthKey: string,
    debtId: string,
    updates: {
      name?: string;
      lender?: string;
      openingBalance?: number;
      monthlyInterestRate?: number;
      annualInterestRate?: number;
      interestRateType?: DebtInterestRateType;
      monthlyInstallment?: number;
    }
  ) => Promise<void>;
  deleteDebt: (monthKey: string, debtId: string) => Promise<void>;
  updateSavingsOpeningBalance: (
    monthKey: string,
    bucketId: string,
    newBalanceCop: number,
    bucketName?: string
  ) => Promise<void>;
  createSavingsBucket: (
    monthKey: string,
    name: string,
    openingBalanceCop: number
  ) => Promise<SavingsBucket | null>;
  deleteSavingsBucket: (monthKey: string, bucketId: string) => Promise<void>;
  saveProvisionItem: (input: SaveProvisionItemInput) => Promise<void>;
  deleteProvisionItem: (itemId: string) => Promise<void>;
  editEntry: (entryId: string, updates: EditEntryUpdates) => Promise<void>;
  deleteEntryById: (entryId: string) => Promise<void>;
  removeOrResetEntry: (entryId: string) => Promise<void>;
  updateFunfamiInstallmentAmount: (monthKey: string, newAmountCop: number) => Promise<void>;
  closeCurrentMonth: (closedAtIso?: string) => Promise<CloseMonthResult>;
  reopenClosedMonth: (monthKey: string) => Promise<void>;
  deleteOrRevertMonth: (monthKey: string) => Promise<void>;
  completeInitialAccountSetup: (input: InitialOnboardingConfigInput) => Promise<void>;
  resetFullAccount: (newStartMonthKey?: string) => Promise<void>;
  resetToOctober2026GoldenState: () => void;
  syncActiveWidget: () => Promise<WidgetSyncResult>;
}

function recalculateProvisionPlan(items: readonly ProvisionItemSpec[]): IdealMotoPlan {
  const normalizedItems = items.map((item) => ({ ...item }));
  const recurringMonthlyTotalCop = sumMoneyIntegers(
    normalizedItems
      .filter((i) => i.kind === 'recurring_provision')
      .map((i) => i.monthlyAmountCop)
  );
  const goalsTotalCop = sumMoneyIntegers(
    normalizedItems
      .filter((i) => i.kind === 'target_goal')
      .map((i) => i.targetAmountCop ?? i.monthlyAmountCop)
  );
  const totalWithTargetGoalCop = recurringMonthlyTotalCop + goalsTotalCop;
  return {
    items: normalizedItems,
    recurringMonthlyTotalCop,
    totalWithTargetGoalCop,
  };
}

function applyConceptLinkageUpdates(
  concept: Concept,
  monthKey: string,
  monthDebts: readonly Debt[],
  updates: {
    targetDebtId?: string | null;
    savingsBucketId?: string | null;
    persistMonthly?: boolean;
  }
): Concept {
  const next: Concept = { ...concept };

  if (updates.targetDebtId !== undefined) {
    if (updates.targetDebtId) {
      const targetDebt = monthDebts.find((d) => d.id === updates.targetDebtId);
      next.linkedDebtGroup = targetDebt?.groupKey ?? 'FUNFAMI';
      next.defaultTargetDebtId = updates.targetDebtId;
    } else {
      delete next.linkedDebtGroup;
      delete next.defaultTargetDebtId;
    }
  }

  if (updates.savingsBucketId !== undefined) {
    if (updates.savingsBucketId) {
      next.savingsContribution = {
        bucketId: updates.savingsBucketId,
        onlyWhenCompleted: true,
      };
    } else {
      delete next.savingsContribution;
    }
  }

  if (updates.persistMonthly !== undefined) {
    next.recurrence = updates.persistMonthly
      ? { kind: 'monthly' }
      : { kind: 'specific_months', months: [getMonthNumberFromMonthKey(monthKey)] };
  }

  return next;
}

function triggerWidgetSync(state: BudgetStoreState): Promise<WidgetSyncResult> {
  try {
    const monthDebts = state.debtsByMonth[state.activeMonthKey] ?? [];
    const monthSavings = state.savingsBucketsByMonth[state.activeMonthKey] ?? [];
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

function isRealAuthUser(user: BFlowAuthUser | null): user is BFlowAuthUser {
  return Boolean(
    user &&
      user.provider === 'firebase' &&
      user.uid &&
      user.uid !== 'local-owner' &&
      user.uid !== 'local-demo' &&
      process.env.NODE_ENV !== 'test'
  );
}

function resolveDefaultInitialAuthUser(): BFlowAuthUser | null {
  if (process.env.NODE_ENV === 'test') {
    return DEMO_OWNER_USER;
  }
  return loadPersistedSession();
}

function buildCleanEmptyWorkspaceState(authUser: BFlowAuthUser | null) {
  const defaultMonth =
    authUser?.activeMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(authUser.activeMonthKey)
      ? authUser.activeMonthKey
      : isOwnerCanonicalEmail(authUser?.email)
        ? '2026-10'
        : `${toBogotaMonthKey().slice(0, 4)}-01`;

  return {
    activeTab: 'summary' as BFlowWorkspaceTab,
    activeMonthKey: defaultMonth,
    availableMonths: [defaultMonth],
    concepts: [] as Concept[],
    entries: [] as MonthEntry[],
    debtsByMonth: (authUser
      ? { [defaultMonth]: [] }
      : {}) as Record<string, Debt[]>,
    debtPayments: [] as DebtPayment[],
    savingsBucketsByMonth: (authUser
      ? { [defaultMonth]: ensureStandardSavingsBuckets([], 0, 0) }
      : {}) as Record<string, SavingsBucket[]>,
    idealMotoPlan: { ...EMPTY_PROVISION_PLAN, items: [] },
    closedSnapshots: {} as Record<string, MonthSnapshot>,
    authUser,
    syncMessage: '',
    isSyncing: false,
    needsOnboarding: false,
  };
}

function buildInitialState(authUserOverride?: BFlowAuthUser | null) {
  const resolvedUser =
    authUserOverride !== undefined ? authUserOverride : resolveDefaultInitialAuthUser();

  if (process.env.NODE_ENV !== 'test' && !isOwnerCanonicalEmail(resolvedUser?.email)) {
    return buildCleanEmptyWorkspaceState(resolvedUser);
  }

  const seed = buildOctober2026SeedPayload();

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
    syncMessage: '',
    isSyncing: false,
    needsOnboarding: false,
  };
}

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  ...buildInitialState(),

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

  setAuthUser: (user) => {
    const prevUser = get().authUser;
    if (!user) {
      set(buildCleanEmptyWorkspaceState(null));
      return;
    }
    const isSwitchingAccount =
      !prevUser ||
      prevUser.uid !== user.uid ||
      (prevUser.email ?? '').trim().toLowerCase() !== (user.email ?? '').trim().toLowerCase();

    if (isSwitchingAccount) {
      if (process.env.NODE_ENV === 'test' && isOwnerCanonicalEmail(user.email)) {
        set(buildInitialState(user));
      } else {
        set(buildCleanEmptyWorkspaceState(user));
      }
      return;
    }
    set({ authUser: user });
  },

  updateAuthUserProfile: async (updates) => {
    const current = get().authUser;
    if (!current) return;
    const updatedUser: BFlowAuthUser = {
      ...current,
      ...(updates.displayName !== undefined
        ? { displayName: updates.displayName.trim() || current.displayName }
        : {}),
      ...(updates.email !== undefined ? { email: updates.email.trim() || current.email } : {}),
      ...(updates.financialGoal !== undefined ? { financialGoal: updates.financialGoal.trim() } : {}),
    };
    savePersistedSession(updatedUser);
    set({ authUser: updatedUser });
  },

  clearWorkspaceSession: () => {
    set(buildCleanEmptyWorkspaceState(null));
  },

  requireAuthenticationGate: () => set(buildCleanEmptyWorkspaceState(null)),

  setSyncStatus: (message, isSyncing = false) => set({ syncMessage: message, isSyncing }),

  setNeedsOnboarding: (needsOnboarding) => set({ needsOnboarding }),

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
      needsOnboarding: payload.needsOnboarding ?? false,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());
  },

  toggleEntryStatus: async (entryId, completedAtDateIso = toBogotaIsoDate()) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const nextEntries = toggleMovementStatus(state.entries, entryId, {
      completedAt: completedAtDateIso,
    });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    const concept = state.concepts.find((c) => c.id === target.conceptId);

    let nextDebtPayments = state.debtPayments;
    if ((concept?.linkedDebtGroup || concept?.defaultTargetDebtId) && updatedEntry) {
      const monthDebts =
        state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
      const cascadedPayments = buildDebtPaymentsForInstallment(
        updatedEntry,
        monthDebts,
        undefined,
        concept.defaultTargetDebtId
      );
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

    if (updatedEntry && isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          concept,
          nextDebtPayments.filter((dp) => dp.entryId === entryId)
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  addOrCompleteMovement: async (input) => {
    const state = get();
    const monthDebts =
      state.debtsByMonth[input.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    let concept = state.concepts.find((c) => c.id === input.conceptId);
    let nextConcepts = state.concepts;

    if (
      concept &&
      (input.targetDebtId !== undefined || input.savingsBucketId !== undefined)
    ) {
      concept = applyConceptLinkageUpdates(concept, input.monthKey, monthDebts, {
        targetDebtId: input.targetDebtId,
        savingsBucketId: input.savingsBucketId,
      });
      nextConcepts = state.concepts.map((c) => (c.id === concept!.id ? concept! : c));
    }

    const nextEntries = registerMovement(state.entries, nextConcepts, input);
    const updatedEntry = nextEntries.find(
      (e) =>
        e.monthKey === input.monthKey &&
        e.conceptId === input.conceptId &&
        (!state.entries.some((prev) => prev.id === e.id && prev.status === 'completed') ||
          !concept?.allowMultiplePerMonth)
    );

    let nextDebtPayments = state.debtPayments;
    if ((concept?.linkedDebtGroup || concept?.defaultTargetDebtId) && updatedEntry) {
      const cascadedPayments = buildDebtPaymentsForInstallment(
        updatedEntry,
        monthDebts,
        undefined,
        concept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
    }

    set({
      concepts: nextConcepts,
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (updatedEntry && isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          concept,
          nextDebtPayments.filter((dp) => dp.entryId === updatedEntry.id)
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  createCustomConceptAndMovement: async (input) => {
    const state = get();
    const safeAmount = Math.max(0, Math.round(input.amountCop));
    const trimmedName = input.name.trim();
    if (!trimmedName || safeAmount <= 0) return;

    const monthDebts =
      state.debtsByMonth[input.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const customConceptId = `${input.type === 'income' ? 'inc' : 'exp'}_custom_${slug}_${Date.now().toString(36)}`;
    const baseConcept: Concept = {
      id: customConceptId,
      name: trimmedName,
      type: input.type,
      group: input.group,
      defaultAmount: safeAmount,
      recurrence:
        input.persistMonthly === false
          ? { kind: 'specific_months', months: [getMonthNumberFromMonthKey(input.monthKey)] }
          : { kind: 'monthly' },
      allowMultiplePerMonth: false,
      archived: false,
      order: state.concepts.length + 1,
    };

    const newConcept = applyConceptLinkageUpdates(
      baseConcept,
      input.monthKey,
      monthDebts,
      {
        targetDebtId: input.targetDebtId,
        savingsBucketId: input.savingsBucketId,
        persistMonthly: input.persistMonthly,
      }
    );

    const isCompleted = input.markCompleted !== false;
    const newEntry: MonthEntry = {
      id: `${input.monthKey}_${customConceptId}`,
      monthKey: input.monthKey,
      conceptId: customConceptId,
      conceptName: trimmedName,
      type: input.type,
      group: input.group,
      plannedAmount: safeAmount,
      actualAmount: safeAmount,
      status: isCompleted ? 'completed' : 'pending',
      ...(isCompleted ? { completedAt: toBogotaIsoDate() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };

    let createdPayments: DebtPayment[] = [];
    let nextDebtPayments = state.debtPayments;
    if (newConcept.linkedDebtGroup || newConcept.defaultTargetDebtId) {
      createdPayments = buildDebtPaymentsForInstallment(
        newEntry,
        monthDebts,
        undefined,
        newConcept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== newEntry.id),
        ...createdPayments,
      ];
    }

    set({
      concepts: [...state.concepts, newConcept],
      entries: [...state.entries, newEntry],
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveCustomConceptAndEntry(
          state.authUser.uid,
          newConcept,
          newEntry,
          createdPayments
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  updateConcept: async (conceptId, updates) => {
    const state = get();
    const target = state.concepts.find((c) => c.id === conceptId);
    if (!target) return;

    const monthDebts =
      state.debtsByMonth[state.activeMonthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const baseUpdated: Concept = {
      ...target,
      ...(updates.name?.trim() ? { name: updates.name.trim() } : {}),
      ...(updates.defaultAmount !== undefined
        ? { defaultAmount: Math.max(0, Math.round(updates.defaultAmount)) }
        : {}),
      ...(updates.group ? { group: updates.group } : {}),
    };

    const updatedConcept = applyConceptLinkageUpdates(
      baseUpdated,
      state.activeMonthKey,
      monthDebts,
      {
        targetDebtId: updates.targetDebtId,
        savingsBucketId: updates.savingsBucketId,
        persistMonthly: updates.persistMonthly,
      }
    );

    const nextConcepts = state.concepts.map((c) => (c.id === conceptId ? updatedConcept : c));
    const nextEntries = state.entries.map((entry) => {
      if (entry.conceptId !== conceptId) return entry;
      return {
        ...entry,
        conceptName: updatedConcept.name,
        group: updatedConcept.group,
        ...(entry.status === 'pending' && updates.defaultAmount !== undefined
          ? {
              plannedAmount: updatedConcept.defaultAmount,
              actualAmount: updatedConcept.defaultAmount,
            }
          : {}),
      };
    });

    let nextDebtPayments = state.debtPayments;
    const activeEntry = nextEntries.find(
      (e) => e.conceptId === conceptId && e.monthKey === state.activeMonthKey
    );
    if (activeEntry && updates.targetDebtId !== undefined) {
      if (updatedConcept.linkedDebtGroup || updatedConcept.defaultTargetDebtId) {
        const cascaded = buildDebtPaymentsForInstallment(
          activeEntry,
          monthDebts,
          undefined,
          updatedConcept.defaultTargetDebtId
        );
        nextDebtPayments = [
          ...state.debtPayments.filter((dp) => dp.entryId !== activeEntry.id),
          ...cascaded,
        ];
      } else {
        nextDebtPayments = state.debtPayments.filter((dp) => dp.entryId !== activeEntry.id);
      }
    }

    set({
      concepts: nextConcepts,
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        if (activeEntry) {
          await repo.saveOrUpdateEntry(
            state.authUser.uid,
            activeEntry,
            updatedConcept,
            nextDebtPayments.filter((dp) => dp.entryId === activeEntry.id)
          );
        } else {
          await repo.saveConcept(state.authUser.uid, updatedConcept);
        }
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteConcept: async (conceptId) => {
    const state = get();
    const nextConcepts = state.concepts.filter((c) => c.id !== conceptId);
    const nextEntries = state.entries.filter(
      (e) => !(e.conceptId === conceptId && e.status === 'pending')
    );

    set({
      concepts: nextConcepts,
      entries: nextEntries,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteConcept(state.authUser.uid, conceptId);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  createDebt: async (monthKey, input) => {
    const state = get();
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

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveDebt(state.authUser.uid, newDebt);
      } catch {
        set({ syncMessage: '' });
      }
    }

    return newDebt;
  },

  updateDebt: async (monthKey, debtId, updates) => {
    const state = get();
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

    if (updatedDebt && isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveDebt(state.authUser.uid, updatedDebt);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteDebt: async (monthKey, debtId) => {
    const state = get();
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

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteDebt(state.authUser.uid, debtId);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  updateSavingsOpeningBalance: async (monthKey, bucketId, newBalanceCop, bucketName) => {
    const state = get();
    const safeAmount = Math.max(0, Math.round(newBalanceCop));
    const monthBuckets = ensureStandardSavingsBuckets(
      state.savingsBucketsByMonth[monthKey] ?? []
    );
    const targetBucket = monthBuckets.find((b) => b.id === bucketId);
    const resolvedName = bucketName?.trim() || targetBucket?.name || bucketId;
    const nextBuckets = targetBucket
      ? monthBuckets.map((b) =>
          b.id === bucketId
            ? { ...b, name: resolvedName, openingBalance: safeAmount, monthKey }
            : b
        )
      : [
          ...monthBuckets,
          { id: bucketId, name: resolvedName, openingBalance: safeAmount, monthKey },
        ];

    const nextSavingsByMonth: Record<string, SavingsBucket[]> = {
      ...state.savingsBucketsByMonth,
      [monthKey]: nextBuckets,
    };
    for (const [mk, list] of Object.entries(nextSavingsByMonth)) {
      if (mk === monthKey) continue;
      if (!list.some((b) => b.id === bucketId)) continue;
      nextSavingsByMonth[mk] = list.map((b) =>
        b.id === bucketId ? { ...b, name: resolvedName } : b
      );
    }

    set({
      savingsBucketsByMonth: nextSavingsByMonth,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveSavingsBucket(
          state.authUser.uid,
          bucketId,
          safeAmount,
          monthKey,
          resolvedName
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  createSavingsBucket: async (monthKey, name, openingBalanceCop) => {
    const state = get();
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const safeAmount = Math.max(0, Math.round(openingBalanceCop));
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const bucketId = `bucket_${slug || 'ahorro'}_${Date.now().toString(36)}`;
    const newBucket: SavingsBucket = {
      id: bucketId,
      name: trimmedName,
      openingBalance: safeAmount,
      monthKey,
    };

    const monthBuckets = ensureStandardSavingsBuckets(
      state.savingsBucketsByMonth[monthKey] ?? []
    );
    const nextBuckets = [...monthBuckets, newBucket];

    set({
      savingsBucketsByMonth: {
        ...state.savingsBucketsByMonth,
        [monthKey]: nextBuckets,
      },
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveSavingsBucket(
          state.authUser.uid,
          bucketId,
          safeAmount,
          monthKey,
          trimmedName
        );
      } catch {
        set({ syncMessage: '' });
      }
    }

    return newBucket;
  },

  deleteSavingsBucket: async (monthKey, bucketId) => {
    const state = get();
    const nextSavingsByMonth: Record<string, SavingsBucket[]> = {};
    for (const [mk, list] of Object.entries(state.savingsBucketsByMonth)) {
      nextSavingsByMonth[mk] = list.filter((b) => b.id !== bucketId);
    }
    if (!nextSavingsByMonth[monthKey]) {
      nextSavingsByMonth[monthKey] = [];
    }

    const nextConcepts = state.concepts.map((c) => {
      if (c.savingsContribution?.bucketId !== bucketId) return c;
      const { savingsContribution: _removed, ...rest } = c;
      return rest;
    });

    set({
      concepts: nextConcepts,
      savingsBucketsByMonth: nextSavingsByMonth,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteSavingsBucket(state.authUser.uid, bucketId);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  saveProvisionItem: async (input) => {
    const state = get();
    const trimmedName = input.name.trim();
    const safeAmount = Math.max(0, Math.round(input.amount));
    const safePeriodMonths = Math.max(1, Math.round(input.periodMonths));
    if (!trimmedName || safeAmount <= 0) return;

    const monthlyContribution = Math.ceil(safeAmount / safePeriodMonths);
    const itemId =
      input.id ??
      `prov_${trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}_${Date.now().toString(36)}`;

    const nextItem: ProvisionItemSpec = {
      id: itemId,
      excelRawName: trimmedName,
      displayName: trimmedName,
      monthlyAmountCop: monthlyContribution,
      cycleCostCop: safeAmount,
      periodMonths: safePeriodMonths,
      ceilMonthlyCop: monthlyContribution,
      ...(input.kind === 'target_goal' ? { targetAmountCop: safeAmount } : {}),
      includedInExcelTotalB43: input.kind === 'recurring',
      kind: input.kind === 'target_goal' ? 'target_goal' : 'recurring_provision',
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };

    const existingItems = state.idealMotoPlan.items;
    const exists = existingItems.some((i) => i.id === itemId);
    const nextItems = exists
      ? existingItems.map((i) => (i.id === itemId ? nextItem : i))
      : [...existingItems, nextItem];

    const nextPlan = recalculateProvisionPlan(nextItems);
    set({ idealMotoPlan: nextPlan });

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveProvisionPlan(state.authUser.uid, nextPlan);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteProvisionItem: async (itemId) => {
    const state = get();
    const nextItems = state.idealMotoPlan.items.filter((i) => i.id !== itemId);
    const nextPlan = recalculateProvisionPlan(nextItems);
    set({ idealMotoPlan: nextPlan });

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveProvisionPlan(state.authUser.uid, nextPlan);
      } catch {
        set({ syncMessage: '' });
      }
    }
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

    const monthDebts =
      state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const existingConcept = state.concepts.find((c) => c.id === target.conceptId);
    const updatedConcept = existingConcept
      ? applyConceptLinkageUpdates(
          {
            ...existingConcept,
            name: nextName,
            defaultAmount: safePlanned,
          },
          updatedEntry.monthKey,
          monthDebts,
          {
            targetDebtId: updates.targetDebtId,
            savingsBucketId: updates.savingsBucketId,
            persistMonthly: updates.persistMonthly,
          }
        )
      : undefined;

    const nextEntries = state.entries.map((e) => (e.id === entryId ? updatedEntry : e));
    const nextConcepts = state.concepts.map((c) =>
      c.id === target.conceptId && updatedConcept ? updatedConcept : c
    );

    let nextDebtPayments = state.debtPayments;
    let entryPaymentsForCloud: DebtPayment[] | undefined;

    if (updatedConcept?.linkedDebtGroup || updatedConcept?.defaultTargetDebtId) {
      const cascadedPayments = buildDebtPaymentsForInstallment(
        updatedEntry,
        monthDebts,
        undefined,
        updatedConcept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
      entryPaymentsForCloud = cascadedPayments;
    } else if (updates.targetDebtId === null || updates.targetDebtId === '') {
      nextDebtPayments = state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id);
      entryPaymentsForCloud = [];
    }

    set({
      entries: nextEntries,
      concepts: nextConcepts,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          updatedConcept,
          entryPaymentsForCloud ?? nextDebtPayments.filter((dp) => dp.entryId === entryId)
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
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

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteEntryCompletely(state.authUser.uid, entryId);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  removeOrResetEntry: async (entryId) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    const nextEntries = deleteMovement(state.entries, state.concepts, entryId);
    const concept = target ? state.concepts.find((c) => c.id === target.conceptId) : undefined;

    let nextDebtPayments = state.debtPayments;
    if (target && (concept?.linkedDebtGroup || concept?.defaultTargetDebtId)) {
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

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteOrResetEntry(state.authUser.uid, entryId);
      } catch {
        set({ syncMessage: '' });
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
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          undefined,
          cascadedPayments
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  closeCurrentMonth: async (closedAtIso = new Date().toISOString()) => {
    const state = get();
    const currentMonthKey = state.activeMonthKey;
    const currentDebts = state.debtsByMonth[currentMonthKey] ?? [];
    const currentBuckets = ensureStandardSavingsBuckets(
      state.savingsBucketsByMonth[currentMonthKey] ?? []
    );
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
    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: result.nextMonthKey }
      : null;

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
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.persistMonthCloseResult(state.authUser.uid, currentMonthKey, result);
      } catch {
        set({ syncMessage: '' });
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
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.reopenMonthInCloud(state.authUser.uid, monthKey);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteOrRevertMonth: async (monthKey) => {
    const state = get();
    const sortedMonths = [...state.availableMonths].sort();

    if (sortedMonths.length <= 1) {
      const nextSnapshots = { ...state.closedSnapshots };
      delete nextSnapshots[monthKey];
      set({
        activeMonthKey: monthKey,
        closedSnapshots: nextSnapshots,
      });
      triggerWidgetSync(get());
      if (isRealAuthUser(state.authUser)) {
        try {
          const repo = new FirestoreBudgetRepository();
          await repo.reopenMonthInCloud(state.authUser.uid, monthKey);
        } catch {
          // Non-fatal
        }
      }
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
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteMonthInCloud(state.authUser.uid, monthKey, fallbackMonth);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  completeInitialAccountSetup: async (input) => {
    const state = get();
    const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(input.monthKey)
      ? input.monthKey
      : `${toBogotaMonthKey().slice(0, 4)}-01`;

    // 1. Build savings buckets (always ensuring 'moto' and 'savings' standard buckets)
    const rawBuckets: SavingsBucket[] = input.savingsBuckets
      .filter((b) => b.name.trim().length > 0)
      .map((b, idx) => {
        const slug = b.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        return {
          id: b.id ?? `bucket_${slug || idx}_${idx + 1}`,
          name: b.name.trim(),
          openingBalance: Math.max(0, Math.round(b.openingBalanceCop)),
          monthKey,
        };
      });
    const savingsBuckets = ensureStandardSavingsBuckets(rawBuckets, 0, 0);

    // 2. Build debts
    const debtIdByKey = new Map<string, Debt>();
    const debts: Debt[] = input.debts
      .filter((d) => d.name.trim().length > 0 && d.openingBalanceCop > 0)
      .map((d, idx) => {
        const slug = d.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        const id = d.key || `debt_${slug || 'personal'}_${idx + 1}`;
        const rateType: DebtInterestRateType = d.interestRateType ?? 'monthly';
        const rawRate = d.interestRate ?? 0;
        const monthlyInterestRate =
          rateType === 'annual' ? Number((rawRate / 12).toFixed(4)) : rawRate;
        const annualInterestRate =
          rateType === 'annual' ? rawRate : Number((rawRate * 12).toFixed(4));
        const monthlyInstallment = Math.max(0, Math.round(d.monthlyInstallmentCop ?? 0));

        const built: Debt = {
          id,
          groupKey: 'PERSONAL',
          name: d.name.trim(),
          lender: d.lender.trim() || 'Entidad',
          openingBalance: Math.max(0, Math.round(d.openingBalanceCop)),
          monthKey,
          interestRateType: rateType,
          monthlyInterestRate,
          annualInterestRate,
          ...(monthlyInstallment > 0 ? { monthlyInstallment } : {}),
        };
        if (d.key) {
          debtIdByKey.set(d.key, built);
        }
        debtIdByKey.set(id, built);
        return built;
      });

    // 3. Build income and expense concepts & entries
    const concepts: Concept[] = [];
    const entries: MonthEntry[] = [];
    const debtPayments: DebtPayment[] = [];
    let orderCounter = 1;

    for (const inc of input.incomes) {
      const trimmedName = inc.name.trim();
      const safeAmount = Math.max(0, Math.round(inc.amountCop));
      if (!trimmedName || safeAmount <= 0) continue;

      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const conceptId = `inc_${slug || orderCounter}_${orderCounter}`;
      const concept: Concept = {
        id: conceptId,
        name: trimmedName,
        type: 'income',
        group: inc.group,
        defaultAmount: safeAmount,
        recurrence: inc.persistMonthly
          ? { kind: 'monthly' }
          : { kind: 'specific_months', months: [getMonthNumberFromMonthKey(monthKey)] },
        allowMultiplePerMonth: false,
        archived: false,
        order: orderCounter++,
      };
      concepts.push(concept);

      const isCompleted = inc.completed === true;
      entries.push({
        id: `${monthKey}_${conceptId}`,
        monthKey,
        conceptId,
        conceptName: trimmedName,
        type: 'income',
        group: inc.group,
        plannedAmount: safeAmount,
        actualAmount: safeAmount,
        status: isCompleted ? 'completed' : 'pending',
        ...(isCompleted ? { completedAt: toBogotaIsoDate() } : {}),
      });
    }

    const explicitlyLinkedDebtIds = new Set<string>();

    for (const exp of input.expenses) {
      const trimmedName = exp.name.trim();
      const safeAmount = Math.max(0, Math.round(exp.amountCop));
      if (!trimmedName || safeAmount <= 0) continue;

      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const conceptId = `exp_${slug || orderCounter}_${orderCounter}`;

      const linkedDebt = exp.targetDebtKey ? debtIdByKey.get(exp.targetDebtKey) : undefined;
      if (linkedDebt) {
        explicitlyLinkedDebtIds.add(linkedDebt.id);
      }

      const concept: Concept = {
        id: conceptId,
        name: trimmedName,
        type: 'expense',
        group: exp.group,
        defaultAmount: safeAmount,
        recurrence: exp.persistMonthly
          ? { kind: 'monthly' }
          : { kind: 'specific_months', months: [getMonthNumberFromMonthKey(monthKey)] },
        allowMultiplePerMonth: false,
        archived: false,
        order: orderCounter++,
        ...(linkedDebt
          ? {
              linkedDebtGroup: linkedDebt.groupKey,
              defaultTargetDebtId: linkedDebt.id,
            }
          : {}),
        ...(exp.savingsBucketKey
          ? {
              savingsContribution: {
                bucketId: exp.savingsBucketKey,
                onlyWhenCompleted: true,
              },
            }
          : {}),
      };
      concepts.push(concept);

      const isCompleted = exp.completed === true;
      const entry: MonthEntry = {
        id: `${monthKey}_${conceptId}`,
        monthKey,
        conceptId,
        conceptName: trimmedName,
        type: 'expense',
        group: exp.group,
        plannedAmount: safeAmount,
        actualAmount: safeAmount,
        status: isCompleted ? 'completed' : 'pending',
        ...(isCompleted ? { completedAt: toBogotaIsoDate() } : {}),
      };
      entries.push(entry);

      if (linkedDebt) {
        const payments = buildDebtPaymentsForInstallment(
          entry,
          debts,
          undefined,
          linkedDebt.id
        );
        debtPayments.push(...payments);
      }
    }

    // 4. For any debt with a monthlyInstallment > 0 that doesn't already have an explicit checklist expense,
    // auto-create its monthly installment expense in the checklist linked to that debt.
    for (const debt of debts) {
      if (
        debt.monthlyInstallment &&
        debt.monthlyInstallment > 0 &&
        !explicitlyLinkedDebtIds.has(debt.id)
      ) {
        const conceptId = `exp_cuota_${debt.id}`;
        const conceptName = `Cuota ${debt.name}`;
        const concept: Concept = {
          id: conceptId,
          name: conceptName,
          type: 'expense',
          group: 'fixed',
          defaultAmount: debt.monthlyInstallment,
          recurrence: { kind: 'monthly' },
          allowMultiplePerMonth: false,
          archived: false,
          order: orderCounter++,
          linkedDebtGroup: debt.groupKey,
          defaultTargetDebtId: debt.id,
        };
        concepts.push(concept);

        const entry: MonthEntry = {
          id: `${monthKey}_${conceptId}`,
          monthKey,
          conceptId,
          conceptName,
          type: 'expense',
          group: 'fixed',
          plannedAmount: debt.monthlyInstallment,
          actualAmount: debt.monthlyInstallment,
          status: 'pending',
        };
        entries.push(entry);

        const payments = buildDebtPaymentsForInstallment(entry, debts, undefined, debt.id);
        debtPayments.push(...payments);
      }
    }

    // 5. Build provisions plan
    const provisionItems: ProvisionItemSpec[] = (input.provisions ?? [])
      .filter((p) => p.name.trim().length > 0 && p.amountCop > 0)
      .map((p, idx) => {
        const safeAmount = Math.max(0, Math.round(p.amountCop));
        const safeMonths = Math.max(1, Math.round(p.periodMonths));
        const monthlyContribution = Math.ceil(safeAmount / safeMonths);
        const trimmedName = p.name.trim();
        return {
          id: `prov_${idx + 1}_${Date.now().toString(36)}`,
          excelRawName: trimmedName,
          displayName: trimmedName,
          monthlyAmountCop: monthlyContribution,
          cycleCostCop: safeAmount,
          periodMonths: safeMonths,
          ceilMonthlyCop: monthlyContribution,
          ...(p.kind === 'target_goal' ? { targetAmountCop: safeAmount } : {}),
          includedInExcelTotalB43: p.kind === 'recurring',
          kind: p.kind === 'target_goal' ? 'target_goal' : 'recurring_provision',
          ...(p.notes?.trim() ? { notes: p.notes.trim() } : {}),
        };
      });
    const provisionPlan = recalculateProvisionPlan(provisionItems);

    const payload: InitialAccountSetupPayload = {
      monthKey,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
      provisionPlan,
    };

    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: monthKey }
      : null;

    set({
      activeTab: 'summary',
      activeMonthKey: monthKey,
      availableMonths: [monthKey],
      concepts,
      entries,
      debtsByMonth: {
        [monthKey]: debts,
      },
      debtPayments,
      savingsBucketsByMonth: {
        [monthKey]: savingsBuckets,
      },
      idealMotoPlan: provisionPlan,
      closedSnapshots: {},
      needsOnboarding: false,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveInitialAccountSetup(state.authUser.uid, payload);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  resetFullAccount: async (newStartMonthKey) => {
    const state = get();
    const startMonth =
      newStartMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(newStartMonthKey)
        ? newStartMonthKey
        : `${toBogotaMonthKey().slice(0, 4)}-01`;
    const emptyBuckets = ensureStandardSavingsBuckets([], 0, 0);
    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: startMonth }
      : null;

    set({
      activeTab: 'summary',
      activeMonthKey: startMonth,
      availableMonths: [startMonth],
      concepts: [],
      entries: [],
      debtsByMonth: {
        [startMonth]: [],
      },
      debtPayments: [],
      savingsBucketsByMonth: {
        [startMonth]: emptyBuckets,
      },
      idealMotoPlan: { ...EMPTY_PROVISION_PLAN, items: [] },
      closedSnapshots: {},
      needsOnboarding: true,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.resetFullAccountInCloud(state.authUser.uid, startMonth);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  resetToOctober2026GoldenState: () => {
    const currentUser = get().authUser;
    set(buildInitialState(currentUser));
    triggerWidgetSync(get());
  },

  syncActiveWidget: async () => {
    return triggerWidgetSync(get());
  },
}));
