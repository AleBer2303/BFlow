/**
 * src/design-system/motion/motionSpec.ts
 *
 * Pure resolution of what a motion looks like for a platform skin and the Reduce Motion
 * setting. Components read a spec from here instead of writing durations, distances or
 * curves by hand (DESIGN.md §6.4).
 */

import {
  MOTION_STAGGER_MAX_ITEMS,
  REDUCED_MOTION_DURATION_MS,
  motionBySkin,
  motionDistance,
  motionDuration,
  motionScale,
  type CubicBezier,
  type PlatformSkinId,
} from '../tokens';

/** Reduce Motion keeps one soft opacity change (ease-out quad). */
const REDUCED_MOTION_EASING: CubicBezier = [0.5, 1, 0.89, 1];

export interface MotionContext {
  skin: PlatformSkinId;
  reducedMotion: boolean;
}

export interface TransitionSpec {
  durationMs: number;
  delayMs: number;
  /** Travel in points along the motion axis; 0 with Reduce Motion. */
  distance: number;
  /** Scale the surface starts from (or shrinks to); 1 with Reduce Motion. */
  scale: number;
  easing: CubicBezier;
}

/**
 * - `screen`: a whole view replacing another (tab change).
 * - `section`: a block of content arriving in a view that is already on screen.
 */
export type EntranceKind = 'screen' | 'section';

const ENTRANCE: Record<EntranceKind, { durationMs: number; distance: number }> = {
  screen: { durationMs: motionDuration.fast, distance: motionDistance.base },
  section: { durationMs: motionDuration.slow, distance: motionDistance.medium },
};

function reducedSpec(): TransitionSpec {
  return {
    durationMs: REDUCED_MOTION_DURATION_MS,
    delayMs: 0,
    distance: 0,
    scale: 1,
    easing: REDUCED_MOTION_EASING,
  };
}

/** Offset of the item at `index` in a staggered group; items past the cap enter together. */
export function resolveStaggerDelay(index: number): number {
  const position = Math.min(Math.max(Math.trunc(index), 0), MOTION_STAGGER_MAX_ITEMS);
  return position * motionDuration.stagger;
}

export function resolveEntranceSpec(
  { skin, reducedMotion }: MotionContext,
  kind: EntranceKind,
  index = 0
): TransitionSpec {
  if (reducedMotion) {
    return reducedSpec();
  }
  const { durationMs, distance } = ENTRANCE[kind];
  return {
    durationMs,
    delayMs: resolveStaggerDelay(index),
    distance,
    scale: 1,
    easing: motionBySkin[skin].enter,
  };
}

export interface PresenceSpec {
  open: TransitionSpec;
  /** Closing is quicker and quieter than opening, and is never delayed. */
  close: TransitionSpec;
}

/**
 * - `dialog`:  a surface over the page: a sheet rising from the bottom edge (iOS) or a card
 *              growing in place (Android, Web).
 * - `panel`:   a form or a message opening inside the page and pushing the content below.
 *              Its card settles a beat after its space starts to open (`delayMs`).
 * - `control`: a small control appearing next to its row (edit, delete).
 */
export type PresenceKind = 'dialog' | 'panel' | 'control';

interface PresenceShape {
  openMs: number;
  /** Wait before the open starts; a close never waits. */
  openDelayMs: number;
  closeMs: number;
  distance: number;
  scale: number;
}

function resolvePresenceShape(skin: PlatformSkinId, kind: PresenceKind): PresenceShape {
  if (kind === 'panel') {
    return {
      openMs: motionDuration.fast,
      openDelayMs: motionDuration.micro,
      closeMs: motionDuration.quick,
      distance: motionDistance.base,
      scale: motionScale.dialog,
    };
  }
  if (kind === 'control') {
    return {
      openMs: motionDuration.fast,
      openDelayMs: 0,
      closeMs: motionDuration.quick,
      distance: motionDistance.base,
      scale: motionScale.menu,
    };
  }
  const isSheet = motionBySkin[skin].dialogPresentation === 'sheet';
  return {
    openMs: motionDuration.fast,
    openDelayMs: 0,
    closeMs: motionDuration.quick,
    distance: isSheet ? motionDistance.large : 0,
    scale: isSheet ? 1 : motionScale.dialog,
  };
}

export function resolvePresenceSpec(
  { skin, reducedMotion }: MotionContext,
  kind: PresenceKind
): PresenceSpec {
  if (reducedMotion) {
    return { open: reducedSpec(), close: reducedSpec() };
  }
  const { openMs, openDelayMs, closeMs, distance, scale } = resolvePresenceShape(skin, kind);
  const { enter, exit } = motionBySkin[skin];
  return {
    open: { durationMs: openMs, delayMs: openDelayMs, distance, scale, easing: enter },
    close: { durationMs: closeMs, delayMs: 0, distance, scale, easing: exit },
  };
}
