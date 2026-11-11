/**
 * src/design-system/components/charts/ChartParts.tsx
 *
 * Pieces shared by every chart: the card that frames it, the legend, the readout (the
 * "tooltip": what the touched, hovered or focused point is worth) and the row of touch
 * columns laid over the plot. The plot itself (react-native-svg) is decorative for screen
 * readers: each touch column states its figures, so VoiceOver, TalkBack and the keyboard
 * reach the same data as a finger.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { formatCurrency, formatCurrencyCompact } from '../../../domain/money/money';
import { GlassSurface } from '../../../platform/glass/GlassSurface';
import { hapticService } from '../../../platform/haptics/hapticService';
import { useBFlowTheme } from '../../theme/ThemeContext';
import { AppPressable } from '../AppPressable';
import { AppText } from '../Typography';

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

/** Figures of the chosen point. Announced politely when the choice changes. */
export function ChartReadout({ title, rows, note, testID }: ChartReadoutProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={{ gap: spacing.xxs }}>
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

export interface ChartTouchColumnsProps {
  count: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  describe: (index: number) => string;
  testIDPrefix: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * One column per category over the plot. Tap selects it (tap again to let go), a fine
 * pointer selects on hover, and keyboard focus selects it on the web skin.
 */
export function ChartTouchColumns({
  count,
  selectedIndex,
  onSelect,
  describe,
  testIDPrefix,
  style,
}: ChartTouchColumnsProps): React.JSX.Element {
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }, style]}>
      {Array.from({ length: count }, (_, index) => {
        const isSelected = selectedIndex === index;
        return (
          <AppPressable
            key={index}
            testID={`${testIDPrefix}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={describe(index)}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              hapticService.selection();
              onSelect(isSelected ? null : index);
            }}
            onHoverIn={() => onSelect(index)}
            onHoverOut={() => onSelect(null)}
            onFocus={() => onSelect(index)}
            style={{ flex: 1 }}
          />
        );
      })}
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
