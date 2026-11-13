/**
 * src/data/repositories/budgetRepository.ts
 *
 * Repository contract + Cloud Firestore (`users/{uid}/...`) and In-Memory implementations.
 * Enforces Spark free-tier guardrails:
 * - Queries `entries` and `debtPayments` scoped by `where('monthKey', '==', monthKey)`
 * - Uses atomic `writeBatch` when completing/uncompleting `Cuota FUNFAMI` and its linked `debtPayment`
 * - Performs idempotent October 2026 seeding (`seedOctober2026IfEmpty`) with deterministic IDs
 * - Supports `loadFullCloudAccount` to restore all months, entries, debts, savings, and closed
 *   `monthSnapshots` when the user signs in from another phone or browser.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  deleteMovement,
  ensureMonthPlan,
  registerMovement,
  toggleMovementStatus,
  uncompleteMovement,
  type RegisterOrCompleteMovementInput,
} from '../../domain/checklist/checklist';
import { calculateMonthlyBudgetSummary } from '../../domain/budget/budgetCalculator';
import { addMonthsToMonthKey, toAppIsoDate, toAppMonthKey } from '../../domain/date/monthKey';
import {
  buildDebtPaymentsForInstallment,
  calculateDebtsSummary,
} from '../../domain/debts/debtCalculator';
import { closeMonthAndRollover, type CloseMonthResult } from '../../domain/month-close/monthClose';
import type {
  Concept,
  Debt,
  DebtPayment,
  ProvisionPlan as IdealMotoPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';
import { sumMoneyIntegers } from '../../domain/money/money';
import { calculateMonthlySavingsSummary } from '../../domain/savings/savingsCalculator';
import { getFirebaseDb } from '../firebase/firebaseConfig';
import {
  isCacheFreshWithin24Hours,
  updatePersistedAccountRevision,
} from '../../platform/storage/accountCache';
import {
  parseConceptFromFirestore,
  parseDebtFromFirestore,
  parseDebtPaymentFromFirestore,
  parseProvisionPlanFromFirestore as parseIdealMotoPlanFromFirestore,
  parseMonthEntryFromFirestore,
  parseMonthSnapshotFromFirestore,
  parseSavingsBucketFromFirestore,
  serializeConceptForFirestore,
  serializeDebtForFirestore,
  serializeDebtPaymentForFirestore,
  serializeProvisionPlanForFirestore as serializeIdealMotoPlanForFirestore,
  serializeMonthEntryForFirestore,
  serializeMonthSnapshotForFirestore,
  serializeSavingsBucketForFirestore,
} from '../mappers/firestoreSchemas';
import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';

export interface MonthWorkspaceData {
  monthKey: string;
  concepts: Concept[];
  entries: MonthEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsBuckets: SavingsBucket[];
  provisionPlan: IdealMotoPlan;
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
  provisionPlan: IdealMotoPlan;
  closedSnapshots: Record<string, MonthSnapshot>;
  needsOnboarding?: boolean;
  dataRevision?: string;
}

export function generateDataRevision(): string {
  const randomPart =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `rev_${Date.now().toString(36)}_${randomPart}`;
}

export interface InitialAccountSetupPayload {
  monthKey: string;
  concepts: Concept[];
  entries: MonthEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsBuckets: SavingsBucket[];
  provisionPlan: IdealMotoPlan;
}

export interface ToggleEntryCompletionResult {
  updatedEntry: MonthEntry;
  updatedDebtPayment?: DebtPayment;
}

const OWNER_CANONICAL_EMAILS = new Set([
  'abernalg2303@gmail.com',
  'abernalg2303gmail.com',
]);

function safeParseList<T>(
  rawDocs: ReadonlyArray<{ data: () => unknown }>,
  parser: (raw: unknown) => T
): T[] {
  const results: T[] = [];
  for (const docSnap of rawDocs) {
    try {
      results.push(parser(docSnap.data()));
    } catch {
      // Skip malformed legacy document so account sync never aborts
    }
  }
  return results;
}

export function isOwnerCanonicalEmail(email?: string | null): boolean {
  if (!email) return false;
  return OWNER_CANONICAL_EMAILS.has(email.trim().toLowerCase());
}

export const EMPTY_PROVISION_PLAN: IdealMotoPlan = {
  items: [],
  recurringMonthlyTotalCop: 0,
  totalWithTargetGoalCop: 0,
};

export function ensureStandardSavingsBuckets(
  buckets: readonly SavingsBucket[],
  _defaultMotoOpening = 0,
  _defaultSavingsOpening = 0
): SavingsBucket[] {
  return buckets.map((b) => ({ ...b }));
}

export interface LoadCloudAccountOptions {
  isRegistration?: boolean;
  forceFullSync?: boolean;
  cachedAccount?: FullCloudAccountData | null;
  cachedDataRevision?: string;
  cachedSavedAt?: string;
}

export interface BudgetRepository {
  seedOctober2026IfEmpty(
    uid: string,
    userEmail?: string | null
  ): Promise<{ seeded: boolean; monthKey: string }>;
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
  addMonthEntry(uid: string, input: RegisterOrCompleteMovementInput): Promise<MonthEntry>;
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
  saveSavingsBucket(
    uid: string,
    bucketId: string,
    openingBalanceCop: number,
    monthKey?: string,
    bucketName?: string
  ): Promise<void>;
  deleteSavingsBucket(uid: string, bucketId: string): Promise<void>;
  saveProvisionPlan(uid: string, plan: IdealMotoPlan): Promise<void>;
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
}

function reconstructClosedMonthBalances(
  snapshot: MonthSnapshot,
  concepts: readonly Concept[],
  entries: readonly MonthEntry[],
  currentDebts: readonly Debt[] = [],
  currentBuckets: readonly SavingsBucket[] = []
): { debts: Debt[]; savingsBuckets: SavingsBucket[] } {
  const debtMetaById = new Map<string, Debt>();
  for (const d of currentDebts) {
    debtMetaById.set(d.id, d);
  }

  const debts: Debt[] = snapshot.closingDebts.map((cd) => {
    const meta = debtMetaById.get(cd.debtId);
    const monthlyRate = meta?.monthlyInterestRate ?? cd.monthlyInterestRate;
    const annualRate = meta?.annualInterestRate ?? cd.annualInterestRate;
    const rateType = meta?.interestRateType ?? cd.interestRateType;
    const installment = meta?.monthlyInstallment ?? cd.monthlyInstallment;

    return {
      id: cd.debtId,
      groupKey: meta?.groupKey ?? cd.groupKey ?? 'FUNFAMI',
      name: meta?.name ?? cd.name,
      lender: meta?.lender ?? cd.lender ?? 'FUNFAMI',
      openingBalance: cd.openingBalance,
      monthKey: snapshot.monthKey,
      ...(monthlyRate !== undefined ? { monthlyInterestRate: monthlyRate } : {}),
      ...(annualRate !== undefined ? { annualInterestRate: annualRate } : {}),
      ...(rateType ? { interestRateType: rateType } : {}),
      ...(installment !== undefined ? { monthlyInstallment: installment } : {}),
    };
  });

  const motoConceptIds = new Set(
    concepts
      .filter((c) => !c.archived && c.savingsContribution?.bucketId === 'moto')
      .map((c) => c.id)
  );
  const paidMotoContributions = sumMoneyIntegers(
    entries
      .filter(
        (e) =>
          e.monthKey === snapshot.monthKey &&
          e.status === 'completed' &&
          motoConceptIds.has(e.conceptId)
      )
      .map((e) => e.actualAmount)
  );

  const extraBuckets = currentBuckets
    .filter((b) => b.id !== 'moto' && b.id !== 'savings')
    .map((b) => ({ ...b }));

  const hasMoto = currentBuckets.some((b) => b.id === 'moto');
  const hasSavings = currentBuckets.some((b) => b.id === 'savings');

  const savingsBuckets: SavingsBucket[] = [
    ...(hasMoto
      ? [
          {
            id: 'moto',
            name: currentBuckets.find((b) => b.id === 'moto')?.name ?? 'Fondo Moto',
            openingBalance: Math.max(
              0,
              snapshot.closingSavings.motoClosingBalance - paidMotoContributions
            ),
          },
        ]
      : []),
    ...(hasSavings
      ? [
          {
            id: 'savings',
            name: currentBuckets.find((b) => b.id === 'savings')?.name ?? 'Fondo Ahorros',
            openingBalance: Math.max(
              0,
              snapshot.closingSavings.savingsClosingBalance - snapshot.budget.netCashFlow
            ),
          },
        ]
      : []),
    ...extraBuckets,
  ];

  return { debts, savingsBuckets };
}

/**
 * In-memory implementation pre-populated with the October 2026 golden dataset.
 * Used in deterministic unit tests and offline fallback.
 */
export class InMemoryBudgetRepository implements BudgetRepository {
  private concepts = new Map<string, Concept>();
  private entries = new Map<string, MonthEntry>();
  private debtsByMonth = new Map<string, Debt[]>();
  private debtPayments = new Map<string, DebtPayment>();
  private savingsBucketsByMonth = new Map<string, SavingsBucket[]>();
  private provisionPlan: IdealMotoPlan;
  private snapshots = new Map<string, MonthSnapshot>();
  private seededUsers = new Set<string>();
  private resetUsers = new Set<string>();
  private onboardedUsers = new Set<string>();
  private activeMonthByUser = new Map<string, string>();
  private profilesByUser = new Map<string, UserProfileFields>();

  constructor(autoSeedDefaultUser = true) {
    const seed = buildOctober2026SeedPayload();
    this.provisionPlan = seed.provisionPlan;
    if (autoSeedDefaultUser) {
      this.applySeedPayload(seed);
      this.seededUsers.add('local-owner');
      this.onboardedUsers.add('local-owner');
      this.activeMonthByUser.set('local-owner', '2026-10');
    }
  }

  private applySeedPayload(seed = buildOctober2026SeedPayload()): void {
    for (const c of seed.concepts) {
      this.concepts.set(c.id, c);
    }
    for (const e of seed.entries) {
      this.entries.set(e.id, e);
    }
    this.debtsByMonth.set(
      '2026-10',
      seed.debts.map((d) => ({ ...d }))
    );
    for (const dp of seed.debtPayments) {
      this.debtPayments.set(dp.id, dp);
    }
    this.savingsBucketsByMonth.set(
      '2026-10',
      seed.savingsBuckets.map((sb) => ({ ...sb }))
    );
    this.provisionPlan = seed.provisionPlan;
  }

  async seedOctober2026IfEmpty(
    uid: string,
    userEmail?: string | null
  ): Promise<{ seeded: boolean; monthKey: string }> {
    const defaultNewUserMonth = `${toAppMonthKey().slice(0, 4)}-01`;
    if (this.resetUsers.has(uid)) {
      return {
        seeded: false,
        monthKey: this.activeMonthByUser.get(uid) ?? defaultNewUserMonth,
      };
    }
    if (userEmail && !isOwnerCanonicalEmail(userEmail) && !this.seededUsers.has(uid)) {
      const fallbackMonth = this.activeMonthByUser.get(uid) ?? defaultNewUserMonth;
      this.activeMonthByUser.set(uid, fallbackMonth);
      return { seeded: false, monthKey: fallbackMonth };
    }
    if (this.seededUsers.has(uid) && this.entries.size > 0) {
      return { seeded: false, monthKey: this.activeMonthByUser.get(uid) ?? '2026-10' };
    }
    this.applySeedPayload();
    this.seededUsers.add(uid);
    this.onboardedUsers.add(uid);
    this.activeMonthByUser.set(uid, '2026-10');
    return { seeded: true, monthKey: '2026-10' };
  }

  async loadMonthWorkspace(uid: string, monthKey: string): Promise<MonthWorkspaceData> {
    await this.seedOctober2026IfEmpty(uid);
    const concepts = Array.from(this.concepts.values()).sort((a, b) => a.order - b.order);
    const entries = Array.from(this.entries.values()).filter((e) => e.monthKey === monthKey);
    const debts = (
      this.debtsByMonth.get(monthKey) ??
      this.debtsByMonth.get('2026-10') ??
      []
    ).map((d) => ({ ...d }));
    const debtPayments = Array.from(this.debtPayments.values()).filter(
      (dp) => dp.monthKey === monthKey
    );
    const savingsBuckets = (
      this.savingsBucketsByMonth.get(monthKey) ??
      this.savingsBucketsByMonth.get('2026-10') ??
      ensureStandardSavingsBuckets([])
    ).map((sb) => ({ ...sb }));
    const closedSnapshot = this.snapshots.get(monthKey);

    return {
      monthKey,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
      provisionPlan: this.provisionPlan,
      closedSnapshot,
    };
  }

  async loadFullCloudAccount(
    uid: string,
    userEmail?: string | null,
    options?: LoadCloudAccountOptions
  ): Promise<FullCloudAccountData> {
    const seedInfo = await this.seedOctober2026IfEmpty(uid, userEmail);
    const savedActiveMonthKey = this.activeMonthByUser.get(uid) ?? seedInfo.monthKey;
    const concepts = Array.from(this.concepts.values()).sort((a, b) => a.order - b.order);
    const entries = Array.from(this.entries.values());
    const debtPayments = Array.from(this.debtPayments.values());

    const monthsSet = new Set<string>([savedActiveMonthKey]);
    if (this.seededUsers.has(uid)) {
      monthsSet.add('2026-10');
    }
    for (const e of entries) monthsSet.add(e.monthKey);
    for (const mk of this.debtsByMonth.keys()) monthsSet.add(mk);
    for (const mk of this.savingsBucketsByMonth.keys()) monthsSet.add(mk);
    for (const s of this.snapshots.keys()) {
      monthsSet.add(s);
      monthsSet.add(addMonthsToMonthKey(s, 1));
    }
    const availableMonths = Array.from(monthsSet).sort();
    const activeMonthKey =
      availableMonths[availableMonths.length - 1] ?? savedActiveMonthKey;
    this.activeMonthByUser.set(uid, activeMonthKey);

    for (const mk of availableMonths) {
      if (
        !this.snapshots.has(mk) &&
        concepts.length > 0 &&
        !entries.some((e) => e.monthKey === mk)
      ) {
        const planned = ensureMonthPlan(mk, concepts, []);
        for (const pe of planned) {
          this.entries.set(pe.id, pe);
          entries.push(pe);
        }
      }
    }

    const defaultDebts =
      this.debtsByMonth.get(activeMonthKey) ??
      this.debtsByMonth.get(availableMonths[0] ?? '2026-10') ??
      this.debtsByMonth.get('2026-10') ??
      [];
    const defaultBuckets =
      this.savingsBucketsByMonth.get(activeMonthKey) ??
      this.savingsBucketsByMonth.get(availableMonths[0] ?? '2026-10') ??
      this.savingsBucketsByMonth.get('2026-10') ??
      [];
    const debtsByMonth: Record<string, Debt[]> = {};
    const savingsBucketsByMonth: Record<string, SavingsBucket[]> = {};
    for (const mk of availableMonths) {
      debtsByMonth[mk] = (this.debtsByMonth.get(mk) ?? defaultDebts).map((d) => ({
        ...d,
        monthKey: mk,
      }));
      savingsBucketsByMonth[mk] = ensureStandardSavingsBuckets(
        this.savingsBucketsByMonth.get(mk) ?? defaultBuckets
      );
    }

    const closedSnapshots: Record<string, MonthSnapshot> = {};
    for (const [mk, snap] of this.snapshots.entries()) {
      closedSnapshots[mk] = snap;
    }

    let needsOnboarding: boolean;
    if (this.resetUsers.has(uid)) {
      needsOnboarding = true;
    } else if (options?.isRegistration === true && !isOwnerCanonicalEmail(userEmail)) {
      needsOnboarding = true;
      this.onboardedUsers.add(uid);
    } else if (options?.isRegistration === false) {
      needsOnboarding = false;
      this.onboardedUsers.add(uid);
    } else {
      needsOnboarding =
        !this.onboardedUsers.has(uid) &&
        !this.seededUsers.has(uid) &&
        concepts.length === 0;
      if (needsOnboarding) {
        this.onboardedUsers.add(uid);
      }
    }

    return {
      activeMonthKey,
      availableMonths,
      concepts,
      entries,
      debtsByMonth,
      debtPayments,
      savingsBucketsByMonth,
      provisionPlan: this.provisionPlan,
      closedSnapshots,
      needsOnboarding,
    };
  }

  async toggleEntryCompletion(
    _uid: string,
    entryId: string,
    monthKey: string,
    options?: { actualAmount?: number; completedAtDateIso?: string; targetDebtId?: string }
  ): Promise<ToggleEntryCompletionResult> {
    const existing = this.entries.get(entryId);
    if (!existing || existing.monthKey !== monthKey) {
      throw new Error(`Entry ${entryId} not found in month ${monthKey}`);
    }

    const allEntries = Array.from(this.entries.values());

    const nextEntries = toggleMovementStatus(allEntries, entryId, {
      actualAmount: options?.actualAmount ?? existing.plannedAmount,
      completedAt: options?.completedAtDateIso ?? toAppIsoDate(),
    });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    if (!updatedEntry) {
      throw new Error(`Updated entry ${entryId} missing after toggle`);
    }

    this.entries.set(updatedEntry.id, updatedEntry);

    const concept = this.concepts.get(updatedEntry.conceptId);
    let updatedDebtPayment: DebtPayment | undefined;

    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      const monthDebts = this.debtsByMonth.get(monthKey) ?? [];
      const fallbackDebtId = monthDebts[0]?.id ?? 'debt_obligation_primary';
      const targetDebtId =
        options?.targetDebtId ?? concept.defaultTargetDebtId ?? fallbackDebtId;
      const paymentId = `${updatedEntry.id}_${targetDebtId}`;
      const existingPayment = this.debtPayments.get(paymentId);

      updatedDebtPayment = {
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
      this.debtPayments.set(paymentId, updatedDebtPayment);
    }

    return {
      updatedEntry,
      updatedDebtPayment,
    };
  }

  async addMonthEntry(
    _uid: string,
    input: RegisterOrCompleteMovementInput
  ): Promise<MonthEntry> {
    const existingEntriesForMonth = Array.from(this.entries.values()).filter(
      (e) => e.monthKey === input.monthKey
    );
    const allConcepts = Array.from(this.concepts.values());
    const nextEntries = registerMovement(existingEntriesForMonth, allConcepts, input);
    const created =
      nextEntries.find(
        (e) =>
          e.monthKey === input.monthKey &&
          e.conceptId === input.conceptId &&
          !existingEntriesForMonth.some((prev) => prev.id === e.id && prev.status === 'completed')
      ) ?? nextEntries[nextEntries.length - 1];
    if (!created) {
      throw new Error('Failed to create month entry');
    }
    this.entries.set(created.id, created);

    const concept = this.concepts.get(created.conceptId);
    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      const monthDebts = this.debtsByMonth.get(input.monthKey) ?? [];
      const fallbackDebtId = monthDebts[0]?.id ?? 'debt_obligation_primary';
      const targetDebtId = concept.defaultTargetDebtId ?? fallbackDebtId;
      const paymentId = `${created.id}_${targetDebtId}`;
      this.debtPayments.set(paymentId, {
        id: paymentId,
        entryId: created.id,
        monthKey: created.monthKey,
        debtId: targetDebtId,
        principalAmount: created.actualAmount,
        interestAmount: 0,
        totalApplied: created.actualAmount,
        completedAt: created.completedAt,
        active: true,
      });
    }

    return created;
  }

  async deleteOrResetEntry(_uid: string, entryId: string): Promise<void> {
    const existing = this.entries.get(entryId);
    if (!existing) return;

    const allEntries = Array.from(this.entries.values());
    const allConcepts = Array.from(this.concepts.values());
    const nextEntries = deleteMovement(allEntries, allConcepts, entryId);
    this.entries.clear();
    for (const e of nextEntries) {
      this.entries.set(e.id, e);
    }

    const concept = this.concepts.get(existing.conceptId);
    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      for (const [paymentId, payment] of this.debtPayments.entries()) {
        if (payment.entryId === entryId) {
          const { completedAt: _removed, ...restPayment } = payment;
          this.debtPayments.set(paymentId, {
            ...restPayment,
            principalAmount: existing.plannedAmount,
            totalApplied: existing.plannedAmount + payment.interestAmount,
            active: false,
          });
        }
      }
    }
  }

  async closeMonth(
    uid: string,
    monthKey: string,
    closedAtIso = new Date().toISOString()
  ): Promise<CloseMonthResult> {
    const concepts = Array.from(this.concepts.values());
    const entries = Array.from(this.entries.values()).filter((e) => e.monthKey === monthKey);
    const debts =
      this.debtsByMonth.get(monthKey) ?? this.debtsByMonth.get('2026-10') ?? [];
    const debtPayments = Array.from(this.debtPayments.values()).filter(
      (dp) => dp.monthKey === monthKey
    );
    const savingsBuckets = ensureStandardSavingsBuckets(
      this.savingsBucketsByMonth.get(monthKey) ??
        this.savingsBucketsByMonth.get('2026-10') ??
        []
    );

    const result = closeMonthAndRollover({
      closingMonthKey: monthKey,
      closedAtIso,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
    });

    await this.persistMonthCloseResult(uid, monthKey, result);
    return result;
  }

  async persistMonthCloseResult(
    uid: string,
    closingMonthKey: string,
    result: CloseMonthResult
  ): Promise<void> {
    this.snapshots.set(closingMonthKey, result.snapshot);
    this.debtsByMonth.set(
      result.nextMonthKey,
      result.nextMonthDebts.map((d) => ({ ...d }))
    );
    this.savingsBucketsByMonth.set(
      result.nextMonthKey,
      result.nextMonthSavingsBuckets.map((sb) => ({ ...sb }))
    );
    for (const nextEntry of result.nextMonthEntries) {
      this.entries.set(nextEntry.id, nextEntry);
    }
    this.activeMonthByUser.set(uid, result.nextMonthKey);
  }

  async saveOrUpdateEntry(
    _uid: string,
    entry: MonthEntry,
    linkedConcept?: Concept,
    debtPayments?: DebtPayment[]
  ): Promise<void> {
    this.entries.set(entry.id, entry);
    if (linkedConcept) {
      this.concepts.set(linkedConcept.id, linkedConcept);
    }
    if (debtPayments) {
      for (const [id, existing] of this.debtPayments.entries()) {
        if (existing.entryId === entry.id && !debtPayments.some((dp) => dp.id === id)) {
          this.debtPayments.delete(id);
        }
      }
      for (const dp of debtPayments) {
        this.debtPayments.set(dp.id, dp);
      }
    }
  }

  async saveCustomConceptAndEntry(
    _uid: string,
    concept: Concept,
    entry: MonthEntry,
    debtPayments?: DebtPayment[]
  ): Promise<void> {
    this.concepts.set(concept.id, concept);
    this.entries.set(entry.id, entry);
    if (debtPayments) {
      for (const dp of debtPayments) {
        this.debtPayments.set(dp.id, dp);
      }
    }
  }

  async saveConcept(_uid: string, concept: Concept): Promise<void> {
    this.concepts.set(concept.id, { ...concept });
  }

  async deleteConcept(_uid: string, conceptId: string): Promise<void> {
    this.concepts.delete(conceptId);
  }

  async saveDebt(_uid: string, debt: Debt): Promise<void> {
    const list = this.debtsByMonth.get(debt.monthKey) ?? [];
    const idx = list.findIndex((d) => d.id === debt.id);
    if (idx >= 0) {
      list[idx] = { ...debt };
    } else {
      list.push({ ...debt });
    }
    this.debtsByMonth.set(debt.monthKey, list);

    // Propagate updated debt metadata (interest rates, installment, name, lender) across other tracked months
    for (const [mk, monthDebts] of this.debtsByMonth.entries()) {
      if (mk === debt.monthKey) continue;
      if (!monthDebts.some((d) => d.id === debt.id)) continue;
      this.debtsByMonth.set(
        mk,
        monthDebts.map((d) =>
          d.id === debt.id
            ? {
                ...d,
                name: debt.name,
                lender: debt.lender,
                groupKey: debt.groupKey,
                ...(debt.monthlyInterestRate !== undefined
                  ? { monthlyInterestRate: debt.monthlyInterestRate }
                  : {}),
                ...(debt.annualInterestRate !== undefined
                  ? { annualInterestRate: debt.annualInterestRate }
                  : {}),
                ...(debt.interestRateType ? { interestRateType: debt.interestRateType } : {}),
                ...(debt.monthlyInstallment !== undefined
                  ? { monthlyInstallment: debt.monthlyInstallment }
                  : {}),
              }
            : d
        )
      );
    }
  }

  async deleteDebt(_uid: string, debtId: string): Promise<void> {
    for (const [mk, list] of this.debtsByMonth.entries()) {
      this.debtsByMonth.set(
        mk,
        list.filter((d) => d.id !== debtId)
      );
    }
  }

  async saveSavingsBucket(
    _uid: string,
    bucketId: string,
    openingBalanceCop: number,
    monthKey: string = '2026-10',
    bucketName?: string
  ): Promise<void> {
    const list = ensureStandardSavingsBuckets(
      this.savingsBucketsByMonth.get(monthKey) ?? []
    );
    const normalizedOpening = Math.max(0, Math.round(openingBalanceCop));
    const exists = list.some((b) => b.id === bucketId);
    const updated = exists
      ? list.map((b) =>
          b.id === bucketId
            ? {
                ...b,
                name: bucketName ?? b.name,
                openingBalance: normalizedOpening,
                monthKey,
              }
            : b
        )
      : [
          ...list,
          {
            id: bucketId,
            name: bucketName ?? bucketId,
            openingBalance: normalizedOpening,
            monthKey,
          },
        ];
    this.savingsBucketsByMonth.set(monthKey, updated);
  }

  async deleteSavingsBucket(_uid: string, bucketId: string): Promise<void> {
    for (const [mk, list] of this.savingsBucketsByMonth.entries()) {
      this.savingsBucketsByMonth.set(
        mk,
        list.filter((b) => b.id !== bucketId)
      );
    }
  }

  async saveProvisionPlan(_uid: string, plan: IdealMotoPlan): Promise<void> {
    this.provisionPlan = {
      items: plan.items.map((item) => ({ ...item })),
      recurringMonthlyTotalCop: plan.recurringMonthlyTotalCop,
      totalWithTargetGoalCop: plan.totalWithTargetGoalCop,
    };
  }

  async saveInitialAccountSetup(
    uid: string,
    payload: InitialAccountSetupPayload
  ): Promise<void> {
    this.concepts.clear();
    this.entries.clear();
    this.debtsByMonth.clear();
    this.debtPayments.clear();
    this.savingsBucketsByMonth.clear();
    this.snapshots.clear();

    for (const c of payload.concepts) {
      this.concepts.set(c.id, { ...c });
    }
    for (const e of payload.entries) {
      this.entries.set(e.id, { ...e });
    }
    this.debtsByMonth.set(
      payload.monthKey,
      payload.debts.map((d) => ({ ...d }))
    );
    for (const dp of payload.debtPayments) {
      this.debtPayments.set(dp.id, { ...dp });
    }
    this.savingsBucketsByMonth.set(
      payload.monthKey,
      ensureStandardSavingsBuckets(payload.savingsBuckets)
    );
    this.provisionPlan = {
      items: payload.provisionPlan.items.map((i) => ({ ...i })),
      recurringMonthlyTotalCop: payload.provisionPlan.recurringMonthlyTotalCop,
      totalWithTargetGoalCop: payload.provisionPlan.totalWithTargetGoalCop,
    };
    this.resetUsers.delete(uid);
    this.onboardedUsers.add(uid);
    this.activeMonthByUser.set(uid, payload.monthKey);
  }

  async saveActiveMonthKey(uid: string, monthKey: string): Promise<void> {
    this.activeMonthByUser.set(uid, monthKey);
  }

  async saveUserProfile(uid: string, profile: UserProfileFields): Promise<void> {
    this.profilesByUser.set(uid, { ...profile });
  }

  /** Perfil guardado con `saveUserProfile` (solo para pruebas). */
  getUserProfile(uid: string): UserProfileFields | undefined {
    return this.profilesByUser.get(uid);
  }

  async resetFullAccountInCloud(uid: string, newStartMonthKey: string): Promise<void> {
    this.concepts.clear();
    this.entries.clear();
    this.debtsByMonth.clear();
    this.debtPayments.clear();
    this.savingsBucketsByMonth.clear();
    this.snapshots.clear();
    this.provisionPlan = { ...EMPTY_PROVISION_PLAN, items: [] };
    this.seededUsers.delete(uid);
    this.onboardedUsers.delete(uid);
    this.resetUsers.add(uid);
    this.activeMonthByUser.set(uid, newStartMonthKey);
    this.savingsBucketsByMonth.set(newStartMonthKey, ensureStandardSavingsBuckets([]));
  }

  async deleteEntryCompletely(_uid: string, entryId: string): Promise<void> {
    this.entries.delete(entryId);
    for (const [id, dp] of this.debtPayments.entries()) {
      if (dp.entryId === entryId) {
        this.debtPayments.delete(id);
      }
    }
  }

  async reopenMonthInCloud(uid: string, monthKey: string): Promise<void> {
    this.snapshots.delete(monthKey);
    this.activeMonthByUser.set(uid, monthKey);
  }

  async deleteMonthInCloud(
    uid: string,
    monthKey: string,
    fallbackMonthKey: string
  ): Promise<void> {
    this.snapshots.delete(monthKey);
    this.snapshots.delete(fallbackMonthKey);
    this.debtsByMonth.delete(monthKey);
    this.savingsBucketsByMonth.delete(monthKey);
    for (const [id, e] of this.entries.entries()) {
      if (e.monthKey === monthKey) {
        this.entries.delete(id);
      }
    }
    for (const [id, dp] of this.debtPayments.entries()) {
      if (dp.monthKey === monthKey) {
        this.debtPayments.delete(id);
      }
    }
    this.activeMonthByUser.set(uid, fallbackMonthKey);
  }
}

/**
 * Cloud Firestore implementation under `/users/{uid}/...`.
 * Respects Spark free-tier limits via deterministic IDs, month-scoped queries, and atomic batches.
 */
export class FirestoreBudgetRepository implements BudgetRepository {
  private readonly db: Firestore;

  constructor(db: Firestore = getFirebaseDb()) {
    this.db = db;
  }

  /**
   * Common write helper (ADR 0018, R-13): stamps `users/{uid}.dataRevision` with a newly generated
   * client revision string inside a `writeBatch`, commits atomically, and updates the local cache
   * envelope revision so subsequent cold boots know the local cache matches Firestore.
   */
  private async commitUserDataMutationBatch(
    uid: string,
    buildBatch: (batch: ReturnType<typeof writeBatch>, updatedAt: string) => void,
    extraUserFields?: Record<string, unknown>
  ): Promise<string> {
    const batch = writeBatch(this.db);
    const updatedAt = new Date().toISOString();
    const dataRevision = generateDataRevision();

    buildBatch(batch, updatedAt);

    const userDocRef = doc(this.db, 'users', uid);
    batch.set(
      userDocRef,
      {
        uid,
        ...(extraUserFields ?? {}),
        dataRevision,
        updatedAt,
      },
      { merge: true }
    );

    await batch.commit();
    updatePersistedAccountRevision(uid, dataRevision, updatedAt);
    return dataRevision;
  }

  async seedOctober2026IfEmpty(
    uid: string,
    userEmail?: string | null,
    existingUserData?: Record<string, unknown>
  ): Promise<{ seeded: boolean; monthKey: string }> {
    const userDocRef = doc(this.db, 'users', uid);
    let userData = existingUserData;
    if (!userData) {
      const userSnap = await getDoc(userDocRef);
      userData = userSnap.exists() ? userSnap.data() : undefined;
    }
    const resolvedEmail =
      userEmail ?? (typeof userData?.email === 'string' ? userData.email : null);

    const existingActive =
      typeof userData?.activeMonthKey === 'string'
        ? (userData.activeMonthKey as string)
        : isOwnerCanonicalEmail(resolvedEmail)
          ? '2026-10'
          : `${toAppMonthKey().slice(0, 4)}-01`;

    if (userData?.accountResetByUser === true) {
      return { seeded: false, monthKey: existingActive };
    }

    if (userData?.seededOctober2026 === true || userData?.onboardingCompleted === true) {
      return { seeded: false, monthKey: existingActive };
    }

    // Only the canonical owner account (abernalg2303@gmail.com) gets the October 2026 seed.
    // All other users start clean and configure their account on first login.
    if (!isOwnerCanonicalEmail(resolvedEmail)) {
      return { seeded: false, monthKey: existingActive };
    }

    // Extra safety check: if concepts already exist in Firestore for the owner, never overwrite them.
    const existingConceptsSnap = await getDocs(collection(this.db, 'users', uid, 'concepts'));
    if (existingConceptsSnap.docs.length > 0) {
      void this.commitUserDataMutationBatch(
        uid,
        () => {},
        {
          seededOctober2026: true,
          onboardingCompleted: true,
          activeMonthKey: existingActive,
        }
      ).catch(() => {});
      return { seeded: false, monthKey: existingActive };
    }

    const payload = buildOctober2026SeedPayload();
    await this.commitUserDataMutationBatch(
      uid,
      (batch, updatedAt) => {
        for (const concept of payload.concepts) {
          const ref = doc(this.db, 'users', uid, 'concepts', concept.id);
          batch.set(ref, {
            ...serializeConceptForFirestore(concept),
            updatedAt,
          });
        }

        for (const entry of payload.entries) {
          const ref = doc(this.db, 'users', uid, 'entries', entry.id);
          batch.set(ref, {
            ...serializeMonthEntryForFirestore(entry),
            updatedAt,
          });
        }

        for (const debt of payload.debts) {
          const ref = doc(this.db, 'users', uid, 'debts', debt.id);
          batch.set(ref, {
            ...serializeDebtForFirestore(debt),
            updatedAt,
          });
        }

        for (const payment of payload.debtPayments) {
          const ref = doc(this.db, 'users', uid, 'debtPayments', payment.id);
          batch.set(ref, {
            ...serializeDebtPaymentForFirestore(payment),
            updatedAt,
          });
        }

        for (const bucket of payload.savingsBuckets) {
          const ref = doc(this.db, 'users', uid, 'savingsBuckets', bucket.id);
          batch.set(ref, {
            ...serializeSavingsBucketForFirestore(bucket),
            updatedAt,
          });
        }

        const planRef = doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal');
        batch.set(planRef, {
          id: 'moto_ideal',
          ...serializeIdealMotoPlanForFirestore(payload.provisionPlan),
          updatedAt,
        });
      },
      {
        seededOctober2026: true,
        onboardingCompleted: true,
        activeMonthKey: '2026-10',
      }
    );

    return { seeded: true, monthKey: '2026-10' };
  }

  async loadMonthWorkspace(uid: string, monthKey: string): Promise<MonthWorkspaceData> {
    const [
      userSnap,
      conceptsSnap,
      entriesSnap,
      debtsSnap,
      paymentsSnap,
      bucketsSnap,
      planSnap,
      snapshotSnap,
    ] = await Promise.all([
      getDoc(doc(this.db, 'users', uid)),
      getDocs(collection(this.db, 'users', uid, 'concepts')),
      getDocs(
        query(collection(this.db, 'users', uid, 'entries'), where('monthKey', '==', monthKey))
      ),
      getDocs(collection(this.db, 'users', uid, 'debts')),
      getDocs(
        query(
          collection(this.db, 'users', uid, 'debtPayments'),
          where('monthKey', '==', monthKey)
        )
      ),
      getDocs(collection(this.db, 'users', uid, 'savingsBuckets')),
      getDoc(doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal')),
      getDoc(doc(this.db, 'users', uid, 'monthSnapshots', monthKey)),
    ]);

    const userData = userSnap.exists() ? userSnap.data() : undefined;
    const resolvedEmail = typeof userData?.email === 'string' ? userData.email : null;
    const isUnseededOwner =
      isOwnerCanonicalEmail(resolvedEmail) &&
      userData?.accountResetByUser !== true &&
      userData?.seededOctober2026 !== true &&
      userData?.onboardingCompleted !== true &&
      conceptsSnap.docs.length === 0;

    if (isUnseededOwner) {
      await this.seedOctober2026IfEmpty(uid, resolvedEmail, userData);
    }

    const concepts = safeParseList(conceptsSnap.docs, parseConceptFromFirestore).sort(
      (a, b) => a.order - b.order
    );
    const entries = safeParseList(entriesSnap.docs, parseMonthEntryFromFirestore);
    const currentDebts = safeParseList(debtsSnap.docs, parseDebtFromFirestore);
    const debtPayments = safeParseList(paymentsSnap.docs, parseDebtPaymentFromFirestore);
    const currentBuckets = ensureStandardSavingsBuckets(
      safeParseList(bucketsSnap.docs, parseSavingsBucketFromFirestore)
    );
    let provisionPlan = EMPTY_PROVISION_PLAN;
    if (planSnap.exists()) {
      try {
        provisionPlan = parseIdealMotoPlanFromFirestore(planSnap.data());
      } catch {
        provisionPlan = EMPTY_PROVISION_PLAN;
      }
    }
    let closedSnapshot: MonthSnapshot | undefined;
    if (snapshotSnap.exists()) {
      try {
        closedSnapshot = parseMonthSnapshotFromFirestore(snapshotSnap.data());
      } catch {
        closedSnapshot = undefined;
      }
    }

    const resolvedBalances = closedSnapshot
      ? reconstructClosedMonthBalances(
          closedSnapshot,
          concepts,
          entries,
          currentDebts,
          currentBuckets
        )
      : { debts: currentDebts, savingsBuckets: currentBuckets };

    return {
      monthKey,
      concepts,
      entries,
      debts: resolvedBalances.debts,
      debtPayments,
      savingsBuckets: resolvedBalances.savingsBuckets,
      provisionPlan,
      closedSnapshot,
    };
  }

  /**
   * Loads the user's entire budget, all months' entries, debts, savings, and closed monthSnapshots
   * when signing in on any device.
   */
  async loadFullCloudAccount(
    uid: string,
    userEmail?: string | null,
    options?: LoadCloudAccountOptions
  ): Promise<FullCloudAccountData> {
    const userDocRef = doc(this.db, 'users', uid);

    const canCheckRevisionFirst =
      !options?.forceFullSync &&
      !options?.isRegistration &&
      Boolean(options?.cachedAccount) &&
      typeof options?.cachedDataRevision === 'string' &&
      options.cachedDataRevision.length > 0 &&
      isCacheFreshWithin24Hours(options?.cachedSavedAt);

    let preloadedUserSnap: Awaited<ReturnType<typeof getDoc<Record<string, unknown>, Record<string, unknown>>>> | null = null;

    if (canCheckRevisionFirst && options?.cachedAccount) {
      preloadedUserSnap = await getDoc(userDocRef);
      const remoteData = (preloadedUserSnap.exists() ? preloadedUserSnap.data() : undefined) as
        | Record<string, unknown>
        | undefined;
      const remoteRevision =
        typeof remoteData?.dataRevision === 'string' ? remoteData.dataRevision : undefined;

      // R-13: If remote dataRevision matches the local cache envelope (< 24h old),
      // skip all 7 collection/plan queries (reading only 1 document: users/{uid}).
      if (remoteRevision && remoteRevision === options.cachedDataRevision) {
        return {
          ...options.cachedAccount,
          dataRevision: remoteRevision,
        };
      }
    }

    let [
      userSnap,
      conceptsSnap,
      entriesSnap,
      debtsSnap,
      paymentsSnap,
      bucketsSnap,
      planSnap,
      snapshotsSnap,
    ] = await Promise.all([
      preloadedUserSnap ? Promise.resolve(preloadedUserSnap) : getDoc(userDocRef),
      getDocs(collection(this.db, 'users', uid, 'concepts')),
      getDocs(collection(this.db, 'users', uid, 'entries')),
      getDocs(collection(this.db, 'users', uid, 'debts')),
      getDocs(collection(this.db, 'users', uid, 'debtPayments')),
      getDocs(collection(this.db, 'users', uid, 'savingsBuckets')),
      getDoc(doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal')),
      getDocs(collection(this.db, 'users', uid, 'monthSnapshots')),
    ]);

    let userData = (userSnap.exists() ? userSnap.data() : undefined) as
      | Record<string, unknown>
      | undefined;
    const resolvedEmail =
      userEmail ?? (typeof userData?.email === 'string' ? userData.email : null);
    const isOwner = isOwnerCanonicalEmail(resolvedEmail);
    const isResetByUser = userData?.accountResetByUser === true;

    let seedMonthKey =
      typeof userData?.activeMonthKey === 'string'
        ? (userData.activeMonthKey as string)
        : isOwner
          ? '2026-10'
          : `${toAppMonthKey().slice(0, 4)}-01`;

    // R-11 & R-12: Avoid pre-flight seedOctober2026IfEmpty round-trip and duplicate users/{uid} read.
    // Only seed when the account is the canonical owner and has 0 concepts yet.
    if (
      isOwner &&
      !isResetByUser &&
      userData?.seededOctober2026 !== true &&
      userData?.onboardingCompleted !== true
    ) {
      if (conceptsSnap.docs.length > 0) {
        const nextRev = generateDataRevision();
        void this.commitUserDataMutationBatch(
          uid,
          () => {},
          {
            seededOctober2026: true,
            onboardingCompleted: true,
            activeMonthKey: seedMonthKey,
          }
        ).catch(() => {});
        userData = {
          ...(userData ?? {}),
          seededOctober2026: true,
          onboardingCompleted: true,
          dataRevision: nextRev,
        };
      } else {
        const seedInfo = await this.seedOctober2026IfEmpty(uid, resolvedEmail, userData);
        seedMonthKey = seedInfo.monthKey;
        if (seedInfo.seeded) {
          [
            userSnap,
            conceptsSnap,
            entriesSnap,
            debtsSnap,
            paymentsSnap,
            bucketsSnap,
            planSnap,
            snapshotsSnap,
          ] = await Promise.all([
            getDoc(userDocRef),
            getDocs(collection(this.db, 'users', uid, 'concepts')),
            getDocs(collection(this.db, 'users', uid, 'entries')),
            getDocs(collection(this.db, 'users', uid, 'debts')),
            getDocs(collection(this.db, 'users', uid, 'debtPayments')),
            getDocs(collection(this.db, 'users', uid, 'savingsBuckets')),
            getDoc(doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal')),
            getDocs(collection(this.db, 'users', uid, 'monthSnapshots')),
          ]);
          userData = userSnap.exists() ? userSnap.data() : undefined;
        }
      }
    }

    const seedInfo = { monthKey: seedMonthKey };

    const savedActiveMonthKey =
      typeof userData?.activeMonthKey === 'string' &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(userData.activeMonthKey)
        ? (userData.activeMonthKey as string)
        : undefined;

    const concepts = safeParseList(conceptsSnap.docs, parseConceptFromFirestore).sort(
      (a, b) => a.order - b.order
    );
    const entries = safeParseList(entriesSnap.docs, parseMonthEntryFromFirestore);
    const currentDebts = safeParseList(debtsSnap.docs, parseDebtFromFirestore);
    const debtPayments = safeParseList(paymentsSnap.docs, parseDebtPaymentFromFirestore);

    // Deduplicate savings buckets by bucket.id (preferring direct doc ID matches)
    // and heal only the specific 16.88M cross-account corruption if present, while
    // allowing all users (including the owner) to freely edit or delete any bucket.
    const bucketMap = new Map<string, SavingsBucket>();
    const staleBucketRefsToDelete: Array<ReturnType<typeof doc>> = [];
    let needsOwnerSavingsHeal = false;

    for (const bDoc of bucketsSnap.docs) {
      let parsed: SavingsBucket;
      try {
        parsed = parseSavingsBucketFromFirestore(bDoc.data());
      } catch {
        continue;
      }

      if (bDoc.id !== parsed.id) {
        staleBucketRefsToDelete.push(bDoc.ref);
        continue;
      }

      if (
        isOwner &&
        !isResetByUser &&
        parsed.id === 'savings' &&
        (parsed.openingBalance === 14_800_000 ||
          parsed.openingBalance === 13_800_000 ||
          parsed.openingBalance === 16_880_000)
      ) {
        needsOwnerSavingsHeal = true;
        bucketMap.set('savings', {
          ...parsed,
          openingBalance: 1_000_000,
          monthKey: '2026-10',
        });
        continue;
      }

      bucketMap.set(parsed.id, parsed);
    }

    if (isOwner && !isResetByUser && (needsOwnerSavingsHeal || staleBucketRefsToDelete.length > 0)) {
      try {
        void this.commitUserDataMutationBatch(uid, (healBatch, updatedAt) => {
          for (const staleRef of staleBucketRefsToDelete) {
            healBatch.delete(staleRef);
          }
          const savingsBucket = bucketMap.get('savings');
          if (needsOwnerSavingsHeal && savingsBucket) {
            healBatch.set(doc(this.db, 'users', uid, 'savingsBuckets', 'savings'), {
              ...serializeSavingsBucketForFirestore(savingsBucket),
              updatedAt,
            });
          }
        }).catch(() => {});
      } catch {
        // Non-fatal if offline; in-memory state is already healed
      }
    }

    let rawBuckets = Array.from(bucketMap.values());
    // If a non-owner account has 0 configured concepts/entries/debts and only has 0-balance default 'moto'/'savings'
    // buckets from legacy initialization, strip them so new users only see funds they explicitly create.
    if (
      (!isOwner || isResetByUser) &&
      concepts.length === 0 &&
      entries.length === 0 &&
      currentDebts.length === 0 &&
      rawBuckets.every(
        (b) => (b.id === 'moto' || b.id === 'savings') && b.openingBalance === 0
      )
    ) {
      rawBuckets = [];
    }

    let provisionPlan: IdealMotoPlan =
      isOwner && !isResetByUser
        ? buildOctober2026SeedPayload().provisionPlan
        : EMPTY_PROVISION_PLAN;
    if (planSnap.exists()) {
      try {
        provisionPlan = parseIdealMotoPlanFromFirestore(planSnap.data());
      } catch {
        // Keep fallback provisionPlan
      }
    }

    const closedSnapshots: Record<string, MonthSnapshot> = {};
    for (const snapDoc of snapshotsSnap.docs) {
      try {
        const parsed = parseMonthSnapshotFromFirestore(snapDoc.data());
        closedSnapshots[parsed.monthKey] = parsed;
      } catch {
        // Ignore malformed snapshot doc
      }
    }

    const hasConfiguredData =
      concepts.length > 0 ||
      entries.length > 0 ||
      currentDebts.length > 0 ||
      rawBuckets.length > 0 ||
      userData?.onboardingCompleted === true ||
      userData?.seededOctober2026 === true;

    let needsOnboarding: boolean;
    if (isResetByUser) {
      needsOnboarding = true;
    } else if (options?.isRegistration === true && !isOwner) {
      needsOnboarding = true;
    } else if (options?.isRegistration === false) {
      // User is signing in to an existing account (not registering for the first time):
      // never show the initial setup wizard again even if they left everything blank on registration.
      needsOnboarding = false;
    } else {
      needsOnboarding = !hasConfiguredData && !isOwner;
    }

    const hasOctoberData =
      entries.some((e) => e.monthKey === '2026-10') ||
      currentDebts.some((d) => d.monthKey === '2026-10') ||
      Boolean(closedSnapshots['2026-10']);

    const dataMonthsSet = new Set<string>();
    for (const e of entries) {
      dataMonthsSet.add(e.monthKey);
    }
    for (const d of currentDebts) {
      dataMonthsSet.add(d.monthKey);
    }
    for (const mk of Object.keys(closedSnapshots)) {
      dataMonthsSet.add(mk);
      dataMonthsSet.add(addMonthsToMonthKey(mk, 1));
    }
    for (const b of rawBuckets) {
      if (!b.monthKey) continue;
      // Ignore legacy default '2026-10' on non-owner buckets if the account has no October data
      if (b.monthKey === '2026-10' && (!isOwner || isResetByUser) && !hasOctoberData) {
        continue;
      }
      dataMonthsSet.add(b.monthKey);
    }

    const monthsSet = new Set<string>(dataMonthsSet);
    if (isOwner && !isResetByUser && (userData?.seededOctober2026 === true || concepts.length > 0)) {
      monthsSet.add('2026-10');
    }

    if (savedActiveMonthKey) {
      const isStaleDefaultOctoberOnNonOwner =
        savedActiveMonthKey === '2026-10' &&
        (!isOwner || isResetByUser) &&
        !hasOctoberData &&
        (Array.from(dataMonthsSet).some((m) => m !== '2026-10') ||
          userData?.onboardingCompleted !== true);

      if (!isStaleDefaultOctoberOnNonOwner) {
        monthsSet.add(savedActiveMonthKey);
      }
    }

    if (monthsSet.size === 0) {
      const fallbackStartMonth =
        isOwner && !isResetByUser ? '2026-10' : `${toAppMonthKey().slice(0, 4)}-01`;
      monthsSet.add(fallbackStartMonth);
    }

    const availableMonths = Array.from(monthsSet).sort();
    // Always open on the latest month the account is in, even if there are 0 movements in that month
    const activeMonthKey =
      availableMonths[availableMonths.length - 1] ?? seedInfo.monthKey;

    // Mark onboardingCompleted: true in Firestore once the initial registration wizard is served
    // or when an existing user signs in, so subsequent logins never re-prompt the wizard.
    const shouldMarkOnboardingDoneInCloud =
      !isResetByUser &&
      (options?.isRegistration === true ||
        options?.isRegistration === false ||
        needsOnboarding) &&
      userData?.onboardingCompleted !== true;

    let resolvedDataRevision =
      typeof userData?.dataRevision === 'string' && userData.dataRevision.length > 0
        ? userData.dataRevision
        : undefined;

    if (
      savedActiveMonthKey !== activeMonthKey ||
      shouldMarkOnboardingDoneInCloud ||
      !resolvedDataRevision
    ) {
      const generatedRev = generateDataRevision();
      if (!resolvedDataRevision) {
        resolvedDataRevision = generatedRev;
      }
      try {
        void this.commitUserDataMutationBatch(
          uid,
          () => {},
          {
            activeMonthKey,
            ...(shouldMarkOnboardingDoneInCloud
              ? { onboardingCompleted: true, accountResetByUser: false }
              : {}),
          }
        ).catch(() => {});
      } catch {
        // Non-fatal if offline
      }
    }

    // Ensure any open month without entries yet has its recurring checklist concepts populated
    for (const mk of availableMonths) {
      if (
        !closedSnapshots[mk] &&
        concepts.length > 0 &&
        !entries.some((e) => e.monthKey === mk)
      ) {
        const plannedEntries = ensureMonthPlan(mk, concepts, []);
        entries.push(...plannedEntries);
      }
    }

    const defaultMotoOpening = isOwner && !isResetByUser ? 1_600_000 : 0;
    const defaultSavingsOpening = isOwner && !isResetByUser ? 1_000_000 : 0;
    const baseBuckets = ensureStandardSavingsBuckets(
      rawBuckets,
      defaultMotoOpening,
      defaultSavingsOpening
    );

    // Ensure every completed entry for a debt-linked concept has an active debtPayment in memory
    const paymentList: DebtPayment[] = [...debtPayments];
    const conceptById = new Map<string, Concept>(concepts.map((c) => [c.id, c]));

    const debtsByMonth: Record<string, Debt[]> = {};
    const savingsBucketsByMonth: Record<string, SavingsBucket[]> = {};

    for (let idx = 0; idx < availableMonths.length; idx += 1) {
      const mk = availableMonths[idx]!;
      const snap = closedSnapshots[mk];

      if (idx === 0) {
        if (snap) {
          const reconstructed = reconstructClosedMonthBalances(
            snap,
            concepts,
            entries,
            currentDebts,
            baseBuckets
          );
          debtsByMonth[mk] = reconstructed.debts;
          savingsBucketsByMonth[mk] = ensureStandardSavingsBuckets(
            reconstructed.savingsBuckets,
            defaultMotoOpening,
            defaultSavingsOpening
          );
        } else {
          // If this first month is '2026-10' for the owner and currentDebts/baseBuckets was already rolled to a later month,
          // restore '2026-10' canonical opening balances so subsequent months don't double-compound.
          debtsByMonth[mk] = currentDebts.map((d) => {
            if (isOwner && !isResetByUser && mk === '2026-10' && d.monthKey && d.monthKey !== '2026-10') {
              if (d.id === 'debt_cb300f_moto') {
                return { ...d, openingBalance: 4_400_000, monthKey: '2026-10' };
              }
              if (d.id === 'debt_esp_ia' || d.id === 'debt_especializacion') {
                return { ...d, openingBalance: 3_600_000, monthKey: '2026-10' };
              }
            }
            return {
              ...d,
              monthKey: mk,
            };
          });
          savingsBucketsByMonth[mk] = baseBuckets.map((b) => {
            if (isOwner && !isResetByUser && mk === '2026-10' && b.monthKey && b.monthKey !== '2026-10') {
              if (b.id === 'moto') {
                return { ...b, openingBalance: 1_600_000, monthKey: '2026-10' };
              }
              if (b.id === 'savings') {
                return { ...b, openingBalance: 1_000_000, monthKey: '2026-10' };
              }
            }
            return { ...b };
          });
        }
      } else {
        const prevMk = availableMonths[idx - 1]!;
        const prevDebts = debtsByMonth[prevMk] ?? currentDebts;
        const prevEntries = entries.filter((e) => e.monthKey === prevMk);

        // Synthesize missing debt payments for completed debt-linked entries in prevMk
        for (const entry of prevEntries) {
          if (entry.status !== 'completed') continue;
          const concept = conceptById.get(entry.conceptId);
          if (!concept?.linkedDebtGroup && !concept?.defaultTargetDebtId) continue;
          const hasPayment = paymentList.some(
            (dp) => dp.entryId === entry.id && dp.monthKey === prevMk
          );
          if (!hasPayment && prevDebts.length > 0) {
            const synthesized = buildDebtPaymentsForInstallment(
              entry,
              prevDebts,
              undefined,
              concept.defaultTargetDebtId
            );
            for (const s of synthesized) {
              paymentList.push(s);
            }
          }
        }

        const prevPayments = paymentList.filter((dp) => dp.monthKey === prevMk);
        const prevDebtSummary = calculateDebtsSummary(
          prevDebts,
          entries,
          prevMk,
          prevPayments
        );
        const currentDebtById = new Map<string, Debt>(currentDebts.map((d) => [d.id, d]));

        // Chain each debt's remainingBalance from prevMk as the new openingBalance for mk,
        // while preserving interest rate & installment metadata from currentDebts.
        const rolledDebts: Debt[] = prevDebtSummary.debts.map((item) => {
          const meta = currentDebtById.get(item.debtId);
          const prevDebt = prevDebts.find((d) => d.id === item.debtId);
          const rolledOpening = Math.max(0, item.remainingBalance);

          // If the user explicitly edited the debt in month `mk` (and it wasn't the old 4.4M/3.6M reset bug),
          // honor their direct edit in `mk`; otherwise use the rolled-over opening balance from `prevMk`.
          const isLegacyResetValue =
            (item.debtId === 'debt_cb300f_moto' &&
              meta?.openingBalance === 4_400_000 &&
              rolledOpening !== 4_400_000) ||
            ((item.debtId === 'debt_especializacion' || item.debtId === 'debt_esp_ia') &&
              meta?.openingBalance === 3_600_000 &&
              rolledOpening !== 3_600_000);

          const effectiveOpening =
            meta?.monthKey === mk && !isLegacyResetValue
              ? meta.openingBalance
              : rolledOpening;

          const monthlyRate =
            meta?.monthlyInterestRate ?? prevDebt?.monthlyInterestRate ?? item.monthlyInterestRate;
          const annualRate =
            meta?.annualInterestRate ?? prevDebt?.annualInterestRate ?? item.annualInterestRate;
          const rateType =
            meta?.interestRateType ?? prevDebt?.interestRateType ?? item.interestRateType;
          const installment =
            meta?.monthlyInstallment ?? prevDebt?.monthlyInstallment ?? item.monthlyInstallment;

          return {
            id: item.debtId,
            groupKey: meta?.groupKey ?? prevDebt?.groupKey ?? 'FUNFAMI',
            name: meta?.name ?? item.name,
            lender: meta?.lender ?? prevDebt?.lender ?? item.lender,
            openingBalance: effectiveOpening,
            monthKey: mk,
            ...(monthlyRate !== undefined ? { monthlyInterestRate: monthlyRate } : {}),
            ...(annualRate !== undefined ? { annualInterestRate: annualRate } : {}),
            ...(rateType ? { interestRateType: rateType } : {}),
            ...(installment !== undefined ? { monthlyInstallment: installment } : {}),
          };
        });

        // Include any newly created debts in `currentDebts` that were created in `mk` and didn't exist in `prevMk`
        for (const d of currentDebts) {
          if (!rolledDebts.some((rd) => rd.id === d.id) && d.monthKey >= mk) {
            rolledDebts.push({ ...d, monthKey: mk });
          }
        }

        debtsByMonth[mk] = rolledDebts;

        // Roll over savings buckets from prevMk to mk
        const prevBuckets = ensureStandardSavingsBuckets(
          savingsBucketsByMonth[prevMk] ?? baseBuckets,
          defaultMotoOpening,
          defaultSavingsOpening
        );
        const prevBudget = calculateMonthlyBudgetSummary(entries, prevMk);
        const prevSavings = calculateMonthlySavingsSummary(
          prevBuckets,
          concepts,
          entries,
          prevBudget,
          prevMk
        );

        if (snap) {
          const reconstructed = reconstructClosedMonthBalances(
            snap,
            concepts,
            entries,
            rolledDebts,
            baseBuckets
          );
          savingsBucketsByMonth[mk] = ensureStandardSavingsBuckets(
            reconstructed.savingsBuckets,
            defaultMotoOpening,
            defaultSavingsOpening
          );
        } else {
          const customClosingById = new Map<string, number>(
            prevSavings.customBuckets.map((cb) => [cb.id, cb.currentBalance])
          );
          savingsBucketsByMonth[mk] = prevBuckets.map((b) => {
            const directBucket = rawBuckets.find((rb) => rb.id === b.id);
            if (directBucket?.monthKey === mk) {
              return { ...directBucket };
            }
            if (b.id === 'moto') {
              return {
                ...b,
                openingBalance: Math.max(0, prevSavings.moto.currentBalance),
                monthKey: mk,
              };
            }
            if (b.id === 'savings') {
              return {
                ...b,
                openingBalance: Math.max(0, prevSavings.savings.currentBalance),
                monthKey: mk,
              };
            }
            return {
              ...b,
              openingBalance: Math.max(0, customClosingById.get(b.id) ?? b.openingBalance),
              monthKey: mk,
            };
          });
        }
      }

      // Also synthesize missing debt payments for completed debt-linked entries in the current month `mk`
      const mkEntries = entries.filter((e) => e.monthKey === mk);
      const mkDebts = debtsByMonth[mk] ?? [];
      for (const entry of mkEntries) {
        if (entry.status !== 'completed') continue;
        const concept = conceptById.get(entry.conceptId);
        if (!concept?.linkedDebtGroup && !concept?.defaultTargetDebtId) continue;
        const hasPayment = paymentList.some(
          (dp) => dp.entryId === entry.id && dp.monthKey === mk
        );
        if (!hasPayment && mkDebts.length > 0) {
          const synthesized = buildDebtPaymentsForInstallment(
            entry,
            mkDebts,
            undefined,
            concept.defaultTargetDebtId
          );
          for (const s of synthesized) {
            paymentList.push(s);
          }
        }
      }
    }

    return {
      activeMonthKey,
      availableMonths,
      concepts,
      entries,
      debtsByMonth,
      debtPayments: paymentList,
      savingsBucketsByMonth,
      provisionPlan,
      closedSnapshots,
      needsOnboarding,
      ...(resolvedDataRevision ? { dataRevision: resolvedDataRevision } : {}),
    };
  }

  async toggleEntryCompletion(
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
  ): Promise<ToggleEntryCompletionResult> {
    const entryRef = doc(this.db, 'users', uid, 'entries', entryId);
    let currentEntry = options?.entry;
    let concept: Concept | null | undefined = options?.concept;

    if (!currentEntry) {
      const entrySnap = await getDoc(entryRef);
      if (!entrySnap.exists()) {
        throw new Error(`Entry ${entryId} not found for user ${uid}`);
      }
      currentEntry = parseMonthEntryFromFirestore(entrySnap.data());
    }

    if (currentEntry.monthKey !== monthKey) {
      throw new Error(`Entry ${entryId} belongs to ${currentEntry.monthKey}, expected ${monthKey}`);
    }

    if (concept === undefined) {
      const conceptRef = doc(this.db, 'users', uid, 'concepts', currentEntry.conceptId);
      const conceptSnap = await getDoc(conceptRef);
      concept = conceptSnap.exists()
        ? parseConceptFromFirestore(conceptSnap.data())
        : null;
    }

    const nextEntries = toggleMovementStatus([currentEntry], entryId, {
      actualAmount: options?.actualAmount ?? currentEntry.plannedAmount,
      completedAt: options?.completedAtDateIso ?? toAppIsoDate(),
    });

    const updatedEntry = nextEntries[0];
    if (!updatedEntry) {
      throw new Error(`Failed to compute updated entry for ${entryId}`);
    }

    let updatedDebtPayment: DebtPayment | undefined;
    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      const targetDebtId =
        options?.targetDebtId ?? concept.defaultTargetDebtId ?? 'debt_obligation_primary';
      const paymentId = `${updatedEntry.id}_${targetDebtId}`;

      updatedDebtPayment = {
        id: paymentId,
        entryId: updatedEntry.id,
        monthKey: updatedEntry.monthKey,
        debtId: targetDebtId,
        principalAmount: updatedEntry.actualAmount,
        interestAmount: 0,
        totalApplied: updatedEntry.actualAmount,
        completedAt: updatedEntry.completedAt,
        active: updatedEntry.status === 'completed',
      };
    }

    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      batch.set(entryRef, {
        ...serializeMonthEntryForFirestore(updatedEntry),
        updatedAt,
      });

      if (updatedDebtPayment) {
        const paymentRef = doc(this.db, 'users', uid, 'debtPayments', updatedDebtPayment.id);
        batch.set(paymentRef, {
          ...serializeDebtPaymentForFirestore(updatedDebtPayment),
          updatedAt,
        });
      }
    });

    return {
      updatedEntry,
      updatedDebtPayment,
    };
  }

  async addMonthEntry(
    uid: string,
    input: RegisterOrCompleteMovementInput
  ): Promise<MonthEntry> {
    const [entriesSnap, conceptsSnap] = await Promise.all([
      getDocs(
        query(
          collection(this.db, 'users', uid, 'entries'),
          where('monthKey', '==', input.monthKey)
        )
      ),
      getDocs(collection(this.db, 'users', uid, 'concepts')),
    ]);

    const existingEntriesForMonth = entriesSnap.docs.map((d) =>
      parseMonthEntryFromFirestore(d.data())
    );
    const concepts = conceptsSnap.docs.map((d) => parseConceptFromFirestore(d.data()));

    const nextEntries = registerMovement(existingEntriesForMonth, concepts, input);
    const created =
      nextEntries.find(
        (e) =>
          e.monthKey === input.monthKey &&
          e.conceptId === input.conceptId &&
          !existingEntriesForMonth.some((prev) => prev.id === e.id && prev.status === 'completed')
      ) ?? nextEntries[nextEntries.length - 1];
    if (!created) {
      throw new Error('Failed to create month entry');
    }

    const concept = concepts.find((c) => c.id === created.conceptId);
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const entryRef = doc(this.db, 'users', uid, 'entries', created.id);
      batch.set(entryRef, {
        ...serializeMonthEntryForFirestore(created),
        updatedAt,
      });

      if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
        const targetDebtId = concept.defaultTargetDebtId ?? 'debt_obligation_primary';
        const paymentId = `${created.id}_${targetDebtId}`;
        const paymentRef = doc(this.db, 'users', uid, 'debtPayments', paymentId);
        batch.set(paymentRef, {
          ...serializeDebtPaymentForFirestore({
            id: paymentId,
            entryId: created.id,
            monthKey: created.monthKey,
            debtId: targetDebtId,
            principalAmount: created.actualAmount,
            interestAmount: 0,
            totalApplied: created.actualAmount,
            completedAt: created.completedAt,
            active: true,
          }),
          updatedAt,
        });
      }
    });

    return created;
  }

  async deleteOrResetEntry(
    uid: string,
    entryId: string,
    options?: { entry?: MonthEntry; concept?: Concept }
  ): Promise<void> {
    const entryRef = doc(this.db, 'users', uid, 'entries', entryId);
    let entry = options?.entry;
    let concept = options?.concept;

    // R-14: Avoid 2 sequential getDoc calls when entry and concept are already supplied from the store.
    if (!entry) {
      const snap = await getDoc(entryRef);
      if (!snap.exists()) return;
      entry = parseMonthEntryFromFirestore(snap.data());
    }

    if (!concept) {
      const conceptSnap = await getDoc(doc(this.db, 'users', uid, 'concepts', entry.conceptId));
      concept = conceptSnap.exists()
        ? parseConceptFromFirestore(conceptSnap.data())
        : undefined;
    }

    if (concept?.allowMultiplePerMonth) {
      await this.commitUserDataMutationBatch(uid, (batch) => {
        batch.delete(entryRef);
      });
    } else {
      const resetEntry = uncompleteMovement([entry], entryId)[0];
      if (resetEntry) {
        await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
          batch.set(entryRef, {
            ...serializeMonthEntryForFirestore(resetEntry),
            updatedAt,
          });

          if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
            const targetDebtId = concept.defaultTargetDebtId ?? 'debt_obligation_primary';
            const paymentId = `${resetEntry.id}_${targetDebtId}`;
            const paymentRef = doc(this.db, 'users', uid, 'debtPayments', paymentId);
            batch.set(paymentRef, {
              ...serializeDebtPaymentForFirestore({
                id: paymentId,
                entryId: resetEntry.id,
                monthKey: resetEntry.monthKey,
                debtId: targetDebtId,
                principalAmount: resetEntry.actualAmount,
                interestAmount: 0,
                totalApplied: resetEntry.actualAmount,
                active: false,
              }),
              updatedAt,
            });
          }
        });
      }
    }
  }

  async closeMonth(
    uid: string,
    monthKey: string,
    closedAtIso = new Date().toISOString()
  ): Promise<CloseMonthResult> {
    const workspace = await this.loadMonthWorkspace(uid, monthKey);
    const result = closeMonthAndRollover({
      closingMonthKey: monthKey,
      closedAtIso,
      concepts: workspace.concepts,
      entries: workspace.entries,
      debts: workspace.debts,
      debtPayments: workspace.debtPayments,
      savingsBuckets: workspace.savingsBuckets,
    });

    await this.persistMonthCloseResult(uid, monthKey, result);
    return result;
  }

  async persistMonthCloseResult(
    uid: string,
    closingMonthKey: string,
    result: CloseMonthResult
  ): Promise<void> {
    await this.commitUserDataMutationBatch(
      uid,
      (batch, updatedAt) => {
        const snapshotRef = doc(this.db, 'users', uid, 'monthSnapshots', closingMonthKey);
        batch.set(snapshotRef, {
          ...serializeMonthSnapshotForFirestore(result.snapshot),
          updatedAt,
        });

        for (const nextDebt of result.nextMonthDebts) {
          const debtRef = doc(this.db, 'users', uid, 'debts', nextDebt.id);
          batch.set(debtRef, {
            ...serializeDebtForFirestore(nextDebt),
            updatedAt,
          });
        }

        for (const nextBucket of result.nextMonthSavingsBuckets) {
          const bucketRef = doc(this.db, 'users', uid, 'savingsBuckets', nextBucket.id);
          batch.set(bucketRef, {
            ...serializeSavingsBucketForFirestore({
              ...nextBucket,
              monthKey: result.nextMonthKey,
            }),
            updatedAt,
          });
        }

        for (const nextEntry of result.nextMonthEntries) {
          const entryRef = doc(this.db, 'users', uid, 'entries', nextEntry.id);
          batch.set(entryRef, {
            ...serializeMonthEntryForFirestore(nextEntry),
            updatedAt,
          });
        }
      },
      {
        activeMonthKey: result.nextMonthKey,
      }
    );
  }

  async saveOrUpdateEntry(
    uid: string,
    entry: MonthEntry,
    linkedConcept?: Concept,
    debtPayments?: DebtPayment[]
  ): Promise<void> {
    let existingPaymentsToDelete: Array<ReturnType<typeof doc>> = [];
    if (debtPayments) {
      try {
        const existingPaymentsSnap = await getDocs(
          query(
            collection(this.db, 'users', uid, 'debtPayments'),
            where('entryId', '==', entry.id)
          )
        );
        existingPaymentsToDelete = existingPaymentsSnap.docs
          .filter((docSnap) => !debtPayments.some((dp) => dp.id === docSnap.id))
          .map((docSnap) => docSnap.ref);
      } catch {
        // Non-fatal if index not yet available
      }
    }

    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const entryRef = doc(this.db, 'users', uid, 'entries', entry.id);
      batch.set(entryRef, {
        ...serializeMonthEntryForFirestore(entry),
        updatedAt,
      });

      if (linkedConcept) {
        const conceptRef = doc(this.db, 'users', uid, 'concepts', linkedConcept.id);
        batch.set(conceptRef, {
          ...serializeConceptForFirestore(linkedConcept),
          updatedAt,
        });
      }

      for (const staleRef of existingPaymentsToDelete) {
        batch.delete(staleRef);
      }

      if (debtPayments) {
        for (const dp of debtPayments) {
          const dpRef = doc(this.db, 'users', uid, 'debtPayments', dp.id);
          batch.set(dpRef, {
            ...serializeDebtPaymentForFirestore(dp),
            updatedAt,
          });
        }
      }
    });
  }

  async saveCustomConceptAndEntry(
    uid: string,
    concept: Concept,
    entry: MonthEntry,
    debtPayments?: DebtPayment[]
  ): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const conceptRef = doc(this.db, 'users', uid, 'concepts', concept.id);
      batch.set(conceptRef, {
        ...serializeConceptForFirestore(concept),
        updatedAt,
      });

      const entryRef = doc(this.db, 'users', uid, 'entries', entry.id);
      batch.set(entryRef, {
        ...serializeMonthEntryForFirestore(entry),
        updatedAt,
      });

      if (debtPayments && debtPayments.length > 0) {
        for (const dp of debtPayments) {
          const dpRef = doc(this.db, 'users', uid, 'debtPayments', dp.id);
          batch.set(dpRef, {
            ...serializeDebtPaymentForFirestore(dp),
            updatedAt,
          });
        }
      }
    });
  }

  async deleteEntryCompletely(uid: string, entryId: string): Promise<void> {
    let paymentRefsToDelete: Array<ReturnType<typeof doc>> = [];
    try {
      const paymentsSnap = await getDocs(
        query(
          collection(this.db, 'users', uid, 'debtPayments'),
          where('entryId', '==', entryId)
        )
      );
      paymentRefsToDelete = paymentsSnap.docs.map((snap) => snap.ref);
    } catch {
      // Non-fatal if index not yet propagated
    }

    await this.commitUserDataMutationBatch(uid, (batch) => {
      const entryRef = doc(this.db, 'users', uid, 'entries', entryId);
      batch.delete(entryRef);
      for (const ref of paymentRefsToDelete) {
        batch.delete(ref);
      }
    });
  }

  private async restoreBalancesFromSnapshotIfPresent(
    uid: string,
    targetMonthKey: string,
    batch: ReturnType<typeof writeBatch>,
    updatedAt: string
  ): Promise<void> {
    try {
      const snapshotRef = doc(this.db, 'users', uid, 'monthSnapshots', targetMonthKey);
      const [snapshotSnap, conceptsSnap, entriesSnap, debtsSnap, bucketsSnap] = await Promise.all([
        getDoc(snapshotRef),
        getDocs(collection(this.db, 'users', uid, 'concepts')),
        getDocs(
          query(
            collection(this.db, 'users', uid, 'entries'),
            where('monthKey', '==', targetMonthKey)
          )
        ),
        getDocs(collection(this.db, 'users', uid, 'debts')),
        getDocs(collection(this.db, 'users', uid, 'savingsBuckets')),
      ]);
      if (!snapshotSnap.exists()) return;

      const parsedSnap = parseMonthSnapshotFromFirestore(snapshotSnap.data());

      const concepts = safeParseList(conceptsSnap.docs, parseConceptFromFirestore);
      const entries = safeParseList(entriesSnap.docs, parseMonthEntryFromFirestore);
      const currentDebts = safeParseList(debtsSnap.docs, parseDebtFromFirestore);
      const currentBuckets = safeParseList(bucketsSnap.docs, parseSavingsBucketFromFirestore);

      const reconstructed = reconstructClosedMonthBalances(
        parsedSnap,
        concepts,
        entries,
        currentDebts,
        currentBuckets
      );

      for (const restoredDebt of reconstructed.debts) {
        batch.set(doc(this.db, 'users', uid, 'debts', restoredDebt.id), {
          ...serializeDebtForFirestore({ ...restoredDebt, monthKey: targetMonthKey }),
          updatedAt,
        });
      }
      for (const restoredBucket of reconstructed.savingsBuckets) {
        batch.set(doc(this.db, 'users', uid, 'savingsBuckets', restoredBucket.id), {
          ...serializeSavingsBucketForFirestore({
            ...restoredBucket,
            monthKey: targetMonthKey,
          }),
          updatedAt,
        });
      }
    } catch {
      // Non-fatal if snapshot restoration is skipped offline
    }
  }

  async reopenMonthInCloud(uid: string, monthKey: string): Promise<void> {
    const tempBatchOps: Array<(batch: ReturnType<typeof writeBatch>, updatedAt: string) => void> = [];
    const proxyBatch = {
      set: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => {
        tempBatchOps.push((b) => b.set(ref, data));
      },
    } as unknown as ReturnType<typeof writeBatch>;

    const previewUpdatedAt = new Date().toISOString();
    await this.restoreBalancesFromSnapshotIfPresent(uid, monthKey, proxyBatch, previewUpdatedAt);

    await this.commitUserDataMutationBatch(
      uid,
      (batch, updatedAt) => {
        for (const op of tempBatchOps) {
          op(batch, updatedAt);
        }
        const snapshotRef = doc(this.db, 'users', uid, 'monthSnapshots', monthKey);
        batch.delete(snapshotRef);
      },
      {
        activeMonthKey: monthKey,
      }
    );
  }

  async deleteMonthInCloud(
    uid: string,
    monthKey: string,
    fallbackMonthKey: string
  ): Promise<void> {
    const tempBatchOps: Array<(batch: ReturnType<typeof writeBatch>, updatedAt: string) => void> = [];
    const proxyBatch = {
      set: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => {
        tempBatchOps.push((b) => b.set(ref, data));
      },
    } as unknown as ReturnType<typeof writeBatch>;

    const previewUpdatedAt = new Date().toISOString();
    await this.restoreBalancesFromSnapshotIfPresent(
      uid,
      fallbackMonthKey,
      proxyBatch,
      previewUpdatedAt
    );

    let refsToDelete: Array<ReturnType<typeof doc>> = [];
    try {
      const [entriesSnap, paymentsSnap] = await Promise.all([
        getDocs(
          query(
            collection(this.db, 'users', uid, 'entries'),
            where('monthKey', '==', monthKey)
          )
        ),
        getDocs(
          query(
            collection(this.db, 'users', uid, 'debtPayments'),
            where('monthKey', '==', monthKey)
          )
        ),
      ]);
      refsToDelete = [
        ...entriesSnap.docs.map((d) => d.ref),
        ...paymentsSnap.docs.map((d) => d.ref),
      ];
    } catch {
      // Fallback
    }

    await this.commitUserDataMutationBatch(
      uid,
      (batch, updatedAt) => {
        for (const op of tempBatchOps) {
          op(batch, updatedAt);
        }
        const snapshotRef = doc(this.db, 'users', uid, 'monthSnapshots', monthKey);
        batch.delete(snapshotRef);

        const fallbackSnapshotRef = doc(this.db, 'users', uid, 'monthSnapshots', fallbackMonthKey);
        batch.delete(fallbackSnapshotRef);

        for (const ref of refsToDelete) {
          batch.delete(ref);
        }
      },
      {
        activeMonthKey: fallbackMonthKey,
      }
    );
  }

  async saveConcept(uid: string, concept: Concept): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const conceptRef = doc(this.db, 'users', uid, 'concepts', concept.id);
      batch.set(
        conceptRef,
        {
          ...serializeConceptForFirestore(concept),
          updatedAt,
        },
        { merge: true }
      );
    });
  }

  async deleteConcept(uid: string, conceptId: string): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch) => {
      const conceptRef = doc(this.db, 'users', uid, 'concepts', conceptId);
      batch.delete(conceptRef);
    });
  }

  async saveDebt(uid: string, debt: Debt): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const debtRef = doc(this.db, 'users', uid, 'debts', debt.id);
      batch.set(
        debtRef,
        {
          ...serializeDebtForFirestore(debt),
          updatedAt,
        },
        { merge: true }
      );
    });
  }

  async deleteDebt(uid: string, debtId: string): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch) => {
      const debtRef = doc(this.db, 'users', uid, 'debts', debtId);
      batch.delete(debtRef);
    });
  }

  async saveSavingsBucket(
    uid: string,
    bucketId: string,
    openingBalanceCop: number,
    monthKey: string = '2026-10',
    bucketName?: string
  ): Promise<void> {
    // Document ID must equal bucketId to satisfy firestore.rules (`data.id == bucketId`)
    const defaultName =
      bucketId === 'moto'
        ? 'Fondo Moto'
        : bucketId === 'savings'
          ? 'Fondo Ahorros'
          : bucketId;
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const bucketRef = doc(this.db, 'users', uid, 'savingsBuckets', bucketId);
      batch.set(
        bucketRef,
        {
          id: bucketId,
          name: bucketName ?? defaultName,
          openingBalance: Math.max(0, Math.round(openingBalanceCop)),
          monthKey,
          updatedAt,
        },
        { merge: true }
      );
    });
  }

  async deleteSavingsBucket(uid: string, bucketId: string): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch) => {
      const bucketRef = doc(this.db, 'users', uid, 'savingsBuckets', bucketId);
      batch.delete(bucketRef);
    });
  }

  async saveProvisionPlan(uid: string, plan: IdealMotoPlan): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const planRef = doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal');
      batch.set(
        planRef,
        {
          id: 'moto_ideal',
          ...serializeIdealMotoPlanForFirestore(plan),
          updatedAt,
        },
        { merge: true }
      );
    });
  }

  async saveInitialAccountSetup(
    uid: string,
    payload: InitialAccountSetupPayload
  ): Promise<void> {
    await this.commitUserDataMutationBatch(
      uid,
      (batch, updatedAt) => {
        for (const concept of payload.concepts) {
          const ref = doc(this.db, 'users', uid, 'concepts', concept.id);
          batch.set(ref, {
            ...serializeConceptForFirestore(concept),
            updatedAt,
          });
        }

        for (const entry of payload.entries) {
          const ref = doc(this.db, 'users', uid, 'entries', entry.id);
          batch.set(ref, {
            ...serializeMonthEntryForFirestore(entry),
            updatedAt,
          });
        }

        for (const debt of payload.debts) {
          const ref = doc(this.db, 'users', uid, 'debts', debt.id);
          batch.set(ref, {
            ...serializeDebtForFirestore(debt),
            updatedAt,
          });
        }

        for (const payment of payload.debtPayments) {
          const ref = doc(this.db, 'users', uid, 'debtPayments', payment.id);
          batch.set(ref, {
            ...serializeDebtPaymentForFirestore(payment),
            updatedAt,
          });
        }

        const buckets = ensureStandardSavingsBuckets(payload.savingsBuckets, 0, 0);
        const configuredBucketIds = new Set(buckets.map((b) => b.id));
        if (!configuredBucketIds.has('moto')) {
          batch.delete(doc(this.db, 'users', uid, 'savingsBuckets', 'moto'));
        }
        if (!configuredBucketIds.has('savings')) {
          batch.delete(doc(this.db, 'users', uid, 'savingsBuckets', 'savings'));
        }
        for (const bucket of buckets) {
          const ref = doc(this.db, 'users', uid, 'savingsBuckets', bucket.id);
          batch.set(ref, {
            ...serializeSavingsBucketForFirestore({
              ...bucket,
              monthKey: payload.monthKey,
            }),
            updatedAt,
          });
        }

        const planRef = doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal');
        batch.set(planRef, {
          id: 'moto_ideal',
          ...serializeIdealMotoPlanForFirestore(payload.provisionPlan),
          updatedAt,
        });
      },
      {
        activeMonthKey: payload.monthKey,
        onboardingCompleted: true,
        accountResetByUser: false,
      }
    );
  }

  async saveActiveMonthKey(uid: string, monthKey: string): Promise<void> {
    await this.commitUserDataMutationBatch(
      uid,
      () => {},
      {
        activeMonthKey: monthKey,
      }
    );
  }

  /** Guarda el nombre y la meta en `users/{uid}`, por la misma vía que el resto (ADR 0018). */
  async saveUserProfile(uid: string, profile: UserProfileFields): Promise<void> {
    await this.commitUserDataMutationBatch(
      uid,
      () => {},
      {
        displayName: profile.displayName,
        financialGoal: profile.financialGoal,
      }
    );
  }

  async resetFullAccountInCloud(uid: string, newStartMonthKey: string): Promise<void> {
    const subcollections = [
      'concepts',
      'entries',
      'debts',
      'debtPayments',
      'savingsBuckets',
      'provisionPlans',
      'monthSnapshots',
    ] as const;

    const snapshots = await Promise.all(
      subcollections.map((sub) => getDocs(collection(this.db, 'users', uid, sub)))
    );

    const allDocRefs = snapshots.flatMap((snap) => snap.docs.map((d) => d.ref));

    // Commit deletions in chunks of 400 to stay well below Firestore's 500-op batch limit
    const chunkSize = 400;
    for (let i = 0; i < allDocRefs.length; i += chunkSize) {
      const chunk = allDocRefs.slice(i, i + chunkSize);
      await this.commitUserDataMutationBatch(uid, (batch) => {
        for (const ref of chunk) {
          batch.delete(ref);
        }
      });
    }

    await this.commitUserDataMutationBatch(
      uid,
      (setupBatch, updatedAt) => {
        const planRef = doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal');
        setupBatch.set(planRef, {
          id: 'moto_ideal',
          ...serializeIdealMotoPlanForFirestore(EMPTY_PROVISION_PLAN),
          updatedAt,
        });
      },
      {
        activeMonthKey: newStartMonthKey,
        seededOctober2026: false,
        onboardingCompleted: false,
        accountResetByUser: true,
      }
    );
  }
}
