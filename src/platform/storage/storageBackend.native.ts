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
 *
 * Fail-closed (ADR 0027): the device secret token is the only value that reaches this backend
 * in plain text, so it is never written to SQLite. If the Keychain/Keystore rejects the write,
 * the token lives in memory until the app closes. Session keys are already ciphertext and may
 * still fall back to SQLite, which does not hold the key that decrypts them.
 */

import * as SecureStore from 'expo-secure-store';
import { getOptionalSqliteKvStore, type OptionalSqliteKvStore } from './sqliteKvStore';

export interface RawStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

const memoryFallbackStore = new Map<string, string>();

function getSyncSqliteStore(): OptionalSqliteKvStore | null {
  const store = getOptionalSqliteKvStore();
  return store && typeof store.getItemSync === 'function' ? store : null;
}

function readFallbackKv(key: string): string | null {
  const sqlite = getSyncSqliteStore();
  if (sqlite) {
    return sqlite.getItemSync(key);
  }
  return memoryFallbackStore.get(key) ?? null;
}

function writeFallbackKv(key: string, value: string): void {
  const sqlite = getSyncSqliteStore();
  if (sqlite) {
    sqlite.setItemSync(key, value);
    return;
  }
  memoryFallbackStore.set(key, value);
}

function removeFallbackKv(key: string): void {
  const sqlite = getSyncSqliteStore();
  if (sqlite) {
    sqlite.removeItemSync(key);
    return;
  }
  memoryFallbackStore.delete(key);
}

function clearFallbackKv(): void {
  const sqlite = getSyncSqliteStore();
  if (sqlite) {
    sqlite.clearSync();
    return;
  }
  memoryFallbackStore.clear();
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

const DEVICE_SECRET_TOKEN_SECURE_KEY = toSecureStoreKey(DEVICE_SECRET_TOKEN_KEY);

/** Token vigente cuando el Keychain/Keystore no aceptó guardarlo; se pierde al cerrar la app. */
let volatileDeviceSecretToken: string | null = null;

function writeDeviceSecretToken(token: string): void {
  try {
    SecureStore.setItem(DEVICE_SECRET_TOKEN_SECURE_KEY, token, SECURE_STORE_OPTIONS);
    volatileDeviceSecretToken = null;
  } catch {
    volatileDeviceSecretToken = token;
  }
  purgePlaintextDeviceSecretToken();
}

/** Borra el token que versiones anteriores dejaban en SQLite cuando fallaba SecureStore. */
function purgePlaintextDeviceSecretToken(): void {
  try {
    removeFallbackKv(DEVICE_SECRET_TOKEN_KEY);
  } catch {
    // Ignore fallback I/O error
  }
}

function readDeviceSecretToken(): string | null {
  if (volatileDeviceSecretToken !== null) {
    return volatileDeviceSecretToken;
  }
  try {
    const secureToken = SecureStore.getItem(DEVICE_SECRET_TOKEN_SECURE_KEY, SECURE_STORE_OPTIONS);
    if (secureToken !== null && secureToken.length > 0) {
      return secureToken;
    }
  } catch {
    // Keychain/Keystore unavailable: look for a legacy copy below
  }
  return migrateLegacyPlaintextDeviceSecretToken();
}

function migrateLegacyPlaintextDeviceSecretToken(): string | null {
  let legacyToken: string | null = null;
  try {
    legacyToken = readFallbackKv(DEVICE_SECRET_TOKEN_KEY);
  } catch {
    return null;
  }
  if (legacyToken === null || legacyToken.length === 0) {
    return null;
  }
  writeDeviceSecretToken(legacyToken);
  return legacyToken;
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
    if (key === DEVICE_SECRET_TOKEN_KEY) {
      return readDeviceSecretToken();
    }

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

      // Check SQLite (or in-memory fallback) and migrate to SecureStore if small enough
      try {
        const fallbackVal = readFallbackKv(key);
        if (fallbackVal !== null && fallbackVal.length > 0) {
          if (fallbackVal.length <= SECURE_STORE_MAX_SAFE_BYTES) {
            try {
              SecureStore.setItem(safeKey, fallbackVal, SECURE_STORE_OPTIONS);
              removeFallbackKv(key);
            } catch {
              // Keep in fallback store if SecureStore write fails
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
      return readFallbackKv(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (key === DEVICE_SECRET_TOKEN_KEY) {
      writeDeviceSecretToken(value);
      return;
    }

    if (isDirectSecureStoreSessionKey(key) && value.length <= SECURE_STORE_MAX_SAFE_BYTES) {
      const safeKey = toSecureStoreKey(key);
      trackedSecureStoreKeys.add(safeKey);
      try {
        SecureStore.setItem(safeKey, value, SECURE_STORE_OPTIONS);
        try {
          removeFallbackKv(key);
        } catch {
          // Ignore cleanup error
        }
        return;
      } catch {
        // Session keys are ciphertext: SQLite/memory is an acceptable fallback for them
      }
    }

    try {
      writeFallbackKv(key, value);
    } catch {
      // Ignore fallback I/O error
    }
  },

  removeItem(key: string): void {
    if (key === DEVICE_SECRET_TOKEN_KEY) {
      volatileDeviceSecretToken = null;
    }
    if (isDirectSecureStoreSessionKey(key)) {
      deleteFromSecureStoreSyncAndAsync(key);
    }
    try {
      removeFallbackKv(key);
    } catch {
      // Ignore fallback I/O error
    }
  },

  clear(): void {
    volatileDeviceSecretToken = null;
    for (const safeKey of trackedSecureStoreKeys) {
      deleteFromSecureStoreSyncAndAsync(safeKey);
    }
    try {
      clearFallbackKv();
    } catch {
      // Ignore fallback I/O error
    }
  },
};
