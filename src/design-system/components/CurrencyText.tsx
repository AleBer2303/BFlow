import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { formatCurrency } from '../../domain/money/money';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppText, TypographyVariant } from './Typography';

export type CurrencyTone = 'neutral' | 'income' | 'expense' | 'debt' | 'reserve' | 'provisions' | 'moto' | 'savings';

export interface CurrencyTextProps {
  amount: number;
  variant?: TypographyVariant;
  tone?: CurrencyTone;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

export function CurrencyText({
  amount,
  variant = 'headline',
  tone = 'neutral',
  style,
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
    >
      {formatCurrency(amount)}
    </AppText>
  );
}
