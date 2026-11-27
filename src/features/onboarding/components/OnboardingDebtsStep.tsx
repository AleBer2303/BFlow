/**
 * src/features/onboarding/components/OnboardingDebtsStep.tsx
 *
 * Step 3 of the onboarding: debts and obligations, with the same form as the Deudas tab.
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
import { formatCurrency } from '../../../domain';
import type { InitialOnboardingConfigInput } from '../../budget/store/useBudgetStore';
import { DebtForm, type CreateDebtInput } from '../../debts/components/DebtForm';
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
  onCreateDebt: (input: CreateDebtInput) => void;
  onRemoveDebt: (idx: number, removedKey?: string) => void;
}

function describeDebtTerms(debt: OnboardingDebt): string {
  return [
    debt.interestRate !== undefined
      ? `Interés ${debt.interestRateType === 'annual' ? 'anual' : 'mensual'}: ${debt.interestRate}%`
      : null,
    debt.monthlyInstallmentCop ? `Cuota: ${formatCurrency(debt.monthlyInstallmentCop)}/mes` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export const OnboardingDebtsStep = React.memo(function OnboardingDebtsStep({
  debts,
  isFormOpen,
  formKey,
  onToggleForm,
  onCloseForm,
  onCreateDebt,
  onRemoveDebt,
}: OnboardingDebtsStepProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();

  return (
    <GlassSurface elevated testID="onboarding-debts-section">
      <View style={{ gap: spacing.sm }}>
        <OnboardingStepHeader
          stepLabel="PASO 3"
          status="debt"
          title="Deudas y Obligaciones"
          countLabel={
            debts.length > 0 ? `${debts.length} ${debts.length === 1 ? 'deuda' : 'deudas'}` : null
          }
        />

        <SectionToggleButton
          testID="onboarding-toggle-add-debt"
          isOpen={isFormOpen}
          openLabel="+ Nueva Deuda"
          openAccessibilityLabel="Abrir formulario de nueva deuda"
          closeAccessibilityLabel="Cerrar formulario de nueva deuda"
          tintBackground={colors.semantic.debtSoft}
          tintText={colors.semantic.debt}
          onPress={onToggleForm}
        />

        <RevealDown visible={isFormOpen}>
          <DebtForm
            key={`debt-${formKey}`}
            debt={null}
            onCreateDebt={onCreateDebt}
            onClose={onCloseForm}
          />
        </RevealDown>

        {debts.length === 0 ? (
          <OnboardingEmptyNotice text="Sin deudas registradas. Si estás libre de deudas, puedes omitir este paso." />
        ) : (
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
                    {describeDebtTerms(d)}
                  </AppText>
                ) : null}
              </OnboardingItemRow>
            ))}
          </View>
        )}
      </View>
    </GlassSurface>
  );
});
