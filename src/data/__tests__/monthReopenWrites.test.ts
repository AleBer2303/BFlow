/**
 * CC-06: reopening or deleting a month restores the balances of its closed snapshot in the same
 * batch that deletes the snapshot, through the typed write collector (no fake WriteBatch).
 */

import { getDoc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { closeMonthAndRollover } from '../../domain/month-close/monthClose';
import {
  serializeConceptForFirestore,
  serializeDebtForFirestore,
  serializeMonthEntryForFirestore,
  serializeMonthSnapshotForFirestore,
  serializeSavingsBucketForFirestore,
} from '../mappers/firestoreSchemas';
import { FirestoreBudgetRepository } from '../repositories/budgetRepository';
import { buildSampleWorkspace } from '../sample/sampleWorkspace';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  query: jest.fn((col: { path: string }) => col),
  where: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  writeBatch: jest.fn(),
}));
jest.mock('../firebase/firebaseConfig', () => ({ getFirebaseDb: jest.fn(() => ({})) }));
jest.mock('../../platform/storage/accountCache', () => ({
  ...jest.requireActual('../../platform/storage/accountCache'),
  updatePersistedAccountRevision: jest.fn(),
}));

interface RecordedOp {
  kind: 'set' | 'delete';
  path: string;
  data?: Record<string, unknown>;
}

const uid = 'uid_reopen';
let batches: RecordedOp[][];
let collections: Map<string, Array<Record<string, unknown>>>;
let documents: Map<string, Record<string, unknown>>;

function installFirestore(options: { failReads?: boolean } = {}): void {
  batches = [];
  (writeBatch as jest.Mock).mockImplementation(() => {
    const ops: RecordedOp[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        ops.push({ kind: 'set', path: ref.path, data }),
      delete: (ref: { path: string }) => ops.push({ kind: 'delete', path: ref.path }),
      commit: async () => {
        batches.push(ops);
      },
    };
  });
  (getDoc as jest.Mock).mockImplementation(async (ref: { path: string }) => {
    if (options.failReads) throw new Error('offline');
    const data = documents.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  });
  (getDocs as jest.Mock).mockImplementation(async (col: { path: string }) => {
    if (options.failReads) throw new Error('offline');
    return {
      docs: (collections.get(col.path) ?? []).map((data) => ({
        data: () => data,
        ref: { path: `${col.path}/${String(data.id)}` },
      })),
    };
  });
}

function closeSampleMonthFixture(): void {
  const sample = buildSampleWorkspace();
  const closed = closeMonthAndRollover({
    closingMonthKey: '2026-10',
    closedAtIso: '2026-11-01T00:00:00.000Z',
    concepts: sample.concepts,
    entries: sample.entries,
    debts: sample.debts,
    debtPayments: sample.debtPayments,
    savingsBuckets: sample.savingsBuckets,
  });
  const base = `users/${uid}`;
  collections = new Map([
    [`${base}/concepts`, sample.concepts.map(serializeConceptForFirestore)],
    [`${base}/entries`, sample.entries.map(serializeMonthEntryForFirestore)],
    [`${base}/debts`, closed.nextMonthDebts.map(serializeDebtForFirestore)],
    [
      `${base}/savingsBuckets`,
      closed.nextMonthSavingsBuckets.map((b) =>
        serializeSavingsBucketForFirestore({ ...b, monthKey: '2026-11' })
      ),
    ],
  ]);
  documents = new Map([
    [`${base}/monthSnapshots/2026-10`, serializeMonthSnapshotForFirestore(closed.snapshot)],
  ]);
}

describe('reopen / delete month restore writes (CC-06)', () => {
  beforeEach(() => closeSampleMonthFixture());

  it('reopens a month restoring its October balances in the same batch as the snapshot delete', async () => {
    installFirestore();
    await new FirestoreBudgetRepository({} as Firestore).reopenMonthInCloud(uid, '2026-10');

    expect(batches).toHaveLength(1);
    const ops = batches[0]!;
    const userWrite = ops.find((op) => op.path === `users/${uid}`);
    const debtWrites = ops.filter((op) => op.path.startsWith(`users/${uid}/debts/`));
    const bucketWrites = ops.filter((op) => op.path.startsWith(`users/${uid}/savingsBuckets/`));

    const sampleDebts = buildSampleWorkspace().debts;
    expect(debtWrites.map((op) => [op.path.split('/').pop(), op.data?.openingBalance])).toEqual(
      sampleDebts.map((d) => [d.id, d.openingBalance])
    );
    expect(bucketWrites.length).toBeGreaterThan(0);
    for (const op of [...debtWrites, ...bucketWrites]) {
      expect(op.data?.monthKey).toBe('2026-10');
      expect(op.data?.updatedAt).toBe(userWrite?.data?.updatedAt);
    }
    expect(ops).toContainEqual({ kind: 'delete', path: `users/${uid}/monthSnapshots/2026-10` });
    expect(userWrite?.data?.activeMonthKey).toBe('2026-10');
  });

  it('deletes a month restoring the fallback month balances', async () => {
    installFirestore();
    await new FirestoreBudgetRepository({} as Firestore).deleteMonthInCloud(uid, '2026-11', '2026-10');

    const ops = batches[0]!;
    expect(ops.some((op) => op.kind === 'set' && op.path.startsWith(`users/${uid}/debts/`))).toBe(true);
    expect(ops).toContainEqual({ kind: 'delete', path: `users/${uid}/monthSnapshots/2026-11` });
    expect(ops).toContainEqual({ kind: 'delete', path: `users/${uid}/monthSnapshots/2026-10` });
  });

  it('still reopens when the restore reads fail offline, with no balance writes', async () => {
    installFirestore({ failReads: true });
    await new FirestoreBudgetRepository({} as Firestore).reopenMonthInCloud(uid, '2026-10');

    expect(batches[0]!.map((op) => `${op.kind} ${op.path}`)).toEqual([
      `delete users/${uid}/monthSnapshots/2026-10`,
      `set users/${uid}`,
    ]);
  });

  it('writes no balances when the month has no snapshot', async () => {
    installFirestore();
    documents.clear();
    await new FirestoreBudgetRepository({} as Firestore).reopenMonthInCloud(uid, '2026-10');

    expect(batches[0]!.filter((op) => op.kind === 'set')).toHaveLength(1);
  });
});
