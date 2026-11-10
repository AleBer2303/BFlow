/**
 * src/platform/storage/storageBackend.native.ts
 *
 * Hybrid synchronous native storage backend for iOS and Android
 * (Mode A Expo Go and Mode B `.ipa` / `.apk` — ADR 0015 & ADR 0016):
 *
 * 1. Hardware-backed `expo-secure-store` (iOS Keychain / Android Keystore)
 *    for the 256-bit generated device secret token (`bflow.security.device_token.v1`)
 *    and active session keys (`bflow.auth.session.v1`, `firebase:authUser:...`).
 * 2. `expo-sqlite/kv-store` for larger encrypted payloads such as the user's
 *    budget account cache (`bflow.account.cache.v2.<uid>`), which are encrypted
 *    with AES-256-CTR + HMAC-SHA256 before reaching this backend.
 */

import * as SecureStore from 'expo-secure-store';
import { Storage } from 'expo-sqlite/kv-store';

export interface RawStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

const DEVICE_SECRET_TOKEN_KEY = 'bflow.security.device_token.v1';
const SECURE_STORE_MAX_SAFE_BYTES = 1800;

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function isDirectSecureStoreSessionKey(key: string): boolean {
  return (
    key === DEVICE_SECRET_TOKEN_KEY ||
    key === 'bflow.auth.session.v1' ||
    key.startsWith('firebase:authUser:') ||
    key.startsWith('firebase_authUser_')
  );
}

function toSecureStoreKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const trackedSecureStoreKeys = new Set<string>([
  toSecureStoreKey(DEVICE_SECRET_TOKEN_KEY),
  toSecureStoreKey('bflow.auth.session.v1'),
]);

function deleteFromSecureStoreSyncAndAsync(rawKey: string): void {
  const safeKey = toSecureStoreKey(rawKey);
  try {
    // Synchronous tombstone so immediate subsequent `getItem` returns null
    SecureStore.setItem(safeKey, '', SECURE_STORE_OPTIONS);
  } catch {
    // Ignore if Keychain/Keystore is unavailable
  }
  try {
    void SecureStore.deleteItemAsync(safeKey, SECURE_STORE_OPTIONS).catch(() => {});
  } catch {
    // Ignore async deletion error
  }
}

export const storageBackend: RawStorageBackend = {
  getItem(key: string): string | null {
    if (isDirectSecureStoreSessionKey(key)) {
      const safeKey = toSecureStoreKey(key);
      trackedSecureStoreKeys.add(safeKey);
      try {
        const secureVal = SecureStore.getItem(safeKey, SECURE_STORE_OPTIONS);
        if (secureVal !== null && secureVal.length > 0) {
          return secureVal;
        }
      } catch {
        // Fallback to SQLite if SecureStore throws
      }

      // Check SQLite fallback (or legacy pre-ADR-0016 entry) and migrate to SecureStore if small enough
      try {
        const fallbackVal = Storage.getItemSync(key);
        if (fallbackVal !== null && fallbackVal.length > 0) {
          if (fallbackVal.length <= SECURE_STORE_MAX_SAFE_BYTES) {
            try {
              SecureStore.setItem(safeKey, fallbackVal, SECURE_STORE_OPTIONS);
              Storage.removeItemSync(key);
            } catch {
              // Keep in SQLite if SecureStore write fails
            }
          }
          return fallbackVal;
        }
      } catch {
        return null;
      }
      return null;
    }

    try {
      return Storage.getItemSync(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (isDirectSecureStoreSessionKey(key) && value.length <= SECURE_STORE_MAX_SAFE_BYTES) {
      const safeKey = toSecureStoreKey(key);
      trackedSecureStoreKeys.add(safeKey);
      try {
        SecureStore.setItem(safeKey, value, SECURE_STORE_OPTIONS);
        try {
          Storage.removeItemSync(key);
        } catch {
          // Ignore cleanup error
        }
        return;
      } catch {
        // Fallback to SQLite if SecureStore write fails
      }
    }

    try {
      Storage.setItemSync(key, value);
    } catch {
      // Ignore SQLite I/O error
    }
  },

  removeItem(key: string): void {
    if (isDirectSecureStoreSessionKey(key)) {
      deleteFromSecureStoreSyncAndAsync(key);
    }
    try {
      Storage.removeItemSync(key);
    } catch {
      // Ignore SQLite I/O error
    }
  },

  clear(): void {
    for (const safeKey of trackedSecureStoreKeys) {
      deleteFromSecureStoreSyncAndAsync(safeKey);
    }
    try {
      Storage.clearSync();
    } catch {
      // Ignore SQLite I/O error
    }
  },
};
