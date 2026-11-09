/**
 * src/design-system/components/RevealDown.tsx
 *
 * Soft "curtain" reveal / hide: the content opens downward (height grows from 0 to its
 * natural size) while it fades in and glides down a few points, and does the reverse on close.
 *
 * Design notes:
 * - Controlled by `visible`; stays mounted until the exit animation finishes.
 * - The content lives in an absolutely positioned inner wrapper, so it always keeps its
 *   natural height (measured via onLayout) and never occupies layout space by itself.
 *   The outer wrapper's height is `progress * measuredHeight`, which avoids the
 *   "measure then collapse" flash and keeps the animated style shape constant
 *   (no switching animated props to undefined).
 * - If the content height changes while open (error text, segment switch), the outer
 *   height follows it via the same measurement.
 * - JS-driven (height cannot use the native driver); lightweight for a single card.
 * - Animation is skipped under Jest, like TactilePressable.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';

export interface RevealDownProps {
  children: React.ReactNode;
  /** Whether the content is shown. Closing plays the exit animation before unmounting. */
  visible?: boolean;
  durationMs?: number;
  exitDurationMs?: number;
  /** Upward offset (pt) the content glides from / back to. */
  slideDistance?: number;
  testID?: string;
}

export function RevealDown({
  children,
  visible = true,
  durationMs = 380,
  exitDurationMs = 280,
  slideDistance = 14,
  testID,
}: RevealDownProps): React.JSX.Element | null {
  const skipMotion = process.env.NODE_ENV === 'test';
  const progress = useRef(new Animated.Value(skipMotion && visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const mountedRef = useRef(visible);

  // Open / close the curtain when `visible` flips. Opening waits for the first measurement
  // (content is laid out invisibly outside the flow) so the height target is known.
  useEffect(() => {
    if (skipMotion) return;
    if (visible) {
      if (!mountedRef.current) {
        mountedRef.current = true;
        progress.setValue(0);
        setContentHeight(null);
        setMounted(true);
      } else if (contentHeight !== null) {
        Animated.timing(progress, {
          toValue: 1,
          duration: durationMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    } else if (mountedRef.current) {
      Animated.timing(progress, {
        toValue: 0,
        duration: exitDurationMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          mountedRef.current = false;
          setMounted(false);
        }
      });
    }
    // contentHeight is intentionally read only to (re)start the entrance once measured.
  }, [visible, contentHeight === null, durationMs, exitDurationMs, progress, skipMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (skipMotion) return visible ? <View testID={testID}>{children}</View> : null;
  if (!mounted) return null;

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setContentHeight((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
  };

  return (
    <Animated.View
      testID={testID}
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        overflow: 'hidden',
        opacity: progress,
        height: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, contentHeight ?? 0],
        }),
      }}
    >
      <Animated.View
        onLayout={handleLayout}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-slideDistance, 0],
              }),
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
