/**
 * src/platform/storage/sqliteKvStore.native.ts
 *
 * Lazy, fault-tolerant loader for `expo-sqlite/kv-store`.
 * `expo-sqlite` calls `requireNativeModule('ExpoSQLite')` at module evaluation time,
 * which crashes the entire bundle if `ExpoSQLite` is missing in the host runtime
 * (for example, Android Expo Go when Expo Modules v2 cannot attach to the app JS runtime).
 * Loading it lazily inside `try/catch` allows Mode A (Expo Go) to fall back gracefully
 * while preserving full SQLite persistence in `.apk`, `.ipa`, and iOS Expo Go.
 */

import type { OptionalSqliteKvStore } from './sqliteKvStore';

let cachedResolved = false;
let cachedStore: OptionalSqliteKvStore | null = null;
let hasWarnedUnavailable = false;

export function getOptionalSqliteKvStore(): OptionalSqliteKvStore | null {
  if (cachedResolved) {
    return cachedStore;
  }
  cachedResolved = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-sqlite/kv-store') as {
      default?: OptionalSqliteKvStore;
      Storage?: OptionalSqliteKvStore;
    };
    const resolved = mod.Storage ?? mod.default ?? null;
    if (
      resolved &&
      (typeof resolved.getItemSync === 'function' || typeof resolved.getItem === 'function')
    ) {
      cachedStore = resolved;
      return cachedStore;
    }
  } catch (error) {
    if (!hasWarnedUnavailable && process.env.NODE_ENV !== 'test') {
      hasWarnedUnavailable = true;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[BFlow] expo-sqlite/kv-store is unavailable in this runtime (${reason}); using in-memory fallback for non-SecureStore entries.`
      );
    }
  }

  cachedStore = null;
  return null;
}
