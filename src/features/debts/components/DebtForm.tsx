/**
 * src/features/debts/components/DebtForm.tsx
 *
 * Form of "+ Nueva Deuda": registers or edits a debt, a credit card or a debit account
 * (ADR 0034). When registering, a segmented control (like Gasto / Ingreso in "Nuevo
 * Movimiento") picks Deuda, Crédito or Débito (checking accounts only: savings accounts are
 * registered in Ahorros). Each kind's fields own their state, so typing
 * re-renders only this form and never the cards (R-17). The parent mounts it with a new `key`
 * each time it opens, which loads the values of `debt` or `account` (or an empty form).
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
  type FinancialAccount,
  type FinancialAccountType,
  type FunfamiDebtSummary,
} from '../../../domain';
import type {
  FinancialAccountInput,
  FinancialAccountUpdates,
} from '../../budget/store/useBudgetStore';
import { FinancialAccountFormFields } from '../../accounts/components/FinancialAccountFormFields';

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

export type ObligationKind = 'debt' | FinancialAccountType;

export interface DebtFormProps {
  /** Debt being edited; null registers a new one. */
  debt: DebtFormDebt | null;
  /** Card or account being edited (ADR 0034); ignored when `debt` is set. */
  account?: FinancialAccount | null;
  onCreateDebt?: (input: CreateDebtInput) => void;
  onUpdateDebt?: (debtId: string, updates: UpdateDebtInput) => void;
  /** Without it the Crédito / Débito options are not offered. */
  onCreateAccount?: (input: FinancialAccountInput) => void;
  onUpdateAccount?: (accountId: string, updates: FinancialAccountUpdates) => void;
  onClose: () => void;
}

const OBLIGATION_KIND_OPTIONS = [
  { kind: 'debt', label: 'Deuda' },
  { kind: 'credit', label: 'Crédito' },
  { kind: 'debit', label: 'Débito' },
] as const;

const KIND_COPY: Record<ObligationKind, { create: string; edit: string; badge: string }> = {
  debt: { create: 'Registrar Nueva Deuda', edit: 'Editar Deuda', badge: 'Deuda' },
  credit: {
    create: 'Registrar Tarjeta de Crédito',
    edit: 'Editar Tarjeta de Crédito',
    badge: 'Crédito',
  },
  // Savings accounts live in Ahorros (+ Nuevo Ahorro); Deudas only registers checking accounts.
  debit: {
    create: 'Registrar Cuenta Corriente',
    edit: 'Editar Cuenta Corriente',
    badge: 'Débito · Corriente',
  },
};

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

interface DebtFormFieldsProps {
  debt: DebtFormDebt | null;
  onCreateDebt?: (input: CreateDebtInput) => void;
  onUpdateDebt?: (debtId: string, updates: UpdateDebtInput) => void;
  onClose: () => void;
}

const DebtFormFields = React.memo(function DebtFormFields({
  debt,
  onCreateDebt,
  onUpdateDebt,
  onClose,
}: DebtFormFieldsProps): React.JSX.Element {
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
    <View style={{ gap: spacing.md }}>
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
  );
});

export const DebtForm = React.memo(function DebtForm({
  debt,
  account = null,
  onCreateDebt,
  onUpdateDebt,
  onCreateAccount,
  onUpdateAccount,
  onClose,
}: DebtFormProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const editingAccount = debt ? null : account;
  const isEditing = Boolean(debt || editingAccount);
  const [kind, setKind] = useState<ObligationKind>(() => editingAccount?.type ?? 'debt');
  const canPickKind = !isEditing && Boolean(onCreateAccount);

  const toneByKind: Record<ObligationKind, { color: string; soft: string }> = {
    debt: { color: colors.semantic.debt, soft: colors.semantic.debtSoft },
    credit: { color: colors.semantic.savings, soft: colors.semantic.savingsSoft },
    debit: { color: colors.semantic.provisions, soft: colors.semantic.provisionsSoft },
  };
  const tone = toneByKind[kind];
  const copy = KIND_COPY[kind];

  const handleSubmitAccount = (input: FinancialAccountInput) => {
    if (editingAccount) {
      const { type: _type, ...updates } = input;
      onUpdateAccount?.(editingAccount.id, updates);
    } else {
      onCreateAccount?.(input);
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
          <AppText variant="title2">{isEditing ? copy.edit : copy.create}</AppText>
          <View
            style={{
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: tone.soft,
            }}
          >
            <AppText variant="micro" color={tone.color}>
              {copy.badge}
            </AppText>
          </View>
        </View>

        {/* Segmented kind: Deuda · Crédito · Débito (as Gasto / Ingreso in Nuevo Movimiento) */}
        {canPickKind ? (
          <View
            testID="obligation-kind-selector"
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
            {OBLIGATION_KIND_OPTIONS.map((opt) => {
              const isSelected = kind === opt.kind;
              const optTone = toneByKind[opt.kind];
              return (
                <AppPressable
                  key={opt.kind}
                  testID={`obligation-kind-${opt.kind}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    hapticService.selection();
                    setKind(opt.kind);
                  }}
                  style={{
                    flex: 1,
                    minHeight: minTouchTarget,
                    borderRadius: radius.sm,
                    borderCurve: 'continuous',
                    backgroundColor: isSelected ? optTone.soft : 'transparent',
                    borderWidth: 1,
                    borderColor: isSelected ? optTone.color : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="callout"
                    color={isSelected ? optTone.color : colors.text.secondary}
                  >
                    {opt.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
        ) : null}

        {kind === 'debt' ? (
          <DebtFormFields
            debt={debt}
            onCreateDebt={onCreateDebt}
            onUpdateDebt={onUpdateDebt}
            onClose={onClose}
          />
        ) : (
          <FinancialAccountFormFields
            key={kind}
            accountType={kind}
            debitKind="checking"
            account={editingAccount}
            onSubmit={handleSubmitAccount}
          />
        )}
      </View>
    </GlassSurface>
  );
});
