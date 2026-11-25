/**
 * src/features/onboarding/components/InitialAccountSetupView.tsx
 *
 * Guided initial account setup wizard for first-time users and after an account reset.
 * Reuses the modernized forms of the main workspace (`NewSavingsBucketForm`, `DebtForm`,
 * `ChecklistAddMovementForm`, `ProvisionItemForm`) inside smooth `RevealDown` containers,
 * with responsive two-column layout on wide screens and full parity across iOS, Android,
 * and Web skins.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AdaptiveSelectField,
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  ResponsiveColumns,
  RevealDown,
  ScrollDepthHero,
  StatusBadge,
  TrashBinIcon,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatCurrency,
  formatMonthKeyLabelEs,
  toAppMonthKey,
  type Concept,
  type Debt,
  type MonthEntry,
  type SavingsBucket,
} from '../../../domain';
import type {
  InitialOnboardingConfigInput,
  SaveProvisionItemInput,
} from '../../budget/store/useBudgetStore';
import { ChecklistAddMovementForm } from '../../checklist/components/ChecklistAddMovementForm';
import type { ChecklistWorkspaceViewProps } from '../../checklist/components/ChecklistWorkspaceView';
import { DebtForm, type CreateDebtInput } from '../../debts/components/DebtForm';
import { ProvisionItemForm } from '../../savings/components/ProvisionItemForm';
import { NewSavingsBucketForm } from '../../savings/components/SavingsBucketForms';

export interface InitialAccountSetupViewProps {
  defaultMonthKey?: string;
  onMonthKeyChange?: (monthKey: string) => void;
  onCompleteSetup: (config: InitialOnboardingConfigInput) => void;
}

type ActiveOnboardingForm = 'bucket' | 'debt' | 'movement' | 'provision' | null;

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

const EMPTY_ENTRIES: readonly MonthEntry[] = [];
const EMPTY_CONCEPTS: readonly Concept[] = [];
const NOOP_COMPLETE_MOVEMENT: ChecklistWorkspaceViewProps['onAddOrCompleteMovement'] = () => {};

function buildBucketSlug(name: string, existingIds: ReadonlySet<string>): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = `bucket_${slug || Date.now().toString(36)}`;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

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

const SectionToggleButton = React.memo(function SectionToggleButton({
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

export function InitialAccountSetupView({
  defaultMonthKey,
  onMonthKeyChange,
  onCompleteSetup,
}: InitialAccountSetupViewProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  const currentMonthKey = toAppMonthKey();
  const currentYear = currentMonthKey.slice(0, 4);
  const currentYearNum = Number.parseInt(currentYear, 10);
  const minYearNum = currentYearNum - 50;

  // Range: [currentYear - 50, currentYear] with currentYear as maximum
  const yearOptions = useMemo<ReadonlyArray<{ value: string; label: string }>>(() => {
    return Array.from({ length: currentYearNum - minYearNum + 1 }, (_, idx) => {
      const yr = String(minYearNum + idx);
      return { value: yr, label: yr };
    });
  }, [currentYearNum, minYearNum]);

  const initialMk =
    defaultMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(defaultMonthKey)
      ? defaultMonthKey
      : currentMonthKey;
  const initialYear = initialMk.slice(0, 4);
  const [selectedYear, setSelectedYear] = useState(() => {
    const parsed = Number.parseInt(initialYear, 10);
    if (Number.isSafeInteger(parsed) && parsed >= minYearNum && parsed <= currentYearNum) {
      return initialYear;
    }
    return currentYear;
  });
  const [selectedMonth, setSelectedMonth] = useState(initialMk.slice(5, 7));

  const computedMonthKey = `${selectedYear}-${selectedMonth}`;
  const activeMonthOption =
    MONTH_OPTIONS.find((m) => m.value === selectedMonth) ?? { value: '01', label: 'Enero' };

  useEffect(() => {
    onMonthKeyChange?.(computedMonthKey);
  }, [computedMonthKey, onMonthKeyChange]);

  // Configured onboarding collections
  const [savingsBuckets, setSavingsBuckets] = useState<
    InitialOnboardingConfigInput['savingsBuckets']
  >([]);
  const [debts, setDebts] = useState<InitialOnboardingConfigInput['debts']>([]);
  const [incomes, setIncomes] = useState<InitialOnboardingConfigInput['incomes']>([]);
  const [expenses, setExpenses] = useState<InitialOnboardingConfigInput['expenses']>([]);
  const [provisions, setProvisions] = useState<
    NonNullable<InitialOnboardingConfigInput['provisions']>
  >([]);

  // Single active form slot + remount key so every form starts clean and isolated
  const [activeForm, setActiveForm] = useState<ActiveOnboardingForm>(null);
  const [formKey, setFormKey] = useState(0);
  const debtSeqRef = useRef(0);

  const toggleForm = useCallback((target: Exclude<ActiveOnboardingForm, null>) => {
    hapticService.light();
    setActiveForm((prev) => {
      if (prev === target) return null;
      setFormKey((key) => key + 1);
      return target;
    });
  }, []);

  const handleCloseActiveForm = useCallback(() => {
    setActiveForm(null);
  }, []);

  // Domain-shaped projections for ChecklistAddMovementForm selectors
  const formDebts = useMemo<Debt[]>(
    () =>
      debts.map((d, idx) => ({
        id: d.key ?? `debt_${idx}`,
        groupKey: 'General',
        name: d.name,
        lender: d.lender,
        openingBalance: d.openingBalanceCop,
        monthKey: computedMonthKey,
      })),
    [computedMonthKey, debts]
  );

  const formSavingsBuckets = useMemo<SavingsBucket[]>(
    () =>
      savingsBuckets.map((b, idx) => ({
        id: b.id ?? `bucket_${idx}`,
        name: b.name,
        openingBalance: b.openingBalanceCop,
      })),
    [savingsBuckets]
  );

  const debtNameByKey = useMemo(
    () => new Map(debts.map((d, idx) => [d.key ?? `debt_${idx}`, d.name] as const)),
    [debts]
  );

  const bucketNameById = useMemo(
    () => new Map(savingsBuckets.map((b, idx) => [b.id ?? `bucket_${idx}`, b.name] as const)),
    [savingsBuckets]
  );

  const handleCreateBucket = useCallback((name: string, openingBalanceCop: number) => {
    hapticService.trigger('success');
    setSavingsBuckets((prev) => {
      const existingIds = new Set(prev.map((b) => b.id ?? b.name));
      const id = buildBucketSlug(name, existingIds);
      return [...prev, { id, name, openingBalanceCop }];
    });
  }, []);

  const handleRemoveBucket = useCallback((idx: number, removedId?: string) => {
    hapticService.trigger('warning');
    setSavingsBuckets((prev) => prev.filter((_, i) => i !== idx));
    if (removedId) {
      setExpenses((prev) =>
        prev.map((exp) =>
          exp.savingsBucketKey === removedId ? { ...exp, savingsBucketKey: null } : exp
        )
      );
    }
  }, []);

  const handleCreateDebt = useCallback((input: CreateDebtInput) => {
    hapticService.trigger('success');
    debtSeqRef.current += 1;
    const key = `debt_${Date.now().toString(36)}_${debtSeqRef.current}`;
    const rateType = input.interestRateType ?? 'monthly';
    const rawRate = rateType === 'annual' ? input.annualInterestRate : input.monthlyInterestRate;

    setDebts((prev) => [
      ...prev,
      {
        key,
        name: input.name,
        lender: input.lender,
        openingBalanceCop: input.openingBalance,
        ...(rawRate !== undefined && rawRate > 0
          ? { interestRate: rawRate, interestRateType: rateType }
          : {}),
        ...(input.monthlyInstallment !== undefined && input.monthlyInstallment > 0
          ? { monthlyInstallmentCop: input.monthlyInstallment }
          : {}),
      },
    ]);
  }, []);

  const handleRemoveDebt = useCallback((idx: number, removedKey?: string) => {
    hapticService.trigger('warning');
    setDebts((prev) => prev.filter((_, i) => i !== idx));
    if (removedKey) {
      setExpenses((prev) =>
        prev.map((exp) =>
          exp.targetDebtKey === removedKey ? { ...exp, targetDebtKey: null } : exp
        )
      );
    }
  }, []);

  const handleCreateMovement = useCallback<
    NonNullable<ChecklistWorkspaceViewProps['onCreateCustomMovement']>
  >((input) => {
    hapticService.trigger('success');
    const amountCop = input.amount ?? input.amountCop ?? 0;
    const persistMonthly = input.persistMonthly !== false;

    if (input.type === 'income') {
      setIncomes((prev) => [
        ...prev,
        {
          name: input.name,
          amountCop,
          group: input.group,
          persistMonthly,
        },
      ]);
      return;
    }

    setExpenses((prev) => [
      ...prev,
      {
        name: input.name,
        amountCop,
        group: input.group,
        persistMonthly,
        targetDebtKey: input.targetDebtId ?? null,
        savingsBucketKey: input.savingsBucketId ?? null,
      },
    ]);
  }, []);

  const handleSaveProvision = useCallback((input: SaveProvisionItemInput) => {
    hapticService.trigger('success');
    setProvisions((prev) => [
      ...prev,
      {
        name: input.name,
        amountCop: input.amount,
        periodMonths: input.periodMonths,
        priority: input.priority || '1. Alta',
        kind: input.kind,
        ...(input.notes ? { notes: input.notes } : {}),
      },
    ]);
  }, []);

  const handleFinishSetup = useCallback(() => {
    onCompleteSetup({
      monthKey: computedMonthKey,
      incomes,
      expenses,
      debts,
      savingsBuckets,
      provisions,
    });
  }, [computedMonthKey, debts, expenses, incomes, onCompleteSetup, provisions, savingsBuckets]);

  const totalMovementsCount = incomes.length + expenses.length;
  const totalConfiguredItems =
    savingsBuckets.length + debts.length + totalMovementsCount + provisions.length;

  const summaryPills = useMemo(
    () => [
      { id: 'buckets', label: `Fondos (${savingsBuckets.length})`, status: 'savings' as const },
      { id: 'debts', label: `Deudas (${debts.length})`, status: 'debt' as const },
      { id: 'movements', label: `Movimientos (${totalMovementsCount})`, status: 'info' as const },
      { id: 'provisions', label: `Metas (${provisions.length})`, status: 'provisions' as const },
    ],
    [debts.length, provisions.length, savingsBuckets.length, totalMovementsCount]
  );

  return (
    <View style={{ gap: spacing.md }} testID="initial-account-setup-view">
      {/* Hero Header Card */}
      <ScrollDepthHero>
        <GlassSurface elevated>
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: spacing.xs,
              }}
            >
              <AppText variant="title2" accessibilityRole="header">
                Personaliza tu BFlow
              </AppText>
              <StatusBadge label={formatMonthKeyLabelEs(computedMonthKey)} status="info" />
            </View>
            <AppText variant="caption" color={colors.text.secondary}>
              Configura tu punto de partida con los mismos formularios de tu espacio. Todos los pasos
              son opcionales: puedes guardar ahora y ajustar después.
            </AppText>
            <View
              testID="onboarding-summary-strip"
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
            >
              {summaryPills.map((pill) => (
                <StatusBadge key={pill.id} label={pill.label} status={pill.status} />
              ))}
            </View>
          </View>
        </GlassSurface>
      </ScrollDepthHero>

      <ResponsiveColumns testID="onboarding-panels">
        {/* Left Column: Start Month, Savings Funds, Debts */}
        <View style={{ gap: spacing.md }}>
          {/* Step 1: Month & Year */}
          <GlassSurface elevated testID="onboarding-month-section">
            <View style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  flexWrap: 'wrap',
                }}
              >
                <StatusBadge label="PASO 1" status="info" />
                <AppText variant="headline">Mes y Año de Inicio</AppText>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.md,
                  alignItems: 'flex-start',
                }}
              >
                <AdaptiveSelectField
                  label="Año"
                  title="Año de Inicio"
                  options={yearOptions}
                  selectedValue={selectedYear}
                  onSelect={setSelectedYear}
                  triggerTestID="onboarding-year-dropdown-trigger"
                  valueTestID="onboarding-year-input"
                  pickerTestID="onboarding-year-picker"
                  accessibilityLabel={`Año actual: ${selectedYear}. Toca para abrir el selector de año.`}
                  containerStyle={{ flex: 1, minWidth: 112 }}
                />

                <AdaptiveSelectField
                  label="Mes de inicio"
                  title="Mes de Inicio"
                  options={MONTH_OPTIONS}
                  selectedValue={selectedMonth}
                  onSelect={setSelectedMonth}
                  triggerTestID="onboarding-month-dropdown-trigger"
                  pickerTestID="onboarding-month-picker"
                  accessibilityLabel={`Mes actual: ${activeMonthOption.label}. Toca para abrir el selector.`}
                  containerStyle={{ flex: 1.5, minWidth: 148 }}
                />
              </View>
            </View>
          </GlassSurface>

          {/* Step 2: Savings Funds */}
          <GlassSurface elevated testID="onboarding-savings-section">
            <View style={{ gap: spacing.sm }}>
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
                  <StatusBadge label="PASO 2" status="savings" />
                  <AppText variant="headline">Fondos de Ahorro</AppText>
                </View>
                {savingsBuckets.length > 0 ? (
                  <AppText variant="micro" color={colors.text.secondary}>
                    {`${savingsBuckets.length} ${savingsBuckets.length === 1 ? 'fondo' : 'fondos'}`}
                  </AppText>
                ) : null}
              </View>

              <SectionToggleButton
                testID="onboarding-toggle-add-bucket"
                isOpen={activeForm === 'bucket'}
                openLabel="+ Nuevo Fondo"
                openAccessibilityLabel="Abrir formulario de nuevo fondo de ahorro"
                closeAccessibilityLabel="Cerrar formulario de nuevo fondo de ahorro"
                tintBackground={colors.semantic.savingsSoft}
                tintText={colors.semantic.savings}
                onPress={() => toggleForm('bucket')}
              />

              <RevealDown visible={activeForm === 'bucket'}>
                <NewSavingsBucketForm
                  key={`bucket-${formKey}`}
                  onCreateSavingsBucket={handleCreateBucket}
                  onClose={handleCloseActiveForm}
                />
              </RevealDown>

              {savingsBuckets.length === 0 ? (
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
                    Sin fondos registrados. Si no tienes fondos de ahorro, puedes omitir este paso.
                  </AppText>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {savingsBuckets.map((bucket, idx) => (
                    <View
                      key={bucket.id ?? `${bucket.name}-${idx}`}
                      testID={`onboarding-bucket-item-${bucket.id ?? idx}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
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
                      <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>
                        <AppText variant="body">{bucket.name}</AppText>
                        <CurrencyText
                          amount={bucket.openingBalanceCop}
                          variant="callout"
                          tone="savings"
                        />
                      </View>
                      <RemoveItemButton
                        testID={`onboarding-remove-bucket-${bucket.id ?? idx}`}
                        itemName={bucket.name}
                        onPress={() => handleRemoveBucket(idx, bucket.id)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Step 3: Debts */}
          <GlassSurface elevated testID="onboarding-debts-section">
            <View style={{ gap: spacing.sm }}>
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
                  <StatusBadge label="PASO 3" status="debt" />
                  <AppText variant="headline">Deudas y Obligaciones</AppText>
                </View>
                {debts.length > 0 ? (
                  <AppText variant="micro" color={colors.text.secondary}>
                    {`${debts.length} ${debts.length === 1 ? 'deuda' : 'deudas'}`}
                  </AppText>
                ) : null}
              </View>

              <SectionToggleButton
                testID="onboarding-toggle-add-debt"
                isOpen={activeForm === 'debt'}
                openLabel="+ Nueva Deuda"
                openAccessibilityLabel="Abrir formulario de nueva deuda"
                closeAccessibilityLabel="Cerrar formulario de nueva deuda"
                tintBackground={colors.semantic.debtSoft}
                tintText={colors.semantic.debt}
                onPress={() => toggleForm('debt')}
              />

              <RevealDown visible={activeForm === 'debt'}>
                <DebtForm
                  key={`debt-${formKey}`}
                  debt={null}
                  onCreateDebt={handleCreateDebt}
                  onClose={handleCloseActiveForm}
                />
              </RevealDown>

              {debts.length === 0 ? (
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
                    Sin deudas registradas. Si estás libre de deudas, puedes omitir este paso.
                  </AppText>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {debts.map((d, idx) => (
                    <View
                      key={d.key ?? `${d.name}-${idx}`}
                      testID={`onboarding-debt-item-${d.key ?? idx}`}
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
                      <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>
                        <AppText variant="body">{`${d.name} (${d.lender})`}</AppText>
                        <CurrencyText amount={d.openingBalanceCop} variant="callout" tone="debt" />
                        {d.interestRate !== undefined || d.monthlyInstallmentCop ? (
                          <AppText variant="micro" color={colors.text.secondary}>
                            {[
                              d.interestRate !== undefined
                                ? `Interés ${d.interestRateType === 'annual' ? 'anual' : 'mensual'}: ${d.interestRate}%`
                                : null,
                              d.monthlyInstallmentCop
                                ? `Cuota: ${formatCurrency(d.monthlyInstallmentCop)}/mes`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </AppText>
                        ) : null}
                      </View>
                      <RemoveItemButton
                        testID={`onboarding-remove-debt-${d.key ?? idx}`}
                        itemName={d.name}
                        onPress={() => handleRemoveDebt(idx, d.key)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </GlassSurface>
        </View>

        {/* Right Column: Movements (Incomes + Expenses) & Provisions/Goals */}
        <View style={{ gap: spacing.md }}>
          {/* Step 4: Movements (Unified Incomes & Expenses via ChecklistAddMovementForm) */}
          <GlassSurface elevated testID="onboarding-movements-section">
            <View style={{ gap: spacing.sm }}>
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
                  <StatusBadge label="PASO 4" status="completed" />
                  <AppText variant="headline">Movimientos del Mes</AppText>
                </View>
                {totalMovementsCount > 0 ? (
                  <AppText variant="micro" color={colors.text.secondary}>
                    {`${incomes.length} ing. · ${expenses.length} gas.`}
                  </AppText>
                ) : null}
              </View>

              <SectionToggleButton
                testID="onboarding-toggle-add-movement"
                isOpen={activeForm === 'movement'}
                openLabel="+ Nuevo Movimiento"
                openAccessibilityLabel="Abrir formulario de nuevo movimiento"
                closeAccessibilityLabel="Cerrar formulario de nuevo movimiento"
                tintBackground={colors.accent.container}
                tintText={colors.accent.onContainer}
                onPress={() => toggleForm('movement')}
              />

              <RevealDown visible={activeForm === 'movement'}>
                <ChecklistAddMovementForm
                  key={`movement-${formKey}`}
                  monthKey={computedMonthKey}
                  monthEntries={EMPTY_ENTRIES}
                  concepts={EMPTY_CONCEPTS}
                  debts={formDebts}
                  savingsBuckets={formSavingsBuckets}
                  onAddOrCompleteMovement={NOOP_COMPLETE_MOVEMENT}
                  onCreateCustomMovement={handleCreateMovement}
                  onSubmitted={handleCloseActiveForm}
                />
              </RevealDown>

              {totalMovementsCount === 0 ? (
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
                    Sin movimientos registrados. Agrega tus ingresos y gastos habituales, y
                    vincúlalos a tus deudas o fondos.
                  </AppText>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {incomes.map((inc, idx) => (
                    <View
                      key={`inc-${inc.name}-${idx}`}
                      testID={`onboarding-income-item-${idx}`}
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
                      <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>
                        <AppText variant="body">{inc.name}</AppText>
                        <CurrencyText amount={inc.amountCop} variant="callout" tone="income" />
                        <AppText variant="micro" color={colors.text.secondary}>
                          {`${inc.group === 'fixed' ? 'Ingreso fijo' : 'Ingreso variable'} · ${
                            inc.persistMonthly ? 'Cada mes' : 'Solo este mes'
                          }`}
                        </AppText>
                      </View>
                      <RemoveItemButton
                        testID={`onboarding-remove-income-${idx}`}
                        itemName={inc.name}
                        onPress={() => {
                          hapticService.trigger('warning');
                          setIncomes((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      />
                    </View>
                  ))}

                  {expenses.map((exp, idx) => {
                    const linkedDebt = exp.targetDebtKey
                      ? debtNameByKey.get(exp.targetDebtKey)
                      : undefined;
                    const linkedBucket = exp.savingsBucketKey
                      ? bucketNameById.get(exp.savingsBucketKey)
                      : undefined;

                    return (
                      <View
                        key={`exp-${exp.name}-${idx}`}
                        testID={`onboarding-expense-item-${idx}`}
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
                        <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>
                          <AppText variant="body">{exp.name}</AppText>
                          <CurrencyText amount={exp.amountCop} variant="callout" tone="expense" />
                          <AppText variant="micro" color={colors.text.secondary}>
                            {[
                              exp.group === 'fixed' ? 'Gasto fijo' : 'Gasto variable',
                              exp.persistMonthly ? 'Cada mes' : 'Solo este mes',
                              linkedDebt ? `Abona a: ${linkedDebt}` : null,
                              linkedBucket ? `Aporta a: ${linkedBucket}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </AppText>
                        </View>
                        <RemoveItemButton
                          testID={`onboarding-remove-expense-${idx}`}
                          itemName={exp.name}
                          onPress={() => {
                            hapticService.trigger('warning');
                            setExpenses((prev) => prev.filter((_, i) => i !== idx));
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Step 5: Provisions & Target Goals */}
          <GlassSurface elevated testID="onboarding-provisions-section">
            <View style={{ gap: spacing.sm }}>
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
                  <StatusBadge label="PASO 5" status="provisions" />
                  <AppText variant="headline">Metas y Provisiones</AppText>
                </View>
                {provisions.length > 0 ? (
                  <AppText variant="micro" color={colors.text.secondary}>
                    {`${provisions.length} ${provisions.length === 1 ? 'meta' : 'metas'}`}
                  </AppText>
                ) : null}
              </View>

              <SectionToggleButton
                testID="onboarding-toggle-add-provision"
                isOpen={activeForm === 'provision'}
                openLabel="+ Agregar Metas"
                openAccessibilityLabel="Abrir formulario de metas y provisiones"
                closeAccessibilityLabel="Cerrar formulario de metas y provisiones"
                tintBackground={colors.semantic.provisionsSoft}
                tintText={colors.semantic.provisions}
                onPress={() => toggleForm('provision')}
              />

              <RevealDown visible={activeForm === 'provision'}>
                <ProvisionItemForm
                  key={`provision-${formKey}`}
                  item={null}
                  onSaveProvisionItem={handleSaveProvision}
                  onClose={handleCloseActiveForm}
                />
              </RevealDown>

              {provisions.length === 0 ? (
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
                    Sin provisiones registradas. Si tienes metas personales o gastos periódicos,
                    agrégalos aquí.
                  </AppText>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {provisions.map((p, idx) => {
                    const monthlyQuota = Math.ceil(p.amountCop / Math.max(1, p.periodMonths));
                    return (
                      <View
                        key={`${p.name}-${idx}`}
                        testID={`onboarding-provision-item-${idx}`}
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
                        <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: spacing.xs,
                            }}
                          >
                            <AppText variant="body">{p.name}</AppText>
                            <StatusBadge
                              label={p.kind === 'target_goal' ? 'Meta' : 'Provisión'}
                              status="provisions"
                            />
                          </View>
                          <AppText variant="callout" tabularNums color={colors.semantic.provisions}>
                            {`${formatCurrency(monthlyQuota)}/mes`}
                          </AppText>
                          <AppText variant="micro" color={colors.text.secondary}>
                            {`${formatCurrency(p.amountCop)} · ${p.periodMonths} ${
                              p.periodMonths === 1 ? 'mes' : 'meses'
                            }`}
                          </AppText>
                        </View>
                        <RemoveItemButton
                          testID={`onboarding-remove-provision-${idx}`}
                          itemName={p.name}
                          onPress={() => {
                            hapticService.trigger('warning');
                            setProvisions((prev) => prev.filter((_, i) => i !== idx));
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </GlassSurface>
        </View>
      </ResponsiveColumns>

      {/* Complete Setup Primary CTA */}
      <View style={{ gap: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.lg }}>
        <AppPressable
          testID="complete-initial-setup-button"
          accessibilityRole="button"
          onPress={handleFinishSetup}
          style={{
            width: '100%',
            minHeight: Math.max(52, minTouchTarget),
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            ...primaryAction.container,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.income}>
            {`Guardar e Iniciar ${formatMonthKeyLabelEs(computedMonthKey)}`}
          </AppText>
        </AppPressable>
        <AppText variant="caption" color={colors.text.muted} style={{ textAlign: 'center' }}>
          {totalConfiguredItems > 0
            ? `${totalConfiguredItems} ${totalConfiguredItems === 1 ? 'elemento listo' : 'elementos listos'}. Podrás editar o agregar más en cualquier momento.`
            : 'Podrás modificar o agregar cualquier elemento en cualquier momento desde tu presupuesto.'}
        </AppText>
      </View>
    </View>
  );
}
