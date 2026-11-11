/**
 * src/design-system/components/charts/DonutChart.tsx
 *
 * Animated donut with its legend, drawn with react-native-svg on the three skins. On
 * entrance the ring sweeps clockwise from the top; with new data each slice moves to its
 * new angle. Each legend row is the touch target of its slice (tap, hover or focus): it
 * highlights the slice and the center states its amount and share. With nothing chosen the
 * center shows the total.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { formatCurrency } from '../../../domain/money/money';
import { hapticService } from '../../../platform/haptics/hapticService';
import { useBFlowTheme } from '../../theme/ThemeContext';
import { AppPressable } from '../AppPressable';
import { AppText } from '../Typography';
import { buildArcPath, resolveSliceEndAngles } from './chartScale';
import { useChartTransition } from './useChartTransition';

export interface DonutSlice {
  id: string;
  label: string;
  amount: number;
  color: string;
}

export interface DonutChartProps {
  slices: readonly DonutSlice[];
  /** What the center states when no slice is chosen ("Total del mes"). */
  totalLabel: string;
  /** Shown instead of the ring when every amount is zero. */
  emptyLabel: string;
  size?: number;
  testID: string;
}

const DEFAULT_SIZE_PT = 168;
const RING_WIDTH_PT = 18;
const SELECTED_RING_WIDTH_PT = 24;
const SLICE_GAP_DEGREES = 1.6;
const DIMMED_OPACITY = 0.35;

export function formatShare(share: number): string {
  const percent = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return `${percent} %`;
}

export function DonutChart({
  slices,
  totalLabel,
  emptyLabel,
  size = DEFAULT_SIZE_PT,
  testID,
}: DonutChartProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const [isLaidOut, setIsLaidOut] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.amount), 0);
  const targets = useMemo(() => resolveSliceEndAngles(slices.map((s) => s.amount)), [slices]);
  // Cumulative angles must stay ordered, so the slices move together (no stagger).
  const ends = useChartTransition(targets, { enabled: isLaidOut, stagger: false });

  const handleLayout = useCallback((_event: LayoutChangeEvent) => setIsLaidOut(true), []);

  const selected = slices.find((slice) => slice.id === selectedId) ?? null;
  const center = size / 2;
  const ringRadius = center - SELECTED_RING_WIDTH_PT / 2;
  const gap = slices.length > 1 ? SLICE_GAP_DEGREES : 0;

  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.lg }}
    >
      <View
        style={{ width: size, height: size, alignSelf: 'center' }}
        onLayout={handleLayout}
        testID={`${testID}-ring`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={size} height={size} testID={`${testID}-svg`}>
          <Circle
            cx={center}
            cy={center}
            r={ringRadius}
            stroke={colors.glass.subtleBorder}
            strokeWidth={RING_WIDTH_PT}
            fill="none"
          />
          {total > 0
            ? slices.map((slice, index) => {
                const start = index === 0 ? 0 : (ends[index - 1] ?? 0);
                const end = ends[index] ?? 0;
                const isSelected = slice.id === selectedId;
                const path = buildArcPath(center, center, ringRadius, start, end - gap);
                return path ? (
                  <Path
                    key={slice.id}
                    testID={`${testID}-arc-${slice.id}`}
                    d={path}
                    stroke={slice.color}
                    strokeWidth={isSelected ? SELECTED_RING_WIDTH_PT : RING_WIDTH_PT}
                    fill="none"
                    opacity={selectedId === null || isSelected ? 1 : DIMMED_OPACITY}
                  />
                ) : null;
              })
            : null}
        </Svg>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: SELECTED_RING_WIDTH_PT + spacing.xs,
          }}
        >
          <AppText variant="micro" color={colors.text.secondary} numberOfLines={1}>
            {selected ? selected.label : totalLabel}
          </AppText>
          <AppText
            variant="callout"
            tabularNums
            numberOfLines={1}
            adjustsFontSizeToFit
            testID={`${testID}-center-value`}
          >
            {formatCurrency(selected ? selected.amount : total)}
          </AppText>
          {selected && total > 0 ? (
            <AppText variant="micro" color={colors.text.muted}>
              {formatShare(selected.amount / total)}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 180, gap: spacing.xxs }} testID={`${testID}-legend`}>
        {total === 0 ? (
          <AppText variant="caption" color={colors.text.muted}>
            {emptyLabel}
          </AppText>
        ) : (
          slices.map((slice) => {
            const isSelected = slice.id === selectedId;
            const share = slice.amount / total;
            return (
              <AppPressable
                key={slice.id}
                testID={`${testID}-slice-${slice.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${slice.label}: ${formatCurrency(slice.amount)}, ${formatShare(share)} del total`}
                onPress={() => {
                  hapticService.selection();
                  setSelectedId(isSelected ? null : slice.id);
                }}
                onHoverIn={() => setSelectedId(slice.id)}
                onHoverOut={() => setSelectedId(null)}
                onFocus={() => setSelectedId(slice.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.sm,
                  backgroundColor: isSelected ? colors.accent.container : 'transparent',
                }}
              >
                <View
                  style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: slice.color }}
                />
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  color={isSelected ? colors.accent.onContainer : colors.text.primary}
                  style={{ flex: 1 }}
                >
                  {slice.label}
                </AppText>
                <AppText variant="caption" tabularNums color={colors.text.secondary}>
                  {formatShare(share)}
                </AppText>
              </AppPressable>
            );
          })
        )}
      </View>
    </View>
  );
}
