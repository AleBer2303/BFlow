import {
  assertSafeMoneyInteger,
  calculateMonthlyProvisionCeil,
  formatCop,
  formatCurrency,
  formatCurrencyCompact,
  formatSignedCurrency,
  parseCopInteger,
  parseCurrencyInteger,
  sumMoneyIntegers,
} from '../money';

describe('domain/money — integer monetary operations and universal formatting', () => {
  it('formats positive, zero, and negative integers using standard "$ 1.080.000" format', () => {
    expect(formatCurrency(0)).toBe('$ 0');
    expect(formatCurrency(20_000)).toBe('$ 20.000');
    expect(formatCurrency(1_080_000)).toBe('$ 1.080.000');
    expect(formatCurrency(4_000_000)).toBe('$ 4.000.000');
    expect(formatCurrency(6_200_000)).toBe('$ 6.200.000');
    expect(formatCurrency(-450_000)).toBe('-$ 450.000');
    expect(formatCop(1_080_000)).toBe('$ 1.080.000');
  });

  it('formats compact representations for widgets and tags', () => {
    expect(formatCurrencyCompact(500)).toBe('$ 500');
    expect(formatCurrencyCompact(450_000)).toBe('$ 450k');
    expect(formatCurrencyCompact(1_080_000)).toBe('$ 1.1M');
    expect(formatCurrencyCompact(2_000_000_000)).toBe('$ 2B');
    expect(formatCurrencyCompact(-450_000)).toBe('-$ 450k');
  });

  it('rejects floats, NaN, and Infinity with a TypeError', () => {
    expect(() => assertSafeMoneyInteger(872666.67)).toThrow(TypeError);
    expect(() => formatCurrency(100.5)).toThrow(TypeError);
    expect(() => formatCurrency(Number.NaN)).toThrow(TypeError);
    expect(() => formatCurrency(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('parses formatted strings back into safe integers and rejects non-numeric strings', () => {
    expect(parseCurrencyInteger('$ 1.080.000')).toBe(1_080_000);
    expect(parseCurrencyInteger('-$ 450.000')).toBe(-450_000);
    expect(parseCurrencyInteger('$ 0')).toBe(0);
    expect(parseCurrencyInteger(3_370_000)).toBe(3_370_000);
    expect(parseCopInteger('$ 1.080.000')).toBe(1_080_000);
    expect(() => parseCurrencyInteger('')).toThrow(TypeError);
    expect(() => parseCurrencyInteger('$ ---')).toThrow(TypeError);
  });

  it('sums arrays of integers without loss of precision', () => {
    const fixedPaid = [500_000, 1_800_000, 120_000, 200_000];
    expect(sumMoneyIntegers(fixedPaid)).toBe(2_620_000);
  });

  it('calculates monthly provision using Math.ceil(cycleCost / periodMonths) and validates ranges', () => {
    expect(calculateMonthlyProvisionCeil(800_000, 12)).toBe(66_667);
    expect(calculateMonthlyProvisionCeil(252_000, 12)).toBe(21_000);
    expect(calculateMonthlyProvisionCeil(500_000, 12)).toBe(41_667);
    expect(calculateMonthlyProvisionCeil(1_000_000, 12)).toBe(83_334);
    expect(() => calculateMonthlyProvisionCeil(-1, 12)).toThrow(RangeError);
    expect(() => calculateMonthlyProvisionCeil(100_000, 0)).toThrow(RangeError);
  });
});

describe('formatSignedCurrency', () => {
  it('always shows the sign of a difference', () => {
    expect(formatSignedCurrency(120_000)).toBe('+$ 120.000');
    expect(formatSignedCurrency(-80_000)).toBe('-$ 80.000');
    expect(formatSignedCurrency(0)).toBe('$ 0');
  });

  it('refuses decimals like every money formatter', () => {
    expect(() => formatSignedCurrency(1.5)).toThrow();
  });
});
