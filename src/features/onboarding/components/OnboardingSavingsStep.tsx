/**
 * src/features/onboarding/components/OnboardingSavingsStep.tsx
 *
 * Step 2 of the onboarding: savings funds, with the same form as the Ahorros tab.
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
import type { InitialOnboardingConfigInput } from '../../budget/store/useBudgetStore';
import { NewSavingsBucketForm } from '../../savings/components/SavingsBucketForms';
import {
  OnboardingEmptyNotice,
  OnboardingItemRow,
  OnboardingStepHeader,
  SectionToggleButton,
  type OnboardingFormSlotProps,
} from './onboardingStepParts';

export interface OnboardingSavingsStepProps extends OnboardingFormSlotProps {
  savingsBuckets: InitialOnboardingConfigInput['savingsBuckets'];
  onCreateBucket: (name: string, openingBalanceCop: number) => void;
  onRemoveBucket: (idx: number, removedId?: string) => void;
}

export const OnboardingSavingsStep = React.memo(function OnboardingSavingsStep({
  savingsBuckets,
  isFormOpen,
  formKey,
  onToggleForm,
  onCloseForm,
  onCreateBucket,
  onRemoveBucket,
}: OnboardingSavingsStepProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();

  return (
    <GlassSurface elevated testID="onboarding-savings-section">
      <View style={{ gap: spacing.sm }}>
        <OnboardingStepHeader
          stepLabel="PASO 2"
          status="savings"
          title="Fondos de Ahorro"
          countLabel={
            savingsBuckets.length > 0
              ? `${savingsBuckets.length} ${savingsBuckets.length === 1 ? 'fondo' : 'fondos'}`
              : null
          }
        />

        <SectionToggleButton
          testID="onboarding-toggle-add-bucket"
          isOpen={isFormOpen}
          openLabel="+ Nuevo Fondo"
          openAccessibilityLabel="Abrir formulario de nuevo fondo de ahorro"
          closeAccessibilityLabel="Cerrar formulario de nuevo fondo de ahorro"
          tintBackground={colors.semantic.savingsSoft}
          tintText={colors.semantic.savings}
          onPress={onToggleForm}
        />

        <RevealDown visible={isFormOpen}>
          <NewSavingsBucketForm
            key={`bucket-${formKey}`}
            onCreateSavingsBucket={onCreateBucket}
            onClose={onCloseForm}
          />
        </RevealDown>

        {savingsBuckets.length === 0 ? (
          <OnboardingEmptyNotice text="Sin fondos registrados. Si no tienes fondos de ahorro, puedes omitir este paso." />
        ) : (
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
                <CurrencyText amount={bucket.openingBalanceCop} variant="callout" tone="savings" />
              </OnboardingItemRow>
            ))}
          </View>
        )}
      </View>
    </GlassSurface>
  );
});
