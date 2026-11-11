/**
 * src/domain/date/monthKey.ts
 *
 * Pure date and MonthKey ("YYYY-MM") utilities.
 * Timezone-aware, deterministic across platforms.
 */

export const DEFAULT_APP_TIMEZONE = 'America/Bogota' as const;
/** @deprecated use DEFAULT_APP_TIMEZONE */
export const BOGOTA_TIMEZONE = DEFAULT_APP_TIMEZONE;

const STANDARD_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;
const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_REGEX.test(value);
}

export function assertValidMonthKey(value: string): string {
  if (!isValidMonthKey(value)) {
    throw new RangeError(`Invalid monthKey "${value}". Expected format "YYYY-MM".`);
  }
  return value;
}

/**
 * Resolves a Date (or timestamp/ISO string) into a "YYYY-MM" monthKey.
 */
export function toAppMonthKey(input: Date | number | string = new Date(), offsetMs = STANDARD_UTC_OFFSET_MS): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid Date passed to toAppMonthKey');
  }

  const shifted = new Date(date.getTime() + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Resolves a Date into an ISO date string "YYYY-MM-DD".
 */
export function toAppIsoDate(input: Date | number | string = new Date(), offsetMs = STANDARD_UTC_OFFSET_MS): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid Date passed to toAppIsoDate');
  }
  const shifted = new Date(date.getTime() + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Backward-compatible aliases
 */
export const toBogotaMonthKey = toAppMonthKey;
export const toBogotaIsoDate = toAppIsoDate;

/**
 * Returns the next or previous monthKey ("YYYY-MM") handling year boundaries
 * (e.g. "2026-12" + 1 -> "2027-01", "2027-01" - 1 -> "2026-12").
 */
export function addMonthsToMonthKey(monthKey: string, deltaMonths: number): string {
  assertValidMonthKey(monthKey);
  if (!Number.isSafeInteger(deltaMonths)) {
    throw new TypeError('deltaMonths must be a safe integer');
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const totalMonths = year * 12 + monthIndex + deltaMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
}

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Three-letter month for chart axes ("Oct"); the readout shows the full label. */
export function formatMonthKeyShortLabelEs(monthKey: string): string {
  assertValidMonthKey(monthKey);
  const monthIdx = Number(monthKey.slice(5, 7)) - 1;
  return (MONTH_NAMES_ES[monthIdx] as string).slice(0, 3);
}

export function formatMonthKeyLabelEs(monthKey: string): string {
  assertValidMonthKey(monthKey);
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = Number(monthStr) - 1;
  return `${MONTH_NAMES_ES[monthIdx]} ${yearStr}`;
}
