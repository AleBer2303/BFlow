/**
 * src/features/budget/store/slices/sliceTypes.ts
 *
 * Common types, interfaces, state schemas and pure helper functions
 * for BFlow's modular Zustand store slices.
 */

import type { StateCreator } from 'zustand';
import {
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  isOwnerCanonicalEmail,
  type FullCloudAccountData,
} from '../../../../data/repositories/budgetRepository';
import { buildOctober2026SeedPayload } from '../../../../data/seed/october2026SeedData';
import {
  getMonthNumberFromMonthKey,
  sumMoneyIntegers,
  toAppMonthKey,
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
} from '../../../../domain';
import {
  DEMO_OWNER_USER,
  loadPersistedSession,
  type BFlowAuthUser,
} from '../../../../platform/auth/authAdapter';
import { isDemoModeEnabled } from '../../../../platform/mode/demoMode';
import {
  loadPersistedAccount,
  savePersistedAccount,
  schedulePersistedAccountSave,
} from '../../../../platform/storage/accountCache';
import {
  getPendingOfflineWritesCount,
} from '../../../../platform/storage/offlineWriteQueue';
import { scheduleCloudWidgetSnapshotWrite } from '../../../../data/repositories/widgetSnapshotRepository';
import {
  buildWidgetSnapshot,
  resolveWidgetMonthKey,
  syncWidgetSnapshot,
  type WidgetSyncResult,
} from '../../../../platform/widgets';

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
  amount?: number;
  amountCop?: number;
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

export type ProfileSaveStatus = 'synced' | 'queued' | 'rejected' | 'local';

export interface AuthSlice {
  authUser: BFlowAuthUser | null;
  needsOnboarding: boolean;

  setAuthUser: (user: BFlowAuthUser | null) => void;
  /**
   * Guarda el nombre y la meta en la sesión y en `users/{uid}`. Sin red el cambio queda en
   * cola (`queued`); si el servidor lo rechaza se revierte (`rejected`). Las sesiones locales
   * resuelven `local`. El correo no se edita aquí: cambia solo con el enlace de Firebase Auth
   * (ADR 0025).
   */
  updateAuthUserProfile: (updates: {
    displayName?: string;
    financialGoal?: string;
  }) => Promise<ProfileSaveStatus>;
  clearWorkspaceSession: () => void;
  requireAuthenticationGate: () => void;
  setNeedsOnboarding: (needsOnboarding: boolean) => void;
  completeInitialAccountSetup: (input: InitialOnboardingConfigInput) => Promise<void>;
  resetFullAccount: (newStartMonthKey?: string) => Promise<void>;
}

export interface SyncSlice {
  activeTab: BFlowWorkspaceTab;
  activeMonthKey: string;
  availableMonths: string[];
  syncMessage: string;
  isSyncing: boolean;
  isAccountHydrated: boolean;
  pendingOfflineWritesCount: number;

  setActiveTab: (tab: BFlowWorkspaceTab) => void;
  setActiveMonthKey: (monthKey: string) => void;
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
  syncActiveWidget: () => Promise<WidgetSyncResult>;
  flushOfflineWrites: () => Promise<void>;
  refreshPendingOfflineWritesCount: () => void;
  syncUserCloudAccount: (
    user: BFlowAuthUser,
    options?: { isRegistration?: boolean; forceFullSync?: boolean }
  ) => Promise<void>;
}

export interface BudgetSlice {
  concepts: Concept[];
  entries: MonthEntry[];
  closedSnapshots: Record<string, MonthSnapshot>;

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
  editEntry: (entryId: string, updates: EditEntryUpdates) => Promise<void>;
  deleteEntryById: (entryId: string) => Promise<void>;
  removeOrResetEntry: (entryId: string) => Promise<void>;
  closeCurrentMonth: (closedAtIso?: string) => Promise<CloseMonthResult>;
  reopenClosedMonth: (monthKey: string) => Promise<void>;
  deleteOrRevertMonth: (monthKey: string) => Promise<void>;
  resetToOctober2026GoldenState: () => void;
}

export interface DebtsSlice {
  debtsByMonth: Record<string, Debt[]>;
  debtPayments: DebtPayment[];

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
  updateInstallmentAmount: (monthKey: string, newAmount: number) => Promise<void>;
  updateFunfamiInstallmentAmount: (monthKey: string, newAmountCop: number) => Promise<void>;
}

export interface SavingsSlice {
  savingsBucketsByMonth: Record<string, SavingsBucket[]>;

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
}

export interface ProvisionsSlice {
  idealMotoPlan: IdealMotoPlan;

  saveProvisionItem: (input: SaveProvisionItemInput) => Promise<void>;
  deleteProvisionItem: (itemId: string) => Promise<void>;
}

export type BudgetStoreState = AuthSlice &
  SyncSlice &
  BudgetSlice &
  DebtsSlice &
  SavingsSlice &
  ProvisionsSlice;

export type SliceCreator<T> = StateCreator<BudgetStoreState, [], [], T>;

export function recalculateProvisionPlan(items: readonly ProvisionItemSpec[]): IdealMotoPlan {
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

export function applyConceptLinkageUpdates(
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
      next.linkedDebtGroup = targetDebt?.groupKey ?? 'GENERAL';
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

export function persistHydratedAccountSnapshot(state: BudgetStoreState): void {
  const uid = state.authUser?.uid;
  if (!uid || uid === 'local-owner' || uid === 'local-demo') {
    return;
  }
  if (!state.isAccountHydrated) {
    return;
  }
  schedulePersistedAccountSave(uid, {
    activeMonthKey: state.activeMonthKey,
    availableMonths: state.availableMonths,
    concepts: state.concepts,
    entries: state.entries,
    debtsByMonth: state.debtsByMonth,
    debtPayments: state.debtPayments,
    savingsBucketsByMonth: state.savingsBucketsByMonth,
    provisionPlan: state.idealMotoPlan,
    closedSnapshots: state.closedSnapshots,
    needsOnboarding: state.needsOnboarding,
  });
}

export function triggerWidgetSync(state: BudgetStoreState): Promise<WidgetSyncResult> {
  if (!state.isAccountHydrated) {
    return Promise.resolve({
      synced: false,
      mode: 'mode-a-preview' as const,
      appGroupId: 'group.com.bflow.app',
    });
  }
  persistHydratedAccountSnapshot(state);
  try {
    const snapshot = buildWidgetSnapshot({
      monthKeys: state.availableMonths,
      monthKey: resolveWidgetMonthKey(state.availableMonths, state.activeMonthKey),
      concepts: state.concepts,
      entries: state.entries,
      debtPayments: state.debtPayments,
      debtsByMonth: state.debtsByMonth,
      savingsBucketsByMonth: state.savingsBucketsByMonth,
      closedSnapshots: state.closedSnapshots,
    });
    // Otros dispositivos ven el cambio en sus widgets sin abrir la app (ADR 0021). Mientras se
    // carga la nube, el estado puede venir de una caché vieja: no se sube para no pisar un
    // snapshot más nuevo de otro dispositivo; syncUserCloudAccount lo sube al terminar.
    if (isRealAuthUser(state.authUser) && !state.isSyncing) {
      scheduleCloudWidgetSnapshotWrite(state.authUser.uid, snapshot);
    }
    return syncWidgetSnapshot(snapshot);
  } catch {
    return Promise.resolve({
      synced: false,
      mode: 'mode-a-preview' as const,
      appGroupId: 'group.com.bflow.app',
    });
  }
}

export function isRealAuthUser(user: BFlowAuthUser | null): user is BFlowAuthUser {
  return Boolean(
    user &&
      user.provider === 'firebase' &&
      user.uid &&
      user.uid !== 'local-owner' &&
      user.uid !== 'local-demo' &&
      (process.env.NODE_ENV !== 'test' || user.uid.startsWith('uid_cloud_test'))
  );
}

export function resolveDefaultInitialAuthUser(): BFlowAuthUser | null {
  if (process.env.NODE_ENV === 'test' || isDemoModeEnabled()) {
    return DEMO_OWNER_USER;
  }
  return loadPersistedSession();
}

export function buildCleanEmptyWorkspaceState(authUser: BFlowAuthUser | null) {
  const defaultMonth =
    authUser?.activeMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(authUser.activeMonthKey)
      ? authUser.activeMonthKey
      : isOwnerCanonicalEmail(authUser?.email)
        ? '2026-10'
        : `${toAppMonthKey().slice(0, 4)}-01`;
  const isTestOrDemo = process.env.NODE_ENV === 'test' || isDemoModeEnabled();

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
    isAccountHydrated: isTestOrDemo,
    needsOnboarding: false,
    pendingOfflineWritesCount: authUser?.uid ? getPendingOfflineWritesCount(authUser.uid) : 0,
  };
}

export function buildHydratedWorkspaceState(
  authUser: BFlowAuthUser,
  account: FullCloudAccountData
) {
  const hydratedUser: BFlowAuthUser = {
    ...authUser,
    activeMonthKey: account.activeMonthKey,
  };

  return {
    activeTab: 'summary' as BFlowWorkspaceTab,
    activeMonthKey: account.activeMonthKey,
    availableMonths:
      account.availableMonths.length > 0
        ? account.availableMonths
        : [account.activeMonthKey],
    concepts: account.concepts,
    entries: account.entries,
    debtsByMonth: account.debtsByMonth,
    debtPayments: account.debtPayments,
    savingsBucketsByMonth: account.savingsBucketsByMonth,
    idealMotoPlan: account.provisionPlan,
    closedSnapshots: account.closedSnapshots,
    authUser: hydratedUser,
    syncMessage: '',
    isSyncing: false,
    isAccountHydrated: true,
    needsOnboarding: account.needsOnboarding ?? false,
    pendingOfflineWritesCount: authUser.uid ? getPendingOfflineWritesCount(authUser.uid) : 0,
  };
}

export function buildOctober2026SeedWorkspaceState(authUser: BFlowAuthUser | null) {
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
    authUser,
    syncMessage: '',
    isSyncing: false,
    isAccountHydrated: true,
    needsOnboarding: false,
    pendingOfflineWritesCount: authUser?.uid ? getPendingOfflineWritesCount(authUser.uid) : 0,
  };
}

let storeInitialState: ReturnType<typeof buildInitialState> | null = null;

/**
 * The state the store is created with, built once. Every slice reads its fields from it:
 * building it per slice loaded, decrypted and parsed the cached account seven times at launch.
 */
export function getStoreInitialState(): ReturnType<typeof buildInitialState> {
  storeInitialState ??= buildInitialState();
  return storeInitialState;
}

export function buildInitialState(authUserOverride?: BFlowAuthUser | null) {
  const resolvedUser =
    authUserOverride !== undefined ? authUserOverride : resolveDefaultInitialAuthUser();

  if (
    resolvedUser?.uid &&
    resolvedUser.uid !== 'local-owner' &&
    resolvedUser.uid !== 'local-demo'
  ) {
    const cachedAccount = loadPersistedAccount(resolvedUser.uid);
    if (cachedAccount) {
      return buildHydratedWorkspaceState(resolvedUser, cachedAccount);
    }
  }

  const isTestOrDemo = process.env.NODE_ENV === 'test' || isDemoModeEnabled();

  if (!isTestOrDemo) {
    return {
      ...buildCleanEmptyWorkspaceState(resolvedUser),
      isAccountHydrated: false,
      isSyncing: Boolean(resolvedUser),
    };
  }

  if (!isOwnerCanonicalEmail(resolvedUser?.email)) {
    return buildCleanEmptyWorkspaceState(resolvedUser);
  }

  return buildOctober2026SeedWorkspaceState(resolvedUser);
}
