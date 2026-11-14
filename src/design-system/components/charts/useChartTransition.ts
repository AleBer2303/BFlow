/**
 * src/design-system/components/charts/useChartTransition.ts
 *
 * Drives a `ChartTransition` with requestAnimationFrame. The loop only runs while values
 * move and stops at rest. It waits until the chart is laid out (`enabled`), so the entrance
 * plays when the chart appears and not while it has no size. With Reduce Motion on, the
 * chart shows its final state at once.
 */

import { useEffect, useReducer, useRef } from 'react';
import { scheduleAfterTabTransition } from '../../motion/motionRuntime';
import { useIsTabActive } from '../../motion/TabVisibilityContext';
import { useReducedMotionPreference } from '../../platform/useReducedMotionPreference';
import { ChartTransition, resolveChartFrameSeconds } from './chartTransition';

export interface UseChartTransitionOptions {
  enabled: boolean;
  stagger?: boolean;
  isActive?: boolean;
}

export function useChartTransition(
  targets: readonly number[],
  { enabled, stagger = true, isActive: isActiveProp }: UseChartTransitionOptions
): readonly number[] {
  const isContextActive = useIsTabActive();
  const isActive = isActiveProp ?? isContextActive;
  const reducedMotion = useReducedMotionPreference();
  const transitionRef = useRef<ChartTransition | null>(null);
  if (transitionRef.current === null) {
    transitionRef.current = new ChartTransition(targets, { animate: !reducedMotion, stagger });
  }
  const [, redraw] = useReducer((frame: number) => frame + 1, 0);
  // Targets are compared by content: a new array with the same numbers is not new data.
  const targetsKey = targets.join('|');

  useEffect(() => {
    const transition = transitionRef.current as ChartTransition;
    const jumped = transition.setAnimate(!reducedMotion);
    const retargeted = transition.retarget(targets);
    if (!enabled || !isActive || transition.isSettled()) {
      // Repaint only when the values to draw changed; a mount with nothing new costs nothing.
      if (jumped || retargeted) {
        redraw();
      }
      return undefined;
    }

    let handle: number | null = null;
    let lastTimestamp: number | null = null;
    let cancelled = false;
    const step = (timestamp: number) => {
      if (cancelled) return;
      const isMoving = transition.advance(resolveChartFrameSeconds(timestamp, lastTimestamp));
      lastTimestamp = timestamp;
      redraw();
      handle = isMoving ? requestAnimationFrame(step) : null;
    };
    const deferred = scheduleAfterTabTransition(() => {
      if (!cancelled) {
        handle = requestAnimationFrame(step);
      }
    });

    return () => {
      cancelled = true;
      deferred.cancel();
      if (handle !== null) {
        cancelAnimationFrame(handle);
      }
    };
    // `targets` is read through `targetsKey`, its content.
  }, [targetsKey, enabled, isActive, reducedMotion]);

  return transitionRef.current.getValues();
}
