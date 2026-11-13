/**
 * src/design-system/motion/useReplayOnChange.ts
 *
 * A progress value that rests at 1 and replays from 0 each time `key` changes after the first
 * render. Components interpolate it into whatever says "this just changed": a counter that
 * pulses, an icon that turns into another. With Reduce Motion it never replays.
 */

import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionBySkin } from '../tokens';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from './motionRuntime';

export function useReplayOnChange(key: unknown, durationMs: number): Animated.Value {
  const { skin, reducedMotion } = useBFlowTheme();
  const progress = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(key);

  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    if (IS_MOTION_STATIC || reducedMotion) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: toEasing(motionBySkin[skin].enter),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [key, durationMs, progress, reducedMotion, skin]);

  return progress;
}
