/**
 * src/features/onboarding/components/onboardingStepParts.tsx
 *
 * Pieces shared by the onboarding steps: the step header, the open/close button of each form,
 * the empty-step notice and the row of a configured item with its remove button.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  StatusBadge,
  TrashBinIcon,
  useBFlowTheme,
} from '../../../design-system';

type StepBadgeStatus = React.ComponentProps<typeof StatusBadge>['status'];

interface OnboardingStepHeaderProps {
  stepLabel: string;
  status: StepBadgeStatus;
  title: string;
  /** Shown on the right once the step has items. */
  countLabel?: string | null;
}

export const OnboardingStepHeader = React.memo(function OnboardingStepHeader({
  stepLabel,
  status,
  title,
  countLabel,
}: OnboardingStepHeaderProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <StatusBadge label={stepLabel} status={status} />
        <AppText variant="headline">{title}</AppText>
      </View>
      {countLabel ? (
        <AppText variant="micro" color={colors.text.secondary}>
          {countLabel}
        </AppText>
      ) : null}
    </View>
  );
});

interface SectionToggleButtonProps {
  testID: string;
  isOpen: boolean;
  openLabel: string;
  closeAccessibilityLabel: string;
  openAccessibilityLabel: string;
  tintBackground: string;
  tintText: string;
  onPress: () => void;
}

export const SectionToggleButton = React.memo(function SectionToggleButton({
  testID,
  isOpen,
  openLabel,
  closeAccessibilityLabel,
  openAccessibilityLabel,
  tintBackground,
  tintText,
  onPress,
}: SectionToggleButtonProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();

  return (
    <AppPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={isOpen ? closeAccessibilityLabel : openAccessibilityLabel}
      onPress={onPress}
      style={{
        width: '100%',
        minHeight: minTouchTarget,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: isOpen ? colors.glass.surfaceElevatedTint : tintBackground,
        borderWidth: 1,
        borderColor: colors.glass.specularBorder,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <AppText variant="headline" color={isOpen ? colors.text.primary : tintText}>
        {isOpen ? 'Cerrar' : openLabel}
      </AppText>
    </AppPressable>
  );
});

/** Notice of a step with nothing configured yet. */
export const OnboardingEmptyNotice = React.memo(function OnboardingEmptyNotice({
  text,
}: {
  text: string;
}): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  return (
    <View
      style={{
        padding: spacing.sm,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: colors.glass.surfaceTint,
        borderWidth: 1,
        borderColor: colors.glass.subtleBorder,
      }}
    >
      <AppText variant="caption" color={colors.text.muted}>
        {text}
      </AppText>
    </View>
  );
});

interface RemoveItemButtonProps {
  testID?: string;
  itemName: string;
  onPress: () => void;
}

const RemoveItemButton = React.memo(function RemoveItemButton({
  testID,
  itemName,
  onPress,
}: RemoveItemButtonProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();

  return (
    <AppPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Eliminar ${itemName}`}
      onPress={onPress}
      style={{
        minWidth: minTouchTarget,
        minHeight: minTouchTarget,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderCurve: 'continuous',
        backgroundColor: colors.semantic.expenseSoft,
        borderWidth: 1,
        borderColor: colors.glass.subtleBorder,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <TrashBinIcon size={16} color={colors.semantic.expense} />
    </AppPressable>
  );
});

interface OnboardingItemRowProps {
  testID: string;
  removeTestID: string;
  itemName: string;
  onRemove: () => void;
  /** Name, amount and details of the item. */
  children: React.ReactNode;
}

/** A configured item: its details on the left and the remove button on the right. */
export function OnboardingItemRow({
  testID,
  removeTestID,
  itemName,
  onRemove,
  children,
}: OnboardingItemRowProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: colors.glass.surfaceTint,
        borderWidth: 1,
        borderColor: colors.glass.subtleBorder,
      }}
    >
      <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>{children}</View>
      <RemoveItemButton testID={removeTestID} itemName={itemName} onPress={onRemove} />
    </View>
  );
}

/** Props every step with an add form receives from the wizard. */
export interface OnboardingFormSlotProps {
  isFormOpen: boolean;
  /** Changes every time the form opens, so it mounts clean. */
  formKey: number;
  onToggleForm: () => void;
  onCloseForm: () => void;
}
