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
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  heroCurrency: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700' as const,
    letterSpacing: -0.8,
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
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
    moto: string;
    motoSoft: string;
    savings: string;
    savingsSoft: string;
  };
}

export const palettes: Record<ThemeMode, ColorPalette> = {
  dark: {
    background: {
      primary: '#060911',
      secondary: '#0D1322',
      elevated: '#151E32',
    },
    glass: {
      surfaceTint: 'rgba(22, 31, 50, 0.62)',
      surfaceElevatedTint: 'rgba(34, 47, 74, 0.72)',
      specularBorder: 'rgba(255, 255, 255, 0.18)',
      subtleBorder: 'rgba(255, 255, 255, 0.08)',
      blurIntensity: 48,
      blurTint: 'dark',
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
      muted: '#64748B',
      inverse: '#060911',
    },
    semantic: {
      income: '#30D158',
      incomeSoft: 'rgba(48, 209, 88, 0.16)',
      expense: '#FF6961',
      expenseSoft: 'rgba(255, 105, 97, 0.16)',
      completed: '#30D158',
      completedSoft: 'rgba(48, 209, 88, 0.16)',
      pending: '#FFD60A',
      pendingSoft: 'rgba(255, 214, 10, 0.16)',
      debt: '#FF9F0A',
      debtSoft: 'rgba(255, 159, 10, 0.16)',
      moto: '#64D2FF',
      motoSoft: 'rgba(100, 210, 255, 0.16)',
      savings: '#5E5CE6',
      savingsSoft: 'rgba(94, 92, 230, 0.18)',
    },
  },
  light: {
    background: {
      primary: '#F2F5FA',
      secondary: '#E6ECF5',
      elevated: '#FFFFFF',
    },
    glass: {
      surfaceTint: 'rgba(255, 255, 255, 0.72)',
      surfaceElevatedTint: 'rgba(255, 255, 255, 0.88)',
      specularBorder: 'rgba(255, 255, 255, 0.85)',
      subtleBorder: 'rgba(15, 23, 42, 0.08)',
      blurIntensity: 55,
      blurTint: 'light',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
      muted: '#64748B',
      inverse: '#FFFFFF',
    },
    semantic: {
      income: '#1E8E3E',
      incomeSoft: 'rgba(30, 142, 62, 0.12)',
      expense: '#D93025',
      expenseSoft: 'rgba(217, 48, 37, 0.12)',
      completed: '#1E8E3E',
      completedSoft: 'rgba(30, 142, 62, 0.12)',
      pending: '#B06000',
      pendingSoft: 'rgba(176, 96, 0, 0.12)',
      debt: '#C25E00',
      debtSoft: 'rgba(194, 94, 0, 0.12)',
      moto: '#0071E3',
      motoSoft: 'rgba(0, 113, 227, 0.12)',
      savings: '#3634A3',
      savingsSoft: 'rgba(54, 52, 163, 0.12)',
    },
  },
};

export const springConfigs = {
  snappy: {
    damping: 18,
    stiffness: 240,
    mass: 0.9,
  },
  gentle: {
    damping: 22,
    stiffness: 160,
    mass: 1,
  },
} as const;
