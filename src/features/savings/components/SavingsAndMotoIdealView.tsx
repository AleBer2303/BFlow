/**
 * src/features/savings/components/SavingsAndMotoIdealView.tsx
 *
 * Implements Screens `08-savings-and-moto` & `09-moto-ideal`:
 * - Hero Card Total Ahorros (`$ 4.380.000`)
 * - Fondo Moto (`$ 2.300.000` = Apertura `$ 1.600.000` + Aportes pagados `$ 700.000`)
 * - Fondo Ahorros (`$ 2.080.000` en caja hoy, y `$ 1.630.000` proyectado tras pendientes)
 * - Provisión "IDEAL" de la Moto (CB300F): `$ 872.667/mes` recurrente, `$ 1.372.667` con meta
 *   `Kit de arrastre Honda original` (`$ 500.000` meta `2027-08`), y brecha operativa `- $ 172.667`.
 */

import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
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

const MIN_TOUCH_TARGET_PT = 44;

export interface SavingsAndMotoIdealViewProps {
  savingsSummary: MonthlySavingsSummary;
  motoIdealSummary: MotoIdealComparisonSummary;
  onUpdateOpeningBalance?: (bucketId: 'moto' | 'savings', newBalanceCop: number) => void;
}

export function SavingsAndMotoIdealView({
  savingsSummary,
  motoIdealSummary,
  onUpdateOpeningBalance,
}: SavingsAndMotoIdealViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const [isEditingBalances, setIsEditingBalances] = useState(false);
  const [motoBalanceInput, setMotoBalanceInput] = useState(
    String(savingsSummary.moto.openingBalance)
  );
  const [savingsBalanceInput, setSavingsBalanceInput] = useState(
    String(savingsSummary.savings.openingBalance)
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const handleSaveBalances = () => {
    const motoDigits = motoBalanceInput.replace(/[^0-9]/g, '');
    const savingsDigits = savingsBalanceInput.replace(/[^0-9]/g, '');
    const motoNum = motoDigits ? Number(motoDigits) : 0;
    const savingsNum = savingsDigits ? Number(savingsDigits) : 0;

    if (!Number.isSafeInteger(motoNum) || motoNum < 0) {
      setBalanceError('Ingresa un valor entero válido para el Fondo Moto.');
      return;
    }
    if (!Number.isSafeInteger(savingsNum) || savingsNum < 0) {
      setBalanceError('Ingresa un valor entero válido para el Fondo Ahorros.');
      return;
    }

    if (onUpdateOpeningBalance) {
      onUpdateOpeningBalance('moto', motoNum);
      onUpdateOpeningBalance('savings', savingsNum);
    }
    setIsEditingBalances(false);
    setBalanceError(null);
  };

  return (
    <View style={{ gap: spacing.md }} testID="savings-and-moto-ideal-view">
      {/* Screen 08: Hero Card Total Ahorros */}
      <GlassSurface elevated testID="savings-hero-card">
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
            <AppText variant="caption" color={colors.text.secondary}>
              Total Ahorros Acumulados
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

      {/* Two Bucket Cards: Moto & Ahorros */}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <GlassSurface style={{ flex: 1 }} testID="bucket-moto-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="headline">Fondo Moto</AppText>
            <CurrencyText
              testID="bucket-moto-current"
              amount={savingsSummary.moto.currentBalance}
              variant="title2"
              tone="moto"
            />
            <AppText variant="micro" color={colors.text.secondary}>
              {`Saldo mes anterior: ${formatCop(savingsSummary.moto.openingBalance)}`}
            </AppText>
            <AppText variant="micro" color={colors.semantic.income}>
              {`+ Aportes pagados: ${formatCop(savingsSummary.moto.paidContributionsThisMonth)}`}
            </AppText>
          </View>
        </GlassSurface>

        <GlassSurface style={{ flex: 1 }} testID="bucket-savings-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="headline">Fondo Ahorros</AppText>
            <CurrencyText
              testID="bucket-savings-current"
              amount={savingsSummary.savings.currentBalance}
              variant="title2"
              tone="income"
            />
            <AppText variant="micro" color={colors.text.secondary}>
              {`Saldo mes anterior: ${formatCop(savingsSummary.savings.openingBalance)} + Flujo Neto ${formatCop(savingsSummary.savings.netCashFlowContribution)}`}
            </AppText>
            <AppText variant="micro" color={colors.semantic.pending}>
              {`Tras pendientes: ${formatCop(savingsSummary.savings.projectedAfterPendingExpenses)}`}
            </AppText>
          </View>
        </GlassSurface>
      </View>

      {/* Adjust Opening Balances Button (Full Width, below the two buckets) */}
      <Pressable
        testID="open-edit-opening-balance-button"
        accessibilityRole="button"
        accessibilityLabel="Ajustar saldos mes anterior"
        onPress={() => {
          setIsEditingBalances(!isEditingBalances);
          setMotoBalanceInput(String(savingsSummary.moto.openingBalance));
          setSavingsBalanceInput(String(savingsSummary.savings.openingBalance));
          setBalanceError(null);
        }}
        style={{
          width: '100%',
          minHeight: MIN_TOUCH_TARGET_PT,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: isEditingBalances
            ? colors.glass.surfaceElevatedTint
            : colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor: isEditingBalances
            ? colors.glass.specularBorder
            : colors.glass.subtleBorder,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <AppText
          variant="caption"
          color={isEditingBalances ? colors.text.primary : colors.text.secondary}
        >
          {isEditingBalances ? '✕ Cancelar ajuste' : '✏️ Ajustar saldos mes anterior'}
        </AppText>
      </Pressable>

      {/* Edit Opening Balances Sheet */}
      {isEditingBalances ? (
        <GlassSurface elevated testID="edit-opening-balances-card">
          <View style={{ gap: spacing.sm }}>
            <AppText variant="headline">Ajustar Saldos del Mes Anterior</AppText>
            <AppText variant="micro" color={colors.text.secondary}>
              Valores base con los que arrancó el mes (Fondo Moto: $ 1.600.000, Ahorros: $ 1.000.000).
            </AppText>

            <View style={{ gap: spacing.xs }}>
              <AppText variant="caption">Saldo mes anterior Fondo Moto</AppText>
              <TextInput
                testID="moto-opening-balance-input"
                value={motoBalanceInput}
                onChangeText={setMotoBalanceInput}
                keyboardType="numeric"
                placeholder="1600000"
                placeholderTextColor={colors.text.muted}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <AppText variant="caption">Saldo mes anterior Fondo Ahorros</AppText>
              <TextInput
                testID="savings-opening-balance-input"
                value={savingsBalanceInput}
                onChangeText={setSavingsBalanceInput}
                keyboardType="numeric"
                placeholder="1000000"
                placeholderTextColor={colors.text.muted}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            {balanceError ? (
              <AppText variant="caption" color={colors.semantic.expense}>
                {balanceError}
              </AppText>
            ) : null}

            <Pressable
              testID="save-opening-balances-button"
              accessibilityRole="button"
              accessibilityLabel="Guardar Saldos"
              onPress={handleSaveBalances}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.incomeSoft,
                borderWidth: 1,
                borderColor: colors.semantic.income,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="body" color={colors.semantic.income}>
                Guardar Saldos
              </AppText>
            </Pressable>
          </View>
        </GlassSurface>
      ) : null}

      {/* Screen 09: Provisión IDEAL de la Moto (CB300F) */}
      <GlassSurface elevated testID="moto-ideal-card">
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
            <View style={{ flex: 1 }}>
              <AppText variant="title2">Provisión IDEAL Moto (CB300F)</AppText>
            </View>
            <StatusBadge
              label={`Cuota ideal: ${formatCop(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
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
                  gap: spacing.sm,
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
                <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                  <CurrencyText amount={item.excelMonthlyAmountCop} variant="body" tone="moto" />
                </View>
              </View>
            ))}
          </View>

          {/* Target Goals (Kit de Arrastre Honda Original) — Polished layout for iPhone 16 Pro Max */}
          {motoIdealSummary.targetGoals.map((goal) => (
            <View
              key={goal.id}
              testID={`moto-target-goal-${goal.id}`}
              style={{
                padding: spacing.md,
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
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: spacing.xs,
                }}
              >
                <View style={{ flex: 1, minWidth: 180 }}>
                  <AppText variant="headline">{`🎯 ${goal.displayName}`}</AppText>
                </View>
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
