/**
 * src/design-system/platform/useReducedMotionPreference.ts
 *
 * Shared by the month curve and the animated charts: with Reduce Motion on, every chart
 * draws its final state at once.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Tracks the system "Reduce Motion" setting on iOS, Android and Web. */
export function useReducedMotionPreference(): boolean {
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((isEnabled) => {
        if (isMounted && isEnabled) {
          setIsReducedMotion(true);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setIsReducedMotion
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return isReducedMotion;
}
