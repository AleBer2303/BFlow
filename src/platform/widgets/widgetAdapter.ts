import {
  isEquivalentWidgetSnapshot,
  resolveDynamicAppGroupId,
  widgetAuthV1Schema,
  widgetSnapshotV2Schema,
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

let latestPreviewSnapshot: WidgetSnapshotV2 | null = null;
let latestPreviewAuthUid: string | null = null;

/**
 * Modo A (Expo Go, Web y tests): no hay widgets que pintar. Valida el contrato con Zod y
 * guarda el último snapshot en memoria para la vista previa y los tests. La variante
 * `.native.ts` escribe en el App Group (iOS) o en el módulo `BFlowWidgets` (Android).
 */
export async function syncWidgetSnapshot(
  snapshot: WidgetSnapshotV2,
  bundleIdentifier?: string
): Promise<WidgetSyncResult> {
  const validated = widgetSnapshotV2Schema.parse(snapshot);
  const appGroupId = resolveDynamicAppGroupId(bundleIdentifier);

  if (isEquivalentWidgetSnapshot(latestPreviewSnapshot, validated)) {
    return { synced: true, mode: 'mode-a-preview', appGroupId, skippedRedundantWrite: true };
  }

  latestPreviewSnapshot = validated;
  return { synced: true, mode: 'mode-a-preview', appGroupId };
}

/** Credenciales con las que el widget refresca el snapshot; `null` las borra. */
export function syncWidgetAuth(auth: WidgetAuthV1 | null): void {
  latestPreviewAuthUid = auth ? widgetAuthV1Schema.parse(auth).uid : null;
}

/** Al cerrar sesión: el widget no debe seguir mostrando las cifras de la cuenta anterior. */
export function clearWidgetData(): void {
  latestPreviewSnapshot = null;
  latestPreviewAuthUid = null;
}

export function getLatestWidgetSnapshotPreview(): WidgetSnapshotV2 | null {
  return latestPreviewSnapshot;
}

export function getLatestWidgetAuthUidPreview(): string | null {
  return latestPreviewAuthUid;
}

/** @deprecated usar `syncWidgetSnapshot`. */
export const syncWidgetSnapshotNative = syncWidgetSnapshot;
