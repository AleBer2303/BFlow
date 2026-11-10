/**
 * src/platform/storage/storageBackend.ts
 *
 * Raw string key-value storage backend for Web and test environments.
 * Uses `globalThis.localStorage` when available, isolating quota or sandbox
 * exceptions so callers never crash.
 *
 * Note: All values passed by `persistentStorageAdapter.ts` into `storageBackend`
 * are already encrypted with AES-256-CTR + HMAC-SHA256 (`storageCipher.ts`, ADR 0016).
 *
 * On iOS and Android, Metro resolves `storageBackend.native.ts` instead,
 * keeping `expo-sqlite` and `expo-secure-store` out of the Web bundle.
 */

export interface RawStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export const DEVICE_SECRET_TOKEN_KEY = 'bflow.security.device_token.v1';

export function isDirectSecureStoreSessionKey(key: string): boolean {
  return (
    key === DEVICE_SECRET_TOKEN_KEY ||
    key === 'bflow.auth.session.v1' ||
    key.startsWith('firebase:authUser:') ||
    key.startsWith('firebase_authUser_')
  );
}

export function toSecureStoreKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getLocalStorage(): Storage | null {
  try {
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    // Restricted or sandboxed browser environment
  }
  return null;
}

export const storageBackend: RawStorageBackend = {
  getItem(key: string): string | null {
    const storage = getLocalStorage();
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      // Quota exceeded or restricted storage
    }
  },

  removeItem(key: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage error
    }
  },

  clear(): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.clear();
    } catch {
      // Ignore storage error
    }
  },
};
