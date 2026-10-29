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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  deleteMovement,
  registerMovement,
  uncompleteMovement,
  type RegisterOrCompleteMovementInput,
} from '../../domain/checklist/checklist';
import { toBogotaIsoDate } from '../../domain/date/monthKey';
import { closeMonthAndRollover, type CloseMonthResult } from '../../domain/month-close/monthClose';
import type {
  Concept,
  Debt,
  DebtPayment,
  IdealMotoPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';
import { sumMoneyIntegers } from '../../domain/money/money';
import { getFirebaseDb } from '../firebase/firebaseConfig';
import {
  parseConceptFromFirestore,
  parseDebtFromFirestore,
  parseDebtPaymentFromFirestore,
  parseIdealMotoPlanFromFirestore,
  parseMonthEntryFromFirestore,
  parseMonthSnapshotFromFirestore,
  parseSavingsBucketFromFirestore,
  serializeConceptForFirestore,
  serializeDebtForFirestore,
  serializeDebtPaymentForFirestore,
  serializeIdealMotoPlanForFirestore,
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
}

export interface ToggleEntryCompletionResult {
  updatedEntry: MonthEntry;
  updatedDebtPayment?: DebtPayment;
}

export interface BudgetRepository {
  seedOctober2026IfEmpty(uid: string): Promise<{ seeded: boolean; monthKey: string }>;
  loadMonthWorkspace(uid: string, monthKey: string): Promise<MonthWorkspaceData>;
  loadFullCloudAccount(uid: string): Promise<FullCloudAccountData>;
  toggleEntryCompletion(
    uid: string,
    entryId: string,
    monthKey: string,
    options?: { actualAmount?: number; completedAtDateIso?: string; targetDebtId?: string }
  ): Promise<ToggleEntryCompletionResult>;
  addMonthEntry(uid: string, input: RegisterOrCompleteMovementInput): Promise<MonthEntry>;
  deleteOrResetEntry(uid: string, entryId: string): Promise<void>;
  closeMonth(uid: string, monthKey: string, closedAtIso?: string): Promise<CloseMonthResult>;
}

function reconstructClosedMonthBalances(
  snapshot: MonthSnapshot,
  concepts: readonly Concept[],
  entries: readonly MonthEntry[]
): { debts: Debt[]; savingsBuckets: SavingsBucket[] } {
  const debts: Debt[] = snapshot.closingDebts.map((cd) => ({
    id: cd.debtId,
    groupKey: 'FUNFAMI',
    name: cd.name,
    lender: 'FUNFAMI',
    openingBalance: cd.openingBalance,
    monthKey: snapshot.monthKey,
  }));

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

  const savingsBuckets: SavingsBucket[] = [
    {
      id: 'moto',
      name: 'Moto',
      openingBalance: Math.max(
        0,
        snapshot.closingSavings.motoClosingBalance - paidMotoContributions
      ),
    },
    {
      id: 'savings',
      name: 'Ahorros',
      openingBalance: Math.max(
        0,
        snapshot.closingSavings.savingsClosingBalance - snapshot.budget.netCashFlow
      ),
    },
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
  private activeMonthByUser = new Map<string, string>();

  constructor(autoSeedDefaultUser = true) {
    const seed = buildOctober2026SeedPayload();
    this.provisionPlan = seed.provisionPlan;
    if (autoSeedDefaultUser) {
      this.applySeedPayload(seed);
      this.seededUsers.add('local-owner');
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

  async seedOctober2026IfEmpty(uid: string): Promise<{ seeded: boolean; monthKey: string }> {
    if (this.seededUsers.has(uid) && this.entries.size > 0) {
      return { seeded: false, monthKey: this.activeMonthByUser.get(uid) ?? '2026-10' };
    }
    this.applySeedPayload();
    this.seededUsers.add(uid);
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
      []
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

  async loadFullCloudAccount(uid: string): Promise<FullCloudAccountData> {
    await this.seedOctober2026IfEmpty(uid);
    const activeMonthKey = this.activeMonthByUser.get(uid) ?? '2026-10';
    const concepts = Array.from(this.concepts.values()).sort((a, b) => a.order - b.order);
    const entries = Array.from(this.entries.values());
    const debtPayments = Array.from(this.debtPayments.values());

    const monthsSet = new Set<string>(['2026-10', activeMonthKey]);
    for (const e of entries) monthsSet.add(e.monthKey);
    for (const s of this.snapshots.keys()) monthsSet.add(s);
    const availableMonths = Array.from(monthsSet).sort();

    const defaultDebts = this.debtsByMonth.get('2026-10') ?? [];
    const defaultBuckets = this.savingsBucketsByMonth.get('2026-10') ?? [];
    const debtsByMonth: Record<string, Debt[]> = {};
    const savingsBucketsByMonth: Record<string, SavingsBucket[]> = {};
    for (const mk of availableMonths) {
      debtsByMonth[mk] = (this.debtsByMonth.get(mk) ?? defaultDebts).map((d) => ({ ...d }));
      savingsBucketsByMonth[mk] = (this.savingsBucketsByMonth.get(mk) ?? defaultBuckets).map(
        (sb) => ({ ...sb })
      );
    }

    const closedSnapshots: Record<string, MonthSnapshot> = {};
    for (const [mk, snap] of this.snapshots.entries()) {
      closedSnapshots[mk] = snap;
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
    const allConcepts = Array.from(this.concepts.values());

    const nextEntries =
      existing.status === 'completed'
        ? uncompleteMovement(allEntries, entryId)
        : registerMovement(allEntries, allConcepts, {
            monthKey,
            conceptId: existing.conceptId,
            actualAmount: options?.actualAmount ?? existing.plannedAmount,
            completedAt: options?.completedAtDateIso ?? toBogotaIsoDate(),
          });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    if (!updatedEntry) {
      throw new Error(`Updated entry ${entryId} missing after toggle`);
    }

    this.entries.set(updatedEntry.id, updatedEntry);

    const concept = this.concepts.get(updatedEntry.conceptId);
    let updatedDebtPayment: DebtPayment | undefined;

    if (concept?.linkedDebtGroup) {
      const targetDebtId = options?.targetDebtId ?? concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
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
    if (concept?.linkedDebtGroup) {
      const targetDebtId = concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
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
    if (concept?.linkedDebtGroup) {
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
    const savingsBuckets =
      this.savingsBucketsByMonth.get(monthKey) ??
      this.savingsBucketsByMonth.get('2026-10') ??
      [];

    const result = closeMonthAndRollover({
      closingMonthKey: monthKey,
      closedAtIso,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
    });

    this.snapshots.set(monthKey, result.snapshot);
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

    return result;
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

  async seedOctober2026IfEmpty(uid: string): Promise<{ seeded: boolean; monthKey: string }> {
    const userDocRef = doc(this.db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists() && userSnap.data()?.seededOctober2026 === true) {
      const existingActive =
        typeof userSnap.data()?.activeMonthKey === 'string'
          ? (userSnap.data()?.activeMonthKey as string)
          : '2026-10';
      return { seeded: false, monthKey: existingActive };
    }

    const payload = buildOctober2026SeedPayload();
    const batch = writeBatch(this.db);
    const updatedAt = new Date().toISOString();

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

    batch.set(
      userDocRef,
      {
        uid,
        seededOctober2026: true,
        activeMonthKey: '2026-10',
        updatedAt,
      },
      { merge: true }
    );

    await batch.commit();
    return { seeded: true, monthKey: '2026-10' };
  }

  async loadMonthWorkspace(uid: string, monthKey: string): Promise<MonthWorkspaceData> {
    await this.seedOctober2026IfEmpty(uid);

    const [
      conceptsSnap,
      entriesSnap,
      debtsSnap,
      paymentsSnap,
      bucketsSnap,
      planSnap,
      snapshotSnap,
    ] = await Promise.all([
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

    const concepts = conceptsSnap.docs
      .map((d) => parseConceptFromFirestore(d.data()))
      .sort((a, b) => a.order - b.order);
    const entries = entriesSnap.docs.map((d) => parseMonthEntryFromFirestore(d.data()));
    const currentDebts = debtsSnap.docs.map((d) => parseDebtFromFirestore(d.data()));
    const debtPayments = paymentsSnap.docs.map((d) => parseDebtPaymentFromFirestore(d.data()));
    const currentBuckets = bucketsSnap.docs.map((d) => parseSavingsBucketFromFirestore(d.data()));
    const provisionPlan = planSnap.exists()
      ? parseIdealMotoPlanFromFirestore(planSnap.data())
      : buildOctober2026SeedPayload().provisionPlan;
    const closedSnapshot = snapshotSnap.exists()
      ? parseMonthSnapshotFromFirestore(snapshotSnap.data())
      : undefined;

    const resolvedBalances = closedSnapshot
      ? reconstructClosedMonthBalances(closedSnapshot, concepts, entries)
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
  async loadFullCloudAccount(uid: string): Promise<FullCloudAccountData> {
    const seedInfo = await this.seedOctober2026IfEmpty(uid);

    const [
      userSnap,
      conceptsSnap,
      entriesSnap,
      debtsSnap,
      paymentsSnap,
      bucketsSnap,
      planSnap,
      snapshotsSnap,
    ] = await Promise.all([
      getDoc(doc(this.db, 'users', uid)),
      getDocs(collection(this.db, 'users', uid, 'concepts')),
      getDocs(collection(this.db, 'users', uid, 'entries')),
      getDocs(collection(this.db, 'users', uid, 'debts')),
      getDocs(collection(this.db, 'users', uid, 'debtPayments')),
      getDocs(collection(this.db, 'users', uid, 'savingsBuckets')),
      getDoc(doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal')),
      getDocs(collection(this.db, 'users', uid, 'monthSnapshots')),
    ]);

    const activeMonthKey =
      userSnap.exists() && typeof userSnap.data()?.activeMonthKey === 'string'
        ? (userSnap.data()?.activeMonthKey as string)
        : seedInfo.monthKey;

    const concepts = conceptsSnap.docs
      .map((d) => parseConceptFromFirestore(d.data()))
      .sort((a, b) => a.order - b.order);
    const entries = entriesSnap.docs.map((d) => parseMonthEntryFromFirestore(d.data()));
    const currentDebts = debtsSnap.docs.map((d) => parseDebtFromFirestore(d.data()));
    const debtPayments = paymentsSnap.docs.map((d) => parseDebtPaymentFromFirestore(d.data()));
    const currentBuckets = bucketsSnap.docs.map((d) => parseSavingsBucketFromFirestore(d.data()));
    const provisionPlan = planSnap.exists()
      ? parseIdealMotoPlanFromFirestore(planSnap.data())
      : buildOctober2026SeedPayload().provisionPlan;

    const closedSnapshots: Record<string, MonthSnapshot> = {};
    for (const snapDoc of snapshotsSnap.docs) {
      const parsed = parseMonthSnapshotFromFirestore(snapDoc.data());
      closedSnapshots[parsed.monthKey] = parsed;
    }

    const monthsSet = new Set<string>(['2026-10', activeMonthKey]);
    for (const e of entries) monthsSet.add(e.monthKey);
    for (const mk of Object.keys(closedSnapshots)) monthsSet.add(mk);
    const availableMonths = Array.from(monthsSet).sort();

    const seed = buildOctober2026SeedPayload();
    const resolvedConcepts = concepts.length > 0 ? concepts : seed.concepts;
    const resolvedEntries = entries.length > 0 ? entries : seed.entries;

    const debtsByMonth: Record<string, Debt[]> = {
      '2026-10': seed.debts,
    };
    const savingsBucketsByMonth: Record<string, SavingsBucket[]> = {
      '2026-10': seed.savingsBuckets,
    };

    for (const mk of availableMonths) {
      const snap = closedSnapshots[mk];
      if (snap) {
        const reconstructed = reconstructClosedMonthBalances(
          snap,
          resolvedConcepts,
          resolvedEntries
        );
        debtsByMonth[mk] = reconstructed.debts;
        savingsBucketsByMonth[mk] = reconstructed.savingsBuckets;
      } else {
        debtsByMonth[mk] = currentDebts.length > 0 ? currentDebts : seed.debts;
        savingsBucketsByMonth[mk] = currentBuckets.length > 0 ? currentBuckets : seed.savingsBuckets;
      }
    }

    return {
      activeMonthKey,
      availableMonths,
      concepts: resolvedConcepts,
      entries: resolvedEntries,
      debtsByMonth,
      debtPayments,
      savingsBucketsByMonth,
      provisionPlan,
      closedSnapshots,
    };
  }

  async toggleEntryCompletion(
    uid: string,
    entryId: string,
    monthKey: string,
    options?: { actualAmount?: number; completedAtDateIso?: string; targetDebtId?: string }
  ): Promise<ToggleEntryCompletionResult> {
    const entryRef = doc(this.db, 'users', uid, 'entries', entryId);
    const entrySnap = await getDoc(entryRef);
    if (!entrySnap.exists()) {
      throw new Error(`Entry ${entryId} not found for user ${uid}`);
    }

    const currentEntry = parseMonthEntryFromFirestore(entrySnap.data());
    if (currentEntry.monthKey !== monthKey) {
      throw new Error(`Entry ${entryId} belongs to ${currentEntry.monthKey}, expected ${monthKey}`);
    }

    const conceptRef = doc(this.db, 'users', uid, 'concepts', currentEntry.conceptId);
    const conceptSnap = await getDoc(conceptRef);
    const concept = conceptSnap.exists()
      ? parseConceptFromFirestore(conceptSnap.data())
      : buildOctober2026SeedPayload().concepts.find((c) => c.id === currentEntry.conceptId) ?? null;

    const conceptsList = concept ? [concept] : buildOctober2026SeedPayload().concepts;

    const nextEntries =
      currentEntry.status === 'completed'
        ? uncompleteMovement([currentEntry], entryId)
        : registerMovement([currentEntry], conceptsList, {
            monthKey,
            conceptId: currentEntry.conceptId,
            actualAmount: options?.actualAmount ?? currentEntry.plannedAmount,
            completedAt: options?.completedAtDateIso ?? toBogotaIsoDate(),
          });

    const updatedEntry = nextEntries[0];
    if (!updatedEntry) {
      throw new Error(`Failed to compute updated entry for ${entryId}`);
    }

    const batch = writeBatch(this.db);
    const updatedAt = new Date().toISOString();

    batch.set(entryRef, {
      ...serializeMonthEntryForFirestore(updatedEntry),
      updatedAt,
    });

    let updatedDebtPayment: DebtPayment | undefined;
    if (concept?.linkedDebtGroup) {
      const targetDebtId = options?.targetDebtId ?? concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
      const paymentId = `${updatedEntry.id}_${targetDebtId}`;
      const paymentRef = doc(this.db, 'users', uid, 'debtPayments', paymentId);

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

      batch.set(paymentRef, {
        ...serializeDebtPaymentForFirestore(updatedDebtPayment),
        updatedAt,
      });
    }

    await batch.commit();

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
    const concepts =
      conceptsSnap.docs.length > 0
        ? conceptsSnap.docs.map((d) => parseConceptFromFirestore(d.data()))
        : buildOctober2026SeedPayload().concepts;

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

    const batch = writeBatch(this.db);
    const updatedAt = new Date().toISOString();
    const entryRef = doc(this.db, 'users', uid, 'entries', created.id);
    batch.set(entryRef, {
      ...serializeMonthEntryForFirestore(created),
      updatedAt,
    });

    const concept = concepts.find((c) => c.id === created.conceptId);
    if (concept?.linkedDebtGroup) {
      const targetDebtId = concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
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

    await batch.commit();
    return created;
  }

  async deleteOrResetEntry(uid: string, entryId: string): Promise<void> {
    const entryRef = doc(this.db, 'users', uid, 'entries', entryId);
    const snap = await getDoc(entryRef);
    if (!snap.exists()) return;

    const entry = parseMonthEntryFromFirestore(snap.data());
    const conceptSnap = await getDoc(doc(this.db, 'users', uid, 'concepts', entry.conceptId));
    const concept = conceptSnap.exists()
      ? parseConceptFromFirestore(conceptSnap.data())
      : buildOctober2026SeedPayload().concepts.find((c) => c.id === entry.conceptId);

    if (concept?.allowMultiplePerMonth) {
      await deleteDoc(entryRef);
    } else {
      const resetEntry = uncompleteMovement([entry], entryId)[0];
      if (resetEntry) {
        const batch = writeBatch(this.db);
        const updatedAt = new Date().toISOString();

        batch.set(entryRef, {
          ...serializeMonthEntryForFirestore(resetEntry),
          updatedAt,
        });

        if (concept?.linkedDebtGroup) {
          const targetDebtId = concept.defaultTargetDebtId ?? 'debt_cb300f_moto';
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

        await batch.commit();
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

    const batch = writeBatch(this.db);
    const updatedAt = new Date().toISOString();

    const snapshotRef = doc(this.db, 'users', uid, 'monthSnapshots', monthKey);
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
        ...serializeSavingsBucketForFirestore(nextBucket),
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

    const userDocRef = doc(this.db, 'users', uid);
    batch.set(
      userDocRef,
      {
        uid,
        activeMonthKey: result.nextMonthKey,
        updatedAt,
      },
      { merge: true }
    );

    await batch.commit();
    return result;
  }
}
