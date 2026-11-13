/**
 * src/design-system/components/AppPressable.tsx
 *
 * Drop-in replacement for React Native's `Pressable` that answers the touch the way each
 * platform skin does, so feature code never branches on the platform:
 *
 * - ios:     the control sinks and dims under the finger and springs back on release.
 *            Overlays (absolutely positioned) and `pressEffect="none"` stay still.
 * - android: the same sink and dim on a timed curve, with no overshoot. There is no ripple:
 *            the native ripple painted a gray box with square corners over rounded controls
 *            and stayed there while the finger was held down.
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

import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  type AccessibilityState,
  type GestureResponderEvent,
  type Insets,
  type MouseEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { useBFlowTheme } from '../theme/ThemeContext';
import {
  MIN_TOUCH_TARGET_PT,
  REDUCED_MOTION_DURATION_MS,
  motionBySkin,
  motionDuration,
  pressSinkMotion,
  springConfigs,
  webMotion,
  type ThemeMode,
} from '../tokens';

export interface AppPressableProps extends PressableProps {
  /**
   * `none` keeps the control still under the finger on iOS and Android, for surfaces that
   * are not a button: chart columns, drag areas. Overlays are skipped on their own.
   */
  pressEffect?: 'auto' | 'none';
}
export type AppPressableElement = React.ElementRef<typeof Pressable>;

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

/**
 * The resting interaction state. React Native versions disagree on whether the callback state
 * carries `hovered`, so it is asserted instead of spelled out (compiles against both).
 */
const RESTING_STATE = { pressed: false } as PressableStateCallbackType;

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

/**
 * react-native-web drops the `accessibilityState` object, so a browser never learned which
 * tab was selected or which row was checked. Its fields travel as `aria-*` there.
 */
export function toWebAriaState(state: AccessibilityState | undefined) {
  if (Platform.OS !== 'web' || !state) {
    return null;
  }
  return {
    ...(state.selected === undefined ? null : { 'aria-selected': state.selected }),
    ...(state.checked === undefined ? null : { 'aria-checked': state.checked }),
    ...(state.expanded === undefined ? null : { 'aria-expanded': state.expanded }),
    ...(state.busy === undefined ? null : { 'aria-busy': state.busy }),
  };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The press only moves real controls: an overlay or a backdrop must not shrink. */
export function shouldSinkOnPress(
  style: ViewStyle | undefined,
  pressEffect: AppPressableProps['pressEffect'],
  disabled: boolean
): boolean {
  return !disabled && pressEffect !== 'none' && style?.position !== 'absolute';
}

function buildSinkPressStyle(
  progress: Animated.Value,
  restingStyle: ViewStyle | undefined,
  reducedMotion: boolean
) {
  const restingOpacity = typeof restingStyle?.opacity === 'number' ? restingStyle.opacity : 1;
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [restingOpacity, restingOpacity * pressSinkMotion.dimOpacity],
  });
  if (reducedMotion) {
    return { opacity };
  }
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, pressSinkMotion.scale],
  });
  const restingTransform = Array.isArray(restingStyle?.transform) ? restingStyle.transform : [];
  return { opacity, transform: [...restingTransform, { scale }] };
}

export const AppPressable = React.forwardRef<AppPressableElement, AppPressableProps>(
  function AppPressable(
    {
      style,
      android_ripple,
      hitSlop,
      onHoverIn,
      onHoverOut,
      onPressIn,
      onPressOut,
      disabled,
      pressEffect = 'auto',
      ...rest
    },
    ref
  ) {
    const { skinSpec, mode, reducedMotion } = useBFlowTheme();
    const [hovered, setHovered] = useState(false);
    const [sinkPressed, setSinkPressed] = useState(false);
    const pressProgress = useRef(new Animated.Value(0)).current;
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
      typeof style === 'function' ? style(RESTING_STATE) : style
    ) as ViewStyle | undefined;
    const targetFix = resolveTouchTargetFix(restingStyle, minTarget);
    const ariaState = toWebAriaState(rest.accessibilityState);
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
      return base;
    };

    const sinksOnPress =
      feedback !== 'step' &&
      !IS_MOTION_STATIC &&
      shouldSinkOnPress(restingStyle, pressEffect, Boolean(disabled));

    if (sinksOnPress) {
      const hasStatefulStyle = typeof style === 'function';
      const animatePress = (toValue: number) => {
        if (reducedMotion) {
          Animated.timing(pressProgress, {
            toValue,
            duration: REDUCED_MOTION_DURATION_MS,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
          return;
        }
        if (feedback === 'spring') {
          Animated.spring(pressProgress, {
            toValue,
            ...springConfigs.snappy,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
          return;
        }
        // Android: down at once, back a little slower, never past the resting size.
        Animated.timing(pressProgress, {
          toValue,
          duration: toValue === 1 ? motionDuration.micro : motionDuration.quick,
          easing: toEasing(motionBySkin.android.enter),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      };
      const handlePressIn = (event: GestureResponderEvent) => {
        animatePress(1);
        if (hasStatefulStyle) setSinkPressed(true);
        onPressIn?.(event);
      };
      const handlePressOut = (event: GestureResponderEvent) => {
        animatePress(0);
        if (hasStatefulStyle) setSinkPressed(false);
        onPressOut?.(event);
      };
      // An animated component takes a style value, not a callback: the pressed state is
      // tracked here for the few controls that restyle themselves while pressed.
      const baseStyle = hasStatefulStyle
        ? style({ pressed: sinkPressed } as PressableStateCallbackType)
        : style;

      return (
        <AnimatedPressable
          ref={ref}
          disabled={disabled}
          android_ripple={android_ripple}
          hitSlop={hitSlop ?? defaultHitSlop}
          onHoverIn={onHoverIn}
          onHoverOut={onHoverOut}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[baseStyle, buildSinkPressStyle(pressProgress, restingStyle, reducedMotion)]}
          {...ariaState}
          {...rest}
        />
      );
    }

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        android_ripple={android_ripple}
        hitSlop={hitSlop ?? defaultHitSlop}
        onHoverIn={feedback === 'step' ? handleHoverIn : onHoverIn}
        onHoverOut={feedback === 'step' ? handleHoverOut : onHoverOut}
        style={resolveStyle}
        {...ariaState}
        {...rest}
      />
    );
  }
);
