/**
 * src/design-system/components/charts/useChartTransition.ts
 *
 * Drives a `ChartTransition` with requestAnimationFrame. The loop only runs while values
 * move and stops at rest. It waits until the chart is laid out (`enabled`), so the entrance
 * plays when the chart appears and not while it has no size. With Reduce Motion on, the
 * chart shows its final state at once.
 */

import { useEffect, useReducer, useRef } from 'react';
import { useReducedMotionPreference } from '../../platform/useReducedMotionPreference';
import { ChartTransition, resolveChartFrameSeconds } from './chartTransition';

export interface UseChartTransitionOptions {
  enabled: boolean;
  stagger?: boolean;
}

export function useChartTransition(
  targets: readonly number[],
  { enabled, stagger = true }: UseChartTransitionOptions
): readonly number[] {
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
    transition.setAnimate(!reducedMotion);
    transition.retarget(targets);
    if (!enabled || transition.isSettled()) {
      redraw();
      return undefined;
    }

    let handle: number | null = null;
    let lastTimestamp: number | null = null;
    const step = (timestamp: number) => {
      const isMoving = transition.advance(resolveChartFrameSeconds(timestamp, lastTimestamp));
      lastTimestamp = timestamp;
      redraw();
      handle = isMoving ? requestAnimationFrame(step) : null;
    };
    handle = requestAnimationFrame(step);

    return () => {
      if (handle !== null) {
        cancelAnimationFrame(handle);
      }
    };
    // `targets` is read through `targetsKey`, its content.
  }, [targetsKey, enabled, reducedMotion]);

  return transitionRef.current.getValues();
}
