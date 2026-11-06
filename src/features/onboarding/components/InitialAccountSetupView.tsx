/**
     * src/features/onboarding/components/InitialAccountSetupView.tsx
     *
     * Guided initial account setup wizard for first-time users and after an account reset.
     * Designed following mobile-design & ui-ux-pro-max standards:
     * - Apple Liquid Glass aesthetics with clear visual hierarchy
     * - Compact dropdown selector for initial month selection
     * - Friendly empty states and >= 44pt touch targets
     */

    import React, { useMemo, useState } from 'react';
    import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';
    import {
      AppText,
      AppTextInput,
      CurrencyText,
      GlassSurface,
      IosWheelPickerModal,
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

    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    /**
     * Subtle, imperceptible iOS-style accordion transition (250ms ease-in-out).
     */
    const triggerSubtleAccordionAnimation = () => {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext({
          duration: 250,
          create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
          update: {
            type: LayoutAnimation.Types.easeInEaseOut,
          },
          delete: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
        });
      }
    };

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
          : `${currentYear}-01`;
      const initialYear = initialMk.slice(0, 4);
      const [selectedYear, setSelectedYear] = useState(() => {
        const parsed = Number.parseInt(initialYear, 10);
        if (Number.isSafeInteger(parsed) && parsed >= minYearNum && parsed <= currentYearNum) {
          return initialYear;
        }
        return currentYear;
      });
      const [selectedMonth, setSelectedMonth] = useState(initialMk.slice(5, 7));
      const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
      const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);

      const computedMonthKey = `${selectedYear}-${selectedMonth}`;
      const activeMonthOption =
        MONTH_OPTIONS.find((m) => m.value === selectedMonth) ?? { value: '01', label: 'Enero' };

      // 1. Incomes state
      const [incomes, setIncomes] = useState<InitialOnboardingConfigInput['incomes']>([]);
      const [incName, setIncName] = useState('');
      const [incAmount, setIncAmount] = useState('');
      const [incGroup, setIncGroup] = useState<ConceptGroup>('fixed');
      const [incPersist, setIncPersist] = useState(true);
      const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);

      // 2. Debts state
      const [debts, setDebts] = useState<InitialOnboardingConfigInput['debts']>([]);
      const [debtName, setDebtName] = useState('');
      const [debtLender, setDebtLender] = useState('');
      const [debtBalance, setDebtBalance] = useState('');
      const [debtRate, setDebtRate] = useState('');
      const [debtRateType, setDebtRateType] = useState<DebtInterestRateType>('monthly');
      const [debtInstallment, setDebtInstallment] = useState('');
      const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);

      // 3. Savings buckets state
      const [savingsBuckets, setSavingsBuckets] = useState<
        InitialOnboardingConfigInput['savingsBuckets']
      >([]);
      const [newBucketName, setNewBucketName] = useState('');
      const [newBucketBalance, setNewBucketBalance] = useState('');
      const [isAddBucketOpen, setIsAddBucketOpen] = useState(false);

      // 4. Expenses state
      const [expenses, setExpenses] = useState<InitialOnboardingConfigInput['expenses']>([]);
      const [expName, setExpName] = useState('');
      const [expAmount, setExpAmount] = useState('');
      const [expGroup, setExpGroup] = useState<ConceptGroup>('fixed');
      const [expPersist, setExpPersist] = useState(true);
      const [expDebtKey, setExpDebtKey] = useState<string | null>(null);
      const [expBucketKey, setExpBucketKey] = useState<string | null>(null);
      const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

      // 5. Provisions state
      const [provisions, setProvisions] = useState<
        NonNullable<InitialOnboardingConfigInput['provisions']>
      >([]);
      const [provName, setProvName] = useState('');
      const [provAmount, setProvAmount] = useState('');
      const [provMonths, setProvMonths] = useState('12');
      const [provKind, setProvKind] = useState<'recurring' | 'target_goal'>('recurring');
      const [isAddProvisionOpen, setIsAddProvisionOpen] = useState(false);

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
        triggerSubtleAccordionAnimation();
        setIsAddIncomeOpen(false);
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
        triggerSubtleAccordionAnimation();
        setIsAddDebtOpen(false);
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
        triggerSubtleAccordionAnimation();
        setIsAddBucketOpen(false);
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
        triggerSubtleAccordionAnimation();
        setIsAddExpenseOpen(false);
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
        triggerSubtleAccordionAnimation();
        setIsAddProvisionOpen(false);
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
                <AppText variant="title2">Personaliza tu BFlow</AppText>
                <StatusBadge label={formatMonthKeyLabelEs(computedMonthKey)} status="info" />
              </View>
              <AppText variant="caption" color={colors.text.secondary}>
                Configura tus datos de partida. Si quieres saltar la configuración, ve al al final y haz clic en Guardar.
              </AppText>
            </View>
          </GlassSurface>

          {/* Step 1: Month & Year (Compact Dropdown) */}
          <GlassSurface elevated testID="onboarding-month-section">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusBadge label="PASO 1" status="info" />
                <AppText variant="headline">Mes y Año de Inicio</AppText>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                {/* Year Picker Trigger */}
                <View style={{ flex: 1, minWidth: 120, gap: spacing.xxs }}>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Año
                  </AppText>
                  <Pressable
                    testID="onboarding-year-dropdown-trigger"
                    accessibilityRole="button"
                    accessibilityLabel={`Año actual: ${selectedYear}. Toca para abrir el selector de año.`}
                    onPress={() => setIsYearPickerOpen(true)}
                    style={{
                      minHeight: 48,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                    }}
                  >
                    <AppText
                      testID="onboarding-year-input"
                      variant="body"
                      style={{ fontWeight: '600' }}
                    >
                      {selectedYear}
                    </AppText>
                    <AppText
                      variant="caption"
                      color={colors.text.secondary}
                      style={{ marginLeft: spacing.xs }}
                    >
                      ▼
                    </AppText>
                  </Pressable>
                </View>

                {/* Month Picker Trigger */}
                <View style={{ flex: 1.6, minWidth: 160, gap: spacing.xxs }}>
                  <AppText variant="caption" color={colors.text.secondary}>
                    Mes de inicio
                  </AppText>
                  <Pressable
                    testID="onboarding-month-dropdown-trigger"
                    accessibilityRole="button"
                    accessibilityLabel={`Mes actual: ${activeMonthOption.label}. Toca para abrir el selector.`}
                    onPress={() => setIsMonthDropdownOpen(true)}
                    style={{
                      minHeight: 48,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                    }}
                  >
                    <AppText variant="body" style={{ fontWeight: '600' }}>
                      {activeMonthOption.label}
                    </AppText>
                    <AppText
                      variant="caption"
                      color={colors.text.secondary}
                      style={{ marginLeft: spacing.xs }}
                    >
                      ▼
                    </AppText>
                  </Pressable>
                </View>
              </View>

              {/* iOS Native-Style Wheel Picker Modal: Year (currentYear - 50 to currentYear) */}
              <IosWheelPickerModal
                visible={isYearPickerOpen}
                title="Año de Inicio"
                options={yearOptions}
                selectedValue={selectedYear}
                onConfirm={(chosenYear) => {
                  setSelectedYear(chosenYear);
                  setIsYearPickerOpen(false);
                }}
                onCancel={() => setIsYearPickerOpen(false)}
                testID="onboarding-year-picker"
              />

              {/* iOS Native-Style Wheel Picker Modal: Month */}
              <IosWheelPickerModal
                visible={isMonthDropdownOpen}
                title="Mes de Inicio"
                options={MONTH_OPTIONS}
                selectedValue={selectedMonth}
                onConfirm={(chosenMonth) => {
                  setSelectedMonth(chosenMonth);
                  setIsMonthDropdownOpen(false);
                }}
                onCancel={() => setIsMonthDropdownOpen(false)}
                testID="onboarding-month-picker"
              />
            </View>
          </GlassSurface>

          {/* Step 2: Savings Funds */}
          <GlassSurface elevated testID="onboarding-savings-section">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusBadge label="PASO 2" status="savings" />
                <AppText variant="headline">Fondos de Ahorro y Bolsillos</AppText>
              </View>

              {savingsBuckets.length === 0 ? (
                <View
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <AppText variant="caption" color={colors.text.muted}>
                    Sin fondos registrados. Si no tienes fondos de ahorro, puedes omitir este
                    paso.
                  </AppText>
                </View>
              ) : (
                savingsBuckets.map((bucket, idx) => (
                  <View
                    key={bucket.id ?? `${bucket.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.sm,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                    }}
                  >
                    <AppText variant="body" style={{ flex: 1 }}>
                      {bucket.name}
                    </AppText>
                    <AppTextInput
                      testID={`onboarding-bucket-balance-${bucket.id}`}
                      value={bucket.openingBalanceCop > 0 ? String(bucket.openingBalanceCop) : ''}
                      onChangeText={(txt) => handleUpdateBucketBalance(bucket.id ?? 'savings', txt)}
                      keyboardType="numeric"
                      placeholder="Saldo $ (0)"
                      style={{
                        flex: 1,
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
                        paddingHorizontal: spacing.md,
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense}>
                        Quitar
                      </AppText>
                    </Pressable>
                  </View>
                ))
              )}

              {!isAddBucketOpen ? (
                <Pressable
                  testID="onboarding-toggle-add-bucket"
                  accessibilityRole="button"
                  accessibilityLabel="Agregar nuevo fondo de ahorro"
                  onPress={() => {
                    triggerSubtleAccordionAnimation();
                    setIsAddBucketOpen(true);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: colors.semantic.savingsSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.savings} style={{ fontWeight: '600' }}>
                    + Agregar Fondo
                  </AppText>
                </Pressable>
              ) : (
                <View
                  style={{
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppTextInput
                      testID="onboarding-new-bucket-name-input"
                      value={newBucketName}
                      onChangeText={setNewBucketName}
                      placeholder="Nombre fondo (ej. Vacaciones)"
                      style={{
                        flex: 1.4,
                      }}
                    />
                    <AppTextInput
                      testID="onboarding-new-bucket-balance-input"
                      value={newBucketBalance}
                      onChangeText={setNewBucketBalance}
                      keyboardType="numeric"
                      placeholder="Saldo inicial $"
                      style={{
                        flex: 1,
                      }}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-add-bucket-button"
                      accessibilityRole="button"
                      onPress={handleAddCustomBucket}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.savings} style={{ fontWeight: '600' }}>
                        + Agregar Fondo
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-cancel-add-bucket"
                      accessibilityRole="button"
                      onPress={() => {
                        triggerSubtleAccordionAnimation();
                        setIsAddBucketOpen(false);
                      }}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.text.secondary}>
                        Cancelar
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Step 3: Debts */}
          <GlassSurface elevated testID="onboarding-debts-section">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusBadge label="PASO 3" status="debt" />
                <AppText variant="headline">Deudas y Obligaciones</AppText>
              </View>

              {debts.length === 0 ? (
                <View
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
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
                debts.map((d, idx) => (
                  <View
                    key={d.key ?? `${d.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <AppText variant="body">{`${d.name} (${d.lender})`}</AppText>
                      <AppText variant="caption" color={colors.text.secondary}>
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
                        paddingHorizontal: spacing.md,
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense}>
                        Quitar
                      </AppText>
                    </Pressable>
                  </View>
                ))
              )}

              {!isAddDebtOpen ? (
                <Pressable
                  testID="onboarding-toggle-add-debt"
                  accessibilityRole="button"
                  accessibilityLabel="Agregar nueva deuda"
                  onPress={() => {
                    triggerSubtleAccordionAnimation();
                    setIsAddDebtOpen(true);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: colors.semantic.debtSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.debt} style={{ fontWeight: '600' }}>
                    + Agregar Deuda
                  </AppText>
                </Pressable>
              ) : (
                <View
                  style={{
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppTextInput
                      testID="onboarding-debt-name-input"
                      value={debtName}
                      onChangeText={setDebtName}
                      placeholder="Nombre de la deuda"
                      style={{
                        flex: 1.2,
                      }}
                    />
                    <AppTextInput
                      testID="onboarding-debt-lender-input"
                      value={debtLender}
                      onChangeText={setDebtLender}
                      placeholder="Entidad o Banco"
                      style={{
                        flex: 1,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppTextInput
                      testID="onboarding-debt-balance-input"
                      value={debtBalance}
                      onChangeText={setDebtBalance}
                      keyboardType="numeric"
                      placeholder="Saldo actual $"
                      style={{
                        flex: 1,
                      }}
                    />
                    <AppTextInput
                      testID="onboarding-debt-installment-input"
                      value={debtInstallment}
                      onChangeText={setDebtInstallment}
                      keyboardType="numeric"
                      placeholder="Cuota mensual $"
                      style={{
                        flex: 1,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-debt-rate-monthly"
                      accessibilityRole="button"
                      onPress={() => setDebtRateType('monthly')}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                      <AppText
                        variant="caption"
                        style={{ fontWeight: debtRateType === 'monthly' ? '600' : '400' }}
                      >
                        Interés Mensual (%)
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-debt-rate-annual"
                      accessibilityRole="button"
                      onPress={() => setDebtRateType('annual')}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                      <AppText
                        variant="caption"
                        style={{ fontWeight: debtRateType === 'annual' ? '600' : '400' }}
                      >
                        Interés Anual (% E.A.)
                      </AppText>
                    </Pressable>
                    <AppTextInput
                      testID="onboarding-debt-rate-input"
                      value={debtRate}
                      onChangeText={setDebtRate}
                      keyboardType="decimal-pad"
                      placeholder="Tasa % (ej. 0.5)"
                      style={{
                        flex: 1,
                        minWidth: 120,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-add-debt-button"
                      accessibilityRole="button"
                      onPress={handleAddDebt}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.debt} style={{ fontWeight: '600' }}>
                        + Agregar Deuda
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-cancel-add-debt"
                      accessibilityRole="button"
                      onPress={() => {
                        triggerSubtleAccordionAnimation();
                        setIsAddDebtOpen(false);
                      }}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.text.secondary}>
                        Cancelar
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Step 4: Incomes */}
          <GlassSurface elevated testID="onboarding-incomes-section">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusBadge label="PASO 4" status="completed" />
                <AppText variant="headline">Ingresos Habituales</AppText>
              </View>

              {incomes.length === 0 ? (
                <View
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <AppText variant="caption" color={colors.text.muted}>
                    Sin ingresos registrados. Agrega tu salario o fuentes principales de ingresos.
                  </AppText>
                </View>
              ) : (
                incomes.map((inc, idx) => (
                  <View
                    key={`${inc.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <AppText variant="body">{inc.name}</AppText>
                      <AppText variant="caption" color={colors.text.secondary}>
                        {`${inc.group === 'fixed' ? 'Ingreso Fijo' : 'Ingreso Variable'} · ${
                          inc.persistMonthly ? 'Persiste cada mes' : 'Solo este mes'
                        }`}
                      </AppText>
                    </View>
                    <CurrencyText
                      amount={inc.amountCop}
                      variant="body"
                      tone="income"
                      style={{ fontWeight: '600', marginRight: spacing.sm }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setIncomes((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense}>
                        Quitar
                      </AppText>
                    </Pressable>
                  </View>
                ))
              )}

              {!isAddIncomeOpen ? (
                <Pressable
                  testID="onboarding-toggle-add-income"
                  accessibilityRole="button"
                  accessibilityLabel="Agregar nuevo ingreso"
                  onPress={() => {
                    triggerSubtleAccordionAnimation();
                    setIsAddIncomeOpen(true);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: colors.semantic.incomeSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.income} style={{ fontWeight: '600' }}>
                    + Agregar Ingreso
                  </AppText>
                </Pressable>
              ) : (
                <View
                  style={{
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppTextInput
                      testID="onboarding-income-name-input"
                      value={incName}
                      onChangeText={setIncName}
                      placeholder="Concepto (ej. Salario)"
                      style={{
                        flex: 1.4,
                      }}
                    />
                    <AppTextInput
                      testID="onboarding-income-amount-input"
                      value={incAmount}
                      onChangeText={setIncAmount}
                      keyboardType="numeric"
                      placeholder="Valor $"
                      style={{
                        flex: 1,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-income-group-fixed"
                      accessibilityRole="button"
                      onPress={() => setIncGroup('fixed')}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                      <AppText
                        variant="caption"
                        style={{ fontWeight: incGroup === 'fixed' ? '600' : '400' }}
                      >
                        Fijo
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-income-group-variable"
                      accessibilityRole="button"
                      onPress={() => setIncGroup('variable')}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                      <AppText
                        variant="caption"
                        style={{ fontWeight: incGroup === 'variable' ? '600' : '400' }}
                      >
                        Variable
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-income-persist-toggle"
                      accessibilityRole="button"
                      onPress={() => setIncPersist((v) => !v)}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                  </View>

                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-add-income-button"
                      accessibilityRole="button"
                      onPress={handleAddIncome}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.income} style={{ fontWeight: '600' }}>
                        + Agregar Ingreso
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-cancel-add-income"
                      accessibilityRole="button"
                      onPress={() => {
                        triggerSubtleAccordionAnimation();
                        setIsAddIncomeOpen(false);
                      }}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.text.secondary}>
                        Cancelar
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Step 5: Expenses */}
          <GlassSurface elevated testID="onboarding-expenses-section">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusBadge label="PASO 5" status="pending" />
                <AppText variant="headline">Gastos del Checklist</AppText>
              </View>

              {expenses.length === 0 ? (
                <View
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <AppText variant="caption" color={colors.text.muted}>
                    Sin gastos registrados aún. Agrega tus gastos fijos o variables y vincúlalos a tus
                    fondos o deudas.
                  </AppText>
                </View>
              ) : (
                expenses.map((exp, idx) => (
                  <View
                    key={`${exp.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <AppText variant="body">{exp.name}</AppText>
                      <AppText variant="caption" color={colors.text.secondary}>
                        {`${exp.group === 'fixed' ? 'Gasto Fijo' : 'Gasto Variable'} · ${
                          exp.persistMonthly ? 'Persiste cada mes' : 'Solo este mes'
                        }`}
                      </AppText>
                    </View>
                    <CurrencyText
                      amount={exp.amountCop}
                      variant="body"
                      tone="expense"
                      style={{ fontWeight: '600', marginRight: spacing.sm }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setExpenses((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense}>
                        Quitar
                      </AppText>
                    </Pressable>
                  </View>
                ))
              )}

              {!isAddExpenseOpen ? (
                <Pressable
                  testID="onboarding-toggle-add-expense"
                  accessibilityRole="button"
                  accessibilityLabel="Agregar nuevo gasto"
                  onPress={() => {
                    triggerSubtleAccordionAnimation();
                    setIsAddExpenseOpen(true);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: colors.semantic.expenseSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.expense} style={{ fontWeight: '600' }}>
                    + Agregar Gasto
                  </AppText>
                </Pressable>
              ) : (
                <View
                  style={{
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppTextInput
                      testID="onboarding-expense-name-input"
                      value={expName}
                      onChangeText={setExpName}
                      placeholder="Concepto (ej. Arriendo)"
                      style={{
                        flex: 1.4,
                      }}
                    />
                    <AppTextInput
                      testID="onboarding-expense-amount-input"
                      value={expAmount}
                      onChangeText={setExpAmount}
                      keyboardType="numeric"
                      placeholder="Valor $"
                      style={{
                        flex: 1,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-expense-group-fixed"
                      accessibilityRole="button"
                      onPress={() => setExpGroup('fixed')}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                      <AppText
                        variant="caption"
                        style={{ fontWeight: expGroup === 'fixed' ? '600' : '400' }}
                      >
                        Fijo
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-expense-group-variable"
                      accessibilityRole="button"
                      onPress={() => setExpGroup('variable')}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                      <AppText
                        variant="caption"
                        style={{ fontWeight: expGroup === 'variable' ? '600' : '400' }}
                      >
                        Variable
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-expense-persist-toggle"
                      accessibilityRole="button"
                      onPress={() => setExpPersist((v) => !v)}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
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
                  {savingsBuckets.length > 0 ? (
                    <View style={{ gap: spacing.xxs }}>
                      <AppText variant="caption" color={colors.text.secondary}>
                        Vincular a fondo de ahorro (opcional):
                      </AppText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setExpBucketKey(null)}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            paddingHorizontal: spacing.md,
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
                          <AppText variant="caption">Sin fondo</AppText>
                        </Pressable>
                        {savingsBuckets.map((b) => (
                          <Pressable
                            key={b.id ?? b.name}
                            testID={`onboarding-expense-bucket-${b.id}`}
                            accessibilityRole="button"
                            onPress={() => setExpBucketKey(b.id ?? b.name)}
                            style={{
                              minHeight: MIN_TOUCH_TARGET_PT,
                              paddingHorizontal: spacing.md,
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
                            <AppText variant="caption">{`Aporta a: ${b.name}`}</AppText>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* Optional Debt Link */}
                  {debts.length > 0 ? (
                    <View style={{ gap: spacing.xxs }}>
                      <AppText variant="caption" color={colors.text.secondary}>
                        Vincular a deuda (opcional):
                      </AppText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setExpDebtKey(null)}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            paddingHorizontal: spacing.md,
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
                          <AppText variant="caption">Sin deuda</AppText>
                        </Pressable>
                        {debts.map((d) => (
                          <Pressable
                            key={d.key ?? d.name}
                            testID={`onboarding-expense-debt-${d.key ?? d.name}`}
                            accessibilityRole="button"
                            onPress={() => setExpDebtKey(d.key ?? d.name)}
                            style={{
                              minHeight: MIN_TOUCH_TARGET_PT,
                              paddingHorizontal: spacing.md,
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
                            <AppText variant="caption">{`Abona a: ${d.name}`}</AppText>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-add-expense-button"
                      accessibilityRole="button"
                      onPress={handleAddExpense}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense} style={{ fontWeight: '600' }}>
                        + Agregar Gasto
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-cancel-add-expense"
                      accessibilityRole="button"
                      onPress={() => {
                        triggerSubtleAccordionAnimation();
                        setIsAddExpenseOpen(false);
                      }}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.text.secondary}>
                        Cancelar
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Step 6: Optional Provisions */}
          <GlassSurface elevated testID="onboarding-provisions-section">
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <StatusBadge label="PASO 6" status="moto" />
                <AppText variant="headline">Metas y Provisiones</AppText>
              </View>

              {provisions.length === 0 ? (
                <View
                  style={{
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <AppText variant="caption" color={colors.text.muted}>
                    Sin provisiones registradas. Si tienes metas personales, agrégalas
                    aquí.
                  </AppText>
                </View>
              ) : (
                provisions.map((p, idx) => (
                  <View
                    key={`${p.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <AppText variant="body">{p.name}</AppText>
                      <AppText variant="caption" color={colors.text.secondary}>
                        {`${formatCop(p.amountCop)} cada ${p.periodMonths} meses`}
                      </AppText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setProvisions((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.expense}>
                        Quitar
                      </AppText>
                    </Pressable>
                  </View>
                ))
              )}

              {!isAddProvisionOpen ? (
                <Pressable
                  testID="onboarding-toggle-add-provision"
                  accessibilityRole="button"
                  accessibilityLabel="Agregar nueva provisión o meta"
                  onPress={() => {
                    triggerSubtleAccordionAnimation();
                    setIsAddProvisionOpen(true);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: colors.semantic.motoSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.moto} style={{ fontWeight: '600' }}>
                    + Agregar Provisión
                  </AppText>
                </Pressable>
              ) : (
                <View
                  style={{
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppTextInput
                      testID="onboarding-provision-name-input"
                      value={provName}
                      onChangeText={setProvName}
                      placeholder="Meta (ej. Vacaciones)"
                      style={{
                        flex: 1.4,
                      }}
                    />
                    <AppTextInput
                      testID="onboarding-provision-amount-input"
                      value={provAmount}
                      onChangeText={setProvAmount}
                      keyboardType="numeric"
                      placeholder="Costo $"
                      style={{
                        flex: 1,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <AppTextInput
                        testID="onboarding-provision-months-input"
                        value={provMonths}
                        onChangeText={setProvMonths}
                        keyboardType="numeric"
                        placeholder="12"
                        style={{
                          width: 90,
                          textAlign: 'center',
                        }}
                      />
                      <AppText variant="caption" color={colors.text.secondary}>
                        meses
                      </AppText>
                    </View>

                    <Pressable
                      testID="onboarding-provision-kind-toggle"
                      accessibilityRole="button"
                      onPress={() =>
                        setProvKind((k) => (k === 'recurring' ? 'target_goal' : 'recurring'))
                      }
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.pill,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption">
                        {provKind === 'recurring' ? 'Provisión Periódica' : 'Meta Específica'}
                      </AppText>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Pressable
                      testID="onboarding-add-provision-button"
                      accessibilityRole="button"
                      onPress={handleAddProvision}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.specularBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.moto} style={{ fontWeight: '600' }}>
                        + Agregar Provisión
                      </AppText>
                    </Pressable>
                    <Pressable
                      testID="onboarding-cancel-add-provision"
                      accessibilityRole="button"
                      onPress={() => {
                        triggerSubtleAccordionAnimation();
                        setIsAddProvisionOpen(false);
                      }}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" color={colors.text.secondary}>
                        Cancelar
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </GlassSurface>

          {/* Complete Setup CTA */}
          <View style={{ gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
            <Pressable
              testID="complete-initial-setup-button"
              accessibilityRole="button"
              onPress={handleFinishSetup}
              style={{
                width: '100%',
                minHeight: 52,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
                borderRadius: radius.lg,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceElevatedTint,
                borderWidth: 1,
                borderColor: colors.glass.specularBorder,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText
                variant="headline"
                color={colors.semantic.income}
                style={{ fontWeight: '700' }}
              >
                {`Guardar e Iniciar ${formatMonthKeyLabelEs(computedMonthKey)}`}
              </AppText>
            </Pressable>
            <AppText variant="caption" color={colors.text.muted} style={{ textAlign: 'center' }}>
              Podrás modificar o agregar cualquier elemento en cualquier momento desde tu presupuesto.
            </AppText>
          </View>
        </View>
      );
    }