/**
 * src/platform/storage/sqliteKvStore.ts
 *
 * Web / non-native stub for `expo-sqlite/kv-store`.
 * On iOS and Android, Metro resolves `sqliteKvStore.native.ts` instead.
 */

export interface OptionalSqliteKvStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): boolean | void;
  clearSync(): boolean | void;
}

export function getOptionalSqliteKvStore(): OptionalSqliteKvStore | null {
  return null;
}
