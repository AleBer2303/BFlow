import React, { createContext, useContext, useMemo, useState } from 'react';
import { ColorPalette, palettes, radius, spacing, ThemeMode, typography } from '../tokens';

export interface BFlowThemeContextValue {
  mode: ThemeMode;
  colors: ColorPalette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const BFlowThemeContext = createContext<BFlowThemeContextValue>({
  mode: 'dark',
  colors: palettes.dark,
  spacing,
  radius,
  typography,
  toggleTheme: () => undefined,
  setThemeMode: () => undefined,
});

export interface BFlowThemeProviderProps {
  initialMode?: ThemeMode;
  children: React.ReactNode;
}

export function BFlowThemeProvider({ initialMode = 'dark', children }: BFlowThemeProviderProps): React.JSX.Element {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const value = useMemo<BFlowThemeContextValue>(
    () => ({
      mode,
      colors: palettes[mode],
      spacing,
      radius,
      typography,
      toggleTheme: () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark')),
      setThemeMode: setMode,
    }),
    [mode]
  );

  return <BFlowThemeContext.Provider value={value}>{children}</BFlowThemeContext.Provider>;
}

export function useBFlowTheme(): BFlowThemeContextValue {
  return useContext(BFlowThemeContext);
}
