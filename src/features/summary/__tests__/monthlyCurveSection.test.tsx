import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { palettes } from '../../../design-system/tokens';
import type { MonthlyCurve } from '../../../domain/overview/monthlyCurve';
import { hapticService } from '../../../platform/haptics/hapticService';
import { MonthlyCurveSection } from '../components/MonthlyCurveSection';
import MonthlyCurveStage, { GL_CONTEXT_TIMEOUT_MS } from '../components/MonthlyCurveStage';
import MonthlyCurveVectorStage from '../components/MonthlyCurveVectorStage';
import {
  buildCurveTicks,
  describeCurveReadout,
  describeMetricAccessibility,
} from '../components/monthlyCurveCopy';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';
import { getMetricColor, toScenePalette } from '../scene/scenePalette';
import { buildTestCurve } from './curveFixture';

const CURVE = buildTestCurve();
const CLOSED_CURVE = buildTestCurve({ cutoffDay: 31, hasProjection: false, isCurrentMonth: false });

function renderSection(curve: MonthlyCurve = CURVE) {
  return render(
    <BFlowThemeProvider initialMode="dark">
      <MonthlyCurveSection curve={curve} />
    </BFlowThemeProvider>
  );
}

function getGlView() {
  return screen.UNSAFE_getByType(GLView);
}

function scrub(stop: Parameters<React.ComponentProps<typeof MonthlyCurveStage>['onScrub']>[0]) {
  act(() => {
    screen.UNSAFE_getByType(MonthlyCurveStage).props.onScrub(stop);
  });
}

describe('MonthlyCurveSection', () => {
  it('opens on the net flow of today with the projected close', () => {
    renderSection();

    expect(screen.getByText('Flujo neto · Hoy, 27 oct')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 1.080.000');
    expect(screen.getByText('Cierre previsto $ 2.630.000')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-flow').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it('switches metric, animates the figure and lands on the exact amount', async () => {
    renderSection();

    fireEvent.press(screen.getByTestId('monthly-curve-metric-debt'));

    expect(screen.getByText('Deudas · Hoy, 27 oct')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-debt').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    await waitFor(() =>
      expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 6.200.000')
    );
  });

  it('shows the scrubbed day instantly and returns to today on release', () => {
    renderSection();

    scrub(21);
    expect(screen.getByText('Flujo neto · 21 oct')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 2.880.000');
    expect(screen.getByText('+$ 2.880.000 ese día')).toBeTruthy();

    scrub('close');
    expect(screen.getByText('Flujo neto · Cierre previsto')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-amount')).toHaveTextContent('$ 2.630.000');

    scrub(null);
    expect(screen.getByText('Flujo neto · Hoy, 27 oct')).toBeTruthy();
  });

  it('vibrates for each new day and metric, but not when the finger lifts', () => {
    const trigger = jest.spyOn(hapticService, 'trigger');
    renderSection();

    scrub(5);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenLastCalledWith('selection');

    scrub(null);
    expect(trigger).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('monthly-curve-metric-income'));
    expect(trigger).toHaveBeenCalledTimes(2);
    trigger.mockRestore();
  });

  it('exposes every figure to VoiceOver with touch targets of at least 44 pt', () => {
    renderSection();

    expect(screen.getByTestId('monthly-curve-metric-debt').props.accessibilityLabel).toBe(
      'Deudas: $ 6.200.000. Cierre previsto $ 6.200.000'
    );
    for (const id of ['flow', 'income', 'expenses', 'savings', 'debt']) {
      expect(screen.getByTestId(`monthly-curve-metric-${id}`)).toHaveStyle({ minHeight: 52 });
    }
  });

  it('hides the canvas from VoiceOver, which uses the native buttons instead', () => {
    renderSection();

    expect(screen.queryByTestId('monthly-curve-stage')).toBeNull();
    expect(screen.getByTestId('monthly-curve-stage', { includeHiddenElements: true })).toBeTruthy();
  });

  it('aligns each day label with its position in the month', () => {
    renderSection();

    expect(screen.getByTestId('monthly-curve-tick-20', { includeHiddenElements: true })).toHaveStyle({
      left: `${(20 / 31) * 100}%`,
    });
    expect(
      screen.getByTestId('monthly-curve-tick-27', { includeHiddenElements: true })
    ).toHaveTextContent('Hoy', { exact: true });
  });

  function expectTouchVectorFallback(): void {
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(0);
    expect(screen.UNSAFE_getByType(MonthlyCurveVectorStage).props.interaction).toBe('touch');
    // Like the canvas it replaces, it stays hidden from VoiceOver and TalkBack.
    expect(screen.queryByTestId('monthly-curve-vector-stage')).toBeNull();
    expect(
      screen.getByTestId('monthly-curve-vector-stage', { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-income')).toBeTruthy();
  }

  it('swaps in the animated vector curve when the GL context cannot start', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderSection();

    act(() => {
      getGlView().props.onContextCreate({} as ExpoWebGLRenderingContext);
    });

    expectTouchVectorFallback();
    warn.mockRestore();
  });

  it('swaps in the animated vector curve when GLView throws while mounting', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const glRender = jest.spyOn(GLView.prototype, 'render').mockImplementation(() => {
      throw new Error('Browser does not support WebGL');
    });

    renderSection();

    expectTouchVectorFallback();

    glRender.mockRestore();
    consoleError.mockRestore();
  });

  it('swaps in the animated vector curve when the GL surface never arrives', () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      renderSection();

      act(() => jest.advanceTimersByTime(GL_CONTEXT_TIMEOUT_MS - 1));
      expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(1);

      act(() => jest.advanceTimersByTime(1));
      expectTouchVectorFallback();
      expect(warn).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe('monthlyCurveCopy', () => {
  it('states the figures of today, a day and the projected close', () => {
    expect(describeCurveReadout(CURVE, 'income', null)).toEqual({
      label: 'Ingresos recibidos · Hoy, 27 oct',
      amount: 4_000_000,
      detail: 'Cierre previsto $ 6.000.000',
    });
    expect(describeCurveReadout(CURVE, 'flow', 27)).toEqual({
      label: 'Flujo neto · 27 oct',
      amount: 1_080_000,
      detail: '-$ 1.800.000 ese día',
    });
    expect(describeCurveReadout(CURVE, 'income', 4).detail).toBe('Sin cambios ese día');
    expect(describeCurveReadout(CURVE, 'debt', 'close')).toEqual({
      label: 'Deudas · Cierre previsto',
      amount: 6_200_000,
      detail: 'Si se completa lo pendiente',
    });
  });

  it('describes a finished month by its last day, without a projection', () => {
    const readout = describeCurveReadout(CLOSED_CURVE, 'income', null);

    expect(readout.label).toBe('Ingresos recibidos · 31 oct');
    expect(readout.detail).toBe('Sin cambios ese día');
  });

  it('uses the same figures for VoiceOver', () => {
    expect(describeMetricAccessibility(CURVE, 'expenses')).toBe(
      'Gastos pagados: $ 2.920.000. Cierre previsto $ 3.370.000'
    );
  });

  it('labels today and the month limits', () => {
    expect(buildCurveTicks(CURVE).map((tick) => tick.label)).toEqual(['1', '10', '20', 'Hoy', '31']);
    expect(buildCurveTicks(CLOSED_CURVE).map((tick) => tick.label)).toEqual(['1', '10', '20', '31']);
  });

  it('drops the labels that would collide with today', () => {
    const labels = (cutoffDay: number) =>
      buildCurveTicks(buildTestCurve({ cutoffDay })).map((tick) => tick.label);

    expect(labels(2)).toEqual(['10', '20', 'Hoy', '31']);
    expect(labels(29)).toEqual(['1', '10', '20', 'Hoy']);
  });
});

describe('scenePalette', () => {
  it('takes every color from the design tokens and blends with the page', () => {
    const palette = toScenePalette(palettes.light, 'light');

    expect(palette.backdrop).toBe(palettes.light.background.primary);
    expect(palette.metrics.flow).toBe(palettes.light.semantic.income);
    expect(palette.metrics.income).toBe(palettes.light.semantic.income);
    expect(palette.metrics.expenses).toBe(palettes.light.semantic.expense);
    expect(palette.metrics.savings).toBe(palettes.light.semantic.reserve);
    expect(palette.metrics.debt).toBe(palettes.light.semantic.debt);
    expect(getMetricColor(palettes.dark, 'debt')).toBe(palettes.dark.semantic.debt);
  });

  it('only whitens the line on a dark background, where it reads as light', () => {
    expect(toScenePalette(palettes.dark, 'dark').lineHeat).toBe(1);
    expect(toScenePalette(palettes.light, 'light').lineHeat).toBe(0);
  });
});

describe('useReducedMotionPreference', () => {
  function Probe(): React.JSX.Element {
    const isReduced = useReducedMotionPreference();
    // A plain marker: the theme provider tracks the setting too and would add its own listener.
    return <>{isReduced ? <View testID="reduced-motion-marker" /> : null}</>;
  }

  it('reads the system setting and removes its listener on unmount', async () => {
    const remove = jest.fn();
    const isEnabled = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const addListener = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove } as never);

    const { unmount, queryByTestId } = render(<Probe />);

    await waitFor(() => expect(queryByTestId('reduced-motion-marker')).toBeTruthy());
    expect(addListener).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function));

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);

    isEnabled.mockRestore();
    addListener.mockRestore();
  });
});
