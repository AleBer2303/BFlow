/**
 * src/design-system/components/TactilePressable.tsx
 *
 * Apple Liquid Glass physical tactile pressable.
 * Features:
 * - Instantaneous haptic feedback on touch contact (onPressIn) with zero lag.
 * - Hardware-accelerated 60/120Hz ProMotion spring physics (useNativeDriver: true).
 * - Tactile micro-depression on press (scale: 0.96) and snappy release bounce.
 * - Minimum touch target standard (MIN_TOUCH_TARGET_PT: 44pt).
 */

import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { hapticService, type HapticType } from '../../platform/haptics/hapticService';
import { MIN_TOUCH_TARGET_PT, springConfigs } from '../tokens';

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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (event: GestureResponderEvent) => {
    if (disabled) return;

    if (haptic !== 'none') {
      hapticService.trigger(haptic);
    }

    if (process.env.NODE_ENV !== 'test') {
      Animated.spring(scaleAnim, {
        toValue: scaleActive,
        damping: springConfigs.snappy.damping,
        stiffness: springConfigs.snappy.stiffness,
        mass: springConfigs.snappy.mass,
        useNativeDriver: true,
      }).start();
    }

    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (disabled) return;

    if (process.env.NODE_ENV !== 'test') {
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: springConfigs.snappy.damping,
        stiffness: springConfigs.snappy.stiffness,
        mass: springConfigs.snappy.mass,
        useNativeDriver: true,
      }).start();
    }

    onPressOut?.(event);
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return [
          { minHeight: MIN_TOUCH_TARGET_PT, minWidth: MIN_TOUCH_TARGET_PT },
          resolvedStyle,
        ];
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
    </Pressable>
  );
}
