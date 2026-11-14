import type { MonthEntry, MonthSnapshot } from '../../domain/models/types';
import {
  HISTORY_CLOCK_SKEW_MARGIN_MS,
  planArchivedHistory,
  resolveArchivedEntries,
  type ArchivedHistoryPlan,
  type CachedHistory,
} from '../repositories/historyWindow';

const SYNCED_AT = '2026-08-10T12:00:00.000Z';

function months(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const year = 2025 + Math.floor(index / 12);
    return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

function snapshot(monthKey: string, closedAtIso = `${monthKey}-28T23:00:00.000Z`): MonthSnapshot {
  return { monthKey, closedAtIso } as unknown as MonthSnapshot;
}

function entry(monthKey: string, conceptId = 'rent', actualAmount = 100): MonthEntry {
  return { id: `${monthKey}_${conceptId}`, monthKey, conceptId, actualAmount } as unknown as MonthEntry;
}

function cachedHistory(closedCount: number, overrides: Partial<CachedHistory> = {}): CachedHistory {
  const all = months(closedCount + 1);
  const closed = all.slice(0, closedCount);
  return {
    availableMonths: all,
    entries: all.map((monthKey) => entry(monthKey)),
    closedSnapshots: Object.fromEntries(closed.map((monthKey) => [monthKey, snapshot(monthKey)])),
    historySyncedAt: SYNCED_AT,
    ...overrides,
  };
}

describe('planArchivedHistory', () => {
  it('sin caché, sin marca o con una marca ilegible descarga todo', () => {
    expect(planArchivedHistory(null)).toBeNull();
    expect(planArchivedHistory(undefined)).toBeNull();
    expect(planArchivedHistory(cachedHistory(20, { historySyncedAt: undefined }))).toBeNull();
    expect(planArchivedHistory(cachedHistory(20, { historySyncedAt: 'ayer' }))).toBeNull();
  });

  it('con 12 meses cerrados o menos descarga todo', () => {
    expect(planArchivedHistory(cachedHistory(0))).toBeNull();
    expect(planArchivedHistory(cachedHistory(12))).toBeNull();
  });

  it('con 13 meses cerrados archiva solo el más antiguo', () => {
    expect(planArchivedHistory(cachedHistory(13))?.cutoffMonthKey).toBe('2025-02');
  });

  it('conserva siempre los últimos 12 meses cerrados dentro de la descarga', () => {
    const plan = planArchivedHistory(cachedHistory(19));
    expect(plan?.cutoffMonthKey).toBe('2025-08');
    expect(plan?.changedSinceIso).toBe(
      new Date(Date.parse(SYNCED_AT) - HISTORY_CLOCK_SKEW_MARGIN_MS).toISOString()
    );
  });

  it('un mes antiguo que sigue abierto no se archiva, ni los posteriores', () => {
    const cached = cachedHistory(19);
    const { ['2025-03']: _reopened, ...closedSnapshots } = cached.closedSnapshots;
    expect(planArchivedHistory({ ...cached, closedSnapshots })?.cutoffMonthKey).toBe('2025-03');
  });

  it('si el mes abierto es el primero, no queda nada que archivar', () => {
    const cached = cachedHistory(19);
    const { ['2025-01']: _reopened, ...closedSnapshots } = cached.closedSnapshots;
    expect(planArchivedHistory({ ...cached, closedSnapshots })).toBeNull();
  });

  it('un mes con movimientos que no está en la lista de meses también cuenta como abierto', () => {
    const cached = cachedHistory(19);
    const plan = planArchivedHistory({
      ...cached,
      availableMonths: cached.availableMonths.filter((monthKey) => monthKey !== '2025-04'),
      closedSnapshots: Object.fromEntries(
        Object.entries(cached.closedSnapshots).filter(([monthKey]) => monthKey !== '2025-04')
      ),
    });
    expect(plan?.cutoffMonthKey).toBe('2025-04');
  });
});

describe('resolveArchivedEntries', () => {
  const plan: ArchivedHistoryPlan = { cutoffMonthKey: '2025-03', changedSinceIso: SYNCED_AT };
  const cachedEntries = [entry('2025-02'), entry('2025-01'), entry('2025-03'), entry('2025-04')];
  const snapshots = {
    '2025-01': snapshot('2025-01'),
    '2025-02': snapshot('2025-02'),
    '2025-03': snapshot('2025-03'),
  };
  const evidence = {
    plan,
    cachedEntries,
    cachedSnapshots: snapshots,
    remoteSnapshots: snapshots,
    changedEntries: [] as MonthEntry[],
    remoteArchivedCount: 2,
  };

  it('devuelve solo los movimientos anteriores al corte, ordenados por id', () => {
    expect(resolveArchivedEntries(evidence)?.map((e) => e.id)).toEqual([
      '2025-01_rent',
      '2025-02_rent',
    ]);
  });

  it('aplica los cambios descargados: reemplaza los editados y añade los nuevos', () => {
    const merged = resolveArchivedEntries({
      ...evidence,
      changedEntries: [
        entry('2025-01', 'rent', 999),
        entry('2025-02', 'gym'),
        entry('2025-04', 'rent', 555), // posterior al corte: llega con la descarga reciente
      ],
      remoteArchivedCount: 3,
    });
    expect(merged?.map((e) => [e.id, e.actualAmount])).toEqual([
      ['2025-01_rent', 999],
      ['2025-02_gym', 100],
      ['2025-02_rent', 100],
    ]);
  });

  it('desconfía de la caché si el conteo de la nube no coincide', () => {
    expect(resolveArchivedEntries({ ...evidence, remoteArchivedCount: 1 })).toBeNull();
    expect(resolveArchivedEntries({ ...evidence, remoteArchivedCount: 3 })).toBeNull();
  });

  it('desconfía de la caché si un mes archivado perdió, ganó o cambió su snapshot', () => {
    const { ['2025-02']: _reopened, ...withoutFebruary } = snapshots;
    expect(resolveArchivedEntries({ ...evidence, remoteSnapshots: withoutFebruary })).toBeNull();
    expect(resolveArchivedEntries({ ...evidence, cachedSnapshots: withoutFebruary })).toBeNull();
    expect(
      resolveArchivedEntries({
        ...evidence,
        remoteSnapshots: { ...snapshots, '2025-02': snapshot('2025-02', '2026-08-01T00:00:00.000Z') },
      })
    ).toBeNull();
  });

  it('ignora el orden de las claves y los cambios en snapshots posteriores al corte', () => {
    const reordered = { closedAtIso: '2025-01-28T23:00:00.000Z', monthKey: '2025-01' };
    expect(
      resolveArchivedEntries({
        ...evidence,
        remoteSnapshots: {
          ...snapshots,
          '2025-01': reordered as unknown as MonthSnapshot,
          '2025-03': snapshot('2025-03', '2026-08-01T00:00:00.000Z'),
        },
      })
    ).not.toBeNull();
  });
});
