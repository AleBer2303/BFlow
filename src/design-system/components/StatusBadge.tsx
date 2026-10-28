import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppText } from './Typography';

export type BadgeStatus = 'completed' | 'pending' | 'info' | 'moto' | 'debt';

export interface StatusBadgeProps {
  label: string;
  status: BadgeStatus;
  testID?: string;
}

export function StatusBadge({ label, status, testID }: StatusBadgeProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();

  const paletteMap: Record<BadgeStatus, { bg: string; fg: string }> = {
    completed: { bg: colors.semantic.completedSoft, fg: colors.semantic.completed },
    pending: { bg: colors.semantic.pendingSoft, fg: colors.semantic.pending },
    info: { bg: colors.semantic.savingsSoft, fg: colors.semantic.savings },
    moto: { bg: colors.semantic.motoSoft, fg: colors.semantic.moto },
    debt: { bg: colors.semantic.debtSoft, fg: colors.semantic.debt },
  };

  const selected = paletteMap[status];

  const badgeStyle: ViewStyle = {
    backgroundColor: selected.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  };

  return (
    <View testID={testID} style={badgeStyle} accessibilityRole="text" accessibilityLabel={label}>
      <AppText variant="micro" color={selected.fg}>
        {label}
      </AppText>
    </View>
  );
}
