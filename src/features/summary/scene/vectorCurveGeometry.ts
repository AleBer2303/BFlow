/**
 * src/features/summary/scene/vectorCurveGeometry.ts
 *
 * Pure 2D geometry of the monthly curve for the vector (SVG) stage used by the web skin.
 * It samples the very same curve as the three.js scene (`curveGeometry.ts`), so both stages
 * draw one shape and agree with the readout to the peso.
 */

import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
  MonthlyCurveSeries,
} from '../../../domain/overview/monthlyCurve';
import {
  CURVE_MARGIN_PT,
  curveXForDay,
  normalizeCurveValue,
  sampleCurveValue,
  type CurveStop,
} from './curveGeometry';

/** Room above the highest value and under the baseline, so strokes and dots are never cut. */
export const VECTOR_PLOT_PADDING_TOP_PT = 12;
export const VECTOR_PLOT_PADDING_BOTTOM_PT = 10;
export const VECTOR_GRID_LINE_COUNT = 4;
const DEFAULT_SAMPLES_PER_DAY = 8;

export interface VectorPoint {
  x: number;
  y: number;
}

export interface VectorCurveGeometry {
  /** Evenly spaced samples of the solid line, opening first and the cutoff day last. */
  points: VectorPoint[];
  /** Solid line from the opening to the cutoff day (today, or the month's last day). */
  linePath: string;
  /** Closed shape between that line and the baseline. */
  areaPath: string;
  /** Dashed line from the cutoff to the projected month end; null without a projection. */
  projectionPath: string | null;
  cutoffPoint: VectorPoint;
  projectedPoint: VectorPoint | null;
  /** Y of each horizontal grid line, top first; the last one is the baseline. */
  gridLineYs: number[];
  baselineY: number;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function vectorYForValue(
  series: MonthlyCurveSeries,
  value: number,
  heightPt: number
): number {
  const plotHeight = Math.max(
    0,
    heightPt - VECTOR_PLOT_PADDING_TOP_PT - VECTOR_PLOT_PADDING_BOTTOM_PT
  );
  const normalized = clampUnit(normalizeCurveValue(series, value));
  return VECTOR_PLOT_PADDING_TOP_PT + (1 - normalized) * plotHeight;
}

export function buildVectorCurveGeometry(
  curve: MonthlyCurve,
  metricId: MonthlyCurveMetricId,
  widthPt: number,
  heightPt: number,
  samplesPerDay: number = DEFAULT_SAMPLES_PER_DAY
): VectorCurveGeometry | null {
  if (widthPt <= CURVE_MARGIN_PT * 2 || heightPt <= 0) {
    return null;
  }

  const series = curve.series[metricId];
  const baselineY = heightPt - VECTOR_PLOT_PADDING_BOTTOM_PT;
  const sampleCount = Math.max(2, Math.round(curve.cutoffDay * samplesPerDay) + 1);

  const points: VectorPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = (index / (sampleCount - 1)) * curve.cutoffDay;
    points.push({
      x: round(curveXForDay(t, curve.daysInMonth, widthPt)),
      y: round(vectorYForValue(series, sampleCurveValue(series.values, t), heightPt)),
    });
  }

  const cutoffPoint = points[points.length - 1] as VectorPoint;
  const linePath = buildVectorLinePath(points);
  const areaPath = buildVectorAreaPath(points, baselineY);

  const projectedPoint: VectorPoint | null = curve.hasProjection
    ? {
        x: round(curveXForDay(curve.daysInMonth, curve.daysInMonth, widthPt)),
        y: round(vectorYForValue(series, series.projectedClose, heightPt)),
      }
    : null;

  const plotTop = VECTOR_PLOT_PADDING_TOP_PT;
  const gridLineYs = Array.from({ length: VECTOR_GRID_LINE_COUNT }, (_, index) =>
    round(plotTop + (index / (VECTOR_GRID_LINE_COUNT - 1)) * (baselineY - plotTop))
  );

  return {
    points,
    linePath,
    areaPath,
    projectionPath: projectedPoint
      ? `M${cutoffPoint.x} ${cutoffPoint.y} L${projectedPoint.x} ${projectedPoint.y}`
      : null,
    cutoffPoint,
    projectedPoint,
    gridLineYs,
    baselineY: round(baselineY),
  };
}

/** `M x y L x y …`, or an empty string when there is no segment to draw yet. */
export function buildVectorLinePath(points: readonly VectorPoint[]): string {
  if (points.length < 2) {
    return '';
  }
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

/** The line closed down to the baseline, or an empty string when there is no segment yet. */
export function buildVectorAreaPath(points: readonly VectorPoint[], baselineY: number): string {
  const linePath = buildVectorLinePath(points);
  if (linePath === '') {
    return '';
  }
  const first = points[0] as VectorPoint;
  const last = points[points.length - 1] as VectorPoint;
  const baseline = round(baselineY);
  return `${linePath} L${round(last.x)} ${baseline} L${round(first.x)} ${baseline} Z`;
}

/**
 * The part of a line left of `revealX`, ending exactly on it. Used to draw the line in from
 * the left during the entrance.
 */
export function clipVectorPoints(points: readonly VectorPoint[], revealX: number): VectorPoint[] {
  const visible: VectorPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as VectorPoint;
    if (point.x <= revealX) {
      visible.push(point);
      continue;
    }
    const previous = points[index - 1];
    if (previous !== undefined && previous.x < revealX) {
      const share = (revealX - previous.x) / (point.x - previous.x);
      visible.push({ x: revealX, y: previous.y + (point.y - previous.y) * share });
    }
    break;
  }
  return visible;
}

/** Where a stop sits on the line: a day's close, or the projected month end. */
export function resolveVectorStopPoint(
  curve: MonthlyCurve,
  metricId: MonthlyCurveMetricId,
  stop: CurveStop,
  widthPt: number,
  heightPt: number
): VectorPoint {
  const series = curve.series[metricId];
  if (stop === 'close') {
    return {
      x: round(curveXForDay(curve.daysInMonth, curve.daysInMonth, widthPt)),
      y: round(vectorYForValue(series, series.projectedClose, heightPt)),
    };
  }
  return {
    x: round(curveXForDay(stop, curve.daysInMonth, widthPt)),
    y: round(vectorYForValue(series, series.values[stop] as number, heightPt)),
  };
}

/**
 * Keyboard scrubbing: the next stop one step left (-1) or right (+1) of the current one.
 * With no stop yet, the walk starts at the cutoff day. Past the cutoff only the projected
 * close exists.
 */
export function stepCurveStop(
  curve: MonthlyCurve,
  current: CurveStop | null,
  direction: -1 | 1
): CurveStop {
  if (current === null) {
    return curve.cutoffDay;
  }
  if (current === 'close') {
    return direction === -1 ? curve.cutoffDay : 'close';
  }
  const next = current + direction;
  if (next > curve.cutoffDay) {
    return curve.hasProjection ? 'close' : curve.cutoffDay;
  }
  return Math.max(1, next);
}
