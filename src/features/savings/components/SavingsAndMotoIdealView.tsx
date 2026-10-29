/**
 * src/features/savings/components/SavingsAndMotoIdealView.tsx
 *
 * Implements Screens `08-savings-and-moto` & `09-moto-ideal`:
 * - Hero Card Total Ahorros (`K6`: `$ 4.380.000`)
 * - Fondo Moto (`K4`: `$ 2.300.000` = Apertura `$ 1.600.000` + Aportes pagados `$ 700.000`)
 * - Fondo Ahorros (`K5`: `$ 2.080.000` en caja hoy, y `$ 1.630.000` proyectado tras pendientes)
 * - Provisión "IDEAL" de la Moto (CB300F): `$ 872.667/mes` recurrente (`B43`), `$ 1.372.667` con meta
 *   `Kit de arrastre Honda original` (`$ 500.000` meta `2027-08`), y brecha operativa `- $ 172.667`.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCop,
  type MonthlySavingsSummary,
  type MotoIdealComparisonSummary,
} from '../../../domain';

export interface SavingsAndMotoIdealViewProps {
  savingsSummary: MonthlySavingsSummary;
  motoIdealSummary: MotoIdealComparisonSummary;
}

export function SavingsAndMotoIdealView({
  savingsSummary,
  motoIdealSummary,
}: SavingsAndMotoIdealViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  return (
    <View style={{ gap: spacing.md }} testID="savings-and-moto-ideal-view">
      {/* Screen 08: Hero Card Total Ahorros (K6) */}
      <GlassSurface elevated testID="savings-hero-card">
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="caption" color={colors.text.secondary}>
              Total Ahorros Acumulados (Celda K6)
            </AppText>
            <StatusBadge label="Moto + Ahorros" status="moto" />
          </View>

          <CurrencyText
            testID="savings-hero-total"
            amount={savingsSummary.totalCurrentSavings}
            variant="heroCurrency"
            tone="moto"
          />

          <AppText variant="caption" color={colors.text.secondary}>
            {`Total proyectado tras pagar pendientes: ${formatCop(savingsSummary.totalProjectedAfterPendingExpenses)}`}
          </AppText>
        </View>
      </GlassSurface>

      {/* Two Bucket Cards: Moto (K4) & Ahorros (K5) */}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <GlassSurface style={{ flex: 1 }} testID="bucket-moto-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="headline">Fondo Moto (K4)</AppText>
            <CurrencyText
              testID="bucket-moto-current"
              amount={savingsSummary.moto.currentBalance}
              variant="title2"
              tone="moto"
            />
            <AppText variant="micro" color={colors.text.secondary}>
              {`Mes pasado (J4): ${formatCop(savingsSummary.moto.openingBalance)}`}
            </AppText>
            <AppText variant="micro" color={colors.semantic.income}>
              {`+ Aportes pagados: ${formatCop(savingsSummary.moto.paidContributionsThisMonth)}`}
            </AppText>
          </View>
        </GlassSurface>

        <GlassSurface style={{ flex: 1 }} testID="bucket-savings-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="headline">Fondo Ahorros (K5)</AppText>
            <CurrencyText
              testID="bucket-savings-current"
              amount={savingsSummary.savings.currentBalance}
              variant="title2"
              tone="income"
            />
            <AppText variant="micro" color={colors.text.secondary}>
              {`Mes pasado (J5): ${formatCop(savingsSummary.savings.openingBalance)} + Flujo Neto ${formatCop(savingsSummary.savings.netCashFlowContribution)}`}
            </AppText>
            <AppText variant="micro" color={colors.semantic.pending}>
              {`Tras pendientes: ${formatCop(savingsSummary.savings.projectedAfterPendingExpenses)}`}
            </AppText>
          </View>
        </GlassSurface>
      </View>

      {/* Screen 09: Provisión IDEAL de la Moto (CB300F) */}
      <GlassSurface elevated testID="moto-ideal-card">
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="title2">Provisión IDEAL Moto (CB300F)</AppText>
            <StatusBadge
              label={`Celda B43: ${formatCop(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
              status="moto"
            />
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Total con Meta Kit de Arrastre: ${formatCop(motoIdealSummary.totalWithTargetGoalsCop)} · Aporte real este mes: ${formatCop(motoIdealSummary.actualMotoContributionCop)} (Brecha operativa: ${formatCop(motoIdealSummary.monthlyGapAgainstIdealCop)})`}
          </AppText>

          <View style={{ gap: spacing.xs }}>
            {motoIdealSummary.recurringItems.map((item) => (
              <View
                key={item.id}
                testID={`moto-ideal-item-${item.id}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <AppText variant="body">{item.displayName}</AppText>
                  <AppText variant="micro" color={colors.text.secondary}>
                    {item.periodMonths > 1
                      ? `Anual: ${formatCop(item.cycleCostCop)} / ${item.periodMonths} meses`
                      : item.actualBudgetedAmountCop !== undefined
                        ? `Vinculado en presupuesto · Real: ${formatCop(item.actualBudgetedAmountCop)}`
                        : 'Provisión mensual directa'}
                  </AppText>
                </View>
                <CurrencyText amount={item.excelMonthlyAmountCop} variant="body" tone="moto" />
              </View>
            ))}
          </View>

          {/* Target Goals (Kit de Arrastre Honda Original) */}
          {motoIdealSummary.targetGoals.map((goal) => (
            <View
              key={goal.id}
              testID={`moto-target-goal-${goal.id}`}
              style={{
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.motoSoft,
                borderWidth: 1,
                borderColor: colors.semantic.moto,
                gap: spacing.xs,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <AppText variant="headline">{`🎯 ${goal.displayName}`}</AppText>
                <StatusBadge label={`Meta: ${goal.targetMonthKey}`} status="moto" />
              </View>
              <AppText variant="caption" color={colors.text.secondary}>
                {`Objetivo total: ${formatCop(goal.targetAmountCop)} · Cuota sugerida (${goal.monthsUntilTarget} meses): ${formatCop(goal.suggestedMonthlySavingCop)}/mes`}
              </AppText>
            </View>
          ))}
        </View>
      </GlassSurface>
    </View>
  );
}
