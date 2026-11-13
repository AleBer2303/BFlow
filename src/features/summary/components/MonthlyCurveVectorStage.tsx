/**
 * src/features/summary/components/MonthlyCurveVectorStage.tsx
 *
 * The month's curve as an animated vector drawing (react-native-svg). Two jobs:
 * - Stage of the WEB skin (ADR 0011 and 0012): crisp at any width, no WebGL context and no
 *   three.js download. It moves like the 3D scene (the line draws in, the projection
 *   extends, the marker pops in and pulses, metrics morph) without glow or tilt.
 * - Fallback on iOS and Android when the 3D stage cannot draw, so a phone never loses the
 *   animation (ADR 0012).
 *
 * Interaction:
 * - 'pointer' (web skin): moving over the chart walks the month day by day; leaving
 *   returns to today. The chart is focusable: Left / Right step one day, Home / End jump to
 *   the first day and the last stop, Escape returns to today.
 * - 'touch' (phone fallback): the horizontal drag of the 3D stage; vertical drags keep
 *   scrolling. Hidden from VoiceOver and TalkBack like the 3D canvas, because the metric
 *   buttons already state every figure.
 *
 * Shares `CurveStop`, the sampling, the margin and the timeline with the 3D stage, so the
 * readout and the day labels line up identically on both.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useBFlowTheme } from '../../../design-system';
import { MONTHLY_CURVE_METRIC_IDS } from '../../../domain/overview/monthlyCurve';
import { formatCurrency } from '../../../domain/money/money';
import {
  clampCurveStop,
  resolveCurveStop,
  type CurveStop,
} from '../scene/curveGeometry';
import { resolveFrameSeconds } from '../scene/curveMotion';
import { getMetricColor } from '../scene/scenePalette';
import {
  VectorCurveAnimator,
  type MetricColors,
  type VectorCurveFrame,
} from '../scene/vectorCurveAnimator';
import { VECTOR_PLOT_PADDING_TOP_PT, stepCurveStop } from '../scene/vectorCurveGeometry';
import type { MonthlyCurveStageProps } from './MonthlyCurveStage';
import { describeCurveReadout } from './monthlyCurveCopy';
import { useCurveScrubResponder } from './useCurveScrubResponder';

export type VectorStageInteraction = 'pointer' | 'touch';

export interface MonthlyCurveVectorStageProps extends MonthlyCurveStageProps {
  interaction?: VectorStageInteraction;
}

const LINE_WIDTH_PT = 2;
const AREA_OPACITY = 0.1;
const DOT_RADIUS_PT = 4.5;
const DOT_RING_WIDTH_PT = 2;
const PULSE_START_RADIUS_PT = DOT_RADIUS_PT + 2;
const PULSE_END_RADIUS_PT = 22;
const PULSE_STROKE_PT = 1.5;
const PULSE_MAX_OPACITY = 0.55;
const DIM_OPACITY = 0.62;
const PROJECTION_DASH = '2 6';
const MIN_VISIBLE_SCALE = 0.01;

interface StagePointerEvent {
  nativeEvent: { offsetX?: number; locationX?: number };
}

interface StageKeyEvent {
  nativeEvent?: { key?: string };
  key?: string;
  preventDefault?: () => void;
}

/** Props react-native-web forwards to the DOM that React Native's `ViewProps` does not type. */
type WebStageProps = ViewProps & {
  tabIndex?: number;
  onKeyDown?: (event: StageKeyEvent) => void;
  onPointerMove?: (event: StagePointerEvent) => void;
  onPointerDown?: (event: StagePointerEvent) => void;
  onPointerLeave?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
};

const WebStageView = View as unknown as React.ComponentType<WebStageProps>;

const WEB_STAGE_STYLE = {
  touchAction: 'pan-y',
  cursor: 'crosshair',
  userSelect: 'none',
} as unknown as ViewProps['style'];

function readPointerX(event: StagePointerEvent): number | null {
  const { offsetX, locationX } = event.nativeEvent;
  const x = typeof offsetX === 'number' ? offsetX : locationX;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/** Drives the animator: one frame per display refresh while it moves, none at rest. */
function useAnimatedFrame(animator: VectorCurveAnimator) {
  const [frame, setFrame] = useState<VectorCurveFrame | null>(() => animator.getFrame());
  const handleRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  const step = useCallback(
    (timestamp: number) => {
      handleRef.current = null;
      const seconds = resolveFrameSeconds(timestamp, lastTimestampRef.current);
      lastTimestampRef.current = timestamp;
      const isMoving = animator.advance(seconds);
      setFrame(animator.getFrame());
      if (isMoving) {
        handleRef.current = requestAnimationFrame(step);
      } else {
        lastTimestampRef.current = null;
      }
    },
    [animator]
  );

  /** Shows the new state right away and keeps animating from there (once there is a size). */
  const invalidate = useCallback(() => {
    const next = animator.getFrame();
    setFrame(next);
    if (next !== null && handleRef.current === null) {
      handleRef.current = requestAnimationFrame(step);
    }
  }, [animator, step]);

  useEffect(
    () => () => {
      if (handleRef.current !== null) {
        cancelAnimationFrame(handleRef.current);
        handleRef.current = null;
      }
    },
    []
  );

  return { frame, invalidate };
}

export default function MonthlyCurveVectorStage({
  curve,
  metricId,
  reducedMotion,
  onScrub,
  interaction = 'pointer',
}: MonthlyCurveVectorStageProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const metricColors = useMemo(
    () =>
      Object.fromEntries(
        MONTHLY_CURVE_METRIC_IDS.map((id) => [id, getMetricColor(colors, id)])
      ) as MetricColors,
    [colors]
  );

  const [animator] = useState(
    () => new VectorCurveAnimator({ curve, metricId, colors: metricColors, reducedMotion })
  );
  const { frame, invalidate } = useAnimatedFrame(animator);

  const [rawStop, setStop] = useState<CurveStop | null>(null);
  // Guards the render between a month change and the effect that clears the stop.
  const stop = clampCurveStop(curve, rawStop);

  const stopRef = useRef<CurveStop | null>(null);
  const applyStop = useCallback(
    (next: CurveStop | null) => {
      if (stopRef.current === next) {
        return;
      }
      stopRef.current = next;
      setStop(next);
      animator.setStop(next);
      invalidate();
      onScrub(next);
    },
    [animator, invalidate, onScrub]
  );

  useEffect(() => {
    animator.setCurve(curve);
    invalidate();
  }, [animator, curve, invalidate]);

  useEffect(() => {
    animator.setMetric(metricId);
    invalidate();
  }, [animator, metricId, invalidate]);

  useEffect(() => {
    animator.setColors(metricColors);
    invalidate();
  }, [animator, metricColors, invalidate]);

  useEffect(() => {
    animator.setReducedMotion(reducedMotion);
    invalidate();
  }, [animator, reducedMotion, invalidate]);

  // A stop kept from another month would point at a day that no longer exists.
  useEffect(() => {
    applyStop(null);
  }, [curve.monthKey, curve.cutoffDay, applyStop]);

  const widthRef = useRef(0);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      widthRef.current = width;
      if (animator.setSize(width, height)) {
        invalidate();
      }
    },
    [animator, invalidate]
  );

  const resolveStopAt = useCallback(
    (x: number) => (widthRef.current > 0 ? resolveCurveStop(curve, x, widthRef.current) : null),
    [curve]
  );

  const panResponder = useCurveScrubResponder({ resolveStop: resolveStopAt, onStop: applyStop });

  const handlePointer = useCallback(
    (event: StagePointerEvent) => {
      const x = readPointerX(event);
      const next = x === null ? null : resolveStopAt(x);
      if (next !== null) {
        applyStop(next);
      }
    },
    [applyStop, resolveStopAt]
  );

  const handleRelease = useCallback(() => applyStop(null), [applyStop]);

  const handleKeyDown = useCallback(
    (event: StageKeyEvent) => {
      const key = event.nativeEvent?.key ?? event.key;
      const lastStop: CurveStop = curve.hasProjection ? 'close' : curve.cutoffDay;
      let next: CurveStop | null | undefined;

      if (key === 'ArrowLeft') {
        next = stepCurveStop(curve, stop, -1);
      } else if (key === 'ArrowRight') {
        next = stepCurveStop(curve, stop, 1);
      } else if (key === 'Home') {
        next = 1;
      } else if (key === 'End') {
        next = lastStop;
      } else if (key === 'Escape') {
        next = null;
      }

      if (next !== undefined) {
        event.preventDefault?.();
        applyStop(next);
      }
    },
    [applyStop, curve, stop]
  );

  const drawing = frame === null ? null : <CurveDrawing frame={frame} stop={stop} />;

  if (interaction === 'touch') {
    return (
      <View
        testID="monthly-curve-vector-stage"
        style={StyleSheet.absoluteFill}
        onLayout={handleLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        {...panResponder.panHandlers}
      >
        {drawing}
      </View>
    );
  }

  const readout = describeCurveReadout(curve, metricId, stop);

  return (
    <WebStageView
      testID="monthly-curve-vector-stage"
      style={[StyleSheet.absoluteFill, WEB_STAGE_STYLE]}
      onLayout={handleLayout}
      tabIndex={0}
      accessibilityRole="adjustable"
      accessibilityLabel="Curva del mes. Usa las flechas izquierda y derecha para recorrerla día a día."
      accessibilityValue={{ text: `${readout.label}: ${formatCurrency(readout.amount)}` }}
      aria-valuetext={`${readout.label}: ${formatCurrency(readout.amount)}`}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={handleRelease}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onBlur={handleRelease}
    >
      {drawing}
    </WebStageView>
  );
}

interface CurveDrawingProps {
  frame: VectorCurveFrame;
  stop: CurveStop | null;
}

function CurveDrawing({ frame, stop }: CurveDrawingProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const { width, height, marker, color } = frame;
  const lastGridIndex = frame.gridLineYs.length - 1;

  return (
    <Svg testID="monthly-curve-vector-svg" width={width} height={height} pointerEvents="none">
      {frame.gridLineYs.map((y, index) => (
        <Line
          key={y}
          x1={0}
          x2={width}
          y1={y}
          y2={y}
          stroke={index === lastGridIndex ? colors.glass.specularBorder : colors.glass.subtleBorder}
          strokeWidth={1}
        />
      ))}

      {frame.areaPath !== '' ? (
        <Path testID="monthly-curve-vector-area" d={frame.areaPath} fill={color} opacity={AREA_OPACITY} />
      ) : null}
      {frame.linePath !== '' ? (
        <Path
          testID="monthly-curve-vector-line"
          d={frame.linePath}
          stroke={color}
          strokeWidth={LINE_WIDTH_PT}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      {frame.projectionPath ? (
        <Path
          testID="monthly-curve-vector-projection"
          d={frame.projectionPath}
          stroke={colors.text.muted}
          strokeWidth={LINE_WIDTH_PT}
          strokeDasharray={PROJECTION_DASH}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}

      {stop !== null ? (
        <>
          {/* Everything after the stop steps back, so the eye stays on the chosen day. */}
          <Rect
            testID="monthly-curve-vector-dim"
            x={marker.x}
            y={0}
            width={Math.max(0, width - marker.x)}
            height={frame.baselineY}
            fill={colors.background.primary}
            opacity={DIM_OPACITY * frame.focus}
          />
          <Line
            x1={marker.x}
            x2={marker.x}
            y1={VECTOR_PLOT_PADDING_TOP_PT / 2}
            y2={frame.baselineY}
            stroke={colors.text.muted}
            strokeWidth={1}
            opacity={frame.focus}
          />
        </>
      ) : null}

      {frame.pulse !== null ? (
        <Circle
          testID="monthly-curve-vector-pulse"
          cx={marker.x}
          cy={marker.y}
          r={PULSE_START_RADIUS_PT + (PULSE_END_RADIUS_PT - PULSE_START_RADIUS_PT) * frame.pulse}
          fill="none"
          stroke={color}
          strokeWidth={PULSE_STROKE_PT}
          opacity={PULSE_MAX_OPACITY * (1 - frame.pulse) ** 2}
        />
      ) : null}

      {frame.markerScale > MIN_VISIBLE_SCALE ? (
        <Circle
          testID="monthly-curve-vector-marker"
          cx={marker.x}
          cy={marker.y}
          r={DOT_RADIUS_PT * frame.markerScale}
          fill={stop === 'close' ? colors.text.muted : color}
          stroke={colors.background.primary}
          strokeWidth={DOT_RING_WIDTH_PT}
          opacity={Math.min(1, frame.markerScale)}
        />
      ) : null}
    </Svg>
  );
}
