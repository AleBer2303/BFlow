/**
 * src/features/debts/components/DebtsFunfamiView.tsx
 *
 * Implements Screen `07-debt-funfami` (Control de Deuda FUNFAMI):
 * - Hero Card Total Deuda FUNFAMI (`$ 6.200.000` after `$ 1.800.000` Oct installment)
 * - Editable monthly installment amount (`funfami-installment-amount-input` + `funfami-apply-installment-button`)
 * - Automatic waterfall payoff: once `CB300F - MOTO` reaches `$ 0`, it is removed from active obligations
 *   and any remaining or future installment automatically subtracts from `ESP. IA`.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCop,
  formatMonthKeyLabelEs,
  type FunfamiDebtSummary,
  type MonthEntry,
} from '../../../domain';

export interface DebtsFunfamiViewProps {
  debtSummary: FunfamiDebtSummary;
  funfamiEntry?: MonthEntry;
  onToggleFunfamiInstallment?: (entry: MonthEntry) => void;
  onUpdateFunfamiInstallmentAmount?: (newAmountCop: number) => void;
}

export function DebtsFunfamiView({
  debtSummary,
  funfamiEntry,
  onToggleFunfamiInstallment,
  onUpdateFunfamiInstallmentAmount,
}: DebtsFunfamiViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  const installmentAmount =
    funfamiEntry?.actualAmount ||
    funfamiEntry?.plannedAmount ||
    debtSummary.appliedInstallmentThisMonth ||
    1_800_000;

  const [installmentInput, setInstallmentInput] = useState<string>(String(installmentAmount));
  const [amountError, setAmountError] = useState<string | null>(null);

  useEffect(() => {
    setInstallmentInput(String(installmentAmount));
  }, [installmentAmount]);

  const paydownRatio =
    debtSummary.openingTotalDebt > 0
      ? debtSummary.appliedInstallmentThisMonth / debtSummary.openingTotalDebt
      : 0;
  const paydownPercent = Math.round(paydownRatio * 1000) / 10;
  const estimatedRemainingMonths = debtSummary.projection.remainingMonths;
  const monthShortLabel =
    formatMonthKeyLabelEs(debtSummary.monthKey).split(' ')[0]?.slice(0, 3) ?? 'Mes';
  const payoffLabel = debtSummary.projection.estimatedPayoffMonthKey
    ? formatMonthKeyLabelEs(debtSummary.projection.estimatedPayoffMonthKey)
    : 'Sin cuota activa';

  const handleApplyInstallmentAmount = () => {
    const digitsOnly = installmentInput.replace(/[^0-9]/g, '');
    const parsed = digitsOnly ? Number(digitsOnly) : 0;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      setAmountError('Ingresa una cuota entera mayor a $ 0 en pesos colombianos.');
      return;
    }
    setAmountError(null);
    if (onUpdateFunfamiInstallmentAmount) {
      onUpdateFunfamiInstallmentAmount(parsed);
    }
  };

  const motoDebtItem = debtSummary.debts.find((d) => d.debtId === 'debt_cb300f_moto');
  const isMotoDebtPaidOff = Boolean(motoDebtItem && motoDebtItem.remainingBalance === 0);

  // When CB300F - MOTO is 100% paid off (remainingBalance === 0), remove it from active obligations
  const activeObligations = debtSummary.debts.filter((d) => d.remainingBalance > 0);

  return (
    <View style={{ gap: spacing.md }} testID="debts-funfami-view">
      {/* Hero Card: Total Deuda FUNFAMI */}
      <GlassSurface elevated testID="funfami-hero-card">
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
            <AppText variant="caption" color={colors.text.secondary}>
              Total Deuda FUNFAMI
            </AppText>
            <StatusBadge
              label={
                debtSummary.isInstallmentPaid
                  ? `Cuota ${monthShortLabel} Pagada (${formatCop(installmentAmount)})`
                  : `Cuota ${monthShortLabel} Pendiente`
              }
              status={debtSummary.isInstallmentPaid ? 'completed' : 'pending'}
            />
          </View>

          <CurrencyText
            testID="funfami-hero-remaining"
            amount={debtSummary.totalRemainingDebt}
            variant="heroCurrency"
            tone="debt"
          />

          <AppText variant="caption" color={colors.text.secondary}>
            {`Apertura mes: ${formatCop(debtSummary.openingTotalDebt)} · Abono a capital (100%): - ${formatCop(debtSummary.appliedInstallmentThisMonth)}`}
          </AppText>

          {/* Progress Bar */}
          <View
            style={{
              height: 10,
              borderRadius: radius.pill,
              backgroundColor: colors.glass.surfaceTint,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
            }}
          >
            <View
              style={{
                width: `${Math.min(100, Math.max(4, paydownPercent))}%`,
                height: '100%',
                backgroundColor: colors.semantic.debt,
              }}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            <AppText variant="micro" color={colors.semantic.debt}>
              {`${paydownPercent}% reducido este mes`}
            </AppText>
            <AppText variant="micro" color={colors.text.secondary}>
              {`Proyección libertad financiera: ~${estimatedRemainingMonths} cuotas (${payoffLabel})`}
            </AppText>
          </View>

          {/* Modify Monthly Installment Amount */}
          <View style={{ gap: spacing.xs, paddingTop: spacing.xxs }}>
            <AppText variant="micro" color={colors.text.secondary}>
              Modificar monto a pagar este mes (COP):
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
              <TextInput
                testID="funfami-installment-amount-input"
                value={installmentInput}
                onChangeText={setInstallmentInput}
                keyboardType="numeric"
                placeholder="Ej. 1800000"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <Pressable
                testID="funfami-apply-installment-button"
                accessibilityRole="button"
                onPress={handleApplyInstallmentAmount}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption">Actualizar cuota</AppText>
              </Pressable>
            </View>
            {amountError ? (
              <AppText variant="micro" color={colors.semantic.expense}>
                {amountError}
              </AppText>
            ) : null}
          </View>

          {funfamiEntry && onToggleFunfamiInstallment ? (
            <Pressable
              testID="debts-view-toggle-installment"
              accessibilityRole="button"
              onPress={() => onToggleFunfamiInstallment(funfamiEntry)}
              style={{
                width: '100%',
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: debtSummary.isInstallmentPaid
                  ? colors.semantic.completedSoft
                  : colors.semantic.debtSoft,
                borderWidth: 1,
                borderColor: debtSummary.isInstallmentPaid
                  ? colors.semantic.completed
                  : colors.semantic.debt,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText
                variant="caption"
                color={
                  debtSummary.isInstallmentPaid
                    ? colors.semantic.completed
                    : colors.semantic.debt
                }
              >
                {debtSummary.isInstallmentPaid
                  ? `✓ Cuota FUNFAMI Pagada (${formatCop(installmentAmount)}) · Toca para marcar pendiente`
                  : `○ Marcar Cuota FUNFAMI (${formatCop(installmentAmount)}) como Pagada`}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>

      {/* Banner when CB300F - MOTO is 100% paid off */}
      {isMotoDebtPaidOff ? (
        <GlassSurface testID="moto-debt-completed-banner">
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="headline" color={colors.semantic.completed}>
              ✨ Deuda CB300F - MOTO completada y eliminada
            </AppText>
            <AppText variant="caption" color={colors.text.secondary}>
              El saldo de la moto llegó a $ 0. A partir de este momento los pagos se descuentan automáticamente de la deuda ESP. IA.
            </AppText>
          </View>
        </GlassSurface>
      ) : null}

      {/* Individual Active Obligations Breakdown */}
      {activeObligations.map((debt) => (
        <GlassSurface key={debt.debtId} testID={`debt-card-${debt.debtId}`}>
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
              <AppText variant="title2">{debt.name}</AppText>
              <StatusBadge
                label={
                  debt.appliedPrincipalThisMonth > 0
                    ? `Abono - ${formatCop(debt.appliedPrincipalThisMonth)}`
                    : 'Sin abono este mes'
                }
                status={debt.appliedPrincipalThisMonth > 0 ? 'completed' : 'info'}
              />
            </View>

            <CurrencyText
              testID={`debt-remaining-${debt.debtId}`}
              amount={debt.remainingBalance}
              variant="title1"
              tone="debt"
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: spacing.xs,
                paddingTop: spacing.xxs,
              }}
            >
              <AppText variant="caption" color={colors.text.secondary}>
                {`Saldo apertura (${debtSummary.monthKey}): ${formatCop(debt.openingBalance)}`}
              </AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {`Acreedor: ${debt.lender}`}
              </AppText>
            </View>
          </View>
        </GlassSurface>
      ))}
    </View>
  );
}
