/**
 * src/features/summary/components/MonthlyCurveSection.tsx
 *
 * The Summary curve: a large readout, the 3D stage and a native metric selector. The
 * selector is the accessible equivalent of the canvas and states every figure in words.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  CurrencyText,
  MIN_TOUCH_TARGET_PT,
  TactilePressable,
  hapticService,
  useBFlowTheme,
  useResponsiveLayout,
} from '../../../design-system';
import {
  MONTHLY_CURVE_METRIC_IDS,
  type MonthlyCurve,
  type MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import { useReducedMotionPreference } from '../hooks/useReducedMotionPreference';
import { CURVE_MARGIN_PT, clampCurveStop, type CurveStop } from '../scene/curveGeometry';
import { getMetricColor } from '../scene/scenePalette';
import {
  METRIC_PRESENTATION,
  buildCurveTicks,
  describeCurveReadout,
  describeMetricAccessibility,
} from './monthlyCurveCopy';
import { MonthlyCurveStageLoader } from './MonthlyCurveStageLoader';
import MonthlyCurveVectorStage from './MonthlyCurveVectorStage';

export interface MonthlyCurveSectionProps {
  curve: MonthlyCurve;
  /** Widest the stage and its selector grow. Wider layouts (desktop split) raise it. */
  stageMaxWidth?: number;
  /**
   * 'stacked' (phones): readout, stage, selector. 'split' (desktop): readout and a metric
   * table on the left, the stage on the right.
   */
  layout?: MonthlyCurveLayout;
}

export const DEFAULT_STAGE_MAX_WIDTH_PT = 480;
const STAGE_ASPECT_RATIO = 1.55;
const METRIC_BUTTON_MIN_HEIGHT_PT = Math.max(MIN_TOUCH_TARGET_PT, 52);
const IDENTITY_DOT_SIZE_PT = 6;
const UNSELECTED_DOT_OPACITY = 0.45;
const TICK_BOX_WIDTH_PT = 40;
const AMOUNT_TWEEN_MS = 420;

interface StageErrorBoundaryProps {
  onError: () => void;
  children: React.ReactNode;
}

/** GLView throws while mounting when the browser has no usable WebGL. */
class StageErrorBoundary extends React.Component<StageErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): React.ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}

/** While scrubbing the figure must track the finger, so only resting changes animate. */
function useTweenedAmount(target: number, shouldAnimate: boolean): number {
  const [tweened, setTweened] = useState(target);
  const latestRef = useRef(target);

  useEffect(() => {
    if (!shouldAnimate) {
      latestRef.current = target;
      setTweened(target);
      return undefined;
    }
    if (latestRef.current === target) {
      return undefined;
    }

    const from = latestRef.current;
    let startTime: number | null = null;
    let handle = 0;

    const step = (timestamp: number) => {
      startTime ??= timestamp;
      const progress = Math.min(1, (timestamp - startTime) / AMOUNT_TWEEN_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = progress === 1 ? target : Math.round(from + (target - from) * eased);

      latestRef.current = next;
      setTweened(next);
      if (progress < 1) {
        handle = requestAnimationFrame(step);
      }
    };

    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [target, shouldAnimate]);

  return shouldAnimate ? tweened : target;
}

interface CurveReadoutViewProps {
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
  stop: CurveStop | null;
  reducedMotion: boolean;
}

function CurveReadoutView({
  curve,
  metricId,
  stop,
  reducedMotion,
}: CurveReadoutViewProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const readout = describeCurveReadout(curve, metricId, stop);
  const amount = useTweenedAmount(readout.amount, !reducedMotion && stop === null);

  return (
    <View
      testID="monthly-curve-readout"
      style={{ gap: spacing.xxs }}
      accessibilityLiveRegion="polite"
    >
      <AppText variant="caption" color={colors.text.secondary}>
        {readout.label}
      </AppText>
      <CurrencyText testID="monthly-curve-amount" amount={amount} variant="heroCurrency" />
      <AppText variant="caption" color={colors.text.muted}>
        {readout.detail}
      </AppText>
    </View>
  );
}

function CurveTicks({ curve }: { curve: MonthlyCurve }): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();

  return (
    <View
      style={{ height: spacing.lg, paddingHorizontal: CURVE_MARGIN_PT }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ flex: 1 }}>
        {buildCurveTicks(curve).map((tick) => (
          <AppText
            key={tick.label}
            testID={`monthly-curve-tick-${tick.day}`}
            variant="micro"
            color={tick.isToday ? colors.text.primary : colors.text.muted}
            style={{
              position: 'absolute',
              left: `${(tick.day / curve.daysInMonth) * 100}%`,
              width: TICK_BOX_WIDTH_PT,
              marginLeft: -TICK_BOX_WIDTH_PT / 2,
              textAlign: 'center',
            }}
          >
            {tick.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

interface MetricButtonProps {
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
  isSelected: boolean;
  onSelect: (id: MonthlyCurveMetricId) => void;
}

const MetricButton = React.memo(function MetricButton({
  curve,
  metricId,
  isSelected,
  onSelect,
}: MetricButtonProps) {
  const { colors, spacing, radius } = useBFlowTheme();

  return (
    <TactilePressable
      testID={`monthly-curve-metric-${metricId}`}
      haptic="none"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={describeMetricAccessibility(curve, metricId)}
      onPress={() => onSelect(metricId)}
      style={{
        flex: 1,
        minHeight: METRIC_BUTTON_MIN_HEIGHT_PT,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.sm,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: isSelected ? colors.glass.specularBorder : colors.glass.subtleBorder,
        backgroundColor: isSelected ? colors.glass.surfaceElevatedTint : colors.glass.surfaceTint,
      }}
    >
      <View
        style={{
          width: IDENTITY_DOT_SIZE_PT,
          height: IDENTITY_DOT_SIZE_PT,
          borderRadius: radius.pill,
          backgroundColor: getMetricColor(colors, metricId),
          opacity: isSelected ? 1 : UNSELECTED_DOT_OPACITY,
        }}
      />
      <AppText
        variant="caption"
        numberOfLines={1}
        color={isSelected ? colors.text.primary : colors.text.secondary}
      >
        {METRIC_PRESENTATION[metricId].label}
      </AppText>
    </TactilePressable>
  );
});

interface MetricRowProps extends MetricButtonProps {
  isLast: boolean;
}

/** Split layout: the selector reads as a table, one metric a row with its current figure. */
const MetricRow = React.memo(function MetricRow({
  curve,
  metricId,
  isSelected,
  isLast,
  onSelect,
}: MetricRowProps) {
  const { colors, spacing, radius } = useBFlowTheme();
  const series = curve.series[metricId];

  return (
    <TactilePressable
      testID={`monthly-curve-metric-${metricId}`}
      haptic="none"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={describeMetricAccessibility(curve, metricId)}
      onPress={() => onSelect(metricId)}
      style={{
        minHeight: METRIC_BUTTON_MIN_HEIGHT_PT,
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
        borderRadius: radius.sm,
        borderBottomWidth: isLast || isSelected ? 0 : 1,
        borderBottomColor: colors.glass.subtleBorder,
        backgroundColor: isSelected ? colors.glass.surfaceTint : 'transparent',
      }}
    >
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}
        >
          <View
            style={{
              width: IDENTITY_DOT_SIZE_PT + 2,
              height: IDENTITY_DOT_SIZE_PT + 2,
              borderRadius: radius.pill,
              backgroundColor: getMetricColor(colors, metricId),
              opacity: isSelected ? 1 : UNSELECTED_DOT_OPACITY,
            }}
          />
          <AppText
            variant="callout"
            numberOfLines={1}
            color={isSelected ? colors.text.primary : colors.text.secondary}
          >
            {METRIC_PRESENTATION[metricId].title}
          </AppText>
        </View>
        <CurrencyText
          amount={series.values[curve.cutoffDay] as number}
          variant="callout"
          style={{ color: isSelected ? colors.text.primary : colors.text.secondary }}
        />
      </View>
    </TactilePressable>
  );
});

export type MonthlyCurveLayout = 'stacked' | 'split';

const STAGE_ASPECT_RATIO_BY_LAYOUT: Record<MonthlyCurveLayout, number> = {
  stacked: STAGE_ASPECT_RATIO,
  split: 2.3,
};
const SPLIT_LEGEND_FLEX = 4;
const SPLIT_STAGE_FLEX = 8;

export function MonthlyCurveSection({
  curve,
  stageMaxWidth = DEFAULT_STAGE_MAX_WIDTH_PT,
  layout = 'stacked',
}: MonthlyCurveSectionProps): React.JSX.Element {
  const { spacing, skinSpec } = useBFlowTheme();
  const { columnGap } = useResponsiveLayout();
  const reducedMotion = useReducedMotionPreference();
  const [metricId, setMetricId] = useState<MonthlyCurveMetricId>('flow');
  const [stop, setStop] = useState<CurveStop | null>(null);
  const [isStageUnavailable, setIsStageUnavailable] = useState(false);
  // The flat web skin draws the curve as vectors; iOS and Android keep the three.js scene and
  // fall back to the same animated vectors, driven by touch, when it cannot draw.
  const isWebSkin = skinSpec.surfaceMaterial === 'flat';
  const usesVectorStage = isWebSkin || isStageUnavailable;

  const handleSelectMetric = useCallback((id: MonthlyCurveMetricId) => {
    hapticService.trigger('selection');
    setMetricId(id);
  }, []);

  const handleScrub = useCallback((nextStop: CurveStop | null) => {
    if (nextStop !== null) {
      hapticService.trigger('selection');
    }
    setStop(nextStop);
  }, []);

  const handleStageUnavailable = useCallback(() => setIsStageUnavailable(true), []);

  const readout = (
    <CurveReadoutView
      curve={curve}
      metricId={metricId}
      stop={clampCurveStop(curve, stop)}
      reducedMotion={reducedMotion}
    />
  );

  const stage = (
    <View
      testID="monthly-curve-stage-frame"
      style={{ width: '100%', maxWidth: stageMaxWidth, alignSelf: 'center', gap: spacing.xs }}
    >
      <View style={{ width: '100%', aspectRatio: STAGE_ASPECT_RATIO_BY_LAYOUT[layout] }}>
        {usesVectorStage ? (
          <MonthlyCurveVectorStage
            curve={curve}
            metricId={metricId}
            reducedMotion={reducedMotion}
            interaction={isWebSkin ? 'pointer' : 'touch'}
            onScrub={handleScrub}
            onUnavailable={handleStageUnavailable}
          />
        ) : (
          <StageErrorBoundary onError={handleStageUnavailable}>
            <MonthlyCurveStageLoader
              curve={curve}
              metricId={metricId}
              reducedMotion={reducedMotion}
              onScrub={handleScrub}
              onUnavailable={handleStageUnavailable}
            />
          </StageErrorBoundary>
        )}
      </View>
      <CurveTicks curve={curve} />
    </View>
  );

  if (layout === 'split') {
    return (
      <View
        testID="monthly-curve-section"
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: columnGap }}
      >
        <View style={{ flex: SPLIT_LEGEND_FLEX, minWidth: 0, gap: spacing.xl }}>
          {readout}
          <View testID="monthly-curve-metric-list" accessibilityRole="tablist">
            {MONTHLY_CURVE_METRIC_IDS.map((id, index) => (
              <MetricRow
                key={id}
                curve={curve}
                metricId={id}
                isSelected={metricId === id}
                isLast={index === MONTHLY_CURVE_METRIC_IDS.length - 1}
                onSelect={handleSelectMetric}
              />
            ))}
          </View>
        </View>
        <View style={{ flex: SPLIT_STAGE_FLEX, minWidth: 0 }}>{stage}</View>
      </View>
    );
  }

  return (
    <View testID="monthly-curve-section" style={{ gap: spacing.lg }}>
      {readout}
      {stage}

      <View
        style={{
          flexDirection: 'row',
          gap: spacing.xs,
          width: '100%',
          maxWidth: stageMaxWidth,
          alignSelf: 'center',
        }}
      >
        {MONTHLY_CURVE_METRIC_IDS.map((id) => (
          <MetricButton
            key={id}
            curve={curve}
            metricId={id}
            isSelected={metricId === id}
            onSelect={handleSelectMetric}
          />
        ))}
      </View>
    </View>
  );
}
