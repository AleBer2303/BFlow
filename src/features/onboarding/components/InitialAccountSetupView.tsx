/**
 * src/features/onboarding/components/InitialAccountSetupView.tsx
 *
 * Guided initial account setup wizard for first-time users and after a full account reset:
 * 1. Starting Month & Year (`YYYY-MM`)
 * 2. Fixed/Variable Incomes & Expenses (with month-to-month persistence toggle and debt/savings linkage)
 * 3. Debts (opening balance, monthly/annual interest rate, and monthly installment)
 * 4. Savings Funds (current/previous-month balances + custom funds)
 * 5. Optional Provisions & Goals
 */

import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCop,
  formatMonthKeyLabelEs,
  toBogotaMonthKey,
  type ConceptGroup,
  type DebtInterestRateType,
} from '../../../domain';
import type { InitialOnboardingConfigInput } from '../../budget/store/useBudgetStore';

export interface InitialAccountSetupViewProps {
  defaultMonthKey?: string;
  onCompleteSetup: (config: InitialOnboardingConfigInput) => void;
}

const MONTH_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export function InitialAccountSetupView({
  defaultMonthKey,
  onCompleteSetup,
}: InitialAccountSetupViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  const currentYear = toBogotaMonthKey().slice(0, 4);
  const initialMk =
    defaultMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(defaultMonthKey)
      ? defaultMonthKey
      : `${currentYear}-01`;
  const [selectedYear, setSelectedYear] = useState(initialMk.slice(0, 4));
  const [selectedMonth, setSelectedMonth] = useState(initialMk.slice(5, 7));

  const computedMonthKey = `${/^\d{4}$/.test(selectedYear.trim()) ? selectedYear.trim() : currentYear}-${selectedMonth}`;

  // 1. Incomes state
  const [incomes, setIncomes] = useState<InitialOnboardingConfigInput['incomes']>([]);
  const [incName, setIncName] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incGroup, setIncGroup] = useState<ConceptGroup>('fixed');
  const [incPersist, setIncPersist] = useState(true);

  // 2. Debts state
  const [debts, setDebts] = useState<InitialOnboardingConfigInput['debts']>([]);
  const [debtName, setDebtName] = useState('');
  const [debtLender, setDebtLender] = useState('');
  const [debtBalance, setDebtBalance] = useState('');
  const [debtRate, setDebtRate] = useState('');
  const [debtRateType, setDebtRateType] = useState<DebtInterestRateType>('monthly');
  const [debtInstallment, setDebtInstallment] = useState('');

  // 3. Savings buckets state (new users start with 0 pre-loaded funds and only add the funds they want)
  const [savingsBuckets, setSavingsBuckets] = useState<
    InitialOnboardingConfigInput['savingsBuckets']
  >([]);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketBalance, setNewBucketBalance] = useState('');

  // 4. Expenses state
  const [expenses, setExpenses] = useState<InitialOnboardingConfigInput['expenses']>([]);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expGroup, setExpGroup] = useState<ConceptGroup>('fixed');
  const [expPersist, setExpPersist] = useState(true);
  const [expDebtKey, setExpDebtKey] = useState<string | null>(null);
  const [expBucketKey, setExpBucketKey] = useState<string | null>(null);

  // 5. Provisions state
  const [provisions, setProvisions] = useState<
    NonNullable<InitialOnboardingConfigInput['provisions']>
  >([]);
  const [provName, setProvName] = useState('');
  const [provAmount, setProvAmount] = useState('');
  const [provMonths, setProvMonths] = useState('12');
  const [provKind, setProvKind] = useState<'recurring' | 'target_goal'>('recurring');

  const handleAddIncome = () => {
    const parsedAmount = Number.parseInt(incAmount.replace(/\D/g, ''), 10);
    if (!incName.trim() || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      return;
    }
    setIncomes((prev) => [
      ...prev,
      {
        name: incName.trim(),
        amountCop: parsedAmount,
        group: incGroup,
        persistMonthly: incPersist,
      },
    ]);
    setIncName('');
    setIncAmount('');
  };

  const handleAddDebt = () => {
    const parsedBalance = Number.parseInt(debtBalance.replace(/\D/g, ''), 10);
    if (!debtName.trim() || !Number.isSafeInteger(parsedBalance) || parsedBalance <= 0) {
      return;
    }
    const parsedRate = Number.parseFloat(debtRate.replace(',', '.'));
    const parsedInstallment = Number.parseInt(debtInstallment.replace(/\D/g, ''), 10);
    const key = `debt_${Date.now().toString(36)}_${debts.length + 1}`;
    setDebts((prev) => [
      ...prev,
      {
        key,
        name: debtName.trim(),
        lender: debtLender.trim() || 'Acreedor',
        openingBalanceCop: parsedBalance,
        ...(Number.isFinite(parsedRate) && parsedRate >= 0
          ? { interestRate: parsedRate, interestRateType: debtRateType }
          : {}),
        ...(Number.isSafeInteger(parsedInstallment) && parsedInstallment > 0
          ? { monthlyInstallmentCop: parsedInstallment }
          : {}),
      },
    ]);
    setDebtName('');
    setDebtLender('');
    setDebtBalance('');
    setDebtRate('');
    setDebtInstallment('');
  };

  const handleUpdateBucketBalance = (bucketId: string, rawText: string) => {
    const parsed = Number.parseInt(rawText.replace(/\D/g, ''), 10);
    const safeBalance = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    setSavingsBuckets((prev) =>
      prev.map((b) => (b.id === bucketId ? { ...b, openingBalanceCop: safeBalance } : b))
    );
  };

  const handleAddCustomBucket = () => {
    if (!newBucketName.trim()) {
      return;
    }
    const parsed = Number.parseInt(newBucketBalance.replace(/\D/g, ''), 10);
    const safeBalance = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    const slug = newBucketName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const id = `bucket_${slug || Date.now().toString(36)}`;
    setSavingsBuckets((prev) => [
      ...prev,
      {
        id,
        name: newBucketName.trim(),
        openingBalanceCop: safeBalance,
      },
    ]);
    setNewBucketName('');
    setNewBucketBalance('');
  };

  const handleAddExpense = () => {
    const parsedAmount = Number.parseInt(expAmount.replace(/\D/g, ''), 10);
    if (!expName.trim() || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      return;
    }
    setExpenses((prev) => [
      ...prev,
      {
        name: expName.trim(),
        amountCop: parsedAmount,
        group: expGroup,
        persistMonthly: expPersist,
        targetDebtKey: expDebtKey,
        savingsBucketKey: expBucketKey,
      },
    ]);
    setExpName('');
    setExpAmount('');
    setExpDebtKey(null);
    setExpBucketKey(null);
  };

  const handleAddProvision = () => {
    const parsedAmount = Number.parseInt(provAmount.replace(/\D/g, ''), 10);
    const parsedMonths = Number.parseInt(provMonths.replace(/\D/g, ''), 10);
    if (!provName.trim() || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      return;
    }
    setProvisions((prev) => [
      ...prev,
      {
        name: provName.trim(),
        amountCop: parsedAmount,
        periodMonths: Number.isSafeInteger(parsedMonths) && parsedMonths >= 1 ? parsedMonths : 12,
        priority: '1. Alta',
        kind: provKind,
      },
    ]);
    setProvName('');
    setProvAmount('');
    setProvMonths('12');
  };

  const handleFinishSetup = () => {
    onCompleteSetup({
      monthKey: computedMonthKey,
      incomes,
      expenses,
      debts,
      savingsBuckets,
      provisions,
    });
  };

  return (
    <View style={{ gap: spacing.md }} testID="initial-account-setup-view">
      {/* Header Card */}
      <GlassSurface elevated>
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            <AppText variant="title2">Configura tu Cuenta BFlow</AppText>
            <StatusBadge label={formatMonthKeyLabelEs(computedMonthKey)} status="info" />
          </View>
          <AppText variant="caption" color={colors.text.secondary}>
            Personaliza tu mes de inicio, tus ingresos y gastos del checklist, tus deudas con
            intereses/cuotas y tus fondos de ahorro. Podrás editar o agregar más elementos en
            cualquier momento.
          </AppText>
        </View>
      </GlassSurface>

      {/* Step 1: Month & Year */}
      <GlassSurface elevated testID="onboarding-month-section">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="headline">1. Mes y Año de Inicio</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Año:
            </AppText>
            <TextInput
              testID="onboarding-year-input"
              value={selectedYear}
              onChangeText={setSelectedYear}
              keyboardType="numeric"
              maxLength={4}
              placeholder="2026"
              placeholderTextColor={colors.text.muted}
              style={{
                minWidth: 96,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {MONTH_OPTIONS.map((m) => {
              const active = selectedMonth === m.value;
              return (
                <Pressable
                  key={m.value}
                  testID={`onboarding-month-chip-${m.value}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedMonth(m.value)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: active
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                    justifyContent: 'center',
                  }}
                >
                  <AppText variant="caption">{m.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </GlassSurface>

      {/* Step 2: Savings Funds */}
      <GlassSurface elevated testID="onboarding-savings-section">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="headline">2. Fondos de Ahorro y Saldos Iniciales</AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            Agrega uno o varios fondos de ahorro si cuentas con ellos e indica su saldo actual o del
            mes anterior para poder vincularles movimientos.
          </AppText>

          {savingsBuckets.map((bucket, idx) => (
            <View
              key={bucket.id ?? `${bucket.name}-${idx}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.xs,
              }}
            >
              <AppText variant="body" style={{ flex: 1 }}>
                {bucket.name}
              </AppText>
              <TextInput
                testID={`onboarding-bucket-balance-${bucket.id}`}
                value={bucket.openingBalanceCop > 0 ? String(bucket.openingBalanceCop) : ''}
                onChangeText={(txt) => handleUpdateBucketBalance(bucket.id ?? 'savings', txt)}
                keyboardType="numeric"
                placeholder="Saldo actual COP (0)"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <Pressable
                testID={`onboarding-remove-bucket-${bucket.id}`}
                accessibilityRole="button"
                onPress={() => {
                  const removedId = bucket.id;
                  setSavingsBuckets((prev) => prev.filter((_, i) => i !== idx));
                  if (removedId && expBucketKey === removedId) {
                    setExpBucketKey(null);
                  }
                }}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  Quitar
                </AppText>
              </Pressable>
            </View>
          ))}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <TextInput
              testID="onboarding-new-bucket-name-input"
              value={newBucketName}
              onChangeText={setNewBucketName}
              placeholder="Nuevo fondo (ej. Fondo Viaje)"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 150,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <TextInput
              testID="onboarding-new-bucket-balance-input"
              value={newBucketBalance}
              onChangeText={setNewBucketBalance}
              keyboardType="numeric"
              placeholder="Saldo inicial COP"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 130,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <Pressable
              testID="onboarding-add-bucket-button"
              accessibilityRole="button"
              onPress={handleAddCustomBucket}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.savingsSoft,
                borderWidth: 1,
                borderColor: colors.semantic.savings,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.semantic.savings}>
                + Agregar Fondo
              </AppText>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      {/* Step 3: Debts */}
      <GlassSurface elevated testID="onboarding-debts-section">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="headline">3. Deudas, Intereses y Cuotas Mensuales</AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            Si indicas una cuota mensual, se agregará automáticamente al checklist vinculada a esa
            deuda para descontarla cada vez que la marques como pagada.
          </AppText>

          {debts.map((d, idx) => (
            <View
              key={d.key ?? `${d.name}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: spacing.xs,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="body">{`${d.name} (${d.lender})`}</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  {`Saldo: ${formatCop(d.openingBalanceCop)}${
                    d.interestRate !== undefined
                      ? ` · Interés ${d.interestRateType === 'annual' ? 'anual' : 'mensual'}: ${d.interestRate}%`
                      : ''
                  }${
                    d.monthlyInstallmentCop ? ` · Cuota: ${formatCop(d.monthlyInstallmentCop)}/mes` : ''
                  }`}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDebts((prev) => prev.filter((_, i) => i !== idx))}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  Quitar
                </AppText>
              </Pressable>
            </View>
          ))}

          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <TextInput
                testID="onboarding-debt-name-input"
                value={debtName}
                onChangeText={setDebtName}
                placeholder="Nombre de la deuda (ej. Crédito Moto)"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minWidth: 160,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <TextInput
                testID="onboarding-debt-lender-input"
                value={debtLender}
                onChangeText={setDebtLender}
                placeholder="Entidad (ej. FUNFAMI / Banco)"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minWidth: 140,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <TextInput
                testID="onboarding-debt-balance-input"
                value={debtBalance}
                onChangeText={setDebtBalance}
                keyboardType="numeric"
                placeholder="Saldo actual deuda COP"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minWidth: 150,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <TextInput
                testID="onboarding-debt-installment-input"
                value={debtInstallment}
                onChangeText={setDebtInstallment}
                keyboardType="numeric"
                placeholder="Cuota mensual COP (opcional)"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minWidth: 150,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Pressable
                testID="onboarding-debt-rate-monthly"
                accessibilityRole="button"
                onPress={() => setDebtRateType('monthly')}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor:
                    debtRateType === 'monthly'
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor:
                    debtRateType === 'monthly'
                      ? colors.glass.specularBorder
                      : colors.glass.subtleBorder,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption">Interés Mensual (%)</AppText>
              </Pressable>
              <Pressable
                testID="onboarding-debt-rate-annual"
                accessibilityRole="button"
                onPress={() => setDebtRateType('annual')}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor:
                    debtRateType === 'annual'
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor:
                    debtRateType === 'annual'
                      ? colors.glass.specularBorder
                      : colors.glass.subtleBorder,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption">Interés Anual (% E.A.)</AppText>
              </Pressable>
              <TextInput
                testID="onboarding-debt-rate-input"
                value={debtRate}
                onChangeText={setDebtRate}
                keyboardType="decimal-pad"
                placeholder="Tasa % (ej. 0.5)"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minWidth: 110,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <Pressable
                testID="onboarding-add-debt-button"
                accessibilityRole="button"
                onPress={handleAddDebt}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.semantic.debtSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.debt,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.debt}>
                  + Agregar Deuda
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </GlassSurface>

      {/* Step 4: Incomes */}
      <GlassSurface elevated testID="onboarding-incomes-section">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="headline">4. Ingresos Fijos y Variables</AppText>

          {incomes.map((inc, idx) => (
            <View
              key={`${inc.name}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: spacing.xs,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="body">{inc.name}</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  {`${inc.group === 'fixed' ? 'Ingreso Fijo' : 'Ingreso Variable'} · ${
                    inc.persistMonthly ? 'Persiste cada mes' : 'Solo este mes'
                  }`}
                </AppText>
              </View>
              <CurrencyText amount={inc.amountCop} variant="caption" tone="income" />
              <Pressable
                accessibilityRole="button"
                onPress={() => setIncomes((prev) => prev.filter((_, i) => i !== idx))}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  Quitar
                </AppText>
              </Pressable>
            </View>
          ))}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <TextInput
              testID="onboarding-income-name-input"
              value={incName}
              onChangeText={setIncName}
              placeholder="Concepto de ingreso (ej. Salario)"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 160,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <TextInput
              testID="onboarding-income-amount-input"
              value={incAmount}
              onChangeText={setIncAmount}
              keyboardType="numeric"
              placeholder="Valor COP"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 120,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Pressable
              testID="onboarding-income-group-fixed"
              accessibilityRole="button"
              onPress={() => setIncGroup('fixed')}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor:
                  incGroup === 'fixed'
                    ? colors.glass.surfaceElevatedTint
                    : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor:
                  incGroup === 'fixed' ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">Fijo</AppText>
            </Pressable>
            <Pressable
              testID="onboarding-income-group-variable"
              accessibilityRole="button"
              onPress={() => setIncGroup('variable')}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor:
                  incGroup === 'variable'
                    ? colors.glass.surfaceElevatedTint
                    : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor:
                  incGroup === 'variable' ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">Variable</AppText>
            </Pressable>
            <Pressable
              testID="onboarding-income-persist-toggle"
              accessibilityRole="button"
              onPress={() => setIncPersist((v) => !v)}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: incPersist
                  ? colors.glass.surfaceElevatedTint
                  : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: incPersist ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">
                {incPersist ? 'Persiste cada mes' : 'Solo este mes'}
              </AppText>
            </Pressable>
            <Pressable
              testID="onboarding-add-income-button"
              accessibilityRole="button"
              onPress={handleAddIncome}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.incomeSoft,
                borderWidth: 1,
                borderColor: colors.semantic.income,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.semantic.income}>
                + Agregar Ingreso
              </AppText>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      {/* Step 5: Expenses */}
      <GlassSurface elevated testID="onboarding-expenses-section">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="headline">5. Gastos Fijos y Variables (Checklist)</AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            Puedes vincular cualquier gasto a una deuda o a un fondo de ahorro y elegir si persiste
            mes a mes.
          </AppText>

          {expenses.map((exp, idx) => (
            <View
              key={`${exp.name}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: spacing.xs,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="body">{exp.name}</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  {`${exp.group === 'fixed' ? 'Gasto Fijo' : 'Gasto Variable'} · ${
                    exp.persistMonthly ? 'Persiste cada mes' : 'Solo este mes'
                  }`}
                </AppText>
              </View>
              <CurrencyText amount={exp.amountCop} variant="caption" tone="expense" />
              <Pressable
                accessibilityRole="button"
                onPress={() => setExpenses((prev) => prev.filter((_, i) => i !== idx))}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  Quitar
                </AppText>
              </Pressable>
            </View>
          ))}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <TextInput
              testID="onboarding-expense-name-input"
              value={expName}
              onChangeText={setExpName}
              placeholder="Concepto de gasto (ej. Arriendo / Ahorro)"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 160,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <TextInput
              testID="onboarding-expense-amount-input"
              value={expAmount}
              onChangeText={setExpAmount}
              keyboardType="numeric"
              placeholder="Valor COP"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 120,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Pressable
              testID="onboarding-expense-group-fixed"
              accessibilityRole="button"
              onPress={() => setExpGroup('fixed')}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor:
                  expGroup === 'fixed'
                    ? colors.glass.surfaceElevatedTint
                    : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor:
                  expGroup === 'fixed' ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">Fijo</AppText>
            </Pressable>
            <Pressable
              testID="onboarding-expense-group-variable"
              accessibilityRole="button"
              onPress={() => setExpGroup('variable')}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor:
                  expGroup === 'variable'
                    ? colors.glass.surfaceElevatedTint
                    : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor:
                  expGroup === 'variable' ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">Variable</AppText>
            </Pressable>
            <Pressable
              testID="onboarding-expense-persist-toggle"
              accessibilityRole="button"
              onPress={() => setExpPersist((v) => !v)}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: expPersist
                  ? colors.glass.surfaceElevatedTint
                  : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: expPersist ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">
                {expPersist ? 'Persiste cada mes' : 'Solo este mes'}
              </AppText>
            </Pressable>
          </View>

          {/* Optional Savings Bucket Link */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpBucketKey(null)}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor:
                  expBucketKey === null
                    ? colors.glass.surfaceElevatedTint
                    : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor:
                  expBucketKey === null ? colors.glass.specularBorder : colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="micro">Sin fondo de ahorro</AppText>
            </Pressable>
            {savingsBuckets.map((b) => (
              <Pressable
                key={b.id ?? b.name}
                testID={`onboarding-expense-bucket-${b.id}`}
                accessibilityRole="button"
                onPress={() => setExpBucketKey(b.id ?? b.name)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor:
                    expBucketKey === (b.id ?? b.name)
                      ? colors.semantic.savingsSoft
                      : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor:
                    expBucketKey === (b.id ?? b.name)
                      ? colors.semantic.savings
                      : colors.glass.subtleBorder,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="micro">{`Aporta a: ${b.name}`}</AppText>
              </Pressable>
            ))}
          </View>

          {/* Optional Debt Link */}
          {debts.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setExpDebtKey(null)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor:
                    expDebtKey === null
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor:
                    expDebtKey === null ? colors.glass.specularBorder : colors.glass.subtleBorder,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="micro">Sin deuda vinculada</AppText>
              </Pressable>
              {debts.map((d) => (
                <Pressable
                  key={d.key ?? d.name}
                  testID={`onboarding-expense-debt-${d.key ?? d.name}`}
                  accessibilityRole="button"
                  onPress={() => setExpDebtKey(d.key ?? d.name)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor:
                      expDebtKey === (d.key ?? d.name)
                        ? colors.semantic.debtSoft
                        : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor:
                      expDebtKey === (d.key ?? d.name)
                        ? colors.semantic.debt
                        : colors.glass.subtleBorder,
                    justifyContent: 'center',
                  }}
                >
                  <AppText variant="micro">{`Abona a: ${d.name}`}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            testID="onboarding-add-expense-button"
            accessibilityRole="button"
            onPress={handleAddExpense}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.semantic.expenseSoft,
              borderWidth: 1,
              borderColor: colors.semantic.expense,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="caption" color={colors.semantic.expense}>
              + Agregar Gasto al Checklist
            </AppText>
          </Pressable>
        </View>
      </GlassSurface>

      {/* Step 6: Optional Provisions */}
      <GlassSurface elevated testID="onboarding-provisions-section">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="headline">6. Provisiones y Metas Programadas (Opcional)</AppText>
          {provisions.map((p, idx) => (
            <View
              key={`${p.name}-${idx}`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: spacing.xs,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="body">{p.name}</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  {`${formatCop(p.amountCop)} cada ${p.periodMonths} meses`}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setProvisions((prev) => prev.filter((_, i) => i !== idx))}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  Quitar
                </AppText>
              </Pressable>
            </View>
          ))}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <TextInput
              testID="onboarding-provision-name-input"
              value={provName}
              onChangeText={setProvName}
              placeholder="Provisión o meta (ej. SOAT / Mantenimiento)"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 160,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <TextInput
              testID="onboarding-provision-amount-input"
              value={provAmount}
              onChangeText={setProvAmount}
              keyboardType="numeric"
              placeholder="Costo estimado COP"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                minWidth: 130,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <TextInput
              testID="onboarding-provision-months-input"
              value={provMonths}
              onChangeText={setProvMonths}
              keyboardType="numeric"
              placeholder="Meses"
              placeholderTextColor={colors.text.muted}
              style={{
                width: 84,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />
            <Pressable
              testID="onboarding-provision-kind-toggle"
              accessibilityRole="button"
              onPress={() =>
                setProvKind((k) => (k === 'recurring' ? 'target_goal' : 'recurring'))
              }
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                justifyContent: 'center',
              }}
            >
              <AppText variant="caption">
                {provKind === 'recurring' ? 'Provisión Periódica' : 'Meta Futura'}
              </AppText>
            </Pressable>
            <Pressable
              testID="onboarding-add-provision-button"
              accessibilityRole="button"
              onPress={handleAddProvision}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.motoSoft,
                borderWidth: 1,
                borderColor: colors.semantic.moto,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.semantic.moto}>
                + Agregar Provisión
              </AppText>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      {/* Complete Setup CTA */}
      <Pressable
        testID="complete-initial-setup-button"
        accessibilityRole="button"
        onPress={handleFinishSetup}
        style={{
          width: '100%',
          minHeight: MIN_TOUCH_TARGET_PT,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.semantic.incomeSoft,
          borderWidth: 1,
          borderColor: colors.semantic.income,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <AppText variant="headline" color={colors.semantic.income}>
          {`Guardar Configuración e Iniciar ${formatMonthKeyLabelEs(computedMonthKey)}`}
        </AppText>
      </Pressable>
    </View>
  );
}
