/**
 * src/design-system/components/HeroAmountField.tsx
 *
 * Single interactive hero amount field shared across BFlow forms (checklist movements and debts).
 * Renders one editable currency display directly in the active semantic color on its soft tinted
 * surface, avoiding duplicate amount readouts.
 */

import React, { useState } from 'react';
import { View, type TextInputProps } from 'react-native';
import { formatGroupedIntegerInput } from '../../domain/money/money';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppTextInput } from './AppTextInput';
import { AppText } from './Typography';

export type HeroAmountTone = 'expense' | 'income' | 'debt' | 'savings' | 'provisions';

export interface HeroAmountFieldProps {
  /** Prompt shown above the amount (e.g. "Monto a pagar", "Saldo inicial"). */
  label: string;
  /** Visual semantic tone. */
  tone: HeroAmountTone;
  /** Current raw or formatted integer input string. */
  value: string;
  onChangeText: (text: string) => void;
  inputTestID: string;
  containerTestID?: string;
  accessibilityLabel?: string;
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
}

export function HeroAmountField({
  label,
  tone,
  value,
  onChangeText,
  inputTestID,
  containerTestID,
  accessibilityLabel,
  onFocus,
  onBlur,
}: HeroAmountFieldProps): React.JSX.Element {
  const { colors, spacing, radius, typography, minTouchTarget } = useBFlowTheme();
  const [isFocused, setIsFocused] = useState(false);

  const toneColors: Record<HeroAmountTone, { text: string; soft: string }> = {
    expense: { text: colors.semantic.expense, soft: colors.semantic.expenseSoft },
    income: { text: colors.semantic.income, soft: colors.semantic.incomeSoft },
    debt: { text: colors.semantic.debt, soft: colors.semantic.debtSoft },
    savings: { text: colors.semantic.savings, soft: colors.semantic.savingsSoft },
    provisions: { text: colors.semantic.provisions, soft: colors.semantic.provisionsSoft },
  };
  const { text: toneColor, soft: toneSoft } = toneColors[tone];
  const formattedDisplay = formatGroupedIntegerInput(value) || '0';
  const heroMinHeight = Math.max(minTouchTarget, typography.heroCurrency.lineHeight);

  return (
    <View
      testID={containerTestID}
      style={{
        padding: spacing.md,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        backgroundColor: toneSoft,
        borderWidth: 1.5,
        borderColor: isFocused ? toneColor : colors.glass.specularBorder,
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      <AppText variant="caption" color={colors.text.secondary}>
        {label}
      </AppText>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xxs,
          maxWidth: '100%',
        }}
      >
        <AppText variant="heroCurrency" color={toneColor} tabularNums>
          $
        </AppText>

        <View
          style={{
            position: 'relative',
            justifyContent: 'center',
            minHeight: heroMinHeight,
            minWidth: spacing.xxl,
            maxWidth: '86%',
            flexShrink: 1,
          }}
        >
          {/* Invisible sizing mirror so "$" and the typed digits stay centered as one figure across iOS, Android, and Web. */}
          <AppText
            variant="heroCurrency"
            tabularNums
            numberOfLines={1}
            aria-hidden
            importantForAccessibility="no"
            style={{
              opacity: 0,
              paddingHorizontal: spacing.xs,
            }}
          >
            {formattedDisplay}
          </AppText>

          <AppTextInput
            testID={inputTestID}
            accessibilityLabel={accessibilityLabel ?? label}
            value={value}
            onChangeText={onChangeText}
            onFocus={(event) => {
              setIsFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setIsFocused(false);
              onBlur?.(event);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            selectionColor={toneColor}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              minHeight: heroMinHeight,
              paddingHorizontal: spacing.xs,
              paddingVertical: 0,
              backgroundColor: 'transparent',
              borderWidth: 0,
              borderRadius: 0,
              textAlign: 'center',
              textAlignVertical: 'center',
              includeFontPadding: false,
              color: toneColor,
              fontSize: typography.heroCurrency.fontSize,
              fontWeight: typography.heroCurrency.fontWeight,
              letterSpacing: typography.heroCurrency.letterSpacing,
              fontFamily: typography.heroCurrency.fontFamily,
              fontVariant: ['tabular-nums'],
            }}
          />
        </View>
      </View>
    </View>
  );
}
