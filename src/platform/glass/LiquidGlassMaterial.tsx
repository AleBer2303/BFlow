/**
 * src/platform/glass/LiquidGlassMaterial.tsx
 *
 * Material layer of the iOS Liquid Glass dock (ADR 0030). This file is the Web build (the
 * `?skin=ios` showcase in a browser): a plain translucent fill, because the browser has no glass
 * compositor. The native build (`LiquidGlassMaterial.native.tsx`) uses the iOS 26 system glass
 * (`UIGlassEffect` through `expo-glass-effect`) and falls back to a blur on older iOS.
 *
 * The layer never takes touches and never animates its own opacity: a visual effect view with an
 * alpha below 1 renders broken on iOS, so callers move or scale it, and fade siblings instead.
 */

import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export interface LiquidGlassMaterialProps {
  /**
   * `regular` for the dock capsule, `clear` for the lens (shows what is behind it), `none` for
   * glass that is switched off (nothing drawn).
   */
  variant: 'regular' | 'clear' | 'none';
  /** Seconds over which the system glass morphs when `variant` changes. Omit to switch at once. */
  variantTransitionSeconds?: number;
  /** Tint of the native glass. */
  tintColor: string;
  /** Fill painted over the blur when native glass is unavailable (and on Web). */
  fallbackColor: string;
  /** Fill with Reduce Transparency on. */
  opaqueColor: string;
  /** Blur strength of the fallback (0-100). Ignored where there is no blur. */
  blurIntensity?: number;
  colorScheme: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** True only on iOS 26+ with the glass API present (never on Web). */
export function isNativeLiquidGlassAvailable(): boolean {
  return false;
}

export function LiquidGlassMaterial({
  variant,
  fallbackColor,
  style,
  testID,
}: LiquidGlassMaterialProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[style, { backgroundColor: variant === 'none' ? 'transparent' : fallbackColor }]}
    />
  );
}
