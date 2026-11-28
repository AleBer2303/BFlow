/**
 * src/data/repositories/budgetRepositoryTypes.ts
 *
 * Contract of the budget repository and the shapes it reads and writes (`users/{uid}/...`).
 * Implementations: `FirestoreBudgetRepository` and `InMemoryBudgetRepository`.
 */

import type { RegisterOrCompleteMovementInput } from '../../domain/checklist/checklist';
import type { CloseMonthResult } from '../../domain/month-close/monthClose';
import type {
  Concept,
  Debt,
  DebtPayment,
  FinancialAccount,
  ProvisionPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';

export interface MonthWorkspaceData {
  monthKey: string;
  concepts: Concept[];
  entries: MonthEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsBuckets: SavingsBucket[];
  provisionPlan: ProvisionPlan;
  closedSnapshot?: MonthSnapshot;
}

export interface FullCloudAccountData {
  activeMonthKey: string;
  availableMonths: string[];
  concepts: Concept[];
  entries: MonthEntry[];
  debtsByMonth: Record<string, Debt[]>;
  debtPayments: DebtPayment[];
  savingsBucketsByMonth: Record<string, SavingsBucket[]>;
  provisionPlan: ProvisionPlan;
  closedSnapshots: Record<string, MonthSnapshot>;
  /** Credit cards and debit accounts (ADR 0034); missing in caches written before it. */
  financialAccounts?: FinancialAccount[];
  needsOnboarding?: boolean;
  dataRevision?: string;
  /** When this data last received everything the cloud had (ISO); see historyWindow.ts. */
  historySyncedAt?: string;
}

export interface InitialAccountSetupPayload {
  monthKey: string;
  concepts: Concept[];
  entries: MonthEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsBuckets: SavingsBucket[];
  provisionPlan: ProvisionPlan;
  /**
   * Credit cards and debit accounts registered in the onboarding (ADR 0034). Optional: setups
   * queued offline before this field existed have none.
   */
  financialAccounts?: FinancialAccount[];
}

/**
 * What the caller already has in memory for `addMonthEntry` (OPT-04, like R-14 in
 * `deleteOrResetEntry`): each piece given skips its Firestore read.
 */
export interface AddMonthEntryContext {
  /** Entries of `input.monthKey`. */
  monthEntries?: readonly MonthEntry[];
  concepts?: readonly Concept[];
}

export interface ToggleEntryCompletionResult {
  updatedEntry: MonthEntry;
  updatedDebtPayment?: DebtPayment;
}

export interface LoadCloudAccountOptions {
  isRegistration?: boolean;
  forceFullSync?: boolean;
  cachedAccount?: FullCloudAccountData | null;
  cachedDataRevision?: string;
  cachedSavedAt?: string;
}

export interface BudgetRepository {
  loadMonthWorkspace(uid: string, monthKey: string): Promise<MonthWorkspaceData>;
  loadFullCloudAccount(
    uid: string,
    userEmail?: string | null,
    options?: LoadCloudAccountOptions
  ): Promise<FullCloudAccountData>;
  toggleEntryCompletion(
    uid: string,
    entryId: string,
    monthKey: string,
    options?: {
      actualAmount?: number;
      completedAtDateIso?: string;
      targetDebtId?: string;
      entry?: MonthEntry;
      concept?: Concept;
    }
  ): Promise<ToggleEntryCompletionResult>;
  addMonthEntry(
    uid: string,
    input: RegisterOrCompleteMovementInput,
    context?: AddMonthEntryContext
  ): Promise<MonthEntry>;
  deleteOrResetEntry(
    uid: string,
    entryId: string,
    options?: { entry?: MonthEntry; concept?: Concept }
  ): Promise<void>;
  deleteEntryCompletely(uid: string, entryId: string): Promise<void>;
  saveOrUpdateEntry(
    uid: string,
    entry: MonthEntry,
    linkedConcept?: Concept,
    debtPayments?: DebtPayment[]
  ): Promise<void>;
  saveCustomConceptAndEntry(
    uid: string,
    concept: Concept,
    entry: MonthEntry,
    debtPayments?: DebtPayment[]
  ): Promise<void>;
  saveConcept(uid: string, concept: Concept): Promise<void>;
  deleteConcept(uid: string, conceptId: string): Promise<void>;
  saveDebt(uid: string, debt: Debt): Promise<void>;
  deleteDebt(uid: string, debtId: string): Promise<void>;
  saveFinancialAccount(uid: string, account: FinancialAccount): Promise<void>;
  deleteFinancialAccount(uid: string, accountId: string): Promise<void>;
  saveSavingsBucket(
    uid: string,
    bucketId: string,
    openingBalanceCop: number,
    monthKey?: string,
    bucketName?: string
  ): Promise<void>;
  deleteSavingsBucket(uid: string, bucketId: string): Promise<void>;
  saveProvisionPlan(uid: string, plan: ProvisionPlan): Promise<void>;
  saveInitialAccountSetup(uid: string, payload: InitialAccountSetupPayload): Promise<void>;
  saveActiveMonthKey(uid: string, monthKey: string): Promise<void>;
  saveUserProfile(uid: string, profile: UserProfileFields): Promise<void>;
  resetFullAccountInCloud(uid: string, newStartMonthKey: string): Promise<void>;
  reopenMonthInCloud(uid: string, monthKey: string): Promise<void>;
  deleteMonthInCloud(uid: string, monthKey: string, fallbackMonthKey: string): Promise<void>;
  closeMonth(uid: string, monthKey: string, closedAtIso?: string): Promise<CloseMonthResult>;
  persistMonthCloseResult(
    uid: string,
    closingMonthKey: string,
    result: CloseMonthResult
  ): Promise<void>;
}

/** Campos del perfil que el usuario edita en Cuenta → Actualizar datos (`users/{uid}`). */
export interface UserProfileFields {
  displayName: string;
  /** Vacío borra la meta. */
  financialGoal: string;
  /** Vacío borra la foto; omitido la deja sin cambios (ADR 0033). */
  photoUrl?: string;
}
