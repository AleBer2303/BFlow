import type { Persistence } from 'firebase/auth';
import { Platform } from 'react-native';
import { isEncryptedStoragePayload } from '../../platform/storage/storageCipher';

describe('Firebase Auth Persistence resolution & SecureStore Encryption (R-02 & ADR 0016)', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('uses browserLocalPersistence on web and inMemoryPersistence in non-web environment', () => {
    const fakeBrowserPersistence: Persistence = { type: 'LOCAL' };
    const fakeMemoryPersistence: Persistence = { type: 'NONE' };

    jest.isolateModules(() => {
      jest.doMock('firebase/auth', () => ({
        browserLocalPersistence: fakeBrowserPersistence,
        inMemoryPersistence: fakeMemoryPersistence,
      }));

      // Explicitly require `.ts` because Jest resolves `.native.ts` by default
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveFirebaseAuthPersistence: resolveWebAuthPersistence } = require('../firebase/authPersistence.ts') as {
        resolveFirebaseAuthPersistence: () => Persistence;
      };

      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      expect(resolveWebAuthPersistence()).toBe(fakeBrowserPersistence);

      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
      expect(resolveWebAuthPersistence()).toBe(fakeMemoryPersistence);
    });
  });

  it('uses getReactNativePersistence with encrypted expo-secure-store + expo-sqlite/kv-store in authPersistence.native', async () => {
    const secureStoreMap = new Map<string, string>();
    const sqliteMap = new Map<string, string>();

    const fakeSecureStore = {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      getItem: jest.fn((key: string) => secureStoreMap.get(key) ?? null),
      setItem: jest.fn((key: string, val: string) => {
        secureStoreMap.set(key, val);
      }),
      getItemAsync: jest.fn(async (key: string) => secureStoreMap.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, val: string) => {
        secureStoreMap.set(key, val);
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        secureStoreMap.delete(key);
      }),
    };

    const fakeKvStore = {
      getItem: jest.fn(async (key: string) => sqliteMap.get(key) ?? null),
      setItem: jest.fn(async (key: string, val: string) => {
        sqliteMap.set(key, val);
      }),
      removeItem: jest.fn(async (key: string) => {
        sqliteMap.delete(key);
      }),
      getItemSync: jest.fn((key: string) => sqliteMap.get(key) ?? null),
      setItemSync: jest.fn((key: string, val: string) => {
        sqliteMap.set(key, val);
      }),
      removeItemSync: jest.fn((key: string) => {
        sqliteMap.delete(key);
      }),
      clearSync: jest.fn(() => {
        sqliteMap.clear();
      }),
    };
    const fakePersistence: Persistence = { type: 'LOCAL' };
    const mockGetReactNativePersistence = jest.fn(() => fakePersistence);

    let capturedStorage: {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
    } | null = null;

    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => fakeSecureStore);
      jest.doMock('expo-sqlite/kv-store', () => ({
        __esModule: true,
        default: fakeKvStore,
        AsyncStorage: fakeKvStore,
        Storage: fakeKvStore,
      }));
      jest.doMock('firebase/auth', () => ({
        inMemoryPersistence: { type: 'NONE' },
        getReactNativePersistence: (storage: typeof capturedStorage) => {
          capturedStorage = storage;
          return mockGetReactNativePersistence();
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveFirebaseAuthPersistence: resolveNativeAuthPersistence } = require('../firebase/authPersistence.native') as {
        resolveFirebaseAuthPersistence: () => Persistence;
      };

      const resolved = resolveNativeAuthPersistence();
      expect(mockGetReactNativePersistence).toHaveBeenCalled();
      expect(resolved).toBe(fakePersistence);
    });

    expect(capturedStorage).not.toBeNull();
    const firebaseKey = 'firebase:authUser:AIzaSyTestKey:[DEFAULT]';
    const tokenJson = JSON.stringify({
      uid: 'uid_firebase_1',
      stsTokenManager: {
        accessToken: 'jwt_secret_access_token',
        refreshToken: 'jwt_secret_refresh_token',
      },
    });

    await capturedStorage!.setItem(firebaseKey, tokenJson);

    // Must be stored in SecureStore under sanitized key, encrypted with AES-256 + HMAC-SHA256
    const sanitizedKey = 'firebase_authUser_AIzaSyTestKey__DEFAULT_';
    const rawStoredInKeychain = secureStoreMap.get(sanitizedKey);
    expect(rawStoredInKeychain).toBeDefined();
    expect(isEncryptedStoragePayload(rawStoredInKeychain!)).toBe(true);
    expect(rawStoredInKeychain).not.toContain('jwt_secret_access_token');

    // Reading decrypts back to the exact Firebase Auth JSON
    const decrypted = await capturedStorage!.getItem(firebaseKey);
    expect(decrypted).toBe(tokenJson);

    // Removing deletes from SecureStore
    await capturedStorage!.removeItem(firebaseKey);
    expect(await capturedStorage!.getItem(firebaseKey)).toBeNull();
  });

  it('falls back to inMemoryPersistence if getReactNativePersistence is not present on the module', () => {
    const fakeKvStore = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => {}),
      removeItem: jest.fn(async () => {}),
    };
    const fallbackPersistence: Persistence = { type: 'NONE' };

    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => ({
        AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      }));
      jest.doMock('expo-sqlite/kv-store', () => ({
        __esModule: true,
        default: fakeKvStore,
      }));
      jest.doMock('firebase/auth', () => ({
        inMemoryPersistence: fallbackPersistence,
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveFirebaseAuthPersistence: resolveNativeAuthPersistence } = require('../firebase/authPersistence.native') as {
        resolveFirebaseAuthPersistence: () => Persistence;
      };

      expect(resolveNativeAuthPersistence()).toBe(fallbackPersistence);
    });
  });

  it('degrades gracefully to SecureStore + in-memory fallback when ExpoSQLite native module is missing (Android Expo Go)', async () => {
    const secureStoreMap = new Map<string, string>();
    const fakeSecureStore = {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      getItem: jest.fn((key: string) => secureStoreMap.get(key) ?? null),
      setItem: jest.fn((key: string, val: string) => {
        secureStoreMap.set(key, val);
      }),
      getItemAsync: jest.fn(async (key: string) => secureStoreMap.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, val: string) => {
        secureStoreMap.set(key, val);
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        secureStoreMap.delete(key);
      }),
    };
    const fakePersistence: Persistence = { type: 'LOCAL' };
    let capturedStorage: {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
    } | null = null;

    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => fakeSecureStore);
      jest.doMock('expo-sqlite/kv-store', () => {
        throw new Error("Cannot find native module 'ExpoSQLite'");
      });
      jest.doMock('firebase/auth', () => ({
        inMemoryPersistence: { type: 'NONE' },
        getReactNativePersistence: (storage: typeof capturedStorage) => {
          capturedStorage = storage;
          return fakePersistence;
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveFirebaseAuthPersistence: resolveNativeAuthPersistence } = require('../firebase/authPersistence.native') as {
        resolveFirebaseAuthPersistence: () => Persistence;
      };

      expect(resolveNativeAuthPersistence()).toBe(fakePersistence);
    });

    expect(capturedStorage).not.toBeNull();
    // Large payload (> 1,800 bytes) bypasses SecureStore and uses the in-memory fallback without throwing
    const largePayload = JSON.stringify({ padding: 'x'.repeat(2500) });
    await capturedStorage!.setItem('firebase:authUser:large', largePayload);
    expect(await capturedStorage!.getItem('firebase:authUser:large')).toBe(largePayload);
    await capturedStorage!.removeItem('firebase:authUser:large');
    expect(await capturedStorage!.getItem('firebase:authUser:large')).toBeNull();
  });
});
