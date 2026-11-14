import { buildOctober2026SeedPayload } from '../../../data/seed/october2026SeedData';
import { useBudgetStore } from '../../../features/budget/store/useBudgetStore';
import { getLatestWidgetSnapshotPreview, syncWidgetSnapshot } from '../widgetAdapter';
import {
  buildWidgetSnapshot,
  isEquivalentWidgetSnapshot,
  parseWidgetSnapshot,
  resolveDynamicAppGroupId,
  resolveWidgetMonthKey,
  serializeWidgetSnapshot,
  WIDGET_MAX_PAYLOAD_LENGTH,
  widgetAuthV1Schema,
  widgetSnapshotV2Schema,
  type BuildWidgetSnapshotInput,
  type WidgetSnapshotV2,
} from '../widgetSnapshot';

function goldenInput(overrides: Partial<BuildWidgetSnapshotInput> = {}): BuildWidgetSnapshotInput {
  const seed = buildOctober2026SeedPayload();
  return {
    monthKeys: ['2026-10'],
    monthKey: '2026-10',
    concepts: seed.concepts,
    entries: seed.entries,
    debtPayments: seed.debtPayments,
    debtsByMonth: { '2026-10': seed.debts },
    savingsBucketsByMonth: { '2026-10': seed.savingsBuckets },
    closedSnapshots: {},
    updatedAtIso: '2026-10-28T12:00:00.000Z',
    ...overrides,
  };
}

describe('platform/widgets — contrato WidgetSnapshotV2', () => {
  it('reproduce los valores dorados de octubre 2026', () => {
    const snapshot = buildWidgetSnapshot(goldenInput());

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.monthKey).toBe('2026-10');
    expect(snapshot.currencySymbol).toBe('$');
    expect(snapshot.thousandsSeparator).toBe('.');
    expect(snapshot.plannedIncome).toBe(6_000_000);
    expect(snapshot.receivedIncome).toBe(4_000_000);
    expect(snapshot.pendingIncome).toBe(2_000_000);
    expect(snapshot.plannedExpenses).toBe(3_370_000);
    expect(snapshot.paidExpenses).toBe(2_920_000);
    expect(snapshot.pendingExpenses).toBe(450_000);
    expect(snapshot.netCashFlow).toBe(1_080_000);
    expect(snapshot.checklistCompleted).toBe(6);
    expect(snapshot.checklistTotal).toBe(12);
    expect(snapshot.totalDebt).toBe(6_200_000);
    expect(snapshot.reserveBalance).toBe(2_300_000);
    expect(snapshot.savingsBalance).toBe(2_080_000);
    expect(snapshot.totalSavings).toBe(4_380_000);
    expect(snapshot.debtSinceMonthKey).toBe('2026-10');
    expect(snapshot.initialDebt).toBeGreaterThanOrEqual(snapshot.totalDebt);
    expect(snapshot.trend).toEqual([
      {
        monthKey: '2026-10',
        receivedIncome: 4_000_000,
        paidExpenses: 2_920_000,
        netCashFlow: 1_080_000,
      },
    ]);
  });

  it('ordena los pendientes por monto y respeta el tope', () => {
    const snapshot = buildWidgetSnapshot(goldenInput());
    expect(snapshot.pendingItems.length).toBeGreaterThan(0);
    expect(snapshot.pendingItems.length).toBeLessThanOrEqual(8);
    expect(snapshot.pendingItems[0]).toEqual({
      id: '2026-10_inc_prima',
      name: 'Prima',
      amount: 2_000_000,
      type: 'income',
    });
    const amounts = snapshot.pendingItems.map((item) => item.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it('sin deudas deja la barra de progreso en cero y sin fecha de cierre', () => {
    const snapshot = buildWidgetSnapshot(goldenInput({ debtsByMonth: {} }));
    expect(snapshot.totalDebt).toBe(0);
    expect(snapshot.initialDebt).toBe(0);
    expect(snapshot.debtSinceMonthKey).toBeNull();
    expect(snapshot.estimatedPayoffMonthKey).toBeNull();
  });

  it('rechaza decimales, meses inválidos, campos extra y tendencias que no acaban en el mes', () => {
    const valid = buildWidgetSnapshot(goldenInput());
    // Zod 4 describe el entero inválido como "expected int".
    expect(() => widgetSnapshotV2Schema.parse({ ...valid, netCashFlow: 1080000.5 })).toThrow(
      /expected int/
    );
    expect(() => widgetSnapshotV2Schema.parse({ ...valid, monthKey: '2026-13' })).toThrow(
      /Invalid monthKey/
    );
    expect(() => widgetSnapshotV2Schema.parse({ ...valid, extra: 1 })).toThrow();
    expect(() =>
      widgetSnapshotV2Schema.parse({
        ...valid,
        trend: [{ monthKey: '2026-09', receivedIncome: 0, paidExpenses: 0, netCashFlow: 0 }],
      })
    ).toThrow(/last trend point/);
    expect(() =>
      widgetSnapshotV2Schema.parse({ ...valid, checklistCompleted: 13 })
    ).toThrow(/cannot exceed/);
  });

  it('serializa y vuelve a leer el mismo snapshot, y descarta payloads inválidos', () => {
    const snapshot = buildWidgetSnapshot(goldenInput());
    const payload = serializeWidgetSnapshot(snapshot);
    expect(payload.length).toBeLessThanOrEqual(WIDGET_MAX_PAYLOAD_LENGTH);
    expect(parseWidgetSnapshot(payload)).toEqual(snapshot);
    expect(parseWidgetSnapshot('{')).toBeNull();
    expect(parseWidgetSnapshot(JSON.stringify({ ...snapshot, schemaVersion: 1 }))).toBeNull();
  });

  it('recorta nombres largos para que el payload no supere el tope', () => {
    const seed = buildOctober2026SeedPayload();
    const longName = 'x'.repeat(500);
    const entries = seed.entries.map((entry) =>
      entry.status === 'pending' ? { ...entry, conceptName: longName } : entry
    );
    const snapshot = buildWidgetSnapshot(goldenInput({ entries }));
    for (const item of snapshot.pendingItems) {
      expect(item.name.length).toBeLessThanOrEqual(120);
    }
  });

  it('compara por contenido e ignora updatedAtIso', () => {
    const a = buildWidgetSnapshot(goldenInput());
    const b = buildWidgetSnapshot(goldenInput({ updatedAtIso: '2026-10-28T12:05:00.000Z' }));
    expect(isEquivalentWidgetSnapshot(a, b)).toBe(true);
    expect(isEquivalentWidgetSnapshot(a, { ...b, netCashFlow: 1 } as WidgetSnapshotV2)).toBe(false);
    expect(isEquivalentWidgetSnapshot(a, null)).toBe(false);
  });

  it('valida las credenciales del widget', () => {
    expect(
      widgetAuthV1Schema.safeParse({
        schemaVersion: 1,
        uid: 'u1',
        refreshToken: 'r',
        apiKey: 'k',
        projectId: 'p',
      }).success
    ).toBe(true);
    expect(widgetAuthV1Schema.safeParse({ schemaVersion: 1, uid: 'u1' }).success).toBe(false);
  });
});

describe('platform/widgets — mes del widget', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');

  it('usa el mes en curso si la cuenta lo tiene, aunque el usuario mire otro', () => {
    expect(resolveWidgetMonthKey(['2026-09', '2026-10', '2026-11'], '2026-09', now)).toBe('2026-11');
  });

  it('sin mes en curso usa el último anterior conocido', () => {
    expect(resolveWidgetMonthKey(['2026-12', '2026-09', '2026-10'], '2026-12', now)).toBe('2026-10');
  });

  it('sin meses anteriores cae en el mes activo', () => {
    expect(resolveWidgetMonthKey(['2027-01'], '2027-01', now)).toBe('2027-01');
    expect(resolveWidgetMonthKey([], '2026-08', now)).toBe('2026-08');
  });

  it('respeta America/Bogota en el cambio de mes', () => {
    // 1 dic 03:00 UTC = 30 nov 22:00 en Bogotá.
    const lateNovemberInBogota = new Date('2026-12-01T03:00:00.000Z');
    expect(resolveWidgetMonthKey(['2026-11', '2026-12'], '2026-12', lateNovemberInBogota)).toBe(
      '2026-11'
    );
  });
});

describe('platform/widgets — App Group dinámico', () => {
  it('resuelve los sufijos de equipo de iloader', () => {
    expect(resolveDynamicAppGroupId()).toBe('group.com.bflow.app');
    expect(resolveDynamicAppGroupId('  ')).toBe('group.com.bflow.app');
    expect(resolveDynamicAppGroupId('com.bflow.app.ABC123TEAM')).toBe(
      'group.com.bflow.app.ABC123TEAM'
    );
    expect(resolveDynamicAppGroupId('com.bflow.app.ABC123TEAM.widgets')).toBe(
      'group.com.bflow.app.ABC123TEAM'
    );
  });
});

describe('platform/widgets — integración con el store', () => {
  it('sincroniza el snapshot del mes tras restaurar el estado dorado', async () => {
    useBudgetStore.getState().resetToOctober2026GoldenState();
    const result = await useBudgetStore.getState().syncActiveWidget();

    expect(result.synced).toBe(true);
    expect(result.mode).toBe('mode-a-preview');
    const preview = getLatestWidgetSnapshotPreview();
    expect(preview?.monthKey).toBe('2026-10');
    expect(preview?.netCashFlow).toBe(1_080_000);
    expect(preview?.checklistCompleted).toBe(6);
    expect(preview?.checklistTotal).toBe(12);
  });

  it('omite escrituras redundantes (R-19)', async () => {
    const first = buildWidgetSnapshot(goldenInput({ entries: buildOctober2026SeedPayload().entries.slice(1) }));
    const second = { ...first, updatedAtIso: '2026-10-28T13:00:00.000Z' };
    expect((await syncWidgetSnapshot(first)).skippedRedundantWrite).toBeUndefined();
    expect((await syncWidgetSnapshot(second)).skippedRedundantWrite).toBe(true);
  });
});
