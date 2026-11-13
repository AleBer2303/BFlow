/**
 * The animated vector (SVG) stage: the stage of the Android and web skins and the iOS fallback
 * when the three.js scene cannot draw. Its geometry, motion, pointer, keyboard and touch
 * scrubbing, and how the Summary composes it.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GLView } from 'expo-gl';
import React from 'react';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { palettesBySkin, type PlatformSkinId } from '../../../design-system/tokens';
import type { MonthlyCurve } from '../../../domain/overview/monthlyCurve';
import { MonthlyCurveSection } from '../components/MonthlyCurveSection';
import { GL_CONTEXT_TIMEOUT_MS } from '../components/MonthlyCurveStage';
import MonthlyCurveVectorStage from '../components/MonthlyCurveVectorStage';
import {
  CURVE_MARGIN_PT,
  clampCurveStop,
  curveXForDay,
  type CurveStop,
} from '../scene/curveGeometry';
import {
  CURVE_MAX_FRAME_SECONDS,
  CURVE_MORPH_SECONDS,
  CURVE_PULSE_COUNT,
  CURVE_PULSE_SECONDS,
  CURVE_REVEAL_SECONDS,
} from '../scene/curveMotion';
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

function stageElement(
  onScrub: (stop: CurveStop | null) => void,
  curve: MonthlyCurve = CURVE,
  metricId: 'flow' | 'debt' = 'flow',
  options: { reducedMotion?: boolean; interaction?: 'pointer' | 'touch' } = {}
) {
  return (
    <BFlowThemeProvider skin="web" initialMode="light">
      <MonthlyCurveVectorStage
        curve={curve}
        metricId={metricId}
        reducedMotion={options.reducedMotion ?? false}
        interaction={options.interaction}
        onScrub={onScrub}
        onUnavailable={jest.fn()}
      />
    </BFlowThemeProvider>
  );
}

/** Called directly: fireEvent skips views whose responder declines touches (touch mode). */
function layoutStage() {
  const stage = screen.getByTestId('monthly-curve-vector-stage', { includeHiddenElements: true });
  act(() => {
    stage.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEIGHT } } });
  });
}

function renderStage(
  onScrub: (stop: CurveStop | null) => void,
  curve: MonthlyCurve = CURVE,
  metricId: 'flow' | 'debt' = 'flow',
  options: { reducedMotion?: boolean; interaction?: 'pointer' | 'touch' } = {}
) {
  const view = render(stageElement(onScrub, curve, metricId, options));
  layoutStage();
  return view;
}

/** One frame of a 60 Hz display. */
const FRAME_MS = 16;
/** The longest frame the animator accepts without dropping time. */
const COARSE_FRAME_MS = CURVE_MAX_FRAME_SECONDS * 1000;
const MARGIN_MS = 300;
/** The line and the projection are drawn. */
const REVEAL_MS = CURVE_REVEAL_SECONDS * 1000 + MARGIN_MS;
/** The entrance and its pulses are over: nothing moves. */
const ENTRANCE_REST_MS =
  (CURVE_REVEAL_SECONDS + CURVE_PULSE_SECONDS * CURVE_PULSE_COUNT) * 1000 + MARGIN_MS;
/** A morph or a glide has landed and every spring rests. The pulses a morph wakes go on. */
const MOTION_REST_MS = CURVE_MORPH_SECONDS * 1000 + 1_000;

let frameMs = FRAME_MS;

/**
 * Fake timers with a frame clock at the cadence of a display. React Native's test
 * `requestAnimationFrame` is `setTimeout(callback, 0)`, which fake timers fire once per
 * simulated millisecond: about 1,000 frames a second, each rebuilding every path of the
 * curve. Here a frame ticks every `frameMs`, so `elapse` steps the frames a 60 Hz display
 * would draw and `fastForward` skips the stretches no assertion looks at.
 */
function installFrameClock() {
  beforeEach(() => {
    jest.useFakeTimers();
    frameMs = FRAME_MS;
    // React Native's `cancelAnimationFrame` is `clearTimeout`, so it cancels these frames too.
    jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation(
        (callback) => setTimeout(() => callback(jest.now()), frameMs) as unknown as number
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
}

/** Steps the animation frame by frame, as a display would. */
function elapse(milliseconds: number) {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
}

/** Reaches a later state in coarse frames, for stretches no assertion looks at. */
function fastForward(milliseconds: number) {
  frameMs = COARSE_FRAME_MS;
  elapse(milliseconds);
  frameMs = FRAME_MS;
}

/**
 * A stage at rest that never played the entrance: Reduce Motion settles it on layout, then
 * motion comes back, so what the test does next (scrub, morph, month change) animates.
 */
function renderRestingStage(
  onScrub: (stop: CurveStop | null) => void,
  curve: MonthlyCurve = CURVE,
  metricId: 'flow' | 'debt' = 'flow',
  options: { interaction?: 'pointer' | 'touch' } = {}
) {
  const view = renderStage(onScrub, curve, metricId, { ...options, reducedMotion: true });
  view.rerender(stageElement(onScrub, curve, metricId, options));
  elapse(FRAME_MS);
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
  installFrameClock();

  it('draws nothing before layout, then draws the line in up to today and the projection', () => {
    render(stageElement(jest.fn()));
    expect(screen.queryByTestId('monthly-curve-vector-svg')).toBeNull();

    layoutStage();
    expect(screen.getByTestId('monthly-curve-vector-svg')).toBeTruthy();
    expect(screen.queryByTestId('monthly-curve-vector-line')).toBeNull();

    elapse(400);
    const partialLine = screen.getByTestId('monthly-curve-vector-line').props.d as string;
    expect(screen.queryByTestId('monthly-curve-vector-projection')).toBeNull();
    expect(screen.queryByTestId('monthly-curve-vector-marker')).toBeNull();

    elapse(REVEAL_MS - 400);
    const fullLine = screen.getByTestId('monthly-curve-vector-line').props.d as string;
    expect(fullLine.length).toBeGreaterThan(partialLine.length);
    expect(fullLine).toBe(buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT)?.linePath);
    expect(screen.getByTestId('monthly-curve-vector-area')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-vector-projection')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-vector-marker')).toBeTruthy();
    expect(screen.queryByTestId('monthly-curve-vector-dim')).toBeNull();
  });

  it('pulses the marker a few times after the entrance and then schedules no frames', () => {
    renderStage(jest.fn());

    elapse(1_700);
    expect(screen.getByTestId('monthly-curve-vector-pulse')).toBeTruthy();

    // Still pulsing just before the last ring fades.
    fastForward(ENTRANCE_REST_MS - 2 * MARGIN_MS - 1_700);
    expect(screen.getByTestId('monthly-curve-vector-pulse')).toBeTruthy();

    elapse(2 * MARGIN_MS);
    expect(screen.queryByTestId('monthly-curve-vector-pulse')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('shows the finished chart at once and never pulses with Reduce Motion', () => {
    renderStage(jest.fn(), CURVE, 'flow', { reducedMotion: true });

    expect(screen.getByTestId('monthly-curve-vector-line').props.d).toBe(
      buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT)?.linePath
    );
    expect(screen.getByTestId('monthly-curve-vector-projection')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-vector-marker')).toBeTruthy();

    elapse(32);
    expect(screen.queryByTestId('monthly-curve-vector-pulse')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('morphs to another metric and lands on its exact shape and color', () => {
    const view = renderRestingStage(jest.fn());
    const flowLine = buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT)?.linePath;
    expect(screen.getByTestId('monthly-curve-vector-line').props.d).toBe(flowLine);

    view.rerender(stageElement(jest.fn(), CURVE, 'debt'));
    elapse(200);
    const debtLine = buildVectorCurveGeometry(CURVE, 'debt', WIDTH, HEIGHT)?.linePath;
    // Halfway through the morph the shape is neither the old metric nor the new one.
    expect(screen.getByTestId('monthly-curve-vector-line').props.d).not.toBe(flowLine);
    expect(screen.getByTestId('monthly-curve-vector-line').props.d).not.toBe(debtLine);

    fastForward(MOTION_REST_MS);
    expect(screen.getByTestId('monthly-curve-vector-line').props.d).toBe(debtLine);
    const debtColor = palettesBySkin.web.light.semantic.debt;
    expect(screen.getByTestId('monthly-curve-vector-line').props.stroke).toEqual(
      expect.objectContaining({ payload: 0xff000000 + parseInt(debtColor.slice(1), 16) })
    );
  });

  it('uses the metric color of the web palette and omits the projection on a closed month', () => {
    renderRestingStage(jest.fn(), CLOSED_CURVE, 'debt');

    // react-native-svg stores colors as ARGB integers.
    const debtColor = palettesBySkin.web.light.semantic.debt;
    expect(screen.getByTestId('monthly-curve-vector-line').props.stroke).toEqual(
      expect.objectContaining({ payload: 0xff000000 + parseInt(debtColor.slice(1), 16) })
    );
    expect(screen.queryByTestId('monthly-curve-vector-projection')).toBeNull();
  });

  it('walks the month with the pointer, dims what follows and returns to today on leave', () => {
    const onScrub = jest.fn();
    renderRestingStage(onScrub);
    const today = resolveVectorStopPoint(CURVE, 'flow', CURVE.cutoffDay, WIDTH, HEIGHT);
    expect(screen.getByTestId('monthly-curve-vector-marker').props.cx).toBeCloseTo(today.x, 0);

    pointerAt(21);
    expect(onScrub).toHaveBeenLastCalledWith(21);
    expect(screen.getByTestId('monthly-curve-vector-dim')).toBeTruthy();

    // Moving within the same day does not spam the listener.
    pointerAt(21);
    expect(onScrub).toHaveBeenCalledTimes(1);

    // The marker glides to the chosen day: one frame in, it is still on its way.
    const day21 = resolveVectorStopPoint(CURVE, 'flow', 21, WIDTH, HEIGHT);
    elapse(FRAME_MS);
    const gliding = screen.getByTestId('monthly-curve-vector-marker').props.cx as number;
    expect(gliding).toBeLessThan(today.x);
    expect(gliding).toBeGreaterThan(day21.x + 1);

    fastForward(MOTION_REST_MS);
    const marker = screen.getByTestId('monthly-curve-vector-marker');
    expect(marker.props.cx).toBeCloseTo(day21.x, 0);
    expect(marker.props.cy).toBeCloseTo(day21.y, 0);
    // A scrubbed marker does not pulse, so the stage rests and schedules no frames.
    expect(jest.getTimerCount()).toBe(0);

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

  it('forgets its stop and replays the entrance when the month changes', () => {
    const onScrub = jest.fn();
    const view = renderRestingStage(onScrub);
    expect(screen.getByTestId('monthly-curve-vector-line')).toBeTruthy();
    pointerAt(21);

    view.rerender(stageElement(onScrub, buildTestCurve({ monthKey: '2026-11', cutoffDay: 9 })));

    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('monthly-curve-vector-dim')).toBeNull();
    expect(screen.queryByTestId('monthly-curve-vector-line')).toBeNull();
    expect(screen.getByTestId('monthly-curve-vector-stage').props.accessibilityValue).toEqual({
      text: 'Flujo neto · Hoy, 9 nov: $ 0',
    });

    fastForward(REVEAL_MS);
    expect(screen.getByTestId('monthly-curve-vector-line')).toBeTruthy();
  });

  it('scrubs by touch from the first contact and stays hidden from screen readers on phones', () => {
    const onScrub = jest.fn();
    renderRestingStage(onScrub, CURVE, 'flow', { interaction: 'touch' });

    expect(screen.queryByTestId('monthly-curve-vector-stage')).toBeNull();
    const stage = screen.getByTestId('monthly-curve-vector-stage', { includeHiddenElements: true });
    expect(stage.props.tabIndex).toBeUndefined();
    expect(screen.getByTestId('monthly-curve-vector-line', { includeHiddenElements: true })).toBeTruthy();

    expect(stage.props.onStartShouldSetResponder(touchAt(0, 0, 1))).toBe(true);

    const start = curveXForDay(10, 31, WIDTH);

    act(() => stage.props.onResponderGrant(touchAt(start, 0, 5)));
    expect(onScrub).toHaveBeenLastCalledWith(10);
    act(() => stage.props.onResponderRelease(touchAt(start, 0, 6)));
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });
});

function touchAt(pageX: number, pageY: number, timestamp: number) {
  return {
    nativeEvent: { touches: [{}], locationX: pageX },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
      numberActiveTouches: 1,
      touchBank: [
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: pageX,
          currentPageY: pageY,
          currentTimeStamp: timestamp,
          previousPageX: 0,
          previousPageY: 0,
          previousTimeStamp: timestamp,
        },
      ],
    },
  };
}

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
  installFrameClock();

  function renderSection(skin: PlatformSkinId, layout: 'stacked' | 'split' = 'stacked') {
    return render(
      <BFlowThemeProvider skin={skin}>
        <MonthlyCurveSection curve={CURVE} layout={layout} />
      </BFlowThemeProvider>
    );
  }

  const hidden = { includeHiddenElements: true } as const;

  it('keeps the three.js stage on ios', () => {
    renderSection('ios');
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(1);
    expect(screen.queryByTestId('monthly-curve-vector-stage', hidden)).toBeNull();
  });

  // ADR 0014: on Android the expo-gl surface did not refresh on screen, so the curve looked
  // frozen. The Android skin draws it with the animated vectors and never opens a GL context.
  it('draws the curve on Android with touch-driven vectors and never mounts a GL surface', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderSection('android');

    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(0);
    expect(screen.UNSAFE_getByType(MonthlyCurveVectorStage).props.interaction).toBe('touch');
    // Like the canvas on iOS, it stays hidden from TalkBack: the metric buttons state the figures.
    expect(screen.queryByTestId('monthly-curve-vector-stage')).toBeNull();
    expect(screen.getByTestId('monthly-curve-vector-stage', hidden)).toBeTruthy();

    // It is the stage, not a fallback: nothing waits for a GL surface or reports a failure.
    act(() => jest.advanceTimersByTime(GL_CONTEXT_TIMEOUT_MS));
    expect(warn).not.toHaveBeenCalled();
    expect(screen.UNSAFE_getByType(MonthlyCurveVectorStage)).toBeTruthy();
    warn.mockRestore();
  });

  it('animates on Android: the line draws in, the marker pulses and metrics morph', () => {
    renderSection('android');
    layoutStage();
    const line = () => screen.getByTestId('monthly-curve-vector-line', hidden).props.d as string;

    elapse(400);
    const partialLine = line();
    elapse(1_300);
    expect(line().length).toBeGreaterThan(partialLine.length);
    expect(screen.getByTestId('monthly-curve-vector-pulse', hidden)).toBeTruthy();

    fastForward(ENTRANCE_REST_MS - 1_700);
    const flowLine = buildVectorCurveGeometry(CURVE, 'flow', WIDTH, HEIGHT)?.linePath;
    expect(line()).toBe(flowLine);
    expect(screen.queryByTestId('monthly-curve-vector-pulse', hidden)).toBeNull();

    fireEvent.press(screen.getByTestId('monthly-curve-metric-debt'));
    elapse(200);
    const debtLine = buildVectorCurveGeometry(CURVE, 'debt', WIDTH, HEIGHT)?.linePath;
    // Halfway through the morph the shape is neither the old metric nor the new one.
    expect(line()).not.toBe(flowLine);
    expect(line()).not.toBe(debtLine);
    expect(screen.getByTestId('monthly-curve-vector-pulse', hidden)).toBeTruthy();

    fastForward(MOTION_REST_MS);
    expect(line()).toBe(debtLine);
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 6.200.000');
  });

  it('walks the month by touch on Android and keeps the readout in step', () => {
    renderSection('android');
    layoutStage();
    fastForward(REVEAL_MS);

    const stage = screen.getByTestId('monthly-curve-vector-stage', hidden);
    const x = curveXForDay(21, 31, WIDTH);

    act(() => stage.props.onResponderGrant(touchAt(x, 0, 5)));
    expect(screen.getByText('Flujo neto · 21 oct')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 2.880.000');

    act(() => stage.props.onResponderRelease(touchAt(x, 0, 6)));
    expect(screen.getByText('Flujo neto · Hoy, 27 oct')).toBeTruthy();
  });

  it('uses the vector stage on web and keeps the readout in step with it', () => {
    renderSection('web');
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(0);
    expect(screen.UNSAFE_getByType(MonthlyCurveVectorStage).props.interaction).toBe('pointer');

    fireEvent(screen.getByTestId('monthly-curve-vector-stage'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEIGHT } },
    });
    act(() => pointerAt(21));

    expect(screen.getByText('Flujo neto · 21 oct')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 2.880.000');
    expect(screen.getByText('+$ 2.880.000 ese día')).toBeTruthy();
  });

  it('turns the selector into a metric table in the split layout', () => {
    renderSection('web', 'split');

    expect(screen.getByTestId('monthly-curve-metric-list')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-income')).toHaveTextContent(
      'Ingresos recibidos$ 4.000.000'
    );

    fireEvent.press(screen.getByTestId('monthly-curve-metric-debt'));
    expect(screen.getByTestId('monthly-curve-metric-debt').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    elapse(1_000);
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 6.200.000');
  });
});
