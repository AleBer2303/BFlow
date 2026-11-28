/**
 * src/platform/storage/accountCache.ts
 *
 * Local offline snapshot cache for BFlow user accounts (ADR 0015 & Fase 2):
 * - Enables instantaneous cold-boot rehydration and seamless offline operation
 *   before Cloud Firestore queries resolve or when the device is disconnected.
 * - Stores data inside an encrypted versioned envelope (`{ schemaVersion, uid, savedAt, data }`)
 *   so legacy v1 entries, mismatched schema versions, or cross-account payloads are
 *   rejected and purged immediately.
 * - Debounced persistence queue with immediate flush on app backgrounding (R-06).
 * - Deep equality check to skip redundant state replacement when cloud matches cache (R-18).
 */

import type { FullCloudAccountData } from '../../data/repositories/budgetRepository';
import { getStorageGeneration, persistentStorage } from './persistentStorageAdapter';

/**
 * 3: names of ADR 0037 (`reserve` bucket, `reserveClosingBalance`, `provisionCategoryKey`). A cache
 * of an older version is dropped and the account is downloaded again through the mappers.
 */
export const ACCOUNT_CACHE_SCHEMA_VERSION = 3;
export const ACCOUNT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const LEGACY_ACCOUNT_CACHE_PREFIX_V1 = 'bflow.account.cache.v1.';
const ACCOUNT_CACHE_PREFIX = 'bflow.account.cache.v2.';

export interface PersistedAccountEnvelope {
  schemaVersion: number;
  uid: string;
  savedAt: string;
  dataRevision?: string;
  data: FullCloudAccountData;
}

export function getAccountCacheKey(uid: string): string {
  return `${ACCOUNT_CACHE_PREFIX}${uid}`;
}

export function getLegacyAccountCacheKeyV1(uid: string): string {
  return `${LEGACY_ACCOUNT_CACHE_PREFIX_V1}${uid}`;
}

function isValidFullCloudAccountData(value: unknown): value is FullCloudAccountData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.activeMonthKey === 'string' &&
    candidate.activeMonthKey.length > 0 &&
    Array.isArray(candidate.availableMonths) &&
    Array.isArray(candidate.concepts) &&
    Array.isArray(candidate.entries) &&
    typeof candidate.debtsByMonth === 'object' &&
    candidate.debtsByMonth !== null &&
    Array.isArray(candidate.debtPayments) &&
    typeof candidate.savingsBucketsByMonth === 'object' &&
    candidate.savingsBucketsByMonth !== null &&
    typeof candidate.provisionPlan === 'object' &&
    candidate.provisionPlan !== null &&
    typeof candidate.closedSnapshots === 'object' &&
    candidate.closedSnapshots !== null
  );
}

function hasSameKeyCount(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return Object.keys(a).length === Object.keys(b).length;
}

/**
 * Checks if two FullCloudAccountData payloads have equivalent domain data,
 * ignoring timestamps or volatile UI states.
 */
export function isEquivalentCloudAccount(
  a: FullCloudAccountData | null | undefined,
  b: FullCloudAccountData | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  try {
    // O(1) checks first: most syncs end here without serializing anything.
    if (a.activeMonthKey !== b.activeMonthKey) return false;
    if (Boolean(a.needsOnboarding) !== Boolean(b.needsOnboarding)) return false;
    if (a.availableMonths.length !== b.availableMonths.length) return false;
    if (a.concepts.length !== b.concepts.length) return false;
    if (a.entries.length !== b.entries.length) return false;
    if (a.debtPayments.length !== b.debtPayments.length) return false;
    if (!hasSameKeyCount(a.debtsByMonth, b.debtsByMonth)) return false;
    if (!hasSameKeyCount(a.savingsBucketsByMonth, b.savingsBucketsByMonth)) return false;
    if (!hasSameKeyCount(a.closedSnapshots, b.closedSnapshots)) return false;
    if ((a.financialAccounts?.length ?? 0) !== (b.financialAccounts?.length ?? 0)) return false;

    // Every cloud write stamps a new `dataRevision` (ADR 0018), so two payloads of the same
    // shape that carry the same revision hold the same cloud data.
    if (a.dataRevision && a.dataRevision === b.dataRevision) return true;

    return (
      JSON.stringify(a.availableMonths) === JSON.stringify(b.availableMonths) &&
      JSON.stringify(a.concepts) === JSON.stringify(b.concepts) &&
      JSON.stringify(a.entries) === JSON.stringify(b.entries) &&
      JSON.stringify(a.debtsByMonth) === JSON.stringify(b.debtsByMonth) &&
      JSON.stringify(a.debtPayments) === JSON.stringify(b.debtPayments) &&
      JSON.stringify(a.savingsBucketsByMonth) === JSON.stringify(b.savingsBucketsByMonth) &&
      JSON.stringify(a.provisionPlan) === JSON.stringify(b.provisionPlan) &&
      JSON.stringify(a.closedSnapshots) === JSON.stringify(b.closedSnapshots) &&
      JSON.stringify(a.financialAccounts ?? []) === JSON.stringify(b.financialAccounts ?? [])
    );
  } catch {
    return false;
  }
}

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveEntry: { uid: string; data: FullCloudAccountData; dataRevision?: string } | null = null;

/**
 * Last envelope written or read for each user (OPT-02): its metadata (`dataRevision`,
 * `historySyncedAt`, `savedAt`) and a reference to its data, which is store state and never
 * mutated. `savePersistedAccount` and `updatePersistedAccountRevision` use it instead of
 * reading the cache again, which decrypts on a cold read and always parses the whole account.
 * It is keyed by uid (one user's metadata never reaches another) and is dropped when the cache
 * is cleared, found invalid, or the storage underneath changes (`getStorageGeneration`).
 */
const knownEnvelopes = new Map<string, { generation: number; envelope: PersistedAccountEnvelope }>();

function rememberEnvelope(envelope: PersistedAccountEnvelope): void {
  knownEnvelopes.set(envelope.uid, { generation: getStorageGeneration(), envelope });
}

/** The known envelope, or undefined when it has to be read from storage. */
function getKnownEnvelope(uid: string): PersistedAccountEnvelope | undefined {
  const known = knownEnvelopes.get(uid);
  if (!known) return undefined;
  if (known.generation !== getStorageGeneration()) {
    knownEnvelopes.delete(uid);
    return undefined;
  }
  return known.envelope;
}

function readValidatedEnvelope(uid: string): PersistedAccountEnvelope | null {
  if (!uid) return null;
  knownEnvelopes.delete(uid);
  try {
    const raw = persistentStorage.getItem<unknown>(getAccountCacheKey(uid));
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedAccountEnvelope>;
    const hasValidRevision =
      candidate.dataRevision === undefined ||
      (typeof candidate.dataRevision === 'string' && candidate.dataRevision.length > 0);
    const hasValidEnvelope =
      candidate.schemaVersion === ACCOUNT_CACHE_SCHEMA_VERSION &&
      typeof candidate.uid === 'string' &&
      candidate.uid === uid &&
      typeof candidate.savedAt === 'string' &&
      candidate.savedAt.length > 0 &&
      hasValidRevision &&
      isValidFullCloudAccountData(candidate.data);

    if (!hasValidEnvelope) {
      persistentStorage.removeItem(getAccountCacheKey(uid));
      return null;
    }

    const envelope = candidate as PersistedAccountEnvelope;
    rememberEnvelope(envelope);
    return envelope;
  } catch {
    return null;
  }
}

export function isCacheFreshWithin24Hours(savedAt: string | undefined, nowMs = Date.now()): boolean {
  if (!savedAt || typeof savedAt !== 'string') return false;
  const parsedMs = Date.parse(savedAt);
  if (Number.isNaN(parsedMs)) return false;
  return nowMs - parsedMs >= 0 && nowMs - parsedMs < ACCOUNT_CACHE_MAX_AGE_MS;
}

export function savePersistedAccount(
  uid: string,
  data: FullCloudAccountData,
  savedAt: string = new Date().toISOString(),
  dataRevision?: string
): void {
  if (!uid) return;
  try {
    const existingEnvelope = getKnownEnvelope(uid) ?? readValidatedEnvelope(uid);
    const resolvedRevision =
      dataRevision ?? data.dataRevision ?? existingEnvelope?.dataRevision;
    // Saves made from the store do not carry the marker: keep the one of the last cloud load.
    const resolvedHistorySyncedAt =
      data.historySyncedAt ?? existingEnvelope?.data.historySyncedAt;
    const cleanData: FullCloudAccountData = {
      ...data,
      ...(resolvedRevision ? { dataRevision: resolvedRevision } : {}),
      ...(resolvedHistorySyncedAt ? { historySyncedAt: resolvedHistorySyncedAt } : {}),
    };
    const envelope: PersistedAccountEnvelope = {
      schemaVersion: ACCOUNT_CACHE_SCHEMA_VERSION,
      uid,
      savedAt,
      ...(resolvedRevision ? { dataRevision: resolvedRevision } : {}),
      data: cleanData,
    };
    persistentStorage.setItem(getAccountCacheKey(uid), envelope);
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));
    rememberEnvelope(envelope);
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Updates the stored `dataRevision` (and `savedAt` timestamp) in the local cache envelope
 * whenever a client write succeeds, keeping the local cache revision aligned with `users/{uid}.dataRevision`.
 */
export function updatePersistedAccountRevision(
  uid: string,
  dataRevision: string,
  savedAt: string = new Date().toISOString()
): void {
  if (!uid || !dataRevision) return;
  try {
    if (pendingSaveEntry && pendingSaveEntry.uid === uid) {
      pendingSaveEntry = {
        ...pendingSaveEntry,
        dataRevision,
        data: { ...pendingSaveEntry.data, dataRevision },
      };
    }
    const existingEnvelope = getKnownEnvelope(uid) ?? readValidatedEnvelope(uid);
    if (!existingEnvelope) return;
    const updatedEnvelope: PersistedAccountEnvelope = {
      ...existingEnvelope,
      savedAt,
      dataRevision,
      data: {
        ...existingEnvelope.data,
        dataRevision,
      },
    };
    persistentStorage.setItem(getAccountCacheKey(uid), updatedEnvelope);
    rememberEnvelope(updatedEnvelope);
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Enqueues a debounced write of the user's account cache to prevent disk thrashing
 * on rapid user edits (R-06). Can be explicitly flushed on AppState background transition.
 */
export function schedulePersistedAccountSave(
  uid: string,
  data: FullCloudAccountData,
  delayMs = 300,
  dataRevision?: string
): void {
  if (!uid) return;
  const inheritedRevision = dataRevision ?? data.dataRevision ?? pendingSaveEntry?.dataRevision;
  pendingSaveEntry = {
    uid,
    data,
    ...(inheritedRevision ? { dataRevision: inheritedRevision } : {}),
  };

  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer);
  }

  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    if (pendingSaveEntry && pendingSaveEntry.uid === uid) {
      const toSave = pendingSaveEntry;
      pendingSaveEntry = null;
      savePersistedAccount(toSave.uid, toSave.data, new Date().toISOString(), toSave.dataRevision);
    }
  }, delayMs);
}

/**
 * Immediately flushes any pending debounced save to persistent storage (e.g., when
 * user switches to home screen or leaves the app).
 */
export function flushPendingPersistedAccount(): void {
  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (pendingSaveEntry) {
    const toSave = pendingSaveEntry;
    pendingSaveEntry = null;
    savePersistedAccount(toSave.uid, toSave.data, new Date().toISOString(), toSave.dataRevision);
  }
}

export function cancelPendingPersistedAccountSave(uid?: string): void {
  if (!uid || (pendingSaveEntry && pendingSaveEntry.uid === uid)) {
    if (pendingSaveTimer !== null) {
      clearTimeout(pendingSaveTimer);
      pendingSaveTimer = null;
    }
    pendingSaveEntry = null;
  }
}

export function loadPersistedAccountEnvelope(uid: string): PersistedAccountEnvelope | null {
  if (!uid) return null;
  try {
    if (pendingSaveEntry && pendingSaveEntry.uid === uid) {
      flushPendingPersistedAccount();
    }
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));
    return readValidatedEnvelope(uid);
  } catch {
    return null;
  }
}

export function loadPersistedAccount(uid: string): FullCloudAccountData | null {
  const envelope = loadPersistedAccountEnvelope(uid);
  return envelope ? envelope.data : null;
}

export function clearPersistedAccount(uid: string): void {
  if (!uid) return;
  cancelPendingPersistedAccountSave(uid);
  knownEnvelopes.delete(uid);
  try {
    persistentStorage.removeItem(getAccountCacheKey(uid));
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));
  } catch {
    // Ignore storage errors
  }
}
