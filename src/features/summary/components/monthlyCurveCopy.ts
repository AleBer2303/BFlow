/**
 * src/features/summary/components/monthlyCurveCopy.ts
 *
 * Spanish copy derived from the monthly curve, shared by the on-screen readout, the
 * day labels and VoiceOver so all of them state the same figures.
 */

import { formatCurrency } from '../../../domain/money/money';
import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import type { CurveStop } from '../scene/curveGeometry';

export interface CurveMetricPresentation {
  label: string;
  title: string;
}

export const METRIC_PRESENTATION: Record<MonthlyCurveMetricId, CurveMetricPresentation> = {
  flow: { label: 'Flujo', title: 'Flujo neto' },
  income: { label: 'Ingresos', title: 'Ingresos recibidos' },
  expenses: { label: 'Gastos', title: 'Gastos pagados' },
  savings: { label: 'Ahorros', title: 'Ahorros' },
  debt: { label: 'Deudas', title: 'Deudas' },
};

export interface CurveReadout {
  label: string;
  amount: number;
  detail: string;
}

export interface CurveTick {
  day: number;
  label: string;
  isToday: boolean;
}

const MONTH_ABBREVIATIONS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const INTERMEDIATE_TICK_DAYS = [1, 10, 20] as const;
/** Closer than this, two day labels would overlap on a narrow phone. */
const MIN_TICK_DISTANCE_DAYS = 4;

function formatDayLabel(curve: MonthlyCurve, day: number): string {
  return `${day} ${MONTH_ABBREVIATIONS[Number(curve.monthKey.slice(5, 7)) - 1]}`;
}

function describeDayChange(curve: MonthlyCurve, metricId: MonthlyCurveMetricId, day: number): string {
  const { values } = curve.series[metricId];
  const change = (values[day] as number) - (values[day - 1] as number);
  if (change === 0) {
    return 'Sin cambios ese día';
  }
  return `${change > 0 ? '+' : ''}${formatCurrency(change)} ese día`;
}

export function describeCurveReadout(
  curve: MonthlyCurve,
  metricId: MonthlyCurveMetricId,
  stop: CurveStop | null
): CurveReadout {
  const { title } = METRIC_PRESENTATION[metricId];
  const series = curve.series[metricId];

  if (stop === 'close') {
    return {
      label: `${title} · Cierre previsto`,
      amount: series.projectedClose,
      detail: 'Si se completa lo pendiente',
    };
  }

  if (stop !== null) {
    return {
      label: `${title} · ${formatDayLabel(curve, stop)}`,
      amount: series.values[stop] as number,
      detail: describeDayChange(curve, metricId, stop),
    };
  }

  const latestDay = curve.cutoffDay;
  const dayLabel = formatDayLabel(curve, latestDay);
  return {
    label: `${title} · ${curve.isCurrentMonth ? `Hoy, ${dayLabel}` : dayLabel}`,
    amount: series.values[latestDay] as number,
    detail: curve.hasProjection
      ? `Cierre previsto ${formatCurrency(series.projectedClose)}`
      : describeDayChange(curve, metricId, latestDay),
  };
}

export function describeMetricAccessibility(
  curve: MonthlyCurve,
  metricId: MonthlyCurveMetricId
): string {
  const readout = describeCurveReadout(curve, metricId, null);
  return `${METRIC_PRESENTATION[metricId].title}: ${formatCurrency(readout.amount)}. ${readout.detail}`;
}

export function buildCurveTicks(curve: MonthlyCurve): CurveTick[] {
  const today = curve.isCurrentMonth ? curve.cutoffDay : null;
  const isClearOfToday = (day: number) =>
    today === null || Math.abs(day - today) >= MIN_TICK_DISTANCE_DAYS;

  const ticks: CurveTick[] = INTERMEDIATE_TICK_DAYS.filter(isClearOfToday).map((day) => ({
    day,
    label: String(day),
    isToday: false,
  }));

  if (today !== null) {
    ticks.push({ day: today, label: 'Hoy', isToday: true });
  }
  if (isClearOfToday(curve.daysInMonth)) {
    ticks.push({ day: curve.daysInMonth, label: String(curve.daysInMonth), isToday: false });
  }
  return ticks;
}
