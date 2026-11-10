/**
 * src/features/summary/components/useCurveScrubResponder.ts
 *
 * Touch scrubbing shared by the 3D stage and the vector stage on phones.
 *
 * The chart owns every touch that lands on it: the day under the finger shows at once, the
 * page scroll is locked until the finger lifts, and dragging in any direction walks the
 * month by its horizontal position. Waiting for a clearly horizontal drag (the previous
 * behaviour) let iOS hand slightly diagonal drags to the page scroll first, so the page
 * moved while the user was reading the chart. The page still scrolls from anywhere else.
 * Lifting the finger, or losing the gesture to the system, rests on today again.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type PanResponderInstance,
} from 'react-native';
import { useScrollLock } from '../../../design-system';
import type { CurveStop } from '../scene/curveGeometry';

export interface CurveScrubHandlers {
  /** The stop under a horizontal position, or null while the stage has no size. */
  resolveStop: (xPt: number) => CurveStop | null;
  /** Called with each stop under the finger, and with null when the gesture ends. */
  onStop: (stop: CurveStop | null) => void;
}

export function useCurveScrubResponder(handlers: CurveScrubHandlers): PanResponderInstance {
  const { lockScroll } = useScrollLock();
  const handlersRef = useRef(handlers);
  const lockScrollRef = useRef(lockScroll);
  const releaseScrollRef = useRef<(() => void) | null>(null);
  const dragOriginXRef = useRef(0);

  useLayoutEffect(() => {
    handlersRef.current = handlers;
    lockScrollRef.current = lockScroll;
  });

  // A stage removed mid-gesture must not leave the page frozen.
  useEffect(
    () => () => {
      releaseScrollRef.current?.();
      releaseScrollRef.current = null;
    },
    []
  );

  return useMemo(() => {
    const scrubTo = (xPt: number) => {
      const stop = handlersRef.current.resolveStop(xPt);
      if (stop !== null) {
        handlersRef.current.onStop(stop);
      }
    };
    const end = () => {
      releaseScrollRef.current?.();
      releaseScrollRef.current = null;
      handlersRef.current.onStop(null);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Fallback if another view took the start: any drag that reaches the chart is ours.
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        releaseScrollRef.current?.();
        releaseScrollRef.current = lockScrollRef.current();
        dragOriginXRef.current = event.nativeEvent.locationX;
        scrubTo(dragOriginXRef.current);
      },
      onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
        scrubTo(dragOriginXRef.current + gesture.dx);
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, []);
}
