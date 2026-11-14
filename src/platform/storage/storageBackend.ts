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
 * The device secret token is the exception: it is the key material, so it never shares
 * `localStorage` with the ciphertext (ADR 0027). It lives in `sessionStorage` (one per tab,
 * erased when the tab closes) or in memory when `sessionStorage` is not available.
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

type WebStorageName = 'localStorage' | 'sessionStorage';

function getWebStorage(name: WebStorageName): Storage | null {
  try {
    const storage = (globalThis as Partial<Record<WebStorageName, Storage>>)[name];
    return storage ?? null;
  } catch {
    // Restricted or sandboxed browser environment
    return null;
  }
}

/** Token vigente cuando `sessionStorage` no existe o rechazó la escritura. */
let volatileDeviceSecretToken: string | null = null;

function writeDeviceSecretToken(token: string): void {
  try {
    const session = getWebStorage('sessionStorage');
    if (!session) {
      throw new Error('sessionStorage is unavailable');
    }
    session.setItem(DEVICE_SECRET_TOKEN_KEY, token);
    volatileDeviceSecretToken = null;
  } catch {
    volatileDeviceSecretToken = token;
  }
  purgeLocalStorageDeviceSecretToken();
}

/** Borra el token que versiones anteriores guardaban en `localStorage`, junto al cifrado. */
function purgeLocalStorageDeviceSecretToken(): void {
  try {
    getWebStorage('localStorage')?.removeItem(DEVICE_SECRET_TOKEN_KEY);
  } catch {
    // Ignore storage error
  }
}

function readDeviceSecretToken(): string | null {
  if (volatileDeviceSecretToken !== null) {
    return volatileDeviceSecretToken;
  }
  try {
    const sessionToken = getWebStorage('sessionStorage')?.getItem(DEVICE_SECRET_TOKEN_KEY);
    if (sessionToken) {
      return sessionToken;
    }
  } catch {
    // Restricted storage: look for a legacy copy below
  }
  return migrateLegacyLocalStorageDeviceSecretToken();
}

function migrateLegacyLocalStorageDeviceSecretToken(): string | null {
  let legacyToken: string | null = null;
  try {
    legacyToken = getWebStorage('localStorage')?.getItem(DEVICE_SECRET_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
  if (!legacyToken) {
    return null;
  }
  writeDeviceSecretToken(legacyToken);
  return legacyToken;
}

function removeDeviceSecretToken(): void {
  volatileDeviceSecretToken = null;
  try {
    getWebStorage('sessionStorage')?.removeItem(DEVICE_SECRET_TOKEN_KEY);
  } catch {
    // Ignore storage error
  }
  purgeLocalStorageDeviceSecretToken();
}

export const storageBackend: RawStorageBackend = {
  getItem(key: string): string | null {
    if (key === DEVICE_SECRET_TOKEN_KEY) {
      return readDeviceSecretToken();
    }
    try {
      return getWebStorage('localStorage')?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (key === DEVICE_SECRET_TOKEN_KEY) {
      writeDeviceSecretToken(value);
      return;
    }
    try {
      getWebStorage('localStorage')?.setItem(key, value);
    } catch {
      // Quota exceeded or restricted storage
    }
  },

  removeItem(key: string): void {
    if (key === DEVICE_SECRET_TOKEN_KEY) {
      removeDeviceSecretToken();
      return;
    }
    try {
      getWebStorage('localStorage')?.removeItem(key);
    } catch {
      // Ignore storage error
    }
  },

  clear(): void {
    removeDeviceSecretToken();
    try {
      getWebStorage('localStorage')?.clear();
    } catch {
      // Ignore storage error
    }
  },
};
