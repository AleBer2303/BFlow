/**
 * src/design-system/components/charts/LineChart.tsx
 *
 * Animated line (and area) chart over categories, drawn with react-native-svg on the three
 * skins. Points rise from the zero line on entrance and glide to new values when the data
 * changes. The points after `projectedFromIndex` are an estimate (the debt payoff): the
 * line to them is dashed and they carry no area.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
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
import {
  bandCenter,
  buildAreaPath,
  buildLinePath,
  buildValueScale,
  valueToY,
  type ChartPoint,
  type PlotBox,
} from './chartScale';
import { useChartTransition } from './useChartTransition';

export interface LineChartProps {
  categories: readonly string[];
  categoryTitles: readonly string[];
  series: readonly ChartSeries[];
  /** Fills the area between the first series and zero. */
  area?: boolean;
  /** Index of the last measured point; later points are projected. */
  projectedFromIndex?: number;
  /** Label of the projection in the legend. */
  projectionLabel?: string;
  describeNote?: (index: number) => string | undefined;
  plotHeight?: number;
  testID: string;
}

const DEFAULT_PLOT_HEIGHT_PT = 168;
const PLOT_PADDING_TOP_PT = 12;
const LINE_WIDTH_PT = 2;
const DOT_RADIUS_PT = 3;
const SELECTED_DOT_RADIUS_PT = 5;
const AREA_OPACITY = 0.12;
const PROJECTION_DASH = '4 5';

export function LineChart({
  categories,
  categoryTitles,
  series,
  area = false,
  projectedFromIndex,
  projectionLabel,
  describeNote,
  plotHeight = DEFAULT_PLOT_HEIGHT_PT,
  testID,
}: LineChartProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const count = categories.length;
  const lastMeasured =
    projectedFromIndex === undefined ? count - 1 : Math.min(count - 1, projectedFromIndex);

  const targets = useMemo(
    () => series.flatMap((item) => Array.from({ length: count }, (_, i) => item.values[i] ?? 0)),
    [series, count]
  );
  const animated = useChartTransition(targets, { enabled: width > 0 });
  const scale = useMemo(() => buildValueScale(targets), [targets]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  // With nothing chosen the readout rests on the last measured point (the active month).
  const activeIndex = selectedIndex ?? Math.max(0, lastMeasured);
  const plotWidth = Math.max(0, width - CHART_AXIS_GUTTER_PT);
  const box: PlotBox = { top: PLOT_PADDING_TOP_PT, height: plotHeight - PLOT_PADDING_TOP_PT * 2 };
  const zeroY = valueToY(0, scale, box);

  const legend: ChartLegendItem[] = [
    ...series.map((item) => ({ id: item.id, label: item.label, color: item.color })),
    ...(projectionLabel && lastMeasured < count - 1
      ? [{ id: 'projection', label: projectionLabel, color: colors.text.muted, dashed: true }]
      : []),
  ];

  const lines = series.map((item, seriesIndex) => {
    const points: ChartPoint[] = Array.from({ length: count }, (_, index) => ({
      x: bandCenter(index, count, plotWidth),
      y: valueToY(animated[seriesIndex * count + index] ?? 0, scale, box),
    }));
    const measured = points.slice(0, lastMeasured + 1);
    const projected = points.slice(Math.max(0, lastMeasured));
    return { item, points, measured, projected };
  });

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
                  stroke={tick === 0 ? colors.text.muted : colors.glass.subtleBorder}
                  strokeWidth={1}
                />
              ))}
              {selectedIndex !== null ? (
                <Line
                  x1={bandCenter(selectedIndex, count, plotWidth)}
                  x2={bandCenter(selectedIndex, count, plotWidth)}
                  y1={box.top}
                  y2={box.top + box.height}
                  stroke={colors.glass.specularBorder}
                  strokeWidth={1}
                />
              ) : null}
              {lines.map(({ item, points, measured, projected }, seriesIndex) => (
                <React.Fragment key={item.id}>
                  {area && seriesIndex === 0 && measured.length > 1 ? (
                    <Path testID={`${testID}-area`} d={buildAreaPath(measured, zeroY)} fill={item.color} opacity={AREA_OPACITY} />
                  ) : null}
                  {measured.length > 1 ? (
                    <Path
                      testID={`${testID}-line-${item.id}`}
                      d={buildLinePath(measured)}
                      stroke={item.color}
                      strokeWidth={LINE_WIDTH_PT}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fill="none"
                    />
                  ) : null}
                  {projected.length > 1 ? (
                    <Path
                      testID={`${testID}-projection-${item.id}`}
                      d={buildLinePath(projected)}
                      stroke={item.color}
                      strokeWidth={LINE_WIDTH_PT}
                      strokeDasharray={PROJECTION_DASH}
                      strokeLinecap="round"
                      fill="none"
                      opacity={0.7}
                    />
                  ) : null}
                  {points.map((point, index) => {
                    const isSelected = index === selectedIndex;
                    const isProjected = index > lastMeasured;
                    return (
                      <Circle
                        key={`${item.id}-${index}`}
                        testID={`${testID}-dot-${item.id}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={isSelected ? SELECTED_DOT_RADIUS_PT : DOT_RADIUS_PT}
                        fill={isProjected ? colors.background.primary : item.color}
                        stroke={item.color}
                        strokeWidth={isProjected || isSelected ? 2 : 0}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
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
            describeChartPoint(
              categoryTitles[index] ?? '',
              series.map((item) => ({ label: item.label, value: item.values[index] ?? 0 })),
              describeNote?.(index)
            )
          }
        />
      </View>

      <ChartCategoryLabels labels={categories} activeIndex={activeIndex} />

      <ChartLegend items={legend} testID={`${testID}-legend`} />
    </View>
  );
}
