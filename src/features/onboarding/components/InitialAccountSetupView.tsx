/**
 * src/features/onboarding/components/InitialAccountSetupView.tsx
 *
 * Guided initial account setup wizard for first-time users and after an account reset.
 * Holds what the user configures and the single open form; each step is its own component
 * (`OnboardingPeriodStep`, `OnboardingSavingsStep`, `OnboardingDebtsStep`,
 * `OnboardingMovementsStep`, `OnboardingProvisionsStep`) and reuses the workspace forms inside
 * `RevealDown`, with a two-column layout on wide screens and parity across iOS, Android and Web.
 * Credit cards and checking accounts are registered in the debts step and savings accounts in
 * the savings step, as in the Deudas and Ahorros tabs; movements can be linked to them (ADR 0034).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  GlassSurface,
  hapticService,
  ResponsiveColumns,
  ScrollDepthHero,
  StatusBadge,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatMonthKeyLabelEs,
  isSavingsAccount,
  toAppMonthKey,
  toSlugId,
  type Debt,
  type FinancialAccount,
  type SavingsBucket,
} from '../../../domain';
import {
  buildFinancialAccount,
  type FinancialAccountInput,
  type InitialOnboardingConfigInput,
  type OnboardingFinancialAccountInput,
  type SaveProvisionItemInput,
} from '../../budget/store/useBudgetStore';
import type { ChecklistWorkspaceViewProps } from '../../checklist/components/ChecklistWorkspaceView';
import type { CreateDebtInput } from '../../debts/components/DebtForm';
import { OnboardingDebtsStep } from './OnboardingDebtsStep';
import { OnboardingMovementsStep } from './OnboardingMovementsStep';
import { OnboardingPeriodStep } from './OnboardingPeriodStep';
import { OnboardingProvisionsStep } from './OnboardingProvisionsStep';
import { OnboardingSavingsStep } from './OnboardingSavingsStep';

export interface InitialAccountSetupViewProps {
  defaultMonthKey?: string;
  onMonthKeyChange?: (monthKey: string) => void;
  onCompleteSetup: (config: InitialOnboardingConfigInput) => void;
}

type ActiveOnboardingForm = 'bucket' | 'debt' | 'movement' | 'provision' | null;

function buildBucketSlug(name: string, existingIds: ReadonlySet<string>): string {
  const slug = toSlugId(name);
  const base = `bucket_${slug || Date.now().toString(36)}`;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

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
  const [financialAccounts, setFinancialAccounts] = useState<OnboardingFinancialAccountInput[]>(
    []
  );

  // Single active form slot + remount key so every form starts clean and isolated
  const [activeForm, setActiveForm] = useState<ActiveOnboardingForm>(null);
  const [formKey, setFormKey] = useState(0);
  const debtSeqRef = useRef(0);
  const accountSeqRef = useRef(0);

  const toggleForm = useCallback((target: Exclude<ActiveOnboardingForm, null>) => {
    hapticService.light();
    setActiveForm((prev) => {
      if (prev === target) return null;
      setFormKey((key) => key + 1);
      return target;
    });
  }, []);

  const toggleBucketForm = useCallback(() => toggleForm('bucket'), [toggleForm]);
  const toggleDebtForm = useCallback(() => toggleForm('debt'), [toggleForm]);
  const toggleMovementForm = useCallback(() => toggleForm('movement'), [toggleForm]);
  const toggleProvisionForm = useCallback(() => toggleForm('provision'), [toggleForm]);

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

  // Cards and accounts as they will be stored, for the movement form's account selector.
  const formAccounts = useMemo<FinancialAccount[]>(
    () => financialAccounts.map((a) => buildFinancialAccount(a.key, computedMonthKey, a)),
    [computedMonthKey, financialAccounts]
  );
  const savingsAccounts = useMemo(
    () => financialAccounts.filter((a) => isSavingsAccount(a)),
    [financialAccounts]
  );
  const debtsStepAccounts = useMemo(
    () => financialAccounts.filter((a) => !isSavingsAccount(a)),
    [financialAccounts]
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

  // Same rule as createFinancialAccount: an account needs a name and an entity.
  const handleCreateAccount = useCallback((input: FinancialAccountInput) => {
    if (!input.name.trim() || !input.institution.trim()) return;
    hapticService.trigger('success');
    accountSeqRef.current += 1;
    const key = `acc_${Date.now().toString(36)}_${accountSeqRef.current}`;
    setFinancialAccounts((prev) => [...prev, { ...input, key }]);
  }, []);

  const handleRemoveAccount = useCallback((removedKey: string) => {
    hapticService.trigger('warning');
    setFinancialAccounts((prev) => prev.filter((a) => a.key !== removedKey));
    setIncomes((prev) =>
      prev.map((inc) => (inc.accountKey === removedKey ? { ...inc, accountKey: null } : inc))
    );
    setExpenses((prev) =>
      prev.map((exp) => {
        if (exp.accountKey !== removedKey) return exp;
        const { accountRole: _role, ...rest } = exp;
        return { ...rest, accountKey: null };
      })
    );
  }, []);

  const handleCreateMovement = useCallback<
    NonNullable<ChecklistWorkspaceViewProps['onCreateCustomMovement']>
  >((input) => {
    hapticService.trigger('success');
    const amountCop = input.amount ?? input.amountCop ?? 0;
    const persistMonthly = input.persistMonthly !== false;
    const accountKey = input.accountId ?? null;

    if (input.type === 'income') {
      setIncomes((prev) => [
        ...prev,
        {
          name: input.name,
          amountCop,
          group: input.group,
          persistMonthly,
          ...(accountKey ? { accountKey } : {}),
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
        ...(accountKey
          ? { accountKey, ...(input.accountRole ? { accountRole: input.accountRole } : {}) }
          : {}),
      },
    ]);
  }, []);

  const handleRemoveIncome = useCallback((idx: number) => {
    hapticService.trigger('warning');
    setIncomes((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleRemoveExpense = useCallback((idx: number) => {
    hapticService.trigger('warning');
    setExpenses((prev) => prev.filter((_, i) => i !== idx));
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

  const handleRemoveProvision = useCallback((idx: number) => {
    hapticService.trigger('warning');
    setProvisions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleFinishSetup = useCallback(() => {
    onCompleteSetup({
      monthKey: computedMonthKey,
      incomes,
      expenses,
      debts,
      savingsBuckets,
      provisions,
      financialAccounts,
    });
  }, [
    computedMonthKey,
    debts,
    expenses,
    financialAccounts,
    incomes,
    onCompleteSetup,
    provisions,
    savingsBuckets,
  ]);

  const totalMovementsCount = incomes.length + expenses.length;
  const totalConfiguredItems =
    savingsBuckets.length +
    debts.length +
    financialAccounts.length +
    totalMovementsCount +
    provisions.length;

  const summaryPills = useMemo(
    () => [
      { id: 'buckets', label: `Fondos (${savingsBuckets.length})`, status: 'savings' as const },
      { id: 'debts', label: `Deudas (${debts.length})`, status: 'debt' as const },
      {
        id: 'accounts',
        label: `Tarjetas y cuentas (${financialAccounts.length})`,
        status: 'provisions' as const,
      },
      { id: 'movements', label: `Movimientos (${totalMovementsCount})`, status: 'info' as const },
      { id: 'provisions', label: `Metas (${provisions.length})`, status: 'provisions' as const },
    ],
    [
      debts.length,
      financialAccounts.length,
      provisions.length,
      savingsBuckets.length,
      totalMovementsCount,
    ]
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
          <OnboardingPeriodStep
            yearOptions={yearOptions}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onSelectYear={setSelectedYear}
            onSelectMonth={setSelectedMonth}
          />
          <OnboardingSavingsStep
            savingsBuckets={savingsBuckets}
            savingsAccounts={savingsAccounts}
            isFormOpen={activeForm === 'bucket'}
            formKey={formKey}
            onToggleForm={toggleBucketForm}
            onCloseForm={handleCloseActiveForm}
            onCreateBucket={handleCreateBucket}
            onRemoveBucket={handleRemoveBucket}
            onCreateAccount={handleCreateAccount}
            onRemoveAccount={handleRemoveAccount}
          />
          <OnboardingDebtsStep
            debts={debts}
            accounts={debtsStepAccounts}
            isFormOpen={activeForm === 'debt'}
            formKey={formKey}
            onToggleForm={toggleDebtForm}
            onCloseForm={handleCloseActiveForm}
            onCreateDebt={handleCreateDebt}
            onRemoveDebt={handleRemoveDebt}
            onCreateAccount={handleCreateAccount}
            onRemoveAccount={handleRemoveAccount}
          />
        </View>

        {/* Right Column: Movements (Incomes + Expenses) & Provisions/Goals */}
        <View style={{ gap: spacing.md }}>
          <OnboardingMovementsStep
            monthKey={computedMonthKey}
            incomes={incomes}
            expenses={expenses}
            formDebts={formDebts}
            formSavingsBuckets={formSavingsBuckets}
            formAccounts={formAccounts}
            debtNameByKey={debtNameByKey}
            bucketNameById={bucketNameById}
            isFormOpen={activeForm === 'movement'}
            formKey={formKey}
            onToggleForm={toggleMovementForm}
            onCloseForm={handleCloseActiveForm}
            onCreateMovement={handleCreateMovement}
            onRemoveIncome={handleRemoveIncome}
            onRemoveExpense={handleRemoveExpense}
          />
          <OnboardingProvisionsStep
            provisions={provisions}
            isFormOpen={activeForm === 'provision'}
            formKey={formKey}
            onToggleForm={toggleProvisionForm}
            onCloseForm={handleCloseActiveForm}
            onSaveProvision={handleSaveProvision}
            onRemoveProvision={handleRemoveProvision}
          />
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
