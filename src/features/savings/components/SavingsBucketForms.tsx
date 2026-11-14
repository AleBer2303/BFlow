/**
 * src/features/savings/components/SavingsBucketForms.tsx
 *
 * Forms to create a savings fund and to edit an existing one. Each owns its field state, so
 * typing re-renders only the open form and never the fund cards or the provisions list
 * (same pattern as the checklist forms, R-17). The parent mounts them with a new `key` each
 * time they open.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import { formatGroupedIntegerInput } from '../../../domain';

/** Reads a grouped amount ("1.500.000"); null if it is not a safe non-negative integer. */
function parseBalanceInput(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, '');
  const parsed = digits ? Number(digits) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export interface NewSavingsBucketFormProps {
  onCreateSavingsBucket?: (name: string, openingBalanceCop: number) => void;
  onClose: () => void;
}

export const NewSavingsBucketForm = React.memo(function NewSavingsBucketForm({
  onCreateSavingsBucket,
  onClose,
}: NewSavingsBucketFormProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!name.trim()) {
      setError('Escribe el nombre del nuevo fondo de ahorro.');
      return;
    }
    const parsed = parseBalanceInput(balance);
    if (parsed === null) {
      setError('Ingresa un saldo inicial entero válido.');
      return;
    }
    onCreateSavingsBucket?.(name.trim(), parsed);
    onClose();
  };

  return (
    <GlassSurface elevated testID="add-savings-bucket-card">
      <View style={{ gap: spacing.sm }}>
        <AppText variant="headline">Crear Nuevo Fondo de Ahorro</AppText>
        <AppText variant="micro" color={colors.text.secondary}>
          Podrás vincular cualquier gasto de tu Checklist a este fondo para que sume automáticamente al marcarlo como pagado.
        </AppText>

        <AppTextInput
          testID="new-bucket-name-input"
          value={name}
          onChangeText={setName}
          placeholder="Nombre del fondo (ej. Fondo Viaje, Emergencias)"
        />

        <AppTextInput
          testID="new-bucket-balance-input"
          value={balance}
          onChangeText={setBalance}
          keyboardType="number-pad"
          placeholder="Saldo actual o del mes anterior (ej. 500.000)"
        />

        <FormMessage message={error} />

        <AppPressable
          testID="submit-new-bucket-button"
          accessibilityRole="button"
          onPress={handleCreate}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            ...primaryAction.container,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="body" color={primaryAction.labelColor ?? colors.semantic.income}>
            Guardar Fondo de Ahorro
          </AppText>
        </AppPressable>
      </View>
    </GlassSurface>
  );
});

export interface EditableSavingsBucket {
  id: string;
  name: string;
  openingBalance: number;
}

export interface EditSavingsBucketFormProps {
  bucket: EditableSavingsBucket;
  onUpdateOpeningBalance?: (bucketId: string, newBalanceCop: number, bucketName?: string) => void;
  onClose: () => void;
}

export const EditSavingsBucketForm = React.memo(function EditSavingsBucketForm({
  bucket,
  onUpdateOpeningBalance,
  onClose,
}: EditSavingsBucketFormProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const [name, setName] = useState(bucket.name);
  const [balance, setBalance] = useState(() => formatGroupedIntegerInput(bucket.openingBalance));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Escribe el nombre del fondo de ahorro.');
      return;
    }
    const parsed = parseBalanceInput(balance);
    if (parsed === null) {
      setError('Ingresa un saldo entero válido para el fondo.');
      return;
    }
    onUpdateOpeningBalance?.(bucket.id, parsed, trimmedName);
    onClose();
  };

  return (
    <GlassSurface elevated testID="edit-savings-bucket-card">
      <View style={{ gap: spacing.sm }}>
        <AppText variant="headline">
          {bucket.name ? `Editar ${bucket.name}` : 'Editar Fondo de Ahorro'}
        </AppText>
        <AppText variant="micro" color={colors.text.secondary}>
          Edita el nombre o el saldo actual/del mes anterior con el que inicia este fondo.
        </AppText>

        <AppTextInput
          testID="edit-bucket-name-input"
          value={name}
          onChangeText={setName}
          placeholder="Nombre del fondo"
        />

        <AppTextInput
          testID="edit-bucket-balance-input"
          value={balance}
          onChangeText={setBalance}
          keyboardType="number-pad"
          placeholder="0"
        />

        <FormMessage message={error} />

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppPressable
            testID="cancel-edit-bucket-button"
            accessibilityRole="button"
            accessibilityLabel="Cancelar edición de fondo"
            onPress={onClose}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET_PT,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="body" color={colors.text.secondary}>
              Cancelar
            </AppText>
          </AppPressable>

          <AppPressable
            testID="save-edit-bucket-button"
            accessibilityRole="button"
            accessibilityLabel="Guardar Saldos"
            onPress={handleSave}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET_PT,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.specularBorder,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="body" color={colors.semantic.income}>
              Guardar Saldo
            </AppText>
          </AppPressable>
        </View>
      </View>
    </GlassSurface>
  );
});
