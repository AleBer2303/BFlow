/**
 * src/features/onboarding/components/OnboardingDebtsStep.tsx
 *
 * Step 3 of the onboarding: debts, credit cards and checking accounts, with the same
 * "+ Nueva Deuda" form as the Deudas tab (Deuda · Crédito · Débito, ADR 0034).
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  RevealDown,
  useAmountPrivacy,
  useBFlowTheme,
} from '../../../design-system';
import type {
  FinancialAccountInput,
  InitialOnboardingConfigInput,
  OnboardingFinancialAccountInput,
} from '../../budget/store/useBudgetStore';
import { DebtForm, type CreateDebtInput } from '../../debts/components/DebtForm';
import { OnboardingAccountsList } from './OnboardingAccountsList';
import {
  OnboardingEmptyNotice,
  OnboardingItemRow,
  OnboardingStepHeader,
  SectionToggleButton,
  type OnboardingFormSlotProps,
} from './onboardingStepParts';

type OnboardingDebt = InitialOnboardingConfigInput['debts'][number];

export interface OnboardingDebtsStepProps extends OnboardingFormSlotProps {
  debts: InitialOnboardingConfigInput['debts'];
  /** Credit cards and checking accounts (savings accounts go in step 2). */
  accounts: readonly OnboardingFinancialAccountInput[];
  onCreateDebt: (input: CreateDebtInput) => void;
  onRemoveDebt: (idx: number, removedKey?: string) => void;
  onCreateAccount: (input: FinancialAccountInput) => void;
  onRemoveAccount: (key: string) => void;
}

function describeDebtTerms(debt: OnboardingDebt, formatAmount: (amount: number) => string): string {
  return [
    debt.interestRate !== undefined
      ? `Interés ${debt.interestRateType === 'annual' ? 'anual' : 'mensual'}: ${debt.interestRate}%`
      : null,
    debt.monthlyInstallmentCop ? `Cuota: ${formatAmount(debt.monthlyInstallmentCop)}/mes` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const OnboardingDebtsStep = React.memo(function OnboardingDebtsStep({
  debts,
  accounts,
  isFormOpen,
  formKey,
  onToggleForm,
  onCloseForm,
  onCreateDebt,
  onRemoveDebt,
  onCreateAccount,
  onRemoveAccount,
}: OnboardingDebtsStepProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const { formatAmount } = useAmountPrivacy();
  const countLabel = [
    debts.length > 0 ? plural(debts.length, 'deuda', 'deudas') : null,
    accounts.length > 0 ? plural(accounts.length, 'tarjeta o cuenta', 'tarjetas y cuentas') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <GlassSurface elevated testID="onboarding-debts-section">
      <View style={{ gap: spacing.sm }}>
        <OnboardingStepHeader
          stepLabel="PASO 3"
          status="debt"
          title="Deudas, Tarjetas y Cuentas"
          countLabel={countLabel || null}
        />

        <SectionToggleButton
          testID="onboarding-toggle-add-debt"
          isOpen={isFormOpen}
          openLabel="+ Nueva Deuda"
          openAccessibilityLabel="Abrir formulario de nueva deuda, tarjeta o cuenta"
          closeAccessibilityLabel="Cerrar formulario de nueva deuda, tarjeta o cuenta"
          tintBackground={colors.semantic.debtSoft}
          tintText={colors.semantic.debt}
          onPress={onToggleForm}
        />

        <RevealDown visible={isFormOpen}>
          <DebtForm
            key={`debt-${formKey}`}
            debt={null}
            onCreateDebt={onCreateDebt}
            onCreateAccount={onCreateAccount}
            onClose={onCloseForm}
          />
        </RevealDown>

        {debts.length === 0 && accounts.length === 0 ? (
          <OnboardingEmptyNotice text="Sin deudas registradas. Aquí también puedes agregar tus tarjetas de crédito y cuentas corrientes, o omitir este paso." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {debts.length > 0 ? (
              <View style={{ gap: spacing.xs }}>
                {debts.map((d, idx) => (
                  <OnboardingItemRow
                    key={d.key ?? `${d.name}-${idx}`}
                    testID={`onboarding-debt-item-${d.key ?? idx}`}
                    removeTestID={`onboarding-remove-debt-${d.key ?? idx}`}
                    itemName={d.name}
                    onRemove={() => onRemoveDebt(idx, d.key)}
                  >
                    <AppText variant="body">{`${d.name} (${d.lender})`}</AppText>
                    <CurrencyText amount={d.openingBalanceCop} variant="callout" tone="debt" />
                    {d.interestRate !== undefined || d.monthlyInstallmentCop ? (
                      <AppText variant="micro" color={colors.text.secondary}>
                        {describeDebtTerms(d, formatAmount)}
                      </AppText>
                    ) : null}
                  </OnboardingItemRow>
                ))}
              </View>
            ) : null}
            <OnboardingAccountsList
              title="Tarjetas y cuentas"
              accounts={accounts}
              onRemoveAccount={onRemoveAccount}
            />
          </View>
        )}
      </View>
    </GlassSurface>
  );
});
