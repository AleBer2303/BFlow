/**
 * src/data/migrations/legacyFieldMigration.ts
 *
 * Earlier builds stored a few names taken from the spreadsheet BFlow replaced. They are read
 * here, and only here, and turned into the current names (ADR 0037):
 *
 * | Where                          | Stored before          | Now                     |
 * | :----------------------------- | :--------------------- | :---------------------- |
 * | `savingsBuckets/{id}`          | id `moto`              | id `reserve`            |
 * | `concepts.savingsContribution` | `bucketId: 'moto'`     | `bucketId: 'reserve'`   |
 * | `concepts`                     | `idealMotoCategoryKey` | `provisionCategoryKey`  |
 * | `monthSnapshots.closingSavings`| `motoClosingBalance`   | `reserveClosingBalance` |
 * | `provisionPlans/{id}`          | id `moto_ideal`        | id `default`            |
 * | `users/{uid}`                  | `seededOctober2026`    | (removed)               |
 *
 * Writes always use the new names. `loadFullCloudAccount` rewrites the old documents it finds,
 * so this file can go once every account has been loaded by a build that includes it.
 */

export const RESERVE_BUCKET_ID = 'reserve';
export const PROVISION_PLAN_DOC_ID = 'default';

const LEGACY_RESERVE_BUCKET_ID = 'moto';
export const LEGACY_PROVISION_PLAN_DOC_ID = 'moto_ideal';
/** `users/{uid}` fields that no build reads any more; the next write removes them. */
export const LEGACY_USER_FIELDS: readonly string[] = ['seededOctober2026'];

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Current id of a savings bucket. */
export function migrateBucketId(bucketId: string): string {
  return bucketId === LEGACY_RESERVE_BUCKET_ID ? RESERVE_BUCKET_ID : bucketId;
}

/** True when `docId` is an old id that now belongs to `bucketId`. */
export function isLegacyBucketDocId(docId: string, bucketId: string): boolean {
  return docId !== bucketId && migrateBucketId(docId) === bucketId;
}

export function migrateRawSavingsBucket(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.id !== 'string') return raw;
  const id = migrateBucketId(raw.id);
  return id === raw.id ? raw : { ...raw, id };
}

export function migrateRawConcept(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  let next: RawRecord = raw;
  const contribution = raw.savingsContribution;
  if (isRecord(contribution) && typeof contribution.bucketId === 'string') {
    const bucketId = migrateBucketId(contribution.bucketId);
    if (bucketId !== contribution.bucketId) {
      next = { ...next, savingsContribution: { ...contribution, bucketId } };
    }
  }
  if ('idealMotoCategoryKey' in raw) {
    const { idealMotoCategoryKey, ...rest } = next;
    next =
      rest.provisionCategoryKey === undefined && typeof idealMotoCategoryKey === 'string'
        ? { ...rest, provisionCategoryKey: idealMotoCategoryKey }
        : rest;
  }
  return next;
}

export function migrateRawMonthSnapshot(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.closingSavings)) return raw;
  const { motoClosingBalance, ...closingSavings } = raw.closingSavings;
  const hasLegacyBalance = motoClosingBalance !== undefined;
  const buckets = Array.isArray(closingSavings.buckets)
    ? closingSavings.buckets.map((bucket) => migrateRawSavingsBucket(bucket))
    : closingSavings.buckets;
  const bucketsChanged =
    Array.isArray(buckets) &&
    buckets.some((bucket, idx) => bucket !== (closingSavings.buckets as unknown[])[idx]);
  if (!hasLegacyBalance && !bucketsChanged) return raw;
  return {
    ...raw,
    closingSavings: {
      ...closingSavings,
      ...(buckets !== undefined ? { buckets } : {}),
      reserveClosingBalance: closingSavings.reserveClosingBalance ?? motoClosingBalance,
    },
  };
}

/** True when a stored document still holds an old name, so it should be written again. */
export function hasLegacyFields(
  kind: 'concept' | 'savingsBucket' | 'monthSnapshot',
  raw: unknown
): boolean {
  switch (kind) {
    case 'concept':
      return migrateRawConcept(raw) !== raw;
    case 'savingsBucket':
      return migrateRawSavingsBucket(raw) !== raw;
    case 'monthSnapshot':
      return migrateRawMonthSnapshot(raw) !== raw;
  }
}
