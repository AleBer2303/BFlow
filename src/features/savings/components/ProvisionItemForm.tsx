/**
 * src/features/savings/components/ProvisionItemForm.tsx
 *
 * Form to create or edit a provision or a target goal. It owns its field state, so typing
 * re-renders only this form and never the fund cards or the provisions list (same pattern
 * as the checklist forms, R-17). The parent mounts it with a new `key` each time it opens,
 * which loads the values of `item` (or an empty form when it is null).
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  MIN_TOUCH_TARGET_PT,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import { formatGroupedIntegerInput } from '../../../domain';
import type { SaveProvisionItemInput } from '../../budget/store/useBudgetStore';

type ProvisionKind = 'recurring' | 'target_goal';

export interface EditableProvisionItem {
  id: string;
  name: string;
  amount: number;
  periodMonths: number;
  kind: ProvisionKind;
  notes?: string;
}

export interface ProvisionItemFormProps {
  /** Item being edited; null creates a new one. */
  item: EditableProvisionItem | null;
  onSaveProvisionItem?: (input: SaveProvisionItemInput) => void;
  onClose: () => void;
}

const KIND_OPTIONS = [
  { id: 'recurring', label: 'Provisión Recurrente' },
  { id: 'target_goal', label: 'Meta Objetivo' },
] as const;

export const ProvisionItemForm = React.memo(function ProvisionItemForm({
  item,
  onSaveProvisionItem,
  onClose,
}: ProvisionItemFormProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [name, setName] = useState(() => item?.name ?? '');
  const [amount, setAmount] = useState(() => (item ? formatGroupedIntegerInput(item.amount) : ''));
  const [months, setMonths] = useState(() =>
    item ? formatGroupedIntegerInput(item.periodMonths) : '1'
  );
  const [kind, setKind] = useState<ProvisionKind>(() => item?.kind ?? 'recurring');
  const [notes, setNotes] = useState(() => item?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Escribe el nombre de la provisión o meta.');
      return;
    }
    const amountDigits = amount.replace(/[^0-9]/g, '');
    const parsedAmount = amountDigits ? Number(amountDigits) : 0;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto entero válido mayor a 0.');
      return;
    }
    const monthsDigits = months.replace(/[^0-9]/g, '');
    const parsedMonths = monthsDigits ? Number(monthsDigits) : 1;
    if (!Number.isSafeInteger(parsedMonths) || parsedMonths < 1) {
      setError('El periodo en meses debe ser un entero mayor o igual a 1.');
      return;
    }

    onSaveProvisionItem?.({
      ...(item ? { id: item.id } : {}),
      name: name.trim(),
      amount: parsedAmount,
      periodMonths: parsedMonths,
      priority: '1. Alta',
      kind,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    onClose();
  };

  return (
    <View
      testID="provision-form-card"
      style={{
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.glass.surfaceElevatedTint,
        borderWidth: 1,
        borderColor: colors.glass.specularBorder,
        gap: spacing.xs,
      }}
    >
      <AppText variant="headline">
        {item ? 'Editar Provisión o Meta' : 'Nueva Provisión o Meta'}
      </AppText>

      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {KIND_OPTIONS.map((opt) => {
          const active = kind === opt.id;
          return (
            <AppPressable
              key={opt.id}
              testID={`provision-kind-${opt.id}`}
              accessibilityRole="button"
              onPress={() => setKind(opt.id)}
              style={{
                flex: 1,
                minHeight: 38,
                borderRadius: radius.md,
                backgroundColor: active ? colors.semantic.provisionsSoft : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText
                variant="micro"
                color={active ? colors.semantic.provisions : colors.text.secondary}
              >
                {opt.label}
              </AppText>
            </AppPressable>
          );
        })}
      </View>

      <AppTextInput
        testID="provision-name-input"
        value={name}
        onChangeText={setName}
        placeholder="Nombre (ej. Seguro, Mantenimiento, Póliza)"
      />

      <AppTextInput
        testID="provision-amount-input"
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
        placeholder="Costo total del ciclo (ej. 690.000)"
      />

      <AppTextInput
        testID="provision-months-input"
        value={months}
        onChangeText={setMonths}
        keyboardType="number-pad"
        placeholder="Periodo en meses (ej. 1 mensual, 12 anual)"
      />

      <AppTextInput
        testID="provision-notes-input"
        value={notes}
        onChangeText={setNotes}
        placeholder="Nota o fecha objetivo opcional"
      />

      <FormMessage message={error} />

      <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end' }}>
        <AppPressable
          testID="submit-provision-button"
          accessibilityRole="button"
          onPress={handleSubmit}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            ...primaryAction.container,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption" color={primaryAction.labelColor ?? colors.semantic.income}>
            Guardar Provisión
          </AppText>
        </AppPressable>
      </View>
    </View>
  );
});
