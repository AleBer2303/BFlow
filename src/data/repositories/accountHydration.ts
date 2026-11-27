/**
 * src/data/repositories/accountHydration.ts
 *
 * Pure steps of `FirestoreBudgetRepository.loadFullCloudAccount`: what the repository read from
 * `users/{uid}/...` goes in, the account the store hydrates comes out. Firestore calls stay in the
 * repository. Old stored names are translated by the mappers (`legacyFieldMigration.ts`); the
 * documents that still hold them are reported here so the repository writes them again.
 *
 * In load order:
 * 1. `dataRevision` negotiation (R-13): reuse the cache when the cloud did not change.
 * 2. Whether the user reset the account (`resolveAccountIdentity`).
 * 3. History window (ADR 0028): `mergeArchivedHistoryEntries`.
 * 4. Savings buckets, provision plan and `needsOnboarding`.
 * 5. Available months and the active one.
 * 6. What `users/{uid}` needs written back (`planUserDocumentSync`).
 * 7. Planned entries of open months and the month-by-month balance chain.
 */

import { calculateMonthlyBudgetSummary } from '../../domain/budget/budgetCalculator';
import { ensureMonthPlan } from '../../domain/checklist/checklist';
import { addMonthsToMonthKey, toAppMonthKey } from '../../domain/date/monthKey';
import {
  buildDebtPaymentsForInstallment,
  calculateDebtsSummary,
} from '../../domain/debts/debtCalculator';
import type {
  Concept,
  Debt,
  DebtPayment,
  ProvisionPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';
import { calculateMonthlySavingsSummary } from '../../domain/savings/savingsCalculator';
import { isCacheFreshWithin24Hours } from '../../platform/storage/accountCache';
import {
  parseMonthSnapshotFromFirestore,
  parseProvisionPlanFromFirestore,
  parseSavingsBucketFromFirestore,
} from '../mappers/firestoreSchemas';
import {
  LEGACY_USER_FIELDS,
  RESERVE_BUCKET_ID,
  isLegacyBucketDocId,
} from '../migrations/legacyFieldMigration';
import {
  DEFAULT_DEBT_GROUP_KEY,
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  reconstructClosedMonthBalances,
} from './budgetRepositoryShared';
import type { FullCloudAccountData, LoadCloudAccountOptions } from './budgetRepositoryTypes';
import { resolveArchivedEntries, type ArchivedHistoryPlan } from './historyWindow';

/** Fields of `users/{uid}`, or undefined when the document does not exist. */
export type UserDocumentData = Record<string, unknown> | undefined;

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A user without data starts in January of the current year. */
function newUserStartMonthKey(): string {
  return `${toAppMonthKey().slice(0, 4)}-01`;
}

// ---------------------------------------------------------------------------
// 1. dataRevision negotiation (R-13)
// ---------------------------------------------------------------------------

/**
 * True when a fresh cache (< 24 h) with a revision can be checked against `users/{uid}` before
 * reading anything else. Registration and a manual full sync always read everything.
 */
export function canCheckRevisionFirst(options?: LoadCloudAccountOptions): boolean {
  return (
    !options?.forceFullSync &&
    !options?.isRegistration &&
    Boolean(options?.cachedAccount) &&
    typeof options?.cachedDataRevision === 'string' &&
    options.cachedDataRevision.length > 0 &&
    isCacheFreshWithin24Hours(options?.cachedSavedAt)
  );
}

/** The cached account when the cloud revision equals the cached one; null when it changed. */
export function reuseCachedAccountIfRevisionMatches(
  userData: UserDocumentData,
  options?: LoadCloudAccountOptions
): FullCloudAccountData | null {
  const cachedAccount = options?.cachedAccount;
  const remoteRevision =
    typeof userData?.dataRevision === 'string' ? userData.dataRevision : undefined;
  if (!cachedAccount || !remoteRevision || remoteRevision !== options?.cachedDataRevision) {
    return null;
  }
  return { ...cachedAccount, dataRevision: remoteRevision };
}

// ---------------------------------------------------------------------------
// 2. Who the account belongs to
// ---------------------------------------------------------------------------

export interface AccountIdentity {
  /** The user reset the account from Cuenta; it starts from the wizard again. */
  isResetByUser: boolean;
}

export function resolveAccountIdentity(userData: UserDocumentData): AccountIdentity {
  return { isResetByUser: userData?.accountResetByUser === true };
}

/** Active month when nothing better is known: the stored one, else the new-user month. */
export function resolveFallbackActiveMonthKey(userData: UserDocumentData): string {
  return typeof userData?.activeMonthKey === 'string'
    ? userData.activeMonthKey
    : newUserStartMonthKey();
}

/** The stored active month, only when it is a valid `YYYY-MM`. */
export function parseSavedActiveMonthKey(userData: UserDocumentData): string | undefined {
  const value = userData?.activeMonthKey;
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// 3. Closed months and the history window (ADR 0028)
// ---------------------------------------------------------------------------

interface DocumentDataLike {
  data: () => unknown;
}

/** Closed months by `monthKey`; malformed documents are skipped. */
export function parseClosedSnapshots(
  docs: readonly DocumentDataLike[]
): Record<string, MonthSnapshot> {
  const closedSnapshots: Record<string, MonthSnapshot> = {};
  for (const snapDoc of docs) {
    try {
      const parsed = parseMonthSnapshotFromFirestore(snapDoc.data());
      closedSnapshots[parsed.monthKey] = parsed;
    } catch {
      // Ignore malformed snapshot doc
    }
  }
  return closedSnapshots;
}

/** What `readArchivedHistoryProbe` brings back for a load that reuses the cached history. */
export interface ArchivedHistoryProbe {
  /** Entries from the cutoff month on. */
  recentEntries: MonthEntry[];
  /** Entries written since the last load. */
  changedEntries: MonthEntry[];
  /** How many entries the cloud holds before the cutoff. */
  archivedCount: number;
}

/**
 * Cached old history plus the recent months, or null when the whole collection has to be read:
 * no plan, the probe failed, or the cloud changed under the cache.
 */
export function mergeArchivedHistoryEntries(input: {
  plan: ArchivedHistoryPlan | null;
  probe: ArchivedHistoryProbe | null;
  cachedAccount?: FullCloudAccountData | null;
  remoteSnapshots: Readonly<Record<string, MonthSnapshot>>;
}): MonthEntry[] | null {
  const { plan, probe, cachedAccount, remoteSnapshots } = input;
  if (!plan || !probe || !cachedAccount) return null;
  const archivedEntries = resolveArchivedEntries({
    plan,
    cachedEntries: cachedAccount.entries,
    cachedSnapshots: cachedAccount.closedSnapshots,
    remoteSnapshots,
    changedEntries: probe.changedEntries,
    remoteArchivedCount: probe.archivedCount,
  });
  return archivedEntries ? [...archivedEntries, ...probe.recentEntries] : null;
}

// ---------------------------------------------------------------------------
// 4. Savings buckets, provision plan and needsOnboarding
// ---------------------------------------------------------------------------

export interface SavingsBucketDocumentLike<TRef> extends DocumentDataLike {
  id: string;
  ref: TRef;
}

export interface CollectedSavingsBuckets<TRef> {
  buckets: SavingsBucket[];
  /** Buckets read from an old document id (ADR 0037): write them under their id. */
  migratedBuckets: SavingsBucket[];
  /** Old documents to delete: the migrated ones and those whose current twin already exists. */
  legacyRefs: TRef[];
}

/**
 * One bucket per `bucket.id`. Documents whose id is not their bucket's are skipped, except the
 * old ids of `legacyFieldMigration.ts`: those buckets are kept (unless the current document
 * exists too) and reported to be written again.
 */
export function collectSavingsBuckets<TRef>(
  docs: ReadonlyArray<SavingsBucketDocumentLike<TRef>>
): CollectedSavingsBuckets<TRef> {
  const bucketMap = new Map<string, SavingsBucket>();
  const legacyDocs: Array<{ bucket: SavingsBucket; ref: TRef }> = [];

  for (const bucketDoc of docs) {
    let parsed: SavingsBucket;
    try {
      parsed = parseSavingsBucketFromFirestore(bucketDoc.data());
    } catch {
      continue;
    }
    if (bucketDoc.id === parsed.id) {
      bucketMap.set(parsed.id, parsed);
    } else if (isLegacyBucketDocId(bucketDoc.id, parsed.id)) {
      legacyDocs.push({ bucket: parsed, ref: bucketDoc.ref });
    }
  }

  const migratedBuckets: SavingsBucket[] = [];
  for (const { bucket } of legacyDocs) {
    if (bucketMap.has(bucket.id)) continue;
    bucketMap.set(bucket.id, bucket);
    migratedBuckets.push(bucket);
  }

  return {
    buckets: Array.from(bucketMap.values()),
    migratedBuckets,
    legacyRefs: legacyDocs.map(({ ref }) => ref),
  };
}

interface AccountContents {
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  debts: readonly Debt[];
}

/**
 * An empty account that only holds the 0-balance `reserve` and `savings` buckets of the old
 * initialization shows no buckets: new users only see the funds they create.
 */
export function dropUnusedLegacyDefaultBuckets(
  buckets: SavingsBucket[],
  contents: AccountContents
): SavingsBucket[] {
  const isEmptyAccount =
    contents.concepts.length === 0 && contents.entries.length === 0 && contents.debts.length === 0;
  const onlyEmptyDefaults = buckets.every(
    (b) => (b.id === RESERVE_BUCKET_ID || b.id === 'savings') && b.openingBalance === 0
  );
  return isEmptyAccount && onlyEmptyDefaults ? [] : buckets;
}

/** The stored plan; without one, or if it is malformed, an empty plan. */
export function resolveProvisionPlan(planData: unknown): ProvisionPlan {
  if (planData === undefined) return EMPTY_PROVISION_PLAN;
  try {
    return parseProvisionPlanFromFirestore(planData);
  } catch {
    return EMPTY_PROVISION_PLAN;
  }
}

export function hasConfiguredAccountData(
  contents: AccountContents & { buckets: readonly SavingsBucket[]; userData: UserDocumentData }
): boolean {
  return (
    contents.concepts.length > 0 ||
    contents.entries.length > 0 ||
    contents.debts.length > 0 ||
    contents.buckets.length > 0 ||
    contents.userData?.onboardingCompleted === true
  );
}

export function resolveNeedsOnboarding(input: {
  identity: AccountIdentity;
  isRegistration?: boolean;
  hasConfiguredData: boolean;
}): boolean {
  const { identity, isRegistration, hasConfiguredData } = input;
  if (identity.isResetByUser) return true;
  if (isRegistration === true) return true;
  // Signing in to an existing account never shows the wizard again, even if registration left
  // everything blank.
  if (isRegistration === false) return false;
  return !hasConfiguredData;
}

// ---------------------------------------------------------------------------
// 5. Available months
// ---------------------------------------------------------------------------

export interface AvailableMonthsInput extends AccountContents {
  savedActiveMonthKey: string | undefined;
  buckets: readonly SavingsBucket[];
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  /** Used only if the list came out empty (it never does: there is always a start month). */
  fallbackActiveMonthKey: string;
}

/**
 * Every month with data, the month after each closed one and the saved active month. The account
 * always opens on the latest of them, even with no movements there.
 */
export function resolveAvailableMonths(input: AvailableMonthsInput): {
  availableMonths: string[];
  activeMonthKey: string;
} {
  const { savedActiveMonthKey, entries, debts, buckets, closedSnapshots } = input;

  const months = new Set<string>();
  for (const e of entries) months.add(e.monthKey);
  for (const d of debts) months.add(d.monthKey);
  for (const mk of Object.keys(closedSnapshots)) {
    months.add(mk);
    months.add(addMonthsToMonthKey(mk, 1));
  }
  for (const b of buckets) {
    if (b.monthKey) months.add(b.monthKey);
  }
  if (savedActiveMonthKey) months.add(savedActiveMonthKey);
  if (months.size === 0) months.add(newUserStartMonthKey());

  const availableMonths = Array.from(months).sort();
  return {
    availableMonths,
    activeMonthKey: availableMonths[availableMonths.length - 1] ?? input.fallbackActiveMonthKey,
  };
}

// ---------------------------------------------------------------------------
// 6. users/{uid} write-back
// ---------------------------------------------------------------------------

export interface UserDocumentSyncPlan {
  /** The revision `users/{uid}` already has, if any. */
  existingDataRevision: string | undefined;
  /** Fields to write to `users/{uid}`, or null when it is up to date. */
  fieldsToWrite: Record<string, unknown> | null;
  /** Old fields still in `users/{uid}` (ADR 0037), to delete in the same write. */
  legacyFieldsToRemove: string[];
}

/**
 * Keeps `users/{uid}` in step with what was loaded: the active month, `onboardingCompleted` once
 * the wizard was served or an existing user signs in (so it never prompts again), a revision
 * when there is none, and the removal of the fields no build reads any more.
 */
export function planUserDocumentSync(input: {
  identity: AccountIdentity;
  isRegistration?: boolean;
  needsOnboarding: boolean;
  userData: UserDocumentData;
  savedActiveMonthKey: string | undefined;
  activeMonthKey: string;
}): UserDocumentSyncPlan {
  const { identity, isRegistration, needsOnboarding, userData } = input;
  const shouldMarkOnboardingDone =
    !identity.isResetByUser &&
    (isRegistration === true || isRegistration === false || needsOnboarding) &&
    userData?.onboardingCompleted !== true;
  const existingDataRevision =
    typeof userData?.dataRevision === 'string' && userData.dataRevision.length > 0
      ? userData.dataRevision
      : undefined;
  const legacyFieldsToRemove = LEGACY_USER_FIELDS.filter((field) => userData?.[field] !== undefined);
  const needsWrite =
    input.savedActiveMonthKey !== input.activeMonthKey ||
    shouldMarkOnboardingDone ||
    !existingDataRevision ||
    legacyFieldsToRemove.length > 0;

  return {
    existingDataRevision,
    fieldsToWrite: needsWrite
      ? {
          activeMonthKey: input.activeMonthKey,
          ...(shouldMarkOnboardingDone
            ? { onboardingCompleted: true, accountResetByUser: false }
            : {}),
        }
      : null,
    legacyFieldsToRemove,
  };
}

// ---------------------------------------------------------------------------
// 7. Open months and the balance chain
// ---------------------------------------------------------------------------

/** Groups items by `monthKey`, keeping their order (OPT-04). */
function groupByMonthKey<T extends { monthKey: string }>(items: readonly T[]): Map<string, T[]> {
  const byMonth = new Map<string, T[]>();
  for (const item of items) {
    const list = byMonth.get(item.monthKey);
    if (list) {
      list.push(item);
    } else {
      byMonth.set(item.monthKey, [item]);
    }
  }
  return byMonth;
}

/**
 * The entries plus the recurring plan of every open month that has none yet, and the same list
 * grouped by month (OPT-04: computed once instead of filtering in every month of the chain).
 */
export function withPlannedOpenMonths(
  entries: readonly MonthEntry[],
  availableMonths: readonly string[],
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>,
  concepts: readonly Concept[]
): { entries: MonthEntry[]; entriesByMonth: Map<string, MonthEntry[]> } {
  const allEntries = [...entries];
  const entriesByMonth = groupByMonthKey(allEntries);
  for (const mk of availableMonths) {
    if (closedSnapshots[mk] || concepts.length === 0 || entriesByMonth.has(mk)) continue;
    const plannedEntries = ensureMonthPlan(mk, concepts, []);
    allEntries.push(...plannedEntries);
    if (plannedEntries.length > 0) {
      entriesByMonth.set(mk, [...plannedEntries]);
    }
  }
  return { entries: allEntries, entriesByMonth };
}

/** Debt payments by month, plus the ones synthesized while chaining. */
interface DebtPaymentLedger {
  has(entryId: string, monthKey: string): boolean;
  add(payment: DebtPayment): void;
  forMonth(monthKey: string): readonly DebtPayment[];
  all(): DebtPayment[];
}

function createDebtPaymentLedger(payments: readonly DebtPayment[]): DebtPaymentLedger {
  const list = [...payments];
  const byMonth = groupByMonthKey(list);
  const key = (entryId: string, monthKey: string) => `${monthKey}|${entryId}`;
  const paidEntryKeys = new Set(list.map((dp) => key(dp.entryId, dp.monthKey)));
  return {
    has: (entryId, monthKey) => paidEntryKeys.has(key(entryId, monthKey)),
    add: (payment) => {
      list.push(payment);
      const monthPayments = byMonth.get(payment.monthKey);
      if (monthPayments) {
        monthPayments.push(payment);
      } else {
        byMonth.set(payment.monthKey, [payment]);
      }
      paidEntryKeys.add(key(payment.entryId, payment.monthKey));
    },
    forMonth: (monthKey) => byMonth.get(monthKey) ?? [],
    all: () => list,
  };
}

/** Every completed entry of a debt-linked concept gets an active payment (in memory only). */
function synthesizeMissingDebtPayments(
  monthEntries: readonly MonthEntry[],
  monthKey: string,
  monthDebts: readonly Debt[],
  conceptById: ReadonlyMap<string, Concept>,
  ledger: DebtPaymentLedger
): void {
  if (monthDebts.length === 0) return;
  for (const entry of monthEntries) {
    if (entry.status !== 'completed') continue;
    const concept = conceptById.get(entry.conceptId);
    if (!concept?.linkedDebtGroup && !concept?.defaultTargetDebtId) continue;
    if (ledger.has(entry.id, monthKey)) continue;
    const synthesized = buildDebtPaymentsForInstallment(
      entry,
      monthDebts,
      undefined,
      concept.defaultTargetDebtId
    );
    for (const payment of synthesized) {
      ledger.add(payment);
    }
  }
}

export interface MonthlyBalanceChainInput {
  availableMonths: readonly string[];
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  concepts: readonly Concept[];
  /** Every entry, planned open months included. */
  entries: readonly MonthEntry[];
  entriesByMonth: ReadonlyMap<string, readonly MonthEntry[]>;
  /** The `debts` documents (each one holds its latest month). */
  currentDebts: readonly Debt[];
  /** The `savingsBuckets` documents, after `dropUnusedLegacyDefaultBuckets`. */
  rawBuckets: readonly SavingsBucket[];
  debtPayments: readonly DebtPayment[];
}

export interface MonthlyBalanceChain {
  debtsByMonth: Record<string, Debt[]>;
  savingsBucketsByMonth: Record<string, SavingsBucket[]>;
  /** Stored payments plus the synthesized ones. */
  debtPayments: DebtPayment[];
}

/** The first month opens from its snapshot when closed, or from the stored documents. */
function buildFirstMonthBalances(
  monthKey: string,
  input: MonthlyBalanceChainInput,
  baseBuckets: readonly SavingsBucket[]
): { debts: Debt[]; savingsBuckets: SavingsBucket[] } {
  const snapshot = input.closedSnapshots[monthKey];
  if (snapshot) {
    const reconstructed = reconstructClosedMonthBalances(
      snapshot,
      input.concepts,
      input.entries,
      input.currentDebts,
      baseBuckets
    );
    return {
      debts: reconstructed.debts,
      savingsBuckets: ensureStandardSavingsBuckets(reconstructed.savingsBuckets),
    };
  }
  return {
    debts: input.currentDebts.map((d) => ({ ...d, monthKey })),
    savingsBuckets: baseBuckets.map((b) => ({ ...b })),
  };
}

/**
 * Each debt opens `monthKey` with what remained at the end of `prevMonthKey`, keeping the rate and
 * installment of the stored document. A direct edit of the debt in `monthKey` wins. Debts created
 * in `monthKey` or later join here.
 */
function rollDebtsIntoMonth(input: {
  monthKey: string;
  prevMonthKey: string;
  prevDebts: readonly Debt[];
  currentDebts: readonly Debt[];
  entries: readonly MonthEntry[];
  prevPayments: readonly DebtPayment[];
}): Debt[] {
  const { monthKey, prevDebts, currentDebts } = input;
  const prevDebtSummary = calculateDebtsSummary(
    prevDebts,
    input.entries,
    input.prevMonthKey,
    [...input.prevPayments]
  );
  const currentDebtById = new Map<string, Debt>(currentDebts.map((d) => [d.id, d]));

  const rolledDebts: Debt[] = prevDebtSummary.debts.map((item) => {
    const meta = currentDebtById.get(item.debtId);
    const prevDebt = prevDebts.find((d) => d.id === item.debtId);
    const rolledOpening = Math.max(0, item.remainingBalance);
    const honorsDirectEdit = meta?.monthKey === monthKey;

    const monthlyRate =
      meta?.monthlyInterestRate ?? prevDebt?.monthlyInterestRate ?? item.monthlyInterestRate;
    const annualRate =
      meta?.annualInterestRate ?? prevDebt?.annualInterestRate ?? item.annualInterestRate;
    const rateType = meta?.interestRateType ?? prevDebt?.interestRateType ?? item.interestRateType;
    const installment =
      meta?.monthlyInstallment ?? prevDebt?.monthlyInstallment ?? item.monthlyInstallment;

    return {
      id: item.debtId,
      groupKey: meta?.groupKey ?? prevDebt?.groupKey ?? DEFAULT_DEBT_GROUP_KEY,
      name: meta?.name ?? item.name,
      lender: meta?.lender ?? prevDebt?.lender ?? item.lender,
      openingBalance: honorsDirectEdit && meta ? meta.openingBalance : rolledOpening,
      monthKey,
      ...(monthlyRate !== undefined ? { monthlyInterestRate: monthlyRate } : {}),
      ...(annualRate !== undefined ? { annualInterestRate: annualRate } : {}),
      ...(rateType ? { interestRateType: rateType } : {}),
      ...(installment !== undefined ? { monthlyInstallment: installment } : {}),
    };
  });

  for (const d of currentDebts) {
    if (!rolledDebts.some((rd) => rd.id === d.id) && d.monthKey >= monthKey) {
      rolledDebts.push({ ...d, monthKey });
    }
  }
  return rolledDebts;
}

/**
 * Savings buckets of `monthKey`: from its snapshot when closed; otherwise each bucket opens with
 * the closing balance of `prevMonthKey`, unless its document was edited directly in `monthKey`.
 */
function rollSavingsIntoMonth(input: {
  monthKey: string;
  prevMonthKey: string;
  chain: MonthlyBalanceChainInput;
  prevBuckets: readonly SavingsBucket[];
  baseBuckets: readonly SavingsBucket[];
  rolledDebts: readonly Debt[];
}): SavingsBucket[] {
  const { monthKey, prevMonthKey, chain } = input;
  const snapshot = chain.closedSnapshots[monthKey];
  if (snapshot) {
    const reconstructed = reconstructClosedMonthBalances(
      snapshot,
      chain.concepts,
      chain.entries,
      input.rolledDebts,
      input.baseBuckets
    );
    return ensureStandardSavingsBuckets(reconstructed.savingsBuckets);
  }

  const prevBuckets = ensureStandardSavingsBuckets(input.prevBuckets);
  const prevBudget = calculateMonthlyBudgetSummary(chain.entries, prevMonthKey);
  const prevSavings = calculateMonthlySavingsSummary(
    prevBuckets,
    chain.concepts,
    chain.entries,
    prevBudget,
    prevMonthKey
  );
  const customClosingById = new Map<string, number>(
    prevSavings.customBuckets.map((cb) => [cb.id, cb.currentBalance])
  );

  return prevBuckets.map((b) => {
    const directBucket = chain.rawBuckets.find((rb) => rb.id === b.id);
    if (directBucket?.monthKey === monthKey) {
      return { ...directBucket };
    }
    const closingBalance =
      b.id === RESERVE_BUCKET_ID
        ? prevSavings.reserve.currentBalance
        : b.id === 'savings'
          ? prevSavings.savings.currentBalance
          : (customClosingById.get(b.id) ?? b.openingBalance);
    return { ...b, openingBalance: Math.max(0, closingBalance), monthKey };
  });
}

/**
 * Debts and savings of every available month, chained in order: each month opens with what the
 * previous one closed. Also synthesizes the missing payments of completed debt installments.
 */
export function chainMonthlyBalances(input: MonthlyBalanceChainInput): MonthlyBalanceChain {
  const baseBuckets = ensureStandardSavingsBuckets(input.rawBuckets);
  const ledger = createDebtPaymentLedger(input.debtPayments);
  const conceptById = new Map<string, Concept>(input.concepts.map((c) => [c.id, c]));
  const debtsByMonth: Record<string, Debt[]> = {};
  const savingsBucketsByMonth: Record<string, SavingsBucket[]> = {};

  input.availableMonths.forEach((monthKey, idx) => {
    const prevMonthKey = idx > 0 ? input.availableMonths[idx - 1] : undefined;
    if (prevMonthKey === undefined) {
      const first = buildFirstMonthBalances(monthKey, input, baseBuckets);
      debtsByMonth[monthKey] = first.debts;
      savingsBucketsByMonth[monthKey] = first.savingsBuckets;
    } else {
      // The previous month's missing payments were synthesized at the end of its own step.
      const rolledDebts = rollDebtsIntoMonth({
        monthKey,
        prevMonthKey,
        prevDebts: debtsByMonth[prevMonthKey] ?? input.currentDebts,
        currentDebts: input.currentDebts,
        entries: input.entries,
        prevPayments: ledger.forMonth(prevMonthKey),
      });
      debtsByMonth[monthKey] = rolledDebts;
      savingsBucketsByMonth[monthKey] = rollSavingsIntoMonth({
        monthKey,
        prevMonthKey,
        chain: input,
        prevBuckets: savingsBucketsByMonth[prevMonthKey] ?? baseBuckets,
        baseBuckets,
        rolledDebts,
      });
    }

    synthesizeMissingDebtPayments(
      input.entriesByMonth.get(monthKey) ?? [],
      monthKey,
      debtsByMonth[monthKey] ?? [],
      conceptById,
      ledger
    );
  });

  return { debtsByMonth, savingsBucketsByMonth, debtPayments: ledger.all() };
}
