/**
 * src/design-system/components/actionLook.ts
 *
 * The look of a screen's MAIN action button, per platform skin. Features spread
 * `container` into the button style and use `labelColor` for its text, so they never branch
 * on the platform:
 *
 * - ios:     a Liquid Glass capsule (elevated tint + specular edge). The label keeps the
 *            semantic color the feature chose, so `labelColor` is null.
 * - android: Material 3 filled button: accent fill, fully rounded, on-accent label.
 * - web:     the one filled accent button of the view (design-taste-frontend "solid" look):
 *            accent fill on the sharp radius, on-accent label.
 */

import type { ViewStyle } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';

export interface PrimaryActionLook {
  container: ViewStyle;
  /** Null when the feature's own label color applies (iOS). */
  labelColor: string | null;
}

export function usePrimaryActionLook(): PrimaryActionLook {
  const { skin, colors, radius } = useBFlowTheme();

  if (skin === 'ios') {
    return {
      container: {
        backgroundColor: colors.glass.surfaceElevatedTint,
        borderWidth: 1,
        borderColor: colors.glass.specularBorder,
      },
      labelColor: null,
    };
  }

  return {
    container: {
      backgroundColor: colors.accent.primary,
      borderWidth: 1,
      borderColor: colors.accent.primary,
      ...(skin === 'android' ? { borderRadius: radius.pill } : null),
    },
    labelColor: colors.accent.onPrimary,
  };
}
