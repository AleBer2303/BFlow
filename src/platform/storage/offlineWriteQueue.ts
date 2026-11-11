/**
 * src/platform/storage/offlineWriteQueue.ts
 *
 * Persistent FIFO offline write queue for BFlow (ADR 0017, R-07, R-08, R-09).
 *
 * In native runtimes (iOS/Android Hermes), Firestore lacks IndexedDB and uses memoryLocalCache,
 * meaning writes made offline are kept in RAM and lost upon app restart.
 *
 * This module persists pending mutations into encrypted persistentStorage (expo-sqlite/kv-store in native),
 * drains them in FIFO order upon reconnection or app foregrounding, and coordinates with
 * optimistic UI state updates and cloud reconciliation.
 */

import type { FirestoreBudgetRepository } from '../../data/repositories/budgetRepository';
import type {
  CloseMonthResult,
  Concept,
  Debt,
  DebtPayment,
  IdealMotoPlan,
  MonthEntry,
  SavingsBucket,
} from '../../domain';
import { persistentStorage } from './persistentStorageAdapter';

export type QueuedWriteType =
  | 'save_or_update_entry'
  | 'delete_or_reset_entry'
  | 'save_custom_concept_and_entry'
  | 'save_concept'
  | 'delete_concept'
  | 'save_debt'
  | 'delete_debt'
  | 'save_provision_plan'
  | 'save_savings_bucket'
  | 'delete_savings_bucket'
  | 'persist_month_close'
  | 'reopen_month'
  | 'delete_month';

export interface QueuedWriteOperation {
  id: string;
  uid: string;
  type: QueuedWriteType;
  payload: Record<string, unknown>;
  createdAtIso: string;
  retryCount: number;
}

const OFFLINE_QUEUE_KEY_PREFIX = 'bflow_offline_write_queue_v1_';

export function getOfflineQueueStorageKey(uid: string): string {
  return `${OFFLINE_QUEUE_KEY_PREFIX}${uid}`;
}

/**
 * Loads pending queued operations for a given user from persistent storage.
 */
export function loadOfflineWriteQueue(uid: string): QueuedWriteOperation[] {
  if (!uid) return [];
  try {
    const parsed = persistentStorage.getItem<unknown>(getOfflineQueueStorageKey(uid));
    if (!parsed || !Array.isArray(parsed)) return [];
    return parsed.filter(
      (op): op is QueuedWriteOperation =>
        Boolean(op && typeof op === 'object' && 'id' in op && (op as Record<string, unknown>).uid === uid && 'type' in op)
    );
  } catch {
    return [];
  }
}

/**
 * Saves the given queue to persistent storage.
 */
export function saveOfflineWriteQueue(uid: string, queue: QueuedWriteOperation[]): void {
  if (!uid) return;
  const key = getOfflineQueueStorageKey(uid);
  if (queue.length === 0) {
    persistentStorage.removeItem(key);
  } else {
    persistentStorage.setItem(key, queue);
  }
}

/**
 * Appends a new operation to the user's persistent FIFO offline queue.
 * Idempotently deduplicates operations on the same target (e.g. rapid edits to same entry or debt).
 */
export function enqueueOfflineWrite(
  uid: string,
  operation: {
    type: QueuedWriteType;
    payload: Record<string, unknown>;
  }
): QueuedWriteOperation {
  const currentQueue = loadOfflineWriteQueue(uid);

  // If there's an existing pending operation for the exact same target entity,
  // update it in-place to avoid redundant writes during FIFO draining.
  const targetKey = getOperationTargetKey(operation.type, operation.payload);
  const existingIndex = targetKey
    ? currentQueue.findIndex((op) => getOperationTargetKey(op.type, op.payload) === targetKey)
    : -1;

  const newOp: QueuedWriteOperation = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    uid,
    type: operation.type,
    payload: operation.payload,
    createdAtIso: new Date().toISOString(),
    retryCount: 0,
  };

  let nextQueue: QueuedWriteOperation[];
  if (existingIndex >= 0) {
    nextQueue = [...currentQueue];
    nextQueue[existingIndex] = newOp;
  } else {
    nextQueue = [...currentQueue, newOp];
  }

  saveOfflineWriteQueue(uid, nextQueue);
  return newOp;
}

function getOperationTargetKey(type: QueuedWriteType, payload: Record<string, unknown>): string | null {
  switch (type) {
    case 'save_or_update_entry':
    case 'delete_or_reset_entry': {
      const entry = (payload.entry as { id?: string } | undefined) ?? payload;
      return entry.id ? `entry_${entry.id}` : null;
    }
    case 'save_concept':
    case 'delete_concept': {
      const concept = (payload.concept as { id?: string } | undefined) ?? payload;
      return concept.id ? `concept_${concept.id}` : null;
    }
    case 'save_debt':
    case 'delete_debt': {
      const debt = (payload.debt as { id?: string } | undefined) ?? payload;
      return debt.id ? `debt_${debt.id}` : null;
    }
    case 'save_savings_bucket':
    case 'delete_savings_bucket': {
      const bucketId = payload.bucketId as string | undefined;
      return bucketId ? `bucket_${bucketId}` : null;
    }
    case 'save_provision_plan':
      return 'provision_plan';
    case 'persist_month_close':
    case 'reopen_month':
    case 'delete_month':
      return `month_${payload.monthKey as string}`;
    default:
      return null;
  }
}

/**
 * Removes an operation by ID once successfully synced or permanently discarded.
 */
export function dequeueOfflineWrite(uid: string, operationId: string): void {
  const currentQueue = loadOfflineWriteQueue(uid);
  const nextQueue = currentQueue.filter((op) => op.id !== operationId);
  saveOfflineWriteQueue(uid, nextQueue);
}

/**
 * Clears the user's offline write queue (called during full logout or reset).
 */
export function clearOfflineWriteQueue(uid: string): void {
  if (!uid) return;
  persistentStorage.removeItem(getOfflineQueueStorageKey(uid));
}

/**
 * Returns true if there are pending offline writes for this user.
 */
export function hasPendingOfflineWrites(uid: string): boolean {
  return loadOfflineWriteQueue(uid).length > 0;
}

/**
 * Returns the count of pending offline writes for badge / indicator display.
 */
export function getPendingOfflineWritesCount(uid: string): number {
  return loadOfflineWriteQueue(uid).length;
}

/**
 * Determines whether a Firestore error is a permanent refusal (permission-denied, invalid-argument, unauthenticated)
 * where retrying will never succeed and optimistic rollback MUST be performed.
 */
export function isPermanentCloudError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const anyErr = error as { code?: string; message?: string; name?: string };
  const code = (anyErr.code ?? '').toLowerCase();
  const message = (anyErr.message ?? '').toLowerCase();

  const permanentCodes = [
    'permission-denied',
    'permission',
    'unauthenticated',
    'invalid-argument',
    'not-found',
    'already-exists',
    'resource-exhausted',
    'failed-precondition',
  ];

  return permanentCodes.some(
    (c) => code.includes(c) || (message.includes(c) && !message.includes('client is offline'))
  );
}

/**
 * Determines whether an error is transient or caused by offline/timeout conditions.
 */
export function isOfflineOrTimeoutError(error: unknown): boolean {
  if (!error) return true;
  if (isPermanentCloudError(error)) return false;
  const anyErr = error as { code?: string; message?: string; isTimeout?: boolean };
  if (anyErr.isTimeout) return true;
  const code = (anyErr.code ?? '').toLowerCase();
  const message = (anyErr.message ?? '').toLowerCase();

  return (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('network-request-failed') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('timeout') ||
    message.includes('failed to fetch')
  );
}

export interface ExecuteCloudWriteOptions<T = void> {
  uid: string;
  operation: {
    type: QueuedWriteType;
    payload: Record<string, unknown>;
  };
  performCloudWrite: () => Promise<T>;
  rollback: () => void;
  onSuccess?: (result: T) => void;
  friendlyErrorMessage?: string;
  timeoutMs?: number;
  setStoreState: (partial: Record<string, unknown>) => void;
  onWidgetSync?: () => void;
}

/**
 * Universal executor for optimistic cloud writes (R-07, R-08).
 *
 * Races the cloud write against a timeout.
 * - On success: clears syncMessage and returns synced.
 * - On timeout or offline: KEEPS optimistic UI state intact (NO rollback) and enqueues to persistent FIFO queue.
 * - On permanent rejection (permission denied, invalid argument): performs rollback, clears queue entry, sets friendly syncMessage.
 */
export async function executeOptimisticCloudWrite<T = void>(
  options: ExecuteCloudWriteOptions<T>
): Promise<{ status: 'synced' | 'queued' | 'rejected'; error?: unknown; result?: T }> {
  const {
    uid,
    operation,
    performCloudWrite,
    rollback,
    onSuccess,
    friendlyErrorMessage = 'No se pudo guardar el cambio en la nube.',
    timeoutMs = 3500,
    setStoreState,
    onWidgetSync,
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Cloud write timeout');
      (err as unknown as { isTimeout: boolean; code: string }).isTimeout = true;
      (err as unknown as { isTimeout: boolean; code: string }).code = 'deadline-exceeded';
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([performCloudWrite(), timeoutPromise]);
    if (timer) clearTimeout(timer);
    onSuccess?.(result);

    const pendingCount = getPendingOfflineWritesCount(uid);
    setStoreState({
      pendingOfflineWritesCount: pendingCount,
      syncMessage: pendingCount > 0 ? `${pendingCount} cambios pendientes por sincronizar` : '',
    });
    return { status: 'synced', result };
  } catch (error) {
    if (timer) clearTimeout(timer);

    if (isPermanentCloudError(error)) {
      // Permanent server error: rollback optimistic change immediately
      rollback();
      onWidgetSync?.();
      setStoreState({
        syncMessage: friendlyErrorMessage,
      });
      return { status: 'rejected', error };
    }

    // Transient network failure or timeout: keep optimistic UI state and enqueue
    enqueueOfflineWrite(uid, operation);
    const pendingCount = getPendingOfflineWritesCount(uid);
    setStoreState({
      pendingOfflineWritesCount: pendingCount,
      syncMessage:
        pendingCount === 1
          ? '1 cambio guardado en el dispositivo. Se sincronizará al conectar.'
          : `${pendingCount} cambios guardados en el dispositivo. Se sincronizarán al conectar.`,
    });
    return { status: 'queued', error };
  }
}

/**
 * Drains all pending operations in FIFO order against Firestore.
 * If an operation fails with a permanent error, it is discarded to prevent queue poison.
 * If an operation fails with a transient offline error, draining stops until the next reconnect attempt.
 */
let isDrainingQueue = false;

export function isOfflineQueueDraining(): boolean {
  return isDrainingQueue;
}

export async function drainOfflineWriteQueue(
  uid: string,
  repo: FirestoreBudgetRepository
): Promise<{ processed: number; remaining: number }> {
  if (!uid || isDrainingQueue) {
    return { processed: 0, remaining: getPendingOfflineWritesCount(uid) };
  }

  isDrainingQueue = true;
  let processed = 0;

  try {
    const queue = loadOfflineWriteQueue(uid);
    for (const op of queue) {
      try {
        await executeQueuedOperation(uid, op, repo);
        dequeueOfflineWrite(uid, op.id);
        processed += 1;
      } catch (err) {
        if (isPermanentCloudError(err)) {
          // Discard permanent errors so queue does not get blocked indefinitely
          dequeueOfflineWrite(uid, op.id);
        } else {
          // Still offline or transient error: break FIFO processing for now
          break;
        }
      }
    }
  } finally {
    isDrainingQueue = false;
  }

  return { processed, remaining: getPendingOfflineWritesCount(uid) };
}

async function executeQueuedOperation(
  uid: string,
  op: QueuedWriteOperation,
  repo: FirestoreBudgetRepository
): Promise<void> {
  const p = op.payload;
  switch (op.type) {
    case 'save_or_update_entry':
      await repo.saveOrUpdateEntry(
        uid,
        p.entry as MonthEntry,
        p.concept as Concept | undefined,
        (p.debtPayments as DebtPayment[] | undefined) ?? []
      );
      break;

    case 'delete_or_reset_entry':
      await repo.deleteOrResetEntry(uid, p.entryId as string);
      break;

    case 'save_custom_concept_and_entry':
      await repo.saveCustomConceptAndEntry(
        uid,
        p.concept as Concept,
        p.entry as MonthEntry,
        (p.createdPayments as DebtPayment[] | undefined) ?? []
      );
      break;

    case 'save_concept':
      await repo.saveConcept(uid, p.concept as Concept);
      break;

    case 'delete_concept':
      await repo.deleteConcept(uid, p.conceptId as string);
      break;

    case 'save_debt':
      await repo.saveDebt(uid, p.debt as Debt);
      break;

    case 'delete_debt':
      await repo.deleteDebt(uid, p.debtId as string);
      break;

    case 'save_provision_plan':
      await repo.saveProvisionPlan(uid, p.plan as IdealMotoPlan);
      break;

    case 'save_savings_bucket':
      await repo.saveSavingsBucket(
        uid,
        p.bucketId as string,
        p.openingBalanceCop as number,
        p.monthKey as string,
        p.name as string | undefined
      );
      break;

    case 'delete_savings_bucket':
      await repo.deleteSavingsBucket(uid, p.bucketId as string);
      break;

    case 'persist_month_close':
      await repo.persistMonthCloseResult(uid, p.monthKey as string, p.result as CloseMonthResult);
      break;

    case 'reopen_month':
      await repo.reopenMonthInCloud(uid, p.monthKey as string);
      break;

    case 'delete_month':
      await repo.deleteMonthInCloud(uid, p.monthKey as string, p.fallbackMonth as string);
      break;

    default:
      break;
  }
}
