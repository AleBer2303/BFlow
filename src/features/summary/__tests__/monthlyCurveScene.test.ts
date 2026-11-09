import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { BufferGeometry, Material, MaxEquation, MinEquation } from 'three';
import { palettes } from '../../../design-system/tokens';
import { curveXForDay } from '../scene/curveGeometry';
import { MonthlyCurveScene, type MonthlyCurveSceneOptions } from '../scene/monthlyCurveScene';
import { toScenePalette } from '../scene/scenePalette';
import { buildTestCurve } from './curveFixture';

const WIDTH_PT = 300;
const CURVE = buildTestCurve();

function createHarness(overrides: Partial<MonthlyCurveSceneOptions> = {}) {
  const callbacks = new Map<number, (timestamp: number) => void>();
  let nextHandle = 1;
  let now = 0;

  const renderer = {
    setSize: jest.fn(),
    setClearColor: jest.fn(),
    render: jest.fn(),
    dispose: jest.fn(),
  };
  const gl = { endFrameEXP: jest.fn() } as unknown as ExpoWebGLRenderingContext;

  const scene = new MonthlyCurveScene({
    gl,
    bufferWidth: 600,
    bufferHeight: 400,
    pixelRatio: 2,
    palette: toScenePalette(palettes.dark, 'dark'),
    curve: CURVE,
    metricId: 'flow',
    reducedMotion: false,
    createRenderer: () => renderer,
    requestFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      callbacks.delete(handle);
    },
    ...overrides,
  });

  const flushFrame = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    now += 16;
    pending.forEach((callback) => callback(now));
  };

  const flushFrames = (count: number) => {
    for (let index = 0; index < count; index += 1) {
      flushFrame();
    }
  };

  const runUntilIdle = () => {
    let frames = 0;
    while (callbacks.size > 0) {
      flushFrame();
      frames += 1;
      if (frames > 3000) {
        throw new Error('Scene never went idle');
      }
    }
    return frames;
  };

  return { scene, renderer, gl, callbacks, flushFrame, flushFrames, runUntilIdle };
}

function xForDay(day: number): number {
  return curveXForDay(day, 31, WIDTH_PT);
}

describe('MonthlyCurveScene', () => {
  it('draws the line in, marks today and then stops rendering', () => {
    const { scene, renderer, gl, callbacks, runUntilIdle } = createHarness();

    expect(scene.getSnapshot().revealProgress).toBe(0);
    runUntilIdle();

    const snapshot = scene.getSnapshot();
    expect(snapshot.revealProgress).toBe(1);
    expect(snapshot.pointX).toBeCloseTo(xForDay(27), 1);
    expect(snapshot.isDashVisible).toBe(true);
    expect(snapshot.isPulsing).toBe(false);
    expect(callbacks.size).toBe(0);
    expect(scene.isIdle()).toBe(true);
    expect((gl.endFrameEXP as jest.Mock).mock.calls.length).toBe(renderer.render.mock.calls.length);
  });

  it('calls the platform frame functions without rebinding them', () => {
    const globals = globalThis as unknown as {
      requestAnimationFrame: (callback: () => void) => number;
      cancelAnimationFrame: (handle: number) => void;
    };
    const originalRequest = globals.requestAnimationFrame;
    const originalCancel = globals.cancelAnimationFrame;
    // Browsers throw "Illegal invocation" when `this` is anything but the window.
    const assertUnbound = (receiver: unknown) => {
      if (receiver !== undefined && receiver !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
    };
    const request = jest.fn(function (this: unknown) {
      assertUnbound(this);
      return 7;
    });
    const cancel = jest.fn(function (this: unknown) {
      assertUnbound(this);
    });
    globals.requestAnimationFrame = request;
    globals.cancelAnimationFrame = cancel;

    try {
      const { scene } = createHarness({ requestFrame: undefined, cancelFrame: undefined });
      expect(request).toHaveBeenCalledTimes(1);

      scene.dispose();
      expect(cancel).toHaveBeenCalledWith(7);
    } finally {
      globals.requestAnimationFrame = originalRequest;
      globals.cancelAnimationFrame = originalCancel;
    }
  });

  it('pulses for a limited time only, so the marker does not drain the battery', () => {
    const { scene, flushFrames, runUntilIdle } = createHarness();

    flushFrames(110);
    expect(scene.getSnapshot().isPulsing).toBe(true);

    expect(runUntilIdle()).toBeLessThan(500);
    expect(scene.getSnapshot().isPulsing).toBe(false);
  });

  it('morphs to another metric and adopts its color', () => {
    const { scene, flushFrame, runUntilIdle } = createHarness();
    runUntilIdle();
    const flowY = scene.getSnapshot().pointY;

    scene.setMetric('debt');
    flushFrame();
    expect(scene.getSnapshot().morphProgress).toBeLessThan(1);

    runUntilIdle();
    const snapshot = scene.getSnapshot();
    expect(snapshot.morphProgress).toBe(1);
    expect(snapshot.colorHex).toBe(palettes.dark.semantic.debt.toLowerCase());
    expect(snapshot.pointY).not.toBeCloseTo(flowY, 0);
  });

  it('skips work when the metric does not change', () => {
    const { scene, callbacks, runUntilIdle } = createHarness();
    runUntilIdle();

    scene.setMetric('flow');

    expect(callbacks.size).toBe(0);
  });

  it('morphs without replaying the entrance when the same month changes', () => {
    const { scene, runUntilIdle } = createHarness();
    runUntilIdle();
    const before = scene.getSnapshot().pointY;

    const series = buildTestCurve().series;
    scene.setCurve({
      ...CURVE,
      series: { ...series, flow: { ...series.flow, values: series.flow.values.map(() => 500_000) } },
    });

    expect(scene.getSnapshot().revealProgress).toBe(1);
    expect(scene.getSnapshot().morphProgress).toBe(0);
    runUntilIdle();
    expect(scene.getSnapshot().pointY).toBeLessThan(before);
  });

  it('replays the entrance and hides the projection for a finished month', () => {
    const { scene, runUntilIdle } = createHarness();
    runUntilIdle();

    scene.setCurve(
      buildTestCurve({
        monthKey: '2026-09',
        daysInMonth: 30,
        cutoffDay: 30,
        hasProjection: false,
        isCurrentMonth: false,
      })
    );

    expect(scene.getSnapshot().revealProgress).toBe(0);
    expect(scene.getSnapshot().isDashVisible).toBe(false);
    runUntilIdle();
    expect(scene.getSnapshot().pointX).toBeCloseTo(curveXForDay(30, 30, WIDTH_PT), 1);
  });

  it('follows the finger, focuses that day and tilts, then returns to today', () => {
    const { scene, runUntilIdle } = createHarness();
    runUntilIdle();

    scene.setStop(5);
    runUntilIdle();
    let snapshot = scene.getSnapshot();
    expect(snapshot.pointX).toBeCloseTo(xForDay(5), 1);
    expect(snapshot.focus).toBeCloseTo(1, 2);
    expect(snapshot.tiltY).toBeLessThan(0);

    scene.setStop(null);
    expect(scene.getSnapshot().isPulsing).toBe(true);
    runUntilIdle();
    snapshot = scene.getSnapshot();
    expect(snapshot.pointX).toBeCloseTo(xForDay(27), 1);
    expect(snapshot.focus).toBeCloseTo(0, 2);
    expect(snapshot.tiltY).toBeCloseTo(0, 2);
  });

  it('moves the marker to the end of the projection on the close stop', () => {
    const { scene, runUntilIdle } = createHarness();
    runUntilIdle();

    scene.setStop('close');
    runUntilIdle();

    expect(scene.getSnapshot().pointX).toBeCloseTo(xForDay(31), 1);
  });

  it('skips work when the stop does not change', () => {
    const { scene, callbacks, runUntilIdle } = createHarness();
    runUntilIdle();

    scene.setStop(null);

    expect(callbacks.size).toBe(0);
  });

  it('jumps straight to the final state under reduced motion', () => {
    const { scene, runUntilIdle } = createHarness({ reducedMotion: true });

    expect(scene.getSnapshot().revealProgress).toBe(1);
    expect(runUntilIdle()).toBeLessThanOrEqual(3);

    scene.setMetric('expenses');
    expect(scene.getSnapshot().morphProgress).toBe(1);
    expect(scene.getSnapshot().colorHex).toBe(palettes.dark.semantic.expense.toLowerCase());
    expect(runUntilIdle()).toBeLessThanOrEqual(3);

    scene.setStop(4);
    expect(runUntilIdle()).toBeLessThanOrEqual(3);
    expect(scene.getSnapshot().pointX).toBeCloseTo(xForDay(4), 5);
    expect(scene.getSnapshot().focus).toBe(1);
    expect(scene.getSnapshot().tiltY).toBe(0);
    expect(scene.getSnapshot().isPulsing).toBe(false);
  });

  it('settles a running animation when reduced motion turns on', () => {
    const { scene, flushFrame, runUntilIdle } = createHarness();
    flushFrame();

    scene.setReducedMotion(true);

    expect(scene.getSnapshot().revealProgress).toBe(1);
    expect(runUntilIdle()).toBeLessThanOrEqual(3);
  });

  it('never draws while inactive and redraws when it comes back', () => {
    const { scene, renderer, callbacks, runUntilIdle } = createHarness();
    runUntilIdle();
    const renders = renderer.render.mock.calls.length;

    scene.setActive(false);
    scene.setMetric('income');

    expect(callbacks.size).toBe(0);
    expect(renderer.render.mock.calls.length).toBe(renders);

    scene.setActive(true);
    runUntilIdle();

    expect(renderer.render.mock.calls.length).toBeGreaterThan(renders);
    expect(scene.getSnapshot().morphProgress).toBe(1);
  });

  it('cancels the pending frame when it goes inactive', () => {
    const { scene, callbacks } = createHarness();
    expect(callbacks.size).toBe(1);

    scene.setActive(false);

    expect(callbacks.size).toBe(0);
    expect(scene.isIdle()).toBe(true);
  });

  it('resizes only for a real and different buffer size', () => {
    const { scene, renderer, runUntilIdle } = createHarness();
    runUntilIdle();
    renderer.setSize.mockClear();

    scene.resize(0, 400);
    scene.resize(600, 400);
    expect(renderer.setSize).not.toHaveBeenCalled();

    scene.resize(900, 600);
    expect(renderer.setSize).toHaveBeenCalledWith(900, 600, false);
    runUntilIdle();
    expect(scene.getSnapshot().pointX).toBeCloseTo(curveXForDay(27, 31, 450), 1);
  });

  it('applies the theme to the clear color, the metric color and the blending', () => {
    const { scene, renderer, callbacks, runUntilIdle } = createHarness();
    runUntilIdle();
    expect(scene.getSnapshot().blendEquation).toBe(MaxEquation);

    scene.setPalette(toScenePalette(palettes.light, 'light'));

    expect(renderer.setClearColor).toHaveBeenLastCalledWith(palettes.light.background.primary, 1);
    expect(scene.getSnapshot().colorHex).toBe(palettes.light.semantic.income.toLowerCase());
    expect(scene.getSnapshot().blendEquation).toBe(MinEquation);
    expect(callbacks.size).toBe(1);
  });

  it('releases GPU resources once and stops the loop on dispose', () => {
    const geometryDispose = jest.spyOn(BufferGeometry.prototype, 'dispose');
    const materialDispose = jest.spyOn(Material.prototype, 'dispose');
    const { scene, renderer, callbacks } = createHarness();

    scene.dispose();
    scene.dispose();
    scene.setMetric('debt');

    expect(callbacks.size).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose.mock.calls.length).toBe(6);
    expect(materialDispose.mock.calls.length).toBe(6);

    geometryDispose.mockRestore();
    materialDispose.mockRestore();
  });

  it('stops and reports when a frame fails to render', () => {
    const onRenderError = jest.fn();
    const { renderer, callbacks, flushFrame } = createHarness({ onRenderError });
    renderer.render.mockImplementation(() => {
      throw new Error('context lost');
    });

    flushFrame();

    expect(onRenderError).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  });
});
