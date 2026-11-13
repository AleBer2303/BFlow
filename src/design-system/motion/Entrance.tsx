/**
 * src/design-system/motion/Entrance.tsx
 *
 * Content arriving on screen: it fades in while it rises a few points, once, when it mounts.
 * Give it a `key` to replay it when the content it wraps is replaced (a tab change), and an
 * `index` to stagger a short group. With Reduce Motion only the opacity changes.
 *
 * Opacity and translation run on the native driver, so a heavy screen mounting underneath
 * never drops frames of its own entrance.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from './motionRuntime';
import { resolveEntranceSpec, type EntranceKind } from './motionSpec';

export interface EntranceProps {
  children: React.ReactNode;
  kind?: EntranceKind;
  /** Position in a staggered group; 0 enters first. */
  index?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Entrance({
  children,
  kind = 'section',
  index = 0,
  style,
  testID,
}: EntranceProps): React.JSX.Element {
  const { skin, reducedMotion } = useBFlowTheme();
  const progress = useRef(new Animated.Value(IS_MOTION_STATIC ? 1 : 0)).current;
  const spec = resolveEntranceSpec({ skin, reducedMotion }, kind, index);
  // The entrance plays once with the spec it mounted with; a later theme change must not replay it.
  const mountSpec = useRef(spec).current;

  useEffect(() => {
    if (IS_MOTION_STATIC) return undefined;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: mountSpec.durationMs,
      delay: mountSpec.delayMs,
      easing: toEasing(mountSpec.easing),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, mountSpec]);

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [mountSpec.distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
