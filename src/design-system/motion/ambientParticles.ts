/**
 * src/design-system/motion/ambientParticles.ts
 *
 * Layout of the ambient particles behind the workspace (DESIGN.md §6.6). Pure and
 * deterministic: the same seed and screen always give the same dots, so the background does
 * not jump between renders and tests can pin it.
 */

import type { AmbientParticlesSpec } from '../tokens';

export interface AmbientParticle {
  id: string;
  /** Resting position as a share of the screen, 0..1. */
  xRatio: number;
  yRatio: number;
  radius: number;
  cycleMs: number;
  /** Where in its cycle the dot starts, 0..1, so they do not all rise together. */
  phase: number;
  /** Sideways sway of one rise, signed. */
  sway: number;
  /** Peak opacity as a share of the theme's peak, 0.5..1. */
  intensity: number;
  tone: 'accent' | 'ink';
}

/** Mulberry32: tiny seeded PRNG, enough for a decorative layout. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

/** How many dots a screen of this size gets. */
export function resolveAmbientParticleCount(
  spec: AmbientParticlesSpec,
  width: number,
  height: number
): number {
  if (!spec.enabled || !(width > 0) || !(height > 0)) {
    return 0;
  }
  const compactArea = 390 * 844;
  const extra = Math.max(0, Math.floor((width * height - compactArea) / spec.areaPerExtraParticle));
  return Math.min(spec.maxCount, spec.count + extra);
}

export function buildAmbientParticles(
  spec: AmbientParticlesSpec,
  count: number,
  seed = 2026
): AmbientParticle[] {
  const random = createRandom(seed);
  const particles: AmbientParticle[] = [];
  const safeCount = Math.max(0, Math.trunc(count));
  for (let index = 0; index < safeCount; index += 1) {
    // Stratified across the height so the dots never bunch up in one band.
    const yRatio = (index + random()) / Math.max(safeCount, 1);
    const swayRatio = random() * 2 - 1;
    particles.push({
      id: `ambient-particle-${index}`,
      xRatio: lerp(0.04, 0.96, random()),
      yRatio: lerp(0.06, 0.96, yRatio),
      radius: lerp(spec.minRadius, spec.maxRadius, random()),
      cycleMs: Math.round(lerp(spec.minCycleMs, spec.maxCycleMs, random())),
      phase: random(),
      sway: swayRatio * spec.swayDistance,
      intensity: lerp(0.5, 1, random()),
      tone: random() < spec.accentShare ? 'accent' : 'ink',
    });
  }
  return particles;
}

export interface AmbientStar {
  id: string;
  xRatio: number;
  yRatio: number;
  coreRadius: number;
  twinkleMs: number;
  phase: number;
  /** Peak opacity as a share of the theme's peak, 0.6..1. */
  intensity: number;
  /** Whether its halo swells into a brief sparkle once per cycle. */
  flares: boolean;
  /** White light, cool (accent) or warm (gold). */
  tone: 'white' | 'accent' | 'warm';
}

function pickStarTone(roll: number, accentShare: number, warmShare: number): AmbientStar['tone'] {
  if (roll < accentShare) {
    return 'accent';
  }
  return roll < accentShare + warmShare ? 'warm' : 'white';
}

/** Twinkling stars, spread over the screen like the dots. */
export function buildAmbientStars(spec: AmbientParticlesSpec, seed = 1987): AmbientStar[] {
  if (!spec.enabled) {
    return [];
  }
  const random = createRandom(seed);
  const {
    count,
    minCoreRadius,
    maxCoreRadius,
    minTwinkleMs,
    maxTwinkleMs,
    flareShare,
    accentShare,
    warmShare,
  } = spec.stars;
  const stars: AmbientStar[] = [];
  for (let index = 0; index < count; index += 1) {
    stars.push({
      id: `ambient-star-${index}`,
      xRatio: lerp(0.06, 0.94, random()),
      yRatio: lerp(0.05, 0.92, (index + random()) / Math.max(count, 1)),
      coreRadius: lerp(minCoreRadius, maxCoreRadius, random()),
      twinkleMs: Math.round(lerp(minTwinkleMs, maxTwinkleMs, random())),
      phase: random(),
      intensity: lerp(0.6, 1, random()),
      flares: random() < flareShare,
      tone: pickStarTone(random(), accentShare, warmShare),
    });
  }
  return stars;
}

export interface ShootingStar {
  id: string;
  /** Where the head starts, as a share of the screen; always in the top half. */
  xRatio: number;
  yRatio: number;
  /** 1 crosses to the right, -1 to the left; both fall at `angleDeg`. */
  direction: 1 | -1;
  /** Wait before each pass. */
  intervalMs: number;
  /** Wait before the very first pass, so the two never start together. */
  firstDelayMs: number;
}

export function buildShootingStars(spec: AmbientParticlesSpec, seed = 1969): ShootingStar[] {
  if (!spec.enabled) {
    return [];
  }
  const random = createRandom(seed);
  const { count, minIntervalMs, maxIntervalMs } = spec.shootingStars;
  const stars: ShootingStar[] = [];
  for (let index = 0; index < count; index += 1) {
    const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
    const intervalMs = Math.round(lerp(minIntervalMs, maxIntervalMs, random()));
    stars.push({
      id: `shooting-star-${index}`,
      // A rightward star starts on the left and a leftward one on the right.
      xRatio: direction === 1 ? lerp(0.05, 0.45, random()) : lerp(0.55, 0.95, random()),
      yRatio: lerp(0.06, 0.4, random()),
      direction,
      intervalMs,
      firstDelayMs: Math.round(lerp(0.25, 1, random()) * intervalMs) + index * minIntervalMs * 0.5,
    });
  }
  return stars;
}
