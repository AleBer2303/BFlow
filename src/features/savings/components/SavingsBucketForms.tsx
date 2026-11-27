/**
 * src/features/savings/components/SavingsBucketForms.tsx
 *
 * Forms to create a savings fund and to edit an existing one. Each owns its field state, so
 * typing re-renders only the open form and never the fund cards or the provisions list
 * (same pattern as the checklist forms, R-17). The parent mounts them with a new `key` each
 * time they open. `SavingsBucketFields` is the body of a new fund, shared by the onboarding
 * (`NewSavingsBucketForm`) and the "+ Nuevo Ahorro" form of the Savings tab (`SavingsForm`).
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  GlassSurface,
  HeroAmountField,
  hapticService,
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

/** Fields and submit button of a new savings fund, without the card around them. */
export const SavingsBucketFields = React.memo(function SavingsBucketFields({
  onCreateSavingsBucket,
  onClose,
}: NewSavingsBucketFormProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
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
    setError(null);
    onCreateSavingsBucket?.(name.trim(), parsed);
    onClose();
  };

  return (
    <View style={{ gap: spacing.md }}>
      {/* Single Interactive Hero Amount Input in semantic savings tone */}
      <HeroAmountField
        containerTestID="new-bucket-hero-amount"
        inputTestID="new-bucket-balance-input"
        label="Saldo inicial"
        tone="savings"
        value={balance}
        onChangeText={(text) => {
          setBalance(text);
          if (error) setError(null);
        }}
      />

      {/* Fund Name Input */}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          Nombre del fondo
        </AppText>
        <AppTextInput
          testID="new-bucket-name-input"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (error) setError(null);
          }}
          placeholder="Ej. Fondo Viaje, Emergencias, Educación"
        />
        <AppText variant="micro" color={colors.text.muted}>
          Podrás vincular gastos del Checklist a este fondo para que sumen al pagarse.
        </AppText>
      </View>

      <FormMessage message={error} />

      <AppPressable
        testID="submit-new-bucket-button"
        accessibilityRole="button"
        onPress={handleCreate}
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
        <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.savings}>
          Guardar Fondo de Ahorro
        </AppText>
      </AppPressable>
    </View>
  );
});

/** Header of the savings forms: title and a soft badge in the kind's tone. */
export function SavingsFormHeader({
  title,
  badge,
  color,
  softColor,
}: {
  title: string;
  badge: string;
  color: string;
  softColor: string;
}): React.JSX.Element {
  const { spacing, radius } = useBFlowTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        flexWrap: 'wrap',
      }}
    >
      <AppText variant="title2">{title}</AppText>
      <View
        style={{
          paddingHorizontal: spacing.xs,
          paddingVertical: 2,
          borderRadius: radius.pill,
          backgroundColor: softColor,
        }}
      >
        <AppText variant="micro" color={color}>
          {badge}
        </AppText>
      </View>
    </View>
  );
}

/** New savings fund card (onboarding). */
export const NewSavingsBucketForm = React.memo(function NewSavingsBucketForm({
  onCreateSavingsBucket,
  onClose,
}: NewSavingsBucketFormProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  return (
    <GlassSurface elevated testID="add-savings-bucket-card">
      <View style={{ gap: spacing.md }}>
        <SavingsFormHeader
          title="Nuevo Fondo de Ahorro"
          badge="Ahorro"
          color={colors.semantic.savings}
          softColor={colors.semantic.savingsSoft}
        />
        <SavingsBucketFields onCreateSavingsBucket={onCreateSavingsBucket} onClose={onClose} />
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
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
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
    setError(null);
    onUpdateOpeningBalance?.(bucket.id, parsed, trimmedName);
    onClose();
  };

  return (
    <GlassSurface elevated testID="edit-savings-bucket-card">
      <View style={{ gap: spacing.md }}>
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
            {bucket.name ? `Editar ${bucket.name}` : 'Editar Fondo de Ahorro'}
          </AppText>
          <View
            style={{
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: colors.semantic.savingsSoft,
            }}
          >
            <AppText variant="micro" color={colors.semantic.savings}>
              Ahorro
            </AppText>
          </View>
        </View>

        {/* Single Interactive Hero Amount Input */}
        <HeroAmountField
          containerTestID="edit-bucket-hero-amount"
          inputTestID="edit-bucket-balance-input"
          label="Saldo inicial del mes"
          tone="savings"
          value={balance}
          onChangeText={(text) => {
            setBalance(text);
            if (error) setError(null);
          }}
        />

        {/* Fund Name Input */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Nombre del fondo
          </AppText>
          <AppTextInput
            testID="edit-bucket-name-input"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="Nombre del fondo"
          />
        </View>

        <FormMessage message={error} />

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppPressable
            testID="cancel-edit-bucket-button"
            accessibilityRole="button"
            accessibilityLabel="Cancelar edición de fondo"
            onPress={() => {
              hapticService.light();
              onClose();
            }}
            style={{
              flex: 1,
              minHeight: minTouchTarget,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="callout" color={colors.text.secondary}>
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
              minHeight: minTouchTarget,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              ...primaryAction.container,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.savings}>
              Guardar Saldo
            </AppText>
          </AppPressable>
        </View>
      </View>
    </GlassSurface>
  );
});
