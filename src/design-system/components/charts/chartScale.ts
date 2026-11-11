/**
 * src/design-system/components/charts/chartScale.ts
 *
 * Value axis and drawing geometry shared by the bar, line and donut charts. Pure functions,
 * so the shapes are tested without rendering. The value axis always contains zero (money
 * charts compare against nothing spent / nothing owed) and uses round steps (1, 2, 2.5, 5
 * times a power of ten) so the grid reads "$ 1M, $ 2M" instead of odd figures.
 */

export interface ValueScale {
  min: number;
  max: number;
  /** Grid values from `min` to `max`, both included. */
  ticks: number[];
}

export interface PlotBox {
  top: number;
  height: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

const NICE_FACTORS = [1, 2, 2.5, 5, 10] as const;

/** Smallest round step that splits `range` into at most `maxSteps` parts. */
export function resolveNiceStep(range: number, maxSteps: number): number {
  if (!(range > 0) || !Number.isFinite(range)) {
    return 1;
  }
  const rawStep = range / Math.max(1, maxSteps);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const factor = NICE_FACTORS.find((candidate) => candidate * magnitude >= rawStep) ?? 10;
  return factor * magnitude;
}

/**
 * Scale that fits every value (and zero) in at most `maxSteps` round steps. Five steps keep
 * the headroom above the tallest value small without crowding a 168pt plot.
 */
export function buildValueScale(values: readonly number[], maxSteps = 5): ValueScale {
  const finite = values.filter((value) => Number.isFinite(value));
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  if (low === high) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }

  // Money is drawn in whole units, so a step is never a fraction of a peso.
  const step = Math.max(1, Math.ceil(resolveNiceStep(high - low, maxSteps)));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    // Rounding removes the binary noise of repeated additions (0.1 + 0.2).
    ticks.push(Math.round(tick * 1e6) / 1e6);
  }
  return { min, max, ticks };
}

export function valueToY(value: number, scale: ValueScale, box: PlotBox): number {
  const span = scale.max - scale.min || 1;
  const clamped = Math.min(scale.max, Math.max(scale.min, value));
  return box.top + box.height - ((clamped - scale.min) / span) * box.height;
}

/** Center of band `index` when `count` equal bands fill `width`. */
export function bandCenter(index: number, count: number, width: number): number {
  const band = width / Math.max(1, count);
  return band * index + band / 2;
}

export function buildLinePath(points: readonly ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

/** Closed shape between the line and the baseline (the zero line). */
export function buildAreaPath(points: readonly ChartPoint[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return '';
  }
  return `${buildLinePath(points)} L${round(last.x)} ${round(baselineY)} L${round(first.x)} ${round(baselineY)} Z`;
}

function polar(cx: number, cy: number, radius: number, degrees: number): ChartPoint {
  // 0° points up and angles grow clockwise, like a clock.
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/**
 * Arc of a ring from `startDegrees` to `endDegrees`, drawn as a stroke. A full turn is split
 * in two halves because a single SVG arc cannot start and end on the same point.
 */
export function buildArcPath(
  cx: number,
  cy: number,
  radius: number,
  startDegrees: number,
  endDegrees: number
): string {
  const sweep = Math.min(360, Math.max(0, endDegrees - startDegrees));
  if (sweep <= 0) {
    return '';
  }
  if (sweep >= 359.999) {
    const top = polar(cx, cy, radius, startDegrees);
    const bottom = polar(cx, cy, radius, startDegrees + 180);
    const r = round(radius);
    return `M${round(top.x)} ${round(top.y)} A${r} ${r} 0 1 1 ${round(bottom.x)} ${round(bottom.y)} A${r} ${r} 0 1 1 ${round(top.x)} ${round(top.y)}`;
  }
  const start = polar(cx, cy, radius, startDegrees);
  const end = polar(cx, cy, radius, startDegrees + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  const r = round(radius);
  return `M${round(start.x)} ${round(start.y)} A${r} ${r} 0 ${largeArc} 1 ${round(end.x)} ${round(end.y)}`;
}

/** Cumulative end angle of each share, so slice `i` spans `[ends[i-1], ends[i]]`. */
export function resolveSliceEndAngles(amounts: readonly number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
  let running = 0;
  return amounts.map((amount) => {
    running += Math.max(0, amount);
    return total > 0 ? (running / total) * 360 : 0;
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
