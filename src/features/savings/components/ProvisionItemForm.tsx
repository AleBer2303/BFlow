/**
 * src/features/savings/components/ProvisionItemForm.tsx
 *
 * Form to create or edit a provision or a target goal. It owns its field state, so typing
 * re-renders only this form and never the fund cards or the provisions list (same pattern
 * as the checklist forms, R-17). The parent mounts it with a new `key` each time it opens,
 * which loads the values of `item` (or an empty form when it is null).
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  hapticService,
  HeroAmountField,
  useAmountPrivacy,
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
  { id: 'recurring', label: 'Provisión' },
  { id: 'target_goal', label: 'Meta objetivo' },
] as const;

export const ProvisionItemForm = React.memo(function ProvisionItemForm({
  item,
  onSaveProvisionItem,
  onClose,
}: ProvisionItemFormProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const { formatAmount } = useAmountPrivacy();

  const [name, setName] = useState(() => item?.name ?? '');
  const [amount, setAmount] = useState(() => (item ? formatGroupedIntegerInput(item.amount) : ''));
  const [months, setMonths] = useState(() =>
    item ? formatGroupedIntegerInput(item.periodMonths) : '1'
  );
  const [kind, setKind] = useState<ProvisionKind>(() => item?.kind ?? 'recurring');
  const [notes, setNotes] = useState(() => item?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const monthlyPreview = useMemo(() => {
    const amountDigits = amount.replace(/[^0-9]/g, '');
    const parsedAmount = amountDigits ? Number(amountDigits) : 0;
    const monthsDigits = months.replace(/[^0-9]/g, '');
    const parsedMonths = monthsDigits ? Number(monthsDigits) : 0;
    if (
      !Number.isSafeInteger(parsedAmount) ||
      parsedAmount <= 0 ||
      !Number.isSafeInteger(parsedMonths) ||
      parsedMonths < 1
    ) {
      return null;
    }
    return Math.ceil(parsedAmount / parsedMonths);
  }, [amount, months]);

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

    setError(null);
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
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        backgroundColor: colors.glass.surfaceTint,
        borderWidth: 1,
        borderColor: colors.glass.specularBorder,
        gap: spacing.md,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          flexWrap: 'wrap',
        }}
      >
        <AppText variant="title2">
          {item ? 'Editar Meta o Provisión' : 'Nueva Meta o Provisión'}
        </AppText>
        <View
          style={{
            paddingHorizontal: spacing.xs,
            paddingVertical: 2,
            borderRadius: radius.pill,
            backgroundColor: colors.semantic.provisionsSoft,
          }}
        >
          <AppText variant="micro" color={colors.semantic.provisions}>
            {kind === 'target_goal' ? 'Meta' : 'Provisión'}
          </AppText>
        </View>
      </View>

      {/* Segmented Kind Selector */}
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.xxs,
          padding: spacing.xxs,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.glass.surfaceElevatedTint,
          borderWidth: 1,
          borderColor: colors.glass.subtleBorder,
        }}
      >
        {KIND_OPTIONS.map((opt) => {
          const active = kind === opt.id;
          return (
            <AppPressable
              key={opt.id}
              testID={`provision-kind-${opt.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                hapticService.selection();
                setKind(opt.id);
              }}
              style={{
                flex: 1,
                minHeight: minTouchTarget,
                borderRadius: radius.sm,
                borderCurve: 'continuous',
                backgroundColor: active ? colors.semantic.provisionsSoft : 'transparent',
                borderWidth: 1,
                borderColor: active ? colors.semantic.provisions : 'transparent',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText
                variant="callout"
                color={active ? colors.semantic.provisions : colors.text.secondary}
              >
                {opt.label}
              </AppText>
            </AppPressable>
          );
        })}
      </View>

      {/* Single Interactive Hero Amount Input */}
      <HeroAmountField
        containerTestID="provision-hero-amount"
        inputTestID="provision-amount-input"
        label={kind === 'target_goal' ? 'Monto objetivo total' : 'Costo total del ciclo'}
        tone="provisions"
        value={amount}
        onChangeText={(text) => {
          setAmount(text);
          if (error) setError(null);
        }}
      />

      {/* Name Input */}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          Nombre de la meta o provisión
        </AppText>
        <AppTextInput
          testID="provision-name-input"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (error) setError(null);
          }}
          placeholder="Ej. Seguro, Mantenimiento, Viaje, Póliza"
        />
      </View>

      {/* Period in Months + Live Monthly Suggestion */}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          Periodo en meses
        </AppText>
        <AppTextInput
          testID="provision-months-input"
          value={months}
          onChangeText={(text) => {
            setMonths(text);
            if (error) setError(null);
          }}
          keyboardType="number-pad"
          placeholder="Ej. 1 mensual, 12 anual"
        />
        {monthlyPreview !== null ? (
          <AppText
            testID="provision-monthly-preview"
            variant="micro"
            color={colors.semantic.provisions}
          >
            {`Cuota mensual sugerida: ${formatAmount(monthlyPreview)}/mes`}
          </AppText>
        ) : (
          <AppText variant="micro" color={colors.text.muted}>
            Ingresa el monto y meses para calcular la cuota mensual.
          </AppText>
        )}
      </View>

      {/* Optional Note */}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          Nota o fecha objetivo (opcional)
        </AppText>
        <AppTextInput
          testID="provision-notes-input"
          value={notes}
          onChangeText={setNotes}
          placeholder="Ej. Renovación en marzo, meta 2027-08"
        />
      </View>

      <FormMessage message={error} />

      <AppPressable
        testID="submit-provision-button"
        accessibilityRole="button"
        onPress={handleSubmit}
        style={{
          width: '100%',
          minHeight: minTouchTarget,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          ...primaryAction.container,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.provisions}>
          Guardar
        </AppText>
      </AppPressable>
    </View>
  );
});
