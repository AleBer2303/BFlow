import {
  addMonthsToMonthKey,
  assertValidMonthKey,
  formatMonthKeyLabelEs,
  isValidMonthKey,
  toBogotaIsoDate,
  toBogotaMonthKey,
} from '../monthKey';

describe('domain/date/monthKey — America/Bogota (UTC-05:00) rules', () => {
  it('validates "YYYY-MM" format strictly', () => {
    expect(isValidMonthKey('2026-10')).toBe(true);
    expect(isValidMonthKey('2027-01')).toBe(true);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-1')).toBe(false);
    expect(() => assertValidMonthKey('invalid')).toThrow(RangeError);
  });

  it('resolves monthKey and isoDate from Date instances, timestamps, default args, and rejects invalid dates', () => {
    expect(toBogotaMonthKey(new Date('2026-10-21T15:00:00.000Z'))).toBe('2026-10');
    expect(toBogotaIsoDate(new Date('2026-10-21T15:00:00.000Z'))).toBe('2026-10-21');
    expect(isValidMonthKey(toBogotaMonthKey())).toBe(true);
    expect(toBogotaIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => toBogotaMonthKey('not-a-date')).toThrow(RangeError);
    expect(() => toBogotaIsoDate('not-a-date')).toThrow(RangeError);
  });

  it('resolves monthKey in America/Bogota across midnight UTC boundary', () => {
    // 2026-11-01T03:30:00Z is still 2026-10-31T22:30:00-05:00 in Bogota!
    expect(toBogotaMonthKey('2026-11-01T03:30:00.000Z')).toBe('2026-10');
    expect(toBogotaIsoDate('2026-11-01T03:30:00.000Z')).toBe('2026-10-31');

    // 2026-11-01T05:00:00Z is 2026-11-01T00:00:00-05:00 in Bogota!
    expect(toBogotaMonthKey('2026-11-01T05:00:00.000Z')).toBe('2026-11');
    expect(toBogotaIsoDate('2026-11-01T05:00:00.000Z')).toBe('2026-11-01');
  });

  it('handles year rollover in America/Bogota (Dec 31 23:59 vs Jan 1 00:00)', () => {
    expect(toBogotaMonthKey('2027-01-01T04:59:59.000Z')).toBe('2026-12');
    expect(toBogotaMonthKey('2027-01-01T05:00:00.000Z')).toBe('2027-01');
  });

  it('shifts monthKeys across month and year boundaries accurately and rejects non-integer delta', () => {
    expect(addMonthsToMonthKey('2026-10', 1)).toBe('2026-11');
    expect(addMonthsToMonthKey('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToMonthKey('2027-01', -1)).toBe('2026-12');
    expect(addMonthsToMonthKey('2026-10', 10)).toBe('2027-08');
    expect(() => addMonthsToMonthKey('2026-10', 1.5)).toThrow(TypeError);
  });

  it('formats Spanish labels cleanly', () => {
    expect(formatMonthKeyLabelEs('2026-10')).toBe('Octubre 2026');
    expect(formatMonthKeyLabelEs('2027-08')).toBe('Agosto 2027');
  });
});
