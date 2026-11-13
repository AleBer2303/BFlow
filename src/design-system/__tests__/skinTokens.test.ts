/**
 * Contract of the three platform skins (iOS, Android, Web): identity, accessibility and the
 * rules that keep one platform's material from leaking into another.
 */

import { parsePlatformSkin, resolveInitialThemeMode, resolvePlatformSkin } from '../platform/platformSkin';
import {
  MIN_TOUCH_TARGET_PT,
  PLATFORM_SKIN_IDS,
  WEB_FONT_FAMILY,
  palettesBySkin,
  palettes,
  platformSkins,
  radius,
  radiusBySkin,
  typography,
  typographyBySkin,
  type ColorPalette,
  type PlatformSkinId,
  type ThemeMode,
} from '../tokens';

const MODES: readonly ThemeMode[] = ['dark', 'light'];

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1] as string, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgba) {
    const parts = (rgba[1] as string).split(',').map((part) => Number(part.trim()));
    return { r: parts[0] as number, g: parts[1] as number, b: parts[2] as number, a: parts[3] ?? 1 };
  }
  throw new Error(`Unsupported color "${value}"`);
}

/** Flattens a translucent color over an opaque background. */
function over(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  const mix = (a: number, b: number) => Math.round(a * fg.a + b * (1 - fg.a));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(fg.r, bg.r))}${toHex(mix(fg.g, bg.g))}${toHex(mix(fg.b, bg.b))}`;
}

function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** OKLCH chroma and hue (degrees) of an sRGB color. */
function oklch(color: string): { chroma: number; hue: number } {
  const { r, g, b } = parseColor(color);
  const lin = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    chroma: Math.sqrt(a * a + bb * bb),
    hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

function opaqueSurfaces(colors: ColorPalette): string[] {
  const page = colors.background.primary;
  return [
    colors.background.primary,
    colors.background.secondary,
    colors.background.elevated,
    over(colors.glass.surfaceTint, page),
    over(colors.glass.surfaceElevatedTint, page),
  ];
}

const SEMANTIC_KEYS = ['income', 'expense', 'completed', 'pending', 'debt', 'reserve', 'savings'] as const;

describe('platform skin resolution', () => {
  it('gives each operating system its own skin', () => {
    expect(resolvePlatformSkin('ios', null)).toBe('ios');
    expect(resolvePlatformSkin('android', null)).toBe('android');
    expect(resolvePlatformSkin('web', null)).toBe('web');
  });

  it('keeps Liquid Glass on any other Apple-family target', () => {
    expect(resolvePlatformSkin('macos', null)).toBe('ios');
    expect(resolvePlatformSkin('visionos', null)).toBe('ios');
  });

  it('lets the demo override force a skin and ignores invalid values', () => {
    expect(resolvePlatformSkin('web', 'android')).toBe('android');
    expect(resolvePlatformSkin('web', ' IOS ')).toBe('ios');
    expect(resolvePlatformSkin('web', 'windows')).toBe('web');
    expect(resolvePlatformSkin('android', '')).toBe('android');
  });

  it('parses skin ids defensively', () => {
    expect(parsePlatformSkin('web')).toBe('web');
    expect(parsePlatformSkin(undefined)).toBeNull();
    expect(parsePlatformSkin(null)).toBeNull();
    expect(parsePlatformSkin('glass')).toBeNull();
  });

  it('resolves the initial theme from the demo override or the fallback', () => {
    expect(resolveInitialThemeMode('dark', null)).toBe('dark');
    expect(resolveInitialThemeMode('dark', 'light')).toBe('light');
    expect(resolveInitialThemeMode('light', 'sepia')).toBe('light');
  });
});

describe('platform skin identity', () => {
  it('declares a distinct material and press feedback per skin, and the dock on iOS and Android', () => {
    expect(platformSkins.ios).toMatchObject({
      surfaceMaterial: 'liquid-glass',
      navigation: 'floating-dock',
      pressFeedback: 'spring',
    });
    expect(platformSkins.android).toMatchObject({
      surfaceMaterial: 'tonal',
      navigation: 'floating-dock',
      pressFeedback: 'sink',
    });
    expect(platformSkins.web).toMatchObject({
      surfaceMaterial: 'flat',
      navigation: 'adaptive-header',
      pressFeedback: 'step',
    });

    // iOS and Android share the floating dock (ADR 0024); material and touch stay distinct.
    for (const field of ['surfaceMaterial', 'pressFeedback'] as const) {
      expect(new Set(PLATFORM_SKIN_IDS.map((id) => platformSkins[id][field])).size).toBe(3);
    }
  });

  it('draws the month curve in 3D only on iOS; Android and Web use the animated vectors', () => {
    expect(platformSkins.ios.curveStage).toBe('scene-3d');
    expect(platformSkins.android.curveStage).toBe('vector');
    expect(platformSkins.web.curveStage).toBe('vector');
  });

  it('uses 44pt targets on iOS and Web and 48dp on Android', () => {
    expect(platformSkins.ios.minTouchTarget).toBe(MIN_TOUCH_TARGET_PT);
    expect(platformSkins.web.minTouchTarget).toBe(MIN_TOUCH_TARGET_PT);
    expect(platformSkins.android.minTouchTarget).toBe(48);
  });

  it('keeps the historical exports as the iOS skin', () => {
    expect(palettesBySkin.ios).toBe(palettes);
    expect(radiusBySkin.ios).toBe(radius);
    expect(typographyBySkin.ios).toBe(typography);
  });

  it('gives every skin a different page, accent and radius family', () => {
    for (const mode of MODES) {
      const pages = PLATFORM_SKIN_IDS.map((id) => palettesBySkin[id][mode].background.primary);
      const accents = PLATFORM_SKIN_IDS.map((id) => palettesBySkin[id][mode].accent.primary);
      expect(new Set(pages).size).toBe(3);
      expect(new Set(accents).size).toBe(3);
    }
    expect(new Set(PLATFORM_SKIN_IDS.map((id) => radiusBySkin[id].lg)).size).toBe(3);
  });
});

describe('Liquid Glass stays on iOS', () => {
  it('blurs only on iOS', () => {
    for (const mode of MODES) {
      expect(palettesBySkin.ios[mode].glass.blurIntensity).toBeGreaterThan(0);
      expect(palettesBySkin.android[mode].glass.blurIntensity).toBe(0);
      expect(palettesBySkin.web[mode].glass.blurIntensity).toBe(0);
    }
  });

  it('uses opaque surfaces on Android and Web, translucent ones on iOS', () => {
    for (const mode of MODES) {
      for (const skin of ['android', 'web'] as const) {
        const { glass } = palettesBySkin[skin][mode];
        expect(parseColor(glass.surfaceTint).a).toBe(1);
        expect(parseColor(glass.surfaceElevatedTint).a).toBe(1);
      }
      expect(parseColor(palettesBySkin.ios[mode].glass.surfaceTint).a).toBeLessThan(1);
    }
  });
});

describe.each(PLATFORM_SKIN_IDS)('accessibility of the %s skin', (skin: PlatformSkinId) => {
  it.each(MODES)('keeps body text at WCAG AA or better on every surface (%s)', (mode) => {
    const colors = palettesBySkin[skin][mode];
    for (const surface of opaqueSurfaces(colors)) {
      expect(contrast(colors.text.primary, surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(colors.text.secondary, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(MODES)('keeps the accent readable as fill, text and selection (%s)', (mode) => {
    const colors = palettesBySkin[skin][mode];
    const page = colors.background.primary;
    expect(contrast(colors.accent.onPrimary, colors.accent.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accent.primary, page)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.accent.text, page)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(colors.accent.onContainer, over(colors.accent.container, page))
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(['android', 'web'] as const)('new %s palettes', (skin) => {
  it.each(MODES)('keeps muted text and semantic colors at AA on the page and cards (%s)', (mode) => {
    const colors = palettesBySkin[skin][mode];
    const page = colors.background.primary;
    const card = over(colors.glass.surfaceTint, page);

    for (const surface of [page, colors.background.secondary, card]) {
      expect(contrast(colors.text.muted, surface)).toBeGreaterThanOrEqual(4.5);
      for (const key of SEMANTIC_KEYS) {
        expect(contrast(colors.semantic[key], surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('Android skin (Material 3)', () => {
  it('follows the Material shape scale and type scale', () => {
    expect(radiusBySkin.android).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 28, pill: 999 });
    expect(typographyBySkin.android.heroCurrency.fontWeight).toBe('400');
    expect(typographyBySkin.android.body.fontSize).toBe(14);
    expect(typographyBySkin.android.caption.letterSpacing).toBe(0.5);
    // Roboto is the system face: no custom family is forced.
    expect(typographyBySkin.android.body.fontFamily).toBeUndefined();
  });
});

describe('Web skin (design-taste-frontend system)', () => {
  it('uses the dealt palette and the sharp radius family', () => {
    expect(palettesBySkin.web.light.background.primary).toBe('#DEDAD3');
    expect(palettesBySkin.web.light.glass.surfaceTint).toBe('#D3CEC6');
    expect(palettesBySkin.web.light.text.primary).toBe('#0A0A0A');
    expect(palettesBySkin.web.light.accent.primary).toBe('#256F82');
    expect(radiusBySkin.web).toMatchObject({ sm: 4, md: 6, lg: 8 });
    // One radius family: capsules collapse to the control radius.
    expect(radiusBySkin.web.pill).toBe(radiusBySkin.web.sm);
  });

  it('never uses violet or lavender', () => {
    for (const mode of MODES) {
      const colors = palettesBySkin.web[mode];
      const tints = [colors.accent.primary, colors.accent.text, ...SEMANTIC_KEYS.map((key) => colors.semantic[key])];
      for (const tint of tints) {
        const { chroma, hue } = oklch(tint);
        const isViolet = chroma > 0.05 && hue > 270 && hue < 330;
        expect({ tint, isViolet }).toEqual({ tint, isViolet: false });
      }
    }
    // The other skins keep their amethyst savings color: the rule is the web system's.
    expect(oklch(palettesBySkin.ios.dark.semantic.savings).hue).toBeGreaterThan(270);
  });

  it('sets reading text at 16px and nothing under 13px, all in the dealt typeface', () => {
    const scale = typographyBySkin.web;
    expect(scale.body.fontSize).toBe(16);
    for (const style of Object.values(scale)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(13);
      expect(style.fontFamily).toBe(WEB_FONT_FAMILY);
      expect(['400', '500']).toContain(style.fontWeight);
    }
    expect(WEB_FONT_FAMILY.startsWith('Geist')).toBe(true);
  });

  it('draws hairlines at about 11% and 20% of the ink', () => {
    expect(parseColor(palettesBySkin.web.light.glass.subtleBorder).a).toBeCloseTo(0.11, 2);
    expect(parseColor(palettesBySkin.web.light.glass.specularBorder).a).toBeCloseTo(0.2, 2);
  });
});

describe.each(PLATFORM_SKIN_IDS)('chart colors of the %s skin', (skin: PlatformSkinId) => {
  it.each(MODES)('gives six distinct categorical hues at 3:1 on the page and cards (%s)', (mode) => {
    const colors = palettesBySkin[skin][mode];
    const { categorical } = colors.chart;
    expect(categorical).toHaveLength(6);
    expect(new Set(categorical.map((tint) => tint.toUpperCase())).size).toBe(6);

    const page = colors.background.primary;
    for (const surface of [page, colors.background.secondary, over(colors.glass.surfaceTint, page)]) {
      for (const tint of categorical) {
        expect({ tint, surface, ok: contrast(tint, surface) >= 3 }).toEqual({ tint, surface, ok: true });
      }
    }
  });

  it.each(MODES)('keeps every categorical hue apart from its neighbours (%s)', (mode) => {
    const { categorical } = palettesBySkin[skin][mode].chart;
    const hues = categorical.map((tint) => oklch(tint));
    for (let index = 1; index < hues.length; index += 1) {
      const previous = hues[index - 1] as { hue: number };
      const current = hues[index] as { hue: number };
      const distance = Math.abs(previous.hue - current.hue);
      expect(Math.min(distance, 360 - distance)).toBeGreaterThan(25);
    }
  });
});

describe('chart colors of the web skin', () => {
  it('never use violet or lavender', () => {
    for (const mode of MODES) {
      for (const tint of palettesBySkin.web[mode].chart.categorical) {
        const { chroma, hue } = oklch(tint);
        const isViolet = chroma > 0.05 && hue > 270 && hue < 330;
        expect({ tint, isViolet }).toEqual({ tint, isViolet: false });
      }
    }
  });
});
