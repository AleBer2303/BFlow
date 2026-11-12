import { Platform } from 'react-native';

import { buildOctober2026SeedPayload } from '../../../data/seed/october2026SeedData';
import {
  buildWidgetSnapshot,
  WIDGET_AUTH_STORAGE_KEY,
  WIDGET_STORAGE_KEY,
  type WidgetAuthV1,
  type WidgetSnapshotV2,
} from '../widgetSnapshot';

type AdapterModule = typeof import('../widgetAdapter.native');

const AUTH: WidgetAuthV1 = {
  schemaVersion: 1,
  uid: 'uid_cloud_test_1',
  refreshToken: 'refresh-1',
  apiKey: 'key',
  projectId: 'bflow-test',
};

function goldenSnapshot(): WidgetSnapshotV2 {
  const seed = buildOctober2026SeedPayload();
  return buildWidgetSnapshot({
    monthKeys: ['2026-10'],
    monthKey: '2026-10',
    concepts: seed.concepts,
    entries: seed.entries,
    debtPayments: seed.debtPayments,
    debtsByMonth: { '2026-10': seed.debts },
    savingsBucketsByMonth: { '2026-10': seed.savingsBuckets },
    closedSnapshots: {},
    updatedAtIso: '2026-10-28T12:00:00.000Z',
  });
}

const mockNative: { os: 'ios' | 'android'; modules: Record<string, unknown> } = {
  os: 'ios',
  modules: {},
};
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: (name: string) => mockNative.modules[name] ?? null,
}));

/** Carga un adaptador nuevo (estado de deduplicación limpio) con plataforma y módulo simulados. */
function loadAdapter(os: 'ios' | 'android', nativeModules: Record<string, unknown>): AdapterModule {
  mockNative.os = os;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => mockNative.os });
  mockNative.modules = nativeModules;
  let adapter: AdapterModule | undefined;
  jest.isolateModules(() => {
    adapter = require('../widgetAdapter.native') as AdapterModule;
  });
  if (!adapter) throw new Error('adapter not loaded');
  return adapter;
}

describe('widgetAdapter.native — iOS (App Group)', () => {
  function iosStorage() {
    return {
      setString: jest.fn(),
      setSecureFile: jest.fn(),
      remove: jest.fn(),
      reloadWidget: jest.fn(),
    };
  }

  it('escribe el snapshot en el App Group dinámico y el canónico y recarga los widgets', async () => {
    const storage = iosStorage();
    const adapter = loadAdapter('ios', { ExtensionStorage: storage });
    const snapshot = goldenSnapshot();

    const result = await adapter.syncWidgetSnapshot(snapshot, 'com.bflow.app.TEAM9');

    expect(result).toEqual({ synced: true, mode: 'mode-b-native', appGroupId: 'group.com.bflow.app.TEAM9' });
    expect(storage.setSecureFile).toHaveBeenCalledWith(
      WIDGET_STORAGE_KEY,
      JSON.stringify(snapshot),
      'group.com.bflow.app.TEAM9'
    );
    expect(storage.setSecureFile).toHaveBeenCalledWith(
      WIDGET_STORAGE_KEY,
      JSON.stringify(snapshot),
      'group.com.bflow.app'
    );
    expect(storage.reloadWidget).toHaveBeenCalledTimes(1);
    expect(adapter.getLatestWidgetSnapshotPreview()).toEqual(snapshot);
  });

  it('no reescribe ni recarga si el contenido no cambió', async () => {
    const storage = iosStorage();
    const adapter = loadAdapter('ios', { ExtensionStorage: storage });
    const snapshot = goldenSnapshot();
    await adapter.syncWidgetSnapshot(snapshot);
    const second = await adapter.syncWidgetSnapshot({ ...snapshot, updatedAtIso: '2026-10-29T00:00:00.000Z' });

    expect(second.skippedRedundantWrite).toBe(true);
    expect(storage.reloadWidget).toHaveBeenCalledTimes(1);
  });

  it('informa el error si el módulo nativo falla y reintenta en la siguiente llamada', async () => {
    const storage = iosStorage();
    storage.reloadWidget.mockImplementationOnce(() => {
      throw new Error('WidgetCenter unavailable');
    });
    const adapter = loadAdapter('ios', { ExtensionStorage: storage });
    const snapshot = goldenSnapshot();

    const failed = await adapter.syncWidgetSnapshot(snapshot);
    expect(failed).toMatchObject({ synced: false, error: 'WidgetCenter unavailable' });
    const retried = await adapter.syncWidgetSnapshot(snapshot);
    expect(retried.synced).toBe(true);
    expect(retried.skippedRedundantWrite).toBeUndefined();
  });

  it('guarda las credenciales una sola vez y las borra al cerrar sesión', () => {
    const storage = iosStorage();
    const adapter = loadAdapter('ios', { ExtensionStorage: storage });

    adapter.syncWidgetAuth(AUTH);
    adapter.syncWidgetAuth({ ...AUTH });
    expect(storage.setString).not.toHaveBeenCalled();
    expect(storage.setSecureFile).toHaveBeenCalledTimes(1); // sin sufijo, dinámico == canónico
    // Antes de escribir se reinicia la caché del ID token (y su marca de rechazo).
    expect(storage.remove).toHaveBeenCalledWith('bflow_widget_id_token_v1', 'group.com.bflow.app');
    expect(storage.setSecureFile).toHaveBeenCalledWith(
      WIDGET_AUTH_STORAGE_KEY,
      JSON.stringify(AUTH),
      'group.com.bflow.app'
    );
    expect(adapter.getLatestWidgetAuthUidPreview()).toBe(AUTH.uid);

    adapter.clearWidgetData();
    expect(storage.remove).toHaveBeenCalledWith(WIDGET_STORAGE_KEY, 'group.com.bflow.app');
    expect(storage.remove).toHaveBeenCalledWith(WIDGET_AUTH_STORAGE_KEY, 'group.com.bflow.app');
    expect(storage.remove).toHaveBeenLastCalledWith('bflow_widget_id_token_v1', 'group.com.bflow.app');
    expect(storage.reloadWidget).toHaveBeenCalled();
    expect(adapter.getLatestWidgetSnapshotPreview()).toBeNull();
    expect(adapter.getLatestWidgetAuthUidPreview()).toBeNull();
  });

  it('sin el parche no guarda el token en UserDefaults; el snapshot usa setString', async () => {
    const storage = { setString: jest.fn(), remove: jest.fn(), reloadWidget: jest.fn() };
    const adapter = loadAdapter('ios', { ExtensionStorage: storage });

    adapter.syncWidgetAuth(AUTH);
    expect(storage.setString).not.toHaveBeenCalled();
    expect(adapter.getLatestWidgetAuthUidPreview()).toBeNull();

    await adapter.syncWidgetSnapshot(goldenSnapshot());
    expect(storage.setString).toHaveBeenCalledWith(
      WIDGET_STORAGE_KEY,
      expect.any(String),
      'group.com.bflow.app'
    );
  });

  it('rechaza credenciales que no cumplen el contrato', () => {
    const adapter = loadAdapter('ios', { ExtensionStorage: iosStorage() });
    expect(() => adapter.syncWidgetAuth({ ...AUTH, refreshToken: '' })).toThrow();
  });
});

describe('widgetAdapter.native — Android (módulo BFlowWidgets)', () => {
  function androidModule(accepts = true) {
    return {
      setSnapshot: jest.fn(() => accepts),
      setAuth: jest.fn(() => true),
      clear: jest.fn(),
      reloadAll: jest.fn(),
    };
  }

  it('entrega el JSON al módulo, que repinta los widgets al instante', async () => {
    const module = androidModule();
    const adapter = loadAdapter('android', { BFlowWidgets: module });
    const snapshot = goldenSnapshot();

    const result = await adapter.syncWidgetSnapshot(snapshot);

    expect(result.synced).toBe(true);
    expect(result.mode).toBe('mode-b-native');
    expect(module.setSnapshot).toHaveBeenCalledWith(JSON.stringify(snapshot));
  });

  it('informa si el módulo rechaza el snapshot', async () => {
    const adapter = loadAdapter('android', { BFlowWidgets: androidModule(false) });
    const result = await adapter.syncWidgetSnapshot(goldenSnapshot());
    expect(result).toMatchObject({ synced: false, error: 'BFlowWidgets rejected the snapshot.' });
  });

  it('pasa y borra credenciales y limpia al cerrar sesión', () => {
    const module = androidModule();
    const adapter = loadAdapter('android', { BFlowWidgets: module });

    adapter.syncWidgetAuth(AUTH);
    expect(module.setAuth).toHaveBeenCalledWith(JSON.stringify(AUTH));
    adapter.syncWidgetAuth(null);
    expect(module.setAuth).toHaveBeenLastCalledWith(null);
    adapter.clearWidgetData();
    expect(module.clear).toHaveBeenCalledTimes(1);
  });

  it('reintenta las credenciales si el Keystore las rechaza', () => {
    const module = androidModule();
    module.setAuth.mockReturnValueOnce(false);
    const adapter = loadAdapter('android', { BFlowWidgets: module });
    adapter.syncWidgetAuth(AUTH);
    expect(adapter.getLatestWidgetAuthUidPreview()).toBeNull();
    adapter.syncWidgetAuth(AUTH);
    expect(module.setAuth).toHaveBeenCalledTimes(2);
    expect(adapter.getLatestWidgetAuthUidPreview()).toBe(AUTH.uid);
  });
});

describe('widgetAdapter.native — sin módulo nativo (Expo Go)', () => {
  it('trabaja en modo vista previa', async () => {
    const adapter = loadAdapter('ios', {});
    const snapshot = goldenSnapshot();
    const result = await adapter.syncWidgetSnapshot(snapshot);
    expect(result.mode).toBe('mode-a-preview');
    expect(result.synced).toBe(true);
    adapter.syncWidgetAuth(AUTH);
    expect(adapter.getLatestWidgetAuthUidPreview()).toBe(AUTH.uid);
    adapter.clearWidgetData();
    expect(adapter.getLatestWidgetSnapshotPreview()).toBeNull();
  });
});
