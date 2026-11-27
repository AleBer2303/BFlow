/**
 * src/features/onboarding/components/OnboardingProvisionsStep.tsx
 *
 * Step 5 of the onboarding: goals and provisions, with the same form as the Ahorros tab.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  GlassSurface,
  RevealDown,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import { formatCurrency } from '../../../domain';
import type {
  InitialOnboardingConfigInput,
  SaveProvisionItemInput,
} from '../../budget/store/useBudgetStore';
import { ProvisionItemForm } from '../../savings/components/ProvisionItemForm';
import {
  OnboardingEmptyNotice,
  OnboardingItemRow,
  OnboardingStepHeader,
  SectionToggleButton,
  type OnboardingFormSlotProps,
} from './onboardingStepParts';

export interface OnboardingProvisionsStepProps extends OnboardingFormSlotProps {
  provisions: NonNullable<InitialOnboardingConfigInput['provisions']>;
  onSaveProvision: (input: SaveProvisionItemInput) => void;
  onRemoveProvision: (idx: number) => void;
}

export const OnboardingProvisionsStep = React.memo(function OnboardingProvisionsStep({
  provisions,
  isFormOpen,
  formKey,
  onToggleForm,
  onCloseForm,
  onSaveProvision,
  onRemoveProvision,
}: OnboardingProvisionsStepProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();

  return (
    <GlassSurface elevated testID="onboarding-provisions-section">
      <View style={{ gap: spacing.sm }}>
        <OnboardingStepHeader
          stepLabel="PASO 5"
          status="provisions"
          title="Metas y Provisiones"
          countLabel={
            provisions.length > 0
              ? `${provisions.length} ${provisions.length === 1 ? 'meta' : 'metas'}`
              : null
          }
        />

        <SectionToggleButton
          testID="onboarding-toggle-add-provision"
          isOpen={isFormOpen}
          openLabel="+ Agregar Metas"
          openAccessibilityLabel="Abrir formulario de metas y provisiones"
          closeAccessibilityLabel="Cerrar formulario de metas y provisiones"
          tintBackground={colors.semantic.provisionsSoft}
          tintText={colors.semantic.provisions}
          onPress={onToggleForm}
        />

        <RevealDown visible={isFormOpen}>
          <ProvisionItemForm
            key={`provision-${formKey}`}
            item={null}
            onSaveProvisionItem={onSaveProvision}
            onClose={onCloseForm}
          />
        </RevealDown>

        {provisions.length === 0 ? (
          <OnboardingEmptyNotice text="Sin provisiones registradas. Si tienes metas personales o gastos periódicos, agrégalos aquí." />
        ) : (
          <View style={{ gap: spacing.xs }}>
            {provisions.map((p, idx) => {
              const monthlyQuota = Math.ceil(p.amountCop / Math.max(1, p.periodMonths));
              return (
                <OnboardingItemRow
                  key={`${p.name}-${idx}`}
                  testID={`onboarding-provision-item-${idx}`}
                  removeTestID={`onboarding-remove-provision-${idx}`}
                  itemName={p.name}
                  onRemove={() => onRemoveProvision(idx)}
                >
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
                </OnboardingItemRow>
              );
            })}
          </View>
        )}
      </View>
    </GlassSurface>
  );
});
