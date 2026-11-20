/**
 * src/design-system/motion/ambientMotion.ts
 *
 * How each piece of the ambient galaxy moves over one cycle (DESIGN.md §6.6), described once
 * as keyframe tracks over a progress of 0..1. Native turns them into `Animated` interpolations
 * on the native driver; Web turns them into CSS keyframes (`animationKeyframes` of
 * react-native-web), so the browser animates them on its compositor with no JavaScript per
 * frame. Both read the same numbers, so the look is identical.
 */

import type { AmbientParticlesSpec } from '../tokens';
import type { AmbientParticle, AmbientStar } from './ambientParticles';

/** Piecewise-linear track: `output[i]` at progress `input[i]`. */
export interface MotionTrack {
  input: readonly number[];
  output: readonly number[];
}

export interface ElementMotion {
  opacity: MotionTrack;
  translateX?: MotionTrack;
  translateY?: MotionTrack;
  scale?: MotionTrack;
}

/** Breathing curve of one twinkle, close to a sine with linear progress. */
const TWINKLE_INPUT = [0, 0.25, 0.5, 0.75, 1] as const;
const TWINKLE_LEVEL = [0.25, 0.62, 1, 0.62, 0.25] as const;
/** The halo of a flaring star swells briefly around the brightest moment. */
const FLARE_INPUT = [0, 0.42, 0.5, 0.58, 1] as const;

/** A dot rises through its cycle, swaying sideways, fading in and out at the ends. */
export function particleMotion(
  particle: AmbientParticle,
  peakOpacity: number,
  riseDistance: number
): ElementMotion {
  const peak = peakOpacity * particle.intensity;
  return {
    opacity: { input: [0, 0.25, 0.75, 1], output: [0, peak, peak, 0] },
    translateX: { input: [0, 0.5, 1], output: [0, particle.sway, 0] },
    translateY: { input: [0, 1], output: [riseDistance / 2, -riseDistance / 2] },
  };
}

/** A star breathes and floats a few points up and back. */
export function starMotion(
  star: AmbientStar,
  peakOpacity: number,
  floatDistance: number
): ElementMotion {
  const peak = peakOpacity * star.intensity;
  return {
    opacity: { input: TWINKLE_INPUT, output: TWINKLE_LEVEL.map((level) => level * peak) },
    translateY: { input: TWINKLE_INPUT, output: [0, -floatDistance, 0, floatDistance, 0] },
  };
}

/** The halo beats with its star; a flaring one swells into a brief sparkle. */
export function starHaloMotion(
  star: AmbientStar,
  spec: AmbientParticlesSpec['stars']
): ElementMotion {
  const base = spec.haloOpacity;
  if (star.flares) {
    const flare = Math.min(1, base * 2.4);
    return {
      opacity: { input: FLARE_INPUT, output: [base, base, flare, base, base] },
      scale: { input: FLARE_INPUT, output: [0.9, 1, 1.5, 1, 0.9] },
    };
  }
  return {
    opacity: { input: [0, 1], output: [base, base] },
    scale: { input: TWINKLE_INPUT, output: [0.85, 0.95, 1.08, 0.95, 0.85] },
  };
}

/** One pass of a shooting star, progress 0..1 of the pass (eased by `meteorEase`). */
export function meteorMotion(
  spec: AmbientParticlesSpec['shootingStars'],
  peakOpacity: number
): ElementMotion {
  return {
    opacity: { input: [0, 0.12, 0.7, 1], output: [0, peakOpacity, peakOpacity, 0] },
    translateX: { input: [0, 1], output: [0, spec.travelDistance] },
  };
}

/** A meteor is fastest as it appears and slows as it burns out (ease-out quad). */
export function meteorEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) * (1 - clamped);
}

/** Value of a track at `progress`, like `Animated.Value.interpolate` with clamping. */
export function sampleTrack(track: MotionTrack, progress: number): number {
  const { input, output } = track;
  const last = input.length - 1;
  if (last < 0) {
    return 0;
  }
  if (progress <= (input[0] as number)) {
    return output[0] as number;
  }
  if (progress >= (input[last] as number)) {
    return output[last] as number;
  }
  for (let index = 1; index <= last; index += 1) {
    const end = input[index] as number;
    if (progress <= end) {
      const start = input[index - 1] as number;
      const from = output[index - 1] as number;
      const to = output[index] as number;
      const ratio = end === start ? 1 : (progress - start) / (end - start);
      return from + (to - from) * ratio;
    }
  }
  return output[last] as number;
}

export interface CssKeyframeOptions {
  /** Transforms applied before the animated ones (a meteor's pivot and rotation). */
  transformPrefix?: string;
  /** Share of the CSS cycle the motion takes; the rest holds the final frame (a meteor's wait). */
  activeShare?: number;
  /** Easing applied to the progress inside the active share. */
  ease?: (t: number) => number;
  /** Keyframes inside the active share. */
  steps?: number;
}

export type CssKeyframes = Record<string, { opacity: number; transform?: string }>;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function frameAt(motion: ElementMotion, progress: number, prefix: string) {
  const parts: string[] = prefix === '' ? [] : [prefix];
  if (motion.translateX) parts.push(`translateX(${round(sampleTrack(motion.translateX, progress))}px)`);
  if (motion.translateY) parts.push(`translateY(${round(sampleTrack(motion.translateY, progress))}px)`);
  if (motion.scale) parts.push(`scale(${round(sampleTrack(motion.scale, progress))})`);
  const frame: { opacity: number; transform?: string } = {
    opacity: round(sampleTrack(motion.opacity, progress)),
  };
  if (parts.length > 0) {
    frame.transform = parts.join(' ');
  }
  return frame;
}

/**
 * CSS keyframes for one cycle. Without easing, one keyframe per track stop (the browser
 * interpolates linearly between them, exactly like the native interpolation); with easing,
 * `steps` samples of the eased progress.
 */
export function toCssKeyframes(motion: ElementMotion, options: CssKeyframeOptions = {}): CssKeyframes {
  const { transformPrefix = '', activeShare = 1, ease, steps = 8 } = options;
  const progresses = new Set<number>();
  if (ease) {
    for (let step = 0; step <= steps; step += 1) progresses.add(step / steps);
  } else {
    for (const track of [motion.opacity, motion.translateX, motion.translateY, motion.scale]) {
      track?.input.forEach((stop) => progresses.add(stop));
    }
    progresses.add(0);
    progresses.add(1);
  }

  const keyframes: CssKeyframes = {};
  for (const t of [...progresses].sort((a, b) => a - b)) {
    const progress = ease ? ease(t) : t;
    keyframes[`${round(t * activeShare * 100)}%`] = frameAt(motion, progress, transformPrefix);
  }
  if (activeShare < 1) {
    keyframes['100%'] = frameAt(motion, 1, transformPrefix);
  }
  return keyframes;
}
