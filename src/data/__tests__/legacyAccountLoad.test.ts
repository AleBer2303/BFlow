/**
 * ADR 0037: an account stored by an older build loads under the current names, and the load
 * writes its old documents again (fire-and-forget) so the old names disappear from Firestore.
 */

import { getDoc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { closeMonthAndRollover } from '../../domain/month-close/monthClose';
import {
  serializeConceptForFirestore,
  serializeMonthEntryForFirestore,
  serializeMonthSnapshotForFirestore,
  serializeProvisionPlanForFirestore,
} from '../mappers/firestoreSchemas';
import { FirestoreBudgetRepository } from '../repositories/budgetRepository';
import { buildSampleWorkspace } from '../sample/sampleWorkspace';

const DELETE_FIELD = { __op: 'deleteField' };

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  query: jest.fn((col: { path: string }) => col),
  where: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
  writeBatch: jest.fn(),
  deleteField: jest.fn(() => ({ __op: 'deleteField' })),
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

const uid = 'uid_legacy';
const base = `users/${uid}`;
let ops: RecordedOp[];
let collections: Map<string, Array<{ id: string; data: Record<string, unknown> }>>;
let documents: Map<string, Record<string, unknown>>;

function install(): void {
  ops = [];
  (writeBatch as jest.Mock).mockImplementation(() => {
    const batchOps: RecordedOp[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        batchOps.push({ kind: 'set', path: ref.path, data }),
      delete: (ref: { path: string }) => batchOps.push({ kind: 'delete', path: ref.path }),
      commit: async () => {
        ops.push(...batchOps);
      },
    };
  });
  (getDoc as jest.Mock).mockImplementation(async (ref: { path: string }) => {
    const data = documents.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  });
  (getDocs as jest.Mock).mockImplementation(async (col: { path: string }) => ({
    docs: (collections.get(col.path) ?? []).map(({ id, data }) => ({
      id,
      data: () => data,
      ref: { path: `${col.path}/${id}` },
    })),
  }));
}

/** The sample account as an older build stored it. */
function seedLegacyAccount(): void {
  const sample = buildSampleWorkspace();
  const snapshot = serializeMonthSnapshotForFirestore(
    closeMonthAndRollover({
      closingMonthKey: sample.monthKey,
      closedAtIso: '2026-11-01T00:00:00.000Z',
      concepts: sample.concepts,
      entries: sample.entries,
      debts: sample.debts,
      debtPayments: sample.debtPayments,
      savingsBuckets: sample.savingsBuckets,
    }).snapshot
  );
  const { reserveClosingBalance, ...closingSavings } = snapshot.closingSavings as Record<
    string,
    unknown
  >;

  const legacyConcepts = sample.concepts.map((concept) => {
    const raw = serializeConceptForFirestore(concept);
    const contribution = raw.savingsContribution as { bucketId: string } | undefined;
    return contribution?.bucketId === 'reserve'
      ? { ...raw, savingsContribution: { ...contribution, bucketId: 'moto' }, idealMotoCategoryKey: 'X' }
      : raw;
  });

  collections = new Map([
    [`${base}/concepts`, legacyConcepts.map((data) => ({ id: String(data.id), data }))],
    [
      `${base}/entries`,
      sample.entries.map((e) => ({ id: e.id, data: serializeMonthEntryForFirestore(e) })),
    ],
    [
      `${base}/savingsBuckets`,
      [
        { id: 'moto', data: { id: 'moto', name: 'Fondo', openingBalance: 1_600_000 } },
        { id: 'savings', data: { id: 'savings', name: 'Ahorros', openingBalance: 1_000_000 } },
      ],
    ],
    [
      `${base}/monthSnapshots`,
      [
        {
          id: sample.monthKey,
          data: {
            ...snapshot,
            closingSavings: { ...closingSavings, motoClosingBalance: reserveClosingBalance },
          },
        },
      ],
    ],
  ]);
  documents = new Map<string, Record<string, unknown>>([
    [
      base,
      {
        seededOctober2026: true,
        onboardingCompleted: true,
        activeMonthKey: '2026-11',
        dataRevision: 'rev_old',
      },
    ],
    [
      `${base}/provisionPlans/moto_ideal`,
      { id: 'moto_ideal', ...serializeProvisionPlanForFirestore(sample.provisionPlan) },
    ],
  ]);
}

describe('loading an account stored with the old names (ADR 0037)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedLegacyAccount();
    install();
  });

  it('hydrates it under the current names', async () => {
    const account = await new FirestoreBudgetRepository({} as Firestore).loadFullCloudAccount(uid);

    expect(account.savingsBucketsByMonth['2026-11']?.map((b) => b.id)).toEqual(['reserve', 'savings']);
    expect(account.closedSnapshots['2026-10']?.closingSavings.reserveClosingBalance).toBeGreaterThan(0);
    expect(account.concepts.find((c) => c.id === 'exp_fuel')?.savingsContribution?.bucketId).toBe(
      'reserve'
    );
    expect(account.provisionPlan.items).toHaveLength(buildSampleWorkspace().provisionPlan.items.length);
    expect(account.needsOnboarding).toBe(false);
  });

  it('writes the old documents again under the current names and removes the old ones', async () => {
    await new FirestoreBudgetRepository({} as Firestore).loadFullCloudAccount(uid);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const paths = ops.map((op) => `${op.kind} ${op.path}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        `set ${base}/savingsBuckets/reserve`,
        `delete ${base}/savingsBuckets/moto`,
        `set ${base}/provisionPlans/default`,
        `delete ${base}/provisionPlans/moto_ideal`,
        `set ${base}/concepts/exp_fuel`,
        `set ${base}/concepts/exp_reserve_contribution`,
        `set ${base}/monthSnapshots/2026-10`,
      ])
    );
    // Concepts without old names are not written again.
    expect(paths).not.toContain(`set ${base}/concepts/inc_salary`);

    const fuel = ops.find((op) => op.path === `${base}/concepts/exp_fuel`)?.data;
    expect(fuel).toMatchObject({ savingsContribution: { bucketId: 'reserve' }, provisionCategoryKey: 'X' });
    expect(fuel).not.toHaveProperty('idealMotoCategoryKey');

    const closedMonth = ops.find((op) => op.path === `${base}/monthSnapshots/2026-10`)?.data;
    expect(closedMonth?.closingSavings).not.toHaveProperty('motoClosingBalance');

    const userWrites = ops.filter((op) => op.path === base);
    expect(userWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ seededOctober2026: DELETE_FIELD }) }),
      ])
    );
  });

  it('writes nothing extra for an account that already uses the current names', async () => {
    const sample = buildSampleWorkspace();
    collections.set(
      `${base}/concepts`,
      sample.concepts.map((c) => ({ id: c.id, data: serializeConceptForFirestore(c) }))
    );
    collections.set(`${base}/savingsBuckets`, [
      { id: 'reserve', data: { id: 'reserve', name: 'Fondo', openingBalance: 1_600_000 } },
    ]);
    collections.set(`${base}/monthSnapshots`, []);
    documents = new Map<string, Record<string, unknown>>([
      [base, { onboardingCompleted: true, activeMonthKey: '2026-10', dataRevision: 'rev_new' }],
      [`${base}/provisionPlans/default`, { id: 'default', ...serializeProvisionPlanForFirestore(sample.provisionPlan) }],
    ]);

    await new FirestoreBudgetRepository({} as Firestore).loadFullCloudAccount(uid);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ops).toEqual([]);
    expect((getDoc as jest.Mock).mock.calls.map(([ref]) => ref.path)).not.toContain(
      `${base}/provisionPlans/moto_ideal`
    );
  });
});
