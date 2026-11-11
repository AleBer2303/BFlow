/**
 * src/features/savings/components/SavingsTrendCharts.tsx
 *
 * Phase 6 charts of the Savings tab:
 * - Evolución de ahorros: balance of the reserve, the general savings and any other bucket,
 *   stacked per month (Excel K4 + K5 = K6).
 * - Provisión ideal vs aporte real: what was actually paid into the reserve each month
 *   against the ideal monthly provision of the plan (dashed line).
 */

import React, { useMemo } from 'react';
import { BarChart, ChartCard, ResponsiveColumns, useBFlowTheme, type ChartSeries } from '../../../design-system';
import {
  formatCurrency,
  formatMonthKeyLabelEs,
  formatMonthKeyShortLabelEs,
  formatSignedCurrency,
  type MonthlyHistoryPoint,
} from '../../../domain';

export interface SavingsTrendChartsProps {
  history: readonly MonthlyHistoryPoint[];
  /** Ideal monthly provision of the plan (Excel B43); 0 when there is no plan. */
  idealMonthlyProvision: number;
}

export function SavingsTrendCharts({
  history,
  idealMonthlyProvision,
}: SavingsTrendChartsProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const categories = useMemo(() => history.map((p) => formatMonthKeyShortLabelEs(p.monthKey)), [history]);
  const titles = useMemo(() => history.map((p) => formatMonthKeyLabelEs(p.monthKey)), [history]);
  const last = history[history.length - 1];

  const balanceSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = [
      {
        id: 'reserve',
        label: last?.reserveName ?? 'Reserva',
        color: colors.semantic.reserve,
        values: history.map((p) => p.reserveBalance),
      },
      {
        id: 'savings',
        label: last?.savingsName ?? 'Ahorros',
        color: colors.semantic.savings,
        values: history.map((p) => p.savingsBalance),
      },
    ];
    if (history.some((p) => p.otherSavingsBalance > 0)) {
      series.push({
        id: 'other',
        label: 'Otros fondos',
        color: colors.chart.categorical[1],
        values: history.map((p) => p.otherSavingsBalance),
      });
    }
    return series;
  }, [history, last, colors.semantic, colors.chart.categorical]);

  const contributionSeries = useMemo<ChartSeries[]>(
    () => [
      {
        id: 'contribution',
        label: 'Aporte real',
        color: colors.semantic.reserve,
        values: history.map((p) => p.reserveContribution),
      },
    ],
    [history, colors.semantic.reserve]
  );
  const hasIdeal = idealMonthlyProvision > 0;

  return (
    <ResponsiveColumns testID="savings-charts-grid">
      <ChartCard
        title="Evolución de ahorros"
        subtitle={last ? `Total hoy: ${formatCurrency(last.totalSavings)}` : undefined}
        testID="savings-chart-trend"
      >
        <BarChart
          testID="savings-trend-chart"
          layout="stacked"
          categories={categories}
          categoryTitles={titles}
          series={balanceSeries}
          describeNote={(index) => {
            const point = history[index];
            return point ? `Total: ${formatCurrency(point.totalSavings)}` : undefined;
          }}
        />
      </ChartCard>

      <ChartCard
        title="Provisión ideal vs aporte real"
        subtitle={
          hasIdeal
            ? `Ideal mensual: ${formatCurrency(idealMonthlyProvision)}`
            : 'Agrega ítems al plan de provisión para compararlos con tus aportes'
        }
        testID="savings-chart-provision"
      >
        <BarChart
          testID="provision-chart"
          categories={categories}
          categoryTitles={titles}
          series={contributionSeries}
          referenceLine={
            hasIdeal
              ? { value: idealMonthlyProvision, label: 'Ideal', color: colors.chart.categorical[2] }
              : undefined
          }
          describeNote={(index) => {
            const point = history[index];
            return point && hasIdeal
              ? `Brecha frente al ideal: ${formatSignedCurrency(point.reserveContribution - idealMonthlyProvision)}`
              : undefined;
          }}
        />
      </ChartCard>
    </ResponsiveColumns>
  );
}
