/**
 * src/features/summary/components/MonthlyCurveStage.tsx
 *
 * Hosts the GL surface and connects it to React: data, theme, gestures and lifecycle.
 * Horizontal drags walk through the month; vertical drags keep scrolling the page.
 */

import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AppState,
  PanResponder,
  PixelRatio,
  Platform,
  StyleSheet,
  View,
  type AppStateStatus,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import { useBFlowTheme } from '../../../design-system';
import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import { resolveCurveStop, type CurveStop } from '../scene/curveGeometry';
import { MonthlyCurveScene } from '../scene/monthlyCurveScene';
import { toScenePalette } from '../scene/scenePalette';

export interface MonthlyCurveStageProps {
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
  reducedMotion: boolean;
  onScrub: (stop: CurveStop | null) => void;
  onUnavailable: () => void;
}

const DRAG_START_THRESHOLD_PT = 8;
const DRAG_HORIZONTAL_BIAS = 1.2;

/** Must stay a stable reference: GLView recreates the context when this object changes. */
const WEB_GL_VIEW_PROPS =
  Platform.OS === 'web'
    ? {
        webglContextAttributes: {
          alpha: false,
          antialias: true,
          powerPreference: 'low-power',
        } satisfies WebGLContextAttributes,
      }
    : null;

const WEB_DRAG_STYLE =
  Platform.OS === 'web'
    ? ({ touchAction: 'pan-y', cursor: 'ew-resize', userSelect: 'none' } as unknown as ViewStyle)
    : null;

function isHorizontalDrag(gesture: PanResponderGestureState): boolean {
  return (
    Math.abs(gesture.dx) > DRAG_START_THRESHOLD_PT &&
    Math.abs(gesture.dx) > Math.abs(gesture.dy) * DRAG_HORIZONTAL_BIAS
  );
}

function isForeground(state: AppStateStatus | string | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

/** The user always gets the 2D view; developers also need to know why it appeared. */
function reportStageFailure(error: unknown): void {
  if (__DEV__) {
    console.warn('MonthlyCurveStage: se usa el respaldo 2D.', error);
  }
}

export default function MonthlyCurveStage({
  curve,
  metricId,
  reducedMotion,
  onScrub,
  onUnavailable,
}: MonthlyCurveStageProps): React.JSX.Element {
  const { colors, mode } = useBFlowTheme();
  const palette = useMemo(() => toScenePalette(colors, mode), [colors, mode]);

  const sceneRef = useRef<MonthlyCurveScene | null>(null);
  const widthRef = useRef(0);
  const dragOriginXRef = useRef(0);
  const stopRef = useRef<CurveStop | null>(null);
  const latestRef = useRef({ curve, metricId, reducedMotion, palette, onScrub, onUnavailable });

  useLayoutEffect(() => {
    latestRef.current = { curve, metricId, reducedMotion, palette, onScrub, onUnavailable };
  }, [curve, metricId, reducedMotion, palette, onScrub, onUnavailable]);

  const handleContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const latest = latestRef.current;
    try {
      sceneRef.current?.dispose();
      const scene = new MonthlyCurveScene({
        gl,
        bufferWidth: gl.drawingBufferWidth,
        bufferHeight: gl.drawingBufferHeight,
        pixelRatio: PixelRatio.get(),
        palette: latest.palette,
        curve: latest.curve,
        metricId: latest.metricId,
        reducedMotion: latest.reducedMotion,
        onRenderError: (error) => {
          reportStageFailure(error);
          latestRef.current.onUnavailable();
        },
      });
      scene.setActive(isForeground(AppState.currentState));
      sceneRef.current = scene;
    } catch (error) {
      reportStageFailure(error);
      latest.onUnavailable();
    }
  }, []);

  useEffect(() => {
    sceneRef.current?.setCurve(curve);
  }, [curve]);

  useEffect(() => {
    sceneRef.current?.setMetric(metricId);
  }, [metricId]);

  useEffect(() => {
    sceneRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      sceneRef.current?.setActive(isForeground(state));
    });
    return () => subscription?.remove?.();
  }, []);

  // Layout cleanup runs before GLView unmounts, while the GL context is still valid.
  useLayoutEffect(
    () => () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    },
    []
  );

  const panResponder = useMemo(() => {
    const applyStop = (stop: CurveStop | null) => {
      if (stop === stopRef.current) {
        return;
      }
      stopRef.current = stop;
      sceneRef.current?.setStop(stop);
      latestRef.current.onScrub(stop);
    };

    const scrubTo = (x: number) => {
      if (widthRef.current > 0) {
        applyStop(resolveCurveStop(latestRef.current.curve, x, widthRef.current));
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState
      ) => isHorizontalDrag(gesture),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        dragOriginXRef.current = event.nativeEvent.locationX;
        scrubTo(dragOriginXRef.current);
      },
      onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
        scrubTo(dragOriginXRef.current + gesture.dx);
      },
      onPanResponderRelease: () => applyStop(null),
      onPanResponderTerminate: () => applyStop(null),
    });
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    widthRef.current = width;
    const scale = PixelRatio.get();
    sceneRef.current?.resize(Math.round(width * scale), Math.round(height * scale));
  }, []);

  return (
    <View
      testID="monthly-curve-stage"
      style={[StyleSheet.absoluteFill, WEB_DRAG_STYLE]}
      onLayout={handleLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...panResponder.panHandlers}
    >
      <GLView
        testID="monthly-curve-gl-view"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onContextCreate={handleContextCreate}
        {...WEB_GL_VIEW_PROPS}
      />
    </View>
  );
}
