import { Platform } from 'react-native';

import {
  isEquivalentWidgetSnapshot,
  resolveDynamicAppGroupId,
  serializeWidgetSnapshot,
  WIDGET_AUTH_STORAGE_KEY,
  WIDGET_STORAGE_KEY,
  widgetAuthV1Schema,
  type WidgetAuthV1,
  type WidgetSnapshotV2,
} from './widgetSnapshot';

export interface WidgetSyncResult {
  synced: boolean;
  mode: 'mode-a-preview' | 'mode-b-native';
  appGroupId: string;
  error?: string;
  skippedRedundantWrite?: boolean;
}

/** App Group canónico; el módulo parcheado prueba además el derivado del bundle id real. */
const CANONICAL_APP_GROUP = 'group.com.bflow.app';

/** `ExtensionStorage` de @bacons/apple-targets, parcheado por `scripts/patch-extension-storage.mjs`. */
interface IosExtensionStorage {
  setString(key: string, value: string, group?: string): void;
  /**
   * Solo archivo `<contenedor>/<key>.json` en los App Groups accesibles, con protección de
   * datos y excluido de las copias de seguridad; nada en UserDefaults (ADR 0021).
   */
  setSecureFile?(key: string, value: string, group?: string): boolean;
  remove?(key: string, group?: string): void;
  reloadWidget(timeline?: string): void;
}

/** Módulo local `modules/bflow-widgets` (Android). */
interface AndroidWidgetsModule {
  setSnapshot(json: string): boolean;
  /** false si el JSON no es válido o falla el Keystore (nunca se guarda en claro). */
  setAuth(json: string | null): boolean;
  clear(): void;
  reloadAll(): void;
}

type NativeBridge =
  | { platform: 'ios'; storage: IosExtensionStorage }
  | { platform: 'android'; module: AndroidWidgetsModule };

function requireOptionalModule<T>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: (moduleName: string) => T | null;
    };
    return requireOptionalNativeModule(name) ?? null;
  } catch {
    return null;
  }
}

/** Sin módulo nativo (Expo Go o tests) se trabaja en modo vista previa. */
function resolveNativeBridge(): NativeBridge | null {
  if (Platform.OS === 'ios') {
    const storage = requireOptionalModule<IosExtensionStorage>('ExtensionStorage');
    return storage ? { platform: 'ios', storage } : null;
  }
  if (Platform.OS === 'android') {
    const module = requireOptionalModule<AndroidWidgetsModule>('BFlowWidgets');
    return module ? { platform: 'android', module } : null;
  }
  return null;
}

let latestSnapshot: WidgetSnapshotV2 | null = null;
let latestAuthJson: string | null | undefined;

/** Caché del ID token que mantiene el widget (con su marca de rechazo); la app la reinicia. */
const WIDGET_ID_TOKEN_CACHE_KEY = 'bflow_widget_id_token_v1';

function writeIos(storage: IosExtensionStorage, key: string, value: string | null, appGroupId: string) {
  for (const suite of new Set([appGroupId, CANONICAL_APP_GROUP])) {
    try {
      if (value === null) {
        storage.remove?.(key, suite);
      } else if (storage.setSecureFile) {
        storage.setSecureFile(key, value, suite);
      } else {
        storage.setString(key, value, suite);
      }
    } catch {
      // El siguiente candidato puede ser el App Group real que firmó iloader.
    }
  }
}

/**
 * Modo B: entrega el snapshot a los widgets y los repinta al instante.
 * - iOS: archivo del App Group (`setSecureFile`) y `WidgetCenter.reloadAllTimelines()`.
 * - Android: SharedPreferences del módulo `BFlowWidgets` y `AppWidgetManager.updateAppWidget`.
 * Omite la escritura si el contenido no cambió (R-19).
 */
export async function syncWidgetSnapshot(
  snapshot: WidgetSnapshotV2,
  bundleIdentifier?: string
): Promise<WidgetSyncResult> {
  const payload = serializeWidgetSnapshot(snapshot);
  const appGroupId = resolveDynamicAppGroupId(bundleIdentifier);
  const bridge = resolveNativeBridge();
  const mode = bridge ? 'mode-b-native' : 'mode-a-preview';

  if (isEquivalentWidgetSnapshot(latestSnapshot, snapshot)) {
    return { synced: true, mode, appGroupId, skippedRedundantWrite: true };
  }

  if (!bridge) {
    latestSnapshot = snapshot;
    return { synced: true, mode, appGroupId };
  }

  try {
    if (bridge.platform === 'ios') {
      writeIos(bridge.storage, WIDGET_STORAGE_KEY, payload, appGroupId);
      bridge.storage.reloadWidget();
    } else if (!bridge.module.setSnapshot(payload)) {
      return { synced: false, mode, appGroupId, error: 'BFlowWidgets rejected the snapshot.' };
    }
    latestSnapshot = snapshot;
    return { synced: true, mode, appGroupId };
  } catch (err) {
    return {
      synced: false,
      mode,
      appGroupId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Credenciales para que el widget lea `users/{uid}/widgetSnapshots/current` por su cuenta
 * y se actualice aunque la app esté cerrada (ADR 0021). `null` las borra.
 */
export function syncWidgetAuth(auth: WidgetAuthV1 | null, bundleIdentifier?: string): void {
  const json = auth ? JSON.stringify(widgetAuthV1Schema.parse(auth)) : null;
  if (json === latestAuthJson) {
    return;
  }
  const bridge = resolveNativeBridge();
  if (!bridge) {
    latestAuthJson = json;
    return;
  }
  try {
    if (bridge.platform === 'ios') {
      if (json !== null && !bridge.storage.setSecureFile) {
        // Sin el parche no hay forma de guardarlo fuera de UserDefaults y del backup: el
        // widget se queda con lo que escribe la app en este dispositivo.
        return;
      }
      const appGroupId = resolveDynamicAppGroupId(bundleIdentifier);
      // Borra copias antiguas (UserDefaults) y reinicia la caché del ID token y su marca de
      // rechazo, para que unas credenciales recién entregadas siempre se vuelvan a probar.
      writeIos(bridge.storage, WIDGET_AUTH_STORAGE_KEY, null, appGroupId);
      writeIos(bridge.storage, WIDGET_ID_TOKEN_CACHE_KEY, null, appGroupId);
      if (json !== null) {
        writeIos(bridge.storage, WIDGET_AUTH_STORAGE_KEY, json, appGroupId);
      }
    } else if (!bridge.module.setAuth(json)) {
      return; // Sin marcar como escrito: el próximo token lo vuelve a intentar.
    }
    latestAuthJson = json;
  } catch {
    // Sin credenciales el widget sigue mostrando lo que escribe la app en este dispositivo.
  }
}

/** Al cerrar sesión: borra snapshot y credenciales y repinta el estado vacío. */
export function clearWidgetData(bundleIdentifier?: string): void {
  latestSnapshot = null;
  latestAuthJson = null;
  const bridge = resolveNativeBridge();
  if (!bridge) {
    return;
  }
  try {
    if (bridge.platform === 'ios') {
      const appGroupId = resolveDynamicAppGroupId(bundleIdentifier);
      writeIos(bridge.storage, WIDGET_STORAGE_KEY, null, appGroupId);
      writeIos(bridge.storage, WIDGET_AUTH_STORAGE_KEY, null, appGroupId);
      writeIos(bridge.storage, WIDGET_ID_TOKEN_CACHE_KEY, null, appGroupId);
      bridge.storage.reloadWidget();
    } else {
      bridge.module.clear();
    }
  } catch {
    // Nada más que hacer: el próximo snapshot sobrescribe el contenido.
  }
}

export function getLatestWidgetSnapshotPreview(): WidgetSnapshotV2 | null {
  return latestSnapshot;
}

export function getLatestWidgetAuthUidPreview(): string | null {
  if (!latestAuthJson) return null;
  try {
    return (JSON.parse(latestAuthJson) as WidgetAuthV1).uid;
  } catch {
    return null;
  }
}

/** @deprecated usar `syncWidgetSnapshot`. */
export const syncWidgetSnapshotNative = syncWidgetSnapshot;
