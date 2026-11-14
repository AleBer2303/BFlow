/**
 * Endurecimiento del almacenamiento local (ADR 0027): CSPRNG estricto, token del dispositivo
 * fuera de SQLite en nativo y fuera de `localStorage` en Web.
 */

import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  DEVICE_SECRET_TOKEN_KEY,
  persistentStorage,
  rotateDeviceSecretToken,
  type RawStorageBackend,
} from '../persistentStorageAdapter';
import { SecureRandomUnavailableError } from '../secureRandom';
import {
  encryptStorageValue,
  generateSecretToken256,
  isEncryptedStoragePayload,
  randomBytes,
} from '../storageCipher';

const SAMPLE_TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SESSION_KEY = 'bflow.auth.session.v1';

type ExpoCryptoMock = { getRandomValues?: (target: Uint8Array) => unknown } | 'missing';

/** Ejecuta `run` en un entorno sin WebCrypto, con el `expo-crypto` que se indique. */
function withoutWebCrypto<T>(expoCrypto: ExpoCryptoMock, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  jest.resetModules();
  jest.doMock('expo-crypto', () => {
    if (expoCrypto === 'missing') {
      throw new Error("Cannot find native module 'ExpoCrypto'");
    }
    return expoCrypto;
  });
  try {
    return run();
  } finally {
    jest.dontMock('expo-crypto');
    jest.resetModules();
    if (original) {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  }
}

function createSimulatedDiskBackend(): { backend: RawStorageBackend; disk: Map<string, string> } {
  const disk = new Map<string, string>();
  return {
    disk,
    backend: {
      getItem: (key) => disk.get(key) ?? null,
      setItem: (key, value) => {
        disk.set(key, value);
      },
      removeItem: (key) => {
        disk.delete(key);
      },
      clear: () => disk.clear(),
    },
  };
}

describe('randomBytes (CSPRNG estricto)', () => {
  let mathRandomSpy: jest.SpyInstance;

  beforeEach(() => {
    mathRandomSpy = jest.spyOn(Math, 'random');
  });

  afterEach(() => {
    mathRandomSpy.mockRestore();
  });

  it('genera con WebCrypto y nunca con Math.random', () => {
    const first = randomBytes(32);
    const second = randomBytes(32);

    expect(first).toHaveLength(32);
    expect(Array.from(first)).not.toEqual(Array.from(second));
    expect(generateSecretToken256()).toMatch(/^[0-9a-f]{64}$/);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });

  it('usa expo-crypto cuando el entorno no trae WebCrypto (Hermes)', () => {
    const getRandomValues = jest.fn((target: Uint8Array) => target.fill(0xab));

    const bytes = withoutWebCrypto({ getRandomValues }, () => randomBytes(16));

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(Array.from(bytes)).toEqual(new Array(16).fill(0xab));
  });

  it('lanza un error explícito cuando no hay ningún CSPRNG', () => {
    withoutWebCrypto('missing', () => {
      expect(() => randomBytes(16)).toThrow(SecureRandomUnavailableError);
      expect(() => generateSecretToken256()).toThrow(SecureRandomUnavailableError);
      expect(() => encryptStorageValue('{"balance":1080000}', SAMPLE_TOKEN)).toThrow(
        SecureRandomUnavailableError
      );
    });
  });

  it('rechaza una fuente que no escribe nada (salida toda en ceros)', () => {
    const silentSource = { getRandomValues: jest.fn() };

    withoutWebCrypto(silentSource, () => {
      expect(() => randomBytes(16)).toThrow(/only zeros/);
      expect(() => randomBytes(32)).toThrow(SecureRandomUnavailableError);
    });
    expect(silentSource.getRandomValues).toHaveBeenCalled();
  });
});

describe('persistentStorage sin CSPRNG', () => {
  afterEach(() => {
    __setStorageBackendForTests(null);
    persistentStorage.clear();
  });

  it('no escribe nada en disco y conserva el valor en memoria', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);

    withoutWebCrypto('missing', () => {
      expect(() => persistentStorage.setItem(SESSION_KEY, { uid: 'uid_1' })).not.toThrow();
    });

    expect(disk.size).toBe(0);
    expect(persistentStorage.getItem<{ uid: string }>(SESSION_KEY)).toEqual({ uid: 'uid_1' });
  });

  it('al rotar descarta el token anterior aunque no pueda generar otro', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);
    persistentStorage.setItem('sensitive_key', { balance: 4_380_000 });
    expect(disk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(true);

    const rotated = withoutWebCrypto('missing', () => rotateDeviceSecretToken());

    expect(rotated).toBeNull();
    expect(disk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);

    // Con un token nuevo, el cifrado anterior no se puede leer y se purga.
    __resetMemoryCacheForTests();
    expect(persistentStorage.getItem('sensitive_key')).toBeNull();
    expect(disk.has('sensitive_key')).toBe(false);
  });
});

interface NativeHarness {
  backend: RawStorageBackend;
  keychain: Map<string, string>;
  sqliteDisk: Map<string, string>;
  secureStore: { failWrites: boolean; failReads: boolean };
}

function loadNativeBackend(initial?: { sqlite?: Record<string, string> }): NativeHarness {
  const keychain = new Map<string, string>();
  const sqliteDisk = new Map<string, string>(Object.entries(initial?.sqlite ?? {}));
  const secureStore = { failWrites: false, failReads: false };
  let backend: RawStorageBackend | null = null;

  jest.isolateModules(() => {
    jest.doMock('expo-secure-store', () => ({
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      getItem: (key: string) => {
        if (secureStore.failReads) throw new Error('Keystore unavailable');
        return keychain.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (secureStore.failWrites) throw new Error('Keystore unavailable');
        keychain.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        keychain.delete(key);
      },
    }));
    jest.doMock('expo-sqlite/kv-store', () => ({
      Storage: {
        getItemSync: (key: string) => sqliteDisk.get(key) ?? null,
        setItemSync: (key: string, value: string) => {
          sqliteDisk.set(key, value);
        },
        removeItemSync: (key: string) => sqliteDisk.delete(key),
        clearSync: () => sqliteDisk.clear(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    backend = (require('../storageBackend.native') as { storageBackend: RawStorageBackend })
      .storageBackend;
    // Resuelve `expo-sqlite/kv-store` mientras el mock sigue registrado.
    backend.getItem('warmup');
  });

  if (!backend) {
    throw new Error('native backend did not load');
  }
  return { backend, keychain, sqliteDisk, secureStore };
}

describe('storageBackend.native: token del dispositivo fail-closed', () => {
  afterEach(() => {
    jest.dontMock('expo-secure-store');
    jest.dontMock('expo-sqlite/kv-store');
  });

  it('guarda el token en el Keychain/Keystore y nunca en SQLite', () => {
    const { backend, keychain, sqliteDisk } = loadNativeBackend();

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);

    expect(keychain.get(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(sqliteDisk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
  });

  it('si SecureStore falla, el token vive solo en memoria', () => {
    const { backend, keychain, sqliteDisk, secureStore } = loadNativeBackend();
    secureStore.failWrites = true;

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);

    expect(sqliteDisk.size).toBe(0);
    expect(keychain.size).toBe(0);
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
  });

  it('un token en memoria no sobrevive a otro proceso', () => {
    const first = loadNativeBackend();
    first.secureStore.failWrites = true;
    first.backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);

    const restarted = loadNativeBackend({ sqlite: Object.fromEntries(first.sqliteDisk) });

    expect(restarted.backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBeNull();
  });

  it('el token más reciente gana al que quedó en el Keychain y se guarda cuando este vuelve', () => {
    const { backend, keychain, secureStore } = loadNativeBackend();
    backend.setItem(DEVICE_SECRET_TOKEN_KEY, 'old-token-old-token-old-token-old-token');

    secureStore.failWrites = true;
    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);

    secureStore.failWrites = false;
    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    expect(keychain.get(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
  });

  it('migra al Keychain el token en texto plano que dejó una versión anterior en SQLite', () => {
    const { backend, keychain, sqliteDisk } = loadNativeBackend({
      sqlite: { [DEVICE_SECRET_TOKEN_KEY]: SAMPLE_TOKEN },
    });

    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(keychain.get(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(sqliteDisk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
  });

  it('borra de SQLite el token heredado aunque SecureStore no esté disponible', () => {
    const { backend, keychain, sqliteDisk, secureStore } = loadNativeBackend({
      sqlite: { [DEVICE_SECRET_TOKEN_KEY]: SAMPLE_TOKEN },
    });
    secureStore.failWrites = true;
    secureStore.failReads = true;

    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(sqliteDisk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
    expect(keychain.size).toBe(0);
    // Sigue disponible para la sesión en curso.
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
  });

  it('removeItem y clear olvidan el token en memoria', () => {
    const { backend, secureStore } = loadNativeBackend();
    secureStore.failWrites = true;

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    backend.removeItem(DEVICE_SECRET_TOKEN_KEY);
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBeNull();

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    backend.clear();
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBeNull();
  });

  it('las claves de sesión, ya cifradas, sí pueden caer a SQLite', () => {
    const { backend, sqliteDisk, secureStore } = loadNativeBackend();
    secureStore.failWrites = true;
    const ciphertext = encryptStorageValue('{"uid":"uid_1"}', SAMPLE_TOKEN);

    backend.setItem(SESSION_KEY, ciphertext);

    expect(sqliteDisk.get(SESSION_KEY)).toBe(ciphertext);
    expect(isEncryptedStoragePayload(sqliteDisk.get(SESSION_KEY) ?? '')).toBe(true);
  });

  it('con SecureStore caído, persistentStorage no deja la llave junto al cifrado', () => {
    const { backend, sqliteDisk, secureStore } = loadNativeBackend();
    secureStore.failWrites = true;
    __setStorageBackendForTests(backend);

    try {
      persistentStorage.setItem('bflow.account.cache.v2.uid_1', { balanceCop: 1_080_000 });

      expect(sqliteDisk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
      const stored = sqliteDisk.get('bflow.account.cache.v2.uid_1') ?? '';
      expect(isEncryptedStoragePayload(stored)).toBe(true);
      for (const value of sqliteDisk.values()) {
        expect(isEncryptedStoragePayload(value)).toBe(true);
      }

      // La sesión en curso sigue leyendo su caché.
      __resetMemoryCacheForTests();
      expect(persistentStorage.getItem('bflow.account.cache.v2.uid_1')).toEqual({
        balanceCop: 1_080_000,
      });
    } finally {
      __setStorageBackendForTests(null);
      persistentStorage.clear();
    }
  });
});

type WebStorageName = 'localStorage' | 'sessionStorage';

function installFakeWebStorage(name: WebStorageName): { store: Map<string, string>; restore: () => void } {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
  });
  return {
    store,
    restore: () => {
      if (original) {
        Object.defineProperty(globalThis, name, original);
      } else {
        delete (globalThis as Record<string, unknown>)[name];
      }
    },
  };
}

/** Carga una copia nueva del backend Web: equivale a abrir la app en otra pestaña. */
function loadWebBackend(): RawStorageBackend {
  let backend: RawStorageBackend | null = null;
  jest.isolateModules(() => {
    // La extensión explícita evita que Jest resuelva `storageBackend.native.ts`.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    backend = (require('../storageBackend.ts') as { storageBackend: RawStorageBackend })
      .storageBackend;
  });
  if (!backend) {
    throw new Error('web backend did not load');
  }
  return backend;
}

describe('storageBackend (Web): token fuera de localStorage', () => {
  let local: ReturnType<typeof installFakeWebStorage>;
  let session: ReturnType<typeof installFakeWebStorage> | null;

  beforeEach(() => {
    local = installFakeWebStorage('localStorage');
    session = installFakeWebStorage('sessionStorage');
  });

  afterEach(() => {
    __setStorageBackendForTests(null);
    persistentStorage.clear();
    local.restore();
    session?.restore();
  });

  it('guarda el token en sessionStorage y el cifrado en localStorage', () => {
    const backend = loadWebBackend();

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    backend.setItem('web_key', 'enc:v1:payload');

    expect(session?.store.get(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(local.store.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
    expect(local.store.get('web_key')).toBe('enc:v1:payload');
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
  });

  it('migra el token que una versión anterior dejó en localStorage', () => {
    local.store.set(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    const backend = loadWebBackend();

    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(session?.store.get(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(local.store.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
  });

  it('sin sessionStorage el token queda en memoria, nunca en localStorage', () => {
    session?.restore();
    session = null;
    const backend = loadWebBackend();

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);

    expect(local.store.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBe(SAMPLE_TOKEN);
    expect(loadWebBackend().getItem(DEVICE_SECRET_TOKEN_KEY)).toBeNull();
  });

  it('removeItem y clear borran el token de sessionStorage', () => {
    const backend = loadWebBackend();

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    backend.removeItem(DEVICE_SECRET_TOKEN_KEY);
    expect(session?.store.size).toBe(0);
    expect(backend.getItem(DEVICE_SECRET_TOKEN_KEY)).toBeNull();

    backend.setItem(DEVICE_SECRET_TOKEN_KEY, SAMPLE_TOKEN);
    backend.setItem('web_key', 'enc:v1:payload');
    backend.clear();
    expect(session?.store.size).toBe(0);
    expect(local.store.size).toBe(0);
  });

  it('localStorage solo contiene cifrado y otra pestaña no puede leerlo', () => {
    __setStorageBackendForTests(loadWebBackend());
    persistentStorage.setItem('web_key', { persistedOnWeb: 42 });

    expect(local.store.has(DEVICE_SECRET_TOKEN_KEY)).toBe(false);
    for (const value of local.store.values()) {
      expect(isEncryptedStoragePayload(value)).toBe(true);
    }

    // Misma pestaña tras recargar: sessionStorage conserva la llave.
    __setStorageBackendForTests(loadWebBackend());
    __resetMemoryCacheForTests();
    expect(persistentStorage.getItem('web_key')).toEqual({ persistedOnWeb: 42 });

    // Pestaña nueva: sessionStorage vacío, la entrada no se descifra y se purga.
    session?.store.clear();
    __setStorageBackendForTests(loadWebBackend());
    __resetMemoryCacheForTests();
    expect(persistentStorage.getItem('web_key')).toBeNull();
    expect(local.store.has('web_key')).toBe(false);
  });
});
