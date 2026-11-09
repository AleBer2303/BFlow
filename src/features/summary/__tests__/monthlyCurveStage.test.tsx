import { act, render, screen } from '@testing-library/react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import MonthlyCurveStage, { type MonthlyCurveStageProps } from '../components/MonthlyCurveStage';
import { curveXForDay } from '../scene/curveGeometry';
import { MonthlyCurveScene } from '../scene/monthlyCurveScene';
import { buildTestCurve } from './curveFixture';

const mockScene = {
  setCurve: jest.fn(),
  setMetric: jest.fn(),
  setPalette: jest.fn(),
  setReducedMotion: jest.fn(),
  setActive: jest.fn(),
  setStop: jest.fn(),
  resize: jest.fn(),
  dispose: jest.fn(),
};

jest.mock('../scene/monthlyCurveScene', () => ({
  MonthlyCurveScene: jest.fn(() => mockScene),
}));

const SceneMock = MonthlyCurveScene as unknown as jest.Mock;
const CURVE = buildTestCurve();
const WIDTH = 310;
const GL = {
  drawingBufferWidth: 900,
  drawingBufferHeight: 600,
} as unknown as ExpoWebGLRenderingContext;

function buildProps(overrides: Partial<MonthlyCurveStageProps> = {}): MonthlyCurveStageProps {
  return {
    curve: CURVE,
    metricId: 'flow',
    reducedMotion: false,
    onScrub: jest.fn(),
    onUnavailable: jest.fn(),
    ...overrides,
  };
}

function renderStage(props: MonthlyCurveStageProps) {
  return render(
    <BFlowThemeProvider initialMode="dark">
      <MonthlyCurveStage {...props} />
    </BFlowThemeProvider>
  );
}

function hidden(testID: string) {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

function startScene(): void {
  act(() => {
    screen.UNSAFE_getByType(GLView).props.onContextCreate(GL);
  });
}

function layoutStage(width: number, height: number): void {
  act(() => {
    hidden('monthly-curve-stage').props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });
}

function touch(pageX: number, pageY: number, timestamp: number, previousX = 0, previousY = 0) {
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
          previousPageX: previousX,
          previousPageY: previousY,
          previousTimeStamp: timestamp,
        },
      ],
    },
  };
}

function xForDay(day: number): number {
  return curveXForDay(day, 31, WIDTH);
}

describe('MonthlyCurveStage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the scene from the current props when the GL context appears', () => {
    renderStage(buildProps({ metricId: 'debt', reducedMotion: true }));

    expect(SceneMock).not.toHaveBeenCalled();
    startScene();

    expect(SceneMock).toHaveBeenCalledTimes(1);
    expect(SceneMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        gl: GL,
        bufferWidth: 900,
        bufferHeight: 600,
        pixelRatio: expect.any(Number),
        curve: CURVE,
        metricId: 'debt',
        reducedMotion: true,
      })
    );
  });

  it('reports the stage as unavailable, and logs why, when the scene cannot be created', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new Error('WebGL 1 is not supported');
    SceneMock.mockImplementationOnce(() => {
      throw failure;
    });
    const onUnavailable = jest.fn();
    renderStage(buildProps({ onUnavailable }));

    startScene();

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
    warn.mockRestore();
  });

  it('reports the stage as unavailable, and logs why, when a frame fails later on', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new Error('context lost');
    const onUnavailable = jest.fn();
    renderStage(buildProps({ onUnavailable }));
    startScene();

    SceneMock.mock.calls[0][0].onRenderError(failure);

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
    warn.mockRestore();
  });

  it('forwards data, metric and motion changes to the running scene', () => {
    const props = buildProps();
    const view = renderStage(props);
    startScene();
    jest.clearAllMocks();

    const nextCurve = buildTestCurve({ cutoffDay: 28 });
    view.rerender(
      <BFlowThemeProvider initialMode="dark">
        <MonthlyCurveStage {...props} curve={nextCurve} metricId="income" reducedMotion />
      </BFlowThemeProvider>
    );

    expect(mockScene.setCurve).toHaveBeenLastCalledWith(nextCurve);
    expect(mockScene.setMetric).toHaveBeenLastCalledWith('income');
    expect(mockScene.setReducedMotion).toHaveBeenLastCalledWith(true);
  });

  it('resizes the scene in device pixels', () => {
    renderStage(buildProps());
    startScene();

    layoutStage(300, 200);

    expect(mockScene.resize).toHaveBeenCalledTimes(1);
    const [width, height] = mockScene.resize.mock.calls[0] as unknown as [number, number];
    expect(width / height).toBeCloseTo(1.5, 5);
    expect(width).toBeGreaterThanOrEqual(300);
  });

  it('claims horizontal drags only and leaves vertical ones to the scroll view', () => {
    renderStage(buildProps());
    const stage = hidden('monthly-curve-stage');

    stage.props.onStartShouldSetResponderCapture(touch(0, 0, 1));
    expect(stage.props.onMoveShouldSetResponderCapture(touch(2, 30, 2))).toBe(false);

    stage.props.onStartShouldSetResponderCapture(touch(0, 0, 3));
    expect(stage.props.onMoveShouldSetResponderCapture(touch(40, 2, 4))).toBe(true);
  });

  it('walks through the days under the finger and rests on release', () => {
    const onScrub = jest.fn();
    renderStage(buildProps({ onScrub }));
    startScene();
    layoutStage(WIDTH, 200);
    const stage = hidden('monthly-curve-stage');
    const start = xForDay(10);
    const end = xForDay(15);

    stage.props.onStartShouldSetResponderCapture(touch(start, 0, 1, start));
    stage.props.onResponderGrant(touch(start, 0, 2, start));
    expect(mockScene.setStop).toHaveBeenLastCalledWith(10);
    expect(onScrub).toHaveBeenLastCalledWith(10);

    stage.props.onResponderMove(touch(end, 0, 3, start));
    expect(mockScene.setStop).toHaveBeenLastCalledWith(15);
    expect(onScrub).toHaveBeenLastCalledWith(15);

    stage.props.onResponderRelease(touch(end, 0, 4, end));
    expect(mockScene.setStop).toHaveBeenLastCalledWith(null);
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('reports each day once, however many touch events land on it', () => {
    const onScrub = jest.fn();
    renderStage(buildProps({ onScrub }));
    startScene();
    layoutStage(WIDTH, 200);
    const stage = hidden('monthly-curve-stage');
    const start = xForDay(10);

    stage.props.onStartShouldSetResponderCapture(touch(start, 0, 1, start));
    stage.props.onResponderGrant(touch(start, 0, 2, start));
    stage.props.onResponderMove(touch(start + 1, 0, 3, start));
    stage.props.onResponderMove(touch(start + 2, 0, 4, start + 1));

    expect(onScrub).toHaveBeenCalledTimes(1);
  });

  it('reaches the projected close past today', () => {
    const onScrub = jest.fn();
    renderStage(buildProps({ onScrub }));
    startScene();
    layoutStage(WIDTH, 200);
    const stage = hidden('monthly-curve-stage');
    const start = xForDay(25);

    stage.props.onStartShouldSetResponderCapture(touch(start, 0, 1, start));
    stage.props.onResponderGrant(touch(start, 0, 2, start));
    stage.props.onResponderMove(touch(xForDay(30), 0, 3, start));

    expect(onScrub).toHaveBeenLastCalledWith('close');
  });

  it('rests when the system takes the gesture away', () => {
    const onScrub = jest.fn();
    renderStage(buildProps({ onScrub }));
    startScene();
    layoutStage(WIDTH, 200);
    const stage = hidden('monthly-curve-stage');
    const start = xForDay(10);

    stage.props.onStartShouldSetResponderCapture(touch(start, 0, 1, start));
    stage.props.onResponderGrant(touch(start, 0, 2, start));
    stage.props.onResponderTerminate(touch(start, 0, 3, start));

    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('ignores gestures until the stage has a size', () => {
    const onScrub = jest.fn();
    renderStage(buildProps({ onScrub }));
    startScene();
    const stage = hidden('monthly-curve-stage');

    stage.props.onStartShouldSetResponderCapture(touch(50, 0, 1, 50));
    stage.props.onResponderGrant(touch(50, 0, 2, 50));

    expect(onScrub).not.toHaveBeenCalled();
  });

  it('pauses when the app leaves the foreground and resumes on return', () => {
    let listener: (state: AppStateStatus) => void = () => undefined;
    const remove = jest.fn();
    (AppState.addEventListener as jest.Mock).mockImplementationOnce(
      (_type: string, handler: (state: AppStateStatus) => void) => {
        listener = handler;
        return { remove };
      }
    );

    const view = renderStage(buildProps());
    startScene();

    listener('background');
    expect(mockScene.setActive).toHaveBeenLastCalledWith(false);
    listener('active');
    expect(mockScene.setActive).toHaveBeenLastCalledWith(true);

    view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('disposes the scene on unmount', () => {
    const view = renderStage(buildProps());
    startScene();

    view.unmount();

    expect(mockScene.dispose).toHaveBeenCalledTimes(1);
  });
});
