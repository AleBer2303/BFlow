/**
 * src/design-system/components/RevealDown.tsx
 *
 * A panel that opens inside the page (an add or edit form, a message) and pushes the content
 * below it without JS-thread height interpolation or delayed closing stutters:
 *
 * - Opening: calls `animateNextLayout()` once on the native UI thread (`LayoutAnimation`) and
 *   glides the card in using `opacity` + `translateY` on `USE_NATIVE_DRIVER` (avoiding `scale`
 *   transforms over `BlurView` surfaces).
 * - Closing: calls `animateNextLayout()` and unmounts in the same commit so the space below
 *   collapses immediately in a single native pass without leaving a frozen 150ms gap or
 *   colliding with keyboard dismissal.
 * - With Reduce Motion nothing travels: a short fade only.
 * - Animation is skipped under Jest (`IS_MOTION_STATIC`).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { animateNextLayout } from '../motion/layoutTransition';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { resolvePresenceSpec } from '../motion/motionSpec';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionBySkin, springConfigs } from '../tokens';

export interface RevealDownProps {
  children: React.ReactNode;
  /** Whether the content is shown. */
  visible?: boolean;
  testID?: string;
}

export function RevealDown({
  children,
  visible = true,
  testID,
}: RevealDownProps): React.JSX.Element | null {
  const { skin, reducedMotion } = useBFlowTheme();
  const { open } = resolvePresenceSpec({ skin, reducedMotion }, 'panel');
  const restingValue = IS_MOTION_STATIC && visible ? 1 : 0;
  const card = useRef(new Animated.Value(restingValue)).current;
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);

  const animatedStyle = useMemo(
    () => ({
      opacity: card.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateY: card.interpolate({
            inputRange: [0, 1],
            outputRange: [open.distance, 0],
          }),
        },
      ],
    }),
    [card, open.distance]
  );

  useEffect(() => {
    if (IS_MOTION_STATIC) return undefined;

    if (!visible) {
      if (!mountedRef.current) return undefined;
      mountedRef.current = false;
      animateNextLayout();
      setMounted(false);
      return undefined;
    }

    mountedRef.current = true;
    card.setValue(0);
    animateNextLayout();
    setMounted(true);

    const enterAnim =
      motionBySkin[skin].allowsOvershoot && !reducedMotion
        ? Animated.spring(card, {
            toValue: 1,
            ...springConfigs.gentle,
            useNativeDriver: USE_NATIVE_DRIVER,
          })
        : Animated.timing(card, {
            toValue: 1,
            duration: open.durationMs,
            easing: toEasing(open.easing),
            useNativeDriver: USE_NATIVE_DRIVER,
          });
    enterAnim.start();

    return () => enterAnim.stop();
    // Spec values depend only on skin and reducedMotion; avoid restarting mid-reveal.
  }, [visible, card]); // eslint-disable-line react-hooks/exhaustive-deps

  if (IS_MOTION_STATIC) return visible ? <View testID={testID}>{children}</View> : null;
  if (!mounted) return null;

  return (
    <Animated.View
      testID={testID}
      pointerEvents={visible ? 'auto' : 'none'}
      style={animatedStyle}
    >
      {children}
    </Animated.View>
  );
}
