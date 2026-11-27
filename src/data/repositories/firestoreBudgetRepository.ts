/**
 * src/data/repositories/firestoreBudgetRepository.ts
 *
 * Cloud Firestore `BudgetRepository` under `users/{uid}/...`. Spark free-tier guardrails:
 * - Queries `entries` and `debtPayments` scoped by `where('monthKey', '==', monthKey)`
 * - Atomic `writeBatch` for every mutation, stamping `users/{uid}.dataRevision` (ADR 0018)
 * - Idempotent October 2026 seeding (`seedOctober2026IfEmpty`) with deterministic IDs
 * - `loadFullCloudAccount` restores every month on another device (see accountHydration.ts)
 */

import {
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import {
  registerMovement,
  toggleMovementStatus,
  uncompleteMovement,
  type RegisterOrCompleteMovementInput,
} from '../../domain/checklist/checklist';
import { toAppIsoDate, toAppMonthKey } from '../../domain/date/monthKey';
import { closeMonthAndRollover, type CloseMonthResult } from '../../domain/month-close/monthClose';
import type {
  Concept,
  Debt,
  DebtPayment,
  FinancialAccount,
  ProvisionPlan as IdealMotoPlan,
  MonthEntry,
  MonthSnapshot,
} from '../../domain/models/types';
import { getFirebaseDb } from '../firebase/firebaseConfig';
import { updatePersistedAccountRevision } from '../../platform/storage/accountCache';
import { planArchivedHistory, type ArchivedHistoryPlan } from './historyWindow';
import {
  parseConceptFromFirestore,
  parseDebtFromFirestore,
  parseDebtPaymentFromFirestore,
  parseFinancialAccountFromFirestore,
  parseProvisionPlanFromFirestore as parseIdealMotoPlanFromFirestore,
  parseMonthEntryFromFirestore,
  parseMonthSnapshotFromFirestore,
  parseSavingsBucketFromFirestore,
  serializeConceptForFirestore,
  serializeDebtForFirestore,
  serializeDebtPaymentForFirestore,
  serializeFinancialAccountForFirestore,
  serializeProvisionPlanForFirestore as serializeIdealMotoPlanForFirestore,
  serializeMonthEntryForFirestore,
  serializeMonthSnapshotForFirestore,
  serializeSavingsBucketForFirestore,
} from '../mappers/firestoreSchemas';
import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';
import {
  canCheckRevisionFirst,
  chainMonthlyBalances,
  collectSavingsBuckets,
  dropUnusedLegacyDefaultBuckets,
  hasConfiguredAccountData,
  markOwnerAccountSeeded,
  mergeArchivedHistoryEntries,
  parseClosedSnapshots,
  parseSavedActiveMonthKey,
  planUserDocumentSync,
  resolveAccountIdentity,
  resolveAvailableMonths,
  resolveFallbackActiveMonthKey,
  resolveNeedsOnboarding,
  resolveProvisionPlan,
  reuseCachedAccountIfRevisionMatches,
  shouldSeedOwnerAccount,
  withPlannedOpenMonths,
  type ArchivedHistoryProbe,
  type UserDocumentData,
} from './accountHydration';
import {
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  generateDataRevision,
  isOwnerCanonicalEmail,
  reconstructClosedMonthBalances,
  safeParseList,
} from './budgetRepositoryShared';
import type {
  AddMonthEntryContext,
  BudgetRepository,
  FullCloudAccountData,
  InitialAccountSetupPayload,
  LoadCloudAccountOptions,
  MonthWorkspaceData,
  ToggleEntryCompletionResult,
  UserProfileFields,
} from './budgetRepositoryTypes';

/** `users/{uid}` fields, or undefined when the document does not exist. */
function readUserDocumentData(snap: DocumentSnapshot): UserDocumentData {
  return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
}

/** One write of a cascade delete, applied inside `commitUserDataMutationBatch`. */
type CascadeWrite = (batch: ReturnType<typeof writeBatch>, updatedAt: string) => void;

/**
 * Firestore accepts 500 writes per batch and `commitUserDataMutationBatch` adds the
 * `users/{uid}` write, so cascades are split well below that (ADR 0035).
 */
const MAX_CASCADE_WRITES_PER_BATCH = 450;

/**
 * Splits a cascade into batches. The main delete goes last in `writes`, so it lands in the last
 * batch: if a batch fails, the target still exists and replaying the operation finishes the job.
 */
function chunkCascadeWrites(writes: readonly CascadeWrite[]): CascadeWrite[][] {
  const chunks: CascadeWrite[][] = [];
  for (let i = 0; i < writes.length; i += MAX_CASCADE_WRITES_PER_BATCH) {
    chunks.push(writes.slice(i, i + MAX_CASCADE_WRITES_PER_BATCH));
  }
  return chunks;
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

  /**
   * Fire-and-forget `commitUserDataMutationBatch` for the fixes a load writes back: the load does
   * not wait for it, and a failure (offline) is not fatal because memory already has the result.
   */
  private commitUserDataMutationBatchInBackground(
    uid: string,
    extraUserFields?: Record<string, unknown>,
    buildBatch: (batch: ReturnType<typeof writeBatch>, updatedAt: string) => void = () => {}
  ): void {
    void this.commitUserDataMutationBatch(uid, buildBatch, extraUserFields).catch(() => {});
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

    // Only the owner seed account (EXPO_PUBLIC_OWNER_SEED_EMAIL) gets the October 2026 seed.
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
   * when signing in on any device. The steps between the reads are the pure functions of
   * `accountHydration.ts`.
   */
  async loadFullCloudAccount(
    uid: string,
    userEmail?: string | null,
    options?: LoadCloudAccountOptions
  ): Promise<FullCloudAccountData> {
    let preloadedUserSnap: DocumentSnapshot | null = null;
    if (canCheckRevisionFirst(options)) {
      preloadedUserSnap = await getDoc(doc(this.db, 'users', uid));
      // R-13: same revision as the fresh cache, so 1 document read (users/{uid}) instead of all.
      const cachedAccount = reuseCachedAccountIfRevisionMatches(
        readUserDocumentData(preloadedUserSnap),
        options
      );
      if (cachedAccount) return cachedAccount;
    }

    // ADR 0028: with enough closed months in the cache, the old history is not downloaded
    // again; only the recent months, what changed since the last load and a count to verify.
    const historySyncedAt = new Date().toISOString();
    const historyPlan = options?.isRegistration
      ? null
      : planArchivedHistory(options?.cachedAccount);
    const [firstReads, financialAccountsSnap] = await Promise.all([
      this.readCloudAccountDocuments(uid, historyPlan, preloadedUserSnap),
      // The October seed creates no accounts, so this read stays valid after seeding.
      getDocs(collection(this.db, 'users', uid, 'financialAccounts')),
    ]);
    let reads = firstReads;
    let userData = readUserDocumentData(reads.userSnap);
    const identity = resolveAccountIdentity(userData, userEmail);
    let fallbackActiveMonthKey = resolveFallbackActiveMonthKey(userData, identity.isOwner);

    // R-11 & R-12: no pre-flight seedOctober2026IfEmpty round-trip nor a second users/{uid} read.
    if (shouldSeedOwnerAccount(identity, userData)) {
      if (reads.conceptsSnap.docs.length > 0) {
        this.commitUserDataMutationBatchInBackground(uid, {
          seededOctober2026: true,
          onboardingCompleted: true,
          activeMonthKey: fallbackActiveMonthKey,
        });
        userData = markOwnerAccountSeeded(userData, generateDataRevision());
      } else {
        const seedInfo = await this.seedOctober2026IfEmpty(uid, identity.resolvedEmail, userData);
        fallbackActiveMonthKey = seedInfo.monthKey;
        if (seedInfo.seeded) {
          // Everything the seed just wrote, without the history window.
          reads = await this.readCloudAccountDocuments(uid, null, null);
          userData = readUserDocumentData(reads.userSnap);
        }
      }
    }

    const savedActiveMonthKey = parseSavedActiveMonthKey(userData);
    const concepts = safeParseList(reads.conceptsSnap.docs, parseConceptFromFirestore).sort(
      (a, b) => a.order - b.order
    );
    const closedSnapshots = parseClosedSnapshots(reads.snapshotsSnap.docs);
    const storedEntries =
      mergeArchivedHistoryEntries({
        plan: historyPlan,
        probe: reads.archivedHistoryProbe,
        cachedAccount: options?.cachedAccount,
        remoteSnapshots: closedSnapshots,
      }) ??
      // No usable cache (or the cloud changed under it): the whole collection, as before.
      safeParseList(
        (reads.entriesSnap ?? (await getDocs(collection(this.db, 'users', uid, 'entries')))).docs,
        parseMonthEntryFromFirestore
      );
    const currentDebts = safeParseList(reads.debtsSnap.docs, parseDebtFromFirestore);
    const debtPayments = safeParseList(reads.paymentsSnap.docs, parseDebtPaymentFromFirestore);

    const collectedBuckets = collectSavingsBuckets(reads.bucketsSnap.docs, identity);
    const { healedSavingsBucket, staleRefs } = collectedBuckets;
    if (identity.isOwnerSeedAccount && (healedSavingsBucket || staleRefs.length > 0)) {
      // Non-fatal if offline: the healed state is already in memory.
      this.commitUserDataMutationBatchInBackground(uid, undefined, (batch, updatedAt) => {
        for (const staleRef of staleRefs) {
          batch.delete(staleRef);
        }
        if (healedSavingsBucket) {
          batch.set(doc(this.db, 'users', uid, 'savingsBuckets', healedSavingsBucket.id), {
            ...serializeSavingsBucketForFirestore(healedSavingsBucket),
            updatedAt,
          });
        }
      });
    }
    const contents = { concepts, entries: storedEntries, debts: currentDebts };
    const rawBuckets = dropUnusedLegacyDefaultBuckets(collectedBuckets.buckets, identity, contents);

    const needsOnboarding = resolveNeedsOnboarding({
      identity,
      isRegistration: options?.isRegistration,
      hasConfiguredData: hasConfiguredAccountData({ ...contents, buckets: rawBuckets, userData }),
    });
    const { availableMonths, activeMonthKey } = resolveAvailableMonths({
      ...contents,
      identity,
      userData,
      savedActiveMonthKey,
      buckets: rawBuckets,
      closedSnapshots,
      fallbackActiveMonthKey,
    });

    const userDocumentSync = planUserDocumentSync({
      identity,
      isRegistration: options?.isRegistration,
      needsOnboarding,
      userData,
      savedActiveMonthKey,
      activeMonthKey,
    });
    if (userDocumentSync.fieldsToWrite) {
      this.commitUserDataMutationBatchInBackground(uid, userDocumentSync.fieldsToWrite);
    }

    const { entries, entriesByMonth } = withPlannedOpenMonths(
      storedEntries,
      availableMonths,
      closedSnapshots,
      concepts
    );
    const balances = chainMonthlyBalances({
      identity,
      availableMonths,
      closedSnapshots,
      concepts,
      entries,
      entriesByMonth,
      currentDebts,
      rawBuckets,
      debtPayments,
    });

    return {
      activeMonthKey,
      availableMonths,
      concepts,
      entries,
      debtsByMonth: balances.debtsByMonth,
      debtPayments: balances.debtPayments,
      savingsBucketsByMonth: balances.savingsBucketsByMonth,
      provisionPlan: resolveProvisionPlan(
        reads.planSnap.exists() ? reads.planSnap.data() : undefined,
        identity
      ),
      closedSnapshots,
      financialAccounts: safeParseList(
        financialAccountsSnap.docs,
        parseFinancialAccountFromFirestore
      ),
      needsOnboarding,
      dataRevision: userDocumentSync.existingDataRevision ?? generateDataRevision(),
      historySyncedAt,
    };
  }

  /**
   * Every collection `loadFullCloudAccount` needs, in parallel. With a history plan (ADR 0028)
   * the full `entries` read is replaced by `readArchivedHistoryProbe`.
   */
  private async readCloudAccountDocuments(
    uid: string,
    historyPlan: ArchivedHistoryPlan | null,
    preloadedUserSnap: DocumentSnapshot | null
  ) {
    const userCollection = (name: string) => collection(this.db, 'users', uid, name);
    const [
      userSnap,
      conceptsSnap,
      entriesSnap,
      debtsSnap,
      paymentsSnap,
      bucketsSnap,
      planSnap,
      snapshotsSnap,
      archivedHistoryProbe,
    ] = await Promise.all([
      preloadedUserSnap ? Promise.resolve(preloadedUserSnap) : getDoc(doc(this.db, 'users', uid)),
      getDocs(userCollection('concepts')),
      historyPlan ? Promise.resolve(null) : getDocs(userCollection('entries')),
      getDocs(userCollection('debts')),
      getDocs(userCollection('debtPayments')),
      getDocs(userCollection('savingsBuckets')),
      getDoc(doc(this.db, 'users', uid, 'provisionPlans', 'moto_ideal')),
      getDocs(userCollection('monthSnapshots')),
      historyPlan ? this.readArchivedHistoryProbe(uid, historyPlan) : Promise.resolve(null),
    ]);
    return {
      userSnap,
      conceptsSnap,
      entriesSnap,
      debtsSnap,
      paymentsSnap,
      bucketsSnap,
      planSnap,
      snapshotsSnap,
      archivedHistoryProbe,
    };
  }

  /**
   * Reads for a load that reuses the cached old history (ADR 0028): the entries from the
   * cutoff month on, the entries written since the last load, and how many entries the
   * cloud holds before the cutoff. Null if any of them fails; the caller then reads everything.
   */
  private async readArchivedHistoryProbe(
    uid: string,
    plan: ArchivedHistoryPlan
  ): Promise<ArchivedHistoryProbe | null> {
    try {
      const entriesCollection = collection(this.db, 'users', uid, 'entries');
      const [recentSnap, changedSnap, archivedCountSnap] = await Promise.all([
        getDocs(query(entriesCollection, where('monthKey', '>=', plan.cutoffMonthKey))),
        getDocs(query(entriesCollection, where('updatedAt', '>', plan.changedSinceIso))),
        getCountFromServer(query(entriesCollection, where('monthKey', '<', plan.cutoffMonthKey))),
      ]);
      return {
        recentEntries: safeParseList(recentSnap.docs, parseMonthEntryFromFirestore),
        changedEntries: safeParseList(changedSnap.docs, parseMonthEntryFromFirestore),
        archivedCount: archivedCountSnap.data().count,
      };
    } catch {
      return null;
    }
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
    input: RegisterOrCompleteMovementInput,
    context?: AddMonthEntryContext
  ): Promise<MonthEntry> {
    // OPT-04: only what the caller did not hand over is read (two getDocs at most).
    const [existingEntriesForMonth, concepts] = await Promise.all([
      context?.monthEntries
        ? Promise.resolve([...context.monthEntries])
        : getDocs(
            query(
              collection(this.db, 'users', uid, 'entries'),
              where('monthKey', '==', input.monthKey)
            )
          ).then((snap) => snap.docs.map((d) => parseMonthEntryFromFirestore(d.data()))),
      context?.concepts
        ? Promise.resolve([...context.concepts])
        : getDocs(collection(this.db, 'users', uid, 'concepts')).then((snap) =>
            snap.docs.map((d) => parseConceptFromFirestore(d.data()))
          ),
    ]);

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

  /**
   * ADR 0035: deletes the debt, its `debtPayments` and the `defaultTargetDebtId` of the concepts
   * that pointed to it. Closed months keep their history in `monthSnapshots`.
   * Read errors are not swallowed: a transient one keeps the operation in the offline queue.
   */
  async deleteDebt(uid: string, debtId: string): Promise<void> {
    const [conceptsSnap, paymentsSnap] = await Promise.all([
      getDocs(
        query(
          collection(this.db, 'users', uid, 'concepts'),
          where('defaultTargetDebtId', '==', debtId)
        )
      ),
      getDocs(
        query(collection(this.db, 'users', uid, 'debtPayments'), where('debtId', '==', debtId))
      ),
    ]);

    const writes: CascadeWrite[] = [
      ...paymentsSnap.docs.map((snap): CascadeWrite => (batch) => batch.delete(snap.ref)),
      ...conceptsSnap.docs.map(
        (snap): CascadeWrite =>
          (batch, updatedAt) =>
            batch.update(snap.ref, { defaultTargetDebtId: deleteField(), updatedAt })
      ),
      (batch) => batch.delete(doc(this.db, 'users', uid, 'debts', debtId)),
    ];

    for (const chunk of chunkCascadeWrites(writes)) {
      await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
        for (const write of chunk) write(batch, updatedAt);
      });
    }
  }

  /**
   * ADR 0034: full overwrite (no merge), so clearing an optional field (cupo, día de corte)
   * removes it from the document too.
   */
  async saveFinancialAccount(uid: string, account: FinancialAccount): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
      const accountRef = doc(this.db, 'users', uid, 'financialAccounts', account.id);
      batch.set(accountRef, {
        ...serializeFinancialAccountForFirestore(account),
        updatedAt,
      });
    });
  }

  /** Linked entries keep their `accountId`; the domain ignores ids without an account. */
  async deleteFinancialAccount(uid: string, accountId: string): Promise<void> {
    await this.commitUserDataMutationBatch(uid, (batch) => {
      batch.delete(doc(this.db, 'users', uid, 'financialAccounts', accountId));
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

  /**
   * ADR 0035: deletes the bucket and the `savingsContribution` of the concepts that fed it,
   * in the same batch while it fits.
   */
  async deleteSavingsBucket(uid: string, bucketId: string): Promise<void> {
    const conceptsSnap = await getDocs(
      query(
        collection(this.db, 'users', uid, 'concepts'),
        where('savingsContribution.bucketId', '==', bucketId)
      )
    );

    const writes: CascadeWrite[] = [
      ...conceptsSnap.docs.map(
        (snap): CascadeWrite =>
          (batch, updatedAt) =>
            batch.update(snap.ref, { savingsContribution: deleteField(), updatedAt })
      ),
      (batch) => batch.delete(doc(this.db, 'users', uid, 'savingsBuckets', bucketId)),
    ];

    for (const chunk of chunkCascadeWrites(writes)) {
      await this.commitUserDataMutationBatch(uid, (batch, updatedAt) => {
        for (const write of chunk) write(batch, updatedAt);
      });
    }
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

        const buckets = ensureStandardSavingsBuckets(payload.savingsBuckets);
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

  /** Guarda el perfil del usuario en `users/{uid}`, por la misma vía que el resto (ADR 0018, ADR 0033). */
  async saveUserProfile(uid: string, profile: UserProfileFields): Promise<void> {
    await this.commitUserDataMutationBatch(
      uid,
      () => {},
      {
        displayName: profile.displayName,
        financialGoal: profile.financialGoal,
        ...(profile.photoUrl !== undefined ? { photoUrl: profile.photoUrl } : {}),
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
      'financialAccounts',
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
