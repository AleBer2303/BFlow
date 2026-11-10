import type { FullCloudAccountData } from '../../../data/repositories/budgetRepository';
import {
  ACCOUNT_CACHE_SCHEMA_VERSION,
  clearPersistedAccount,
  getAccountCacheKey,
  getLegacyAccountCacheKeyV1,
  loadPersistedAccount,
  savePersistedAccount,
  type PersistedAccountEnvelope,
} from '../accountCache';
import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  decryptRawStringFromStorage,
  persistentStorage,
  type RawStorageBackend,
} from '../persistentStorageAdapter';
import { isEncryptedStoragePayload } from '../storageCipher';

function createDiskBackend(): {
  backend: RawStorageBackend;
  disk: Map<string, string>;
} {
  const disk = new Map<string, string>();
  return {
    disk,
    backend: {
      getItem: (key) => disk.get(key) ?? null,
      setItem: (key, value) => {
        disk.set(key, value);
      },
      removeItem: (key) => {
        disk.delete(key);
      },
      clear: () => {
        disk.clear();
      },
    },
  };
}

describe('accountCache', () => {
  const uid = 'test-user-offline-123';
  const mockAccount: FullCloudAccountData = {
    activeMonthKey: '2026-10',
    availableMonths: ['2026-10'],
    concepts: [],
    entries: [],
    debtsByMonth: {},
    debtPayments: [],
    savingsBucketsByMonth: {},
    provisionPlan: {
      items: [],
      recurringMonthlyTotalCop: 0,
      totalWithTargetGoalCop: 0,
    },
    closedSnapshots: {},
  };

  let disk: Map<string, string>;

  beforeEach(() => {
    const sim = createDiskBackend();
    disk = sim.disk;
    __setStorageBackendForTests(sim.backend);
    persistentStorage.clear();
  });

  afterEach(() => {
    __setStorageBackendForTests(null);
    persistentStorage.clear();
  });

  it('persists account data inside an AES-256 encrypted versioned envelope and survives resetting the in-memory Map', () => {
    savePersistedAccount(uid, mockAccount, '2026-11-10T15:00:00.000Z');

    const rawStored = disk.get(getAccountCacheKey(uid));
    expect(rawStored).toBeDefined();
    expect(isEncryptedStoragePayload(rawStored!)).toBe(true);
    expect(rawStored).not.toContain('2026-10');

    const decryptedJson = decryptRawStringFromStorage(rawStored!);
    expect(decryptedJson).not.toBeNull();
    const parsedEnvelope = JSON.parse(decryptedJson!) as PersistedAccountEnvelope;
    expect(parsedEnvelope).toEqual({
      schemaVersion: ACCOUNT_CACHE_SCHEMA_VERSION,
      uid,
      savedAt: '2026-11-10T15:00:00.000Z',
      data: mockAccount,
    });

    // Wipe in-memory Map to simulate app restart
    __resetMemoryCacheForTests();

    const loaded = loadPersistedAccount(uid);
    expect(loaded).toEqual(mockAccount);
  });

  it('returns null for missing cache', () => {
    expect(loadPersistedAccount('nonexistent-uid')).toBeNull();
  });

  it('discards legacy v1 format (bare FullCloudAccountData without envelope) and purges the v1 key', () => {
    // Store bare v1 data under both the legacy v1 key and the v2 key
    persistentStorage.setItem(getLegacyAccountCacheKeyV1(uid), mockAccount);
    persistentStorage.setItem(getAccountCacheKey(uid), mockAccount);
    __resetMemoryCacheForTests();

    expect(loadPersistedAccount(uid)).toBeNull();
    expect(disk.has(getLegacyAccountCacheKeyV1(uid))).toBe(false);
    expect(disk.has(getAccountCacheKey(uid))).toBe(false);
  });

  it('discards envelopes with a mismatched schemaVersion and removes the corrupt entry', () => {
    persistentStorage.setItem(getAccountCacheKey(uid), {
      schemaVersion: 1,
      uid,
      savedAt: '2026-11-10T15:00:00.000Z',
      data: mockAccount,
    });
    __resetMemoryCacheForTests();

    expect(loadPersistedAccount(uid)).toBeNull();
    expect(disk.has(getAccountCacheKey(uid))).toBe(false);

    persistentStorage.setItem(getAccountCacheKey(uid), {
      schemaVersion: 999,
      uid,
      savedAt: '2026-11-10T15:00:00.000Z',
      data: mockAccount,
    });
    __resetMemoryCacheForTests();

    expect(loadPersistedAccount(uid)).toBeNull();
    expect(disk.has(getAccountCacheKey(uid))).toBe(false);
  });

  it('discards envelopes whose uid does not match the requested uid', () => {
    persistentStorage.setItem(getAccountCacheKey(uid), {
      schemaVersion: ACCOUNT_CACHE_SCHEMA_VERSION,
      uid: 'different-user-999',
      savedAt: '2026-11-10T15:00:00.000Z',
      data: mockAccount,
    });
    __resetMemoryCacheForTests();

    expect(loadPersistedAccount(uid)).toBeNull();
    expect(disk.has(getAccountCacheKey(uid))).toBe(false);
  });

  it('discards malformed envelopes missing savedAt or valid account data structure', () => {
    persistentStorage.setItem(getAccountCacheKey(uid), {
      schemaVersion: ACCOUNT_CACHE_SCHEMA_VERSION,
      uid,
      savedAt: '',
      data: mockAccount,
    });
    __resetMemoryCacheForTests();
    expect(loadPersistedAccount(uid)).toBeNull();

    persistentStorage.setItem(getAccountCacheKey(uid), {
      schemaVersion: ACCOUNT_CACHE_SCHEMA_VERSION,
      uid,
      savedAt: '2026-11-10T15:00:00.000Z',
      data: { activeMonthKey: '' },
    });
    __resetMemoryCacheForTests();
    expect(loadPersistedAccount(uid)).toBeNull();
  });

  it('clears persisted account data (both v2 and legacy v1 keys)', () => {
    persistentStorage.setItem(getLegacyAccountCacheKeyV1(uid), mockAccount);
    savePersistedAccount(uid, mockAccount);
    __resetMemoryCacheForTests();
    expect(loadPersistedAccount(uid)).not.toBeNull();

    clearPersistedAccount(uid);
    __resetMemoryCacheForTests();
    expect(loadPersistedAccount(uid)).toBeNull();
    expect(disk.has(getAccountCacheKey(uid))).toBe(false);
    expect(disk.has(getLegacyAccountCacheKeyV1(uid))).toBe(false);
  });
});
