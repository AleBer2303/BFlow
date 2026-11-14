/**
 * src/data/repositories/historyWindow.ts
 *
 * Decides which part of the `entries` history a full account load may take from the device
 * cache instead of downloading it again (ADR 0028).
 *
 * Months older than the last `HISTORY_REFRESH_WINDOW_MONTHS` closed months are "archived".
 * Their cached entries are reused only if the cloud proves nothing changed there:
 * - every archived month still has the same `monthSnapshot` (a reopened month loses it),
 * - entries written since the last load are downloaded and applied (`updatedAt`), and
 * - the number of archived entries in the cloud equals the number in the merged cache
 *   (catches deletions and anything the two checks above missed).
 * If any check fails, the caller downloads the whole collection as before.
 */

import type { MonthEntry, MonthSnapshot } from '../../domain/models/types';

/** Closed months that are always downloaded again, counted back from the newest one. */
export const HISTORY_REFRESH_WINDOW_MONTHS = 12;

/**
 * `updatedAt` is stamped with each device's clock. Entries are asked for from this long
 * before the last load, so a device with a clock running behind is still seen.
 */
export const HISTORY_CLOCK_SKEW_MARGIN_MS = 24 * 60 * 60 * 1000;

export interface CachedHistory {
  availableMonths: readonly string[];
  entries: readonly MonthEntry[];
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  /** When the cache last received everything the cloud had (ISO). */
  historySyncedAt?: string;
}

export interface ArchivedHistoryPlan {
  /** Months before this one come from the cache; this month and later are downloaded. */
  cutoffMonthKey: string;
  /** Entries written after this instant are downloaded whatever their month. */
  changedSinceIso: string;
}

/** Returns null when the whole history must be downloaded. */
export function planArchivedHistory(
  cached: CachedHistory | null | undefined,
  windowMonths: number = HISTORY_REFRESH_WINDOW_MONTHS
): ArchivedHistoryPlan | null {
  if (!cached?.historySyncedAt) return null;
  const syncedAtMs = Date.parse(cached.historySyncedAt);
  if (Number.isNaN(syncedAtMs)) return null;

  const closedMonths = Object.keys(cached.closedSnapshots).sort();
  if (closedMonths.length <= windowMonths) return null;

  let cutoffMonthKey = closedMonths[closedMonths.length - windowMonths]!;
  // A month that is still open is never archived, nor is anything after it.
  const knownMonths = new Set<string>(cached.availableMonths);
  for (const entry of cached.entries) {
    knownMonths.add(entry.monthKey);
  }
  for (const monthKey of knownMonths) {
    if (monthKey < cutoffMonthKey && !cached.closedSnapshots[monthKey]) {
      cutoffMonthKey = monthKey;
    }
  }
  if (!closedMonths.some((monthKey) => monthKey < cutoffMonthKey)) return null;

  return {
    cutoffMonthKey,
    changedSinceIso: new Date(syncedAtMs - HISTORY_CLOCK_SKEW_MARGIN_MS).toISOString(),
  };
}

/** JSON with sorted keys: equal content gives equal text whatever the key order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function haveSameArchivedSnapshots(
  cutoffMonthKey: string,
  cached: Readonly<Record<string, MonthSnapshot>>,
  remote: Readonly<Record<string, MonthSnapshot>>
): boolean {
  const archived = (snapshots: Readonly<Record<string, MonthSnapshot>>) =>
    Object.keys(snapshots).filter((monthKey) => monthKey < cutoffMonthKey);
  const cachedMonths = archived(cached);
  if (cachedMonths.length !== archived(remote).length) return false;
  return cachedMonths.every(
    (monthKey) =>
      remote[monthKey] !== undefined &&
      stableStringify(remote[monthKey]) === stableStringify(cached[monthKey])
  );
}

export interface ArchivedHistoryEvidence {
  plan: ArchivedHistoryPlan;
  cachedEntries: readonly MonthEntry[];
  cachedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  remoteSnapshots: Readonly<Record<string, MonthSnapshot>>;
  /** Entries the cloud returned for `updatedAt > plan.changedSinceIso`. */
  changedEntries: readonly MonthEntry[];
  /** Entries the cloud holds before the cutoff month (aggregation count). */
  remoteArchivedCount: number;
}

/**
 * Returns the archived entries (cache plus the changes downloaded), ordered by id like a
 * collection read, or null when the cache cannot be trusted and everything must be downloaded.
 */
export function resolveArchivedEntries(evidence: ArchivedHistoryEvidence): MonthEntry[] | null {
  const { cutoffMonthKey } = evidence.plan;
  if (
    !haveSameArchivedSnapshots(cutoffMonthKey, evidence.cachedSnapshots, evidence.remoteSnapshots)
  ) {
    return null;
  }

  const archivedById = new Map<string, MonthEntry>();
  for (const entry of evidence.cachedEntries) {
    if (entry.monthKey < cutoffMonthKey) {
      archivedById.set(entry.id, entry);
    }
  }
  for (const entry of evidence.changedEntries) {
    if (entry.monthKey < cutoffMonthKey) {
      archivedById.set(entry.id, entry);
    }
  }
  if (archivedById.size !== evidence.remoteArchivedCount) return null;

  return Array.from(archivedById.values()).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
}
