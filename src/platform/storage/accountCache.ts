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
import { persistentStorage } from './persistentStorageAdapter';

export const ACCOUNT_CACHE_SCHEMA_VERSION = 2;

const LEGACY_ACCOUNT_CACHE_PREFIX_V1 = 'bflow.account.cache.v1.';
const ACCOUNT_CACHE_PREFIX = 'bflow.account.cache.v2.';

export interface PersistedAccountEnvelope {
  schemaVersion: number;
  uid: string;
  savedAt: string;
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
    if (a.activeMonthKey !== b.activeMonthKey) return false;
    if (Boolean(a.needsOnboarding) !== Boolean(b.needsOnboarding)) return false;
    if (a.availableMonths.length !== b.availableMonths.length) return false;
    if (a.concepts.length !== b.concepts.length) return false;
    if (a.entries.length !== b.entries.length) return false;
    if (a.debtPayments.length !== b.debtPayments.length) return false;

    return (
      JSON.stringify(a.availableMonths) === JSON.stringify(b.availableMonths) &&
      JSON.stringify(a.concepts) === JSON.stringify(b.concepts) &&
      JSON.stringify(a.entries) === JSON.stringify(b.entries) &&
      JSON.stringify(a.debtsByMonth) === JSON.stringify(b.debtsByMonth) &&
      JSON.stringify(a.debtPayments) === JSON.stringify(b.debtPayments) &&
      JSON.stringify(a.savingsBucketsByMonth) === JSON.stringify(b.savingsBucketsByMonth) &&
      JSON.stringify(a.provisionPlan) === JSON.stringify(b.provisionPlan) &&
      JSON.stringify(a.closedSnapshots) === JSON.stringify(b.closedSnapshots)
    );
  } catch {
    return false;
  }
}

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveEntry: { uid: string; data: FullCloudAccountData } | null = null;

export function savePersistedAccount(
  uid: string,
  data: FullCloudAccountData,
  savedAt: string = new Date().toISOString()
): void {
  if (!uid) return;
  try {
    const envelope: PersistedAccountEnvelope = {
      schemaVersion: ACCOUNT_CACHE_SCHEMA_VERSION,
      uid,
      savedAt,
      data,
    };
    persistentStorage.setItem(getAccountCacheKey(uid), envelope);
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));
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
  delayMs = 300
): void {
  if (!uid) return;
  pendingSaveEntry = { uid, data };

  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer);
  }

  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    if (pendingSaveEntry && pendingSaveEntry.uid === uid) {
      const toSave = pendingSaveEntry;
      pendingSaveEntry = null;
      savePersistedAccount(toSave.uid, toSave.data);
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
    savePersistedAccount(toSave.uid, toSave.data);
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

export function loadPersistedAccount(uid: string): FullCloudAccountData | null {
  if (!uid) return null;
  try {
    // Flush any pending save for this user first
    if (pendingSaveEntry && pendingSaveEntry.uid === uid) {
      flushPendingPersistedAccount();
    }

    // Opportunistically purge any leftover v1 entry for this user
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));

    const raw = persistentStorage.getItem<unknown>(getAccountCacheKey(uid));
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedAccountEnvelope>;
    const hasValidEnvelope =
      candidate.schemaVersion === ACCOUNT_CACHE_SCHEMA_VERSION &&
      typeof candidate.uid === 'string' &&
      candidate.uid === uid &&
      typeof candidate.savedAt === 'string' &&
      candidate.savedAt.length > 0 &&
      isValidFullCloudAccountData(candidate.data);

    if (!hasValidEnvelope) {
      persistentStorage.removeItem(getAccountCacheKey(uid));
      return null;
    }

    return candidate.data as FullCloudAccountData;
  } catch {
    // Fallback on corrupt cache
    return null;
  }
}

export function clearPersistedAccount(uid: string): void {
  if (!uid) return;
  cancelPendingPersistedAccountSave(uid);
  try {
    persistentStorage.removeItem(getAccountCacheKey(uid));
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));
  } catch {
    // Ignore storage errors
  }
}
