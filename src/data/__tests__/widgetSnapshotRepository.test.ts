import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';
import { buildWidgetSnapshot, type WidgetSnapshotV2 } from '../../platform/widgets/widgetSnapshot';

const mockSetDoc = jest.fn();
const mockDoc = jest.fn((...segments: unknown[]) => ({ path: segments.slice(1).join('/') }));
jest.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  serverTimestamp: () => '__server_timestamp__',
}));
jest.mock('../firebase/firebaseConfig', () => ({ getFirebaseDb: () => ({ name: 'db' }) }));

// eslint-disable-next-line import/first
import {
  buildCloudWidgetSnapshotDocument,
  cancelCloudWidgetSnapshotWrite,
  flushCloudWidgetSnapshotWrite,
  scheduleCloudWidgetSnapshotWrite,
  WIDGET_CLOUD_WRITE_DEBOUNCE_MS,
} from '../repositories/widgetSnapshotRepository';

function snapshot(overrides: Partial<WidgetSnapshotV2> = {}): WidgetSnapshotV2 {
  const seed = buildOctober2026SeedPayload();
  return {
    ...buildWidgetSnapshot({
      monthKeys: ['2026-10'],
      monthKey: '2026-10',
      concepts: seed.concepts,
      entries: seed.entries,
      debtPayments: seed.debtPayments,
      debtsByMonth: { '2026-10': seed.debts },
      savingsBucketsByMonth: { '2026-10': seed.savingsBuckets },
      closedSnapshots: {},
      updatedAtIso: '2026-10-28T12:00:00.000Z',
    }),
    ...overrides,
  };
}

describe('widgetSnapshotRepository — documento users/{uid}/widgetSnapshots/current', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSetDoc.mockReset();
    mockSetDoc.mockResolvedValue(undefined);
    mockDoc.mockClear();
    cancelCloudWidgetSnapshotWrite();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('arma el documento con el payload serializado y la hora del servidor', () => {
    const snap = snapshot();
    expect(buildCloudWidgetSnapshotDocument(snap)).toEqual({
      schemaVersion: 2,
      monthKey: '2026-10',
      payload: JSON.stringify(snap),
      updatedAt: '__server_timestamp__',
    });
  });

  it('agrupa una ráfaga de cambios en una sola escritura con el último snapshot', async () => {
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot({ netCashFlow: 1 }));
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot({ netCashFlow: 2 }));
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot({ netCashFlow: 3 }));

    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith({ name: 'db' }, 'users', 'uid_a', 'widgetSnapshots', 'current');
    const written = mockSetDoc.mock.calls[0]?.[1] as { payload: string };
    expect(JSON.parse(written.payload).netCashFlow).toBe(3);
  });

  it('no reescribe un contenido ya escrito aunque cambie updatedAtIso', async () => {
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot());
    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot({ updatedAtIso: '2026-10-28T13:00:00.000Z' }));
    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('reintenta en el siguiente cambio si la escritura falla', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('offline'));
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot());
    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot());
    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);

    expect(mockSetDoc).toHaveBeenCalledTimes(2);
  });

  it('flush escribe de inmediato lo pendiente', async () => {
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot());
    await flushCloudWidgetSnapshotWrite();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    await flushCloudWidgetSnapshotWrite();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('cancelar descarta lo pendiente de la cuenta saliente', async () => {
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot());
    cancelCloudWidgetSnapshotWrite();
    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('un cambio de cuenta descarta lo pendiente de la anterior', async () => {
    scheduleCloudWidgetSnapshotWrite('uid_a', snapshot({ netCashFlow: 1 }));
    scheduleCloudWidgetSnapshotWrite('uid_b', snapshot({ netCashFlow: 2 }));
    await jest.advanceTimersByTimeAsync(WIDGET_CLOUD_WRITE_DEBOUNCE_MS);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith({ name: 'db' }, 'users', 'uid_b', 'widgetSnapshots', 'current');
  });

  it('firestore.rules valida el documento derivado del widget', () => {
    const fs = require('fs') as { readFileSync: (p: string, enc: string) => string };
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('match /widgetSnapshots/{snapshotId}');
    expect(rules).toContain("snapshotId == 'current'");
    expect(rules).toContain('data.schemaVersion == 2');
    expect(rules).toContain('data.payload.size() <= 16000');
    expect(rules).toContain('data.updatedAt == request.time');
  });
});
