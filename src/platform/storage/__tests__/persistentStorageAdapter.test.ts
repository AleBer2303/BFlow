import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  DEVICE_SECRET_TOKEN_KEY,
  decryptRawStringFromStorage,
  persistentStorage,
  rotateDeviceSecretToken,
  type RawStorageBackend,
} from '../persistentStorageAdapter';
import {
  bytesToHex,
  decryptStorageValue,
  ENCRYPTED_PAYLOAD_PREFIX,
  encryptStorageValue,
  isEncryptedStoragePayload,
  sha256,
  utf8ToBytes,
} from '../storageCipher';

// Explicitly import `.ts` so Jest (whose moduleFileExtensions puts `.native.ts` first)
// loads the web localStorage backend under test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { storageBackend: webStorageBackend } = require('../storageBackend.ts') as {
  storageBackend: RawStorageBackend;
};

function createSimulatedDiskBackend(): {
  backend: RawStorageBackend;
  disk: Map<string, string>;
} {
  const disk = new Map<string, string>();
  const backend: RawStorageBackend = {
    getItem(key) {
      return disk.get(key) ?? null;
    },
    setItem(key, value) {
      disk.set(key, value);
    },
    removeItem(key) {
      disk.delete(key);
    },
    clear() {
      disk.clear();
    },
  };
  return { backend, disk };
}

describe('storageCipher (NIST SHA-256 & AES-256-CTR + HMAC-SHA256)', () => {
  it('computes the exact NIST FIPS 180-4 SHA-256 vector for "abc"', () => {
    const digest = bytesToHex(sha256(utf8ToBytes('abc')));
    expect(digest).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('encrypts with AES-256-CTR + HMAC-SHA256 using pepper + token and rejects tampered or wrong-key payloads', () => {
    const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const pepper = 'palabra-secreta-bflow-2026';
    const secretJson = JSON.stringify({
      uid: 'uid_owner',
      netCashFlow: 1_080_000,
      refreshToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ',
    });

    const encrypted = encryptStorageValue(secretJson, token, pepper);
    expect(isEncryptedStoragePayload(encrypted)).toBe(true);
    expect(encrypted.startsWith(ENCRYPTED_PAYLOAD_PREFIX)).toBe(true);
    expect(encrypted).not.toContain('1080000');
    expect(encrypted).not.toContain('eyJhbGci');

    // Valid token + pepper decrypts accurately
    expect(decryptStorageValue(encrypted, token, pepper)).toBe(secretJson);

    // Wrong token or wrong pepper returns null
    expect(decryptStorageValue(encrypted, 'wrong_token_0000', pepper)).toBeNull();
    expect(decryptStorageValue(encrypted, token, 'otra-palabra-distinta')).toBeNull();

    // Tampered ciphertext (flip last character of MAC) returns null
    const lastChar = encrypted.endsWith('a') ? 'b' : 'a';
    const tampered = encrypted.slice(0, -1) + lastChar;
    expect(decryptStorageValue(tampered, token, pepper)).toBeNull();
  });
});

describe('persistentStorageAdapter (Encrypted Persistence ADR 0015 & ADR 0016)', () => {
  beforeEach(() => {
    __setStorageBackendForTests(null);
    persistentStorage.clear();
  });

  afterEach(() => {
    __setStorageBackendForTests(null);
    persistentStorage.clear();
  });

  it('stores and retrieves serialized objects', () => {
    const testData = { userId: 'usr-123', settings: { theme: 'dark', notifications: true } };
    persistentStorage.setItem('test_key', testData);

    const retrieved = persistentStorage.getItem<typeof testData>('test_key');
    expect(retrieved).toEqual(testData);
  });

  it('returns null for nonexistent keys', () => {
    expect(persistentStorage.getItem('nonexistent')).toBeNull();
  });

  it('removes items successfully from both memory and backend', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);

    persistentStorage.setItem('temp', { active: true });
    expect(disk.has('temp')).toBe(true);

    persistentStorage.removeItem('temp');
    expect(persistentStorage.getItem('temp')).toBeNull();
    __resetMemoryCacheForTests();
    expect(persistentStorage.getItem('temp')).toBeNull();
    expect(disk.has('temp')).toBe(false);
  });

  it('clears all items successfully from both memory and backend', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);

    persistentStorage.setItem('k1', 'val1');
    persistentStorage.setItem('k2', 'val2');
    // k1, k2, and the generated 256-bit device secret token
    expect(disk.has('k1')).toBe(true);
    expect(disk.has('k2')).toBe(true);
    expect(disk.has(DEVICE_SECRET_TOKEN_KEY)).toBe(true);

    persistentStorage.clear();
    __resetMemoryCacheForTests();
    expect(persistentStorage.getItem('k1')).toBeNull();
    expect(persistentStorage.getItem('k2')).toBeNull();
    expect(disk.size).toBe(0);
  });

  it('encrypts payloads on disk and survives resetting the in-memory Map (R-01 + ADR 0016)', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);

    const sessionPayload = {
      uid: 'uid-native-1',
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
    };
    persistentStorage.setItem('bflow.auth.session.v1', sessionPayload);

    const rawOnDisk = disk.get('bflow.auth.session.v1');
    expect(rawOnDisk).toBeDefined();
    expect(isEncryptedStoragePayload(rawOnDisk!)).toBe(true);
    expect(rawOnDisk).not.toContain('demo.owner@bflow.example');
    expect(decryptRawStringFromStorage(rawOnDisk!)).toBe(JSON.stringify(sessionPayload));

    // Simulate closing the app / cold restart: wipe the in-memory Map
    __resetMemoryCacheForTests();

    const restored = persistentStorage.getItem<typeof sessionPayload>('bflow.auth.session.v1');
    expect(restored).toEqual(sessionPayload);
  });

  it('purges tampered ciphertexts and invalidates old ciphertexts when rotateDeviceSecretToken is called', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);

    persistentStorage.setItem('sensitive_key', { balance: 4_380_000 });
    __resetMemoryCacheForTests();

    // Rotate the device secret token (as happens on sign-out)
    rotateDeviceSecretToken();
    __resetMemoryCacheForTests();

    // Old ciphertext can no longer be decrypted with the rotated token and is purged
    expect(persistentStorage.getItem('sensitive_key')).toBeNull();
    expect(disk.has('sensitive_key')).toBe(false);
  });

  it('migrates legacy plaintext JSON entries to encrypted envelopes on first read', () => {
    const { backend, disk } = createSimulatedDiskBackend();
    __setStorageBackendForTests(backend);

    const legacyJson = JSON.stringify({ uid: 'legacy_user_1', migrated: true });
    disk.set('bflow.auth.session.v1', legacyJson);

    const loaded = persistentStorage.getItem<{ uid: string; migrated: boolean }>(
      'bflow.auth.session.v1'
    );
    expect(loaded).toEqual({ uid: 'legacy_user_1', migrated: true });

    // The entry on disk must now be encrypted with AES-256 + HMAC-SHA256
    const migratedOnDisk = disk.get('bflow.auth.session.v1');
    expect(migratedOnDisk).toBeDefined();
    expect(isEncryptedStoragePayload(migratedOnDisk!)).toBe(true);
  });

  it('demonstrates the failure when backend does not persist (like Hermes without localStorage before R-01)', () => {
    const noopBackend: RawStorageBackend = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };
    __setStorageBackendForTests(noopBackend);

    persistentStorage.setItem('ephemeral_key', { ok: true });
    expect(persistentStorage.getItem('ephemeral_key')).toEqual({ ok: true });

    // Once the in-memory Map is cleared, a non-persistent backend loses everything
    __resetMemoryCacheForTests();
    expect(persistentStorage.getItem('ephemeral_key')).toBeNull();
  });

  it('delegates to globalThis.localStorage in the default web backend with AES-256 encryption and survives memory reset', () => {
    const fakeStore = new Map<string, string>();
    const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => fakeStore.get(k) ?? null,
        setItem: (k: string, v: string) => {
          fakeStore.set(k, v);
        },
        removeItem: (k: string) => {
          fakeStore.delete(k);
        },
        clear: () => {
          fakeStore.clear();
        },
      },
    });

    try {
      __setStorageBackendForTests(webStorageBackend);
      persistentStorage.setItem('web_key', { persistedOnWeb: 42 });

      expect(isEncryptedStoragePayload(fakeStore.get('web_key')!)).toBe(true);

      __resetMemoryCacheForTests();

      expect(persistentStorage.getItem('web_key')).toEqual({ persistedOnWeb: 42 });
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).localStorage;
      }
    }
  });
});

describe('storageBackend.native (expo-secure-store + expo-sqlite/kv-store)', () => {
  it('stores device token and session keys in expo-secure-store and budget cache in expo-sqlite/kv-store (all encrypted)', () => {
    const secureKeychain = new Map<string, string>();
    const sqliteDisk = new Map<string, string>();

    const mockSecureGetItem = jest.fn((key: string) => secureKeychain.get(key) ?? null);
    const mockSecureSetItem = jest.fn((key: string, value: string) => {
      secureKeychain.set(key, value);
    });
    const mockSecureDeleteItemAsync = jest.fn(async (key: string) => {
      secureKeychain.delete(key);
    });

    const mockGetItemSync = jest.fn((key: string) => sqliteDisk.get(key) ?? null);
    const mockSetItemSync = jest.fn((key: string, value: string) => {
      sqliteDisk.set(key, value);
    });
    const mockRemoveItemSync = jest.fn((key: string) => {
      sqliteDisk.delete(key);
      return true;
    });
    const mockClearSync = jest.fn(() => {
      sqliteDisk.clear();
      return true;
    });

    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => ({
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
        getItem: mockSecureGetItem,
        setItem: mockSecureSetItem,
        deleteItemAsync: mockSecureDeleteItemAsync,
      }));
      jest.doMock('expo-sqlite/kv-store', () => ({
        Storage: {
          getItemSync: mockGetItemSync,
          setItemSync: mockSetItemSync,
          removeItemSync: mockRemoveItemSync,
          clearSync: mockClearSync,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { storageBackend: nativeBackend } = require('../storageBackend.native') as {
        storageBackend: RawStorageBackend;
      };

      __setStorageBackendForTests(nativeBackend);

      // 1. Session key goes directly to expo-secure-store (Keychain/Keystore), NOT SQLite
      persistentStorage.setItem('bflow.auth.session.v1', {
        uid: 'uid_secure_1',
        email: 'demo.owner@bflow.example',
      });
      expect(mockSecureSetItem).toHaveBeenCalled();
      expect(secureKeychain.has('bflow.auth.session.v1')).toBe(true);
      expect(isEncryptedStoragePayload(secureKeychain.get('bflow.auth.session.v1')!)).toBe(true);
      expect(sqliteDisk.has('bflow.auth.session.v1')).toBe(false);

      // 2. Budget cache key goes to expo-sqlite/kv-store encrypted with AES-256
      persistentStorage.setItem('bflow.account.cache.v2.uid_secure_1', {
        balanceCop: 1_080_000,
      });
      expect(mockSetItemSync).toHaveBeenCalled();
      const rawSqliteValue = sqliteDisk.get('bflow.account.cache.v2.uid_secure_1');
      expect(rawSqliteValue).toBeDefined();
      expect(isEncryptedStoragePayload(rawSqliteValue!)).toBe(true);
      expect(rawSqliteValue).not.toContain('1080000');

      // 3. Wipe in-memory Map to force reading from SecureStore + SQLite kv-store
      __resetMemoryCacheForTests();

      const loadedSession = persistentStorage.getItem<{ uid: string; email: string }>(
        'bflow.auth.session.v1'
      );
      expect(loadedSession).toEqual({
        uid: 'uid_secure_1',
        email: 'demo.owner@bflow.example',
      });

      const loadedBudget = persistentStorage.getItem<{ balanceCop: number }>(
        'bflow.account.cache.v2.uid_secure_1'
      );
      expect(loadedBudget).toEqual({ balanceCop: 1_080_000 });

      // 4. Removal clears both SecureStore and SQLite
      persistentStorage.removeItem('bflow.auth.session.v1');
      persistentStorage.removeItem('bflow.account.cache.v2.uid_secure_1');
      __resetMemoryCacheForTests();
      expect(persistentStorage.getItem('bflow.auth.session.v1')).toBeNull();
      expect(persistentStorage.getItem('bflow.account.cache.v2.uid_secure_1')).toBeNull();

      persistentStorage.setItem('another_key', 'value');
      persistentStorage.clear();
      expect(mockClearSync).toHaveBeenCalled();
    });
  });

  it('keeps SecureStore working and falls back to in-memory storage when ExpoSQLite native module is missing', () => {
    const secureKeychain = new Map<string, string>();
    const mockSecureGetItem = jest.fn((key: string) => secureKeychain.get(key) ?? null);
    const mockSecureSetItem = jest.fn((key: string, value: string) => {
      secureKeychain.set(key, value);
    });
    const mockSecureDeleteItemAsync = jest.fn(async (key: string) => {
      secureKeychain.delete(key);
    });

    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => ({
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
        getItem: mockSecureGetItem,
        setItem: mockSecureSetItem,
        deleteItemAsync: mockSecureDeleteItemAsync,
      }));
      jest.doMock('expo-sqlite/kv-store', () => {
        throw new Error("Cannot find native module 'ExpoSQLite'");
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { storageBackend: nativeBackend } = require('../storageBackend.native') as {
        storageBackend: RawStorageBackend;
      };

      __setStorageBackendForTests(nativeBackend);

      // Session keys still persist in SecureStore
      persistentStorage.setItem('bflow.auth.session.v1', { uid: 'uid_expo_go' });
      expect(secureKeychain.has('bflow.auth.session.v1')).toBe(true);

      // Account cache falls back to in-memory Map without throwing
      persistentStorage.setItem('bflow.account.cache.v2.uid_expo_go', { balanceCop: 500_000 });
      __resetMemoryCacheForTests();

      expect(
        persistentStorage.getItem<{ uid: string }>('bflow.auth.session.v1')
      ).toEqual({ uid: 'uid_expo_go' });
      expect(
        persistentStorage.getItem<{ balanceCop: number }>('bflow.account.cache.v2.uid_expo_go')
      ).toEqual({ balanceCop: 500_000 });

      persistentStorage.removeItem('bflow.account.cache.v2.uid_expo_go');
      __resetMemoryCacheForTests();
      expect(
        persistentStorage.getItem('bflow.account.cache.v2.uid_expo_go')
      ).toBeNull();

      persistentStorage.clear();
    });
  });
});
