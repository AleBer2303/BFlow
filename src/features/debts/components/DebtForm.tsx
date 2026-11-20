/**
 * src/features/debts/components/DebtForm.tsx
 *
 * Form to register or edit a debt. It owns its field state, so typing re-renders only this
 * form and never the debt cards (same pattern as the checklist forms, R-17). The parent
 * mounts it with a new `key` each time it opens, which loads the values of `debt` (or an
 * empty form when it is null).
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  GlassSurface,
  hapticService,
  HeroAmountField,
  useAmountPrivacy,
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
  { id: 'monthly', label: 'Mensual (%)' },
  { id: 'annual', label: 'Anual (%)' },
] as const;

function initialInterestRate(debt: DebtFormDebt | null): string {
  if (!debt) return '';
  const value =
    debt.interestRateType === 'annual' && debt.annualInterestRate !== undefined
      ? debt.annualInterestRate
      : debt.monthlyInterestRate ?? 0;
  return value > 0 ? String(value) : '';
}

export const DebtForm = React.memo(function DebtForm({
  debt,
  onCreateDebt,
  onUpdateDebt,
  onClose,
}: DebtFormProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const { formatAmount } = useAmountPrivacy();

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

  const interestPreview = useMemo(() => {
    const cleanBalance = openingBalance.replace(/[^0-9]/g, '');
    const parsedBalance = cleanBalance ? Number(cleanBalance) : 0;
    const cleanRate = interestRate.replace(',', '.').trim();
    const parsedRate = cleanRate ? parseFloat(cleanRate) : 0;
    const maxAllowedRate = interestRateType === 'annual' ? 200 : 100;
    if (
      !Number.isSafeInteger(parsedBalance) ||
      parsedBalance <= 0 ||
      isNaN(parsedRate) ||
      parsedRate <= 0 ||
      parsedRate > maxAllowedRate
    ) {
      return null;
    }
    const monthlyRate = interestRateType === 'annual' ? parsedRate / 12 : parsedRate;
    const estimatedMonthlyInterest = Math.round(parsedBalance * (monthlyRate / 100));
    return {
      monthlyRate,
      estimatedMonthlyInterest,
    };
  }, [interestRate, interestRateType, openingBalance]);

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
          <AppText variant="title2">{debt ? 'Editar Deuda' : 'Registrar Nueva Deuda'}</AppText>
          <View
            style={{
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: colors.semantic.debtSoft,
            }}
          >
            <AppText variant="micro" color={colors.semantic.debt}>
              Deuda
            </AppText>
          </View>
        </View>

        {/* Single Interactive Hero Amount Input in semantic debt tone */}
        <HeroAmountField
          containerTestID="debt-form-hero-amount"
          inputTestID="debt-form-amount-input"
          label="Saldo inicial"
          tone="debt"
          value={openingBalance}
          onChangeText={(text) => {
            setOpeningBalance(text);
            if (error) setError(null);
          }}
        />

        {/* Name Input */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Nombre de la deuda
          </AppText>
          <AppTextInput
            testID="debt-form-name-input"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="Ej. Tarjeta de crédito, Préstamo personal"
          />
        </View>

        {/* Lender Input */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Acreedor o entidad
          </AppText>
          <AppTextInput
            testID="debt-form-lender-input"
            value={lender}
            onChangeText={(text) => {
              setLender(text);
              if (error) setError(null);
            }}
            placeholder="Ej. Banco, Entidad financiera, Familiar"
          />
        </View>

        {/* Interest Rate Type & Percentage */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Tasa de interés (opcional)
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.xxs,
              padding: spacing.xxs,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
            }}
          >
            {RATE_TYPE_OPTIONS.map((opt) => {
              const active = interestRateType === opt.id;
              return (
                <AppPressable
                  key={opt.id}
                  testID={`debt-form-rate-type-${opt.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticService.selection();
                    setInterestRateType(opt.id);
                    if (error) setError(null);
                  }}
                  style={{
                    flex: 1,
                    minHeight: minTouchTarget,
                    borderRadius: radius.sm,
                    borderCurve: 'continuous',
                    backgroundColor: active ? colors.semantic.debtSoft : 'transparent',
                    borderWidth: 1,
                    borderColor: active ? colors.semantic.debt : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="caption"
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
            onChangeText={(text) => {
              setInterestRate(text);
              if (error) setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={
              interestRateType === 'annual'
                ? 'Ej. 12.0 o 24.0 anual (vacío = 0%)'
                : 'Ej. 0.9 o 2.0 mensual (vacío = 0%)'
            }
          />
          {interestPreview ? (
            <AppText testID="debt-form-interest-preview" variant="micro" color={colors.semantic.debt}>
              {interestRateType === 'annual'
                ? `Interés mensual aprox.: ~ ${formatAmount(interestPreview.estimatedMonthlyInterest)} (${interestPreview.monthlyRate.toFixed(2)}% mes)`
                : `Interés mensual aprox.: ~ ${formatAmount(interestPreview.estimatedMonthlyInterest)}`}
            </AppText>
          ) : (
            <AppText variant="micro" color={colors.text.muted}>
              Sin cobro de interés (0 %). Se conserva mes a mes salvo edición.
            </AppText>
          )}
        </View>

        {/* Monthly Installment Input */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Cuota mensual pactada (opcional)
          </AppText>
          <AppTextInput
            testID="debt-form-installment-input"
            value={monthlyInstallment}
            onChangeText={(text) => {
              setMonthlyInstallment(text);
              if (error) setError(null);
            }}
            keyboardType="number-pad"
            placeholder="Ej. 500.000"
          />
        </View>

        <FormMessage message={error} />

        {/* Full-width Primary Action Button */}
        <AppPressable
          testID="debt-form-submit-button"
          accessibilityRole="button"
          onPress={handleSave}
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
          <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.debt}>
            Guardar Deuda
          </AppText>
        </AppPressable>
      </View>
    </GlassSurface>
  );
});
