/**
 * src/design-system/components/AppTextInput.tsx
 *
 * Universal Liquid Glass TextInput for BFlow.
 *
 * Enforces:
 * 1. Apple iOS 26 Liquid Glass styling (subtle borders, theme-aware surface tint, 44pt touch target).
 * 2. Universal keyboard awareness: upon focus, automatically requests the enclosing
 *    KeyboardAwareScrollView to scroll this input into clear view above the keyboard.
 * 3. Works consistently for existing and all future forms in the application.
 */

import React, { useImperativeHandle, useRef } from 'react';
import {
  TextInput,
  type NativeSyntheticEvent,
  type TextInputProps,
} from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { MIN_TOUCH_TARGET_PT, typography } from '../tokens';
import { useKeyboardAware } from './KeyboardAwareScrollView';

export type AppTextInputElement = React.ElementRef<typeof TextInput>;

export interface AppTextInputProps extends TextInputProps {
  /**
   * Additional clearance in points above the keyboard when focused.
   * Defaults to 24 points to keep a clean, natural iOS margin without empty voids.
   */
  focusScrollOffset?: number;
}

export const AppTextInput = React.forwardRef<AppTextInputElement, AppTextInputProps>(
  function AppTextInput(
    {
      style,
      placeholderTextColor,
      onFocus,
      focusScrollOffset = 24,
      ...rest
    },
    forwardedRef
  ) {
    const { colors, spacing, radius } = useBFlowTheme();
    const innerRef = useRef<AppTextInputElement | null>(null);
    const { registerInputFocus } = useKeyboardAware();

    useImperativeHandle(forwardedRef, () => innerRef.current as AppTextInputElement);

    const handleFocus = (e: any) => {
      onFocus?.(e);
      if (innerRef.current) {
        registerInputFocus(innerRef.current, focusScrollOffset);
      }
    };

    return (
      <TextInput
        ref={innerRef}
        onFocus={handleFocus}
        placeholderTextColor={placeholderTextColor ?? colors.text.muted}
        style={[
          {
            minHeight: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: colors.glass.subtleBorder,
            color: colors.text.primary,
            fontSize: typography.body.fontSize,
          },
          style,
        ]}
        {...rest}
      />
    );
  }
);
