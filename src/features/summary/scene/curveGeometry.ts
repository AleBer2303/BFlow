/**
 * src/features/summary/scene/curveGeometry.ts
 *
 * Pure positions of the monthly curve, free of three.js so the gestures and the native
 * day labels share them with the scene.
 */

import type { MonthlyCurve, MonthlyCurveSeries } from '../../../domain/overview/monthlyCurve';

/** Horizontal inset of the plot. The native day labels use it too, so both line up. */
export const CURVE_MARGIN_PT = 14;

/** A day's change eases in just before its close, so each day still ends on its exact value. */
const RAMP_DAYS = 0.9;

/** A resting position on the curve: a day of the month, or the projected month end. */
export type CurveStop = number | 'close';

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/** @param t days since the start of the month: 0 is the opening, N the close of day N. */
export function sampleCurveValue(values: readonly number[], t: number): number {
  const day = Math.min(values.length - 1, Math.max(0, Math.ceil(t)));
  const current = values[day] as number;
  if (day === 0) {
    return current;
  }

  const previous = values[day - 1] as number;
  return previous + (current - previous) * smoothstep((t - (day - RAMP_DAYS)) / RAMP_DAYS);
}

export function normalizeCurveValue(series: MonthlyCurveSeries, value: number): number {
  return (value - series.scaleMin) / (series.scaleMax - series.scaleMin);
}

/** Fills `target` with evenly spaced samples between the opening and the cutoff day. */
export function fillCurveSamples(
  series: MonthlyCurveSeries,
  cutoffDay: number,
  target: Float32Array
): void {
  const lastIndex = target.length - 1;
  for (let index = 0; index <= lastIndex; index += 1) {
    const value = sampleCurveValue(series.values, (index / lastIndex) * cutoffDay);
    target[index] = normalizeCurveValue(series, value);
  }
}

export function curveXForDay(day: number, daysInMonth: number, widthPt: number): number {
  return CURVE_MARGIN_PT + (day / daysInMonth) * (widthPt - CURVE_MARGIN_PT * 2);
}

/** Maps a finger position to its stop. Past the cutoff there are only projections. */
export function resolveCurveStop(curve: MonthlyCurve, xPt: number, widthPt: number): CurveStop {
  const t = ((xPt - CURVE_MARGIN_PT) / (widthPt - CURVE_MARGIN_PT * 2)) * curve.daysInMonth;
  if (curve.hasProjection && t > curve.cutoffDay + 1) {
    return 'close';
  }
  return Math.min(curve.cutoffDay, Math.max(1, Math.round(t)));
}
