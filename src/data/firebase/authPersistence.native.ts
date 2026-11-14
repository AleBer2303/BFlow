/**
 * src/data/firebase/authPersistence.native.ts
 *
 * Resolves the Firebase Auth `Persistence` strategy for iOS and Android
 * (Mode A Expo Go and Mode B `.ipa` / `.apk` — ADR 0015 & ADR 0016):
 * - Stores the active Firebase Auth session token directly in `expo-secure-store`
 *   (iOS Keychain / Android Keystore) encrypted with AES-256-CTR + HMAC-SHA256,
 *   with automatic fallback to encrypted `expo-sqlite/kv-store` if a payload exceeds
 *   the 1,800-byte Keychain/Keystore threshold.
 * - Wrapped in Firebase Auth's `getReactNativePersistence`.
 * - Falls back to `inMemoryPersistence` if `getReactNativePersistence` is unavailable.
 */

import * as SecureStore from 'expo-secure-store';
import * as FirebaseAuthModule from 'firebase/auth';
import { inMemoryPersistence, type Persistence } from 'firebase/auth';
import {
  decryptRawStringFromStorage,
  encryptRawStringForStorage,
} from '../../platform/storage/persistentStorageAdapter';
import { getOptionalSqliteKvStore } from '../../platform/storage/sqliteKvStore';
import { isEncryptedStoragePayload } from '../../platform/storage/storageCipher';

export interface FirebaseReactNativeAsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const SECURE_STORE_MAX_SAFE_BYTES = 1800;

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function toSecureStoreKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createMemoryAsyncStorage(): FirebaseReactNativeAsyncStorage {
  const memory = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return memory.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      memory.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      memory.delete(key);
    },
  };
}

function createLazySqliteOrMemoryFallback(): FirebaseReactNativeAsyncStorage {
  const memoryFallback = createMemoryAsyncStorage();
  const resolveStore = (): FirebaseReactNativeAsyncStorage => {
    const sqlite = getOptionalSqliteKvStore();
    return sqlite && typeof sqlite.getItem === 'function' ? sqlite : memoryFallback;
  };
  return {
    getItem: (key) => resolveStore().getItem(key),
    setItem: (key, value) => resolveStore().setItem(key, value),
    removeItem: (key) => resolveStore().removeItem(key),
  };
}

export function createEncryptedNativeAuthStorage(
  fallbackKvStore: FirebaseReactNativeAsyncStorage = createLazySqliteOrMemoryFallback()
): FirebaseReactNativeAsyncStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const safeKey = toSecureStoreKey(key);
      let raw: string | null = null;

      try {
        raw = await SecureStore.getItemAsync(safeKey, SECURE_STORE_OPTIONS);
      } catch {
        raw = null;
      }

      if (!raw) {
        try {
          raw = await fallbackKvStore.getItem(key);
        } catch {
          raw = null;
        }
      }

      if (!raw) {
        return null;
      }

      if (isEncryptedStoragePayload(raw)) {
        const decrypted = decryptRawStringFromStorage(raw);
        if (decrypted === null) {
          await this.removeItem(key);
          return null;
        }
        return decrypted;
      }

      // Legacy plaintext Firebase Auth token -> encrypt and migrate to SecureStore
      try {
        const encrypted = encryptRawStringForStorage(raw);
        if (encrypted.length <= SECURE_STORE_MAX_SAFE_BYTES) {
          await SecureStore.setItemAsync(safeKey, encrypted, SECURE_STORE_OPTIONS);
          await fallbackKvStore.removeItem(key);
        } else {
          await fallbackKvStore.setItem(key, encrypted);
        }
      } catch {
        // Ignore migration error
      }
      return raw;
    },

    async setItem(key: string, value: string): Promise<void> {
      const safeKey = toSecureStoreKey(key);
      const encrypted = encryptRawStringForStorage(value);

      if (encrypted.length <= SECURE_STORE_MAX_SAFE_BYTES) {
        try {
          await SecureStore.setItemAsync(safeKey, encrypted, SECURE_STORE_OPTIONS);
          try {
            await fallbackKvStore.removeItem(key);
          } catch {
            // Ignore cleanup error
          }
          return;
        } catch {
          // Fall through to SQLite kv-store if SecureStore fails
        }
      }

      await fallbackKvStore.setItem(key, encrypted);
    },

    async removeItem(key: string): Promise<void> {
      const safeKey = toSecureStoreKey(key);
      try {
        await SecureStore.deleteItemAsync(safeKey, SECURE_STORE_OPTIONS);
      } catch {
        // Ignore SecureStore delete error
      }
      try {
        await fallbackKvStore.removeItem(key);
      } catch {
        // Ignore SQLite delete error
      }
    },
  };
}

export const encryptedNativeAuthStorage: FirebaseReactNativeAsyncStorage =
  createEncryptedNativeAuthStorage();

type GetReactNativePersistenceFn = (
  storage: FirebaseReactNativeAsyncStorage
) => Persistence;

export function resolveFirebaseAuthPersistence(
  storage: FirebaseReactNativeAsyncStorage = encryptedNativeAuthStorage
): Persistence {
  const maybeGetReactNativePersistence = (
    FirebaseAuthModule as unknown as {
      getReactNativePersistence?: GetReactNativePersistenceFn;
    }
  ).getReactNativePersistence;

  if (typeof maybeGetReactNativePersistence === 'function') {
    return maybeGetReactNativePersistence(storage);
  }

  return inMemoryPersistence;
}
