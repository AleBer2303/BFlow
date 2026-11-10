/**
 * src/design-system/components/AppPressable.tsx
 *
 * Drop-in replacement for React Native's `Pressable` that answers the touch the way each
 * platform skin does, so feature code never branches on the platform:
 *
 * - ios:     no visual change (springs and haptics live in TactilePressable and the dock).
 * - android: Material ripple clipped to the control.
 * - web:     hover and press steps from the design-taste-frontend motion layer (140ms in,
 *            200ms out, 90ms press, no bounce). Only a fine pointer hovers.
 *
 * It also guarantees the minimum touch target of the skin (44pt iOS and Web, 48dp Android)
 * for controls a feature declares smaller than that (compact chips, 36pt icon buttons):
 * - iOS and Android keep the control's visual size and extend the touchable area with
 *   `hitSlop` (DESIGN.md section 5.1).
 * - Web has no hit slop, so the control itself grows to the minimum size.
 *
 * Use it for every interactive element in `src/features/` and `src/app/`.
 */

import React, { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  type Insets,
  type MouseEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { MIN_TOUCH_TARGET_PT, webMotion, type ThemeMode } from '../tokens';

export type AppPressableProps = PressableProps;
export type AppPressableElement = React.ElementRef<typeof Pressable>;

const ANDROID_RIPPLE_ALPHA: Record<ThemeMode, string> = {
  dark: 'rgba(224, 228, 221, 0.16)',
  light: 'rgba(23, 29, 25, 0.12)',
};

/** Brightness steps: a light surface darkens toward the ink, a dark one lifts toward it. */
const WEB_HOVER_FILTER: Record<ThemeMode, string> = {
  dark: 'brightness(1.18)',
  light: 'brightness(0.95)',
};
const WEB_PRESS_FILTER: Record<ThemeMode, string> = {
  dark: 'brightness(1.28)',
  light: 'brightness(0.9)',
};

/** Web-only CSS properties that react-native-web forwards but React Native does not type. */
type WebOnlyStyle = ViewStyle & {
  transitionProperty?: string;
  transitionDuration?: string;
  transitionTimingFunction?: string;
};

export function buildWebInteractionStyle(
  mode: ThemeMode,
  hovered: boolean,
  pressed: boolean
): ViewStyle {
  const durationMs = pressed
    ? webMotion.pressMs
    : hovered
      ? webMotion.hoverInMs
      : webMotion.hoverOutMs;
  const transition: WebOnlyStyle = {
    transitionProperty: 'filter, transform, background-color, border-color',
    transitionDuration: `${durationMs}ms`,
    transitionTimingFunction: webMotion.easing,
  };
  if (pressed) {
    return {
      ...transition,
      filter: WEB_PRESS_FILTER[mode],
      transform: [{ scale: webMotion.pressScale }],
    };
  }
  return hovered ? { ...transition, filter: WEB_HOVER_FILTER[mode] } : transition;
}

export interface TouchTargetFix {
  /** Style that grows an undersized control to the minimum (web). Null when it already fits. */
  grow: ViewStyle | null;
  /** Hit slop that extends an undersized control to the minimum (native). Null when it fits. */
  hitSlop: Insets | null;
}

function numericSize(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Compares the size a control DECLARES (height / minHeight, width / minWidth) with the minimum
 * touch target. Controls that declare nothing (rows, full-width buttons, overlays) are left
 * alone: their size comes from their content or their container.
 */
export function resolveTouchTargetFix(
  style: ViewStyle | undefined,
  minTarget: number
): TouchTargetFix {
  const height = numericSize(style?.height);
  const width = numericSize(style?.width);
  const declaredHeight = height ?? numericSize(style?.minHeight);
  const declaredWidth = width ?? numericSize(style?.minWidth);
  const isShort = declaredHeight !== undefined && declaredHeight < minTarget;
  const isNarrow = declaredWidth !== undefined && declaredWidth < minTarget;

  if (!isShort && !isNarrow) {
    return { grow: null, hitSlop: null };
  }

  const vertical = isShort ? Math.ceil((minTarget - declaredHeight) / 2) : 0;
  const horizontal = isNarrow ? Math.ceil((minTarget - declaredWidth) / 2) : 0;

  return {
    grow: {
      ...(isShort ? { minHeight: minTarget } : null),
      ...(isShort && height !== undefined ? { height: minTarget } : null),
      ...(isNarrow ? { minWidth: minTarget } : null),
      ...(isNarrow && width !== undefined ? { width: minTarget } : null),
    },
    hitSlop: { top: vertical, bottom: vertical, left: horizontal, right: horizontal },
  };
}

export const AppPressable = React.forwardRef<AppPressableElement, AppPressableProps>(
  function AppPressable(
    { style, android_ripple, hitSlop, onHoverIn, onHoverOut, disabled, ...rest },
    ref
  ) {
    const { skinSpec, mode } = useBFlowTheme();
    const [hovered, setHovered] = useState(false);
    const feedback = skinSpec.pressFeedback;
    const minTarget = skinSpec.minTouchTarget;

    const handleHoverIn = useCallback(
      (event: MouseEvent) => {
        setHovered(true);
        onHoverIn?.(event);
      },
      [onHoverIn]
    );
    const handleHoverOut = useCallback(
      (event: MouseEvent) => {
        setHovered(false);
        onHoverOut?.(event);
      },
      [onHoverOut]
    );

    const restingStyle = StyleSheet.flatten(
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style
    ) as ViewStyle | undefined;
    const targetFix = resolveTouchTargetFix(restingStyle, minTarget);
    // Material asks for 48dp where the app's base control is 44: 2dp of slop bridges it.
    const baseSlop = (minTarget - MIN_TOUCH_TARGET_PT) / 2;
    const defaultHitSlop: Insets | number | undefined =
      feedback === 'step' ? undefined : (targetFix.hitSlop ?? (baseSlop > 0 ? baseSlop : undefined));

    const resolveStyle = (state: PressableStateCallbackType): StyleProp<ViewStyle> => {
      const base = typeof style === 'function' ? style(state) : style;
      if (feedback === 'step') {
        return [
          base,
          targetFix.grow,
          disabled ? null : buildWebInteractionStyle(mode, hovered, state.pressed),
        ];
      }
      if (feedback === 'ripple') {
        // The ripple is clipped to the control's own shape. Off Android (browser preview of
        // the Material skin) there is no ripple, so a state-layer opacity stands in for it.
        return [
          base,
          { overflow: 'hidden' },
          !disabled && Platform.OS !== 'android' && state.pressed ? { opacity: 0.86 } : null,
        ];
      }
      return base;
    };

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        android_ripple={
          android_ripple ??
          (feedback === 'ripple'
            ? { color: ANDROID_RIPPLE_ALPHA[mode], foreground: true }
            : undefined)
        }
        hitSlop={hitSlop ?? defaultHitSlop}
        onHoverIn={feedback === 'step' ? handleHoverIn : onHoverIn}
        onHoverOut={feedback === 'step' ? handleHoverOut : onHoverOut}
        style={resolveStyle}
        {...rest}
      />
    );
  }
);
