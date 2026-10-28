/**
 * src/domain/money/money.ts
 *
 * Pure integer monetary operations and deterministic formatting for BFlow.
 * Rule of Iron: Money is ALWAYS a safe integer (no floats, no decimals).
 * Visual format for COP / USD uses "$ 1.080.000" (or "-$ 450.000" for negatives).
 */

export type SupportedCurrency = 'COP' | 'USD';

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
 * Formats an integer amount into the exact Excel convention: "$ 1.080.000"
 * Deterministic across Hermes (iOS), Node (Windows), and Web without depending on ICU locale quirks.
 */
export function formatCop(amount: number): string {
  assertSafeMoneyInteger(amount, 'formatCop');
  const isNegative = amount < 0;
  const absDigits = Math.abs(amount).toString();
  const withThousands = absDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return isNegative ? `-$ ${withThousands}` : `$ ${withThousands}`;
}

/**
 * Parses a formatted currency string like "$ 1.080.000" or "1080000" into a safe integer.
 */
export function parseCopInteger(input: string | number): number {
  if (typeof input === 'number') {
    return assertSafeMoneyInteger(input, 'parseCopInteger');
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
  return assertSafeMoneyInteger(parsed, 'parseCopInteger');
}

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
