/**
 * The animated chart components on the three skins: entrance, readout ("tooltip"),
 * selection by touch, hover and focus, accessibility and Reduce Motion.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { BarChart } from '../components/charts/BarChart';
import { CHART_AXIS_GUTTER_PT, ChartCard, describeChartPoint } from '../components/charts/ChartParts';
import { DonutChart, formatShare } from '../components/charts/DonutChart';
import { LineChart } from '../components/charts/LineChart';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../tokens';

const WIDTH = 360;
const SETTLE_MS = 5_000;
const HIDDEN = { includeHiddenElements: true } as const;

const MONTHS = ['Sep', 'Oct'];
const MONTH_TITLES = ['Septiembre 2026', 'Octubre 2026'];
const FLOW_SERIES = [
  { id: 'received', label: 'Recibido', color: '#2EBD85', values: [3_000_000, 4_000_000] },
  { id: 'paid', label: 'Pagado', color: '#E06A6A', values: [2_500_000, 2_920_000] },
];

function wrap(node: React.ReactElement, skin: PlatformSkinId = 'ios') {
  return <BFlowThemeProvider skin={skin}>{node}</BFlowThemeProvider>;
}

function elapse(milliseconds: number) {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
}

/** Lays out the plot (the parent of the SVG / touch columns). */
function layoutPlot(testID: string, width = WIDTH) {
  const plot = screen.getByTestId(`${testID}-plot`, HIDDEN);
  act(() => {
    plot.props.onLayout({ nativeEvent: { layout: { width, height: 168, x: 0, y: 0 } } });
  });
}

/** Drawings are hidden from screen readers; their touch columns state the figures. */
function hidden(testID: string) {
  return screen.getByTestId(testID, HIDDEN);
}
function queryHidden(testID: string) {
  return screen.queryByTestId(testID, HIDDEN);
}

function barHeight(testID: string): number {
  return Number(hidden(testID).props.height);
}

describe('BarChart', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(PLATFORM_SKIN_IDS)('grows the bars from zero and settles on the data (%s)', (skin) => {
    render(
      wrap(
        <BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />,
        skin
      )
    );
    expect(queryHidden('flow-svg')).toBeNull();

    layoutPlot('flow');
    expect(hidden('flow-svg')).toBeTruthy();
    // Nothing has grown on the first frame.
    expect(queryHidden('flow-bar-received-1')).toBeNull();

    elapse(120);
    const early = barHeight('flow-bar-received-1');
    elapse(SETTLE_MS);
    const settled = barHeight('flow-bar-received-1');
    expect(settled).toBeGreaterThan(early);
    // 4M of a 0..4M scale fills the plot below its top padding.
    expect(settled).toBeCloseTo(168 - 10, 0);
    expect(barHeight('flow-bar-paid-1') / settled).toBeCloseTo(2_920_000 / 4_000_000, 2);
  });

  it('shows the last month in the readout until another one is chosen', () => {
    render(
      wrap(<BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />)
    );
    const readout = screen.getByTestId('flow-readout');
    expect(readout).toHaveTextContent(/Octubre 2026/);
    expect(readout).toHaveTextContent(/\$ 4\.000\.000/);

    fireEvent.press(screen.getByTestId('flow-point-0'));
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Septiembre 2026/);
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/\$ 2\.500\.000/);
    expect(screen.getByTestId('flow-point-0').props.accessibilityState).toEqual({ selected: true });

    // Tapping the chosen month again lets go.
    fireEvent.press(screen.getByTestId('flow-point-0'));
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Octubre 2026/);
  });

  it('follows the pointer and the keyboard focus on the web skin', () => {
    render(
      wrap(
        <BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />,
        'web'
      )
    );
    fireEvent(screen.getByTestId('flow-point-0'), 'hoverIn', {});
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Septiembre 2026/);
    fireEvent(screen.getByTestId('flow-point-0'), 'hoverOut', {});
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Octubre 2026/);
    fireEvent(screen.getByTestId('flow-point-0'), 'focus', {});
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Septiembre 2026/);
  });

  it('states every figure of a month to screen readers and hides the drawing', () => {
    render(
      wrap(
        <BarChart
          testID="flow"
          categories={MONTHS}
          categoryTitles={MONTH_TITLES}
          series={FLOW_SERIES}
          describeNote={(index) => (index === 1 ? 'Mes en curso' : undefined)}
        />
      )
    );
    expect(screen.getByTestId('flow-point-1').props.accessibilityLabel).toBe(
      'Octubre 2026: Recibido $ 4.000.000, Pagado $ 2.920.000. Mes en curso'
    );
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Mes en curso/);
    expect(screen.getByTestId('flow-point-0').props.accessibilityLabel).toBe(
      'Septiembre 2026: Recibido $ 3.000.000, Pagado $ 2.500.000'
    );
  });

  it('stacks series, hangs negative bars below zero and draws the reference line', () => {
    render(
      wrap(
        <>
          <BarChart
            testID="stack"
            layout="stacked"
            categories={MONTHS}
            categoryTitles={MONTH_TITLES}
            series={[
              { id: 'a', label: 'A', color: '#4F8FEA', values: [1_000, 3_000] },
              { id: 'b', label: 'B', color: '#9D7FE6', values: [1_000, -50] },
            ]}
            referenceLine={{ value: 2_000, label: 'Ideal', color: '#E5A84B' }}
          />
          <BarChart
            testID="net"
            categories={MONTHS}
            categoryTitles={MONTH_TITLES}
            series={[{ id: 'net', label: 'Neto', color: '#2EBD85', values: [-1_000, 1_000] }]}
          />
        </>
      )
    );
    layoutPlot('stack');
    layoutPlot('net');
    elapse(SETTLE_MS);

    const lower = hidden('stack-bar-a-0');
    const upper = hidden('stack-bar-b-0');
    expect(Number(upper.props.y) + Number(upper.props.height)).toBeCloseTo(Number(lower.props.y), 3);
    // A negative share of a stack piles down from the zero line, where the positive one starts.
    const stackUp = hidden('stack-bar-a-1');
    const negativeShare = hidden('stack-bar-b-1');
    expect(Number(negativeShare.props.y)).toBeCloseTo(
      Number(stackUp.props.y) + Number(stackUp.props.height),
      3
    );
    expect(hidden('stack-reference')).toBeTruthy();
    expect(screen.getByTestId('stack-legend')).toHaveTextContent(/Ideal/);

    const negative = hidden('net-bar-net-0');
    const positive = hidden('net-bar-net-1');
    expect(Number(negative.props.y)).toBeGreaterThanOrEqual(
      Number(positive.props.y) + Number(positive.props.height) - 0.01
    );
  });

  it('leaves room for the value labels and stops the frame loop at rest', () => {
    render(
      wrap(<BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />)
    );
    layoutPlot('flow');
    elapse(SETTLE_MS);
    const bar = hidden('flow-bar-received-1');
    expect(Number(bar.props.x) + Number(bar.props.width)).toBeLessThanOrEqual(WIDTH - CHART_AXIS_GUTTER_PT);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('LineChart', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const DEBT = [{ id: 'debt', label: 'Deuda', color: '#D9824C', values: [8_000_000, 6_200_000, 0] }];

  it.each(PLATFORM_SKIN_IDS)('draws the measured line solid and the projection dashed (%s)', (skin) => {
    render(
      wrap(
        <LineChart
          testID="debt"
          categories={['Sep', 'Oct', 'Feb']}
          categoryTitles={['Septiembre 2026', 'Octubre 2026', 'Febrero 2027 (estimado)']}
          series={DEBT}
          area
          projectedFromIndex={1}
          projectionLabel="Proyección"
        />,
        skin
      )
    );
    layoutPlot('debt');
    elapse(SETTLE_MS);

    expect(hidden('debt-line-debt').props.d).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/);
    expect(hidden('debt-projection-debt').props.strokeDasharray).toBeTruthy();
    expect(hidden('debt-area')).toBeTruthy();
    expect(screen.getByTestId('debt-legend')).toHaveTextContent(/Proyección/);
    // The readout rests on the last measured month, not on the estimate.
    expect(screen.getByTestId('debt-readout')).toHaveTextContent(/Octubre 2026/);
    expect(screen.getByTestId('debt-readout')).toHaveTextContent(/\$ 6\.200\.000/);
    // The projected point is hollow.
    expect(hidden('debt-dot-debt-2').props.strokeWidth).toBe(2);
  });

  it('animates the points from the zero line and selects a point with a guide', () => {
    render(
      wrap(<LineChart testID="debt" categories={['Sep', 'Oct', 'Feb']} categoryTitles={['S', 'O', 'F']} series={DEBT} />)
    );
    layoutPlot('debt');
    elapse(32);
    const early = Number(hidden('debt-dot-debt-0').props.cy);
    elapse(SETTLE_MS);
    const settled = Number(hidden('debt-dot-debt-0').props.cy);
    expect(settled).toBeLessThan(early);

    fireEvent.press(screen.getByTestId('debt-point-2'));
    expect(screen.getByTestId('debt-readout')).toHaveTextContent(/^F/);
    expect(hidden('debt-dot-debt-2').props.r).toBe(5);
    // Without a projection there is no dashed segment and no area.
    expect(queryHidden('debt-projection-debt')).toBeNull();
    expect(queryHidden('debt-area')).toBeNull();
  });

  it('draws a single month as a dot, with no line', () => {
    render(
      wrap(
        <LineChart
          testID="one"
          categories={['Oct']}
          categoryTitles={['Octubre 2026']}
          series={[{ id: 'net', label: 'Neto', color: '#2EBD85', values: [1_080_000] }]}
          area
        />
      )
    );
    layoutPlot('one');
    elapse(SETTLE_MS);
    expect(queryHidden('one-line-net')).toBeNull();
    // The point the readout describes is drawn larger even before any touch.
    expect(hidden('one-dot-net-0').props.r).toBe(5);
  });
});

describe('DonutChart', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const SLICES = [
    { id: 'paid', label: 'Pagado', amount: 2_920_000, color: '#2EBD85' },
    { id: 'pending', label: 'Pendiente', amount: 450_000, color: '#E5A84B' },
  ];

  function layoutDonut(testID: string) {
    const ring = hidden(`${testID}-ring`);
    act(() => {
      ring.props.onLayout({ nativeEvent: { layout: { width: 168, height: 168, x: 0, y: 0 } } });
    });
  }

  it.each(PLATFORM_SKIN_IDS)('sweeps the ring in and states the total in the center (%s)', (skin) => {
    render(wrap(<DonutChart testID="split" slices={SLICES} totalLabel="Total" emptyLabel="Nada" />, skin));
    expect(queryHidden('split-arc-paid')).toBeNull();

    layoutDonut('split');
    elapse(100);
    const early = String(hidden('split-arc-paid').props.d);
    elapse(SETTLE_MS);
    const settled = String(hidden('split-arc-paid').props.d);
    expect(settled).not.toBe(early);
    expect(hidden('split-arc-pending')).toBeTruthy();
    expect(hidden('split-center-value')).toHaveTextContent('$ 3.370.000');
    expect(screen.getByTestId('split-legend')).toHaveTextContent(/87 %/);
  });

  it('highlights a slice from its legend row and lets go on a second tap', () => {
    render(wrap(<DonutChart testID="split" slices={SLICES} totalLabel="Total" emptyLabel="Nada" />));
    layoutDonut('split');
    elapse(SETTLE_MS);

    const row = screen.getByTestId('split-slice-pending');
    expect(row.props.accessibilityLabel).toBe('Pendiente: $ 450.000, 13 % del total');
    fireEvent.press(row);
    expect(hidden('split-center-value')).toHaveTextContent('$ 450.000');
    expect(hidden('split-arc-pending').props.strokeWidth).toBe(24);
    expect(hidden('split-arc-paid').props.opacity).toBeLessThan(1);

    fireEvent.press(row);
    expect(hidden('split-center-value')).toHaveTextContent('$ 3.370.000');

    fireEvent(row, 'hoverIn', {});
    expect(hidden('split-center-value')).toHaveTextContent('$ 450.000');
    fireEvent(row, 'hoverOut', {});
    fireEvent(screen.getByTestId('split-slice-paid'), 'focus', {});
    expect(hidden('split-center-value')).toHaveTextContent('$ 2.920.000');
  });

  it('closes the ring with no gap when a single slice holds the whole amount', () => {
    render(
      wrap(
        <DonutChart
          testID="lone"
          slices={[
            { id: 'paid', label: 'Pagado', amount: 0, color: '#2EBD85' },
            { id: 'pending', label: 'Pendiente', amount: 3_370_000, color: '#E5A84B' },
          ]}
          totalLabel="Total"
          emptyLabel="Nada"
        />
      )
    );
    layoutDonut('lone');
    elapse(SETTLE_MS);
    expect(queryHidden('lone-arc-paid')).toBeNull();
    // A full turn is drawn as two half arcs.
    expect(String(hidden('lone-arc-pending').props.d).match(/A/g)).toHaveLength(2);
  });

  it('shows the empty message and an empty ring when there is nothing to split', () => {
    render(
      wrap(
        <DonutChart
          testID="empty"
          slices={[{ id: 'a', label: 'A', amount: 0, color: '#2EBD85' }]}
          totalLabel="Total"
          emptyLabel="Sin gastos este mes"
        />
      )
    );
    expect(screen.getByTestId('empty-legend')).toHaveTextContent('Sin gastos este mes');
    expect(queryHidden('empty-arc-a')).toBeNull();
    expect(hidden('empty-center-value')).toHaveTextContent('$ 0');
  });

  it('formats shares as whole percentages', () => {
    expect(formatShare(0.8665)).toBe('87 %');
    expect(formatShare(0)).toBe('0 %');
    expect(formatShare(1.4)).toBe('100 %');
  });
});

describe('Reduce Motion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('draws the final bars without an entrance', async () => {
    // Once: React Native's own mock answers the following calls, so nothing needs restoring.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true);
    render(
      wrap(<BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />)
    );
    await act(async () => {
      await Promise.resolve();
    });
    const frameRequests = jest.spyOn(globalThis, 'requestAnimationFrame');
    layoutPlot('flow');
    expect(barHeight('flow-bar-received-1')).toBeCloseTo(168 - 10, 0);
    expect(frameRequests).not.toHaveBeenCalled();
    // Restored here, while this test's fake clock is active: restoring it after the switch
    // back to real timers would leave a stale fake requestAnimationFrame for later tests.
    frameRequests.mockRestore();
  });
});

describe('chart parts', () => {
  it('frames a chart with its title as a header', () => {
    render(
      wrap(
        <ChartCard title="Flujo de efectivo" subtitle="Últimos meses" testID="card">
          <></>
        </ChartCard>
      )
    );
    expect(screen.getByRole('header')).toHaveTextContent('Flujo de efectivo');
    expect(screen.getByTestId('card')).toHaveTextContent(/Últimos meses/);
  });

  it('describes a point with its figures and an optional note', () => {
    expect(describeChartPoint('Oct', [{ label: 'Neto', value: -5_000 }])).toBe('Oct: Neto -$ 5.000');
    expect(describeChartPoint('Oct', [], 'Sin datos')).toBe('Oct: . Sin datos');
  });
});

describe('selection and visible window (review fixes)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const SIX = ['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov'];
  const SIX_TITLES = ['Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre'];
  const SIX_SERIES = [{ id: 'net', label: 'Neto', color: '#2EBD85', values: [1, 2, 3, 4, 5, 6] }];

  it('pins the hovered month on click instead of letting it go (web)', () => {
    render(
      wrap(
        <BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />,
        'web'
      )
    );
    const september = screen.getByTestId('flow-point-0');
    fireEvent(september, 'hoverIn', {});
    fireEvent.press(september);
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Septiembre 2026/);
    // Leaving with the pointer keeps the pinned month.
    fireEvent(september, 'hoverOut', {});
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Septiembre 2026/);
    expect(screen.getByTestId('flow-point-0').props.accessibilityState).toEqual({ selected: true });
  });

  it('lets go of the keyboard focus on blur', () => {
    render(
      wrap(
        <BarChart testID="flow" categories={MONTHS} categoryTitles={MONTH_TITLES} series={FLOW_SERIES} />,
        'web'
      )
    );
    fireEvent(screen.getByTestId('flow-point-0'), 'focus', {});
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Septiembre 2026/);
    fireEvent(screen.getByTestId('flow-point-0'), 'blur', {});
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Octubre 2026/);
  });

  it('falls back to the last month when the pinned one no longer exists', () => {
    const view = render(
      wrap(<LineChart testID="net" categories={SIX} categoryTitles={SIX_TITLES} series={SIX_SERIES} />)
    );
    fireEvent.press(screen.getByTestId('net-point-5'));
    expect(screen.getByTestId('net-readout')).toHaveTextContent(/Noviembre/);

    view.rerender(
      wrap(
        <LineChart
          testID="net"
          categories={SIX.slice(0, 3)}
          categoryTitles={SIX_TITLES.slice(0, 3)}
          series={[{ ...SIX_SERIES[0]!, values: [1, 2, 3] }]}
        />
      )
    );
    expect(screen.getByTestId('net-readout')).toHaveTextContent(/Agosto/);
    expect(screen.getByTestId('net-readout')).toHaveTextContent(/\$ 3/);
  });

  it('shows only the recent months that fit a full touch target on a narrow phone', () => {
    render(
      wrap(
        <BarChart
          testID="narrow"
          categories={SIX}
          categoryTitles={SIX_TITLES}
          series={SIX_SERIES}
          describeNote={(index) => `Nota ${index}`}
        />,
        'android'
      )
    );
    expect(screen.getAllByTestId(/^narrow-point-\d$/)).toHaveLength(6);

    // 256pt of chart minus the 52pt value gutter fits four 48dp columns.
    layoutPlot('narrow', 256);
    expect(screen.getAllByTestId(/^narrow-point-\d$/)).toHaveLength(4);
    // The readout keeps the active month, with the note of its real index.
    expect(screen.getByTestId('narrow-readout')).toHaveTextContent(/Noviembre.*Nota 5/);
    fireEvent.press(screen.getByTestId('narrow-point-0'));
    expect(screen.getByTestId('narrow-readout')).toHaveTextContent(/Agosto.*Nota 2/);
  });

  it('keeps the estimate and the month it starts from in a narrow line chart', () => {
    render(
      wrap(
        <LineChart
          testID="debt"
          categories={SIX}
          categoryTitles={SIX_TITLES}
          series={SIX_SERIES}
          projectedFromIndex={4}
          projectionLabel="Proyección"
        />
      )
    );
    layoutPlot('debt', 52 + 60);
    expect(screen.getAllByTestId(/^debt-point-\d$/)).toHaveLength(2);
    expect(screen.getByTestId('debt-readout')).toHaveTextContent(/Octubre/);
    expect(screen.getByTestId('debt-legend')).toHaveTextContent(/Proyección/);
  });

  it('pins a donut slice on click after hovering it', () => {
    render(
      wrap(
        <DonutChart
          testID="split"
          slices={[
            { id: 'paid', label: 'Pagado', amount: 2_920_000, color: '#2EBD85' },
            { id: 'pending', label: 'Pendiente', amount: 450_000, color: '#E5A84B' },
          ]}
          totalLabel="Total"
          emptyLabel="Nada"
        />,
        'web'
      )
    );
    const row = screen.getByTestId('split-slice-pending');
    fireEvent(row, 'hoverIn', {});
    fireEvent.press(row);
    fireEvent(row, 'hoverOut', {});
    expect(hidden('split-center-value')).toHaveTextContent('$ 450.000');
    fireEvent(row, 'blur', {});
    expect(hidden('split-center-value')).toHaveTextContent('$ 450.000');
  });
});

describe('lighter charts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('can hide the legend when the readout already names every color', () => {
    render(
      wrap(
        <BarChart
          testID="flow"
          categories={MONTHS}
          categoryTitles={MONTH_TITLES}
          series={FLOW_SERIES}
          showLegend={false}
        />
      )
    );
    expect(screen.queryByTestId('flow-legend')).toBeNull();
    expect(screen.getByTestId('flow-readout')).toHaveTextContent(/Recibido/);
  });

  it.each(PLATFORM_SKIN_IDS)('shows a single series as the month and its amount only (%s)', (skin) => {
    render(
      wrap(
        <LineChart
          testID="net"
          categories={MONTHS}
          categoryTitles={MONTH_TITLES}
          series={[{ id: 'net', label: 'Flujo neto', color: '#2EBD85', values: [500_000, 1_080_000] }]}
          readout="value"
          showLegend={false}
        />,
        skin
      )
    );
    expect(screen.getByTestId('net-readout')).toHaveTextContent('Octubre 2026$ 1.080.000');
    expect(screen.queryByTestId('net-legend')).toBeNull();
    // Screen readers still hear which figure it is.
    expect(screen.getByTestId('net-point-0').props.accessibilityLabel).toBe(
      'Septiembre 2026: Flujo neto $ 500.000'
    );
  });
});
