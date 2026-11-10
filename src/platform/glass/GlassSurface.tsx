/**
 * src/platform/glass/GlassSurface.tsx
 *
 * The app's card surface. One component, one API; the material depends on the platform skin:
 *
 * - ios (liquid-glass): translucent tint over a `BlurView` with a 1px specular border.
 *   Ready for the native iOS 26 UIGlassEffect in Mode B (.ipa).
 * - android (tonal): OPAQUE Material 3 container. No blur, no translucency, no specular edge;
 *   the elevated variant steps one tone up and casts a real elevation shadow.
 * - web (flat): opaque card on a 1px hairline, no shadow (design-taste-frontend card recipe).
 *
 * The name is kept for source compatibility: features ask for a "surface" and never branch on
 * the platform. Liquid Glass must not leak into Android or Web.
 */

import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useBFlowTheme } from '../../design-system/theme/ThemeContext';

export interface GlassSurfaceProps {
  children: React.ReactNode;
  elevated?: boolean;
  noPadding?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Material 3 elevation levels used by the tonal surface (dp). */
const TONAL_ELEVATION = { resting: 0, raised: 2 } as const;
const TONAL_SHADOW_COLOR = '#000000';

export function GlassSurface({
  children,
  elevated = false,
  noPadding = false,
  contentStyle,
  style,
  testID,
}: GlassSurfaceProps): React.JSX.Element {
  const { colors, radius, spacing, skinSpec, mode } = useBFlowTheme();
  const material = skinSpec.surfaceMaterial;

  const innerPadding = noPadding ? undefined : { padding: spacing.lg };
  const fill = elevated ? colors.glass.surfaceElevatedTint : colors.glass.surfaceTint;

  if (material === 'tonal') {
    const tonalStyle: ViewStyle = {
      borderRadius: radius.lg,
      backgroundColor: fill,
      overflow: 'hidden',
      elevation: elevated ? TONAL_ELEVATION.raised : TONAL_ELEVATION.resting,
      // Web preview of the Material skin: elevation has no effect there, so mirror it softly.
      ...(elevated && Platform.OS !== 'android'
        ? {
            shadowColor: TONAL_SHADOW_COLOR,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: mode === 'dark' ? 0.4 : 0.14,
            shadowRadius: 3,
          }
        : null),
    };
    return (
      <View testID={testID} style={[tonalStyle, innerPadding, style, contentStyle]}>
        {children}
      </View>
    );
  }

  const outlinedStyle: ViewStyle = {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: elevated ? colors.glass.specularBorder : colors.glass.subtleBorder,
    backgroundColor: fill,
    overflow: 'hidden',
  };

  // Flat web card, and the browser preview of the iOS skin (BlurView needs a native compositor).
  if (material === 'flat' || Platform.OS === 'web') {
    return (
      <View testID={testID} style={[outlinedStyle, innerPadding, style, contentStyle]}>
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} style={[outlinedStyle, style]}>
      <BlurView
        testID={testID ? `${testID}-blur` : undefined}
        intensity={colors.glass.blurIntensity}
        tint={colors.glass.blurTint}
        style={StyleSheet.absoluteFill}
      />
      <View style={[innerPadding, contentStyle]}>{children}</View>
    </View>
  );
}
