/**
 * src/design-system/components/AmbientParticles.tsx
 *
 * A quiet galaxy behind the workspace on iOS, Android and Web (DESIGN.md §6.6): faint dots
 * that drift up, glowing stars (round core, halo and glow, in white, cool or warm light) that
 * twinkle and float in place and, now and then, a shooting star crossing the top half.
 * Pure decoration: no touch, hidden from screen readers.
 *
 * Cost, kept as low as the look allows:
 * - Everything is plain `View`s (round dots, thin bars): no SVG is rasterised and faded, so
 *   every shape stays crisp.
 * - Each piece's motion is described once (`motion/ambientMotion.ts`). Native runs it on the
 *   native driver; Web runs it as CSS keyframes on the browser's compositor. No frame costs
 *   JavaScript work on any platform.
 * - The galaxy mounts after the first paint (`startDelayMs`) and fades in, so it never
 *   competes with the app's startup.
 * - Every piece is memoized with stable animated nodes: a re-render of the shell (a tab
 *   change, a sync) never rebuilds or restarts an animation.
 * - The loops stop while the app is in the background. With Reduce Motion the dots and stars
 *   stay still at a lower opacity and there are no shooting stars; under Jest all is static.
 */

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import {
  meteorEase,
  meteorMotion,
  particleMotion,
  starHaloMotion,
  starMotion,
  toCssKeyframes,
  type CssKeyframeOptions,
  type ElementMotion,
} from '../motion/ambientMotion';
import {
  buildAmbientParticles,
  buildAmbientStars,
  buildShootingStars,
  resolveAmbientParticleCount,
  type AmbientParticle,
  type AmbientStar,
  type ShootingStar,
} from '../motion/ambientParticles';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER } from '../motion/motionRuntime';
import { useBFlowTheme } from '../theme/ThemeContext';
import { ambientParticlesBySkin, motionDuration, type AmbientParticlesSpec } from '../tokens';

const IS_WEB = Platform.OS === 'web';
const LINEAR = Easing.linear;
const METEOR_EASING = Easing.out(Easing.quad);
/** Tail of a shooting star, from its far end to the head: opacity of each segment. */
const TAIL_SEGMENTS = [0.06, 0.12, 0.2, 0.32, 0.48, 0.68] as const;

function useAppIsActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * Progress 0..1 that repeats every `cycleMs`, starting at `phase`, on the native driver. When
 * it stops (background, Reduce Motion) and starts again, it finishes the current cycle from
 * where it was. Idle on Web, where CSS runs the cycle.
 */
function useLoopingProgress(running: boolean, cycleMs: number, phase: number): Animated.Value {
  const progress = useRef(new Animated.Value(phase)).current;

  useEffect(() => {
    if (!running) {
      return undefined;
    }
    let current: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    progress.stopAnimation((value) => {
      const first = Animated.timing(progress, {
        toValue: 1,
        duration: Math.max(0, 1 - value) * cycleMs,
        easing: LINEAR,
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      current = first;
      first.start(({ finished }) => {
        if (!finished || cancelled) {
          return;
        }
        progress.setValue(0);
        current = Animated.loop(
          Animated.timing(progress, {
            toValue: 1,
            duration: cycleMs,
            easing: LINEAR,
            useNativeDriver: USE_NATIVE_DRIVER,
          })
        );
        current.start();
      });
    });
    return () => {
      cancelled = true;
      current?.stop();
    };
  }, [running, cycleMs, progress]);

  return progress;
}

/** Native: the motion as interpolations of one progress value (built once per piece). */
function interpolateMotion(
  motion: ElementMotion,
  progress: Animated.Value,
  transformPrefix: ViewStyle['transform'] = []
) {
  const track = (t: { input: readonly number[]; output: readonly number[] }) =>
    progress.interpolate({ inputRange: [...t.input], outputRange: [...t.output] });
  const transform: Array<Record<string, unknown>> = [
    ...((transformPrefix ?? []) as Array<Record<string, unknown>>),
  ];
  if (motion.translateX) transform.push({ translateX: track(motion.translateX) });
  if (motion.translateY) transform.push({ translateY: track(motion.translateY) });
  if (motion.scale) transform.push({ scale: track(motion.scale) });
  return { opacity: track(motion.opacity), ...(transform.length > 0 ? { transform } : null) };
}

/**
 * Web: the same motion as CSS keyframes (react-native-web `animationKeyframes`). A negative
 * delay starts the cycle at its phase, like the native progress. react-native-web only
 * emits keyframes for styles compiled by `StyleSheet.create` (inline styles drop them), so
 * each piece compiles its own rule once.
 */
function cssAnimation(
  motion: ElementMotion,
  cycleMs: number,
  delayMs: number,
  options?: CssKeyframeOptions
): ViewStyle {
  return StyleSheet.create({
    animation: {
      animationKeyframes: [toCssKeyframes(motion, options)],
      animationDuration: `${Math.round(cycleMs)}ms`,
      animationDelay: `${Math.round(delayMs)}ms`,
      animationIterationCount: 'infinite',
      animationTimingFunction: 'linear',
      // A positive delay (a meteor's first wait) shows the first keyframe, not the bare view.
      animationFillMode: 'backwards',
      willChange: 'transform, opacity',
    } as unknown as ViewStyle,
  }).animation;
}

/**
 * The view that carries a piece's motion: `Animated.View` on native; a plain `View` on Web,
 * where the motion is a compiled CSS class that Animated would flatten away.
 */
const MotionView = (IS_WEB ? View : Animated.View) as typeof Animated.View;

type RunMode = 'running' | 'paused' | 'still';

interface ParticleDotProps {
  particle: AmbientParticle;
  width: number;
  height: number;
  color: string;
  peakOpacity: number;
  riseDistance: number;
  run: RunMode;
  staticOpacity: number;
}

const ParticleDot = memo(function ParticleDot({
  particle,
  width,
  height,
  color,
  peakOpacity,
  riseDistance,
  run,
  staticOpacity,
}: ParticleDotProps): React.JSX.Element {
  const progress = useLoopingProgress(
    !IS_WEB && run === 'running',
    particle.cycleMs,
    particle.phase
  );
  const motionStyle = useMemo(() => {
    if (run === 'still') {
      return { opacity: peakOpacity * particle.intensity * staticOpacity };
    }
    const motion = particleMotion(particle, peakOpacity, riseDistance);
    return IS_WEB
      ? cssAnimation(motion, particle.cycleMs, -particle.phase * particle.cycleMs)
      : interpolateMotion(motion, progress);
  }, [run, particle, peakOpacity, riseDistance, staticOpacity, progress]);

  return (
    <MotionView
      testID={particle.id}
      style={[
        {
          position: 'absolute',
          left: particle.xRatio * width - particle.radius,
          top: particle.yRatio * height - particle.radius,
          width: particle.radius * 2,
          height: particle.radius * 2,
          borderRadius: particle.radius,
          backgroundColor: color,
        },
        motionStyle,
      ]}
    />
  );
});

interface StarSparkleProps {
  star: AmbientStar;
  width: number;
  height: number;
  color: string;
  peakOpacity: number;
  spec: AmbientParticlesSpec['stars'];
  run: RunMode;
  staticOpacity: number;
}

function roundLayer(radius: number, color: string): ViewStyle {
  return {
    position: 'absolute',
    width: radius * 2,
    height: radius * 2,
    borderRadius: radius,
    backgroundColor: color,
  };
}

/**
 * A star as light, never as a cross: a bright round core inside a soft halo and a wide faint
 * glow. It breathes, floats a few points up and back and, if it flares, its halo swells to a
 * brief sparkle at the brightest moment. Every layer is a round `View`, so the halo stays
 * crisp while it scales.
 */
const StarSparkle = memo(function StarSparkle({
  star,
  width,
  height,
  color,
  peakOpacity,
  spec,
  run,
  staticOpacity,
}: StarSparkleProps): React.JSX.Element {
  const progress = useLoopingProgress(!IS_WEB && run === 'running', star.twinkleMs, star.phase);
  const glow = star.coreRadius * spec.glowRatio;

  const { containerStyle, haloStyle } = useMemo(() => {
    if (run === 'still') {
      return {
        containerStyle: { opacity: peakOpacity * star.intensity * staticOpacity },
        haloStyle: { opacity: spec.haloOpacity },
      };
    }
    const container = starMotion(star, peakOpacity, spec.floatDistance);
    const halo = starHaloMotion(star, spec);
    const delay = -star.phase * star.twinkleMs;
    return IS_WEB
      ? {
          containerStyle: cssAnimation(container, star.twinkleMs, delay),
          haloStyle: cssAnimation(halo, star.twinkleMs, delay),
        }
      : {
          containerStyle: interpolateMotion(container, progress),
          haloStyle: interpolateMotion(halo, progress),
        };
  }, [run, star, peakOpacity, spec, staticOpacity, progress]);

  return (
    <MotionView
      testID={star.id}
      style={[
        {
          position: 'absolute',
          left: star.xRatio * width - glow,
          top: star.yRatio * height - glow,
          width: glow * 2,
          height: glow * 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        containerStyle,
      ]}
    >
      <View style={[roundLayer(glow, color), { opacity: spec.glowOpacity }]} />
      <MotionView
        testID={`${star.id}-halo`}
        style={[roundLayer(star.coreRadius * spec.haloRatio, color), haloStyle]}
      />
      <View style={roundLayer(star.coreRadius, color)} />
    </MotionView>
  );
});

interface ShootingStarStreakProps {
  meteor: ShootingStar;
  width: number;
  height: number;
  color: string;
  peakOpacity: number;
  spec: AmbientParticlesSpec['shootingStars'];
  running: boolean;
}

/**
 * A head with a fading tail that falls across the top half, then waits its interval. The
 * streak is laid out along its own x axis and rotated to the path, so it only translates.
 */
const ShootingStarStreak = memo(function ShootingStarStreak({
  meteor,
  width,
  height,
  color,
  peakOpacity,
  spec,
  running,
}: ShootingStarStreakProps): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;
  const nativeRunning = !IS_WEB && running;

  useEffect(() => {
    if (!nativeRunning) {
      progress.stopAnimation();
      progress.setValue(0);
      return undefined;
    }
    const pass = Animated.timing(progress, {
      toValue: 1,
      duration: spec.travelMs,
      easing: METEOR_EASING,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    const animation = Animated.sequence([
      Animated.delay(meteor.firstDelayMs),
      Animated.loop(Animated.sequence([pass, Animated.delay(meteor.intervalMs)])),
    ]);
    progress.setValue(0);
    animation.start();
    return () => animation.stop();
  }, [nativeRunning, meteor.firstDelayMs, meteor.intervalMs, progress, spec.travelMs]);

  const rotation = meteor.direction === 1 ? spec.angleDeg : 180 - spec.angleDeg;
  const pivot = spec.tailLength / 2;

  const motionStyle = useMemo(() => {
    const motion = meteorMotion(spec, peakOpacity);
    if (!running) {
      return { opacity: 0 };
    }
    if (IS_WEB) {
      const cycleMs = spec.travelMs + meteor.intervalMs;
      return cssAnimation(motion, cycleMs, meteor.firstDelayMs, {
        // Rotate about the head, so the path starts where the head rests.
        transformPrefix: `translateX(${pivot}px) rotate(${rotation}deg) translateX(${-pivot}px)`,
        activeShare: spec.travelMs / cycleMs,
        ease: meteorEase,
        steps: 8,
      });
    }
    return interpolateMotion(motion, progress, [
      { translateX: pivot },
      { rotate: `${rotation}deg` },
      { translateX: -pivot },
    ]);
  }, [running, spec, peakOpacity, meteor.intervalMs, meteor.firstDelayMs, pivot, rotation, progress]);

  const segmentLength = spec.tailLength / TAIL_SEGMENTS.length;
  const head = spec.thickness * 2;

  return (
    <MotionView
      testID={meteor.id}
      style={[
        {
          position: 'absolute',
          left: meteor.xRatio * width - spec.tailLength,
          top: meteor.yRatio * height - head / 2,
          width: spec.tailLength + head,
          height: head,
          flexDirection: 'row',
          alignItems: 'center',
        },
        motionStyle,
      ]}
    >
      {TAIL_SEGMENTS.map((segmentOpacity, index) => (
        <View
          key={index}
          style={{
            width: segmentLength,
            height: spec.thickness * (0.5 + (index / TAIL_SEGMENTS.length) * 0.5),
            backgroundColor: color,
            opacity: segmentOpacity,
          }}
        />
      ))}
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: color }} />
    </MotionView>
  );
});

/** Mounts the galaxy once the first paint is done, so it never competes with startup. */
function useDeferredStart(delayMs: number): boolean {
  const [started, setStarted] = useState(IS_MOTION_STATIC);
  useEffect(() => {
    if (started) {
      return undefined;
    }
    const timer = setTimeout(() => setStarted(true), delayMs);
    return () => clearTimeout(timer);
  }, [started, delayMs]);
  return started;
}

export interface AmbientParticlesProps {
  testID?: string;
}

/** Memoized with no changing props: a re-render of the shell never touches the galaxy. */
export const AmbientParticles = memo(function AmbientParticles({
  testID = 'ambient-particles',
}: AmbientParticlesProps): React.JSX.Element | null {
  const { colors, skin, mode, reducedMotion } = useBFlowTheme();
  const spec = ambientParticlesBySkin[skin];
  const appActive = useAppIsActive();
  const started = useDeferredStart(spec.startDelayMs);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const fade = useRef(new Animated.Value(IS_MOTION_STATIC ? 1 : 0)).current;

  const count = resolveAmbientParticleCount(spec, size.width, size.height);
  const particles = useMemo(() => buildAmbientParticles(spec, count), [spec, count]);
  const stars = useMemo(() => buildAmbientStars(spec), [spec]);
  const meteors = useMemo(() => buildShootingStars(spec), [spec]);

  useEffect(() => {
    if (!started || IS_MOTION_STATIC) {
      return undefined;
    }
    if (reducedMotion) {
      fade.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: motionDuration.slow,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [started, reducedMotion, fade]);

  if (!spec.enabled) {
    return null;
  }

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height }
    );
  };

  const isDark = mode === 'dark';
  const isStill = IS_MOTION_STATIC || reducedMotion;
  const run: RunMode = isStill ? 'still' : appActive ? 'running' : 'paused';
  const peakOpacity = isDark ? spec.peakOpacity.dark : spec.peakOpacity.light;
  const starPeak = isDark ? spec.stars.peakOpacity.dark : spec.stars.peakOpacity.light;
  const meteorPeak = isDark
    ? spec.shootingStars.peakOpacity.dark
    : spec.shootingStars.peakOpacity.light;
  // Still (Reduce Motion or tests): dots and stars rest at a lower share of their peak.
  const staticOpacity = isStill ? spec.staticOpacityRatio : 1;
  const showsGalaxy = started && size.width > 0 && size.height > 0;
  const whiteLight = isDark ? colors.text.primary : colors.text.secondary;

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      // react-native-web drops the two props above; this keeps screen readers off it there.
      aria-hidden
      onLayout={handleLayout}
      style={[StyleSheet.absoluteFill, { opacity: fade }]}
    >
      {showsGalaxy
        ? particles.map((particle) => (
            <ParticleDot
              key={particle.id}
              particle={particle}
              width={size.width}
              height={size.height}
              color={particle.tone === 'accent' ? colors.accent.primary : colors.text.secondary}
              peakOpacity={peakOpacity}
              riseDistance={spec.riseDistance}
              run={run}
              staticOpacity={staticOpacity}
            />
          ))
        : null}
      {showsGalaxy
        ? stars.map((star) => (
            <StarSparkle
              key={star.id}
              star={star}
              width={size.width}
              height={size.height}
              color={
                star.tone === 'accent'
                  ? colors.accent.primary
                  : star.tone === 'warm'
                    ? colors.semantic.pending
                    : whiteLight
              }
              peakOpacity={starPeak}
              spec={spec.stars}
              run={run}
              staticOpacity={staticOpacity}
            />
          ))
        : null}
      {/* Shooting stars only exist in motion; a still one would read as a scratch. */}
      {showsGalaxy && !isStill
        ? meteors.map((meteor) => (
            <ShootingStarStreak
              key={meteor.id}
              meteor={meteor}
              width={size.width}
              height={size.height}
              color={colors.text.primary}
              peakOpacity={meteorPeak}
              spec={spec.shootingStars}
              running={run === 'running'}
            />
          ))
        : null}
    </Animated.View>
  );
});
