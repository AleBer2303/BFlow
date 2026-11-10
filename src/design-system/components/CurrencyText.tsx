import React from 'react';
import { Platform, StyleProp, TextStyle } from 'react-native';
import { formatCurrency } from '../../domain/money/money';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppText, TypographyVariant } from './Typography';

export type CurrencyTone = 'neutral' | 'income' | 'expense' | 'debt' | 'reserve' | 'provisions' | 'moto' | 'savings';

export interface CurrencyTextProps {
  amount: number;
  variant?: TypographyVariant;
  tone?: CurrencyTone;
  style?: StyleProp<TextStyle>;
  /**
   * Keeps the amount on ONE line by shrinking the type on iOS and Android (never truncating).
   * Browsers cannot shrink text to fit, so on web the amount keeps its size and may wrap.
   */
  fitOneLine?: boolean;
  testID?: string;
}

const FIT_MINIMUM_FONT_SCALE = 0.6;

export function CurrencyText({
  amount,
  variant = 'headline',
  tone = 'neutral',
  style,
  fitOneLine = false,
  testID,
}: CurrencyTextProps): React.JSX.Element {
  const { colors } = useBFlowTheme();

  const toneColorMap: Record<CurrencyTone, string> = {
    neutral: colors.text.primary,
    income: colors.semantic.income,
    expense: colors.semantic.expense,
    debt: colors.semantic.debt,
    reserve: colors.semantic.reserve,
    provisions: colors.semantic.provisions,
    moto: colors.semantic.reserve,
    savings: colors.semantic.savings,
  };

  return (
    <AppText
      testID={testID}
      variant={variant}
      color={toneColorMap[tone]}
      tabularNums
      style={style}
      {...(fitOneLine && Platform.OS !== 'web'
        ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: FIT_MINIMUM_FONT_SCALE }
        : null)}
    >
      {formatCurrency(amount)}
    </AppText>
  );
}
