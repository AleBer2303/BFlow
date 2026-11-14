/**
 * src/platform/storage/persistentStorageAdapter.ts
 *
 * Universal synchronous encrypted key-value storage adapter for BFlow (ADR 0015 & ADR 0016):
 * - Delegates raw persistence to platform-resolved `storageBackend`:
 *   - iOS & Android (`storageBackend.native.ts`): `expo-secure-store` (Keychain/Keystore)
 *     for the generated 256-bit secret token and session keys + `expo-sqlite/kv-store`
 *     for the encrypted budget cache.
 *   - Web & Tests (`storageBackend.ts`): `localStorage` for ciphertext and `sessionStorage`
 *     for the secret token (ADR 0027).
 * - Encrypts all persisted values with AES-256-CTR + HMAC-SHA256 (`enc:v1:<iv>:<cipher>:<mac>`)
 *   using a key derived from the application passphrase/pepper + the generated 256-bit
 *   device secret token (`storageCipher.ts`).
 * - In-memory cache layer (`memoryStore`) for zero-latency repeated reads.
 * - Automatic in-place migration of pre-encryption JSON entries on first read.
 */

import { storageBackend, type RawStorageBackend } from './storageBackend';
import {
  decryptStorageValue,
  encryptStorageValue,
  generateSecretToken256,
  isEncryptedStoragePayload,
} from './storageCipher';

export type { RawStorageBackend };

export const DEVICE_SECRET_TOKEN_KEY = 'bflow.security.device_token.v1';

export interface BFlowStorageAdapter {
  getItem<T = unknown>(key: string): T | null;
  setItem<T = unknown>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;
}

const memoryStore = new Map<string, string>();
let activeBackend: RawStorageBackend = storageBackend;
let inMemorySecretToken: string | null = null;

function isValidSecretToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.trim().length >= 32;
}

/**
 * Retrieves the active 256-bit device secret token from memory or persistent storage
 * (`expo-secure-store` on iOS/Android, `sessionStorage` on Web), generating and persisting
 * a new 256-bit token if none exists yet.
 *
 * Throws `SecureRandomUnavailableError` when the runtime has no CSPRNG (ADR 0027): callers
 * then keep the value in memory and write nothing to disk.
 */
export function getOrCreateDeviceSecretToken(): string {
  if (isValidSecretToken(inMemorySecretToken)) {
    return inMemorySecretToken;
  }

  try {
    const persisted = activeBackend.getItem(DEVICE_SECRET_TOKEN_KEY);
    if (isValidSecretToken(persisted)) {
      inMemorySecretToken = persisted;
      return persisted;
    }
  } catch {
    // Fallback to generating a new token in memory
  }

  const nextToken = generateSecretToken256();
  inMemorySecretToken = nextToken;
  try {
    activeBackend.setItem(DEVICE_SECRET_TOKEN_KEY, nextToken);
  } catch {
    // Ignore write failure on restricted environments
  }
  return nextToken;
}

/**
 * Rotates the 256-bit device secret token (called on sign-out or full account reset),
 * cryptographically invalidating any previously encrypted ciphertext residues.
 *
 * Without a CSPRNG there is no new token: the old one is discarded anyway, so the residues
 * stay unreadable, and `null` is returned.
 */
export function rotateDeviceSecretToken(): string | null {
  let nextToken: string | null = null;
  try {
    nextToken = generateSecretToken256();
  } catch {
    // No secure random source: fall through and drop the current token
  }
  inMemorySecretToken = nextToken;
  try {
    if (nextToken === null) {
      activeBackend.removeItem(DEVICE_SECRET_TOKEN_KEY);
    } else {
      activeBackend.setItem(DEVICE_SECRET_TOKEN_KEY, nextToken);
    }
  } catch {
    // Ignore storage error
  }
  return nextToken;
}

/**
 * Encrypts a raw string using the active derived key (`pepper + deviceSecretToken`).
 */
export function encryptRawStringForStorage(plainText: string): string {
  const secretToken = getOrCreateDeviceSecretToken();
  return encryptStorageValue(plainText, secretToken);
}

/**
 * Decrypts a raw string using the active derived key (`pepper + deviceSecretToken`).
 * Returns `null` if the HMAC tag or format is invalid.
 */
export function decryptRawStringFromStorage(storedValue: string): string | null {
  const secretToken = getOrCreateDeviceSecretToken();
  return decryptStorageValue(storedValue, secretToken);
}

/**
 * Test helper: clears the in-memory `Map` and cached token reference without touching
 * the underlying persistent backend, simulating a cold process restart.
 */
export function __resetMemoryCacheForTests(): void {
  memoryStore.clear();
  inMemorySecretToken = null;
}

/**
 * Test helper: swaps the underlying raw storage backend (pass `null` to restore
 * the default platform backend).
 */
export function __setStorageBackendForTests(backend: RawStorageBackend | null): void {
  activeBackend = backend ?? storageBackend;
  inMemorySecretToken = null;
}

export const persistentStorage: BFlowStorageAdapter = {
  getItem<T = unknown>(key: string): T | null {
    // 1. Check in-memory fast cache first
    const memoryValue = memoryStore.get(key);
    if (memoryValue !== undefined) {
      try {
        return JSON.parse(memoryValue) as T;
      } catch {
        return null;
      }
    }

    // 2. Check persistent storage backend and decrypt
    try {
      const raw = activeBackend.getItem(key);
      if (raw === null || raw.length === 0) {
        return null;
      }

      if (isEncryptedStoragePayload(raw)) {
        const decrypted = decryptRawStringFromStorage(raw);
        if (decrypted === null) {
          // Tampered ciphertext or rotated key -> purge corrupted entry
          activeBackend.removeItem(key);
          return null;
        }
        const parsed = JSON.parse(decrypted) as T;
        memoryStore.set(key, decrypted);
        return parsed;
      }

      // Legacy plaintext JSON entry -> parse and migrate in-place to encrypted envelope
      const parsed = JSON.parse(raw) as T;
      memoryStore.set(key, raw);
      try {
        activeBackend.setItem(key, encryptRawStringForStorage(raw));
      } catch {
        // Ignore migration write error
      }
      return parsed;
    } catch {
      // Storage access error or invalid JSON -> purge invalid entry
      try {
        activeBackend.removeItem(key);
      } catch {
        // Ignore cleanup error
      }
      return null;
    }
  },

  setItem<T = unknown>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      memoryStore.set(key, serialized);
      const encrypted = encryptRawStringForStorage(serialized);
      activeBackend.setItem(key, encrypted);
    } catch {
      // Storage quota exceeded or serialization error
    }
  },

  removeItem(key: string): void {
    memoryStore.delete(key);
    try {
      activeBackend.removeItem(key);
    } catch {
      // Storage error
    }
  },

  clear(): void {
    memoryStore.clear();
    inMemorySecretToken = null;
    try {
      activeBackend.clear();
    } catch {
      // Storage error
    }
  },
};
