/**
 * src/features/onboarding/components/OnboardingMovementsStep.tsx
 *
 * Step 4 of the onboarding: the month's incomes and expenses. One form (the checklist's
 * `ChecklistAddMovementForm`) adds both; the step lists incomes first, then expenses with the
 * debt or fund each one feeds.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  RevealDown,
  useBFlowTheme,
} from '../../../design-system';
import type { Concept, Debt, MonthEntry, SavingsBucket } from '../../../domain';
import type { InitialOnboardingConfigInput } from '../../budget/store/useBudgetStore';
import { ChecklistAddMovementForm } from '../../checklist/components/ChecklistAddMovementForm';
import type { ChecklistWorkspaceViewProps } from '../../checklist/components/ChecklistWorkspaceView';
import {
  OnboardingEmptyNotice,
  OnboardingItemRow,
  OnboardingStepHeader,
  SectionToggleButton,
  type OnboardingFormSlotProps,
} from './onboardingStepParts';

const EMPTY_ENTRIES: readonly MonthEntry[] = [];
const EMPTY_CONCEPTS: readonly Concept[] = [];
const NOOP_COMPLETE_MOVEMENT: ChecklistWorkspaceViewProps['onAddOrCompleteMovement'] = () => {};

type CreateMovementHandler = NonNullable<ChecklistWorkspaceViewProps['onCreateCustomMovement']>;

interface OnboardingIncomesListProps {
  incomes: InitialOnboardingConfigInput['incomes'];
  onRemoveIncome: (idx: number) => void;
}

function OnboardingIncomesList({
  incomes,
  onRemoveIncome,
}: OnboardingIncomesListProps): React.JSX.Element {
  const { colors } = useBFlowTheme();

  return (
    <>
      {incomes.map((inc, idx) => (
        <OnboardingItemRow
          key={`inc-${inc.name}-${idx}`}
          testID={`onboarding-income-item-${idx}`}
          removeTestID={`onboarding-remove-income-${idx}`}
          itemName={inc.name}
          onRemove={() => onRemoveIncome(idx)}
        >
          <AppText variant="body">{inc.name}</AppText>
          <CurrencyText amount={inc.amountCop} variant="callout" tone="income" />
          <AppText variant="micro" color={colors.text.secondary}>
            {`${inc.group === 'fixed' ? 'Ingreso fijo' : 'Ingreso variable'} · ${
              inc.persistMonthly ? 'Cada mes' : 'Solo este mes'
            }`}
          </AppText>
        </OnboardingItemRow>
      ))}
    </>
  );
}

interface OnboardingExpensesListProps {
  expenses: InitialOnboardingConfigInput['expenses'];
  debtNameByKey: ReadonlyMap<string, string>;
  bucketNameById: ReadonlyMap<string, string>;
  onRemoveExpense: (idx: number) => void;
}

function OnboardingExpensesList({
  expenses,
  debtNameByKey,
  bucketNameById,
  onRemoveExpense,
}: OnboardingExpensesListProps): React.JSX.Element {
  const { colors } = useBFlowTheme();

  return (
    <>
      {expenses.map((exp, idx) => {
        const linkedDebt = exp.targetDebtKey ? debtNameByKey.get(exp.targetDebtKey) : undefined;
        const linkedBucket = exp.savingsBucketKey
          ? bucketNameById.get(exp.savingsBucketKey)
          : undefined;

        return (
          <OnboardingItemRow
            key={`exp-${exp.name}-${idx}`}
            testID={`onboarding-expense-item-${idx}`}
            removeTestID={`onboarding-remove-expense-${idx}`}
            itemName={exp.name}
            onRemove={() => onRemoveExpense(idx)}
          >
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
          </OnboardingItemRow>
        );
      })}
    </>
  );
}

export interface OnboardingMovementsStepProps extends OnboardingFormSlotProps {
  monthKey: string;
  incomes: InitialOnboardingConfigInput['incomes'];
  expenses: InitialOnboardingConfigInput['expenses'];
  /** The step's debts and funds, shaped for the form's selectors. */
  formDebts: readonly Debt[];
  formSavingsBuckets: readonly SavingsBucket[];
  debtNameByKey: ReadonlyMap<string, string>;
  bucketNameById: ReadonlyMap<string, string>;
  onCreateMovement: CreateMovementHandler;
  onRemoveIncome: (idx: number) => void;
  onRemoveExpense: (idx: number) => void;
}

export const OnboardingMovementsStep = React.memo(function OnboardingMovementsStep({
  monthKey,
  incomes,
  expenses,
  formDebts,
  formSavingsBuckets,
  debtNameByKey,
  bucketNameById,
  isFormOpen,
  formKey,
  onToggleForm,
  onCloseForm,
  onCreateMovement,
  onRemoveIncome,
  onRemoveExpense,
}: OnboardingMovementsStepProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const totalMovementsCount = incomes.length + expenses.length;

  return (
    <GlassSurface elevated testID="onboarding-movements-section">
      <View style={{ gap: spacing.sm }}>
        <OnboardingStepHeader
          stepLabel="PASO 4"
          status="completed"
          title="Movimientos del Mes"
          countLabel={
            totalMovementsCount > 0 ? `${incomes.length} ing. · ${expenses.length} gas.` : null
          }
        />

        <SectionToggleButton
          testID="onboarding-toggle-add-movement"
          isOpen={isFormOpen}
          openLabel="+ Nuevo Movimiento"
          openAccessibilityLabel="Abrir formulario de nuevo movimiento"
          closeAccessibilityLabel="Cerrar formulario de nuevo movimiento"
          tintBackground={colors.accent.container}
          tintText={colors.accent.onContainer}
          onPress={onToggleForm}
        />

        <RevealDown visible={isFormOpen}>
          <ChecklistAddMovementForm
            key={`movement-${formKey}`}
            monthKey={monthKey}
            monthEntries={EMPTY_ENTRIES}
            concepts={EMPTY_CONCEPTS}
            debts={formDebts}
            savingsBuckets={formSavingsBuckets}
            onAddOrCompleteMovement={NOOP_COMPLETE_MOVEMENT}
            onCreateCustomMovement={onCreateMovement}
            onSubmitted={onCloseForm}
          />
        </RevealDown>

        {totalMovementsCount === 0 ? (
          <OnboardingEmptyNotice text="Sin movimientos registrados. Agrega tus ingresos y gastos habituales, y vincúlalos a tus deudas o fondos." />
        ) : (
          <View style={{ gap: spacing.xs }}>
            <OnboardingIncomesList incomes={incomes} onRemoveIncome={onRemoveIncome} />
            <OnboardingExpensesList
              expenses={expenses}
              debtNameByKey={debtNameByKey}
              bucketNameById={bucketNameById}
              onRemoveExpense={onRemoveExpense}
            />
          </View>
        )}
      </View>
    </GlassSurface>
  );
});
