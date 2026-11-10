/**
 * src/features/summary/scene/curveMotion.ts
 *
 * Motion of the monthly curve, shared by the three.js scene and the vector stage so every
 * platform draws the line in, morphs between metrics and pulses the marker the same way.
 * See docs/decisions/0012-animated-vector-curve.md.
 */

/** Entrance: the line draws up to today, then the projection extends to the month end. */
export const CURVE_REVEAL_SECONDS = 1.5;
/** Share of the entrance spent on the solid line when there is a projection. */
export const CURVE_REVEAL_SOLID_SHARE = 0.76;
/** Transition between two shapes of the same timeline (another metric, updated data). */
export const CURVE_MORPH_SECONDS = 0.56;
/** The marker pulses a fixed number of times after each interaction, then rests. */
export const CURVE_PULSE_SECONDS = 1.9;
export const CURVE_PULSE_COUNT = 3;

/** First frame and frame-gap limits: a stalled frame never jumps the animation forward. */
export const CURVE_FALLBACK_FRAME_SECONDS = 1 / 60;
export const CURVE_MAX_FRAME_SECONDS = 1 / 20;

export function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

export interface CurveRevealShares {
  /** 0..1 of the solid line drawn, from the opening to the cutoff day. */
  solid: number;
  /** 0..1 of the projection drawn, from the cutoff day to the month end. */
  projection: number;
}

/** @param progress 0..1 of the entrance time. */
export function resolveCurveRevealShares(
  progress: number,
  hasProjection: boolean
): CurveRevealShares {
  const eased = easeInOutCubic(Math.min(1, Math.max(0, progress)));
  if (!hasProjection) {
    return { solid: eased, projection: 0 };
  }
  return {
    solid: Math.min(1, eased / CURVE_REVEAL_SOLID_SHARE),
    projection: Math.max(0, (eased - CURVE_REVEAL_SOLID_SHARE) / (1 - CURVE_REVEAL_SOLID_SHARE)),
  };
}

/** Seconds between two frame timestamps, or the fallback for the first frame of a run. */
export function resolveFrameSeconds(timestamp: number, lastTimestamp: number | null): number {
  if (lastTimestamp === null) {
    return CURVE_FALLBACK_FRAME_SECONDS;
  }
  const seconds = (timestamp - lastTimestamp) / 1000;
  return Number.isFinite(seconds)
    ? Math.min(CURVE_MAX_FRAME_SECONDS, Math.max(0, seconds))
    : CURVE_FALLBACK_FRAME_SECONDS;
}
