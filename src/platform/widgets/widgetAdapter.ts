import {
  resolveDynamicAppGroupId,
  WidgetSnapshotV1,
  widgetSnapshotV1Schema,
} from './widgetSnapshot';

export interface WidgetSyncResult {
  synced: boolean;
  mode: 'mode-a-preview' | 'mode-b-native';
  appGroupId: string;
  error?: string;
  skippedRedundantWrite?: boolean;
}

let latestPreviewSnapshot: WidgetSnapshotV1 | null = null;

export function isEquivalentWidgetSnapshot(
  a: WidgetSnapshotV1 | null | undefined,
  b: WidgetSnapshotV1 | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return (
    a.schemaVersion === b.schemaVersion &&
    a.monthKey === b.monthKey &&
    a.netCashFlowCop === b.netCashFlowCop &&
    a.receivedIncomeCop === b.receivedIncomeCop &&
    a.paidExpensesCop === b.paidExpensesCop &&
    a.pendingExpensesCop === b.pendingExpensesCop &&
    a.checklistCompleted === b.checklistCompleted &&
    a.checklistTotal === b.checklistTotal &&
    a.totalDebtCop === b.totalDebtCop &&
    a.openingDebtCop === b.openingDebtCop &&
    a.motoSavingsCop === b.motoSavingsCop &&
    a.generalSavingsCop === b.generalSavingsCop &&
    a.totalSavingsCop === b.totalSavingsCop &&
    JSON.stringify(a.topPendingItems) === JSON.stringify(b.topPendingItems)
  );
}

/**
 * Mode A (Expo Go / Web / Tests) adapter.
 * Validates the snapshot strictly using Zod and retains it in memory.
 */
export async function syncWidgetSnapshotNative(
  snapshot: WidgetSnapshotV1,
  bundleIdentifier?: string
): Promise<WidgetSyncResult> {
  const validated = widgetSnapshotV1Schema.parse(snapshot);
  const appGroupId = resolveDynamicAppGroupId(bundleIdentifier);

  if (latestPreviewSnapshot && isEquivalentWidgetSnapshot(latestPreviewSnapshot, validated)) {
    return {
      synced: true,
      mode: 'mode-a-preview',
      appGroupId,
      skippedRedundantWrite: true,
    };
  }

  latestPreviewSnapshot = validated;
  return {
    synced: true,
    mode: 'mode-a-preview',
    appGroupId,
  };
}

export function getLatestWidgetSnapshotPreview(): WidgetSnapshotV1 | null {
  return latestPreviewSnapshot;
}

export const syncWidgetSnapshot = syncWidgetSnapshotNative;
