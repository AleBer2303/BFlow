import {
  assertSafeMoneyInteger,
  calculateMonthlyProvisionCeil,
  formatCop,
  parseCopInteger,
  sumMoneyIntegers,
} from '../money';

describe('domain/money — integer COP/USD rules and formatting', () => {
  it('formats positive, zero, and negative COP integers using "$ 1.080.000" format', () => {
    expect(formatCop(0)).toBe('$ 0');
    expect(formatCop(20_000)).toBe('$ 20.000');
    expect(formatCop(1_080_000)).toBe('$ 1.080.000');
    expect(formatCop(4_000_000)).toBe('$ 4.000.000');
    expect(formatCop(6_200_000)).toBe('$ 6.200.000');
    expect(formatCop(-450_000)).toBe('-$ 450.000');
  });

  it('rejects floats, NaN, and Infinity with a TypeError', () => {
    expect(() => assertSafeMoneyInteger(872666.67)).toThrow(TypeError);
    expect(() => formatCop(100.5)).toThrow(TypeError);
    expect(() => formatCop(Number.NaN)).toThrow(TypeError);
    expect(() => formatCop(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('parses formatted COP strings back into safe integers and rejects non-numeric strings', () => {
    expect(parseCopInteger('$ 1.080.000')).toBe(1_080_000);
    expect(parseCopInteger('-$ 450.000')).toBe(-450_000);
    expect(parseCopInteger('$ 0')).toBe(0);
    expect(parseCopInteger(3_370_000)).toBe(3_370_000);
    expect(() => parseCopInteger('')).toThrow(TypeError);
    expect(() => parseCopInteger('$ ---')).toThrow(TypeError);
  });

  it('sums arrays of integers without loss of precision', () => {
    const octoberFixedPaid = [500_000, 1_800_000, 120_000, 200_000];
    expect(sumMoneyIntegers(octoberFixedPaid)).toBe(2_620_000);
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
