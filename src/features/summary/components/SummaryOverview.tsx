/**
 * src/features/summary/components/SummaryOverview.tsx
 *
 * The Summary tab: net cash flow, income and expenses, and the month's curve.
 *
 * Responsive rules (every skin, driven by the width of the content column):
 * - Phones: net flow card, then income and expenses side by side, then the curve. The two
 *   cards share a row only while every figure in them fits on one line; a narrow phone, a
 *   large balance or a bigger type scale gives each card its own row instead of breaking
 *   an amount in two.
 * - From a 920px column (desktop browsers): the three figures form one row (6 / 3 / 3 of the
 *   12 columns) and the curve sits under it as a split panel, its metric table on the left
 *   and the chart on the right.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  StatusBadge,
  estimateTextWidth,
  minCardWidthForAmounts,
  useBFlowTheme,
  useResponsiveLayout,
} from '../../../design-system';
import {
  formatCurrency,
  type ChecklistProgress,
  type MonthlyBudgetSummary,
} from '../../../domain';
import type { MonthlyCurve } from '../../../domain/overview/monthlyCurve';
import { MonthlyCurveSection } from './MonthlyCurveSection';

export interface SummaryOverviewProps {
  budget: MonthlyBudgetSummary;
  checklist: ChecklistProgress;
  curve: MonthlyCurve;
}

export const SUMMARY_SPLIT_MIN_CONTENT_WIDTH = 920;
const WIDE_HERO_FLEX = 6;
const WIDE_FIGURE_FLEX = 3;
const WIDE_CURVE_MAX_WIDTH_PT = 880;

export function SummaryOverview({
  budget,
  checklist,
  curve,
}: SummaryOverviewProps): React.JSX.Element {
  const { colors, spacing, typography } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const isWide = layout.contentWidth >= SUMMARY_SPLIT_MIN_CONTENT_WIDTH;
  const sectionGap = layout.sizeClass === 'compact' ? spacing.md : layout.columnGap;

  const plannedIncomeLine = `Previstos: ${formatCurrency(budget.plannedIncome)}`;
  const pendingExpensesLine = `Pendientes: ${formatCurrency(budget.pendingExpenses)}`;
  const cardPadding = spacing.lg * 2;
  const figureCardMinWidth = Math.max(
    minCardWidthForAmounts(
      [budget.receivedIncome, budget.paidExpenses],
      typography.title2.fontSize,
      cardPadding,
      typography.title2.letterSpacing
    ),
    estimateTextWidth(plannedIncomeLine, typography.micro.fontSize, typography.micro.letterSpacing) +
      cardPadding,
    estimateTextWidth(
      pendingExpensesLine,
      typography.micro.fontSize,
      typography.micro.letterSpacing
    ) + cardPadding
  );

  const heroCard = (
    <GlassSurface
      elevated
      testID="net-flow-hero-card"
      style={isWide ? { flex: WIDE_HERO_FLEX, minWidth: 0 } : undefined}
    >
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
            Flujo Neto
          </AppText>
          <StatusBadge
            testID="checklist-progress-badge"
            label={
              checklist.isMonthComplete
                ? `✨ Mes completo (${checklist.completedCount} de ${checklist.totalTrackableCount})`
                : `Checklist ${checklist.completedCount} de ${checklist.totalTrackableCount}`
            }
            status={checklist.isMonthComplete ? 'completed' : 'pending'}
          />
        </View>
        <CurrencyText
          testID="golden-net-flow"
          amount={budget.netCashFlow}
          variant="heroCurrency"
          tone="income"
          fitOneLine
        />
        <AppText variant="caption" color={colors.text.secondary}>
          {`Flujo proyectado del mes: ${formatCurrency(budget.projectedNetFlow)}`}
        </AppText>
      </View>
    </GlassSurface>
  );

  const figureCardStyle = isWide
    ? { flex: WIDE_FIGURE_FLEX, minWidth: 0 }
    : { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: figureCardMinWidth };

  const incomeCard = (
    <GlassSurface style={figureCardStyle} testID="income-summary-card">
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          Ingresos Recibidos
        </AppText>
        <CurrencyText amount={budget.receivedIncome} variant="title2" tone="income" fitOneLine />
        <AppText variant="micro" color={colors.text.muted}>
          {plannedIncomeLine}
        </AppText>
      </View>
    </GlassSurface>
  );

  const expenseCard = (
    <GlassSurface style={figureCardStyle} testID="expense-summary-card">
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          Gastos Pagados
        </AppText>
        <CurrencyText amount={budget.paidExpenses} variant="title2" tone="expense" fitOneLine />
        <AppText variant="micro" color={colors.text.muted}>
          {pendingExpensesLine}
        </AppText>
      </View>
    </GlassSurface>
  );

  if (isWide) {
    return (
      <View testID="summary-overview-wide" style={{ gap: spacing.xxl }}>
        <View
          testID="summary-figure-cards"
          style={{ flexDirection: 'row', alignItems: 'stretch', gap: layout.columnGap }}
        >
          {heroCard}
          {incomeCard}
          {expenseCard}
        </View>
        <MonthlyCurveSection curve={curve} layout="split" stageMaxWidth={WIDE_CURVE_MAX_WIDTH_PT} />
      </View>
    );
  }

  return (
    <View testID="summary-overview-stacked" style={{ gap: sectionGap }}>
      {heroCard}
      <View
        testID="summary-figure-cards"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sectionGap }}
      >
        {incomeCard}
        {expenseCard}
      </View>
      <MonthlyCurveSection curve={curve} stageMaxWidth={layout.contentWidth} />
    </View>
  );
}
