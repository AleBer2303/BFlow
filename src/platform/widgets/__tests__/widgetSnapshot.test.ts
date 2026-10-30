import { buildOctober2026SeedPayload } from '../../../data/seed/october2026SeedData';
import { useBudgetStore } from '../../../features/budget/store/useBudgetStore';
import {
  getLatestWidgetSnapshotPreview,
  syncWidgetSnapshot,
  syncWidgetSnapshotNative,
} from '../widgetAdapter';
import {
  buildWidgetSnapshotV1,
  resolveDynamicAppGroupId,
  widgetSnapshotV1Schema,
} from '../widgetSnapshot';

describe('platform/widgets — WidgetSnapshotV1 Contract & Dynamic App Group Adapter', () => {
  it('builds the exact October 2026 golden WidgetSnapshotV1 contract and validates with Zod', () => {
    const seed = buildOctober2026SeedPayload();

    const snapshot = buildWidgetSnapshotV1({
      monthKey: '2026-10',
      concepts: seed.concepts,
      entries: seed.entries,
      debts: seed.debts,
      debtPayments: seed.debtPayments,
      savingsBuckets: seed.savingsBuckets,
      updatedAtIso: '2026-10-28T12:00:00.000Z',
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.monthKey).toBe('2026-10');
    expect(snapshot.netCashFlowCop).toBe(1_080_000);
    expect(snapshot.receivedIncomeCop).toBe(4_000_000);
    expect(snapshot.paidExpensesCop).toBe(2_920_000);
    expect(snapshot.pendingExpensesCop).toBe(450_000);
    expect(snapshot.checklistCompleted).toBe(6);
    expect(snapshot.checklistTotal).toBe(12);
    expect(snapshot.totalDebtCop).toBe(6_200_000);
    expect(snapshot.openingDebtCop).toBe(8_000_000);
    expect(snapshot.motoSavingsCop).toBe(2_300_000);
    expect(snapshot.generalSavingsCop).toBe(2_080_000);
    expect(snapshot.totalSavingsCop).toBe(4_380_000);
    expect(snapshot.topPendingItems).toHaveLength(6);
    expect(snapshot.topPendingItems[0]).toEqual({
      id: '2026-10_inc_prima',
      name: 'Prima',
      amountCop: 2_000_000,
      type: 'income',
    });
  });

  it('rejects float COP values and invalid monthKeys in widgetSnapshotV1Schema', () => {
    const seed = buildOctober2026SeedPayload();
    const valid = buildWidgetSnapshotV1({
      monthKey: '2026-10',
      concepts: seed.concepts,
      entries: seed.entries,
      debts: seed.debts,
      debtPayments: seed.debtPayments,
      savingsBuckets: seed.savingsBuckets,
    });

    expect(() =>
      widgetSnapshotV1Schema.parse({
        ...valid,
        netCashFlowCop: 1080000.5,
      })
    ).toThrow(/safe integer in COP/);

    expect(() =>
      widgetSnapshotV1Schema.parse({
        ...valid,
        monthKey: '2026-13',
      })
    ).toThrow(/Invalid monthKey/);
  });

  it('resolves dynamic App Group IDs with iloader team suffixes and syncs preview in Mode A', async () => {
    expect(resolveDynamicAppGroupId()).toBe('group.com.bflow.app');
    expect(resolveDynamicAppGroupId('com.bflow.app.ABC123TEAM')).toBe(
      'group.com.bflow.app.ABC123TEAM'
    );
    expect(resolveDynamicAppGroupId('com.bflow.app.ABC123TEAM.widgets')).toBe(
      'group.com.bflow.app.ABC123TEAM'
    );

    const seed = buildOctober2026SeedPayload();
    const snapshot = buildWidgetSnapshotV1({
      monthKey: '2026-10',
      concepts: seed.concepts,
      entries: seed.entries,
      debts: seed.debts,
      debtPayments: seed.debtPayments,
      savingsBuckets: seed.savingsBuckets,
    });

    const syncResult = await syncWidgetSnapshot(snapshot, 'com.bflow.app.TEAM99.widgets');
    expect(syncResult.synced).toBe(true);
    expect(syncResult.mode).toBe('mode-a-preview');
    expect(syncResult.appGroupId).toBe('group.com.bflow.app.TEAM99');
    expect(getLatestWidgetSnapshotPreview()?.netCashFlowCop).toBe(1_080_000);

    const nativeAdapterResult = await syncWidgetSnapshotNative(
      snapshot,
      'com.bflow.app.TEAM99.widgets'
    );
    expect(nativeAdapterResult.synced).toBe(true);
    expect(nativeAdapterResult.mode).toBe('mode-a-preview');
    expect(nativeAdapterResult.appGroupId).toBe('group.com.bflow.app.TEAM99');
    expect(getLatestWidgetSnapshotPreview()?.netCashFlowCop).toBe(1_080_000);
  });

  it('automatically synchronizes the active month widget snapshot from useBudgetStore', async () => {
    useBudgetStore.getState().resetToOctober2026GoldenState();
    const result = await useBudgetStore.getState().syncActiveWidget();

    expect(result.synced).toBe(true);
    expect(result.mode).toBe('mode-a-preview');
    const preview = getLatestWidgetSnapshotPreview();
    expect(preview).not.toBeNull();
    expect(preview?.monthKey).toBe('2026-10');
    expect(preview?.netCashFlowCop).toBe(1_080_000);
    expect(preview?.checklistCompleted).toBe(6);
    expect(preview?.checklistTotal).toBe(12);
  });
});
