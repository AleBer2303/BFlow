/**
 * src/design-system/components/RevealDown.tsx
 *
 * A panel that opens inside the page (an add or edit form, a message) and pushes the content
 * below it. Two motions run together, each on the thread that suits it:
 *
 * - The SPACE unfolds: the wrapper's height goes from 0 to the content's natural height on
 *   the skin's curve (fast start, long soft landing). Height cannot use the native driver.
 * - The CARD settles: a moment later the content fades in while it grows from 96% and rises a
 *   few points, on the native driver, so it stays smooth while the page re-lays out. iOS
 *   lands it on a soft spring; Android and Web on their curve, with no overshoot.
 *
 * Closing is quieter and quicker: the card dims out first and the space folds behind it.
 *
 * Design notes:
 * - Controlled by `visible`; stays mounted, showing its last content, until the exit ends.
 * - The content lives in an absolutely positioned inner wrapper, so it keeps its natural
 *   height (measured via onLayout) and the animated style keeps one shape.
 * - If the content height changes while open (an error appears, a segment switches), the
 *   space follows it through the same measurement.
 * - With Reduce Motion nothing travels or scales: a short fade only.
 * - Animation is skipped under Jest.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, type LayoutChangeEvent } from 'react-native';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { resolvePresenceSpec } from '../motion/motionSpec';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionBySkin, motionDuration, springConfigs } from '../tokens';

export interface RevealDownProps {
  children: React.ReactNode;
  /** Whether the content is shown. Closing plays the exit animation before unmounting. */
  visible?: boolean;
  testID?: string;
}

export function RevealDown({
  children,
  visible = true,
  testID,
}: RevealDownProps): React.JSX.Element | null {
  const { skin, reducedMotion } = useBFlowTheme();
  const { open, close } = resolvePresenceSpec({ skin, reducedMotion }, 'panel');
  const restingValue = IS_MOTION_STATIC && visible ? 1 : 0;
  const space = useRef(new Animated.Value(restingValue)).current;
  const card = useRef(new Animated.Value(restingValue)).current;
  const [mounted, setMounted] = useState(visible);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const mountedRef = useRef(visible);
  // A caller often renders the content only while it is open: keep the last one for the exit.
  const shownChildren = useRef(children);
  if (visible) {
    shownChildren.current = children;
  }

  // Opening waits for the first measurement (the content is laid out invisibly, outside the
  // flow), so the height the space unfolds to is known.
  useEffect(() => {
    if (IS_MOTION_STATIC) return;

    if (!visible) {
      if (!mountedRef.current) return;
      Animated.timing(card, {
        toValue: 0,
        duration: close.durationMs,
        easing: toEasing(close.easing),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      Animated.timing(space, {
        toValue: 0,
        duration: reducedMotion ? close.durationMs : motionDuration.fast,
        easing: toEasing(close.easing),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          mountedRef.current = false;
          setMounted(false);
        }
      });
      return;
    }

    if (!mountedRef.current) {
      mountedRef.current = true;
      space.setValue(0);
      card.setValue(0);
      setContentHeight(null);
      setMounted(true);
      return;
    }
    if (contentHeight === null) return;

    Animated.timing(space, {
      toValue: 1,
      duration: open.delayMs + open.durationMs,
      easing: toEasing(open.easing),
      useNativeDriver: false,
    }).start();
    if (motionBySkin[skin].allowsOvershoot && !reducedMotion) {
      Animated.spring(card, {
        toValue: 1,
        delay: open.delayMs,
        ...springConfigs.gentle,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    } else {
      Animated.timing(card, {
        toValue: 1,
        delay: open.delayMs,
        duration: open.durationMs,
        easing: toEasing(open.easing),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    }
    // The spec only changes with the skin or the Reduce Motion setting, never mid-reveal;
    // contentHeight is read only to start the entrance once it is measured.
  }, [visible, contentHeight === null, space, card]); // eslint-disable-line react-hooks/exhaustive-deps

  if (IS_MOTION_STATIC) return visible ? <View testID={testID}>{children}</View> : null;
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
        height: space.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight ?? 0] }),
      }}
    >
      <Animated.View
        onLayout={handleLayout}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transformOrigin: 'top',
          opacity: card.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [open.distance, 0] }) },
            { scale: card.interpolate({ inputRange: [0, 1], outputRange: [open.scale, 1] }) },
          ],
        }}
      >
        {shownChildren.current}
      </Animated.View>
    </Animated.View>
  );
}
