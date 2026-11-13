import React from 'react';
import { Animated, ViewStyle } from 'react-native';
import { useReplayOnChange } from '../motion/useReplayOnChange';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionDuration } from '../tokens';
import { AppText } from './Typography';

export type BadgeStatus =
  | 'completed'
  | 'pending'
  | 'info'
  | 'reserve'
  | 'provisions'
  | 'moto'
  | 'debt'
  | 'savings'
  | 'expense';

export interface StatusBadgeProps {
  label: string;
  status: BadgeStatus;
  /** For a counter: the badge swells for a moment when its label changes on screen. */
  pulseOnChange?: boolean;
  testID?: string;
}

/** Peak of the pulse, reached a third of the way through. */
const PULSE_SCALE = 1.1;

export function StatusBadge({
  label,
  status,
  pulseOnChange = false,
  testID,
}: StatusBadgeProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();
  const pulse = useReplayOnChange(pulseOnChange ? label : null, motionDuration.fast);

  const paletteMap: Record<BadgeStatus, { bg: string; fg: string }> = {
    completed: { bg: colors.semantic.completedSoft, fg: colors.semantic.completed },
    pending: { bg: colors.semantic.pendingSoft, fg: colors.semantic.pending },
    info: { bg: colors.semantic.savingsSoft, fg: colors.semantic.savings },
    savings: { bg: colors.semantic.savingsSoft, fg: colors.semantic.savings },
    reserve: { bg: colors.semantic.reserveSoft, fg: colors.semantic.reserve },
    provisions: { bg: colors.semantic.provisionsSoft, fg: colors.semantic.provisions },
    moto: { bg: colors.semantic.reserveSoft, fg: colors.semantic.reserve },
    debt: { bg: colors.semantic.debtSoft, fg: colors.semantic.debt },
    expense: { bg: colors.semantic.expenseSoft, fg: colors.semantic.expense },
  };

  const selected = paletteMap[status];

  const badgeStyle: ViewStyle = {
    backgroundColor: selected.bg,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glass.subtleBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  };

  return (
    <Animated.View
      testID={testID}
      style={[
        badgeStyle,
        {
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 0.35, 1],
                outputRange: [1, PULSE_SCALE, 1],
              }),
            },
          ],
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <AppText variant="micro" color={selected.fg}>
        {label}
      </AppText>
    </Animated.View>
  );
}
