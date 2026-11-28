/**
 * src/features/onboarding/components/OnboardingPeriodStep.tsx
 *
 * Step 1 of the onboarding: the month and year the budget starts in.
 */

import React from 'react';
import { View } from 'react-native';
import { AdaptiveSelectField, AppText, GlassSurface, StatusBadge, useBFlowTheme } from '../../../design-system';

type SelectOption = { value: string; label: string };

export const ONBOARDING_MONTH_OPTIONS: ReadonlyArray<SelectOption> = [
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

export interface OnboardingPeriodStepProps {
  yearOptions: ReadonlyArray<SelectOption>;
  selectedYear: string;
  /** Two digits, `01` to `12`. */
  selectedMonth: string;
  onSelectYear: (year: string) => void;
  onSelectMonth: (month: string) => void;
}

export const OnboardingPeriodStep = React.memo(function OnboardingPeriodStep({
  yearOptions,
  selectedYear,
  selectedMonth,
  onSelectYear,
  onSelectMonth,
}: OnboardingPeriodStepProps): React.JSX.Element {
  const { spacing } = useBFlowTheme();
  const activeMonthOption = ONBOARDING_MONTH_OPTIONS.find((m) => m.value === selectedMonth) ?? {
    value: '01',
    label: 'Enero',
  };

  return (
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
            onSelect={onSelectYear}
            triggerTestID="onboarding-year-dropdown-trigger"
            valueTestID="onboarding-year-input"
            pickerTestID="onboarding-year-picker"
            accessibilityLabel={`Año actual: ${selectedYear}. Toca para abrir el selector de año.`}
            containerStyle={{ flex: 1, minWidth: 112 }}
          />

          <AdaptiveSelectField
            label="Mes de inicio"
            title="Mes de Inicio"
            options={ONBOARDING_MONTH_OPTIONS}
            selectedValue={selectedMonth}
            onSelect={onSelectMonth}
            triggerTestID="onboarding-month-dropdown-trigger"
            pickerTestID="onboarding-month-picker"
            accessibilityLabel={`Mes actual: ${activeMonthOption.label}. Toca para abrir el selector.`}
            containerStyle={{ flex: 1.5, minWidth: 148 }}
          />
        </View>
      </View>
    </GlassSurface>
  );
});
