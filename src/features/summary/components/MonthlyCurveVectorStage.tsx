/**
 * src/features/summary/components/MonthlyCurveVectorStage.tsx
 *
 * The month's curve as a flat vector drawing (react-native-svg). It is the stage of the WEB
 * skin and replaces the three.js scene there (ADR 0011): crisp at any width, no WebGL
 * context, no three.js download, and it follows the web system (no glow, no tilt, the chart
 * stays still).
 *
 * Interaction:
 * - Pointer: moving over the chart walks the month day by day; leaving returns to today.
 *   Touch works the same; vertical drags keep scrolling the page.
 * - Keyboard: the chart is focusable; Left / Right step one day, Home / End jump to the
 *   first day and the last stop, Escape returns to today.
 *
 * Shares `CurveStop`, the sampling and the horizontal margin with the 3D stage, so the
 * readout and the day labels line up identically on both.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useBFlowTheme } from '../../../design-system';
import { formatCurrency } from '../../../domain/money/money';
import { clampCurveStop, resolveCurveStop, type CurveStop } from '../scene/curveGeometry';
import { getMetricColor } from '../scene/scenePalette';
import {
  VECTOR_PLOT_PADDING_TOP_PT,
  buildVectorCurveGeometry,
  resolveVectorStopPoint,
  stepCurveStop,
} from '../scene/vectorCurveGeometry';
import type { MonthlyCurveStageProps } from './MonthlyCurveStage';
import { describeCurveReadout } from './monthlyCurveCopy';

const LINE_WIDTH_PT = 2;
const AREA_OPACITY = 0.1;
const DOT_RADIUS_PT = 4.5;
const DOT_RING_WIDTH_PT = 2;
const DIM_OPACITY = 0.62;
const PROJECTION_DASH = '2 6';

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

export default function MonthlyCurveVectorStage({
  curve,
  metricId,
  onScrub,
}: MonthlyCurveStageProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [rawStop, setStop] = useState<CurveStop | null>(null);
  // Guards the render between a month change and the effect that clears the stop.
  const stop = clampCurveStop(curve, rawStop);

  const color = getMetricColor(colors, metricId);
  const geometry = useMemo(
    () => buildVectorCurveGeometry(curve, metricId, size.width, size.height),
    [curve, metricId, size.width, size.height]
  );

  const stopRef = useRef<CurveStop | null>(null);
  const applyStop = useCallback(
    (next: CurveStop | null) => {
      if (stopRef.current === next) {
        return;
      }
      stopRef.current = next;
      setStop(next);
      onScrub(next);
    },
    [onScrub]
  );

  // A stop kept from another month would point at a day that no longer exists.
  useEffect(() => {
    applyStop(null);
  }, [curve.monthKey, curve.cutoffDay, applyStop]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height }
    );
  }, []);

  const handlePointer = useCallback(
    (event: StagePointerEvent) => {
      const x = readPointerX(event);
      if (x !== null && size.width > 0) {
        applyStop(resolveCurveStop(curve, x, size.width));
      }
    },
    [applyStop, curve, size.width]
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

  const marker =
    geometry === null
      ? null
      : stop === null
        ? geometry.cutoffPoint
        : resolveVectorStopPoint(curve, metricId, stop, size.width, size.height);
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
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={handleRelease}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onBlur={handleRelease}
    >
      {geometry !== null && marker !== null ? (
        <Svg
          testID="monthly-curve-vector-svg"
          width={size.width}
          height={size.height}
          pointerEvents="none"
        >
          {geometry.gridLineYs.map((y, index) => (
            <Line
              key={y}
              x1={0}
              x2={size.width}
              y1={y}
              y2={y}
              stroke={
                index === geometry.gridLineYs.length - 1
                  ? colors.glass.specularBorder
                  : colors.glass.subtleBorder
              }
              strokeWidth={1}
            />
          ))}

          <Path testID="monthly-curve-vector-area" d={geometry.areaPath} fill={color} opacity={AREA_OPACITY} />
          <Path
            testID="monthly-curve-vector-line"
            d={geometry.linePath}
            stroke={color}
            strokeWidth={LINE_WIDTH_PT}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
          {geometry.projectionPath !== null ? (
            <Path
              testID="monthly-curve-vector-projection"
              d={geometry.projectionPath}
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
                width={Math.max(0, size.width - marker.x)}
                height={geometry.baselineY}
                fill={colors.background.primary}
                opacity={DIM_OPACITY}
              />
              <Line
                x1={marker.x}
                x2={marker.x}
                y1={VECTOR_PLOT_PADDING_TOP_PT / 2}
                y2={geometry.baselineY}
                stroke={colors.text.muted}
                strokeWidth={1}
              />
            </>
          ) : null}

          <Circle
            testID="monthly-curve-vector-marker"
            cx={marker.x}
            cy={marker.y}
            r={DOT_RADIUS_PT}
            fill={stop === 'close' ? colors.text.muted : color}
            stroke={colors.background.primary}
            strokeWidth={DOT_RING_WIDTH_PT}
          />
        </Svg>
      ) : null}
    </WebStageView>
  );
}
