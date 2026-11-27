/**
 * src/design-system/components/ListActionControls.tsx
 *
 * Editar / Eliminar controls shared by the lists of Checklist, Deudas and Ahorros (CC-03):
 * - `ActionModeToggleRow`: the two section buttons that turn the edit or delete mode on and off.
 * - `InlineItemActionPill`: the per-item button shown while a mode is on.
 *
 * Only the look lives here. Callers keep their behavior: the haptic of each action (`warning`
 * when deleting), `confirmDestructive` and the `RevealDown` / `ActionRevealSlot` around them.
 * Every button keeps the skin's `minTouchTarget`.
 */

import React from 'react';
import { View } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppPressable } from './AppPressable';
import { PencilEditIcon, TrashBinIcon } from './BrandAndThemeIcons';
import { AppText } from './Typography';

export type ListActionMode = 'edit' | 'delete' | null;

export interface ActionModeToggleRowProps {
  activeMode: ListActionMode;
  showEdit?: boolean;
  showDelete?: boolean;
  editLabel: string;
  deleteLabel: string;
  /** Label while the mode is on. */
  activeEditLabel?: string;
  activeDeleteLabel?: string;
  editTestID: string;
  deleteTestID: string;
  editAccessibilityLabel: string;
  deleteAccessibilityLabel: string;
  /** Accessibility label while the mode is on; the inactive one when omitted. */
  activeEditAccessibilityLabel?: string;
  activeDeleteAccessibilityLabel?: string;
  onToggleEdit: () => void;
  onToggleDelete: () => void;
  /** Section header (Checklist): the buttons hug their content instead of filling the row. */
  compact?: boolean;
}

/** Two-button Editar / Eliminar mode toggle row for a list section. */
export const ActionModeToggleRow = React.memo(function ActionModeToggleRow({
  activeMode,
  showEdit = true,
  showDelete = true,
  editLabel,
  deleteLabel,
  activeEditLabel = 'Cancelar Edición',
  activeDeleteLabel = 'Cancelar Eliminación',
  editTestID,
  deleteTestID,
  editAccessibilityLabel,
  deleteAccessibilityLabel,
  activeEditAccessibilityLabel,
  activeDeleteAccessibilityLabel,
  onToggleEdit,
  onToggleDelete,
  compact = false,
}: ActionModeToggleRowProps): React.JSX.Element | null {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  if (!showEdit && !showDelete) return null;

  const isEditActive = activeMode === 'edit';
  const isDeleteActive = activeMode === 'delete';
  const textVariant = compact ? 'micro' : 'caption';
  const iconSize = compact ? 14 : 16;
  const buttonStyle = {
    ...(compact ? {} : { flex: 1 }),
    minHeight: minTouchTarget,
    paddingHorizontal: compact ? spacing.sm : spacing.md,
    borderRadius: radius.pill,
    borderCurve: 'continuous' as const,
    borderWidth: 1.5,
    flexDirection: 'row' as const,
    gap: compact ? spacing.xxs : spacing.xs,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const editColor = isEditActive ? colors.semantic.income : colors.text.secondary;
  const deleteColor = isDeleteActive ? colors.semantic.expense : colors.text.secondary;

  return (
    <View style={{ flexDirection: 'row', gap: compact ? spacing.xs : spacing.sm, alignItems: 'center' }}>
      {showEdit ? (
        <AppPressable
          testID={editTestID}
          accessibilityRole="button"
          accessibilityLabel={
            isEditActive ? (activeEditAccessibilityLabel ?? editAccessibilityLabel) : editAccessibilityLabel
          }
          accessibilityState={{ selected: isEditActive }}
          onPress={onToggleEdit}
          style={{
            ...buttonStyle,
            backgroundColor: isEditActive ? colors.glass.surfaceElevatedTint : colors.glass.surfaceTint,
            borderColor: isEditActive ? colors.semantic.income : colors.glass.subtleBorder,
          }}
        >
          <PencilEditIcon size={iconSize} color={editColor} />
          <AppText variant={textVariant} color={editColor}>
            {isEditActive ? activeEditLabel : editLabel}
          </AppText>
        </AppPressable>
      ) : null}

      {showDelete ? (
        <AppPressable
          testID={deleteTestID}
          accessibilityRole="button"
          accessibilityLabel={
            isDeleteActive
              ? (activeDeleteAccessibilityLabel ?? deleteAccessibilityLabel)
              : deleteAccessibilityLabel
          }
          accessibilityState={{ selected: isDeleteActive }}
          onPress={onToggleDelete}
          style={{
            ...buttonStyle,
            backgroundColor: isDeleteActive ? colors.semantic.expenseSoft : colors.glass.surfaceTint,
            borderColor: isDeleteActive ? colors.semantic.expense : colors.glass.subtleBorder,
          }}
        >
          <TrashBinIcon size={iconSize} color={deleteColor} />
          <AppText variant={textVariant} color={deleteColor}>
            {isDeleteActive ? activeDeleteLabel : deleteLabel}
          </AppText>
        </AppPressable>
      ) : null}
    </View>
  );
});

export interface InlineItemActionPillProps {
  mode: ListActionMode;
  /** Read after "Editar" / "Eliminar" by screen readers: "Editar deuda Moto". */
  itemName: string;
  editTestID: string;
  deleteTestID: string;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Icon-only square button, for narrow rows (Checklist columns). */
  iconOnly?: boolean;
}

/** Per-item Editar or Eliminar button shown while the section's action mode is on. */
export function InlineItemActionPill({
  mode,
  itemName,
  editTestID,
  deleteTestID,
  onEdit,
  onDelete,
  iconOnly = false,
}: InlineItemActionPillProps): React.JSX.Element | null {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const baseStyle = {
    minHeight: minTouchTarget,
    ...(iconOnly ? { minWidth: minTouchTarget } : { paddingHorizontal: spacing.md }),
    borderRadius: radius.pill,
    borderCurve: 'continuous' as const,
    borderWidth: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    justifyContent: 'center' as const,
  };
  const iconSize = iconOnly ? 16 : 14;

  if (mode === 'edit' && onEdit) {
    return (
      <AppPressable
        testID={editTestID}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${itemName}`}
        onPress={onEdit}
        style={{
          ...baseStyle,
          backgroundColor: colors.glass.surfaceElevatedTint,
          borderColor: colors.glass.specularBorder,
        }}
      >
        <PencilEditIcon size={iconSize} color={colors.semantic.income} />
        {iconOnly ? null : (
          <AppText variant="caption" color={colors.semantic.income}>
            Editar
          </AppText>
        )}
      </AppPressable>
    );
  }

  if (mode === 'delete' && onDelete) {
    return (
      <AppPressable
        testID={deleteTestID}
        accessibilityRole="button"
        accessibilityLabel={`Eliminar ${itemName}`}
        onPress={onDelete}
        style={{
          ...baseStyle,
          backgroundColor: colors.semantic.expenseSoft,
          borderColor: colors.semantic.expense,
        }}
      >
        <TrashBinIcon size={iconSize} color={colors.semantic.expense} />
        {iconOnly ? null : (
          <AppText variant="caption" color={colors.semantic.expense}>
            Eliminar
          </AppText>
        )}
      </AppPressable>
    );
  }

  return null;
}
