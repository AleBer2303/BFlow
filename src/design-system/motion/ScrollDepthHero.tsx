/**
 * src/design-system/motion/ScrollDepthHero.tsx
 *
 * Wraps the primary hero card of a screen to provide UI-thread scroll depth:
 * - On scroll down: subtle positive parallax (`heroParallaxY`) and gentle scale-down (`heroMinScale`)
 *   so the card recedes beneath the sticky top bar.
 * - On iOS pull-down overscroll (`scrollY < 0`): gentle elastic stretch without distortion.
 * - On Web, with Reduce Motion, or outside `WorkspaceShell`: renders `{children}` untouched
 *   without allocating Reanimated hooks.
 */

import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useBFlowTheme } from '../theme/ThemeContext';
import { scrollMotionBySkin, type ScrollMotionSpec } from '../tokens';
import { useScrollChoreography } from './ScrollChoreographyContext';

/**
 * UI-thread worklet copy of `computeHeroDepthFrame` (scrollKinematics.ts).
 * Positional arguments only and zero default parameters (ADR 0030 §3 / worklet closure guard).
 */
export function heroDepthTransformAt(
  scrollY: number,
  enabled: boolean,
  heroParallaxY: number,
  heroMinScale: number,
  overscrollMaxScale: number,
  overscrollMaxTranslateY: number
): { translateY: number; scale: number } {
  'worklet';
  if (!enabled || !Number.isFinite(scrollY)) {
    return { translateY: 0, scale: 1 };
  }
  if (scrollY < 0 && overscrollMaxScale > 1) {
    const pull = Math.min(1, Math.max(0, -scrollY / 96));
    const easedPull = 1 - (1 - pull) * (1 - pull);
    return {
      translateY: -overscrollMaxTranslateY * easedPull,
      scale: 1 + (overscrollMaxScale - 1) * 0.7 * easedPull,
    };
  }
  const progress = Math.min(1, Math.max(0, scrollY / 180));
  return {
    translateY: progress * heroParallaxY,
    scale: 1 - progress * (1 - heroMinScale),
  };
}

export interface ScrollDepthHeroProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface ActiveScrollDepthHeroProps extends ScrollDepthHeroProps {
  scrollY: SharedValue<number>;
  spec: ScrollMotionSpec;
}

function ActiveScrollDepthHero({
  children,
  style,
  testID,
  scrollY,
  spec,
}: ActiveScrollDepthHeroProps): React.JSX.Element {
  const {
    enabled,
    heroParallaxY,
    heroMinScale,
    overscrollMaxScale,
    overscrollMaxTranslateY,
  } = spec;

  const animatedStyle = useAnimatedStyle(() => {
    const frame = heroDepthTransformAt(
      scrollY.value,
      enabled,
      heroParallaxY,
      heroMinScale,
      overscrollMaxScale,
      overscrollMaxTranslateY
    );
    return {
      transform: [{ translateY: frame.translateY }, { scale: frame.scale }],
    };
  });

  return (
    <Reanimated.View testID={testID} style={[style, animatedStyle]}>
      {children}
    </Reanimated.View>
  );
}

export function ScrollDepthHero({
  children,
  style,
  testID,
}: ScrollDepthHeroProps): React.JSX.Element {
  const { skin } = useBFlowTheme();
  const choreography = useScrollChoreography();
  const spec = scrollMotionBySkin[skin];

  if (!choreography?.active || !spec.enabled) {
    return <>{children}</>;
  }

  return (
    <ActiveScrollDepthHero
      scrollY={choreography.scrollY}
      spec={spec}
      style={style}
      testID={testID}
    >
      {children}
    </ActiveScrollDepthHero>
  );
}
