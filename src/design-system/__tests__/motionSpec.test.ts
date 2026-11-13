/**
 * Contract of the motion scale: every skin resolves a spec, closing is never slower than
 * opening, staggers stay short and Reduce Motion removes travel and scale.
 */

import {
  resolveEntranceSpec,
  resolvePresenceSpec,
  resolveStaggerDelay,
} from '../motion/motionSpec';
import {
  MOTION_STAGGER_MAX_ITEMS,
  PLATFORM_SKIN_IDS,
  REDUCED_MOTION_DURATION_MS,
  motionBySkin,
  motionDistance,
  motionDuration,
  motionScale,
} from '../tokens';

const MAX_TOTAL_STAGGER_MS = 300;
const MAX_UI_DURATION_MS = 500;

describe('motion tokens', () => {
  it('orders the duration scale from the stagger offset to the emphasis moment', () => {
    const scale = Object.values(motionDuration);
    expect(scale).toEqual([...scale].sort((a, b) => a - b));
    expect(Math.max(...scale)).toBeLessThanOrEqual(MAX_UI_DURATION_MS);
  });

  it('keeps a full stagger under 300 ms so the last item is never late', () => {
    expect(MOTION_STAGGER_MAX_ITEMS * motionDuration.stagger).toBeLessThanOrEqual(
      MAX_TOTAL_STAGGER_MS
    );
  });

  it.each(PLATFORM_SKIN_IDS)('defines valid curves for the %s skin', (skin) => {
    const { enter, exit } = motionBySkin[skin];
    for (const [x1, , x2] of [enter, exit]) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });

  it('allows overshoot on iOS only: Android and Web never bounce', () => {
    expect(motionBySkin.ios.allowsOvershoot).toBe(true);
    expect(motionBySkin.android.allowsOvershoot).toBe(false);
    expect(motionBySkin.web.allowsOvershoot).toBe(false);
  });

  it.each(['android', 'web'] as const)('keeps the %s curves free of overshoot', (skin) => {
    const { enter, exit } = motionBySkin[skin];
    for (const [, y1, , y2] of [enter, exit]) {
      expect(y1).toBeLessThanOrEqual(1);
      expect(y2).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolveStaggerDelay', () => {
  it('offsets each item by one stagger step', () => {
    expect(resolveStaggerDelay(0)).toBe(0);
    expect(resolveStaggerDelay(1)).toBe(motionDuration.stagger);
    expect(resolveStaggerDelay(3)).toBe(3 * motionDuration.stagger);
  });

  it('caps long groups and ignores invalid positions', () => {
    const cap = MOTION_STAGGER_MAX_ITEMS * motionDuration.stagger;
    expect(resolveStaggerDelay(40)).toBe(cap);
    expect(resolveStaggerDelay(-2)).toBe(0);
    expect(resolveStaggerDelay(2.9)).toBe(2 * motionDuration.stagger);
  });
});

describe.each(PLATFORM_SKIN_IDS)('motion specs on the %s skin', (skin) => {
  const moving = { skin, reducedMotion: false };
  const reduced = { skin, reducedMotion: true };

  it('changes screens quickly and lets sections arrive with more travel', () => {
    const screen = resolveEntranceSpec(moving, 'screen');
    const section = resolveEntranceSpec(moving, 'section', 2);

    expect(screen).toMatchObject({
      durationMs: motionDuration.fast,
      distance: motionDistance.base,
      delayMs: 0,
      easing: motionBySkin[skin].enter,
    });
    expect(section).toMatchObject({
      durationMs: motionDuration.slow,
      distance: motionDistance.medium,
      delayMs: 2 * motionDuration.stagger,
    });
  });

  it('closes a dialog faster than it opens and never delays the close', () => {
    const { open, close } = resolvePresenceSpec(moving, 'dialog');

    expect(open.durationMs).toBe(motionDuration.fast);
    expect(close.durationMs).toBe(motionDuration.quick);
    expect(close.delayMs).toBe(0);
    expect(close.easing).toEqual(motionBySkin[skin].exit);
  });

  it('settles a panel card a beat after its space opens and closes it faster, at once', () => {
    const { open, close } = resolvePresenceSpec(moving, 'panel');

    expect(open).toMatchObject({
      durationMs: motionDuration.fast,
      delayMs: motionDuration.micro,
      distance: motionDistance.base,
      scale: motionScale.dialog,
    });
    expect(close).toMatchObject({ durationMs: motionDuration.quick, delayMs: 0 });
    expect(close.durationMs).toBeLessThan(open.durationMs + open.delayMs);
  });

  it('reveals a row control quickly with a short travel', () => {
    const { open, close } = resolvePresenceSpec(moving, 'control');

    expect(open).toMatchObject({
      durationMs: motionDuration.fast,
      distance: motionDistance.base,
      scale: motionScale.menu,
    });
    expect(close.durationMs).toBe(motionDuration.quick);
  });

  it('removes travel, scale and delay with Reduce Motion', () => {
    const specs = [
      resolveEntranceSpec(reduced, 'screen'),
      resolveEntranceSpec(reduced, 'section', 4),
      resolvePresenceSpec(reduced, 'dialog').open,
      resolvePresenceSpec(reduced, 'dialog').close,
      resolvePresenceSpec(reduced, 'panel').open,
      resolvePresenceSpec(reduced, 'control').close,
    ];

    for (const spec of specs) {
      expect(spec).toMatchObject({
        durationMs: REDUCED_MOTION_DURATION_MS,
        delayMs: 0,
        distance: 0,
        scale: 1,
      });
    }
  });
});

describe('dialog presentation', () => {
  it('rises as a sheet on iOS and grows in place on Android and Web', () => {
    const ios = resolvePresenceSpec({ skin: 'ios', reducedMotion: false }, 'dialog').open;
    const android = resolvePresenceSpec({ skin: 'android', reducedMotion: false }, 'dialog').open;
    const web = resolvePresenceSpec({ skin: 'web', reducedMotion: false }, 'dialog').open;

    expect(ios).toMatchObject({ distance: motionDistance.large, scale: 1 });
    expect(android).toMatchObject({ distance: 0, scale: motionScale.dialog });
    expect(web).toMatchObject({ distance: 0, scale: motionScale.dialog });
  });
});
