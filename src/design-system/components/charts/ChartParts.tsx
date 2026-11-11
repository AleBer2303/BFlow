/**
 * src/design-system/components/charts/ChartParts.tsx
 *
 * Pieces shared by every chart: the card that frames it, the legend, the readout (the
 * "tooltip": what the touched, hovered or focused point is worth) and the row of touch
 * columns laid over the plot. The plot itself (react-native-svg) is decorative for screen
 * readers: each touch column states its figures, so VoiceOver, TalkBack and the keyboard
 * reach the same data as a finger.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { formatCurrency, formatCurrencyCompact } from '../../../domain/money/money';
import { GlassSurface } from '../../../platform/glass/GlassSurface';
import { hapticService } from '../../../platform/haptics/hapticService';
import { useBFlowTheme } from '../../theme/ThemeContext';
import { AppPressable } from '../AppPressable';
import { AppText } from '../Typography';
import { resolveVisibleCount } from './chartScale';

/** Room on the right of the plot for the value labels ("$ 2.5M"). */
export const CHART_AXIS_GUTTER_PT = 52;
/** Half the line height of a micro label, to center it on its grid line. */
const VALUE_LABEL_HALF_HEIGHT_PT = 9;

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  values: readonly number[];
}

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  testID?: string;
  children: React.ReactNode;
}

export function ChartCard({ title, subtitle, testID, children }: ChartCardProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  return (
    <GlassSurface elevated testID={testID}>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xxs }}>
          <AppText variant="headline" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color={colors.text.secondary}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {children}
      </View>
    </GlassSurface>
  );
}

export interface ChartLegendItem {
  id: string;
  label: string;
  color: string;
  /** Drawn as a dashed line: a projection or a reference value. */
  dashed?: boolean;
}

export function ChartLegend({
  items,
  testID,
}: {
  items: readonly ChartLegendItem[];
  testID?: string;
}): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs }}
    >
      {items.map((item) => (
        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={
              item.dashed
                ? {
                    width: 12,
                    height: 0,
                    borderTopWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: item.color,
                  }
                : { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: item.color }
            }
          />
          <AppText variant="micro" color={colors.text.secondary}>
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export interface ChartReadoutRow {
  id: string;
  label: string;
  color: string;
  value: number;
}

export interface ChartReadoutProps {
  title: string;
  rows: readonly ChartReadoutRow[];
  note?: string;
  testID?: string;
}

/**
 * Figures of the chosen point. Not a live region: hovering would announce every move, and a
 * screen reader already reads the same figures from the focused column.
 */
export function ChartReadout({ title, rows, note, testID }: ChartReadoutProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  return (
    <View testID={testID} style={{ gap: spacing.xxs }}>
      <AppText variant="caption" color={colors.text.secondary}>
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xxs }}>
        {rows.map((row) => (
          <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: row.color }}
            />
            <AppText variant="micro" color={colors.text.secondary}>
              {row.label}
            </AppText>
            <AppText variant="callout" tabularNums color={colors.text.primary}>
              {formatCurrency(row.value)}
            </AppText>
          </View>
        ))}
      </View>
      {note ? (
        <AppText variant="micro" color={colors.text.muted}>
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

export interface ChartSelection<T> {
  /** What the readout describes: the hovered or focused item, else the pinned one. */
  active: T | null;
  /** Tap (or click) pins an item; tapping it again lets go. */
  press: (value: T) => void;
  /** Pointer and keyboard focus follow without pinning; null when they leave. */
  hover: (value: T | null) => void;
}

/**
 * Selection of a chart. Pinning (touch, click, Enter) and hovering (pointer, focus) are kept
 * apart, so a click on the hovered month pins it instead of letting it go. A choice that no
 * longer exists (fewer months after the data changed) is ignored.
 */
export function useChartSelection<T>(isValid: (value: T) => boolean): ChartSelection<T> {
  const [pinned, setPinned] = useState<T | null>(null);
  const [hovered, setHovered] = useState<T | null>(null);
  const press = useCallback((value: T) => {
    hapticService.selection();
    setPinned((current) => (current === value ? null : value));
  }, []);
  const hover = useCallback((value: T | null) => setHovered(value), []);

  let active: T | null = null;
  if (hovered !== null && isValid(hovered)) {
    active = hovered;
  } else if (pinned !== null && isValid(pinned)) {
    active = pinned;
  }
  return { active, press, hover };
}

export interface ChartWindow {
  /** Index in the full data of the first visible category. */
  start: number;
  categories: readonly string[];
  categoryTitles: readonly string[];
  series: readonly ChartSeries[];
  describeNote?: (index: number) => string | undefined;
}

/**
 * Keeps the most recent categories that fit with a full touch target each (44pt, 48dp on
 * Android). Until the plot is measured every category is kept.
 */
export function useChartWindow(
  categories: readonly string[],
  categoryTitles: readonly string[],
  series: readonly ChartSeries[],
  describeNote: ((index: number) => string | undefined) | undefined,
  plotWidth: number,
  minVisible = 1
): ChartWindow {
  const { minTouchTarget } = useBFlowTheme();
  const visible = resolveVisibleCount(categories.length, plotWidth, minTouchTarget, minVisible);
  const start = categories.length - visible;
  const visibleSeries = useMemo(
    () =>
      start === 0 ? series : series.map((item) => ({ ...item, values: item.values.slice(start) })),
    [series, start]
  );
  return {
    start,
    categories: start === 0 ? categories : categories.slice(start),
    categoryTitles: start === 0 ? categoryTitles : categoryTitles.slice(start),
    series: visibleSeries,
    describeNote: describeNote && ((index: number) => describeNote(index + start)),
  };
}

export interface ChartTouchColumnsProps {
  count: number;
  activeIndex: number | null;
  selection: ChartSelection<number>;
  describe: (index: number) => string;
  testIDPrefix: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * One column per category over the plot. Tap pins it (tap again to let go); a fine pointer
 * and the keyboard focus show it while they stay on it (web skin, iPad with a pointer).
 */
export function ChartTouchColumns({
  count,
  activeIndex,
  selection,
  describe,
  testIDPrefix,
  style,
}: ChartTouchColumnsProps): React.JSX.Element {
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }, style]}>
      {Array.from({ length: count }, (_, index) => (
        <AppPressable
          key={index}
          testID={`${testIDPrefix}-${index}`}
          accessibilityRole="button"
          accessibilityLabel={describe(index)}
          accessibilityState={{ selected: activeIndex === index }}
          onPress={() => selection.press(index)}
          onHoverIn={() => selection.hover(index)}
          onHoverOut={() => selection.hover(null)}
          onFocus={() => selection.hover(index)}
          onBlur={() => selection.hover(null)}
          style={{ flex: 1 }}
        />
      ))}
    </View>
  );
}

/** "Octubre 2026: Recibido $ 4.000.000, Pagado $ 2.920.000". */
export function describeChartPoint(
  title: string,
  series: readonly { label: string; value: number }[],
  note?: string
): string {
  const figures = series.map((item) => `${item.label} ${formatCurrency(item.value)}`).join(', ');
  return [`${title}: ${figures}`, note].filter(Boolean).join('. ');
}

/** Values of the grid lines, in the gutter on the right of the plot. */
export function ChartValueLabels({
  ticks,
  yFor,
}: {
  ticks: readonly number[];
  yFor: (tick: number) => number;
}): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  return (
    <>
      {ticks.map((tick) => (
        <AppText
          key={`tick-${tick}`}
          variant="micro"
          color={colors.text.muted}
          numberOfLines={1}
          style={{
            position: 'absolute',
            right: 0,
            width: CHART_AXIS_GUTTER_PT - spacing.xs,
            textAlign: 'right',
            top: yFor(tick) - VALUE_LABEL_HALF_HEIGHT_PT,
          }}
        >
          {formatCurrencyCompact(Math.round(tick))}
        </AppText>
      ))}
    </>
  );
}

/** Category labels under the plot, one per column; the active one is highlighted. */
export function ChartCategoryLabels({
  labels,
  activeIndex,
}: {
  labels: readonly string[];
  activeIndex: number;
}): React.JSX.Element {
  const { colors } = useBFlowTheme();
  return (
    <View
      style={{ flexDirection: 'row', marginRight: CHART_AXIS_GUTTER_PT }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {labels.map((label, index) => (
        <AppText
          key={`${label}-${index}`}
          variant="micro"
          numberOfLines={1}
          color={index === activeIndex ? colors.text.primary : colors.text.muted}
          style={{ flex: 1, textAlign: 'center' }}
        >
          {label}
        </AppText>
      ))}
    </View>
  );
}

export interface ChartSegmentOption<T extends string> {
  id: T;
  label: string;
}

export interface ChartSegmentedControlProps<T extends string> {
  options: readonly ChartSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID: string;
}

/** Switches what a chart compares (expenses or incomes) without leaving the card. */
export function ChartSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: ChartSegmentedControlProps<T>): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        padding: spacing.xxs,
        gap: spacing.xxs,
        borderRadius: radius.pill,
        backgroundColor: colors.glass.surfaceTint,
        borderWidth: 1,
        borderColor: colors.glass.subtleBorder,
      }}
    >
      {options.map((option) => {
        const isSelected = option.id === value;
        return (
          <AppPressable
            key={option.id}
            testID={`${testID}-${option.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              if (!isSelected) {
                hapticService.selection();
                onChange(option.id);
              }
            }}
            style={{
              minHeight: minTouchTarget - spacing.xs * 2,
              paddingHorizontal: spacing.md,
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: isSelected ? colors.accent.container : 'transparent',
            }}
          >
            <AppText
              variant="caption"
              color={isSelected ? colors.accent.onContainer : colors.text.secondary}
            >
              {option.label}
            </AppText>
          </AppPressable>
        );
      })}
    </View>
  );
}
