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
}

let latestPreviewSnapshot: WidgetSnapshotV1 | null = null;

/**
 * Mode A (Expo Go / Web / Tests) adapter.
 * Validates the snapshot strictly using Zod and retains it in memory.
 */
export async function syncWidgetSnapshotNative(
  snapshot: WidgetSnapshotV1,
  bundleIdentifier?: string
): Promise<WidgetSyncResult> {
  const validated = widgetSnapshotV1Schema.parse(snapshot);
  latestPreviewSnapshot = validated;
  return {
    synced: true,
    mode: 'mode-a-preview',
    appGroupId: resolveDynamicAppGroupId(bundleIdentifier),
  };
}

export function getLatestWidgetSnapshotPreview(): WidgetSnapshotV1 | null {
  return latestPreviewSnapshot;
}

export const syncWidgetSnapshot = syncWidgetSnapshotNative;
