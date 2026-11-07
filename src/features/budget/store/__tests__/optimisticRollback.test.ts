/**
 * src/features/budget/store/__tests__/optimisticRollback.test.ts
 *
 * Verifies optimistic UI updates and automatic rollback with friendly error notification
 * when Firestore cloud synchronization fails (Point 14 of Performance Guide).
 */

import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import { useBudgetStore } from '../useBudgetStore';

describe('Optimistic UI Rollback on Cloud Failure (Point 14)', () => {
  const testUser: BFlowAuthUser = {
    uid: 'uid_cloud_test_optimistic',
    email: 'abernalg2303@gmail.com',
    displayName: 'Alejandro Bernal',
    authProvider: 'password',
    provider: 'firebase',
  };

  beforeEach(() => {
    useBudgetStore.getState().resetToOctober2026GoldenState();
    useBudgetStore.getState().setAuthUser(testUser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rolls back toggleEntryStatus when cloud write rejects with network error', async () => {
    const state = useBudgetStore.getState();
    const entry = state.entries[0];
    if (!entry) throw new Error('Expected entry to exist');
    const targetId = entry.id;
    const initialStatus = entry.status;

    // Simulate network error in Firestore write
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry')
      .mockRejectedValue(new Error('Network unavailable in Cloud Firestore'));

    await useBudgetStore.getState().toggleEntryStatus(targetId);

    const rolledBackState = useBudgetStore.getState();
    const targetAfter = rolledBackState.entries.find((e) => e.id === targetId);

    // Must be rolled back to initial status
    expect(targetAfter?.status).toBe(initialStatus);
    expect(rolledBackState.syncMessage).toContain('Error de sincronización');
  });

  it('rolls back addOrCompleteMovement when cloud write fails', async () => {
    const state = useBudgetStore.getState();
    const repeatableConcept = state.concepts.find((c) => c.allowMultiplePerMonth);
    if (!repeatableConcept) throw new Error('Expected repeatable concept to exist');

    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry')
      .mockRejectedValue(new Error('Firestore write timeout'));

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

  it('rolls back deleteEntryById when cloud deletion fails', async () => {
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
});
