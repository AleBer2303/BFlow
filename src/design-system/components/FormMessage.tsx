/**
 * src/design-system/components/FormMessage.tsx
 *
 * The answer of a form: what went wrong, or that it worked. It opens by pushing the content
 * below (never a jump), and it reaches every sense once:
 * - sight:  an error shakes its text sideways; with Reduce Motion it only opens.
 * - touch:  an error fires the error haptic. A success stays silent here, because the action
 *           that succeeded already confirmed it.
 * - screen readers: announced when it appears (live region on Android and Web, an explicit
 *           announcement on iOS, which has no live regions).
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, View } from 'react-native';
import { hapticService } from '../../platform/haptics/hapticService';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER } from '../motion/motionRuntime';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionDistance, motionDuration } from '../tokens';
import { RevealDown } from './RevealDown';
import { AppText } from './Typography';

export type FormMessageTone = 'error' | 'success';

export interface FormMessageProps {
  /** Empty, null or undefined closes the message. */
  message: string | null | undefined;
  tone?: FormMessageTone;
  testID?: string;
}

/** Left, right, then a shorter left and right, and back to rest. */
const SHAKE_OFFSETS = [
  -motionDistance.base,
  motionDistance.base,
  -motionDistance.small,
  motionDistance.small,
  0,
] as const;

function shake(offset: Animated.Value): void {
  offset.setValue(0);
  Animated.sequence(
    SHAKE_OFFSETS.map((toValue) =>
      Animated.timing(offset, {
        toValue,
        duration: motionDuration.micro,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    )
  ).start();
}

export function FormMessage({
  message,
  tone = 'error',
  testID,
}: FormMessageProps): React.JSX.Element {
  const { colors, spacing, radius, reducedMotion } = useBFlowTheme();
  const offset = useRef(new Animated.Value(0)).current;
  // The text stays readable while the message closes.
  const shownMessage = useRef(message);
  if (message) {
    shownMessage.current = message;
  }
  const isError = tone === 'error';

  useEffect(() => {
    if (!message) return;
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
    if (!isError) return;
    hapticService.error();
    if (!IS_MOTION_STATIC && !reducedMotion) {
      shake(offset);
    }
    // Reduce Motion changing must not replay the feedback of a message already on screen.
  }, [message, isError, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RevealDown visible={Boolean(message)}>
      <View
        testID={testID}
        accessibilityRole="alert"
        accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
        style={{
          padding: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.glass.subtleBorder,
          backgroundColor: isError ? colors.semantic.expenseSoft : colors.semantic.completedSoft,
        }}
      >
        <Animated.View style={{ transform: [{ translateX: offset }] }}>
          <AppText
            variant="caption"
            color={isError ? colors.semantic.expense : colors.semantic.completed}
          >
            {shownMessage.current}
          </AppText>
        </Animated.View>
      </View>
    </RevealDown>
  );
}
