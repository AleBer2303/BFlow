/**
 * src/design-system/motion/ProgressFill.tsx
 *
 * The filled part of a progress track. It grows from the start edge once, shortly after its
 * screen arrives, so the eye lands on how far along the figure is. Place it inside a track
 * that clips (`overflow: 'hidden'`). With Reduce Motion it is simply there.
 */

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionBySkin, motionDuration } from '../tokens';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from './motionRuntime';

export interface ProgressFillProps {
  /** Share of the track that is filled, 0 to 1. Values outside are clamped. */
  fraction: number;
  color: string;
  testID?: string;
}

/** The screen entrance plays first; the bar starts as it settles. */
const START_DELAY_MS = motionDuration.quick;

export function ProgressFill({ fraction, color, testID }: ProgressFillProps): React.JSX.Element {
  const { radius, skin, reducedMotion } = useBFlowTheme();
  const isStatic = IS_MOTION_STATIC || reducedMotion;
  const growth = useRef(new Animated.Value(isStatic ? 1 : 0)).current;

  useEffect(() => {
    if (isStatic) return undefined;
    const animation = Animated.timing(growth, {
      toValue: 1,
      delay: START_DELAY_MS,
      duration: motionDuration.emphasis,
      easing: toEasing(motionBySkin[skin].enter),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
    // Plays once, with the setting it mounted with.
  }, [growth]); // eslint-disable-line react-hooks/exhaustive-deps

  const percent = Math.min(1, Math.max(0, fraction)) * 100;

  return (
    <Animated.View
      testID={testID}
      style={{
        width: `${percent}%`,
        height: '100%',
        borderRadius: radius.pill,
        borderCurve: 'continuous',
        backgroundColor: color,
        transformOrigin: 'left',
        transform: [{ scaleX: growth }],
      }}
    />
  );
}
