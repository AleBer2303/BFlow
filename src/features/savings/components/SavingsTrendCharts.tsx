/**
 * src/features/savings/components/SavingsTrendCharts.tsx
 *
 * Phase 6 chart of the Savings tab: balance of the reserve, the general savings and any
 * other bucket, stacked per month (Excel K4 + K5 = K6). Kept to the essentials: the title,
 * the chosen month with each bucket and the bars; the readout already names every color, so
 * there is no subtitle, legend or extra note.
 */

import React, { useMemo } from 'react';
import { BarChart, ChartCard, useBFlowTheme, type ChartSeries } from '../../../design-system';
import type { MonthlyHistoryPoint } from '../../../domain';
import { useMonthAxis } from '../../budget/hooks/useChartHistory';

export interface SavingsTrendChartsProps {
  history: readonly MonthlyHistoryPoint[];
}

export function SavingsTrendCharts({ history }: SavingsTrendChartsProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const { categories, titles } = useMonthAxis(history);
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

  return (
    <ChartCard title="Evolución de ahorros" testID="savings-chart-trend">
      <BarChart
        testID="savings-trend-chart"
        layout="stacked"
        categories={categories}
        categoryTitles={titles}
        series={balanceSeries}
        showLegend={false}
      />
    </ChartCard>
  );
}
