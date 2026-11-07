/**
 * src/platform/storage/persistentStorageAdapter.ts
 *
 * Universal persistent key-value storage adapter for BFlow:
 * - Works across Web (localStorage), Node/SSR/Testing, and Native platforms.
 * - In-memory LRU-like cache layer for zero latency reads.
 * - Graceful fallback and error isolation (never throws on restricted environments).
 */

export interface BFlowStorageAdapter {
  getItem<T = unknown>(key: string): T | null;
  setItem<T = unknown>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;
}

const memoryStore = new Map<string, string>();

function getLocalStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Restricted or sandboxed browser environment
  }
  return null;
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

    // 2. Check persistent storage (e.g., localStorage)
    const storage = getLocalStorage();
    if (storage) {
      try {
        const raw = storage.getItem(key);
        if (raw !== null) {
          memoryStore.set(key, raw);
          return JSON.parse(raw) as T;
        }
      } catch {
        // Storage access error or parse failure
      }
    }

    return null;
  },

  setItem<T = unknown>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      memoryStore.set(key, serialized);

      const storage = getLocalStorage();
      if (storage) {
        storage.setItem(key, serialized);
      }
    } catch {
      // Storage quota exceeded or serialization error
    }
  },

  removeItem(key: string): void {
    memoryStore.delete(key);
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.removeItem(key);
      }
    } catch {
      // Storage error
    }
  },

  clear(): void {
    memoryStore.clear();
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.clear();
      }
    } catch {
      // Storage error
    }
  },
};
