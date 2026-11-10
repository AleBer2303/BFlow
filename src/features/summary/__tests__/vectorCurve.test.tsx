/**
 * The vector (SVG) stage that replaces the three.js scene on the web skin: its geometry,
 * pointer and keyboard scrubbing, and how the Summary composes it.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GLView } from 'expo-gl';
import React from 'react';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { palettesBySkin, type PlatformSkinId } from '../../../design-system/tokens';
import type { MonthlyCurve } from '../../../domain/overview/monthlyCurve';
import { MonthlyCurveSection } from '../components/MonthlyCurveSection';
import MonthlyCurveVectorStage from '../components/MonthlyCurveVectorStage';
import {
  CURVE_MARGIN_PT,
  clampCurveStop,
  curveXForDay,
  type CurveStop,
} from '../scene/curveGeometry';
import {
  VECTOR_GRID_LINE_COUNT,
  VECTOR_PLOT_PADDING_BOTTOM_PT,
  VECTOR_PLOT_PADDING_TOP_PT,
  buildVectorCurveGeometry,
  resolveVectorStopPoint,
  stepCurveStop,
  vectorYForValue,
} from '../scene/vectorCurveGeometry';
import { buildTestCurve } from './curveFixture';

const CURVE = buildTestCurve();
const CLOSED_CURVE = buildTestCurve({ cutoffDay: 31, hasProjection: false, isCurrentMonth: false });
const WIDTH = 600;
const HEIGHT = 260;

describe('vectorCurveGeometry', () => {
  it('returns nothing until the stage has a usable size', () => {
    expect(buildVectorCurveGeometry(CURVE, 'flow', 0, HEIGHT)).toBeNull();
    expect(buildVectorCurveGeometry(CURVE, 'flow', CURVE_MARGIN_PT * 2, HEIGHT)).toBeNull();
    expect(buildVectorCurveGeometry(CURVE, 'flow', WIDTH, 0)).toBeNull();
  });

  it('draws from the opening to the cutoff day inside the plot', () => {
    const geometry = buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT);
    if (!geometry) throw new Error('geometry expected');

    expect(geometry.linePath.startsWith(`M${CURVE_MARGIN_PT} `)).toBe(true);
    expect(geometry.cutoffPoint.x).toBeCloseTo(curveXForDay(CURVE.cutoffDay, 31, WIDTH), 1);
    expect(geometry.baselineY).toBe(HEIGHT - VECTOR_PLOT_PADDING_BOTTOM_PT);

    const ys = [...geometry.linePath.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(VECTOR_PLOT_PADDING_TOP_PT);
    expect(Math.max(...ys)).toBeLessThanOrEqual(geometry.baselineY);
  });

  it('ends each day on its exact value, like the 3D scene', () => {
    const series = CURVE.series.flow;
    const point = resolveVectorStopPoint(CURVE, 'flow', 21, WIDTH, HEIGHT);

    expect(point.x).toBeCloseTo(curveXForDay(21, 31, WIDTH), 1);
    expect(point.y).toBeCloseTo(vectorYForValue(series, 2_880_000, HEIGHT), 1);
    // The opening value (0 on a 0..max scale) rests on the baseline.
    expect(vectorYForValue(series, 0, HEIGHT)).toBe(HEIGHT - VECTOR_PLOT_PADDING_BOTTOM_PT);
    expect(vectorYForValue(series, series.scaleMax, HEIGHT)).toBe(VECTOR_PLOT_PADDING_TOP_PT);
  });

  it('closes the area on the baseline', () => {
    const geometry = buildVectorCurveGeometry(CURVE, 'income', WIDTH, HEIGHT);
    if (!geometry) throw new Error('geometry expected');

    expect(geometry.areaPath.endsWith(`L${CURVE_MARGIN_PT} ${geometry.baselineY} Z`)).toBe(true);
    expect(geometry.areaPath.startsWith(geometry.linePath)).toBe(true);
  });

  it('projects the close only while the month is open', () => {
    const open = buildVectorCurveGeometry(CURVE, 'income', WIDTH, HEIGHT);
    const closed = buildVectorCurveGeometry(CLOSED_CURVE, 'income', WIDTH, HEIGHT);
    if (!open || !closed) throw new Error('geometry expected');

    expect(open.projectionPath).not.toBeNull();
    expect(open.projectedPoint?.x).toBeCloseTo(WIDTH - CURVE_MARGIN_PT, 1);
    expect(open.projectedPoint).toEqual(resolveVectorStopPoint(CURVE, 'income', 'close', WIDTH, HEIGHT));
    expect(closed.projectionPath).toBeNull();
    expect(closed.projectedPoint).toBeNull();
  });

  it('spreads the grid lines from the top of the plot to the baseline', () => {
    const geometry = buildVectorCurveGeometry(CURVE, 'debt', WIDTH, HEIGHT);
    if (!geometry) throw new Error('geometry expected');

    expect(geometry.gridLineYs).toHaveLength(VECTOR_GRID_LINE_COUNT);
    expect(geometry.gridLineYs[0]).toBe(VECTOR_PLOT_PADDING_TOP_PT);
    expect(geometry.gridLineYs[VECTOR_GRID_LINE_COUNT - 1]).toBe(geometry.baselineY);
  });

  it('never leaves the plot when a value falls outside the scale', () => {
    const series = CURVE.series.flow;
    expect(vectorYForValue(series, series.scaleMax * 3, HEIGHT)).toBe(VECTOR_PLOT_PADDING_TOP_PT);
    expect(vectorYForValue(series, series.scaleMin - 1, HEIGHT)).toBe(
      HEIGHT - VECTOR_PLOT_PADDING_BOTTOM_PT
    );
  });
});

describe('stepCurveStop (keyboard scrubbing)', () => {
  it('starts the walk at the cutoff day', () => {
    expect(stepCurveStop(CURVE, null, -1)).toBe(27);
    expect(stepCurveStop(CURVE, null, 1)).toBe(27);
  });

  it('steps one day at a time and stops at day 1', () => {
    expect(stepCurveStop(CURVE, 27, -1)).toBe(26);
    expect(stepCurveStop(CURVE, 10, 1)).toBe(11);
    expect(stepCurveStop(CURVE, 1, -1)).toBe(1);
  });

  it('reaches the projected close past the cutoff, only when there is one', () => {
    expect(stepCurveStop(CURVE, 27, 1)).toBe('close');
    expect(stepCurveStop(CURVE, 'close', 1)).toBe('close');
    expect(stepCurveStop(CURVE, 'close', -1)).toBe(27);
    expect(stepCurveStop(CLOSED_CURVE, 31, 1)).toBe(31);
  });
});

function renderStage(
  onScrub: (stop: CurveStop | null) => void,
  curve: MonthlyCurve = CURVE,
  metricId: 'flow' | 'debt' = 'flow'
) {
  const view = render(
    <BFlowThemeProvider skin="web" initialMode="light">
      <MonthlyCurveVectorStage
        curve={curve}
        metricId={metricId}
        reducedMotion={false}
        onScrub={onScrub}
        onUnavailable={jest.fn()}
      />
    </BFlowThemeProvider>
  );
  fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEIGHT } },
  });
  return view;
}

function pointerAt(day: number) {
  fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'pointerMove', {
    nativeEvent: { offsetX: curveXForDay(day, 31, WIDTH) },
  });
}

function pressKey(key: string) {
  fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'keyDown', {
    nativeEvent: { key },
    preventDefault: jest.fn(),
  });
}

describe('MonthlyCurveVectorStage', () => {
  it('draws nothing before layout and the full chart after it', () => {
    render(
      <BFlowThemeProvider skin="web">
        <MonthlyCurveVectorStage
          curve={CURVE}
          metricId="flow"
          reducedMotion={false}
          onScrub={jest.fn()}
          onUnavailable={jest.fn()}
        />
      </BFlowThemeProvider>
    );
    expect(screen.queryByTestId('monthly-curve-vector-svg')).toBeNull();

    fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEIGHT } },
    });
    expect(screen.getByTestId('monthly-curve-vector-line')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-vector-area')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-vector-projection')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-vector-marker')).toBeTruthy();
    expect(screen.queryByTestId('monthly-curve-vector-dim')).toBeNull();
  });

  it('uses the metric color of the web palette and omits the projection on a closed month', () => {
    renderStage(jest.fn(), CLOSED_CURVE, 'debt');

    // react-native-svg stores colors as ARGB integers.
    const debtColor = palettesBySkin.web.light.semantic.debt;
    expect(screen.getByTestId('monthly-curve-vector-line').props.stroke).toEqual(
      expect.objectContaining({ payload: 0xff000000 + parseInt(debtColor.slice(1), 16) })
    );
    expect(screen.queryByTestId('monthly-curve-vector-projection')).toBeNull();
  });

  it('walks the month with the pointer, dims what follows and returns to today on leave', () => {
    const onScrub = jest.fn();
    renderStage(onScrub);

    pointerAt(21);
    expect(onScrub).toHaveBeenLastCalledWith(21);
    expect(screen.getByTestId('monthly-curve-vector-dim')).toBeTruthy();

    // Moving within the same day does not spam the listener.
    pointerAt(21);
    expect(onScrub).toHaveBeenCalledTimes(1);

    pointerAt(31);
    expect(onScrub).toHaveBeenLastCalledWith('close');

    fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'pointerLeave');
    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('monthly-curve-vector-dim')).toBeNull();
  });

  it('accepts touch coordinates and ignores events without a position', () => {
    const onScrub = jest.fn();
    renderStage(onScrub);

    fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'pointerDown', {
      nativeEvent: { locationX: curveXForDay(10, 31, WIDTH) },
    });
    expect(onScrub).toHaveBeenLastCalledWith(10);

    fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'pointerMove', { nativeEvent: {} });
    expect(onScrub).toHaveBeenCalledTimes(1);
  });

  it('can be walked with the keyboard and announces the figure', () => {
    const onScrub = jest.fn();
    renderStage(onScrub);
    const stage = () => screen.getByTestId('monthly-curve-vector-stage');

    expect(stage().props.tabIndex).toBe(0);
    expect(stage().props.accessibilityRole).toBe('adjustable');
    expect(stage().props.accessibilityValue).toEqual({ text: 'Flujo neto · Hoy, 27 oct: $ 1.080.000' });

    pressKey('ArrowLeft');
    expect(onScrub).toHaveBeenLastCalledWith(27);
    pressKey('ArrowLeft');
    expect(onScrub).toHaveBeenLastCalledWith(26);
    expect(stage().props.accessibilityValue).toEqual({ text: 'Flujo neto · 26 oct: $ 2.880.000' });

    pressKey('Home');
    expect(onScrub).toHaveBeenLastCalledWith(1);
    pressKey('End');
    expect(onScrub).toHaveBeenLastCalledWith('close');
    pressKey('ArrowRight');
    expect(onScrub).toHaveBeenCalledTimes(4);

    pressKey('Escape');
    expect(onScrub).toHaveBeenLastCalledWith(null);

    // Other keys are left to the browser.
    pressKey('Tab');
    expect(onScrub).toHaveBeenCalledTimes(5);
  });

  it('forgets its stop when the month changes', () => {
    const onScrub = jest.fn();
    const view = renderStage(onScrub);
    pointerAt(21);

    view.rerender(
      <BFlowThemeProvider skin="web" initialMode="light">
        <MonthlyCurveVectorStage
          curve={buildTestCurve({ monthKey: '2026-11', cutoffDay: 9 })}
          metricId="flow"
          reducedMotion={false}
          onScrub={onScrub}
          onUnavailable={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('monthly-curve-vector-dim')).toBeNull();
    expect(screen.getByTestId('monthly-curve-vector-stage').props.accessibilityValue).toEqual({
      text: 'Flujo neto · Hoy, 9 nov: $ 0',
    });
  });
});

describe('clampCurveStop', () => {
  it('keeps valid stops and drops the ones the curve no longer has', () => {
    expect(clampCurveStop(CURVE, null)).toBeNull();
    expect(clampCurveStop(CURVE, 1)).toBe(1);
    expect(clampCurveStop(CURVE, 27)).toBe(27);
    expect(clampCurveStop(CURVE, 28)).toBeNull();
    expect(clampCurveStop(CURVE, 0)).toBeNull();
    expect(clampCurveStop(CURVE, 3.5)).toBeNull();
    expect(clampCurveStop(CURVE, 'close')).toBe('close');
    expect(clampCurveStop(CLOSED_CURVE, 'close')).toBeNull();
  });
});

describe('MonthlyCurveSection stage per skin', () => {
  function renderSection(skin: PlatformSkinId, layout: 'stacked' | 'split' = 'stacked') {
    return render(
      <BFlowThemeProvider skin={skin}>
        <MonthlyCurveSection curve={CURVE} layout={layout} />
      </BFlowThemeProvider>
    );
  }

  it.each(['ios', 'android'] as const)('keeps the three.js stage on %s', (skin) => {
    renderSection(skin);
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(1);
    expect(screen.queryByTestId('monthly-curve-vector-stage')).toBeNull();
  });

  it('uses the vector stage on web and keeps the readout in step with it', () => {
    renderSection('web');
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(0);

    fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEIGHT } },
    });
    act(() => pointerAt(21));

    expect(screen.getByText('Flujo neto · 21 oct')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 2.880.000');
    expect(screen.getByText('+$ 2.880.000 ese día')).toBeTruthy();
  });

  it('turns the selector into a metric table in the split layout', async () => {
    renderSection('web', 'split');

    expect(screen.getByTestId('monthly-curve-metric-list')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-income')).toHaveTextContent(
      'Ingresos recibidos$ 4.000.000'
    );

    fireEvent.press(screen.getByTestId('monthly-curve-metric-debt'));
    expect(screen.getByTestId('monthly-curve-metric-debt').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    await waitFor(() =>
      expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 6.200.000')
    );
  });
});
