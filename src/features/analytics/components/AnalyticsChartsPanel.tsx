/**
 * src/features/analytics/components/AnalyticsChartsPanel.tsx
 *
 * Screen 5 "Gráficos" (Phase 6) inside the month-close tab: how the month went and how it
 * compares with the previous ones, before closing it. Every figure comes from the domain
 * (`chartSeries.ts`), so the charts agree with the cards; colors come from the skin's tokens
 * and each chart is the same vector drawing on iOS, Android and Web.
 *
 * - Flujo de efectivo: received, paid and pending per month (incomes against expenses).
 * - Balance mensual: net cash flow per month.
 * - Previsto vs real: planned against actual, for expenses or incomes.
 * - Pagado vs pendiente: this month's expenses already paid and still pending.
 * - Distribución de gastos: this month's expenses by concept.
 * - Este mes vs el anterior: received, paid and net flow side by side.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  BarChart,
  ChartCard,
  ChartSegmentedControl,
  DonutChart,
  LineChart,
  ResponsiveColumns,
  useBFlowTheme,
  type ChartSeries,
} from '../../../design-system';
import {
  buildExpenseDistribution,
  buildMonthComparison,
  buildPaidVsPendingSplit,
  formatMonthKeyLabelEs,
  formatSignedCurrency,
  type MonthEntry,
  type MonthlyBudgetSummary,
  type MonthlyHistoryPoint,
} from '../../../domain';
import { useMonthAxis } from '../../budget/hooks/useChartHistory';

export interface AnalyticsChartsPanelProps {
  activeMonthKey: string;
  history: readonly MonthlyHistoryPoint[];
  budget: MonthlyBudgetSummary;
  entries: readonly MonthEntry[];
  /** True once any month has been closed: the copy stops inviting to close the first one. */
  hasClosedMonths: boolean;
}

type PlanKind = 'expenses' | 'incomes';

const PLAN_OPTIONS = [
  { id: 'expenses', label: 'Gastos' },
  { id: 'incomes', label: 'Ingresos' },
] as const;

export function AnalyticsChartsPanel({
  activeMonthKey,
  history,
  budget,
  entries,
  hasClosedMonths,
}: AnalyticsChartsPanelProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const [planKind, setPlanKind] = useState<PlanKind>('expenses');
  const palette = colors.chart.categorical;

  const { categories, titles } = useMonthAxis(history);
  const isSingleMonth = history.length < 2;
  const monthState = (index: number) => {
    const point = history[index];
    if (!point) return undefined;
    return point.isClosed ? 'Mes cerrado' : 'Mes abierto';
  };

  const cashFlowSeries = useMemo<ChartSeries[]>(
    () => [
      { id: 'received', label: 'Recibido', color: colors.semantic.income, values: history.map((p) => p.receivedIncome) },
      { id: 'paid', label: 'Pagado', color: colors.semantic.expense, values: history.map((p) => p.paidExpenses) },
      { id: 'pending', label: 'Pendiente', color: colors.semantic.pending, values: history.map((p) => p.pendingExpenses) },
    ],
    [history, colors.semantic]
  );

  const balanceSeries = useMemo<ChartSeries[]>(
    () => [
      { id: 'net', label: 'Flujo neto', color: colors.semantic.income, values: history.map((p) => p.netCashFlow) },
    ],
    [history, colors.semantic]
  );

  const planSeries = useMemo<ChartSeries[]>(() => {
    const isExpenses = planKind === 'expenses';
    return [
      {
        id: 'planned',
        label: 'Previsto',
        color: palette[0],
        values: history.map((p) => (isExpenses ? p.plannedExpenses : p.plannedIncome)),
      },
      {
        id: 'actual',
        label: isExpenses ? 'Pagado' : 'Recibido',
        color: isExpenses ? colors.semantic.expense : colors.semantic.income,
        values: history.map((p) => (isExpenses ? p.paidExpenses : p.receivedIncome)),
      },
    ];
  }, [history, planKind, palette, colors.semantic]);

  const split = useMemo(() => buildPaidVsPendingSplit(budget), [budget]);
  const distribution = useMemo(
    () => buildExpenseDistribution(entries, activeMonthKey),
    [entries, activeMonthKey]
  );
  const comparison = useMemo(() => buildMonthComparison(history), [history]);

  const comparisonSeries = useMemo<ChartSeries[]>(() => {
    if (!comparison) return [];
    return [
      {
        id: 'previous',
        label: formatMonthKeyLabelEs(comparison.previousMonthKey),
        color: palette[0],
        values: comparison.rows.map((row) => row.previous),
      },
      {
        id: 'current',
        label: formatMonthKeyLabelEs(comparison.currentMonthKey),
        color: palette[2],
        values: comparison.rows.map((row) => row.current),
      },
    ];
  }, [comparison, palette]);

  return (
    <View style={{ gap: spacing.md }} testID="analytics-charts-panel">
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="title2" accessibilityRole="header">
          Gráficos
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {isSingleMonth
            ? hasClosedMonths
              ? `${formatMonthKeyLabelEs(activeMonthKey)}. No hay meses anteriores registrados.`
              : `${formatMonthKeyLabelEs(activeMonthKey)}. Al cerrar el mes verás aquí la evolución mes a mes.`
            : `Últimos ${history.length} meses hasta ${formatMonthKeyLabelEs(activeMonthKey)}. Toca un mes para ver sus cifras.`}
        </AppText>
      </View>

      <ResponsiveColumns testID="analytics-charts-grid">
        <ChartCard
          title="Flujo de efectivo"
          subtitle="Ingresos recibidos frente a gastos pagados y pendientes"
          testID="analytics-chart-cash-flow"
        >
          <BarChart
            testID="cash-flow-chart"
            categories={categories}
            categoryTitles={titles}
            series={cashFlowSeries}
            describeNote={monthState}
          />
        </ChartCard>

        <ChartCard
          title="Balance mensual"
          subtitle="Flujo neto: recibido menos pagado"
          testID="analytics-chart-balance"
        >
          <LineChart
            testID="balance-chart"
            categories={categories}
            categoryTitles={titles}
            series={balanceSeries}
            area
            describeNote={monthState}
          />
        </ChartCard>

        <ChartCard
          title="Previsto vs real"
          subtitle="Lo planeado frente a lo que ya se movió"
          testID="analytics-chart-plan-vs-actual"
        >
          <ChartSegmentedControl
            testID="plan-vs-actual-kind"
            accessibilityLabel="Comparar gastos o ingresos"
            options={PLAN_OPTIONS}
            value={planKind}
            onChange={setPlanKind}
          />
          <BarChart
            testID="plan-vs-actual-chart"
            categories={categories}
            categoryTitles={titles}
            series={planSeries}
            describeNote={(index) => {
              const planned = planSeries[0]?.values[index] ?? 0;
              const actual = planSeries[1]?.values[index] ?? 0;
              return `Diferencia: ${formatSignedCurrency(actual - planned)}`;
            }}
          />
        </ChartCard>

        <ChartCard
          title="Pagado vs pendiente"
          subtitle={`Gastos de ${formatMonthKeyLabelEs(activeMonthKey)}`}
          testID="analytics-chart-paid-pending"
        >
          <DonutChart
            testID="paid-pending-chart"
            totalLabel="Gastos del mes"
            emptyLabel="Este mes todavía no tiene gastos."
            slices={[
              { id: 'paid', label: 'Pagado', amount: split.paid, color: colors.semantic.completed },
              { id: 'pending', label: 'Pendiente', amount: split.pending, color: colors.semantic.pending },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Distribución de gastos"
          subtitle="Por concepto: lo pagado y lo que falta por pagar"
          testID="analytics-chart-distribution"
        >
          <DonutChart
            testID="distribution-chart"
            totalLabel="Gastos del mes"
            emptyLabel="Este mes todavía no tiene gastos."
            slices={distribution.slices.map((slice, index) => ({
              id: slice.id,
              label: slice.label,
              amount: slice.amount,
              color: palette[index % palette.length] as string,
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Este mes vs el anterior"
          subtitle={
            comparison
              ? `${formatMonthKeyLabelEs(comparison.currentMonthKey)} frente a ${formatMonthKeyLabelEs(comparison.previousMonthKey)}`
              : 'Comparación con el mes anterior'
          }
          testID="analytics-chart-comparison"
        >
          {comparison ? (
            <BarChart
              testID="comparison-chart"
              categories={comparison.rows.map((row) => row.label.split(' ')[0] ?? row.label)}
              categoryTitles={comparison.rows.map((row) => row.label)}
              series={comparisonSeries}
              describeNote={(index) => {
                const row = comparison.rows[index];
                return row ? `Diferencia: ${formatSignedCurrency(row.delta)}` : undefined;
              }}
            />
          ) : (
            <AppText variant="caption" color={colors.text.muted} testID="comparison-chart-empty">
              {hasClosedMonths
                ? 'No hay un mes anterior registrado para comparar.'
                : 'Cuando cierres tu primer mes verás aquí la comparación con el anterior.'}
            </AppText>
          )}
        </ChartCard>
      </ResponsiveColumns>
    </View>
  );
}
