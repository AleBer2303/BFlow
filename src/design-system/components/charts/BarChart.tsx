/**
 * src/design-system/components/charts/BarChart.tsx
 *
 * Animated bar chart, grouped or stacked, drawn with react-native-svg so it is the same
 * vector drawing on iOS, Android and Web (no WebGL, no three.js: ADR 0011, 0014 and 0020).
 * - Bars grow from the zero line on entrance and move to new values when the data changes.
 * - Negative values (a month with negative net flow, an overdrawn savings bucket) hang below
 *   the zero line; in a stack they pile downwards, so the stack still adds up to its total.
 * - Optional reference line (the ideal monthly provision).
 * - Touching, hovering or focusing a category shows its figures in the readout; with
 *   nothing chosen the readout shows the last category (the active month).
 * - Only the most recent categories that fit a full touch target each are shown.
 * Only the drawing (`BarPlot`) repaints on each animation frame; the readout, labels and
 * touch columns render again only when the data or the choice changes.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useBFlowTheme } from '../../theme/ThemeContext';
import {
  CHART_AXIS_GUTTER_PT,
  ChartCategoryLabels,
  ChartLegend,
  ChartReadout,
  ChartTouchColumns,
  ChartValueLabels,
  describeChartPoint,
  useChartSelection,
  useChartWindow,
  type ChartLegendItem,
  type ChartReadoutVariant,
  type ChartSeries,
} from './ChartParts';
import { bandCenter, buildValueScale, valueToY, type PlotBox, type ValueScale } from './chartScale';
import { useChartTransition } from './useChartTransition';

export interface BarChartReferenceLine {
  value: number;
  label: string;
  color: string;
}

export interface BarChartProps {
  /** Short labels under the axis ("Oct"). */
  categories: readonly string[];
  /** Full labels for the readout and screen readers ("Octubre 2026"). */
  categoryTitles: readonly string[];
  series: readonly ChartSeries[];
  layout?: 'grouped' | 'stacked';
  referenceLine?: BarChartReferenceLine;
  /** Extra line of the readout for a category (a gap, a delta). */
  describeNote?: (index: number) => string | undefined;
  /** False hides the legend, for charts whose readout already names every color. */
  showLegend?: boolean;
  /** 'value' shows only the amount, for a chart with a single series. */
  readout?: ChartReadoutVariant;
  plotHeight?: number;
  testID: string;
}

const DEFAULT_PLOT_HEIGHT_PT = 168;
const PLOT_PADDING_TOP_PT = 10;
const MAX_GROUP_SHARE = 0.68;
const MAX_GROUP_WIDTH_PT = 64;
const BAR_GAP_PT = 2;
const DIMMED_OPACITY = 0.38;

/** Highest and lowest point a stack reaches (positives pile up, negatives pile down). */
export function stackExtents(series: readonly ChartSeries[], count: number): number[] {
  const extents: number[] = [];
  for (let index = 0; index < count; index += 1) {
    let up = 0;
    let down = 0;
    for (const item of series) {
      const value = item.values[index] ?? 0;
      if (value >= 0) up += value;
      else down += value;
    }
    extents.push(up, down);
  }
  return extents;
}

interface BarPlotProps {
  width: number;
  plotHeight: number;
  count: number;
  series: readonly ChartSeries[];
  isStacked: boolean;
  scale: ValueScale;
  box: PlotBox;
  referenceLine?: BarChartReferenceLine;
  dimExcept: number | null;
  testID: string;
}

const BarPlot = React.memo(function BarPlot({
  width,
  plotHeight,
  count,
  series,
  isStacked,
  scale,
  box,
  referenceLine,
  dimExcept,
  testID,
}: BarPlotProps): React.JSX.Element | null {
  const { colors, radius } = useBFlowTheme();
  // Category-major order, so the entrance staggers month by month.
  const targets = useMemo(
    () => Array.from({ length: count }, (_, i) => series.map((item) => item.values[i] ?? 0)).flat(),
    [count, series]
  );
  const plotWidth = Math.max(0, width - CHART_AXIS_GUTTER_PT);
  const animated = useChartTransition(targets, { enabled: plotWidth > 0 });
  if (plotWidth <= 0) {
    return null;
  }

  const zeroY = valueToY(0, scale, box);
  const band = count > 0 ? plotWidth / count : 0;
  const groupWidth = Math.min(band * MAX_GROUP_SHARE, MAX_GROUP_WIDTH_PT);
  const barWidth = isStacked
    ? groupWidth * 0.6
    : Math.max(1, (groupWidth - BAR_GAP_PT * (series.length - 1)) / Math.max(1, series.length));
  const corner = Math.min(radius.xs, barWidth / 3);

  const bars: React.ReactNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const center = bandCenter(index, count, plotWidth);
    const opacity = dimExcept === null || dimExcept === index ? 1 : DIMMED_OPACITY;
    let stackUp = 0;
    let stackDown = 0;
    series.forEach((item, seriesIndex) => {
      const value = animated[index * series.length + seriesIndex] ?? 0;
      let x = center - groupWidth / 2 + seriesIndex * (barWidth + BAR_GAP_PT);
      let from = 0;
      let to = value;
      if (isStacked) {
        x = center - barWidth / 2;
        from = value >= 0 ? stackUp : stackDown;
        to = from + value;
        if (value >= 0) stackUp = to;
        else stackDown = to;
      }
      const y1 = valueToY(from, scale, box);
      const y2 = valueToY(to, scale, box);
      const height = Math.abs(y1 - y2);
      if (height < 0.5) {
        return;
      }
      bars.push(
        <Rect
          key={`${item.id}-${index}`}
          testID={`${testID}-bar-${item.id}-${index}`}
          x={x}
          y={Math.min(y1, y2)}
          width={barWidth}
          height={height}
          rx={isStacked ? 0 : corner}
          fill={item.color}
          opacity={opacity}
        />
      );
    });
  }

  return (
    <Svg width={width} height={plotHeight} testID={`${testID}-svg`}>
      {scale.ticks.map((tick) => (
        <Line
          key={`grid-${tick}`}
          x1={0}
          x2={plotWidth}
          y1={valueToY(tick, scale, box)}
          y2={valueToY(tick, scale, box)}
          stroke={colors.glass.subtleBorder}
          strokeWidth={1}
        />
      ))}
      {bars}
      {referenceLine ? (
        <Line
          testID={`${testID}-reference`}
          x1={0}
          x2={plotWidth}
          y1={valueToY(referenceLine.value, scale, box)}
          y2={valueToY(referenceLine.value, scale, box)}
          stroke={referenceLine.color}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      ) : null}
      <Line x1={0} x2={plotWidth} y1={zeroY} y2={zeroY} stroke={colors.text.muted} strokeWidth={1} />
    </Svg>
  );
});

export function BarChart({
  categories: allCategories,
  categoryTitles: allTitles,
  series: allSeries,
  layout = 'grouped',
  referenceLine,
  describeNote: allNotes,
  showLegend = true,
  readout = 'rows',
  plotHeight = DEFAULT_PLOT_HEIGHT_PT,
  testID,
}: BarChartProps): React.JSX.Element {
  const { spacing } = useBFlowTheme();
  const [width, setWidth] = useState(0);
  const isStacked = layout === 'stacked';
  const { categories, categoryTitles, series, describeNote } = useChartWindow(
    allCategories,
    allTitles,
    allSeries,
    allNotes,
    Math.max(0, width - CHART_AXIS_GUTTER_PT)
  );
  const count = categories.length;
  const selection = useChartSelection<number>((index) => index < count);

  const scale = useMemo(() => {
    const extents = isStacked
      ? stackExtents(series, count)
      : series.flatMap((item) => Array.from({ length: count }, (_, i) => item.values[i] ?? 0));
    return buildValueScale(referenceLine ? [...extents, referenceLine.value] : extents);
  }, [count, isStacked, series, referenceLine]);
  const box = useMemo<PlotBox>(
    () => ({ top: PLOT_PADDING_TOP_PT, height: plotHeight - PLOT_PADDING_TOP_PT }),
    [plotHeight]
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const activeIndex = selection.active ?? Math.max(0, count - 1);
  const legend: ChartLegendItem[] = [
    ...series.map((item) => ({ id: item.id, label: item.label, color: item.color })),
    ...(referenceLine
      ? [{ id: 'reference', label: referenceLine.label, color: referenceLine.color, dashed: true }]
      : []),
  ];

  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <ChartReadout
        testID={`${testID}-readout`}
        title={categoryTitles[activeIndex] ?? ''}
        rows={series.map((item) => ({
          id: item.id,
          label: item.label,
          color: item.color,
          value: item.values[activeIndex] ?? 0,
        }))}
        note={describeNote?.(activeIndex)}
        variant={readout}
      />

      <View style={{ height: plotHeight }} onLayout={handleLayout} testID={`${testID}-plot`}>
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <BarPlot
            width={width}
            plotHeight={plotHeight}
            count={count}
            series={series}
            isStacked={isStacked}
            scale={scale}
            box={box}
            referenceLine={referenceLine}
            dimExcept={selection.active}
            testID={testID}
          />
          {width > CHART_AXIS_GUTTER_PT ? (
            <ChartValueLabels ticks={scale.ticks} yFor={(tick) => valueToY(tick, scale, box)} />
          ) : null}
        </View>

        <ChartTouchColumns
          count={count}
          activeIndex={selection.active}
          selection={selection}
          testIDPrefix={`${testID}-point`}
          style={{ right: CHART_AXIS_GUTTER_PT }}
          describe={(index) =>
            describeChartPoint(
              categoryTitles[index] ?? '',
              series.map((item) => ({ label: item.label, value: item.values[index] ?? 0 })),
              describeNote?.(index)
            )
          }
        />
      </View>

      <ChartCategoryLabels labels={categories} activeIndex={activeIndex} />

      {showLegend ? <ChartLegend items={legend} testID={`${testID}-legend`} /> : null}
    </View>
  );
}
