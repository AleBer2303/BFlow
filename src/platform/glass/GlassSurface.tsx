/**
 * src/platform/glass/GlassSurface.tsx
 *
 * Dual-Mode Liquid Glass surface component:
 * - Uses translucent blur + specular 1px border in Mode A (Expo Go / Web) and tests.
 * - Ready for native iOS 26 UIGlassEffect enhancement in Mode B (.ipa).
 */

import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useBFlowTheme } from '../../design-system/theme/ThemeContext';

export interface GlassSurfaceProps {
  children: React.ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GlassSurface({
  children,
  elevated = false,
  style,
  testID,
}: GlassSurfaceProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();

  const containerStyle: ViewStyle = {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: elevated ? colors.glass.specularBorder : colors.glass.subtleBorder,
    backgroundColor: elevated ? colors.glass.surfaceElevatedTint : colors.glass.surfaceTint,
    overflow: 'hidden',
  };

  if (Platform.OS === 'web') {
    return (
      <View testID={testID} style={[containerStyle, { padding: spacing.lg }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} style={[containerStyle, style]}>
      <BlurView
        intensity={colors.glass.blurIntensity}
        tint={colors.glass.blurTint}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ padding: spacing.lg }}>{children}</View>
    </View>
  );
}
