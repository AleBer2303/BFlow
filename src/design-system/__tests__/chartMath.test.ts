/**
 * Pure pieces of the animated charts: value axis, geometry and motion.
 */

import {
  bandCenter,
  buildArcPath,
  buildAreaPath,
  buildLinePath,
  buildValueScale,
  resolveNiceStep,
  resolveSliceEndAngles,
  valueToY,
} from '../components/charts/chartScale';
import {
  CHART_ENTRANCE_SECONDS,
  CHART_FALLBACK_FRAME_SECONDS,
  CHART_MAX_FRAME_SECONDS,
  CHART_MAX_STAGGER_SECONDS,
  CHART_MORPH_SECONDS,
  ChartTransition,
  easeOutCubic,
  resolveChartFrameSeconds,
} from '../components/charts/chartTransition';

/** Steps a transition at 60 fps until it rests. @returns the number of frames. */
function runToRest(transition: ChartTransition): number {
  let frames = 0;
  while (transition.advance(1 / 60)) {
    frames += 1;
    if (frames > 10_000) throw new Error('never settled');
  }
  return frames;
}

describe('value scale', () => {
  it('picks round steps', () => {
    expect(resolveNiceStep(4_000_000, 4)).toBe(1_000_000);
    expect(resolveNiceStep(3_370_000, 4)).toBe(1_000_000);
    expect(resolveNiceStep(900_000, 4)).toBe(250_000);
    expect(resolveNiceStep(700, 4)).toBe(200);
    expect(resolveNiceStep(0, 4)).toBe(1);
    expect(resolveNiceStep(Number.NaN, 4)).toBe(1);
  });

  it('always contains zero and covers every value with whole-peso ticks', () => {
    expect(buildValueScale([4_000_000, 2_920_000, 450_000])).toEqual({
      min: 0,
      max: 4_000_000,
      ticks: [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000],
    });
    expect(buildValueScale([1_080_000, -500_000])).toEqual({
      min: -500_000,
      max: 1_500_000,
      ticks: [-500_000, 0, 500_000, 1_000_000, 1_500_000],
    });
    for (const tick of buildValueScale([5]).ticks) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  it('falls back to a unit scale when everything is zero or not finite', () => {
    expect(buildValueScale([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(buildValueScale([0, 0])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(buildValueScale([Number.NaN, Number.POSITIVE_INFINITY])).toEqual({
      min: 0,
      max: 1,
      ticks: [0, 1],
    });
  });

  it('maps values into the plot box, clamped to the scale', () => {
    const scale = { min: 0, max: 100, ticks: [0, 100] };
    const box = { top: 10, height: 100 };
    expect(valueToY(0, scale, box)).toBe(110);
    expect(valueToY(100, scale, box)).toBe(10);
    expect(valueToY(50, scale, box)).toBe(60);
    expect(valueToY(500, scale, box)).toBe(10);
    expect(valueToY(-5, scale, box)).toBe(110);
    expect(valueToY(3, { min: 0, max: 0, ticks: [0] }, box)).toBe(110);
  });
});

describe('chart geometry', () => {
  it('centers equal bands', () => {
    expect(bandCenter(0, 4, 200)).toBe(25);
    expect(bandCenter(3, 4, 200)).toBe(175);
    expect(bandCenter(0, 0, 200)).toBe(100);
  });

  it('builds line and area paths', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 50.123, y: 20.456 },
    ];
    expect(buildLinePath(points)).toBe('M0 10 L50.12 20.46');
    expect(buildAreaPath(points, 100)).toBe('M0 10 L50.12 20.46 L50.12 100 L0 100 Z');
    expect(buildAreaPath([], 100)).toBe('');
  });

  it('draws arcs clockwise from the top, and a full ring in two halves', () => {
    expect(buildArcPath(50, 50, 40, 0, 0)).toBe('');
    expect(buildArcPath(50, 50, 40, 90, 10)).toBe('');
    expect(buildArcPath(50, 50, 40, 0, 90)).toBe('M50 10 A40 40 0 0 1 90 50');
    expect(buildArcPath(50, 50, 40, 0, 270)).toBe('M50 10 A40 40 0 1 1 10 50');
    expect(buildArcPath(50, 50, 40, 0, 360)).toBe(
      'M50 10 A40 40 0 1 1 50 90 A40 40 0 1 1 50 10'
    );
  });

  it('turns amounts into cumulative angles that end at a full turn', () => {
    expect(resolveSliceEndAngles([1, 1, 2])).toEqual([90, 180, 360]);
    expect(resolveSliceEndAngles([0, 0])).toEqual([0, 0]);
    expect(resolveSliceEndAngles([5, -5])).toEqual([360, 360]);
  });
});

describe('chart motion', () => {
  it('eases out without overshoot', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeOutCubic(t)).toBeLessThanOrEqual(1);
      expect(easeOutCubic(t)).toBeGreaterThanOrEqual(t - 1e-9);
    }
  });

  it('limits frame gaps', () => {
    expect(resolveChartFrameSeconds(1000, null)).toBe(CHART_FALLBACK_FRAME_SECONDS);
    expect(resolveChartFrameSeconds(1016, 1000)).toBeCloseTo(0.016, 5);
    expect(resolveChartFrameSeconds(5000, 1000)).toBe(CHART_MAX_FRAME_SECONDS);
    expect(resolveChartFrameSeconds(900, 1000)).toBe(0);
    expect(resolveChartFrameSeconds(Number.NaN, 1000)).toBe(CHART_FALLBACK_FRAME_SECONDS);
  });

  it('grows every value from zero on entrance, one after another, then rests', () => {
    const transition = new ChartTransition([100, 200, 300], { animate: true });
    expect(transition.getValues()).toEqual([0, 0, 0]);
    expect(transition.isSettled()).toBe(false);

    transition.advance(0.1);
    const [first, second, third] = transition.getValues() as [number, number, number];
    expect(first / 100).toBeGreaterThan(second / 200);
    expect(second / 200).toBeGreaterThan(third / 300);

    const frames = runToRest(transition);
    expect(transition.getValues()).toEqual([100, 200, 300]);
    expect(frames / 60).toBeLessThanOrEqual(CHART_ENTRANCE_SECONDS + CHART_MAX_STAGGER_SECONDS);
    expect(transition.advance(1 / 60)).toBe(false);
  });

  it('keeps the whole entrance short however many values there are', () => {
    const transition = new ChartTransition(Array.from({ length: 40 }, () => 1), {
      animate: true,
    });
    const frames = runToRest(transition);
    expect(frames / 60).toBeLessThanOrEqual(CHART_ENTRANCE_SECONDS + CHART_MAX_STAGGER_SECONDS + 0.02);
  });

  it('moves from the current values to new data, and new values grow from zero', () => {
    const transition = new ChartTransition([100, 200], { animate: true });
    runToRest(transition);

    transition.retarget([300, 200, 50]);
    expect(transition.getValues()).toEqual([100, 200, 0]);
    transition.advance(CHART_MORPH_SECONDS / 2);
    const [moving, steady, fresh] = transition.getValues() as [number, number, number];
    expect(moving).toBeGreaterThan(100);
    expect(moving).toBeLessThan(300);
    expect(steady).toBe(200);
    expect(fresh).toBeGreaterThan(0);

    runToRest(transition);
    expect(transition.getValues()).toEqual([300, 200, 50]);
  });

  it('ignores the same data and retargets mid-flight from where it is', () => {
    const transition = new ChartTransition([100], { animate: true });
    runToRest(transition);
    transition.retarget([100]);
    expect(transition.isSettled()).toBe(true);

    transition.retarget([200]);
    transition.advance(0.1);
    const midway = transition.getValues()[0] as number;
    transition.retarget([0]);
    expect(transition.getValues()[0]).toBe(midway);
  });

  it('moves values together when stagger is off (ordered donut angles)', () => {
    const transition = new ChartTransition([90, 180, 360], { animate: true, stagger: false });
    transition.advance(0.2);
    const values = transition.getValues();
    expect((values[0] as number) / 90).toBeCloseTo((values[2] as number) / 360, 10);
    expect([...values]).toEqual([...values].sort((a, b) => a - b));
  });

  it('draws the targets at once when motion is reduced', () => {
    const transition = new ChartTransition([100, 200], { animate: false });
    expect(transition.getValues()).toEqual([100, 200]);
    expect(transition.isSettled()).toBe(true);
    transition.retarget([5, 6]);
    expect(transition.getValues()).toEqual([5, 6]);

    const animated = new ChartTransition([10], { animate: true });
    animated.setAnimate(true);
    expect(animated.getValues()).toEqual([0]);
    animated.setAnimate(false);
    expect(animated.getValues()).toEqual([10]);
  });

  it('handles an empty data set', () => {
    const transition = new ChartTransition([], { animate: true });
    expect(transition.getValues()).toEqual([]);
    runToRest(transition);
    expect(transition.isSettled()).toBe(true);
  });
});
