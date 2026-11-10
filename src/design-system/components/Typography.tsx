import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import type { TypographyVariantId } from '../tokens';

export type TypographyVariant = TypographyVariantId;

const NON_BREAKING_SPACE = '\u00A0';
const CURRENCY_SIGN_GAP = /\$ (?=\d)/g;
const JOINED_CURRENCY_SIGN = '$' + NON_BREAKING_SPACE;

/**
 * A number never breaks from its unit: joins the currency sign to its amount with a
 * non-breaking space, so a wrapping line cannot leave "$" at the end of one line and
 * "2.000.000" at the start of the next. The sign itself is always kept.
 */
export function keepAmountsTogether(text: string): string {
  // A replacer function: in a replacement STRING, "$" starts a special pattern.
  return text.replace(CURRENCY_SIGN_GAP, () => JOINED_CURRENCY_SIGN);
}

/** Under Jest the text stays as authored, so assertions keep matching plain spaces. */
const SHOULD_KEEP_AMOUNTS_TOGETHER = process.env.NODE_ENV !== 'test';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  tabularNums?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

/** Text in the type scale of the active platform skin (SF Pro, Material 3 Roboto or Geist). */
export function AppText({
  variant = 'body',
  color,
  tabularNums = false,
  style,
  children,
  ...rest
}: AppTextProps): React.JSX.Element {
  const { colors, typography } = useBFlowTheme();
  const variantStyle = typography[variant];

  return (
    <Text
      allowFontScaling
      style={[
        variantStyle,
        { color: color ?? colors.text.primary },
        tabularNums ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    >
      {SHOULD_KEEP_AMOUNTS_TOGETHER && typeof children === 'string'
        ? keepAmountsTogether(children)
        : children}
    </Text>
  );
}
