import React, { createContext, useContext, useMemo, useState } from 'react';
import { resolvePlatformSkin } from '../platform/platformSkin';
import { useReducedMotionPreference } from '../platform/useReducedMotionPreference';
import {
  palettesBySkin,
  platformSkins,
  radiusBySkin,
  spacing,
  typographyBySkin,
  type ColorPalette,
  type PlatformSkinId,
  type PlatformSkinSpec,
  type RadiusScale,
  type ThemeMode,
  type TypographyScale,
} from '../tokens';

export interface BFlowThemeContextValue {
  mode: ThemeMode;
  /** Platform identity: 'ios' (Liquid Glass), 'android' (Material 3) or 'web' (flat editorial). */
  skin: PlatformSkinId;
  skinSpec: PlatformSkinSpec;
  colors: ColorPalette;
  spacing: typeof spacing;
  radius: RadiusScale;
  typography: TypographyScale;
  /** 44pt on iOS and Web, 48dp on Android. */
  minTouchTarget: number;
  /** The system Reduce Motion setting, tracked once for the whole app. */
  reducedMotion: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

function buildThemeValue(
  mode: ThemeMode,
  skin: PlatformSkinId,
  reducedMotion: boolean,
  toggleTheme: () => void,
  setThemeMode: (mode: ThemeMode) => void
): BFlowThemeContextValue {
  const skinSpec = platformSkins[skin];
  return {
    mode,
    skin,
    skinSpec,
    colors: palettesBySkin[skin][mode],
    spacing,
    radius: radiusBySkin[skin],
    typography: typographyBySkin[skin],
    minTouchTarget: skinSpec.minTouchTarget,
    reducedMotion,
    toggleTheme,
    setThemeMode,
  };
}

const BFlowThemeContext = createContext<BFlowThemeContextValue>(
  buildThemeValue(
    'dark',
    'ios',
    false,
    () => undefined,
    () => undefined
  )
);

export interface BFlowThemeProviderProps {
  initialMode?: ThemeMode;
  /** Forces a skin (tests, previews). Defaults to the one of the running platform. */
  skin?: PlatformSkinId;
  children: React.ReactNode;
}

export function BFlowThemeProvider({
  initialMode = 'dark',
  skin,
  children,
}: BFlowThemeProviderProps): React.JSX.Element {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [detectedSkin] = useState<PlatformSkinId>(() => resolvePlatformSkin());
  const activeSkin = skin ?? detectedSkin;
  const reducedMotion = useReducedMotionPreference();

  const value = useMemo<BFlowThemeContextValue>(
    () =>
      buildThemeValue(
        mode,
        activeSkin,
        reducedMotion,
        () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark')),
        setMode
      ),
    [mode, activeSkin, reducedMotion]
  );

  return <BFlowThemeContext.Provider value={value}>{children}</BFlowThemeContext.Provider>;
}

export function useBFlowTheme(): BFlowThemeContextValue {
  return useContext(BFlowThemeContext);
}
