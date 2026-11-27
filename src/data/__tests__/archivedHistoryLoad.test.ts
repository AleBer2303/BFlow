/**
 * Carga acotada del historial (ADR 0028): con más de 12 meses cerrados en la caché,
 * `loadFullCloudAccount` no vuelve a descargar los `entries` de los meses antiguos, y
 * descarga todo en cuanto la nube deja de coincidir con la caché.
 */

import { getCountFromServer, getDoc, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { closeMonthAndRollover } from '../../domain/month-close/monthClose';
import type { MonthEntry } from '../../domain/models/types';
import {
  serializeConceptForFirestore,
  serializeMonthEntryForFirestore,
  serializeMonthSnapshotForFirestore,
} from '../mappers/firestoreSchemas';
import {
  FirestoreBudgetRepository,
  type FullCloudAccountData,
} from '../repositories/budgetRepository';
import { buildSampleWorkspace } from '../sample/sampleWorkspace';

interface MockConstraint {
  field: string;
  op: '==' | '<' | '>' | '>=';
  value: string;
}
interface MockQuery {
  path: string;
  constraints: MockConstraint[];
}
interface MockDoc {
  id: string;
  data: Record<string, unknown>;
}

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...segments: string[]) => ({ path: segments.join('/'), constraints: [] })),
  doc: jest.fn((_db, ...segments: string[]) => ({
    path: segments.join('/'),
    id: segments[segments.length - 1],
  })),
  query: jest.fn((colRef: { path: string }, ...constraints: unknown[]) => ({
    path: colRef.path,
    constraints,
  })),
  where: jest.fn((field: string, op: string, value: string) => ({ field, op, value })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
  writeBatch: jest.fn(),
}));

jest.mock('../firebase/firebaseConfig', () => ({
  getFirebaseDb: jest.fn(() => ({})),
  getFirebaseAuth: jest.fn(() => ({})),
}));

const UID = 'uid_history';
const EMAIL = 'history@example.com';
const ENTRIES_PATH = `users/${UID}/entries`;
const SNAPSHOTS_PATH = `users/${UID}/monthSnapshots`;
const OLD_WRITE_ISO = '2025-01-01T00:00:00.000Z';

/** 2025-01 … 2026-08: 19 meses cerrados y el último abierto. */
const MONTHS = Array.from({ length: 20 }, (_, index) => {
  const year = 2025 + Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
});
const CLOSED_MONTHS = MONTHS.slice(0, -1);
/** Con 19 cerrados y una ventana de 12, los 7 primeros son el historial archivado. */
const CUTOFF_MONTH = '2025-08';

const seed = buildSampleWorkspace();
const ENTRIES_PER_MONTH = seed.entries.length;

function matches(data: Record<string, unknown>, constraint: MockConstraint): boolean {
  const value = data[constraint.field];
  if (typeof value !== 'string') return false;
  if (constraint.op === '==') return value === constraint.value;
  if (constraint.op === '<') return value < constraint.value;
  if (constraint.op === '>') return value > constraint.value;
  return value >= constraint.value;
}

interface MockCloud {
  collections: Map<string, MockDoc[]>;
  /** Consultas a `entries`, con sus filtros, en orden. */
  entryQueries: MockConstraint[][];
  entryDocsRead: number;
  countCalls: number;
}

function createCloud(): MockCloud {
  const cloud: MockCloud = {
    collections: new Map(),
    entryQueries: [],
    entryDocsRead: 0,
    countCalls: 0,
  };

  const entries: MonthEntry[] = MONTHS.flatMap((monthKey) =>
    seed.entries.map((entry) => ({ ...entry, id: `${monthKey}_${entry.conceptId}`, monthKey }))
  );
  cloud.collections.set(
    `users/${UID}/concepts`,
    seed.concepts.map((c) => ({ id: c.id, data: serializeConceptForFirestore(c) }))
  );
  cloud.collections.set(
    ENTRIES_PATH,
    entries.map((e) => ({
      id: e.id,
      data: { ...serializeMonthEntryForFirestore(e), updatedAt: OLD_WRITE_ISO },
    }))
  );
  cloud.collections.set(
    SNAPSHOTS_PATH,
    CLOSED_MONTHS.map((monthKey) => ({
      id: monthKey,
      data: serializeMonthSnapshotForFirestore(
        closeMonthAndRollover({
          closingMonthKey: monthKey,
          closedAtIso: `${monthKey}-28T23:00:00.000Z`,
          concepts: seed.concepts,
          entries: entries.filter((e) => e.monthKey === monthKey),
          debts: [],
          savingsBuckets: [],
        }).snapshot
      ),
    }))
  );

  const read = (target: MockQuery): MockDoc[] =>
    (cloud.collections.get(target.path) ?? []).filter((item) =>
      target.constraints.every((constraint) => matches(item.data, constraint))
    );

  (getDoc as jest.Mock).mockImplementation(async (ref: { path: string }) => {
    const data =
      ref.path === `users/${UID}`
        ? {
            uid: UID,
            email: EMAIL,
            onboardingCompleted: true,
            activeMonthKey: MONTHS[MONTHS.length - 1],
            dataRevision: 'rev-cloud',
          }
        : undefined;
    return { exists: () => data !== undefined, data: () => data, id: ref.path.split('/').pop(), ref };
  });
  (getDocs as jest.Mock).mockImplementation(async (target: MockQuery) => {
    const items = read(target);
    if (target.path === ENTRIES_PATH) {
      cloud.entryQueries.push(target.constraints);
      // Firestore cobra 1 lectura por documento devuelto, o 1 si la consulta no devuelve nada.
      cloud.entryDocsRead += Math.max(1, items.length);
    }
    return {
      docs: items.map((item) => ({
        id: item.id,
        data: () => item.data,
        ref: { path: `${target.path}/${item.id}`, id: item.id },
      })),
    };
  });
  (getCountFromServer as jest.Mock).mockImplementation(async (target: MockQuery) => {
    cloud.countCalls += 1;
    return { data: () => ({ count: read(target).length }) };
  });
  (writeBatch as jest.Mock).mockImplementation(() => ({
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(async () => undefined),
  }));

  return cloud;
}

function resetReadCounters(cloud: MockCloud): void {
  cloud.entryQueries = [];
  cloud.entryDocsRead = 0;
  cloud.countCalls = 0;
}

function entryDoc(cloud: MockCloud, entryId: string): MockDoc {
  const found = (cloud.collections.get(ENTRIES_PATH) ?? []).find((item) => item.id === entryId);
  if (!found) throw new Error(`entry ${entryId} not found`);
  return found;
}

function sortedById(entries: readonly MonthEntry[]): MonthEntry[] {
  return [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Todo lo que devuelve la carga salvo la marca de tiempo, con los entries en orden estable. */
function comparable(account: FullCloudAccountData) {
  const { historySyncedAt: _historySyncedAt, entries, ...rest } = account;
  return { ...rest, entries: sortedById(entries) };
}

describe('loadFullCloudAccount con historial archivado (ADR 0028)', () => {
  let cloud: MockCloud;
  let repo: FirestoreBudgetRepository;
  let cached: FullCloudAccountData;

  const reload = () =>
    repo.loadFullCloudAccount(UID, EMAIL, { forceFullSync: true, cachedAccount: cached });

  beforeEach(async () => {
    jest.clearAllMocks();
    cloud = createCloud();
    repo = new FirestoreBudgetRepository({} as unknown as Firestore);
    cached = await repo.loadFullCloudAccount(UID, EMAIL);
    resetReadCounters(cloud);
  });

  it('la primera carga (sin caché) descarga la colección completa y deja la marca de sincronización', async () => {
    const fresh = createCloud();
    const first = await repo.loadFullCloudAccount(UID, EMAIL);

    expect(fresh.entryQueries).toEqual([[]]);
    expect(fresh.entryDocsRead).toBe(MONTHS.length * ENTRIES_PER_MONTH);
    expect(fresh.countCalls).toBe(0);
    expect(first.entries).toHaveLength(MONTHS.length * ENTRIES_PER_MONTH);
    expect(Number.isNaN(Date.parse(first.historySyncedAt ?? ''))).toBe(false);
  });

  it('con la caché al día solo descarga los meses recientes y devuelve lo mismo que una carga completa', async () => {
    const bounded = await reload();

    expect(cloud.entryQueries).toHaveLength(2);
    expect(cloud.entryQueries).toContainEqual([{ field: 'monthKey', op: '>=', value: CUTOFF_MONTH }]);
    expect(cloud.entryQueries).toContainEqual([
      expect.objectContaining({ field: 'updatedAt', op: '>' }),
    ]);
    expect(cloud.countCalls).toBe(1);
    // 13 meses recientes + 1 (consulta de cambios vacía), frente a los 20 meses de antes.
    const recentMonths = MONTHS.filter((monthKey) => monthKey >= CUTOFF_MONTH).length;
    expect(cloud.entryDocsRead).toBe(recentMonths * ENTRIES_PER_MONTH + 1);
    expect(cloud.entryDocsRead).toBeLessThan(MONTHS.length * ENTRIES_PER_MONTH);

    expect(comparable(bounded)).toEqual(comparable(cached));
  });

  it('aplica un cambio hecho desde otro dispositivo en un mes archivado', async () => {
    const edited = entryDoc(cloud, `2025-03_${seed.entries[0]!.conceptId}`);
    edited.data = { ...edited.data, actualAmount: 987_654, updatedAt: new Date().toISOString() };

    const bounded = await reload();

    expect(cloud.entryQueries).toHaveLength(2);
    expect(bounded.entries.find((e) => e.id === edited.id)?.actualAmount).toBe(987_654);
    expect(bounded.entries).toHaveLength(MONTHS.length * ENTRIES_PER_MONTH);
  });

  it('si otro dispositivo borró un movimiento archivado, el conteo no cuadra y descarga todo', async () => {
    const removedId = `2025-02_${seed.entries[0]!.conceptId}`;
    cloud.collections.set(
      ENTRIES_PATH,
      (cloud.collections.get(ENTRIES_PATH) ?? []).filter((item) => item.id !== removedId)
    );

    const reloaded = await reload();

    expect(cloud.entryQueries).toContainEqual([]);
    expect(reloaded.entries.some((e) => e.id === removedId)).toBe(false);
    expect(reloaded.entries).toHaveLength(MONTHS.length * ENTRIES_PER_MONTH - 1);
  });

  it('si un mes archivado se reabrió (ya no tiene snapshot), descarga todo', async () => {
    cloud.collections.set(
      SNAPSHOTS_PATH,
      (cloud.collections.get(SNAPSHOTS_PATH) ?? []).filter((item) => item.id !== '2025-02')
    );

    const reloaded = await reload();

    expect(cloud.entryQueries).toContainEqual([]);
    expect(reloaded.closedSnapshots['2025-02']).toBeUndefined();
    expect(reloaded.entries).toHaveLength(MONTHS.length * ENTRIES_PER_MONTH);
  });

  it('si el snapshot de un mes archivado cambió (se reabrió y se volvió a cerrar), descarga todo', async () => {
    const snapshots = cloud.collections.get(SNAPSHOTS_PATH) ?? [];
    const reclosed = snapshots.find((item) => item.id === '2025-04');
    if (!reclosed) throw new Error('snapshot not found');
    reclosed.data = { ...reclosed.data, closedAtIso: '2026-08-01T10:00:00.000Z' };

    await reload();

    expect(cloud.entryQueries).toContainEqual([]);
  });

  it('si el conteo no se puede leer, descarga todo', async () => {
    (getCountFromServer as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));

    const reloaded = await reload();

    expect(cloud.entryQueries).toContainEqual([]);
    expect(comparable(reloaded)).toEqual(comparable(cached));
  });

  it('una caché sin marca de sincronización (versión anterior) descarga todo', async () => {
    const { historySyncedAt: _historySyncedAt, ...legacyCache } = cached;
    cached = legacyCache;

    await reload();

    expect(cloud.entryQueries).toEqual([[]]);
    expect(cloud.countCalls).toBe(0);
  });

  it('con 12 meses cerrados o menos no cambia nada: una sola lectura de la colección', async () => {
    const recentClosed = new Set(CLOSED_MONTHS.slice(-12));
    cached = {
      ...cached,
      closedSnapshots: Object.fromEntries(
        Object.entries(cached.closedSnapshots).filter(([monthKey]) => recentClosed.has(monthKey))
      ),
    };

    await reload();

    expect(cloud.entryQueries).toEqual([[]]);
    expect(cloud.countCalls).toBe(0);
  });
});
