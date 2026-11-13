/**
 * src/design-system/motion/layoutTransition.ts
 *
 * Animates the NEXT layout change (a row added to a list, an accordion opening) with the
 * system layout animator. One reversible motion, the same both ways. It does nothing on Web,
 * where there is no layout animator, nor with Reduce Motion, where the layout changes at once.
 */

import { AccessibilityInfo, LayoutAnimation, Platform, UIManager } from 'react-native';
import { motionDuration } from '../tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** `LayoutAnimation` is configured outside React, so the setting is tracked here. */
let isMotionReduced = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((isEnabled) => {
    isMotionReduced = isEnabled;
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (isEnabled) => {
  isMotionReduced = isEnabled;
});

export function animateNextLayout(): void {
  if (Platform.OS === 'web' || isMotionReduced) {
    return;
  }
  LayoutAnimation.configureNext({
    duration: motionDuration.fast,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}
