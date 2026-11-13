/**
 * src/design-system/motion/CheckIndicator.tsx
 *
 * The mark of a row that can be checked: an empty ring while pending, a filled disc with a
 * check once done. When the state changes on screen the disc pops in (with a soft overshoot
 * on iOS) and leaves faster than it came. A row that mounts already checked does not animate.
 *
 * It is decoration: the row itself carries the checkbox role and state for screen readers.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useBFlowTheme } from '../theme/ThemeContext';
import {
  REDUCED_MOTION_DURATION_MS,
  motionBySkin,
  motionDuration,
  springConfigs,
} from '../tokens';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from './motionRuntime';

export interface CheckIndicatorProps {
  checked: boolean;
  size?: number;
  testID?: string;
}

const RING_WIDTH = 1.5;
/** The disc grows from this scale; smaller would read as a zoom. */
const POP_FROM_SCALE = 0.6;

export function CheckIndicator({
  checked,
  size = 22,
  testID,
}: CheckIndicatorProps): React.JSX.Element {
  const { colors, skin, reducedMotion } = useBFlowTheme();
  const progress = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const wasChecked = useRef(checked);

  useEffect(() => {
    if (wasChecked.current === checked) return;
    wasChecked.current = checked;
    const toValue = checked ? 1 : 0;
    if (IS_MOTION_STATIC) {
      progress.setValue(toValue);
      return;
    }
    if (reducedMotion) {
      Animated.timing(progress, {
        toValue,
        duration: REDUCED_MOTION_DURATION_MS,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      return;
    }
    const motion = motionBySkin[skin];
    if (checked && motion.allowsOvershoot) {
      Animated.spring(progress, {
        toValue,
        ...springConfigs.snappy,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue,
      duration: checked ? motionDuration.fast : motionDuration.quick,
      easing: toEasing(checked ? motion.enter : motion.exit),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [checked, progress, reducedMotion, skin]);

  const visibility = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const shape = { borderRadius: size / 2 };

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          shape,
          {
            borderWidth: RING_WIDTH,
            borderColor: colors.text.muted,
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          shape,
          {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.semantic.completed,
            opacity: visibility,
            transform: reducedMotion
              ? []
              : [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [POP_FROM_SCALE, 1],
                    }),
                  },
                ],
          },
        ]}
      >
        <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke={colors.background.primary}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
