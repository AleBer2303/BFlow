/**
 * src/features/debts/components/DebtTrendChart.tsx
 *
 * Phase 6 chart of the Debts tab: total debt month by month and, dashed, the projection to
 * zero in the estimated payoff month. The projection is the same one the hero card states
 * (`projectDebtPayoff`), so both always agree.
 */

import React, { useMemo } from 'react';
import { AppText, ChartCard, LineChart, useBFlowTheme, type ChartSeries } from '../../../design-system';
import {
  buildDebtTrajectory,
  formatMonthKeyLabelEs,
  formatMonthKeyShortLabelEs,
  type DebtPayoffProjection,
  type MonthlyHistoryPoint,
} from '../../../domain';

export interface DebtTrendChartProps {
  history: readonly MonthlyHistoryPoint[];
  projection: DebtPayoffProjection;
}

function describeMonths(count: number): string {
  return `${count} ${count === 1 ? 'mes' : 'meses'}`;
}

export function DebtTrendChart({ history, projection }: DebtTrendChartProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const trajectory = useMemo(() => buildDebtTrajectory(history, projection), [history, projection]);
  const { points, remainingMonths, estimatedPayoffMonthKey } = trajectory;
  const hasProjection = points.some((point) => point.isProjected);
  const hasDebtHistory = points.some((point) => point.balance > 0);

  const series = useMemo<ChartSeries[]>(
    () => [
      {
        id: 'debt',
        label: 'Deuda total',
        color: colors.semantic.debt,
        values: points.map((point) => point.balance),
      },
    ],
    [points, colors.semantic.debt]
  );

  let subtitle = 'Sin cuota configurada para estimar el cierre';
  if (hasProjection && estimatedPayoffMonthKey && remainingMonths !== null) {
    subtitle = `Cierre estimado: ${formatMonthKeyLabelEs(estimatedPayoffMonthKey)}, en ${describeMonths(remainingMonths)}`;
  } else if (remainingMonths === 0) {
    subtitle = 'Deuda saldada';
  }

  return (
    <ChartCard title="Evolución de la deuda" subtitle={subtitle} testID="debts-chart-trend">
      {hasDebtHistory ? (
        <LineChart
          testID="debt-trend-chart"
          categories={points.map((point) =>
            // The estimate may lie years ahead, so its label carries the year: "Feb ’27".
            point.isProjected
              ? `${formatMonthKeyShortLabelEs(point.monthKey)} ’${point.monthKey.slice(2, 4)}`
              : formatMonthKeyShortLabelEs(point.monthKey)
          )}
          categoryTitles={points.map((point) =>
            point.isProjected
              ? `${formatMonthKeyLabelEs(point.monthKey)} · cierre estimado`
              : formatMonthKeyLabelEs(point.monthKey)
          )}
          series={series}
          area
          projectedFromIndex={hasProjection ? points.length - 2 : points.length - 1}
          projectionLabel="Proyección con la cuota actual"
          describeNote={(index) =>
            points[index]?.isProjected && remainingMonths !== null
              ? `Faltan ${describeMonths(remainingMonths)} de cuotas`
              : undefined
          }
        />
      ) : (
        <AppText variant="caption" color={colors.text.muted} testID="debt-trend-chart-empty">
          No hay deudas con saldo en estos meses.
        </AppText>
      )}
    </ChartCard>
  );
}
