/**
 * OPT-04 (plan consolidado, Fase 2): `addMonthEntry` reutiliza los movimientos del mes y los
 * conceptos que ya tiene quien llama, igual que `deleteOrResetEntry` (R-14). Cada pieza recibida
 * se salta su `getDocs`; el resultado es el mismo que leyendo de Firestore.
 */

import { getDocs, writeBatch } from 'firebase/firestore';
import {
  serializeConceptForFirestore,
  serializeMonthEntryForFirestore,
} from '../mappers/firestoreSchemas';
import { FirestoreBudgetRepository, InMemoryBudgetRepository } from '../repositories/budgetRepository';
import { buildSampleWorkspace } from '../sample/sampleWorkspace';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: jest.fn((_db, ...segments: string[]) => ({
    path: segments.join('/'),
    id: segments[segments.length - 1],
  })),
  query: jest.fn((col: { path: string }) => col),
  where: jest.fn(() => ({})),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  writeBatch: jest.fn(),
}));

jest.mock('../firebase/firebaseConfig', () => ({
  getFirebaseDb: jest.fn(() => ({})),
  getFirebaseAuth: jest.fn(() => ({})),
}));

jest.mock('../../platform/storage/accountCache', () => ({
  ...jest.requireActual('../../platform/storage/accountCache'),
  updatePersistedAccountRevision: jest.fn(),
}));

const uid = 'uid_add_entry';
const sample = buildSampleWorkspace();
const monthEntries = sample.entries.filter((e) => e.monthKey === '2026-10');
const input = {
  monthKey: '2026-10',
  conceptId: 'exp_other',
  actualAmount: 50_000,
  completedAt: '2026-10-28',
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDocs as jest.Mock).mockImplementation(async (ref: { path: string }) => {
    const docs = ref.path.endsWith('/concepts')
      ? sample.concepts.map((c) => ({ id: c.id, data: serializeConceptForFirestore(c) }))
      : monthEntries.map((e) => ({ id: e.id, data: serializeMonthEntryForFirestore(e) }));
    return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
  });
  (writeBatch as jest.Mock).mockImplementation(() => ({
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(async () => undefined),
  }));
});

describe('addMonthEntry con contexto del store (OPT-04)', () => {
  it('sin contexto lee el mes y los conceptos (2 getDocs)', async () => {
    await new FirestoreBudgetRepository().addMonthEntry(uid, input);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('con contexto no lee nada y crea el mismo movimiento', async () => {
    const repo = new FirestoreBudgetRepository();
    const fromCloud = await repo.addMonthEntry(uid, input);
    (getDocs as jest.Mock).mockClear();

    const fromContext = await repo.addMonthEntry(uid, input, {
      monthEntries,
      concepts: sample.concepts,
    });

    expect(getDocs).not.toHaveBeenCalled();
    expect(fromContext).toEqual(fromCloud);
  });

  it('con contexto parcial solo lee lo que falta', async () => {
    await new FirestoreBudgetRepository().addMonthEntry(uid, input, { concepts: sample.concepts });
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('InMemoryBudgetRepository acepta el mismo contexto', async () => {
    const repo = new InMemoryBudgetRepository();
    const created = await repo.addMonthEntry('local-demo', input, {
      monthEntries,
      concepts: sample.concepts,
    });
    expect(created).toMatchObject({ conceptId: 'exp_other', actualAmount: 50_000 });
  });
});
