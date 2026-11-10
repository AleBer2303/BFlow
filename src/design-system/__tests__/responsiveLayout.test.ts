import { resolveColumnCount } from '../components/ResponsiveColumns';
import { keepAmountsTogether } from '../components/Typography';
import {
  estimateCurrencyTextWidth,
  estimateTextWidth,
  minCardWidthForAmounts,
} from '../layout/currencyFit';
import {
  MIN_SUPPORTED_WIDTH,
  resolveResponsiveLayout,
  resolveWindowSizeClass,
} from '../layout/responsiveLayout';
import { breakpoints, contentMaxWidth } from '../tokens';

describe('resolveWindowSizeClass (Material 3 window size classes)', () => {
  it.each([
    [320, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1440, 'expanded'],
  ] as const)('%ipx is %s', (width, expected) => {
    expect(resolveWindowSizeClass(width)).toBe(expected);
  });

  it('matches the breakpoint tokens', () => {
    expect(breakpoints).toEqual({ medium: 600, expanded: 840, wide: 1024 });
  });
});

describe('resolveResponsiveLayout', () => {
  it.each([
    ['iPhone SE', 320, 288],
    ['Android compact', 360, 328],
    ['iPhone 15', 393, 361],
    ['iPhone 16 Pro Max', 440, 408],
  ] as const)('keeps a 16pt gutter on the %s (iOS skin)', (_name, width, contentWidth) => {
    const layout = resolveResponsiveLayout(width, 800, 'ios');
    expect(layout.gutter).toBe(16);
    expect(layout.contentWidth).toBe(contentWidth);
    expect(layout.sizeClass).toBe('compact');
    expect(layout.columns).toBe(4);
  });

  it('caps and centers the content column on tablets and foldables (native skins)', () => {
    const ios = resolveResponsiveLayout(1024, 768, 'ios');
    expect(ios.contentWidth).toBe(contentMaxWidth.ios);
    expect(ios.gutter).toBe(24);

    const android = resolveResponsiveLayout(840, 900, 'android');
    expect(android.contentWidth).toBe(contentMaxWidth.android);
    expect(android.sizeClass).toBe('expanded');
  });

  it('follows the web grid: 24 / 48 / 80px gutters and a 1280px column', () => {
    expect(resolveResponsiveLayout(390, 844, 'web')).toMatchObject({
      gutter: 24,
      contentWidth: 342,
      columns: 4,
      isWide: false,
    });
    expect(resolveResponsiveLayout(768, 1024, 'web')).toMatchObject({
      gutter: 48,
      contentWidth: 672,
      columns: 8,
      isWide: false,
    });
    expect(resolveResponsiveLayout(1024, 768, 'web')).toMatchObject({
      gutter: 80,
      contentWidth: 864,
      columns: 12,
      isWide: true,
    });
    expect(resolveResponsiveLayout(1440, 900, 'web')).toMatchObject({
      gutter: 80,
      contentWidth: 1280,
      isWide: true,
    });
    expect(resolveResponsiveLayout(2560, 1440, 'web').contentWidth).toBe(1280);
  });

  it('tightens the web gutter on the narrowest phones so content keeps 288px', () => {
    expect(resolveResponsiveLayout(320, 568, 'web')).toMatchObject({ gutter: 16, contentWidth: 288 });
  });

  it('uses a tighter column gap on phones', () => {
    expect(resolveResponsiveLayout(390, 844, 'android').columnGap).toBe(12);
    expect(resolveResponsiveLayout(900, 844, 'web').columnGap).toBe(24);
  });

  it('never lays out against an invalid window', () => {
    for (const width of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const layout = resolveResponsiveLayout(width, Number.NaN, 'ios');
      expect(layout.width).toBe(MIN_SUPPORTED_WIDTH);
      expect(layout.height).toBe(0);
      expect(layout.contentWidth).toBeGreaterThan(0);
    }
  });
});

describe('resolveColumnCount', () => {
  it('stacks on phones and splits when two columns keep their minimum width', () => {
    expect(resolveColumnCount(342, 400, 12, 2)).toBe(1);
    expect(resolveColumnCount(672, 400, 24, 2)).toBe(1);
    expect(resolveColumnCount(824, 400, 24, 2)).toBe(2);
    expect(resolveColumnCount(1280, 400, 24, 2)).toBe(2);
  });

  it('honours the column cap and rejects degenerate input', () => {
    expect(resolveColumnCount(1280, 300, 24, 3)).toBe(3);
    expect(resolveColumnCount(1280, 300, 24, 1)).toBe(1);
    expect(resolveColumnCount(1280, 0, 24, 4)).toBe(1);
    expect(resolveColumnCount(10, 400, 24, 2)).toBe(1);
  });
});

describe('currency width budget', () => {
  it('grows with the number of digits and the type size', () => {
    expect(estimateCurrencyTextWidth(4_000_000, 22)).toBe(estimateTextWidth('$ 4.000.000', 22));
    // 8 figures at 0.6em, 3 narrow glyphs at 0.28em.
    expect(estimateTextWidth('$ 4.000.000', 22)).toBe(Math.ceil((8 * 0.6 + 3 * 0.28) * 22));
    expect(estimateCurrencyTextWidth(123_456_789, 22)).toBeGreaterThan(
      estimateCurrencyTextWidth(4_000_000, 22)
    );
    expect(estimateCurrencyTextWidth(4_000_000, 38)).toBeGreaterThan(
      estimateCurrencyTextWidth(4_000_000, 22)
    );
  });

  it('sizes a card for its widest amount plus its padding', () => {
    const narrow = minCardWidthForAmounts([4_000_000, 2_920_000], 22, 32);
    const wide = minCardWidthForAmounts([4_000_000, 1_234_567_890], 22, 32);
    expect(narrow).toBe(estimateCurrencyTextWidth(4_000_000, 22) + 32);
    expect(wide).toBeGreaterThan(narrow);
    expect(minCardWidthForAmounts([], 22, 32)).toBe(32);
  });

  it('accounts for tracking and never returns a negative width', () => {
    expect(estimateTextWidth('Previstos', 11, 0.5)).toBeGreaterThan(estimateTextWidth('Previstos', 11));
    expect(estimateTextWidth('Previstos', 11, -1)).toBeLessThan(estimateTextWidth('Previstos', 11));
    expect(estimateTextWidth('ii', 4, -10)).toBe(0);
    expect(estimateTextWidth('', 22)).toBe(0);
  });

  it('lets two seven-digit cards share a row on a 375pt iPhone but not on a 320pt one', () => {
    const cardWidth = Math.max(
      minCardWidthForAmounts([4_000_000, 2_920_000], 22, 32, -0.4),
      estimateTextWidth('Previstos: $ 6.000.000', 11, 0.35) + 32
    );
    const gap = 12;
    expect(cardWidth * 2 + gap).toBeLessThanOrEqual(resolveResponsiveLayout(375, 812, 'ios').contentWidth);
    expect(cardWidth * 2 + gap).toBeGreaterThan(resolveResponsiveLayout(320, 568, 'ios').contentWidth);
  });
});

describe('keepAmountsTogether', () => {
  const NBSP = '\u00A0';

  it('joins the currency sign to its amount with a non-breaking space and keeps the sign', () => {
    expect(keepAmountsTogether('$ 2.000.000')).toBe('$' + NBSP + '2.000.000');
    expect(keepAmountsTogether('Pendiente · Previsto $ 2.000.000')).toBe(
      'Pendiente · Previsto $' + NBSP + '2.000.000'
    );
    expect(keepAmountsTogether('Recibido $ 4.000.000 / Previsto $ 6.000.000')).toBe(
      'Recibido $' + NBSP + '4.000.000 / Previsto $' + NBSP + '6.000.000'
    );
  });

  it('never drops or duplicates a character', () => {
    const text = 'Abono - $ 1.800.000 · Saldo $ 2.600.000';
    const joined = keepAmountsTogether(text);
    expect(joined).toHaveLength(text.length);
    expect(joined.split(NBSP).join(' ')).toBe(text);
  });

  it('leaves text without an amount untouched', () => {
    expect(keepAmountsTogether('Sin cambios ese día')).toBe('Sin cambios ese día');
    expect(keepAmountsTogether('Paga en $ pesos')).toBe('Paga en $ pesos');
    expect(keepAmountsTogether('')).toBe('');
  });
});
