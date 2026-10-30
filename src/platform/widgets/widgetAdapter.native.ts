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
  reloadControls?(kind?: string): void;
}

function getNativeExtensionStorage(): NativeExtensionStorage | null {
  try {
    // 1. Standard modern Expo Modules require method
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const mod = requireOptionalNativeModule('ExtensionStorage');
    if (mod) return mod;
  } catch {
    // Ignore in environments where expo-modules-core is unavailable
  }

  try {
    // 2. Global expo runtime module registry
    const anyGlobal = globalThis as unknown as {
      expo?: { modules?: { ExtensionStorage?: NativeExtensionStorage } };
    };
    if (anyGlobal.expo?.modules?.ExtensionStorage) {
      return anyGlobal.expo.modules.ExtensionStorage;
    }
  } catch {
    // Ignore
  }

  try {
    // 3. React Native legacy bridge fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    if (NativeModules?.ExtensionStorage) {
      return NativeModules.ExtensionStorage as NativeExtensionStorage;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Mode B (iOS Native build) adapter.
 * Writes WidgetSnapshotV1 into shared App Group UserDefaults containers
 * and triggers immediate timeline reloads across all widget families via ExtensionStorage.
 * Gracefully falls back to preview mode if running inside Expo Go or tests.
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
      const targetSuites = Array.from(new Set([appGroupId, 'group.com.bflow.app']));

      for (const suite of targetSuites) {
        try {
          nativeStorage.setString(WIDGET_STORAGE_KEY, payloadString, suite);
          if (nativeStorage.setObject) {
            nativeStorage.setObject(
              WIDGET_STORAGE_KEY,
              validated as unknown as Record<string, unknown>,
              suite
            );
          }
        } catch {
          // Continue to next suite candidate
        }
      }

      // Reload all widget timelines instantly (nil timeline = WidgetCenter.shared.reloadAllTimelines())
      nativeStorage.reloadWidget();
      nativeStorage.reloadWidget('BFlowWidget');
      if (nativeStorage.reloadControls) {
        nativeStorage.reloadControls();
      }

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
