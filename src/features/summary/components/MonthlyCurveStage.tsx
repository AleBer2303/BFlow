/**
 * src/features/summary/components/MonthlyCurveStage.tsx
 *
 * Hosts the GL surface and connects it to React: data, theme, gestures and lifecycle.
 * Horizontal drags walk through the month; vertical drags keep scrolling the page.
 *
 * Any sign that the GL path cannot draw (no context in time, a failed scene, a shader that
 * does not link, a frame that throws) calls `onUnavailable`, and the section swaps in the
 * animated vector curve instead.
 */

import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AppState,
  PixelRatio,
  Platform,
  StyleSheet,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
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
import { CurveFrameProbe } from './curveFrameProbe';
import { useCurveScrubResponder } from './useCurveScrubResponder';

export interface MonthlyCurveStageProps {
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
  reducedMotion: boolean;
  onScrub: (stop: CurveStop | null) => void;
  onUnavailable: () => void;
}

/**
 * Some Android builds never deliver the GL surface (the view stays empty and no error is
 * raised). Past this delay the stage gives up and the vector curve takes its place.
 */
export const GL_CONTEXT_TIMEOUT_MS = 6000;

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

function isForeground(state: AppStateStatus | string | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

/** Development only: one line per animation run in the Metro terminal (see curveFrameProbe). */
function reportFrameRun(message: string): void {
  console.info(message);
}

/** The user always gets the vector curve; developers also need to know why it appeared. */
function reportStageFailure(error: unknown): void {
  if (__DEV__) {
    console.warn('MonthlyCurveStage: se usa la curva vectorial.', error);
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
  const hasContextRef = useRef(false);
  const widthRef = useRef(0);
  const stopRef = useRef<CurveStop | null>(null);
  const latestRef = useRef({ curve, metricId, reducedMotion, palette, onScrub, onUnavailable });

  useLayoutEffect(() => {
    latestRef.current = { curve, metricId, reducedMotion, palette, onScrub, onUnavailable };
  }, [curve, metricId, reducedMotion, palette, onScrub, onUnavailable]);

  const handleContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const latest = latestRef.current;
    hasContextRef.current = true;
    try {
      sceneRef.current?.dispose();
      const probe = __DEV__ && Platform.OS !== 'web' ? new CurveFrameProbe(reportFrameRun) : null;
      let scene: MonthlyCurveScene | null = null;
      const requestFrame = probe
        ? (callback: (timestamp: number) => void) =>
            requestAnimationFrame((timestamp) => {
              probe.record(timestamp);
              callback(timestamp);
              if (scene?.isIdle()) {
                probe.finish(
                  `Reducir movimiento: ${latestRef.current.reducedMotion ? 'sí' : 'no'}; ` +
                    `AppState: ${String(AppState.currentState)}.`
                );
              }
            })
        : undefined;
      scene = new MonthlyCurveScene({
        requestFrame,
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
    const timer = setTimeout(() => {
      if (!hasContextRef.current) {
        reportStageFailure(new Error(`No GL context after ${GL_CONTEXT_TIMEOUT_MS} ms.`));
        latestRef.current.onUnavailable();
      }
    }, GL_CONTEXT_TIMEOUT_MS);
    return () => clearTimeout(timer);
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

  const panResponder = useCurveScrubResponder({
    resolveStop: (x) =>
      widthRef.current > 0 ? resolveCurveStop(latestRef.current.curve, x, widthRef.current) : null,
    onStop: (stop) => {
      if (stop === stopRef.current) {
        return;
      }
      stopRef.current = stop;
      sceneRef.current?.setStop(stop);
      latestRef.current.onScrub(stop);
    },
  });

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
