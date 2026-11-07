import type { FullCloudAccountData } from '../../../data/repositories/budgetRepository';
import { clearPersistedAccount, loadPersistedAccount, savePersistedAccount } from '../accountCache';
import { persistentStorage } from '../persistentStorageAdapter';

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

  beforeEach(() => {
    persistentStorage.clear();
  });

  it('persists and loads account data cleanly', () => {
    savePersistedAccount(uid, mockAccount);
    const loaded = loadPersistedAccount(uid);
    expect(loaded).toEqual(mockAccount);
  });

  it('returns null for missing cache', () => {
    expect(loadPersistedAccount('nonexistent-uid')).toBeNull();
  });

  it('clears persisted account data', () => {
    savePersistedAccount(uid, mockAccount);
    expect(loadPersistedAccount(uid)).not.toBeNull();

    clearPersistedAccount(uid);
    expect(loadPersistedAccount(uid)).toBeNull();
  });
});
