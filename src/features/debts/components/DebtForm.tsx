/**
 * src/features/debts/components/DebtForm.tsx
 *
 * Form to register or edit a debt. It owns its field state, so typing re-renders only this
 * form and never the debt cards (same pattern as the checklist forms, R-17). The parent
 * mounts it with a new `key` each time it opens, which loads the values of `debt` (or an
 * empty form when it is null).
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
import {
  formatGroupedIntegerInput,
  type DebtInterestRateType,
  type DebtSummaryResult,
  type FunfamiDebtSummary,
} from '../../../domain';

export interface CreateDebtInput {
  name: string;
  lender: string;
  openingBalance: number;
  monthlyInterestRate?: number;
  annualInterestRate?: number;
  interestRateType?: DebtInterestRateType;
  monthlyInstallment?: number;
}

export interface UpdateDebtInput {
  name?: string;
  lender?: string;
  openingBalance?: number;
  monthlyInterestRate?: number;
  annualInterestRate?: number;
  interestRateType?: DebtInterestRateType;
  monthlyInstallment?: number;
}

export type DebtFormDebt = (FunfamiDebtSummary | DebtSummaryResult)['debts'][number];

export interface DebtFormProps {
  /** Debt being edited; null registers a new one. */
  debt: DebtFormDebt | null;
  onCreateDebt?: (input: CreateDebtInput) => void;
  onUpdateDebt?: (debtId: string, updates: UpdateDebtInput) => void;
  onClose: () => void;
}

const RATE_TYPE_OPTIONS = [
  { id: 'monthly', label: 'Interés Mensual (%)' },
  { id: 'annual', label: 'Interés Anual (%)' },
] as const;

function initialInterestRate(debt: DebtFormDebt | null): string {
  if (!debt) return '0';
  if (debt.interestRateType === 'annual' && debt.annualInterestRate !== undefined) {
    return String(debt.annualInterestRate);
  }
  return debt.monthlyInterestRate !== undefined ? String(debt.monthlyInterestRate) : '0';
}

export const DebtForm = React.memo(function DebtForm({
  debt,
  onCreateDebt,
  onUpdateDebt,
  onClose,
}: DebtFormProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  const [name, setName] = useState(() => debt?.name ?? '');
  const [lender, setLender] = useState(() => debt?.lender ?? '');
  const [openingBalance, setOpeningBalance] = useState(() =>
    debt ? formatGroupedIntegerInput(debt.openingBalance) : ''
  );
  const [interestRate, setInterestRate] = useState(() => initialInterestRate(debt));
  const [interestRateType, setInterestRateType] = useState<DebtInterestRateType>(
    () => debt?.interestRateType ?? 'monthly'
  );
  const [monthlyInstallment, setMonthlyInstallment] = useState(() =>
    debt?.monthlyInstallment !== undefined && debt.monthlyInstallment > 0
      ? formatGroupedIntegerInput(debt.monthlyInstallment)
      : ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) {
      setError('Escribe el nombre de la deuda.');
      return;
    }
    if (!lender.trim()) {
      setError('Escribe la entidad o persona acreedora.');
      return;
    }
    const cleanBalance = openingBalance.replace(/[^0-9]/g, '');
    const parsedBalance = cleanBalance ? Number(cleanBalance) : 0;
    if (!Number.isSafeInteger(parsedBalance) || parsedBalance <= 0) {
      setError('Ingresa un saldo inicial válido.');
      return;
    }

    const cleanRate = interestRate.replace(',', '.').trim();
    const parsedRate = cleanRate ? parseFloat(cleanRate) : 0;
    const maxAllowedRate = interestRateType === 'annual' ? 200 : 100;
    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > maxAllowedRate) {
      setError(`La tasa de interés debe ser entre 0% y ${maxAllowedRate}%.`);
      return;
    }

    const cleanInstallment = monthlyInstallment.replace(/[^0-9]/g, '');
    const parsedInstallment = cleanInstallment ? Number(cleanInstallment) : 0;

    const input: CreateDebtInput = {
      name: name.trim(),
      lender: lender.trim(),
      openingBalance: parsedBalance,
      monthlyInterestRate:
        interestRateType === 'annual' ? Number((parsedRate / 12).toFixed(4)) : parsedRate,
      annualInterestRate:
        interestRateType === 'annual' ? parsedRate : Number((parsedRate * 12).toFixed(4)),
      interestRateType,
      monthlyInstallment: parsedInstallment,
    };

    setError(null);
    if (debt) {
      onUpdateDebt?.(debt.debtId, input);
    } else {
      onCreateDebt?.(input);
    }
    onClose();
  };

  return (
    <GlassSurface elevated testID="debt-form-modal">
      <View style={{ gap: spacing.sm }}>
        <AppText variant="title2">{debt ? 'Editar Deuda' : 'Registrar Nueva Deuda'}</AppText>

        <View style={{ gap: spacing.xxs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Nombre de la deuda
          </AppText>
          <AppTextInput
            testID="debt-form-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Ej. Tarjeta de crédito, Préstamo personal"
          />
        </View>

        <View style={{ gap: spacing.xxs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Acreedor / Entidad
          </AppText>
          <AppTextInput
            testID="debt-form-lender-input"
            value={lender}
            onChangeText={setLender}
            placeholder="Ej. Banco, Entidad financiera, Familiar"
          />
        </View>

        <View style={{ gap: spacing.xxs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Saldo inicial
          </AppText>
          <AppTextInput
            testID="debt-form-amount-input"
            value={openingBalance}
            onChangeText={setOpeningBalance}
            keyboardType="number-pad"
            placeholder="Ej. 2.500.000"
          />
        </View>

        <View style={{ gap: spacing.xxs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Tipo y porcentaje de interés:
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {RATE_TYPE_OPTIONS.map((opt) => {
              const active = interestRateType === opt.id;
              return (
                <AppPressable
                  key={opt.id}
                  testID={`debt-form-rate-type-${opt.id}`}
                  accessibilityRole="button"
                  onPress={() => setInterestRateType(opt.id)}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: radius.md,
                    backgroundColor: active ? colors.semantic.debtSoft : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="micro"
                    color={active ? colors.semantic.debt : colors.text.secondary}
                  >
                    {opt.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
          <AppTextInput
            testID="debt-form-interest-rate-input"
            value={interestRate}
            onChangeText={setInterestRate}
            keyboardType="decimal-pad"
            placeholder={
              interestRateType === 'annual'
                ? 'Ej. 12.0 o 24.0 anual (0 si no cobra interés)'
                : 'Ej. 0.9 o 2.0 mensual (0 si no cobra interés)'
            }
          />
          <AppText variant="micro" color={colors.text.muted}>
            Se conserva mes a mes y entre sesiones a menos que lo edites directamente.
          </AppText>
        </View>

        <View style={{ gap: spacing.xxs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Cuota mensual pactada que aportas a esta deuda (opcional)
          </AppText>
          <AppTextInput
            testID="debt-form-installment-input"
            value={monthlyInstallment}
            onChangeText={setMonthlyInstallment}
            keyboardType="number-pad"
            placeholder="Ej. 500.000"
          />
        </View>

        <FormMessage message={error} />

        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            justifyContent: 'flex-end',
            paddingTop: spacing.xs,
          }}
        >
          <AppPressable
            testID="debt-form-submit-button"
            accessibilityRole="button"
            onPress={handleSave}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              ...primaryAction.container,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.income}>
              Guardar Deuda
            </AppText>
          </AppPressable>
        </View>
      </View>
    </GlassSurface>
  );
});
