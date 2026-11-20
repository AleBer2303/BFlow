/**
 * src/design-system/motion/TabTransition.tsx
 *
 * The motion of a workspace tab coming on screen, every time it does: on its first mount and
 * on each later visit (the tabs stay mounted hidden, so a mount-only `Entrance` would play
 * once). The look comes from `resolveTabSwitchSpec`: a slide along the dock on iOS, a Material
 * fade-through on Android, a short rise on Web.
 *
 * While the tab is hidden its progress rests at 0, so the frame that shows it again already
 * starts from the beginning of the motion instead of flashing the settled tab first. Opacity
 * and transforms run on the native driver.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from './motionRuntime';
import { resolveTabSwitchSpec, type TabSwitchDirection } from './motionSpec';
import { useIsTabActive } from './TabVisibilityContext';

export interface TabTransitionProps {
  children: React.ReactNode;
  /** Where this tab sits in the dock relative to the tab it replaces (0 on first open). */
  direction?: TabSwitchDirection;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TabTransition({
  children,
  direction = 0,
  style,
  testID,
}: TabTransitionProps): React.JSX.Element {
  const { skin, reducedMotion } = useBFlowTheme();
  const isActive = useIsTabActive();
  const progress = useRef(new Animated.Value(IS_MOTION_STATIC ? 1 : 0)).current;
  const spec = resolveTabSwitchSpec({ skin, reducedMotion }, direction);
  // The spec is taken when a visit starts (the render that shows the tab, which also brings
  // its direction) and kept for the whole visit: a theme change mid-motion must not alter it.
  // A render-phase state update, not a ref, so a render React throws away changes nothing.
  const [visit, setVisit] = useState({ isActive, spec });
  if (visit.isActive !== isActive) {
    setVisit({ isActive, spec });
  }
  const visitSpec = visit.isActive === isActive ? visit.spec : spec;
  const visitSpecRef = useRef(visitSpec);
  visitSpecRef.current = visitSpec;

  useEffect(() => {
    if (IS_MOTION_STATIC) return undefined;
    if (!isActive) {
      // Hidden (`display: 'none'`): rewind so the next visit starts from the first frame.
      progress.stopAnimation();
      progress.setValue(0);
      return undefined;
    }
    const { durationMs, delayMs, easing } = visitSpecRef.current;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      delay: delayMs,
      easing: toEasing(easing),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [isActive, progress]);

  // Memoized per visit, so a re-render of the tab never rebuilds the animated nodes.
  const transform = useMemo(() => {
    const travel = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [visitSpec.distance, 0],
    });
    if (visitSpec.axis === 'x') {
      return [{ translateX: travel }];
    }
    return [
      { translateY: travel },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [visitSpec.scale, 1],
        }),
      },
    ];
  }, [progress, visitSpec]);

  return (
    <Animated.View testID={testID} style={[style, { opacity: progress, transform }]}>
      {children}
    </Animated.View>
  );
}
