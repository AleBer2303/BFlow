/**
 * src/design-system/tokens.ts
 *
 * Single source of truth for visual tokens in BFlow (documented in DESIGN.md).
 * Never hardcode colors, spacing, radii, or font sizes in feature components.
 *
 * Tokens are resolved per platform skin (iOS, Android, Web) by `useBFlowTheme()`. The bare
 * exports `palettes`, `radius` and `typography` are the iOS (Liquid Glass) set and stay for
 * backwards compatibility; feature code must read tokens from the theme hook, never from here.
 */

export type ThemeMode = 'dark' | 'light';

/**
 * Visual identity per platform ("piel"). Same product, data and flows; different material:
 * - ios:     Apple Liquid Glass (translucent blur, floating dock, spring physics).
 * - android: Material 3 (opaque tonal surfaces, the floating dock with a flat selection pill).
 *            No glass, no ripple.
 * - web:     flat editorial system dealt with the design-taste-frontend skill (ADR 0011).
 */
export type PlatformSkinId = 'ios' | 'android' | 'web';

export const PLATFORM_SKIN_IDS: readonly PlatformSkinId[] = ['ios', 'android', 'web'];

export type SurfaceMaterial = 'liquid-glass' | 'tonal' | 'flat';
export type NavigationPattern = 'floating-dock' | 'adaptive-header';
/**
 * How a control answers the finger: `spring` sinks and springs back (iOS), `sink` does the
 * same on a timed curve with no overshoot (Android), `step` is hover and press steps (Web).
 */
export type PressFeedback = 'spring' | 'sink' | 'step';
/** Cómo se dibuja la curva del mes: escena three.js sobre `expo-gl` o vectores animados (SVG). */
export type CurveStage = 'scene-3d' | 'vector';

export interface PlatformSkinSpec {
  id: PlatformSkinId;
  label: string;
  surfaceMaterial: SurfaceMaterial;
  navigation: NavigationPattern;
  pressFeedback: PressFeedback;
  /** Minimum interactive size: 44pt (Apple HIG / WCAG 2.2), 48dp (Material 3). */
  minTouchTarget: number;
  /**
   * Escenario de la curva del mes. La escena 3D es solo de iOS: en Android la superficie de
   * `expo-gl` no refresca los cuadros en pantalla y la curva se veía quieta (ADR 0014).
   */
  curveStage: CurveStage;
}

export const MIN_TOUCH_TARGET_PT = 44 as const;

export const platformSkins: Record<PlatformSkinId, PlatformSkinSpec> = {
  ios: {
    id: 'ios',
    label: 'iOS · Liquid Glass',
    surfaceMaterial: 'liquid-glass',
    navigation: 'floating-dock',
    pressFeedback: 'spring',
    minTouchTarget: MIN_TOUCH_TARGET_PT,
    curveStage: 'scene-3d',
  },
  android: {
    id: 'android',
    label: 'Android · Material 3',
    surfaceMaterial: 'tonal',
    navigation: 'floating-dock',
    pressFeedback: 'sink',
    minTouchTarget: 48,
    curveStage: 'vector',
  },
  web: {
    id: 'web',
    label: 'Web · Editorial plano',
    surfaceMaterial: 'flat',
    navigation: 'adaptive-header',
    pressFeedback: 'step',
    minTouchTarget: MIN_TOUCH_TARGET_PT,
    curveStage: 'vector',
  },
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 44,
  huge: 56,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export type RadiusScale = Record<keyof typeof radius, number>;

/**
 * iOS squircles · Material 3 shape scale · web "sharp" family (4/6/8) for a finance tool.
 * The web skin has ONE radius family, so its `pill` collapses to the control radius: buttons
 * and tags are 4px boxes there, never capsules (small dots still read as circles).
 */
export const radiusBySkin: Record<PlatformSkinId, RadiusScale> = {
  ios: radius,
  android: { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, pill: 999 },
  web: { xs: 2, sm: 4, md: 6, lg: 8, xl: 8, pill: 4 },
};

export const typography = {
  /** Largest headline: the first-screen statement (web sign-in hero). */
  display: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700' as const,
    letterSpacing: -1.2,
  },
  heroCurrency: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '700' as const,
    letterSpacing: -1.0,
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as const,
    letterSpacing: -0.4,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
  },
  callout: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
  },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.35,
  },
} as const;

export type TypographyVariantId = keyof typeof typography;

export interface TypographyStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
  fontFamily?: string;
}

export type TypographyScale = Record<TypographyVariantId, TypographyStyle>;

/** Pairing "geist" dealt by the design-taste-frontend skill; system-ui while it loads. */
export const WEB_FONT_FAMILY = 'Geist, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const WEB_FONT_STYLESHEET_URL =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400..700&display=swap';

function webType(
  fontSize: number,
  lineHeight: number,
  fontWeight: TypographyStyle['fontWeight'],
  letterSpacing: number
): TypographyStyle {
  return { fontSize, lineHeight, fontWeight, letterSpacing, fontFamily: WEB_FONT_FAMILY };
}

export const typographyBySkin: Record<PlatformSkinId, TypographyScale> = {
  // SF Pro: bold display with tight optical tracking.
  ios: typography,
  // Material 3 type scale on Roboto: regular-weight display, medium labels, open tracking.
  android: {
    display: { fontSize: 45, lineHeight: 52, fontWeight: '400', letterSpacing: 0 },
    heroCurrency: { fontSize: 36, lineHeight: 44, fontWeight: '400', letterSpacing: 0 },
    title1: { fontSize: 28, lineHeight: 36, fontWeight: '400', letterSpacing: 0 },
    title2: { fontSize: 22, lineHeight: 28, fontWeight: '400', letterSpacing: 0 },
    headline: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: 0.15 },
    body: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0.25 },
    callout: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1 },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
    micro: { fontSize: 11, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
  },
  // Geist: display 500 with tight tracking, reading text 16px, nothing under 13px.
  web: {
    display: webType(52, 56, '500', -2.2),
    heroCurrency: webType(38, 44, '500', -1.3),
    title1: webType(28, 34, '500', -0.8),
    title2: webType(20, 28, '500', -0.3),
    headline: webType(18, 26, '500', -0.2),
    body: webType(16, 24, '400', 0),
    callout: webType(15, 22, '500', 0),
    caption: webType(14, 20, '500', 0),
    micro: webType(13, 18, '500', 0),
  },
};

export interface ColorPalette {
  background: {
    primary: string;
    secondary: string;
    elevated: string;
  };
  /**
   * Surface tokens. The name is historical: on iOS they tint a blurred glass layer; on Android
   * and Web they are OPAQUE fills (tonal container / flat card) and `blurIntensity` is 0.
   */
  glass: {
    surfaceTint: string;
    surfaceElevatedTint: string;
    specularBorder: string;
    subtleBorder: string;
    blurIntensity: number;
    blurTint: 'dark' | 'light';
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  /** The one action color of the skin: navigation selection, focus ring, primary controls. */
  accent: {
    primary: string;
    onPrimary: string;
    /** Quiet selected-state fill (Material "secondary container", web tint). */
    container: string;
    onContainer: string;
    /** Accent used as text or icon on the page background (4.5:1 or more). */
    text: string;
  };
  semantic: {
    income: string;
    incomeSoft: string;
    expense: string;
    expenseSoft: string;
    completed: string;
    completedSoft: string;
    pending: string;
    pendingSoft: string;
    debt: string;
    debtSoft: string;
    reserve: string;
    reserveSoft: string;
    provisions: string;
    provisionsSoft: string;
    /** @deprecated use reserve */
    moto: string;
    /** @deprecated use reserveSoft */
    motoSoft: string;
    savings: string;
    savingsSoft: string;
  };
  /**
   * Data visualization. Six categorical hues, in order, for series that carry no financial
   * meaning (the slices of the expense donut). Each one keeps 3:1 against the page and the
   * cards (WCAG 1.4.11); series that do mean something use `semantic` instead.
   */
  chart: {
    categorical: readonly [string, string, string, string, string, string];
  };
}

/** iOS · Liquid Glass (also the historical default export). */
export const palettes: Record<ThemeMode, ColorPalette> = {
  dark: {
    background: {
      primary: '#0D0F12',
      secondary: '#14171C',
      elevated: '#1B1F26',
    },
    glass: {
      surfaceTint: 'rgba(24, 28, 35, 0.70)',
      surfaceElevatedTint: 'rgba(32, 38, 48, 0.82)',
      specularBorder: 'rgba(255, 255, 255, 0.08)',
      subtleBorder: 'rgba(255, 255, 255, 0.045)',
      blurIntensity: 40,
      blurTint: 'dark',
    },
    text: {
      primary: '#F4F5F7',
      secondary: '#9BA3AF',
      muted: '#636B79',
      inverse: '#0D0F12',
    },
    accent: {
      primary: '#388AF6',
      onPrimary: '#0D0F12',
      container: 'rgba(79, 143, 234, 0.16)',
      onContainer: '#F4F5F7',
      text: '#5C9DF2',
    },
    semantic: {
      income: '#2EBD85',
      incomeSoft: 'rgba(46, 189, 133, 0.10)',
      expense: '#E06A6A',
      expenseSoft: 'rgba(224, 106, 106, 0.10)',
      completed: '#2EBD85',
      completedSoft: 'rgba(46, 189, 133, 0.08)',
      pending: '#E5A84B',
      pendingSoft: 'rgba(229, 168, 75, 0.10)',
      debt: '#D9824C',
      debtSoft: 'rgba(217, 130, 76, 0.10)',
      reserve: '#4F8FEA',
      reserveSoft: 'rgba(79, 143, 234, 0.10)',
      provisions: '#4F8FEA',
      provisionsSoft: 'rgba(79, 143, 234, 0.10)',
      moto: '#4F8FEA',
      motoSoft: 'rgba(79, 143, 234, 0.10)',
      savings: '#9D7FE6',
      savingsSoft: 'rgba(157, 127, 230, 0.10)',
    },
    chart: {
      categorical: ['#4F8FEA', '#2BB3A6', '#E5A84B', '#E07A9A', '#9D7FE6', '#9CC45A'],
    },
  },
  light: {
    background: {
      primary: '#E7E6E0',
      secondary: '#DCDBD3',
      elevated: '#EFECE3',
    },
    glass: {
      surfaceTint: 'rgba(238, 234, 224, 0.94)',
      surfaceElevatedTint: 'rgba(247, 244, 236, 0.98)',
      specularBorder: 'rgba(90, 75, 45, 0.24)',
      subtleBorder: 'rgba(60, 50, 30, 0.14)',
      blurIntensity: 12,
      blurTint: 'light',
    },
    text: {
      primary: '#12151B',
      secondary: '#4E5562',
      muted: '#5A6272',
      inverse: '#FFFFFF',
    },
    accent: {
      primary: '#245F9F',
      onPrimary: '#FFFFFF',
      container: 'rgba(36, 95, 159, 0.14)',
      onContainer: '#12151B',
      text: '#245F9F',
    },
    semantic: {
      income: '#127551',
      incomeSoft: 'rgba(18, 117, 81, 0.10)',
      expense: '#A83232',
      expenseSoft: 'rgba(168, 50, 50, 0.10)',
      completed: '#127551',
      completedSoft: 'rgba(18, 117, 81, 0.10)',
      pending: '#8F5206',
      pendingSoft: 'rgba(143, 82, 6, 0.10)',
      debt: '#92440F',
      debtSoft: 'rgba(146, 68, 15, 0.10)',
      reserve: '#245F9F',
      reserveSoft: 'rgba(36, 95, 159, 0.10)',
      provisions: '#245F9F',
      provisionsSoft: 'rgba(36, 95, 159, 0.10)',
      moto: '#245F9F',
      motoSoft: 'rgba(36, 95, 159, 0.10)',
      savings: '#5F3DA6',
      savingsSoft: 'rgba(95, 61, 166, 0.10)',
    },
    chart: {
      categorical: ['#245F9F', '#0F7A70', '#8F5206', '#A8345F', '#5F3DA6', '#5A6E12'],
    },
  },
};

/**
 * Android · Material 3. Opaque tonal surfaces aligned to the iOS color palette (dark & light)
 * without translucency or blur. Semantic hues and chart colors match iOS while keeping AA contrast.
 */
export const androidPalettes: Record<ThemeMode, ColorPalette> = {
  dark: {
    background: {
      primary: '#0D0F12',
      secondary: '#14171C',
      elevated: '#1B1F26',
    },
    glass: {
      surfaceTint: '#15181E',
      surfaceElevatedTint: '#1D222B',
      specularBorder: 'rgba(255, 255, 255, 0.08)',
      subtleBorder: 'rgba(255, 255, 255, 0.045)',
      blurIntensity: 0,
      blurTint: 'dark',
    },
    text: {
      primary: '#F4F5F7',
      secondary: '#9BA3AF',
      muted: '#7A8291',
      inverse: '#0D0F12',
    },
    accent: {
      primary: '#388AF6',
      onPrimary: '#0D0F12',
      container: 'rgba(79, 143, 234, 0.16)',
      onContainer: '#F4F5F7',
      text: '#5C9DF2',
    },
    semantic: {
      income: '#2EBD85',
      incomeSoft: 'rgba(46, 189, 133, 0.10)',
      expense: '#E06A6A',
      expenseSoft: 'rgba(224, 106, 106, 0.10)',
      completed: '#2EBD85',
      completedSoft: 'rgba(46, 189, 133, 0.08)',
      pending: '#E5A84B',
      pendingSoft: 'rgba(229, 168, 75, 0.10)',
      debt: '#D9824C',
      debtSoft: 'rgba(217, 130, 76, 0.10)',
      reserve: '#4F8FEA',
      reserveSoft: 'rgba(79, 143, 234, 0.10)',
      provisions: '#4F8FEA',
      provisionsSoft: 'rgba(79, 143, 234, 0.10)',
      moto: '#4F8FEA',
      motoSoft: 'rgba(79, 143, 234, 0.10)',
      savings: '#9D7FE6',
      savingsSoft: 'rgba(157, 127, 230, 0.10)',
    },
    chart: {
      categorical: ['#4F8FEA', '#2BB3A6', '#E5A84B', '#E07A9A', '#9D7FE6', '#9CC45A'],
    },
  },
  light: {
    background: {
      primary: '#E7E6E0',
      secondary: '#DCDBD3',
      elevated: '#EFECE3',
    },
    glass: {
      surfaceTint: '#EEEAE0',
      surfaceElevatedTint: '#F7F4EC',
      specularBorder: 'rgba(90, 75, 45, 0.24)',
      subtleBorder: 'rgba(60, 50, 30, 0.14)',
      blurIntensity: 0,
      blurTint: 'light',
    },
    text: {
      primary: '#12151B',
      secondary: '#4E5562',
      muted: '#565E6E',
      inverse: '#FFFFFF',
    },
    accent: {
      primary: '#245F9F',
      onPrimary: '#FFFFFF',
      container: 'rgba(36, 95, 159, 0.14)',
      onContainer: '#12151B',
      text: '#245F9F',
    },
    semantic: {
      income: '#0F6B4A',
      incomeSoft: 'rgba(18, 117, 81, 0.10)',
      expense: '#A83232',
      expenseSoft: 'rgba(168, 50, 50, 0.10)',
      completed: '#0F6B4A',
      completedSoft: 'rgba(18, 117, 81, 0.10)',
      pending: '#8D5106',
      pendingSoft: 'rgba(143, 82, 6, 0.10)',
      debt: '#92440F',
      debtSoft: 'rgba(146, 68, 15, 0.10)',
      reserve: '#245F9F',
      reserveSoft: 'rgba(36, 95, 159, 0.10)',
      provisions: '#245F9F',
      provisionsSoft: 'rgba(36, 95, 159, 0.10)',
      moto: '#245F9F',
      motoSoft: 'rgba(36, 95, 159, 0.10)',
      savings: '#5F3DA6',
      savingsSoft: 'rgba(95, 61, 166, 0.10)',
    },
    chart: {
      categorical: ['#245F9F', '#0F7A70', '#8F5206', '#A8345F', '#5F3DA6', '#5A6E12'],
    },
  },
};

/**
 * Web · palette "putty-black-teal" dealt by the design-taste-frontend skill (ADR 0011):
 * a 90-95% neutral interface, one petrol-teal accent, hairlines at 11% / 20% of the ink.
 * The skill bans violet, so `savings` turns to rose here.
 */
export const webPalettes: Record<ThemeMode, ColorPalette> = {
  dark: {
    background: {
      primary: '#0A0A0A',
      secondary: '#151515',
      elevated: '#1F1F1E',
    },
    glass: {
      surfaceTint: '#151515',
      surfaceElevatedTint: '#1F1F1E',
      specularBorder: 'rgba(222, 218, 211, 0.26)',
      subtleBorder: 'rgba(222, 218, 211, 0.14)',
      blurIntensity: 0,
      blurTint: 'dark',
    },
    text: {
      primary: '#DEDAD3',
      secondary: '#B3AFA9',
      muted: '#93918C',
      inverse: '#0A0A0A',
    },
    accent: {
      primary: '#256F82',
      onPrimary: '#FFFFFF',
      container: 'rgba(95, 179, 198, 0.16)',
      onContainer: '#DEDAD3',
      text: '#5FB3C6',
    },
    semantic: {
      income: '#2EBD85',
      incomeSoft: 'rgba(46, 189, 133, 0.12)',
      expense: '#E57373',
      expenseSoft: 'rgba(229, 115, 115, 0.12)',
      completed: '#2EBD85',
      completedSoft: 'rgba(46, 189, 133, 0.12)',
      pending: '#E5A84B',
      pendingSoft: 'rgba(229, 168, 75, 0.12)',
      debt: '#D9824C',
      debtSoft: 'rgba(217, 130, 76, 0.12)',
      reserve: '#6FA4F0',
      reserveSoft: 'rgba(111, 164, 240, 0.12)',
      provisions: '#6FA4F0',
      provisionsSoft: 'rgba(111, 164, 240, 0.12)',
      moto: '#6FA4F0',
      motoSoft: 'rgba(111, 164, 240, 0.12)',
      savings: '#E08FB8',
      savingsSoft: 'rgba(224, 143, 184, 0.12)',
    },
    chart: {
      categorical: ['#6FA4F0', '#5FB3C6', '#E5A84B', '#E08FB8', '#A5CB66', '#C2B89A'],
    },
  },
  light: {
    background: {
      primary: '#DEDAD3',
      secondary: '#D3CEC6',
      elevated: '#E7E4DE',
    },
    glass: {
      surfaceTint: '#D3CEC6',
      surfaceElevatedTint: '#E7E4DE',
      specularBorder: 'rgba(10, 10, 10, 0.20)',
      subtleBorder: 'rgba(10, 10, 10, 0.11)',
      blurIntensity: 0,
      blurTint: 'light',
    },
    text: {
      primary: '#0A0A0A',
      secondary: '#3B3835',
      muted: '#55514C',
      inverse: '#FFFFFF',
    },
    accent: {
      primary: '#256F82',
      onPrimary: '#FFFFFF',
      container: 'rgba(37, 111, 130, 0.14)',
      onContainer: '#0A0A0A',
      text: '#1D5F70',
    },
    semantic: {
      income: '#0F6143',
      incomeSoft: 'rgba(15, 97, 67, 0.10)',
      expense: '#9A2B2B',
      expenseSoft: 'rgba(154, 43, 43, 0.10)',
      completed: '#0F6143',
      completedSoft: 'rgba(15, 97, 67, 0.10)',
      pending: '#7A4504',
      pendingSoft: 'rgba(122, 69, 4, 0.10)',
      debt: '#843C0C',
      debtSoft: 'rgba(132, 60, 12, 0.10)',
      reserve: '#1F5590',
      reserveSoft: 'rgba(31, 85, 144, 0.10)',
      provisions: '#1F5590',
      provisionsSoft: 'rgba(31, 85, 144, 0.10)',
      moto: '#1F5590',
      motoSoft: 'rgba(31, 85, 144, 0.10)',
      savings: '#8A3A66',
      savingsSoft: 'rgba(138, 58, 102, 0.10)',
    },
    chart: {
      categorical: ['#1F5590', '#0E6B5E', '#7A4504', '#8A3A66', '#4C5E0E', '#5E574C'],
    },
  },
};

export const palettesBySkin: Record<PlatformSkinId, Record<ThemeMode, ColorPalette>> = {
  ios: palettes,
  android: androidPalettes,
  web: webPalettes,
};

/**
 * Responsive breakpoints (window width in pt/dp/px). Material 3 window size classes; the web
 * skin switches its header navigation and grid on the same steps.
 */
export const breakpoints = {
  /** From here up: `medium` (large phones in landscape, foldables, small tablets). */
  medium: 600,
  /** From here up: `expanded` (tablets, desktop browsers). */
  expanded: 840,
  /** From here up the web grid uses its full 80px gutters. */
  wide: 1024,
} as const;

/** Widest content column per skin. Web: the skill's 1280px `.wrap`. */
export const contentMaxWidth: Record<PlatformSkinId, number> = {
  ios: 560,
  android: 600,
  web: 1280,
};

/** Web micro-interaction timings (skill: motion.md). No bounce or overshoot on the web skin. */
export const webMotion = {
  hoverInMs: 140,
  hoverOutMs: 200,
  pressMs: 90,
  slideMs: 240,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  buttonStepPt: 1,
  pressScale: 0.985,
} as const;

/** Touch press (iOS and Android): the control sinks and dims under the finger. */
export const pressSinkMotion = {
  scale: 0.97,
  dimOpacity: 0.82,
} as const;

export const springConfigs = {
  snappy: {
    damping: 20,
    stiffness: 260,
    mass: 0.8,
  },
  gentle: {
    damping: 24,
    stiffness: 170,
    mass: 0.95,
  },
  sheet: {
    damping: 30,
    stiffness: 160,
    mass: 1.1,
  },
  /** Liquid lens settling on a tab: soft, with a barely perceptible overshoot. */
  liquidSettle: {
    damping: 16,
    stiffness: 170,
    mass: 1,
  },
  /** Flat selection pill of the dock (Android) settling on a tab: no overshoot. */
  flatSettle: {
    damping: 28,
    stiffness: 170,
    mass: 1,
  },
  /** Lens "lift" (grow) and velocity stretch: gentle and elastic. */
  liquidLift: {
    damping: 14,
    stiffness: 190,
    mass: 0.9,
  },
} as const;

/**
 * Motion scale shared by the three skins (transitions.dev tokens, DESIGN.md §6.4). A value is
 * picked by what the motion DOES (its usage), never by the nearest number.
 */
export const motionDuration = {
  /** Offset between items that enter one after another. */
  stagger: 40,
  /** Intent delay and one segment of an error shake. */
  micro: 80,
  /** Dialog or menu closing, text swapping in place. */
  quick: 150,
  /** Dialog or menu opening, icon swap, sliding tabs, screen change. */
  fast: 250,
  /** Panel or toast closing. */
  medium: 350,
  /** Panel opening, loaded content replacing its placeholder. */
  slow: 400,
  /** One-off emphasis: success check, badge appearing. */
  emphasis: 500,
} as const;

export type MotionDurationId = keyof typeof motionDuration;

/** Travel in points. It shrinks with frequency and grows with ceremony. */
export const motionDistance = {
  /** Text swapping in place. */
  micro: 4,
  /** Small segment of an error shake. */
  small: 6,
  /** Screen change and large segment of an error shake. */
  base: 8,
  /** Stacked lines of text entering. */
  medium: 12,
  /** Toast or sheet rising from an edge. */
  large: 30,
} as const;

/** The scale a surface animates FROM (or presses down to); it always settles at 1. */
export const motionScale = {
  dialog: 0.96,
  menu: 0.97,
  menuClose: 0.99,
  hint: 0.98,
} as const;

/** Items past this index enter with the last staggered offset, so a long list is never late. */
export const MOTION_STAGGER_MAX_ITEMS = 6;

/** Reduce Motion: no travel or scale, a short opacity change only (DESIGN.md §6.2). */
export const REDUCED_MOTION_DURATION_MS = 140;

export type CubicBezier = readonly [number, number, number, number];

export interface SkinMotion {
  /** A surface entering, moving or resizing. */
  enter: CubicBezier;
  /** A surface leaving. */
  exit: CubicBezier;
  /** Entrances may overshoot (success check, badge). Never on Android or Web. */
  allowsOvershoot: boolean;
  /** How a dialog arrives: rising from the bottom edge or growing in place. */
  dialogPresentation: 'sheet' | 'dialog';
}

/**
 * - ios:     the smooth-out curve, with spring overshoot on celebratory entrances.
 * - android: Material 3 emphasized decelerate (enter) and accelerate (exit). No overshoot.
 * - web:     the curve of `webMotion`. No bounce, nothing tied to scroll (AGENTS.md §7.2).
 */
export const motionBySkin: Record<PlatformSkinId, SkinMotion> = {
  ios: {
    enter: [0.22, 1, 0.36, 1],
    exit: [0.22, 1, 0.36, 1],
    allowsOvershoot: true,
    dialogPresentation: 'sheet',
  },
  android: {
    enter: [0.05, 0.7, 0.1, 1],
    exit: [0.3, 0, 0.8, 0.15],
    allowsOvershoot: false,
    dialogPresentation: 'dialog',
  },
  web: {
    enter: [0.2, 0.8, 0.2, 1],
    exit: [0.2, 0.8, 0.2, 1],
    allowsOvershoot: false,
    dialogPresentation: 'dialog',
  },
};
