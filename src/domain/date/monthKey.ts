/**
 * src/domain/date/monthKey.ts
 *
 * Pure date and MonthKey ("YYYY-MM") utilities pinned to the America/Bogota
 * timezone (UTC-05:00 year-round, no Daylight Saving Time).
 */

export const BOGOTA_TIMEZONE = 'America/Bogota' as const;
const BOGOTA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;
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
 * Resolves a Date (or timestamp/ISO string) into a "YYYY-MM" monthKey
 * in the America/Bogota timezone (UTC-05:00).
 */
export function toBogotaMonthKey(input: Date | number | string = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid Date passed to toBogotaMonthKey');
  }

  // Shift UTC timestamp by -05:00 (Colombia has no DST) and read UTC year/month
  const bogotaShifted = new Date(date.getTime() + BOGOTA_UTC_OFFSET_MS);
  const year = bogotaShifted.getUTCFullYear();
  const month = String(bogotaShifted.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Resolves a Date into an ISO date string "YYYY-MM-DD" in America/Bogota.
 */
export function toBogotaIsoDate(input: Date | number | string = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid Date passed to toBogotaIsoDate');
  }
  const bogotaShifted = new Date(date.getTime() + BOGOTA_UTC_OFFSET_MS);
  const year = bogotaShifted.getUTCFullYear();
  const month = String(bogotaShifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bogotaShifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

const SPANISH_MONTH_NAMES = [
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

export function formatMonthKeyLabelEs(monthKey: string): string {
  assertValidMonthKey(monthKey);
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = Number(monthStr) - 1;
  return `${SPANISH_MONTH_NAMES[monthIdx]} ${yearStr}`;
}
