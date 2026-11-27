/**
 * src/features/savings/components/SavingsTrendCharts.tsx
 *
 * Phase 6 chart of the Savings tab: balance of every savings fund owned by the user,
 * stacked per month. Only the funds that exist in the user's history are shown—never
 * hardcoded defaults. Kept to the essentials: the title, the chosen month with each bucket
 * and the bars; the readout already names every color, so there is no subtitle, legend or
 * extra note.
 */

import React, { useMemo } from 'react';
import { AppText, BarChart, ChartCard, useBFlowTheme, type ChartSeries } from '../../../design-system';
import type { MonthlyHistoryPoint } from '../../../domain';
import { useMonthAxis } from '../../budget/hooks/useChartHistory';

export interface SavingsTrendChartsProps {
  history: readonly MonthlyHistoryPoint[];
}

const RESERVE_BUCKET_IDS = new Set(['reserve']);

export function SavingsTrendCharts({ history }: SavingsTrendChartsProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const { categories, titles } = useMonthAxis(history);

  const balanceSeries = useMemo<ChartSeries[]>(() => {
    const bucketOrder: string[] = [];
    const bucketNames = new Map<string, string>();
    const balancesByMonth = history.map((point) => {
      const monthMap = new Map<string, number>();
      for (const bucket of point.savingsBuckets) {
        if (!bucketNames.has(bucket.id)) {
          bucketOrder.push(bucket.id);
        }
        bucketNames.set(bucket.id, bucket.name);
        monthMap.set(bucket.id, bucket.balance);
      }
      return monthMap;
    });

    if (bucketOrder.length === 0) {
      return [];
    }

    const usedColors = new Set<string>();
    if (bucketOrder.some((id) => RESERVE_BUCKET_IDS.has(id))) {
      usedColors.add(colors.semantic.reserve.toUpperCase());
    }
    if (bucketOrder.includes('savings')) {
      usedColors.add(colors.semantic.savings.toUpperCase());
    }
    const customPalette = colors.chart.categorical.filter(
      (hex) => !usedColors.has(hex.toUpperCase())
    );
    const fallbackPalette = customPalette.length > 0 ? customPalette : colors.chart.categorical;

    let customColorIndex = 0;
    return bucketOrder.map((bucketId) => {
      let color: string;
      if (RESERVE_BUCKET_IDS.has(bucketId)) {
        color = colors.semantic.reserve;
      } else if (bucketId === 'savings') {
        color = colors.semantic.savings;
      } else {
        color = fallbackPalette[customColorIndex % fallbackPalette.length] ?? colors.semantic.savings;
        customColorIndex += 1;
      }

      return {
        id: bucketId,
        label: bucketNames.get(bucketId) ?? bucketId,
        color,
        values: balancesByMonth.map((monthMap) => monthMap.get(bucketId) ?? 0),
      };
    });
  }, [history, colors.semantic, colors.chart.categorical]);

  return (
    <ChartCard title="Evolución de ahorros" testID="savings-chart-trend">
      {balanceSeries.length === 0 ? (
        <AppText variant="caption" color={colors.text.secondary} testID="savings-trend-chart-empty">
          Agrega un fondo de ahorro para ver su evolución mensual.
        </AppText>
      ) : (
        <BarChart
          testID="savings-trend-chart"
          layout="stacked"
          categories={categories}
          categoryTitles={titles}
          series={balanceSeries}
          showLegend={false}
        />
      )}
    </ChartCard>
  );
}
