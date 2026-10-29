/**
 * src/features/debts/components/DebtsFunfamiView.tsx
 *
 * Implements Screen `07-debt-funfami` (Control de Deuda FUNFAMI):
 * - Hero Card Total Deuda FUNFAMI (`$ 6.200.000` after `$ 1.800.000` Oct installment)
 * - De-leveraging progress bar (`22.5%` reduced in Oct 2026 from `$ 8.000.000`)
 * - Freedom projection (`~4 meses · Febrero 2027` at `$ 1.800.000/mes` 100% principal)
 * - Individual cards for `CB300F - MOTO` (`$ 4.400.000 -> $ 2.600.000`) and `ESP. IA` (`$ 3.600.000 -> $ 3.600.000`)
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import { formatCop, type FunfamiDebtSummary, type MonthEntry } from '../../../domain';

export interface DebtsFunfamiViewProps {
  debtSummary: FunfamiDebtSummary;
  funfamiEntry?: MonthEntry;
  onToggleFunfamiInstallment?: (entry: MonthEntry) => void;
}

export function DebtsFunfamiView({
  debtSummary,
  funfamiEntry,
  onToggleFunfamiInstallment,
}: DebtsFunfamiViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  const paydownRatio =
    debtSummary.openingTotalDebt > 0
      ? debtSummary.appliedInstallmentThisMonth / debtSummary.openingTotalDebt
      : 0;
  const paydownPercent = Math.round(paydownRatio * 1000) / 10;
  const estimatedRemainingMonths = debtSummary.projection.remainingMonths;

  return (
    <View style={{ gap: spacing.md }} testID="debts-funfami-view">
      {/* Hero Card: Total Deuda FUNFAMI (H6) */}
      <GlassSurface elevated testID="funfami-hero-card">
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="caption" color={colors.text.secondary}>
              Total Deuda FUNFAMI (Celda H6)
            </AppText>
            <StatusBadge
              label={
                debtSummary.isInstallmentPaid
                  ? 'Cuota Oct Pagada ($ 1.800.000)'
                  : 'Cuota Oct Pendiente'
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
            }}
          >
            <AppText variant="micro" color={colors.semantic.debt}>
              {`${paydownPercent}% reducido este mes`}
            </AppText>
            <AppText variant="micro" color={colors.text.secondary}>
              {`Proyección libertad financiera: ~${estimatedRemainingMonths} cuotas (Feb 2027)`}
            </AppText>
          </View>

          {funfamiEntry && onToggleFunfamiInstallment ? (
            <Pressable
              testID="debts-view-toggle-installment"
              accessibilityRole="button"
              onPress={() => onToggleFunfamiInstallment(funfamiEntry)}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
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
                  ? `✓ Cuota FUNFAMI Pagada (${funfamiEntry.completedAt ?? '2026-10-27'}) · Toca para simular pendiente`
                  : '○ Marcar Cuota FUNFAMI ($ 1.800.000) como Pagada'}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>

      {/* Individual Obligations Breakdown */}
      {debtSummary.debts.map((debt) => (
        <GlassSurface key={debt.debtId} testID={`debt-card-${debt.debtId}`}>
          <View style={{ gap: spacing.xs }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
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
