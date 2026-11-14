/**
 * src/design-system/motion/motionRuntime.ts
 *
 * Where the motion primitives meet the runtime: whether motion runs at all, which driver it
 * uses and how a token curve becomes an `Animated` easing.
 */

import { Easing, Platform, type EasingFunction } from 'react-native';
import { motionDuration, type CubicBezier } from '../tokens';

/** Under Jest every primitive renders its final state at once, like `TactilePressable`. */
export const IS_MOTION_STATIC = process.env.NODE_ENV === 'test';

/** Opacity and transforms run on the UI thread; the browser has no native driver. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function toEasing([x1, y1, x2, y2]: CubicBezier): EasingFunction {
  return Easing.bezier(x1, y1, x2, y2);
}

export interface CancellableTask {
  cancel: () => void;
}

export function deferTaskAfterTransition(
  task: () => void,
  delayMs: number = motionDuration.fast
): CancellableTask {
  const timer = setTimeout(task, delayMs);
  return { cancel: () => clearTimeout(timer) };
}

/**
 * Defers non-urgent animation loops (e.g. 60fps SVG curves and charts) until native
 * tab-switch interactions settle, avoiding JS thread contention during Android mounts.
 * Runs synchronously under Jest and on Web.
 */
export function scheduleAfterTabTransition(task: () => void): CancellableTask {
  if (IS_MOTION_STATIC || Platform.OS === 'web') {
    task();
    return { cancel: () => undefined };
  }
  return deferTaskAfterTransition(task);
}
