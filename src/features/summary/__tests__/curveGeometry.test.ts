import {
  CURVE_MARGIN_PT,
  curveXForDay,
  fillCurveSamples,
  normalizeCurveValue,
  resolveCurveStop,
  sampleCurveValue,
} from '../scene/curveGeometry';
import { buildTestCurve } from './curveFixture';

const WIDTH = 300;

function xForDay(day: number): number {
  return curveXForDay(day, 31, WIDTH);
}

describe('sampleCurveValue', () => {
  const values = [100, 100, 500];

  it('lands exactly on the close of every day', () => {
    expect(sampleCurveValue(values, 0)).toBe(100);
    expect(sampleCurveValue(values, 1)).toBe(100);
    expect(sampleCurveValue(values, 2)).toBe(500);
  });

  it('holds the previous value until the change starts and then eases in', () => {
    expect(sampleCurveValue(values, 1.05)).toBe(100);
    const halfway = sampleCurveValue(values, 1.55);
    expect(halfway).toBeGreaterThan(100);
    expect(halfway).toBeLessThan(500);
  });

  it('stays inside the available days', () => {
    expect(sampleCurveValue(values, -3)).toBe(100);
    expect(sampleCurveValue(values, 9)).toBe(500);
  });
});

describe('fillCurveSamples', () => {
  it('normalizes samples from the opening to the cutoff on the series scale', () => {
    const curve = buildTestCurve();
    const samples = new Float32Array(100);

    fillCurveSamples(curve.series.debt, curve.cutoffDay, samples);

    expect(samples[0]).toBeCloseTo(1, 5);
    expect(samples[99]).toBeCloseTo(6_200_000 / 8_000_000, 5);
  });

  it('maps the scale limits to 0 and 1', () => {
    const series = buildTestCurve().series.flow;

    expect(normalizeCurveValue(series, series.scaleMin)).toBe(0);
    expect(normalizeCurveValue(series, series.scaleMax)).toBe(1);
  });
});

describe('curveXForDay', () => {
  it('keeps the month between the plot margins', () => {
    expect(xForDay(0)).toBe(CURVE_MARGIN_PT);
    expect(xForDay(31)).toBe(WIDTH - CURVE_MARGIN_PT);
  });
});

describe('resolveCurveStop', () => {
  const curve = buildTestCurve();

  it('snaps to the closest day', () => {
    expect(resolveCurveStop(curve, xForDay(12), WIDTH)).toBe(12);
    expect(resolveCurveStop(curve, xForDay(12.4), WIDTH)).toBe(12);
  });

  it('never goes before day 1 or past the latest known day', () => {
    expect(resolveCurveStop(curve, -50, WIDTH)).toBe(1);
    expect(resolveCurveStop(curve, xForDay(27.9), WIDTH)).toBe(27);
  });

  it('jumps to the month close beyond today, where only a projection exists', () => {
    expect(resolveCurveStop(curve, xForDay(29), WIDTH)).toBe('close');
    expect(resolveCurveStop(curve, WIDTH + 40, WIDTH)).toBe('close');
  });

  it('has no close stop without a projection', () => {
    const closed = buildTestCurve({ cutoffDay: 31, hasProjection: false, isCurrentMonth: false });

    expect(resolveCurveStop(closed, WIDTH, WIDTH)).toBe(31);
  });
});
