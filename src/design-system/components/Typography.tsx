import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { typography } from '../tokens';

export type TypographyVariant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  tabularNums?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export function AppText({
  variant = 'body',
  color,
  tabularNums = false,
  style,
  children,
  ...rest
}: AppTextProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
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
      {children}
    </Text>
  );
}
