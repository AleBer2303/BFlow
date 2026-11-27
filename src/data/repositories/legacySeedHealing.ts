/**
 * src/data/repositories/legacySeedHealing.ts
 *
 * Adapter for the owner seed account (`EXPO_PUBLIC_OWNER_SEED_EMAIL`, October 2026 seed) and the
 * wrong balances that early builds wrote to it. It is the only place in universal code that knows
 * the seed's ids and amounts (ADR 0005, ADR 0036).
 *
 * Every fix here only reads what was loaded and returns a corrected copy; nothing is written
 * from this file. `isLegacySeedResetOpening` matches by seed id, so it can only affect accounts
 * that hold those ids, that is, the owner seed account.
 *
 * Remove the whole file (and its calls in `accountHydration.ts`) once it is shown that no account
 * still carries these values; ADR 0036 explains how to check it.
 */

import type { Debt, SavingsBucket } from '../../domain/models/types';

/** Month the owner seed starts in. */
export const OWNER_SEED_MONTH_KEY = '2026-10';

/** `savings` opening balances that a cross-account bug wrote to the owner seed account. */
const CORRUPTED_SAVINGS_OPENINGS: ReadonlySet<number> = new Set([
  14_800_000, 13_800_000, 16_880_000,
]);

/** Opening balances of the seed debts in `OWNER_SEED_MONTH_KEY` (`fixtures/october-2026.json`). */
const SEED_DEBT_OPENINGS: ReadonlyMap<string, number> = new Map([
  ['debt_cb300f_moto', 4_400_000],
  ['debt_esp_ia', 3_600_000],
  ['debt_especializacion', 3_600_000],
]);

/** Opening balances of the seed savings buckets in `OWNER_SEED_MONTH_KEY`. */
const SEED_BUCKET_OPENINGS: ReadonlyMap<string, number> = new Map([
  ['moto', 1_600_000],
  ['savings', 1_000_000],
]);

/**
 * The owner's `savings` bucket with one of the corrupted openings, put back to the seed value.
 * Null when there is nothing to heal. The caller also writes the healed bucket back.
 */
export function healCorruptedOwnerSavingsBucket(
  bucket: SavingsBucket,
  isOwnerSeedAccount: boolean
): SavingsBucket | null {
  if (
    !isOwnerSeedAccount ||
    bucket.id !== 'savings' ||
    !CORRUPTED_SAVINGS_OPENINGS.has(bucket.openingBalance)
  ) {
    return null;
  }
  const openingBalance = SEED_BUCKET_OPENINGS.get('savings') ?? bucket.openingBalance;
  return { ...bucket, openingBalance, monthKey: OWNER_SEED_MONTH_KEY };
}

/**
 * True when the first loaded month is the seed month but the stored document was already rolled
 * to a later month: its opening balance is not October's, and chaining from it would count the
 * months in between twice.
 */
function isRolledPastSeedMonth(
  storedMonthKey: string | undefined,
  firstMonthKey: string,
  isOwnerSeedAccount: boolean
): boolean {
  return (
    isOwnerSeedAccount &&
    firstMonthKey === OWNER_SEED_MONTH_KEY &&
    Boolean(storedMonthKey) &&
    storedMonthKey !== OWNER_SEED_MONTH_KEY
  );
}

/** The seed debt with its October opening balance, or null when it does not apply. */
export function restoreOwnerSeedFirstMonthDebt(
  debt: Debt,
  firstMonthKey: string,
  isOwnerSeedAccount: boolean
): Debt | null {
  if (!isRolledPastSeedMonth(debt.monthKey, firstMonthKey, isOwnerSeedAccount)) return null;
  const openingBalance = SEED_DEBT_OPENINGS.get(debt.id);
  return openingBalance === undefined
    ? null
    : { ...debt, openingBalance, monthKey: OWNER_SEED_MONTH_KEY };
}

/** The seed bucket with its October opening balance, or null when it does not apply. */
export function restoreOwnerSeedFirstMonthBucket(
  bucket: SavingsBucket,
  firstMonthKey: string,
  isOwnerSeedAccount: boolean
): SavingsBucket | null {
  if (!isRolledPastSeedMonth(bucket.monthKey, firstMonthKey, isOwnerSeedAccount)) return null;
  const openingBalance = SEED_BUCKET_OPENINGS.get(bucket.id);
  return openingBalance === undefined
    ? null
    : { ...bucket, openingBalance, monthKey: OWNER_SEED_MONTH_KEY };
}

/**
 * True when a seed debt's stored opening is still the October value that an old reset wrote,
 * while the chain says otherwise: the stored value is then not a user edit and must not win.
 */
export function isLegacySeedResetOpening(
  debtId: string,
  storedOpening: number | undefined,
  rolledOpening: number
): boolean {
  const seedOpening = SEED_DEBT_OPENINGS.get(debtId);
  return (
    seedOpening !== undefined && storedOpening === seedOpening && rolledOpening !== seedOpening
  );
}
