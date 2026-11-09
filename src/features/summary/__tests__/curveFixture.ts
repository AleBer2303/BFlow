import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
  MonthlyCurveSeries,
} from '../../../domain/overview/monthlyCurve';

function buildSeries(
  id: MonthlyCurveMetricId,
  opening: number,
  changes: Readonly<Record<number, number>>,
  projectedClose: number,
  cutoffDay: number
): MonthlyCurveSeries {
  const values = [opening];
  for (let day = 1; day <= cutoffDay; day += 1) {
    values.push((values[day - 1] as number) + (changes[day] ?? 0));
  }
  return {
    id,
    values,
    projectedClose,
    scaleMin: Math.min(0, ...values, projectedClose),
    scaleMax: Math.max(...values, projectedClose),
  };
}

export function buildTestCurve(overrides: Partial<MonthlyCurve> = {}): MonthlyCurve {
  const cutoffDay = overrides.cutoffDay ?? 27;

  return {
    monthKey: '2026-10',
    daysInMonth: 31,
    cutoffDay,
    isCurrentMonth: true,
    hasProjection: true,
    series: {
      flow: buildSeries('flow', 0, { 21: 2_880_000, 27: -1_800_000 }, 2_630_000, cutoffDay),
      income: buildSeries('income', 0, { 21: 4_000_000 }, 6_000_000, cutoffDay),
      expenses: buildSeries('expenses', 0, { 21: 1_120_000, 27: 1_800_000 }, 3_370_000, cutoffDay),
      savings: buildSeries('savings', 2_600_000, { 21: 3_580_000, 27: -1_800_000 }, 5_930_000, cutoffDay),
      debt: buildSeries('debt', 8_000_000, { 27: -1_800_000 }, 6_200_000, cutoffDay),
    },
    ...overrides,
  };
}
