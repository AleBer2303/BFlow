/**
 * src/design-system/components/AppTextInput.tsx
 *
 * Universal TextInput for BFlow, styled by the active platform skin.
 *
 * Enforces:
 * 1. Skin-aware styling (subtle borders, theme-aware surface, 44pt / 48dp touch target, accent
 *    focus edge on Android and Web).
 * 2. Universal keyboard awareness: upon focus, automatically requests the enclosing
 *    KeyboardAwareScrollView to scroll this input into clear view above the keyboard.
 * 3. Works consistently for existing and all future forms in the application.
 */

import React, { useImperativeHandle, useRef, useState } from 'react';
import {
  TextInput,
  type NativeSyntheticEvent,
  type TextInputProps,
} from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
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
      onBlur,
      focusScrollOffset = 24,
      ...rest
    },
    forwardedRef
  ) {
    const { colors, spacing, radius, typography, minTouchTarget, skin } = useBFlowTheme();
    // Liquid Glass brightens its specular edge on focus; Material and Web mark it with the accent.
    const focusBorderColor = skin === 'ios' ? colors.glass.specularBorder : colors.accent.primary;
    const innerRef = useRef<AppTextInputElement | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const { registerInputFocus } = useKeyboardAware();

    useImperativeHandle(forwardedRef, () => innerRef.current as AppTextInputElement);

    const handleFocus = (e: any) => {
      setIsFocused(true);
      onFocus?.(e);
      if (innerRef.current) {
        registerInputFocus(innerRef.current, focusScrollOffset);
      }
    };

    const handleBlur = (e: any) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    return (
      <TextInput
        ref={innerRef}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={placeholderTextColor ?? colors.text.muted}
        style={[
          {
            minHeight: minTouchTarget,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: isFocused
              ? colors.glass.surfaceElevatedTint
              : colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: isFocused ? focusBorderColor : colors.glass.subtleBorder,
            color: colors.text.primary,
            fontSize: typography.body.fontSize,
            fontFamily: typography.body.fontFamily,
          },
          style,
        ]}
        {...rest}
      />
    );
  }
);
