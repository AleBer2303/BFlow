/**
 * src/platform/storage/accountCache.ts
 *
 * Local offline snapshot cache for BFlow user accounts:
 * Enables instantaneous cold-boot rehydration and seamless offline operation
 * before Cloud Firestore queries resolve or when the device is disconnected.
 *
 * Stores data inside a versioned envelope (`{ schemaVersion, uid, savedAt, data }`)
 * so legacy v1 entries, mismatched schema versions, or cross-account payloads are
 * rejected and purged immediately (ADR 0015).
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

export function loadPersistedAccount(uid: string): FullCloudAccountData | null {
  if (!uid) return null;
  try {
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
  try {
    persistentStorage.removeItem(getAccountCacheKey(uid));
    persistentStorage.removeItem(getLegacyAccountCacheKeyV1(uid));
  } catch {
    // Ignore storage errors
  }
}
