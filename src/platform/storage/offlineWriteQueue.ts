/**
 * src/platform/storage/offlineWriteQueue.ts
 *
 * Persistent FIFO offline write queue for BFlow (ADR 0017, ADR 0035, R-07, R-08, R-09).
 *
 * In native runtimes (iOS/Android Hermes), Firestore lacks IndexedDB and uses memoryLocalCache,
 * meaning writes made offline are kept in RAM and lost upon app restart.
 *
 * This module persists pending mutations into encrypted persistentStorage (expo-sqlite/kv-store in native),
 * drains them in FIFO order upon reconnection or app foregrounding, and coordinates with
 * optimistic UI state updates and cloud reconciliation.
 *
 * ADR 0035: each operation carries the exact payload its slice sends (discriminated union by `type`),
 * stored queues are validated with Zod when read (operations that do not fit are dropped and
 * reported), and compaction works per target: see `compactQueue`.
 */

import { migrateBucketId } from '../../data/migrations/legacyFieldMigration';
import { z } from 'zod';
import type {
  FirestoreBudgetRepository,
  InitialAccountSetupPayload,
  UserProfileFields,
} from '../../data/repositories/budgetRepository';
import type {
  CloseMonthResult,
  Concept,
  Debt,
  DebtPayment,
  FinancialAccount,
  ProvisionPlan,
  MonthEntry,
} from '../../domain';
import { persistentStorage } from './persistentStorageAdapter';

/** Exact payload of every queued write, keyed by operation type. */
export interface QueuedWritePayloads {
  save_or_update_entry: { entry: MonthEntry; concept?: Concept; debtPayments?: DebtPayment[] };
  /** Resets a single-per-month movement or deletes a repeatable one (`deleteOrResetEntry`). */
  delete_or_reset_entry: {
    entryId: string;
    conceptId: string;
    monthKey: string;
    entry: MonthEntry;
    concept?: Concept;
  };
  /** Deletes the movement and its debt payments (`deleteEntryCompletely`). */
  delete_entry_completely: { entryId: string; conceptId: string; monthKey: string };
  save_custom_concept_and_entry: {
    concept: Concept;
    entry: MonthEntry;
    createdPayments?: DebtPayment[];
  };
  save_concept: { concept: Concept };
  delete_concept: { conceptId: string };
  save_debt: { debt: Debt };
  delete_debt: { debtId: string };
  save_financial_account: { account: FinancialAccount };
  delete_financial_account: { accountId: string };
  save_provision_plan: { plan: ProvisionPlan };
  save_savings_bucket: {
    bucketId: string;
    openingBalanceCop: number;
    monthKey: string;
    name?: string;
  };
  delete_savings_bucket: { bucketId: string };
  persist_month_close: { monthKey: string; result: CloseMonthResult };
  reopen_month: { monthKey: string };
  delete_month: { monthKey: string; fallbackMonth: string };
  save_user_profile: UserProfileFields;
  /** Idempotent: deterministic document ids, so replaying it never duplicates documents. */
  save_initial_account_setup: InitialAccountSetupPayload;
}

export type QueuedWriteType = keyof QueuedWritePayloads;

/** What a slice hands to the queue: the type and its exact payload. */
export type QueuedWriteRequest = {
  [K in QueuedWriteType]: { type: K; payload: QueuedWritePayloads[K] };
}[QueuedWriteType];

export type QueuedWriteOperation = QueuedWriteRequest & {
  id: string;
  uid: string;
  createdAtIso: string;
  retryCount: number;
};

const OFFLINE_QUEUE_KEY_PREFIX = 'bflow_offline_write_queue_v1_';

export function getOfflineQueueStorageKey(uid: string): string {
  return `${OFFLINE_QUEUE_KEY_PREFIX}${uid}`;
}

// ---------------------------------------------------------------------------
// Validation of stored queues (Zod)
// ---------------------------------------------------------------------------

const idString = z.string().min(1);
const entityShape = z.looseObject({ id: idString });
const entryShape = z.looseObject({ id: idString, monthKey: z.string(), conceptId: z.string() });
const entityList = z.array(entityShape);

/**
 * Structural check of each payload. Full validation of the documents stays in the Firestore
 * mappers (`firestoreSchemas.ts`), which run when the operation is replayed.
 */
const PAYLOAD_SCHEMAS: { [K in QueuedWriteType]: z.ZodType } = {
  save_or_update_entry: z.looseObject({
    entry: entryShape,
    concept: entityShape.optional(),
    debtPayments: entityList.optional(),
  }),
  delete_or_reset_entry: z.looseObject({
    entryId: idString,
    conceptId: z.string(),
    monthKey: z.string(),
    entry: entryShape,
    concept: entityShape.optional(),
  }),
  delete_entry_completely: z.looseObject({
    entryId: idString,
    conceptId: z.string(),
    monthKey: z.string(),
  }),
  save_custom_concept_and_entry: z.looseObject({
    concept: entityShape,
    entry: entryShape,
    createdPayments: entityList.optional(),
  }),
  save_concept: z.looseObject({ concept: entityShape }),
  delete_concept: z.looseObject({ conceptId: idString }),
  save_debt: z.looseObject({ debt: entityShape }),
  delete_debt: z.looseObject({ debtId: idString }),
  save_financial_account: z.looseObject({ account: entityShape }),
  delete_financial_account: z.looseObject({ accountId: idString }),
  save_provision_plan: z.looseObject({ plan: z.looseObject({ items: z.array(z.unknown()) }) }),
  save_savings_bucket: z.looseObject({
    bucketId: idString,
    openingBalanceCop: z.number(),
    monthKey: z.string(),
    name: z.string().optional(),
  }),
  delete_savings_bucket: z.looseObject({ bucketId: idString }),
  persist_month_close: z.looseObject({
    monthKey: idString,
    result: z.looseObject({
      snapshot: z.looseObject({ monthKey: z.string() }),
      nextMonthKey: z.string(),
      nextMonthDebts: entityList,
      nextMonthSavingsBuckets: entityList,
      nextMonthEntries: entityList,
    }),
  }),
  reopen_month: z.looseObject({ monthKey: idString }),
  delete_month: z.looseObject({ monthKey: idString, fallbackMonth: z.string() }),
  save_user_profile: z.looseObject({
    displayName: z.string(),
    financialGoal: z.string(),
    photoUrl: z.string().optional(),
  }),
  save_initial_account_setup: z.looseObject({
    monthKey: idString,
    concepts: entityList,
    entries: entityList,
    debts: entityList,
    debtPayments: entityList,
    savingsBuckets: entityList,
    provisionPlan: z.looseObject({ items: z.array(z.unknown()) }),
  }),
};

const QUEUED_WRITE_TYPES = Object.keys(PAYLOAD_SCHEMAS) as QueuedWriteType[];

const operationEnvelopeSchema = z.object({
  id: idString,
  uid: idString,
  type: z.enum(QUEUED_WRITE_TYPES as [QueuedWriteType, ...QueuedWriteType[]]),
  payload: z.record(z.string(), z.unknown()),
  createdAtIso: z.string(),
  retryCount: z.number().int().min(0),
});

type OperationEnvelope = z.infer<typeof operationEnvelopeSchema>;

/**
 * Versions before ADR 0035 queued `deleteEntryById` as `delete_or_reset_entry` without the movement,
 * which replayed as a reset (BUG-01). Those operations are upgraded to a full delete.
 */
function upgradeLegacyOperation(envelope: OperationEnvelope): OperationEnvelope {
  if (envelope.type === 'delete_or_reset_entry' && envelope.payload.entry === undefined) {
    const { entryId, conceptId, monthKey } = envelope.payload;
    return { ...envelope, type: 'delete_entry_completely', payload: { entryId, conceptId, monthKey } };
  }
  return envelope;
}

function parseStoredOperation(
  raw: unknown,
  uid: string
): { operation: QueuedWriteOperation; upgraded: boolean } | null {
  const envelope = operationEnvelopeSchema.safeParse(raw);
  if (!envelope.success || envelope.data.uid !== uid) return null;
  const upgraded = upgradeLegacyOperation(envelope.data);
  const payload = PAYLOAD_SCHEMAS[upgraded.type].safeParse(upgraded.payload);
  if (!payload.success) return null;
  return {
    operation: { ...upgraded, payload: payload.data } as QueuedWriteOperation,
    upgraded: upgraded !== envelope.data,
  };
}

/** Stored operations dropped because they no longer fit the contract, pending to be reported. */
const discardedCountByUid = new Map<string, number>();

/**
 * Returns how many stored operations were dropped as invalid since the last call, and resets it.
 * The sync slice uses it to warn the user through `syncMessage`.
 */
export function consumeDiscardedOfflineWritesCount(uid: string): number {
  const count = discardedCountByUid.get(uid) ?? 0;
  discardedCountByUid.delete(uid);
  return count;
}

/** User-facing notice for dropped operations ('' when there are none). */
export function formatDiscardedOfflineWritesNotice(count: number): string {
  if (count <= 0) return '';
  return count === 1
    ? 'Se descartó 1 cambio pendiente guardado con un formato anterior.'
    : `Se descartaron ${count} cambios pendientes guardados con un formato anterior.`;
}

/**
 * Loads pending queued operations for a given user from persistent storage.
 * Never throws: operations that do not fit the contract are dropped, the cleaned queue is
 * stored back and the drop is counted (`consumeDiscardedOfflineWritesCount`).
 */
export function loadOfflineWriteQueue(uid: string): QueuedWriteOperation[] {
  if (!uid) return [];
  try {
    const stored = persistentStorage.getItem<unknown>(getOfflineQueueStorageKey(uid));
    if (stored === null || stored === undefined) return [];
    const rawItems: unknown[] = Array.isArray(stored) ? stored : [stored];

    const queue: QueuedWriteOperation[] = [];
    let changed = !Array.isArray(stored);
    for (const raw of rawItems) {
      const parsed = parseStoredOperation(raw, uid);
      if (!parsed) {
        changed = true;
        continue;
      }
      changed ||= parsed.upgraded;
      queue.push(parsed.operation);
    }

    const discarded = rawItems.length - queue.length;
    if (discarded > 0) {
      discardedCountByUid.set(uid, (discardedCountByUid.get(uid) ?? 0) + discarded);
    }
    if (changed) {
      saveOfflineWriteQueue(uid, queue);
    }
    return queue;
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

// ---------------------------------------------------------------------------
// Targets and compaction (BUG-02)
// ---------------------------------------------------------------------------

/**
 * Document a write is about. Saves and deletes of the same object resolve the same key;
 * `save_custom_concept_and_entry` uses the key of its entry.
 */
export function getOperationTargetKey(op: QueuedWriteRequest): string | null {
  switch (op.type) {
    case 'save_or_update_entry':
    case 'save_custom_concept_and_entry':
      return `entry_${op.payload.entry.id}`;
    case 'delete_or_reset_entry':
    case 'delete_entry_completely':
      return `entry_${op.payload.entryId}`;
    case 'save_concept':
      return `concept_${op.payload.concept.id}`;
    case 'delete_concept':
      return `concept_${op.payload.conceptId}`;
    case 'save_debt':
      return `debt_${op.payload.debt.id}`;
    case 'delete_debt':
      return `debt_${op.payload.debtId}`;
    case 'save_financial_account':
      return `account_${op.payload.account.id}`;
    case 'delete_financial_account':
      return `account_${op.payload.accountId}`;
    case 'save_savings_bucket':
    case 'delete_savings_bucket':
      return `bucket_${migrateBucketId(op.payload.bucketId)}`;
    case 'save_provision_plan':
      return 'provision_plan';
    case 'persist_month_close':
    case 'reopen_month':
    case 'delete_month':
      return `month_${op.payload.monthKey}`;
    case 'save_user_profile':
      return 'user_profile';
    case 'save_initial_account_setup':
      return 'initial_account_setup';
  }
}

/**
 * Deletes that make every earlier pending save of the same target pointless: they remove the
 * target document (and, for movements and debts, every document that hangs from it).
 * `delete_or_reset_entry` is not one: a reset keeps the movement and does not remove the debt
 * payments an earlier save would have cleaned up.
 */
const SUPERSEDING_DELETES: ReadonlySet<QueuedWriteType> = new Set<QueuedWriteType>([
  'delete_entry_completely',
  'delete_concept',
  'delete_debt',
  'delete_financial_account',
  'delete_savings_bucket',
]);

/** Saves that may be folded into the previous pending write of the same target. */
const MERGEABLE_SAVES: ReadonlySet<QueuedWriteType> = new Set<QueuedWriteType>([
  'save_or_update_entry',
  'save_concept',
  'save_debt',
  'save_financial_account',
  'save_provision_plan',
  'save_savings_bucket',
  'save_user_profile',
  'save_initial_account_setup',
]);

function createOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * What must survive of a pending write once a superseding delete of its target arrives:
 * movement saves also wrote their concept, which the delete does not touch.
 */
function residueAfterDelete(op: QueuedWriteOperation): QueuedWriteOperation | null {
  if (
    (op.type === 'save_or_update_entry' || op.type === 'save_custom_concept_and_entry') &&
    op.payload.concept
  ) {
    return {
      id: createOperationId(),
      uid: op.uid,
      createdAtIso: op.createdAtIso,
      retryCount: 0,
      type: 'save_concept',
      payload: { concept: op.payload.concept },
    };
  }
  return null;
}

/**
 * Folds `next` into `previous` when replaying only the result is equivalent to replaying both.
 * Returns null when they must stay as two operations.
 */
function mergeSaves(
  previous: QueuedWriteOperation,
  next: QueuedWriteOperation
): QueuedWriteOperation | null {
  if (previous.type === 'save_or_update_entry' && next.type === 'save_or_update_entry') {
    return {
      ...next,
      payload: withoutUndefined({
        entry: next.payload.entry,
        concept: next.payload.concept ?? previous.payload.concept,
        debtPayments: next.payload.debtPayments ?? previous.payload.debtPayments,
      }),
    };
  }
  if (previous.type === 'save_custom_concept_and_entry' && next.type === 'save_or_update_entry') {
    return {
      ...next,
      type: 'save_custom_concept_and_entry',
      payload: withoutUndefined({
        concept: next.payload.concept ?? previous.payload.concept,
        entry: next.payload.entry,
        createdPayments: next.payload.debtPayments ?? previous.payload.createdPayments,
      }),
    };
  }
  if (previous.type === 'save_user_profile' && next.type === 'save_user_profile') {
    // An omitted photo means "unchanged": keep the pending one.
    return { ...next, payload: { ...previous.payload, ...next.payload } };
  }
  if (previous.type === next.type && MERGEABLE_SAVES.has(next.type)) {
    return next;
  }
  return null;
}

/**
 * Adds `incoming` to the queue (ADR 0035):
 * 1. A superseding delete removes the pending saves of its target (keeping their concept as
 *    `save_concept`) and goes to the end.
 * 2. A save right after a pending save of the same target replaces it (rapid consecutive edits).
 *    Only adjacent writes are merged, so no other operation can end up reordered around them.
 * 3. Everything else is appended: a save after a delete keeps FIFO order.
 */
function compactQueue(
  queue: readonly QueuedWriteOperation[],
  incoming: QueuedWriteOperation
): QueuedWriteOperation[] {
  const targetKey = getOperationTargetKey(incoming);
  if (targetKey === null) return [...queue, incoming];

  if (SUPERSEDING_DELETES.has(incoming.type)) {
    const next: QueuedWriteOperation[] = [];
    for (const op of queue) {
      if (getOperationTargetKey(op) !== targetKey) {
        next.push(op);
        continue;
      }
      const residue = residueAfterDelete(op);
      if (residue) next.push(residue);
    }
    next.push(incoming);
    return next;
  }

  const last = queue[queue.length - 1];
  if (last && getOperationTargetKey(last) === targetKey) {
    const merged = mergeSaves(last, incoming);
    if (merged) return [...queue.slice(0, -1), merged];
  }
  return [...queue, incoming];
}

/**
 * Appends a new operation to the user's persistent FIFO offline queue, compacting it per target.
 */
export function enqueueOfflineWrite(uid: string, operation: QueuedWriteRequest): QueuedWriteOperation {
  const newOp = {
    ...operation,
    id: createOperationId(),
    uid,
    createdAtIso: new Date().toISOString(),
    retryCount: 0,
  } as QueuedWriteOperation;

  saveOfflineWriteQueue(uid, compactQueue(loadOfflineWriteQueue(uid), newOp));
  return newOp;
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

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Determines whether a Firestore error is a permanent refusal (permission-denied, invalid-argument, unauthenticated)
 * where retrying will never succeed and optimistic rollback MUST be performed.
 * A Zod validation error (a document the mappers reject) is permanent too: retrying it would
 * block the queue forever.
 */
export function isPermanentCloudError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof z.ZodError || (error as { name?: unknown }).name === 'ZodError') {
    return true;
  }
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

// ---------------------------------------------------------------------------
// Optimistic write executor
// ---------------------------------------------------------------------------

export interface ExecuteCloudWriteOptions<T = void> {
  uid: string;
  operation: QueuedWriteRequest;
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
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.error('[CloudWrite Rejected]', error);
      }
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

// ---------------------------------------------------------------------------
// Draining
// ---------------------------------------------------------------------------

/**
 * Drains all pending operations in FIFO order against Firestore.
 * The queue is re-read before each operation, so a write replaced or removed by compaction while
 * another one was uploading is never replayed.
 * If an operation fails with a permanent error, it is discarded to prevent queue poison.
 * If an operation fails with a transient offline error, draining stops until the next reconnect attempt.
 * `discarded` counts stored operations dropped as invalid (see `loadOfflineWriteQueue`).
 */
let isDrainingQueue = false;

export function isOfflineQueueDraining(): boolean {
  return isDrainingQueue;
}

export interface DrainOfflineWriteQueueResult {
  processed: number;
  remaining: number;
  discarded: number;
}

export async function drainOfflineWriteQueue(
  uid: string,
  repo: FirestoreBudgetRepository
): Promise<DrainOfflineWriteQueueResult> {
  if (!uid || isDrainingQueue) {
    return { processed: 0, remaining: getPendingOfflineWritesCount(uid), discarded: 0 };
  }

  isDrainingQueue = true;
  let processed = 0;
  const attempted = new Set<string>();

  try {
    for (;;) {
      const op = loadOfflineWriteQueue(uid)[0];
      if (!op || attempted.has(op.id)) break;
      attempted.add(op.id);
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

  return {
    processed,
    remaining: getPendingOfflineWritesCount(uid),
    discarded: consumeDiscardedOfflineWritesCount(uid),
  };
}

async function executeQueuedOperation(
  uid: string,
  op: QueuedWriteOperation,
  repo: FirestoreBudgetRepository
): Promise<void> {
  switch (op.type) {
    case 'save_or_update_entry':
      await repo.saveOrUpdateEntry(
        uid,
        op.payload.entry,
        op.payload.concept,
        op.payload.debtPayments ?? []
      );
      return;
    case 'delete_or_reset_entry':
      await repo.deleteOrResetEntry(uid, op.payload.entryId, {
        entry: op.payload.entry,
        ...(op.payload.concept ? { concept: op.payload.concept } : {}),
      });
      return;
    case 'delete_entry_completely':
      await repo.deleteEntryCompletely(uid, op.payload.entryId);
      return;
    case 'save_custom_concept_and_entry':
      await repo.saveCustomConceptAndEntry(
        uid,
        op.payload.concept,
        op.payload.entry,
        op.payload.createdPayments ?? []
      );
      return;
    case 'save_concept':
      await repo.saveConcept(uid, op.payload.concept);
      return;
    case 'delete_concept':
      await repo.deleteConcept(uid, op.payload.conceptId);
      return;
    case 'save_debt':
      await repo.saveDebt(uid, op.payload.debt);
      return;
    case 'delete_debt':
      await repo.deleteDebt(uid, op.payload.debtId);
      return;
    case 'save_financial_account':
      await repo.saveFinancialAccount(uid, op.payload.account);
      return;
    case 'delete_financial_account':
      await repo.deleteFinancialAccount(uid, op.payload.accountId);
      return;
    case 'save_provision_plan':
      await repo.saveProvisionPlan(uid, op.payload.plan);
      return;
    case 'save_savings_bucket':
      // A queue saved before ADR 0037 may still hold an old bucket id.
      await repo.saveSavingsBucket(
        uid,
        migrateBucketId(op.payload.bucketId),
        op.payload.openingBalanceCop,
        op.payload.monthKey,
        op.payload.name
      );
      return;
    case 'delete_savings_bucket':
      await repo.deleteSavingsBucket(uid, migrateBucketId(op.payload.bucketId));
      return;
    case 'persist_month_close':
      await repo.persistMonthCloseResult(uid, op.payload.monthKey, op.payload.result);
      return;
    case 'reopen_month':
      await repo.reopenMonthInCloud(uid, op.payload.monthKey);
      return;
    case 'delete_month':
      await repo.deleteMonthInCloud(uid, op.payload.monthKey, op.payload.fallbackMonth);
      return;
    case 'save_user_profile':
      await repo.saveUserProfile(uid, {
        displayName: op.payload.displayName,
        financialGoal: op.payload.financialGoal,
        ...(typeof op.payload.photoUrl === 'string' ? { photoUrl: op.payload.photoUrl } : {}),
      });
      return;
    case 'save_initial_account_setup':
      await repo.saveInitialAccountSetup(uid, op.payload);
      return;
  }
}
