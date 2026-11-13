/**
 * src/design-system/motion/layoutTransition.ts
 *
 * Animates the NEXT layout change (an accordion opening or closing) with the system layout
 * animator. Omit `delete` so swapped triggers vanish immediately instead of fading out over
 * incoming content. Does nothing on Web, where there is no layout animator, nor with Reduce
 * Motion, where the layout changes at once.
 */

import { AccessibilityInfo, LayoutAnimation, Platform, UIManager } from 'react-native';
import { motionDuration } from '../tokens';

const isNewArchitecture =
  typeof globalThis !== 'undefined' &&
  'nativeFabricUIManager' in globalThis &&
  Boolean((globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager);

if (Platform.OS === 'android' && !isNewArchitecture && UIManager.setLayoutAnimationEnabledExperimental) {
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
  });
}
