import type { DocumentReference, WriteBatch } from 'firebase/firestore';
import {
  MAX_CASCADE_WRITES_PER_BATCH,
  applyPendingSetWrites,
  chunkCascadeWrites,
  type CascadeWrite,
} from '../repositories/batchWrites';

const ref = (path: string) => ({ path }) as unknown as DocumentReference;

describe('batchWrites (CC-06)', () => {
  it('applies the collected sets to the real batch, stamped with its updatedAt', () => {
    const set = jest.fn();
    applyPendingSetWrites(
      { set } as unknown as WriteBatch,
      [
        { ref: ref('users/u/debts/a'), data: { id: 'a', openingBalance: 1, updatedAt: 'old' } },
        { ref: ref('users/u/savingsBuckets/b'), data: { id: 'b' } },
      ],
      '2026-11-27T00:00:00.000Z'
    );
    expect(set.mock.calls).toEqual([
      [ref('users/u/debts/a'), { id: 'a', openingBalance: 1, updatedAt: '2026-11-27T00:00:00.000Z' }],
      [ref('users/u/savingsBuckets/b'), { id: 'b', updatedAt: '2026-11-27T00:00:00.000Z' }],
    ]);
  });

  it('splits a cascade below the batch limit and keeps its order', () => {
    const writes: CascadeWrite[] = Array.from({ length: MAX_CASCADE_WRITES_PER_BATCH + 1 }, () => () => {});
    const chunks = chunkCascadeWrites(writes);
    expect(chunks.map((c) => c.length)).toEqual([MAX_CASCADE_WRITES_PER_BATCH, 1]);
    expect(chunks[1]![0]).toBe(writes[writes.length - 1]);
    expect(chunkCascadeWrites([])).toEqual([]);
    expect(chunkCascadeWrites(writes.slice(0, 5), 2).map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it('leaves no fake WriteBatch in the repository', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as { readFileSync: (p: string, enc: string) => string };
    const source = readFileSync('src/data/repositories/firestoreBudgetRepository.ts', 'utf8');
    expect(source).not.toMatch(/proxyBatch/);
    expect(source).not.toMatch(/as unknown as (ReturnType<typeof writeBatch>|WriteBatch)/);
  });
});
