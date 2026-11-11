/**
 * src/domain/money/money.ts
 *
 * Pure integer monetary operations and deterministic formatting for BFlow.
 * Universal & agnostic: Money is ALWAYS a safe integer (no floats, no decimals).
 * Formats integers deterministically into "$ 1.080.000" (or "-$ 450.000" for negatives).
 */

export interface CurrencyFormatOptions {
  symbol?: string;
  thousandsSeparator?: string;
}

/**
 * Validates that a monetary amount is a safe integer (no decimals or NaN/Infinity).
 */
export function assertSafeMoneyInteger(amount: number, context = 'amount'): number {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
    throw new TypeError(`Invalid monetary ${context}: expected safe integer, received ${String(amount)}`);
  }
  return amount;
}

/**
 * Formats an integer amount deterministically: "$ 1.080.000" or "-$ 450.000"
 * Deterministic across Hermes (iOS), Android, and Web without depending on ICU locale quirks.
 */
export function formatCurrency(amount: number, options?: CurrencyFormatOptions): string {
  assertSafeMoneyInteger(amount, 'formatCurrency');
  const symbol = options?.symbol ?? '$';
  const sep = options?.thousandsSeparator ?? '.';
  const isNegative = amount < 0;
  const absDigits = Math.abs(amount).toString();
  const withThousands = absDigits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return isNegative ? `-${symbol} ${withThousands}` : `${symbol} ${withThousands}`;
}

/**
 * Compact currency formatter for widgets and tight badges: "$ 1.2M", "$ 450k", etc.
 */
export function formatCurrencyCompact(amount: number, symbol = '$'): string {
  assertSafeMoneyInteger(amount, 'formatCurrencyCompact');
  const isNegative = amount < 0;
  const abs = Math.abs(amount);

  let formatted: string;
  if (abs >= 1_000_000_000) {
    const value = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
    formatted = `${symbol} ${value}B`;
  } else if (abs >= 1_000_000) {
    const value = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    formatted = `${symbol} ${value}M`;
  } else if (abs >= 1_000) {
    const value = (abs / 1_000).toFixed(0);
    formatted = `${symbol} ${value}k`;
  } else {
    formatted = `${symbol} ${abs}`;
  }

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parses a formatted currency string like "$ 1.080.000", "$1,080,000", or "1080000" into a safe integer.
 */
/** A difference always carries its sign: "+$ 120.000", "-$ 80.000", "$ 0". */
export function formatSignedCurrency(amount: number, options?: CurrencyFormatOptions): string {
  const formatted = formatCurrency(amount, options);
  return amount > 0 ? `+${formatted}` : formatted;
}

export function parseCurrencyInteger(input: string | number): number {
  if (typeof input === 'number') {
    return assertSafeMoneyInteger(input, 'parseCurrencyInteger');
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new TypeError('Cannot parse empty monetary string');
  }
  const isNegative = trimmed.startsWith('-');
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (!digitsOnly) {
    throw new TypeError(`Cannot parse monetary string: "${input}"`);
  }
  const parsed = Number(digitsOnly) * (isNegative ? -1 : 1);
  return assertSafeMoneyInteger(parsed, 'parseCurrencyInteger');
}

/**
 * Backward-compatible aliases
 */
export const formatCop = formatCurrency;
export const formatCopCompact = formatCurrencyCompact;
export const parseCopInteger = parseCurrencyInteger;

/**
 * Sums an array of safe integer monetary amounts without floating-point drift.
 */
export function sumMoneyIntegers(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    assertSafeMoneyInteger(amount, 'sumMoneyIntegers element');
    total += amount;
    assertSafeMoneyInteger(total, 'sumMoneyIntegers accumulator');
  }
  return total;
}

/**
 * Calculates the monthly provision for a cycle cost using the ceiling integer rule:
 * monthlyProvision = Math.ceil(cycleCost / periodMonths)
 */
export function calculateMonthlyProvisionCeil(cycleCost: number, periodMonths: number): number {
  assertSafeMoneyInteger(cycleCost, 'cycleCost');
  assertSafeMoneyInteger(periodMonths, 'periodMonths');
  if (cycleCost < 0) {
    throw new RangeError('cycleCost must be >= 0');
  }
  if (periodMonths <= 0) {
    throw new RangeError('periodMonths must be >= 1');
  }
  return Math.ceil(cycleCost / periodMonths);
}
