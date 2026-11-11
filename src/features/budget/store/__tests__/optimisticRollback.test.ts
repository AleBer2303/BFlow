/**
 * src/features/budget/store/__tests__/optimisticRollback.test.ts
 *
 * Verifies optimistic UI updates, persistent offline queue (R-07), and automatic rollback
 * with friendly error notification on permanent cloud rejections (R-08, Point 14 of Performance Audit).
 */

import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import {
  clearOfflineWriteQueue,
  hasPendingOfflineWrites,
  loadOfflineWriteQueue,
} from '../../../../platform/storage/offlineWriteQueue';
import { useBudgetStore } from '../useBudgetStore';

describe('Optimistic UI Rollback & Offline Queue (Phase 3: R-07, R-08, R-09)', () => {
  const testUser: BFlowAuthUser = {
    uid: 'uid_cloud_test_optimistic',
    email: 'abernalg2303@gmail.com',
    displayName: 'Alejandro Bernal',
    authProvider: 'password',
    provider: 'firebase',
  };

  beforeEach(() => {
    clearOfflineWriteQueue(testUser.uid);
    useBudgetStore.getState().resetToOctober2026GoldenState();
    useBudgetStore.getState().setAuthUser(testUser);
  });

  afterEach(() => {
    clearOfflineWriteQueue(testUser.uid);
    jest.restoreAllMocks();
  });

  it('rolls back toggleEntryStatus when cloud write rejects with permanent permission-denied error', async () => {
    const state = useBudgetStore.getState();
    const entry = state.entries[0];
    if (!entry) throw new Error('Expected entry to exist');
    const targetId = entry.id;
    const initialStatus = entry.status;

    // Simulate permanent permission rejection in Firestore write
    const permErr = new Error('Missing or insufficient permissions.');
    (permErr as unknown as { code: string }).code = 'permission-denied';
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry').mockRejectedValue(permErr);

    await useBudgetStore.getState().toggleEntryStatus(targetId);

    const rolledBackState = useBudgetStore.getState();
    const targetAfter = rolledBackState.entries.find((e) => e.id === targetId);

    // Must be rolled back to initial status
    expect(targetAfter?.status).toBe(initialStatus);
    expect(rolledBackState.syncMessage).toContain('Error de sincronización');
    expect(hasPendingOfflineWrites(testUser.uid)).toBe(false);
  });

  it('keeps optimistic state (NO rollback) and enqueues to persistent offline queue on network timeout (R-07)', async () => {
    const state = useBudgetStore.getState();
    const entry = state.entries[0];
    if (!entry) throw new Error('Expected entry to exist');
    const targetId = entry.id;
    const initialStatus = entry.status;
    const expectedOptimisticStatus = initialStatus === 'completed' ? 'pending' : 'completed';

    // Simulate network timeout (transient offline)
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry')
      .mockRejectedValue(new Error('Firestore write timeout'));

    await useBudgetStore.getState().toggleEntryStatus(targetId);

    const updatedState = useBudgetStore.getState();
    const targetAfter = updatedState.entries.find((e) => e.id === targetId);

    // R-07: Optimistic update is PRESERVED, no rollback on timeout!
    expect(targetAfter?.status).toBe(expectedOptimisticStatus);
    expect(updatedState.pendingOfflineWritesCount).toBe(1);
    expect(hasPendingOfflineWrites(testUser.uid)).toBe(true);

    const queue = loadOfflineWriteQueue(testUser.uid);
    expect(queue.length).toBe(1);
    expect(queue[0]?.type).toBe('save_or_update_entry');
  });

  it('rolls back addOrCompleteMovement when cloud write permanently rejects', async () => {
    const state = useBudgetStore.getState();
    const repeatableConcept = state.concepts.find((c) => c.allowMultiplePerMonth);
    if (!repeatableConcept) throw new Error('Expected repeatable concept to exist');

    const permErr = new Error('Invalid argument provided to Firestore');
    (permErr as unknown as { code: string }).code = 'invalid-argument';
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry').mockRejectedValue(permErr);

    const initialEntryCount = state.entries.length;

    await useBudgetStore.getState().addOrCompleteMovement({
      monthKey: '2026-10',
      conceptId: repeatableConcept.id,
      actualAmount: 50_000,
      completedAt: '2026-10-15',
    });

    const rolledBackState = useBudgetStore.getState();
    expect(rolledBackState.entries.length).toBe(initialEntryCount);
    expect(rolledBackState.syncMessage).toContain('Error de conexión');
  });

  it('rolls back deleteEntryById when cloud deletion fails with permanent error', async () => {
    const state = useBudgetStore.getState();
    const entry = state.entries[0];
    if (!entry) throw new Error('Expected entry to exist');
    const targetId = entry.id;

    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteEntryCompletely')
      .mockRejectedValue(new Error('Permission denied'));

    await useBudgetStore.getState().deleteEntryById(targetId);

    const rolledBackState = useBudgetStore.getState();
    expect(rolledBackState.entries.some((e) => e.id === targetId)).toBe(true);
    expect(rolledBackState.syncMessage).toContain('Error de conexión');
  });

  it('syncUserCloudAccount does NOT overwrite local state while offline writes are pending (R-09)', async () => {
    // 1. Enqueue a pending offline write
    const state = useBudgetStore.getState();
    const entry = state.entries[0];
    if (!entry) throw new Error('Expected entry');

    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry')
      .mockRejectedValue(new Error('Client is offline'));

    await useBudgetStore.getState().toggleEntryStatus(entry.id);
    expect(useBudgetStore.getState().pendingOfflineWritesCount).toBeGreaterThan(0);

    const localEntriesBeforeSync = useBudgetStore.getState().entries;

    // 2. Mock cloud snapshot with different entries
    const cloudFetchMock = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'loadFullCloudAccount')
      .mockResolvedValue({
        activeMonthKey: '2026-10',
        availableMonths: ['2026-10'],
        concepts: [],
        entries: [],
        debtsByMonth: {},
        savingsBucketsByMonth: {},
        debtPayments: [],
        closedSnapshots: {},
        provisionPlan: { items: [], recurringMonthlyTotalCop: 0, totalWithTargetGoalCop: 0 },
      });

    // 3. Attempt syncUserCloudAccount
    await useBudgetStore.getState().syncUserCloudAccount(testUser);

    // 4. Remote data must NOT have overwritten local state because of R-09 guard
    expect(cloudFetchMock).not.toHaveBeenCalled();
    expect(useBudgetStore.getState().entries).toEqual(localEntriesBeforeSync);
  });
});
