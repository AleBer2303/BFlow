/**
 * src/platform/glass/LiquidGlassMaterial.native.tsx
 *
 * Native build of the Liquid Glass dock material (ADR 0030; Web build and contract in
 * `LiquidGlassMaterial.tsx`). Three tiers, decided once per launch:
 *
 * 1. iOS 26+ with the glass API present: `GlassView` (the system `UIGlassEffect`).
 * 2. Older iOS: `BlurView` plus a translucent fill, the material of `GlassSurface`.
 * 3. Reduce Transparency on (any iOS): an opaque fill, as Apple's own bars do.
 *
 * Android never renders it (the dock there is a flat tonal pill, ADR 0024); if it ever did, it
 * would get the plain fill of tier 3 without a blur.
 */

import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import type { LiquidGlassMaterialProps } from './LiquidGlassMaterial';

export type { LiquidGlassMaterialProps } from './LiquidGlassMaterial';

let nativeGlassAvailable: boolean | undefined;

/** True only on iOS 26+ with the glass API present. Cached: it cannot change while running. */
export function isNativeLiquidGlassAvailable(): boolean {
  if (nativeGlassAvailable === undefined) {
    try {
      nativeGlassAvailable =
        Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
      nativeGlassAvailable = false;
    }
  }
  return nativeGlassAvailable;
}

/** Test hook: forget the cached availability so a suite can mock another device. */
export function __resetLiquidGlassAvailabilityForTests(): void {
  nativeGlassAvailable = undefined;
}

/** Reduce Transparency (iOS accessibility setting), live. */
function useReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        // Only a change re-renders: the default already is "off".
        if (mounted && value) setEnabled(true);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (value: boolean) => setEnabled(value)
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);
  return enabled;
}

export function LiquidGlassMaterial({
  variant,
  variantTransitionSeconds,
  tintColor,
  fallbackColor,
  opaqueColor,
  blurIntensity = 40,
  colorScheme,
  style,
  testID,
}: LiquidGlassMaterialProps): React.JSX.Element {
  const reduceTransparency = useReduceTransparency();

  if (reduceTransparency || Platform.OS !== 'ios') {
    if (variant === 'none') {
      return <View testID={testID} pointerEvents="none" style={style} />;
    }
    return (
      <View
        testID={testID}
        pointerEvents="none"
        style={[style, { backgroundColor: reduceTransparency ? opaqueColor : fallbackColor }]}
      />
    );
  }

  if (isNativeLiquidGlassAvailable()) {
    return (
      <GlassView
        testID={testID}
        pointerEvents="none"
        glassEffectStyle={
          variantTransitionSeconds === undefined
            ? variant
            : { style: variant, animate: true, animationDuration: variantTransitionSeconds }
        }
        tintColor={tintColor}
        colorScheme={colorScheme}
        isInteractive={false}
        style={style}
      />
    );
  }

  // Switched-off glass: the system GlassView above stays mounted with style 'none' (so turning it
  // on is a native morph); the fallbacks simply draw nothing.
  if (variant === 'none') {
    return <View testID={testID} pointerEvents="none" style={style} />;
  }

  return (
    <View testID={testID} pointerEvents="none" style={[style, styles.clip]}>
      {variant === 'regular' ? (
        <BlurView
          intensity={blurIntensity}
          tint={colorScheme}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
