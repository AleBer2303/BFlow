import {
  resolveDynamicAppGroupId,
  WIDGET_STORAGE_KEY,
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

interface NativeExtensionStorage {
  setString(key: string, value: string, group?: string): void;
  setObject?(key: string, value: Record<string, unknown>, group?: string): void;
  reloadWidget(timeline?: string): void;
}

function getNativeExtensionStorage(): NativeExtensionStorage | null {
  try {
    const globalExpo = (globalThis as unknown as { expo?: { modules?: { ExtensionStorage?: NativeExtensionStorage } } }).expo;
    return globalExpo?.modules?.ExtensionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Mode B (iOS Native build) adapter.
 * Writes WidgetSnapshotV1 into the shared App Group UserDefaults container
 * and reloads the BFlowWidget timeline via ExtensionStorage.
 * Gracefully falls back to preview mode if running inside Expo Go.
 */
export async function syncWidgetSnapshotNative(
  snapshot: WidgetSnapshotV1,
  bundleIdentifier?: string
): Promise<WidgetSyncResult> {
  const validated = widgetSnapshotV1Schema.parse(snapshot);
  latestPreviewSnapshot = validated;
  const appGroupId = resolveDynamicAppGroupId(bundleIdentifier);

  const nativeStorage = getNativeExtensionStorage();
  if (nativeStorage) {
    try {
      const payloadString = JSON.stringify(validated);
      nativeStorage.setString(WIDGET_STORAGE_KEY, payloadString, appGroupId);
      nativeStorage.reloadWidget('BFlowWidget');

      return {
        synced: true,
        mode: 'mode-b-native',
        appGroupId,
      };
    } catch (err) {
      return {
        synced: false,
        mode: 'mode-b-native',
        appGroupId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Fallback for Expo Go runtime on physical device
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
