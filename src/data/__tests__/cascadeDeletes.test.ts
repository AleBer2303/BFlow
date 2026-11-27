/**
 * src/data/__tests__/cascadeDeletes.test.ts
 *
 * BUG-04 y BUG-03 (Fase 1 del plan consolidado, ADR 0035):
 * - `deleteDebt` quita `defaultTargetDebtId` de los conceptos y borra los `debtPayments` de la deuda.
 * - `deleteSavingsBucket` quita `savingsContribution` de los conceptos que apuntan al fondo.
 * - Todo va en el mismo `writeBatch` mientras quepa; si no, en lotes por debajo de 500 operaciones,
 *   con el borrado principal en el último.
 * - `saveInitialAccountSetup` se puede repetir sin duplicar documentos.
 */

import { deleteField, getDocs, writeBatch } from 'firebase/firestore';
import type { DebtPayment } from '../../domain';
import {
  FirestoreBudgetRepository,
  InMemoryBudgetRepository,
  type InitialAccountSetupPayload,
} from '../repositories/budgetRepository';

const DELETE_FIELD = { __op: 'deleteField' };

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: jest.fn((_db, ...segments: string[]) => ({
    path: segments.join('/'),
    id: segments[segments.length - 1],
  })),
  query: jest.fn((col: { path: string }, ...constraints: unknown[]) => ({
    path: col.path,
    constraints,
  })),
  where: jest.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  writeBatch: jest.fn(),
  deleteField: jest.fn(() => ({ __op: 'deleteField' })),
}));

jest.mock('../firebase/firebaseConfig', () => ({
  getFirebaseDb: jest.fn(() => ({})),
  getFirebaseAuth: jest.fn(() => ({})),
}));

jest.mock('../../platform/storage/accountCache', () => ({
  ...jest.requireActual('../../platform/storage/accountCache'),
  updatePersistedAccountRevision: jest.fn(),
}));

interface RecordedOp {
  kind: 'set' | 'update' | 'delete';
  path: string;
  data?: Record<string, unknown>;
}

interface StoredDoc {
  id: string;
  data: Record<string, unknown>;
}

const uid = 'uid_cascade';
let collections: Map<string, StoredDoc[]>;
let batches: RecordedOp[][];

function readField(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>(
    (value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined),
    data
  );
}

beforeEach(() => {
  collections = new Map();
  batches = [];
  (getDocs as jest.Mock).mockImplementation(
    async (q: { path: string; constraints?: Array<{ field: string; value: unknown }> }) => {
      const docs = (collections.get(q.path) ?? []).filter((d) =>
        (q.constraints ?? []).every((c) => readField(d.data, c.field) === c.value)
      );
      return {
        docs: docs.map((d) => ({
          id: d.id,
          ref: { path: `${q.path}/${d.id}`, id: d.id },
          data: () => d.data,
        })),
      };
    }
  );
  (writeBatch as jest.Mock).mockImplementation(() => {
    const ops: RecordedOp[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        ops.push({ kind: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        ops.push({ kind: 'update', path: ref.path, data }),
      delete: (ref: { path: string }) => ops.push({ kind: 'delete', path: ref.path }),
      commit: async () => {
        batches.push(ops);
      },
    };
  });
});

function seedCollection(name: string, docs: StoredDoc[]): void {
  collections.set(`users/${uid}/${name}`, docs);
}

function payment(id: string, debtId: string): StoredDoc {
  return { id, data: { id, debtId, entryId: `entry_${id}`, monthKey: '2026-10' } };
}

describe('FirestoreBudgetRepository · borrados en cascada', () => {
  it('deleteDebt limpia conceptos y abonos de la deuda en el mismo lote', async () => {
    seedCollection('concepts', [
      { id: 'c_cuota', data: { id: 'c_cuota', defaultTargetDebtId: 'debt_1' } },
      { id: 'c_otro', data: { id: 'c_otro', defaultTargetDebtId: 'debt_2' } },
    ]);
    seedCollection('debtPayments', [payment('p1', 'debt_1'), payment('p2', 'debt_2')]);

    await new FirestoreBudgetRepository().deleteDebt(uid, 'debt_1');

    expect(batches).toHaveLength(1);
    const ops = batches[0] ?? [];
    expect(ops).toEqual(
      expect.arrayContaining([
        { kind: 'delete', path: `users/${uid}/debtPayments/p1` },
        {
          kind: 'update',
          path: `users/${uid}/concepts/c_cuota`,
          data: { defaultTargetDebtId: DELETE_FIELD, updatedAt: expect.any(String) },
        },
        { kind: 'delete', path: `users/${uid}/debts/debt_1` },
      ])
    );
    expect(ops.some((op) => op.path.endsWith('/p2') || op.path.endsWith('/c_otro'))).toBe(false);
    expect(deleteField).toHaveBeenCalled();
  });

  it('deleteDebt reparte en lotes de menos de 500 operaciones y borra la deuda en el último', async () => {
    seedCollection(
      'debtPayments',
      Array.from({ length: 1_000 }, (_, i) => payment(`p${i}`, 'debt_big'))
    );

    await new FirestoreBudgetRepository().deleteDebt(uid, 'debt_big');

    expect(batches.length).toBeGreaterThan(1);
    for (const ops of batches) {
      expect(ops.length).toBeLessThan(500);
    }
    const deletedPayments = batches.flat().filter((op) => op.path.includes('/debtPayments/'));
    expect(deletedPayments).toHaveLength(1_000);
    const last = batches[batches.length - 1] ?? [];
    expect(last.some((op) => op.path === `users/${uid}/debts/debt_big`)).toBe(true);
    const earlier = batches.slice(0, -1).flat();
    expect(earlier.some((op) => op.path === `users/${uid}/debts/debt_big`)).toBe(false);
  });

  it('deleteSavingsBucket quita savingsContribution de los conceptos del fondo en el mismo lote', async () => {
    seedCollection('concepts', [
      {
        id: 'c_moto',
        data: { id: 'c_moto', savingsContribution: { bucketId: 'moto', onlyWhenCompleted: true } },
      },
      {
        id: 'c_ahorro',
        data: {
          id: 'c_ahorro',
          savingsContribution: { bucketId: 'savings', onlyWhenCompleted: true },
        },
      },
    ]);

    await new FirestoreBudgetRepository().deleteSavingsBucket(uid, 'moto');

    expect(batches).toHaveLength(1);
    const ops = batches[0] ?? [];
    expect(ops).toEqual(
      expect.arrayContaining([
        {
          kind: 'update',
          path: `users/${uid}/concepts/c_moto`,
          data: { savingsContribution: DELETE_FIELD, updatedAt: expect.any(String) },
        },
        { kind: 'delete', path: `users/${uid}/savingsBuckets/moto` },
      ])
    );
    expect(ops.some((op) => op.path.endsWith('/c_ahorro'))).toBe(false);
  });

  it('saveInitialAccountSetup es idempotente: repetirlo escribe los mismos documentos', async () => {
    const seed = await new InMemoryBudgetRepository().loadFullCloudAccount('local-owner');
    const payload: InitialAccountSetupPayload = {
      monthKey: '2026-11',
      concepts: seed.concepts,
      entries: seed.entries,
      debts: seed.debtsByMonth['2026-10'] ?? [],
      debtPayments: seed.debtPayments,
      savingsBuckets: [],
      provisionPlan: { items: [], recurringMonthlyTotalCop: 0, totalWithTargetGoalCop: 0 },
    };
    const repo = new FirestoreBudgetRepository();

    await repo.saveInitialAccountSetup(uid, payload);
    await repo.saveInitialAccountSetup(uid, payload);

    const paths = (ops: RecordedOp[]) =>
      ops.map((op) => `${op.kind}:${op.path}`).sort();
    expect(batches).toHaveLength(2);
    expect(paths(batches[1] ?? [])).toEqual(paths(batches[0] ?? []));
    expect((batches[0] ?? []).every((op) => op.kind !== 'update')).toBe(true);
  });
});

describe('InMemoryBudgetRepository · misma limpieza en cascada', () => {
  it('borra abonos y vínculos de una deuda y de un fondo', async () => {
    const repo = new InMemoryBudgetRepository();
    const before = await repo.loadFullCloudAccount('local-owner');
    const debtConcept = before.concepts.find((c) => c.defaultTargetDebtId);
    const savingsConcept = before.concepts.find((c) => c.savingsContribution);
    const debtId = debtConcept?.defaultTargetDebtId;
    const bucketId = savingsConcept?.savingsContribution?.bucketId;
    if (!debtId || !bucketId) throw new Error('Expected seeded links');
    const extraPayment: DebtPayment = {
      id: 'p_extra',
      entryId: 'entry_extra',
      monthKey: '2026-10',
      debtId,
      principalAmount: 1,
      interestAmount: 0,
      totalApplied: 1,
      active: true,
    };
    await repo.saveOrUpdateEntry(uid, before.entries[0]!, undefined, [extraPayment]);

    await repo.deleteDebt(uid, debtId);
    await repo.deleteSavingsBucket(uid, bucketId);

    const after = await repo.loadFullCloudAccount('local-owner');
    expect(after.concepts.some((c) => c.defaultTargetDebtId === debtId)).toBe(false);
    expect(after.concepts.some((c) => c.savingsContribution?.bucketId === bucketId)).toBe(false);
    expect(after.debtPayments.some((dp) => dp.debtId === debtId)).toBe(false);
  });
});
