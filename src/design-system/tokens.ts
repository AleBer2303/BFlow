/**
 * src/design-system/tokens.ts
 *
 * Single source of truth for visual tokens in BFlow (documented in DESIGN.md).
 * Never hardcode colors, spacing, radii, or font sizes in feature components.
 */

export type ThemeMode = 'dark' | 'light';

export const MIN_TOUCH_TARGET_PT = 44 as const;

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

export const typography = {
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

export interface ColorPalette {
  background: {
    primary: string;
    secondary: string;
    elevated: string;
  };
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
}

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
  },
};

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
  /** Lens "lift" (grow) and velocity stretch: gentle and elastic. */
  liquidLift: {
    damping: 14,
    stiffness: 190,
    mass: 0.9,
  },
} as const;
