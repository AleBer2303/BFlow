/**
 * src/design-system/components/TactilePressable.tsx
 *
 * A pressable that answers the touch-down with a haptic, before the finger lifts. The visual
 * response belongs to the platform skin and comes from `AppPressable`: press spring on iOS,
 * the same sink without overshoot on Android, hover and press steps on Web. Haptics are a
 * no-op on Web.
 * Minimum touch target comes from the skin (44pt, 48dp on Android).
 */

import React from 'react';
import {
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { hapticService, type HapticType } from '../../platform/haptics/hapticService';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppPressable } from './AppPressable';

export interface TactilePressableProps extends Omit<PressableProps, 'style'> {
  haptic?: HapticType | 'none';
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}

export function TactilePressable({
  haptic = 'light',
  style,
  children,
  onPressIn,
  disabled,
  accessibilityRole = 'button',
  ...rest
}: TactilePressableProps): React.JSX.Element {
  const { minTouchTarget } = useBFlowTheme();

  const handlePressIn = (event: GestureResponderEvent) => {
    if (disabled) return;
    if (haptic !== 'none') {
      hapticService.trigger(haptic);
    }
    onPressIn?.(event);
  };

  return (
    <AppPressable
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPressIn={handlePressIn}
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return [{ minHeight: minTouchTarget, minWidth: minTouchTarget }, resolvedStyle];
      }}
      {...rest}
    >
      {(state) => (
        <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          {typeof children === 'function' ? children(state) : children}
        </View>
      )}
    </AppPressable>
  );
}
