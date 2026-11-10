/**
 * src/design-system/components/TactilePressable.tsx
 *
 * Physical "tactile" pressable. The feel belongs to the platform skin:
 * - ios (spring):   haptic on touch-down, micro-depression (scale 0.96) and a snappy spring
 *                   release, hardware-accelerated for 60/120Hz ProMotion.
 * - android (ripple) and web (step): no scale spring; AppPressable supplies the Material
 *                   ripple or the hover/press step. Haptics still fire on touch-down
 *                   (a no-op on web).
 * Minimum touch target comes from the skin (44pt, 48dp on Android).
 */

import React, { useRef } from 'react';
import {
  Animated,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { hapticService, type HapticType } from '../../platform/haptics/hapticService';
import { useBFlowTheme } from '../theme/ThemeContext';
import { springConfigs } from '../tokens';
import { AppPressable } from './AppPressable';

export interface TactilePressableProps extends Omit<PressableProps, 'style'> {
  haptic?: HapticType | 'none';
  scaleActive?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}

export function TactilePressable({
  haptic = 'light',
  scaleActive = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  testID,
  accessibilityRole = 'button',
  ...rest
}: TactilePressableProps): React.JSX.Element {
  const { skinSpec, minTouchTarget } = useBFlowTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const usesSpring = skinSpec.pressFeedback === 'spring' && process.env.NODE_ENV !== 'test';

  const springTo = (toValue: number) => {
    Animated.spring(scaleAnim, {
      toValue,
      damping: springConfigs.snappy.damping,
      stiffness: springConfigs.snappy.stiffness,
      mass: springConfigs.snappy.mass,
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (disabled) return;

    if (haptic !== 'none') {
      hapticService.trigger(haptic);
    }
    if (usesSpring) {
      springTo(scaleActive);
    }

    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (disabled) return;

    if (usesSpring) {
      springTo(1);
    }

    onPressOut?.(event);
  };

  return (
    <AppPressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return [{ minHeight: minTouchTarget, minWidth: minTouchTarget }, resolvedStyle];
      }}
      {...rest}
    >
      {(state) => {
        const content = typeof children === 'function' ? children(state) : children;
        return (
          <Animated.View
            style={{
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: scaleAnim }],
            }}
          >
            {content}
          </Animated.View>
        );
      }}
    </AppPressable>
  );
}
