/**
 * src/features/onboarding/components/OnboardingSavingsStep.tsx
 *
 * Step 2 of the onboarding: savings funds and savings bank accounts, with the same
 * "+ Nuevo Ahorro" form as the Ahorros tab (Fondo · Cuenta de ahorros, ADR 0034).
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
import type {
  FinancialAccountInput,
  InitialOnboardingConfigInput,
  OnboardingFinancialAccountInput,
} from '../../budget/store/useBudgetStore';
import { SavingsForm } from '../../savings/components/SavingsForm';
import { OnboardingAccountsList } from './OnboardingAccountsList';
import {
  OnboardingEmptyNotice,
  OnboardingItemRow,
  OnboardingStepHeader,
  SectionToggleButton,
  type OnboardingFormSlotProps,
} from './onboardingStepParts';

export interface OnboardingSavingsStepProps extends OnboardingFormSlotProps {
  savingsBuckets: InitialOnboardingConfigInput['savingsBuckets'];
  /** Savings bank accounts only (`debitKind: 'savings'`). */
  savingsAccounts: readonly OnboardingFinancialAccountInput[];
  onCreateBucket: (name: string, openingBalanceCop: number) => void;
  onRemoveBucket: (idx: number, removedId?: string) => void;
  onCreateAccount: (input: FinancialAccountInput) => void;
  onRemoveAccount: (key: string) => void;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const OnboardingSavingsStep = React.memo(function OnboardingSavingsStep({
  savingsBuckets,
  savingsAccounts,
  isFormOpen,
  formKey,
  onToggleForm,
  onCloseForm,
  onCreateBucket,
  onRemoveBucket,
  onCreateAccount,
  onRemoveAccount,
}: OnboardingSavingsStepProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const countLabel = [
    savingsBuckets.length > 0 ? plural(savingsBuckets.length, 'fondo', 'fondos') : null,
    savingsAccounts.length > 0 ? plural(savingsAccounts.length, 'cuenta', 'cuentas') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <GlassSurface elevated testID="onboarding-savings-section">
      <View style={{ gap: spacing.sm }}>
        <OnboardingStepHeader
          stepLabel="PASO 2"
          status="savings"
          title="Fondos y Cuentas de Ahorro"
          countLabel={countLabel || null}
        />

        <SectionToggleButton
          testID="onboarding-toggle-add-bucket"
          isOpen={isFormOpen}
          openLabel="+ Nuevo Ahorro"
          openAccessibilityLabel="Abrir formulario de nuevo fondo o cuenta de ahorros"
          closeAccessibilityLabel="Cerrar formulario de nuevo fondo o cuenta de ahorros"
          tintBackground={colors.semantic.savingsSoft}
          tintText={colors.semantic.savings}
          onPress={onToggleForm}
        />

        <RevealDown visible={isFormOpen}>
          <SavingsForm
            key={`bucket-${formKey}`}
            onCreateSavingsBucket={onCreateBucket}
            onCreateAccount={onCreateAccount}
            onClose={onCloseForm}
          />
        </RevealDown>

        {savingsBuckets.length === 0 && savingsAccounts.length === 0 ? (
          <OnboardingEmptyNotice text="Sin fondos registrados. Agrega tus fondos o tus cuentas de ahorros, o omite este paso si no tienes." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {savingsBuckets.length > 0 ? (
              <View style={{ gap: spacing.xs }}>
                {savingsBuckets.map((bucket, idx) => (
                  <OnboardingItemRow
                    key={bucket.id ?? `${bucket.name}-${idx}`}
                    testID={`onboarding-bucket-item-${bucket.id ?? idx}`}
                    removeTestID={`onboarding-remove-bucket-${bucket.id ?? idx}`}
                    itemName={bucket.name}
                    onRemove={() => onRemoveBucket(idx, bucket.id)}
                  >
                    <AppText variant="body">{bucket.name}</AppText>
                    <CurrencyText
                      amount={bucket.openingBalanceCop}
                      variant="callout"
                      tone="savings"
                    />
                  </OnboardingItemRow>
                ))}
              </View>
            ) : null}
            <OnboardingAccountsList
              title="Cuentas de ahorro"
              accounts={savingsAccounts}
              onRemoveAccount={onRemoveAccount}
            />
          </View>
        )}
      </View>
    </GlassSurface>
  );
});
