/**
 * src/design-system/components/charts/BarChart.tsx
 *
 * Animated bar chart, grouped or stacked, drawn with react-native-svg so it is the same
 * vector drawing on iOS, Android and Web (no WebGL, no three.js: ADR 0011, 0014 and 0020).
 * - Bars grow from the zero line on entrance and move to new values when the data changes.
 * - Negative values (a month with negative net flow) hang below the zero line.
 * - Optional reference line (the ideal monthly provision).
 * - Touching, hovering or focusing a category shows its figures in the readout; with
 *   nothing chosen the readout shows the last category (the active month).
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
  type ChartLegendItem,
  type ChartSeries,
} from './ChartParts';
import { bandCenter, buildValueScale, valueToY, type PlotBox } from './chartScale';
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
  plotHeight?: number;
  testID: string;
}

const DEFAULT_PLOT_HEIGHT_PT = 168;
const PLOT_PADDING_TOP_PT = 10;
const MAX_GROUP_SHARE = 0.68;
const MAX_GROUP_WIDTH_PT = 64;
const BAR_GAP_PT = 2;
const DIMMED_OPACITY = 0.38;

export function BarChart({
  categories,
  categoryTitles,
  series,
  layout = 'grouped',
  referenceLine,
  describeNote,
  plotHeight = DEFAULT_PLOT_HEIGHT_PT,
  testID,
}: BarChartProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const count = categories.length;
  const isStacked = layout === 'stacked';

  // Category-major order, so the entrance staggers month by month.
  const targets = useMemo(
    () =>
      Array.from({ length: count }, (_, index) =>
        series.map((item) => {
          const value = item.values[index] ?? 0;
          return isStacked ? Math.max(0, value) : value;
        })
      ).flat(),
    [count, series, isStacked]
  );
  const animated = useChartTransition(targets, { enabled: width > 0 });

  const scale = useMemo(() => {
    const extents = isStacked
      ? Array.from({ length: count }, (_, index) =>
          series.reduce((sum, item) => sum + Math.max(0, item.values[index] ?? 0), 0)
        )
      : targets;
    return buildValueScale(referenceLine ? [...extents, referenceLine.value] : extents);
  }, [count, isStacked, series, targets, referenceLine]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const activeIndex = selectedIndex ?? Math.max(0, count - 1);
  const pointFigures = (index: number) =>
    series.map((item) => ({ label: item.label, value: item.values[index] ?? 0 }));
  const legend: ChartLegendItem[] = [
    ...series.map((item) => ({ id: item.id, label: item.label, color: item.color })),
    ...(referenceLine
      ? [{ id: 'reference', label: referenceLine.label, color: referenceLine.color, dashed: true }]
      : []),
  ];

  const plotWidth = Math.max(0, width - CHART_AXIS_GUTTER_PT);
  const box: PlotBox = { top: PLOT_PADDING_TOP_PT, height: plotHeight - PLOT_PADDING_TOP_PT };
  const zeroY = valueToY(0, scale, box);
  const band = count > 0 ? plotWidth / count : 0;
  const groupWidth = Math.min(band * MAX_GROUP_SHARE, MAX_GROUP_WIDTH_PT);
  const barWidth = isStacked
    ? groupWidth * 0.6
    : Math.max(1, (groupWidth - BAR_GAP_PT * (series.length - 1)) / Math.max(1, series.length));
  const corner = Math.min(radius.xs, barWidth / 3);

  const bars: React.ReactNode[] = [];
  if (plotWidth > 0) {
    for (let index = 0; index < count; index += 1) {
      const center = bandCenter(index, count, plotWidth);
      const opacity = selectedIndex === null || selectedIndex === index ? 1 : DIMMED_OPACITY;
      let stackTop = 0;
      series.forEach((item, seriesIndex) => {
        const value = animated[index * series.length + seriesIndex] ?? 0;
        let x: number;
        let from: number;
        let to: number;
        if (isStacked) {
          x = center - barWidth / 2;
          from = stackTop;
          to = stackTop + value;
          stackTop = to;
        } else {
          x = center - groupWidth / 2 + seriesIndex * (barWidth + BAR_GAP_PT);
          from = 0;
          to = value;
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
  }

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
      />

      <View style={{ height: plotHeight }} onLayout={handleLayout} testID={`${testID}-plot`}>
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {plotWidth > 0 ? (
            <Svg width={width} height={plotHeight} testID={`${testID}-svg`}>
              {scale.ticks.map((tick) => (
                <Line
                  key={`grid-${tick}`}
                  x1={0}
                  x2={plotWidth}
                  y1={valueToY(tick, scale, box)}
                  y2={valueToY(tick, scale, box)}
                  stroke={tick === 0 ? colors.glass.specularBorder : colors.glass.subtleBorder}
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
          ) : null}
          {plotWidth > 0 ? (
            <ChartValueLabels ticks={scale.ticks} yFor={(tick) => valueToY(tick, scale, box)} />
          ) : null}
        </View>

        <ChartTouchColumns
          count={count}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          testIDPrefix={`${testID}-point`}
          style={{ right: CHART_AXIS_GUTTER_PT }}
          describe={(index) =>
            describeChartPoint(categoryTitles[index] ?? '', pointFigures(index), describeNote?.(index))
          }
        />
      </View>

      <ChartCategoryLabels labels={categories} activeIndex={activeIndex} />

      <ChartLegend items={legend} testID={`${testID}-legend`} />
    </View>
  );
}
