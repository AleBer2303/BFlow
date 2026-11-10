/**
 * src/design-system/layout/currencyFit.ts
 *
 * Width budget for a line of text, so side-by-side cards can decide to take their own rows
 * BEFORE a long amount overflows or breaks in two (small phones, large balances, Dynamic
 * Type). An estimate, not a measurement: glyphs are grouped in four width classes that hold
 * for SF Pro, Roboto and Geist with tabular figures.
 */

import { formatCurrency } from '../../domain/money/money';

/** Advance widths in em. */
const GLYPH_EM = {
  /** Digits and the currency sign share the tabular figure width. */
  figure: 0.6,
  /** Spaces, thousands separators and thin punctuation. */
  narrow: 0.28,
  uppercase: 0.66,
  other: 0.52,
} as const;

const NARROW_GLYPHS = new Set([' ', '.', ',', ':', ';', "'", '|', '!', 'i', 'l', 'j', 'í']);

function glyphEm(char: string): number {
  if ((char >= '0' && char <= '9') || char === '$') {
    return GLYPH_EM.figure;
  }
  if (NARROW_GLYPHS.has(char)) {
    return GLYPH_EM.narrow;
  }
  if (char !== char.toLowerCase() && char === char.toUpperCase()) {
    return GLYPH_EM.uppercase;
  }
  return GLYPH_EM.other;
}

/**
 * @param letterSpacing tracking of the type style, in points per glyph (may be negative).
 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  letterSpacing: number = 0
): number {
  let width = 0;
  for (const char of text) {
    width += glyphEm(char) * fontSize + letterSpacing;
  }
  return Math.max(0, Math.ceil(width));
}

export function estimateCurrencyTextWidth(
  amount: number,
  fontSize: number,
  letterSpacing: number = 0
): number {
  return estimateTextWidth(formatCurrency(amount), fontSize, letterSpacing);
}

/**
 * Minimum width a card needs to show `amounts` on one line each.
 *
 * @param horizontalPadding total left + right padding of the card.
 */
export function minCardWidthForAmounts(
  amounts: readonly number[],
  fontSize: number,
  horizontalPadding: number,
  letterSpacing: number = 0
): number {
  const widest = amounts.reduce(
    (max, amount) => Math.max(max, estimateCurrencyTextWidth(amount, fontSize, letterSpacing)),
    0
  );
  return widest + horizontalPadding;
}
