/**
 * Motion of the vector curve, stepped by hand: the entrance, the morph between metrics, the
 * marker, the pulse, Reduce Motion and the shared timeline with the three.js scene.
 */

import { palettes } from '../../../design-system/tokens';
import {
  MONTHLY_CURVE_METRIC_IDS,
  type MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import {
  CURVE_FALLBACK_FRAME_SECONDS,
  CURVE_MAX_FRAME_SECONDS,
  CURVE_PULSE_COUNT,
  CURVE_PULSE_SECONDS,
  CURVE_REVEAL_SECONDS,
  CURVE_REVEAL_SOLID_SHARE,
  easeInOutCubic,
  resolveCurveRevealShares,
  resolveFrameSeconds,
} from '../scene/curveMotion';
import { getMetricColor } from '../scene/scenePalette';
import {
  VectorCurveAnimator,
  mixHexColors,
  type MetricColors,
} from '../scene/vectorCurveAnimator';
import {
  buildVectorAreaPath,
  buildVectorCurveGeometry,
  buildVectorLinePath,
  clipVectorPoints,
  resolveVectorStopPoint,
} from '../scene/vectorCurveGeometry';
import { buildTestCurve } from './curveFixture';

const CURVE = buildTestCurve();
const CLOSED_CURVE = buildTestCurve({ cutoffDay: 31, hasProjection: false, isCurrentMonth: false });
const WIDTH = 600;
const HEIGHT = 260;
const FRAME = 1 / 60;
const COLORS = Object.fromEntries(
  MONTHLY_CURVE_METRIC_IDS.map((id) => [id, getMetricColor(palettes.dark, id)])
) as MetricColors;

function createAnimator(
  options: { metricId?: MonthlyCurveMetricId; reducedMotion?: boolean; curve?: typeof CURVE } = {}
) {
  const animator = new VectorCurveAnimator({
    curve: options.curve ?? CURVE,
    metricId: options.metricId ?? 'flow',
    colors: COLORS,
    reducedMotion: options.reducedMotion ?? false,
  });
  animator.setSize(WIDTH, HEIGHT);
  return animator;
}

/** Steps like a display would and returns how many frames it took to rest. */
function runUntilIdle(animator: VectorCurveAnimator, maxSeconds = 20): number {
  let frames = 0;
  while (animator.advance(FRAME)) {
    frames += 1;
    if (frames > maxSeconds * 60) {
      throw new Error('the animator never came to rest');
    }
  }
  return frames;
}

function runFor(animator: VectorCurveAnimator, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    animator.advance(FRAME);
  }
}

function frameOf(animator: VectorCurveAnimator) {
  const frame = animator.getFrame();
  if (frame === null) throw new Error('frame expected');
  return frame;
}

describe('curveMotion', () => {
  it('eases symmetrically from 0 to 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 10);
  });

  it('draws the solid line first and the projection last', () => {
    expect(resolveCurveRevealShares(0, true)).toEqual({ solid: 0, projection: 0 });
    const atHandOver = resolveCurveRevealShares(0.6, true);
    expect(atHandOver.solid).toBeGreaterThan(0.9);
    expect(atHandOver.projection).toBe(0);
    expect(resolveCurveRevealShares(1, true)).toEqual({ solid: 1, projection: 1 });
    // Without a projection the line takes the whole entrance.
    expect(resolveCurveRevealShares(0.5, false)).toEqual({ solid: 0.5, projection: 0 });
    expect(resolveCurveRevealShares(2, false).solid).toBe(1);
    expect(CURVE_REVEAL_SOLID_SHARE).toBeLessThan(1);
  });

  it('never lets a stalled or broken frame jump the animation forward', () => {
    expect(resolveFrameSeconds(1_000, null)).toBe(CURVE_FALLBACK_FRAME_SECONDS);
    expect(resolveFrameSeconds(1_016, 1_000)).toBeCloseTo(0.016, 6);
    expect(resolveFrameSeconds(9_000, 1_000)).toBe(CURVE_MAX_FRAME_SECONDS);
    expect(resolveFrameSeconds(900, 1_000)).toBe(0);
    expect(resolveFrameSeconds(Number.NaN, 1_000)).toBe(CURVE_FALLBACK_FRAME_SECONDS);
  });
});

describe('vector path helpers', () => {
  const points = [
    { x: 10, y: 50 },
    { x: 20, y: 40 },
    { x: 30, y: 20 },
  ];

  it('needs two points to draw a segment', () => {
    expect(buildVectorLinePath([])).toBe('');
    expect(buildVectorLinePath([{ x: 1, y: 2 }])).toBe('');
    expect(buildVectorAreaPath([{ x: 1, y: 2 }], 60)).toBe('');
    expect(buildVectorLinePath(points)).toBe('M10 50 L20 40 L30 20');
    expect(buildVectorAreaPath(points, 60)).toBe('M10 50 L20 40 L30 20 L30 60 L10 60 Z');
  });

  it('clips a line exactly at the reveal position', () => {
    expect(clipVectorPoints(points, 5)).toEqual([]);
    expect(clipVectorPoints(points, 25)).toEqual([points[0], points[1], { x: 25, y: 30 }]);
    expect(clipVectorPoints(points, 20)).toEqual([points[0], points[1]]);
    expect(clipVectorPoints(points, 99)).toEqual(points);
  });
});

describe('VectorCurveAnimator', () => {
  it('has nothing to draw, and does not start the entrance, until it has a size', () => {
    const animator = new VectorCurveAnimator({
      curve: CURVE,
      metricId: 'flow',
      colors: COLORS,
      reducedMotion: false,
    });

    expect(animator.getFrame()).toBeNull();
    expect(animator.advance(1)).toBe(false);
    expect(animator.setSize(WIDTH, HEIGHT)).toBe(true);
    expect(animator.setSize(WIDTH, HEIGHT)).toBe(false);
    expect(frameOf(animator).linePath).toBe('');
  });

  it('draws in up to today, extends the projection, then pops the marker in', () => {
    const animator = createAnimator();
    const target = buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT);
    if (!target) throw new Error('geometry expected');

    runFor(animator, CURVE_REVEAL_SECONDS * 0.4);
    const early = frameOf(animator);
    expect(early.linePath).not.toBe('');
    expect(early.linePath.length).toBeLessThan(target.linePath.length);
    expect(early.projectionPath).toBe('');
    expect(early.markerScale).toBe(0);

    runFor(animator, CURVE_REVEAL_SECONDS * 0.4);
    expect(frameOf(animator).projectionPath).not.toBe('');

    runUntilIdle(animator);
    const done = frameOf(animator);
    expect(done.linePath).toBe(target.linePath);
    expect(done.areaPath).toBe(target.areaPath);
    expect(done.projectionPath).toBe(target.projectionPath);
    expect(done.markerScale).toBeCloseTo(1, 3);
    expect(done.marker.x).toBeCloseTo(target.cutoffPoint.x, 3);
    expect(done.marker.y).toBeCloseTo(target.cutoffPoint.y, 3);
    expect(done.pulse).toBeNull();
    expect(done.color).toBe(COLORS.flow);
  });

  it('pulses a limited number of times after the entrance, then rests', () => {
    const animator = createAnimator();
    runFor(animator, CURVE_REVEAL_SECONDS + 0.1);

    const pulses: number[] = [];
    while (animator.advance(FRAME)) {
      const pulse = frameOf(animator).pulse;
      if (pulse !== null) pulses.push(pulse);
    }

    expect(pulses.length).toBeGreaterThan(0);
    expect(Math.max(...pulses)).toBeLessThan(1);
    // Each wrap back to the start of the ring is a new pulse.
    const restarts = pulses.filter((value, index) => index > 0 && value < (pulses[index - 1] as number));
    expect(restarts.length + 1).toBe(CURVE_PULSE_COUNT);
    expect(pulses.length * FRAME).toBeCloseTo(CURVE_PULSE_SECONDS * CURVE_PULSE_COUNT, 0);
    expect(frameOf(animator).pulse).toBeNull();
  });

  it('morphs to another metric and blends its color on the way', () => {
    const animator = createAnimator();
    runUntilIdle(animator);

    animator.setMetric('debt');
    animator.setMetric('debt');
    runFor(animator, 0.2);
    const midway = frameOf(animator);
    const debt = buildVectorCurveGeometry(CURVE, 'debt', WIDTH, HEIGHT);
    if (!debt) throw new Error('geometry expected');
    expect(midway.linePath).not.toBe(debt.linePath);
    expect(midway.color).not.toBe(COLORS.flow);
    expect(midway.color).not.toBe(COLORS.debt);

    runUntilIdle(animator);
    expect(frameOf(animator).linePath).toBe(debt.linePath);
    expect(frameOf(animator).color).toBe(COLORS.debt);
  });

  it('morphs updated data of the same month and replays the entrance for another month', () => {
    const animator = createAnimator();
    runUntilIdle(animator);

    const updated = buildTestCurve();
    animator.setCurve(updated);
    expect(frameOf(animator).linePath).not.toBe('');
    runUntilIdle(animator);

    const november = buildTestCurve({ monthKey: '2026-11', cutoffDay: 9 });
    animator.setCurve(november);
    animator.setCurve(november);
    expect(frameOf(animator).linePath).toBe('');
    expect(frameOf(animator).markerScale).toBe(0);
    runUntilIdle(animator);
    expect(frameOf(animator).linePath).toBe(
      buildVectorCurveGeometry(november, 'flow', WIDTH, HEIGHT)?.linePath
    );
  });

  it('glides the marker to the chosen day, dims what follows and pulses again on release', () => {
    const animator = createAnimator();
    runUntilIdle(animator);

    animator.setStop(21);
    animator.setStop(21);
    runUntilIdle(animator);
    const day21 = resolveVectorStopPoint(CURVE, 'flow', 21, WIDTH, HEIGHT);
    expect(frameOf(animator).marker.x).toBeCloseTo(day21.x, 2);
    expect(frameOf(animator).marker.y).toBeCloseTo(day21.y, 2);
    expect(frameOf(animator).focus).toBeCloseTo(1, 3);
    expect(frameOf(animator).pulse).toBeNull();

    animator.setStop('close');
    runUntilIdle(animator);
    const close = resolveVectorStopPoint(CURVE, 'flow', 'close', WIDTH, HEIGHT);
    expect(frameOf(animator).marker.x).toBeCloseTo(close.x, 2);
    expect(frameOf(animator).marker.y).toBeCloseTo(close.y, 2);

    animator.setStop(null);
    animator.advance(FRAME);
    expect(frameOf(animator).pulse).not.toBeNull();
    runUntilIdle(animator);
    expect(frameOf(animator).focus).toBeCloseTo(0, 3);
  });

  it('has no projection on a finished month', () => {
    const animator = createAnimator({ curve: CLOSED_CURVE });
    runUntilIdle(animator);

    expect(frameOf(animator).projectionPath).toBeNull();
    animator.setStop('close');
    runUntilIdle(animator);
    expect(frameOf(animator).marker.x).toBeCloseTo(
      buildVectorCurveGeometry(CLOSED_CURVE, 'flow', WIDTH, HEIGHT)?.cutoffPoint.x ?? 0,
      2
    );
  });

  it('settles at once and never pulses with Reduce Motion', () => {
    const animator = createAnimator({ metricId: 'income', reducedMotion: true });
    const target = buildVectorCurveGeometry(CURVE, 'income', WIDTH, HEIGHT);

    expect(frameOf(animator).linePath).toBe(target?.linePath);
    expect(frameOf(animator).markerScale).toBe(1);
    expect(runUntilIdle(animator)).toBe(0);

    animator.setMetric('expenses');
    expect(frameOf(animator).linePath).toBe(
      buildVectorCurveGeometry(CURVE, 'expenses', WIDTH, HEIGHT)?.linePath
    );
    expect(frameOf(animator).color).toBe(COLORS.expenses);

    animator.setStop(12);
    expect(frameOf(animator).marker.x).toBeCloseTo(
      resolveVectorStopPoint(CURVE, 'expenses', 12, WIDTH, HEIGHT).x,
      1
    );
    animator.setStop(null);
    expect(frameOf(animator).pulse).toBeNull();
    expect(runUntilIdle(animator)).toBe(0);
  });

  it('can switch Reduce Motion on in the middle of the entrance', () => {
    const animator = createAnimator();
    runFor(animator, 0.3);

    animator.setReducedMotion(true);

    expect(frameOf(animator).linePath).toBe(
      buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT)?.linePath
    );
    expect(runUntilIdle(animator)).toBe(0);
  });

  it('swaps colors at once when the theme changes', () => {
    const animator = createAnimator();
    runUntilIdle(animator);
    const light = Object.fromEntries(
      MONTHLY_CURVE_METRIC_IDS.map((id) => [id, getMetricColor(palettes.light, id)])
    ) as MetricColors;

    animator.setColors(light);

    expect(frameOf(animator).color).toBe(light.flow);
  });

  it('redraws at a new size without replaying the entrance', () => {
    const animator = createAnimator();
    runUntilIdle(animator);

    animator.setSize(320, 200);

    expect(frameOf(animator).linePath).toBe(
      buildVectorCurveGeometry(CURVE, 'flow', 320, 200)?.linePath
    );
  });
});

describe('mixHexColors', () => {
  it('blends each channel and clamps the amount', () => {
    expect(mixHexColors('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHexColors('#102030', '#405060', 0)).toBe('#102030');
    expect(mixHexColors('#102030', '#405060', 2)).toBe('#405060');
    expect(mixHexColors('#ff0000', '#0000ff', -1)).toBe('#FF0000');
  });

  it('switches halfway for colors it cannot blend', () => {
    expect(mixHexColors('red', '#0000FF', 0.4)).toBe('red');
    expect(mixHexColors('red', '#0000FF', 0.6)).toBe('#0000FF');
  });
});
