/**
 * src/platform/storage/accountCache.ts
 *
 * Local offline snapshot cache for BFlow user accounts:
 * Enables instantaneous cold-boot rehydration and seamless offline operation
 * before Cloud Firestore queries resolve or when the device is disconnected.
 */

import type { FullCloudAccountData } from '../../data/repositories/budgetRepository';
import { persistentStorage } from './persistentStorageAdapter';

const ACCOUNT_CACHE_PREFIX = 'bflow.account.cache.v1.';

export function getAccountCacheKey(uid: string): string {
  return `${ACCOUNT_CACHE_PREFIX}${uid}`;
}

export function savePersistedAccount(uid: string, data: FullCloudAccountData): void {
  try {
    persistentStorage.setItem(getAccountCacheKey(uid), data);
  } catch {
    // Gracefully handle storage errors
  }
}

export function loadPersistedAccount(uid: string): FullCloudAccountData | null {
  try {
    const data = persistentStorage.getItem<FullCloudAccountData>(getAccountCacheKey(uid));
    if (data && typeof data === 'object' && typeof data.activeMonthKey === 'string') {
      return data;
    }
  } catch {
    // Fallback on corrupt cache
  }
  return null;
}

export function clearPersistedAccount(uid: string): void {
  try {
    persistentStorage.removeItem(getAccountCacheKey(uid));
  } catch {
    // Ignore storage errors
  }
}
