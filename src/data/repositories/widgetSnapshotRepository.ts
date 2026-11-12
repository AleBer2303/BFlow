/**
 * src/data/repositories/widgetSnapshotRepository.ts
 *
 * Documento derivado `users/{uid}/widgetSnapshots/current` (ADR 0021). Cualquier dispositivo
 * con la app abierta lo reescribe tras cada cambio, y los widgets de iOS y Android lo leen por
 * REST para mostrar lo que se hizo en otro dispositivo (por ejemplo, en la web) sin abrir la app.
 *
 * Es una caché de lectura: no es fuente de verdad, no se lee desde la app y no participa del
 * rollback optimista del store. Si una escritura falla, la siguiente la reemplaza.
 */

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { getFirebaseDb } from '../firebase/firebaseConfig';
import {
  serializeWidgetSnapshot,
  WIDGET_CLOUD_COLLECTION,
  WIDGET_CLOUD_DOC_ID,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
  type WidgetSnapshotV2,
} from '../../platform/widgets/widgetSnapshot';

/** Agrupa ráfagas de cambios (marcar varios conceptos seguidos) en una sola escritura. */
export const WIDGET_CLOUD_WRITE_DEBOUNCE_MS = 1_500;

export interface CloudWidgetSnapshotDocument {
  schemaVersion: typeof WIDGET_SNAPSHOT_SCHEMA_VERSION;
  monthKey: string;
  payload: string;
  updatedAt: ReturnType<typeof serverTimestamp>;
}

function contentKey(snapshot: WidgetSnapshotV2): string {
  const { updatedAtIso: _ignored, ...rest } = snapshot;
  return JSON.stringify(rest);
}

export function buildCloudWidgetSnapshotDocument(
  snapshot: WidgetSnapshotV2
): CloudWidgetSnapshotDocument {
  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    monthKey: snapshot.monthKey,
    payload: serializeWidgetSnapshot(snapshot),
    updatedAt: serverTimestamp(),
  };
}

export async function writeCloudWidgetSnapshot(
  uid: string,
  snapshot: WidgetSnapshotV2
): Promise<void> {
  const ref = doc(getFirebaseDb(), 'users', uid, WIDGET_CLOUD_COLLECTION, WIDGET_CLOUD_DOC_ID);
  await setDoc(ref, buildCloudWidgetSnapshotDocument(snapshot));
}

interface PendingWrite {
  uid: string;
  snapshot: WidgetSnapshotV2;
}

/**
 * En tests, los usuarios `uid_cloud_test_*` cuentan como reales y dispararían un `setDoc`
 * de verdad (conexión de red fuera del test). Apagado por defecto en Jest; los tests de este
 * módulo lo encienden con `setCloudWidgetSyncEnabled(true)`.
 */
let cloudSyncEnabled = process.env.NODE_ENV !== 'test';

export function setCloudWidgetSyncEnabled(enabled: boolean): void {
  cloudSyncEnabled = enabled;
}

let pending: PendingWrite | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWritten: { uid: string; key: string } | null = null;
let inFlight: Promise<void> | null = null;

async function runPendingWrite(): Promise<void> {
  timer = null;
  const next = pending;
  pending = null;
  if (!next) return;

  const key = contentKey(next.snapshot);
  if (lastWritten && lastWritten.uid === next.uid && lastWritten.key === key) {
    return;
  }
  try {
    await writeCloudWidgetSnapshot(next.uid, next.snapshot);
    lastWritten = { uid: next.uid, key };
  } catch {
    // Caché derivada: sin rollback ni mensaje. El próximo cambio vuelve a intentarlo.
  }
}

/**
 * Programa la escritura del snapshot en la nube. Solo queda la última de cada ráfaga, y se
 * omite si el contenido ya está escrito para ese usuario.
 */
export function scheduleCloudWidgetSnapshotWrite(uid: string, snapshot: WidgetSnapshotV2): void {
  if (!cloudSyncEnabled) return;
  if (pending && pending.uid !== uid) {
    // Cambio de cuenta: lo pendiente era de otra sesión.
    pending = null;
  }
  const key = contentKey(snapshot);
  if (!pending && lastWritten && lastWritten.uid === uid && lastWritten.key === key) {
    return;
  }
  pending = { uid, snapshot };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    inFlight = runPendingWrite().finally(() => {
      inFlight = null;
    });
  }, WIDGET_CLOUD_WRITE_DEBOUNCE_MS);
}

/** Escribe ya lo pendiente (al pasar a segundo plano, antes de que el sistema congele la app). */
export async function flushCloudWidgetSnapshotWrite(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    await runPendingWrite();
    return;
  }
  if (inFlight) {
    await inFlight;
  }
}

/** Al cerrar sesión: descarta lo pendiente de la cuenta saliente. */
export function cancelCloudWidgetSnapshotWrite(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
  lastWritten = null;
}
