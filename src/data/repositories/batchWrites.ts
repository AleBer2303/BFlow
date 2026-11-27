/**
 * src/data/repositories/batchWrites.ts
 *
 * Writes that are decided before their `WriteBatch` exists. The repository only commits through
 * `commitUserDataMutationBatch` (ADR 0018), so anything read beforehand is collected here and
 * applied to the real batch inside it (CC-06: no fake batch objects).
 */

import type { DocumentData, DocumentReference, WriteBatch } from 'firebase/firestore';

/** A `set` collected before the batch exists; `updatedAt` is stamped when it is applied. */
export interface PendingSetWrite {
  ref: DocumentReference;
  data: DocumentData;
}

/** Applies the collected writes to the real batch, all stamped with the batch's `updatedAt`. */
export function applyPendingSetWrites(
  batch: Pick<WriteBatch, 'set'>,
  writes: readonly PendingSetWrite[],
  updatedAt: string
): void {
  for (const write of writes) {
    batch.set(write.ref, { ...write.data, updatedAt });
  }
}

/** One write of a cascade delete, applied inside `commitUserDataMutationBatch`. */
export type CascadeWrite = (batch: WriteBatch, updatedAt: string) => void;

/**
 * Firestore accepts 500 writes per batch and `commitUserDataMutationBatch` adds the
 * `users/{uid}` write, so cascades are split well below that (ADR 0035).
 */
export const MAX_CASCADE_WRITES_PER_BATCH = 450;

/**
 * Splits a cascade into batches. The main delete goes last in `writes`, so it lands in the last
 * batch: if a batch fails, the target still exists and replaying the operation finishes the job.
 */
export function chunkCascadeWrites(
  writes: readonly CascadeWrite[],
  maxPerBatch: number = MAX_CASCADE_WRITES_PER_BATCH
): CascadeWrite[][] {
  const chunks: CascadeWrite[][] = [];
  for (let i = 0; i < writes.length; i += maxPerBatch) {
    chunks.push(writes.slice(i, i + maxPerBatch));
  }
  return chunks;
}
