/**
 * src/platform/storage/__tests__/offlineWriteQueue.test.ts
 *
 * Unit tests for the persistent offline write queue, rollback engine,
 * and conflict policy (ADR 0017, R-07, R-08, R-09).
 */

import type { FirestoreBudgetRepository } from '../../../data/repositories/budgetRepository';
import type { MonthEntry } from '../../../domain';
import {
  clearOfflineWriteQueue,
  dequeueOfflineWrite,
  drainOfflineWriteQueue,
  enqueueOfflineWrite,
  executeOptimisticCloudWrite,
  getOfflineQueueStorageKey,
  getPendingOfflineWritesCount,
  hasPendingOfflineWrites,
  isOfflineOrTimeoutError,
  isPermanentCloudError,
  loadOfflineWriteQueue,
} from '../offlineWriteQueue';
import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  persistentStorage,
  type RawStorageBackend,
} from '../persistentStorageAdapter';

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

describe('offlineWriteQueue & optimistic write executor', () => {
  const uid = 'test-offline-user-999';
  let disk: Map<string, string>;

  beforeEach(() => {
    const memoryDisk = createDiskBackend();
    disk = memoryDisk.disk;
    __setStorageBackendForTests(memoryDisk.backend);
    __resetMemoryCacheForTests();
  });

  afterEach(() => {
    __setStorageBackendForTests(null);
    __resetMemoryCacheForTests();
  });

  it('starts with empty queue and persists operations in FIFO order', () => {
    expect(loadOfflineWriteQueue(uid)).toEqual([]);
    expect(hasPendingOfflineWrites(uid)).toBe(false);
    expect(getPendingOfflineWritesCount(uid)).toBe(0);

    const op1 = enqueueOfflineWrite(uid, {
      type: 'save_concept',
      payload: { concept: { id: 'c1', name: 'Honorarios' } },
    });
    const op2 = enqueueOfflineWrite(uid, {
      type: 'save_debt',
      payload: { debt: { id: 'd1', name: 'Tarjeta' } },
    });

    expect(hasPendingOfflineWrites(uid)).toBe(true);
    expect(getPendingOfflineWritesCount(uid)).toBe(2);

    const queue = loadOfflineWriteQueue(uid);
    expect(queue.length).toBe(2);
    expect(queue[0]?.id).toBe(op1.id);
    expect(queue[1]?.id).toBe(op2.id);

    // Survives simulated RAM reboot by reading directly from storage
    __resetMemoryCacheForTests();
    const reloaded = loadOfflineWriteQueue(uid);
    expect(reloaded.length).toBe(2);
    expect(reloaded[0]?.id).toBe(op1.id);

    // Dequeue first operation
    dequeueOfflineWrite(uid, op1.id);
    expect(getPendingOfflineWritesCount(uid)).toBe(1);
    expect(loadOfflineWriteQueue(uid)[0]?.id).toBe(op2.id);

    // Clear queue
    clearOfflineWriteQueue(uid);
    expect(loadOfflineWriteQueue(uid)).toEqual([]);
    expect(disk.has(getOfflineQueueStorageKey(uid))).toBe(false);
  });

  it('deduplicates rapid consecutive writes on the same target entity (idempotency)', () => {
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: { id: 'entry_1', actualAmount: 50000 } },
    });
    expect(getPendingOfflineWritesCount(uid)).toBe(1);

    // Update the same entry with a new amount
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: { id: 'entry_1', actualAmount: 60000 } },
    });

    expect(getPendingOfflineWritesCount(uid)).toBe(1);
    const queue = loadOfflineWriteQueue(uid);
    expect(queue[0]?.payload.entry).toEqual({ id: 'entry_1', actualAmount: 60000 });
  });

  describe('error classification (isPermanentCloudError / isOfflineOrTimeoutError)', () => {
    it('detects permanent Firestore errors requiring rollback', () => {
      expect(isPermanentCloudError({ code: 'permission-denied' })).toBe(true);
      expect(isPermanentCloudError({ code: 'firestore/permission-denied' })).toBe(true);
      expect(isPermanentCloudError({ code: 'invalid-argument' })).toBe(true);
      expect(isPermanentCloudError({ code: 'unauthenticated' })).toBe(true);
      expect(isPermanentCloudError({ message: 'Missing or insufficient permissions.' })).toBe(true);
    });

    it('detects offline, network, and timeout errors as transient', () => {
      expect(isPermanentCloudError({ code: 'unavailable' })).toBe(false);
      expect(isOfflineOrTimeoutError({ code: 'unavailable' })).toBe(true);
      expect(isOfflineOrTimeoutError({ isTimeout: true })).toBe(true);
      expect(isOfflineOrTimeoutError({ message: 'Failed to fetch' })).toBe(true);
      expect(isOfflineOrTimeoutError({ message: 'Network request failed' })).toBe(true);
    });
  });

  describe('executeOptimisticCloudWrite', () => {
    it('succeeds within timeout without rollback or queueing', async () => {
      let rolledBack = false;
      const storeUpdates: Record<string, unknown>[] = [];

      const result = await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_concept',
          payload: { concept: { id: 'c1' } },
        },
        performCloudWrite: async () => {
          // Fast resolution
        },
        rollback: () => {
          rolledBack = true;
        },
        setStoreState: (s) => storeUpdates.push(s),
      });

      expect(result.status).toBe('synced');
      expect(rolledBack).toBe(false);
      expect(hasPendingOfflineWrites(uid)).toBe(false);
    });

    it('keeps optimistic state (NO rollback) and enqueues on timeout (R-07)', async () => {
      let rolledBack = false;
      const storeUpdates: Record<string, unknown>[] = [];

      const result = await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_or_update_entry',
          payload: { entry: { id: 'e1', actualAmount: 100000 } },
        },
        performCloudWrite: () =>
          new Promise((resolve) => {
            // Never resolves or takes longer than timeout
            setTimeout(resolve, 500);
          }),
        rollback: () => {
          rolledBack = true;
        },
        timeoutMs: 50, // Short timeout for test
        setStoreState: (s) => storeUpdates.push(s),
      });

      expect(result.status).toBe('queued');
      expect(rolledBack).toBe(false); // NO rollback on timeout!
      expect(hasPendingOfflineWrites(uid)).toBe(true);
      expect(getPendingOfflineWritesCount(uid)).toBe(1);

      const lastState = storeUpdates[storeUpdates.length - 1];
      expect(lastState?.pendingOfflineWritesCount).toBe(1);
      expect(lastState?.syncMessage).toContain('1 cambio guardado en el dispositivo');
    });

    it('performs rollback and sets friendly message on permanent rejection (R-08)', async () => {
      let rolledBack = false;
      const storeUpdates: Record<string, unknown>[] = [];

      const result = await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_debt',
          payload: { debt: { id: 'd1' } },
        },
        performCloudWrite: async () => {
          const err = new Error('Permission denied on debts collection');
          (err as unknown as { code: string }).code = 'permission-denied';
          throw err;
        },
        rollback: () => {
          rolledBack = true;
        },
        friendlyErrorMessage: 'No tienes permiso para guardar esta deuda.',
        setStoreState: (s) => storeUpdates.push(s),
      });

      expect(result.status).toBe('rejected');
      expect(rolledBack).toBe(true); // Must rollback
      expect(hasPendingOfflineWrites(uid)).toBe(false); // Do not enqueue invalid requests

      const lastState = storeUpdates[storeUpdates.length - 1];
      expect(lastState?.syncMessage).toBe('No tienes permiso para guardar esta deuda.');
    });
  });

  describe('drainOfflineWriteQueue', () => {
    it('drains operations FIFO and executes them against FirestoreBudgetRepository', async () => {
      const executed: string[] = [];
      const mockRepo = {
        saveConcept: jest.fn().mockImplementation(async (_u, c) => {
          executed.push(`concept_${c.id}`);
        }),
        saveDebt: jest.fn().mockImplementation(async (_u, d) => {
          executed.push(`debt_${d.id}`);
        }),
      } as unknown as FirestoreBudgetRepository;

      enqueueOfflineWrite(uid, {
        type: 'save_concept',
        payload: { concept: { id: 'c1' } },
      });
      enqueueOfflineWrite(uid, {
        type: 'save_debt',
        payload: { debt: { id: 'd1' } },
      });

      expect(getPendingOfflineWritesCount(uid)).toBe(2);

      const drainResult = await drainOfflineWriteQueue(uid, mockRepo);
      expect(drainResult.processed).toBe(2);
      expect(drainResult.remaining).toBe(0);
      expect(executed).toEqual(['concept_c1', 'debt_d1']);
      expect(hasPendingOfflineWrites(uid)).toBe(false);
    });

    it('discards permanently rejected queued operations to prevent queue blocking', async () => {
      const mockRepo = {
        saveConcept: jest.fn().mockImplementation(async () => {
          const err = new Error('Invalid schema');
          (err as unknown as { code: string }).code = 'invalid-argument';
          throw err;
        }),
        saveDebt: jest.fn().mockResolvedValue(undefined),
      } as unknown as FirestoreBudgetRepository;

      enqueueOfflineWrite(uid, {
        type: 'save_concept',
        payload: { concept: { id: 'invalid_c' } },
      });
      enqueueOfflineWrite(uid, {
        type: 'save_debt',
        payload: { debt: { id: 'valid_d' } },
      });

      const drainResult = await drainOfflineWriteQueue(uid, mockRepo);
      // Both are processed/drained: invalid removed, valid succeeded
      expect(drainResult.processed).toBe(1);
      expect(hasPendingOfflineWrites(uid)).toBe(false);
      expect(mockRepo.saveDebt).toHaveBeenCalled();
    });

    it('stops draining when still offline without losing queued operations', async () => {
      const mockRepo = {
        saveConcept: jest.fn().mockImplementation(async () => {
          const err = new Error('Client is offline');
          (err as unknown as { code: string }).code = 'unavailable';
          throw err;
        }),
        saveDebt: jest.fn(),
      } as unknown as FirestoreBudgetRepository;

      enqueueOfflineWrite(uid, {
        type: 'save_concept',
        payload: { concept: { id: 'c1' } },
      });
      enqueueOfflineWrite(uid, {
        type: 'save_debt',
        payload: { debt: { id: 'd1' } },
      });

      const drainResult = await drainOfflineWriteQueue(uid, mockRepo);
      expect(drainResult.processed).toBe(0);
      expect(drainResult.remaining).toBe(2);
      expect(mockRepo.saveDebt).not.toHaveBeenCalled();
    });
  });
});
