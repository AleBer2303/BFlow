/**
 * Ambient particles behind the workspace (DESIGN.md §6.6): deterministic layout, a few faint
 * dots on iOS, Android and Web, no touch, still with Reduce Motion, and the loops
 * stop while the app is in the background.
 */

let mockReducedMotion = false;

jest.mock('../motion/motionRuntime', () => {
  const actual = jest.requireActual<typeof import('../motion/motionRuntime')>(
    '../motion/motionRuntime'
  );
  return {
    ...actual,
    IS_MOTION_STATIC: false,
    // The JS driver, so the test can read the frames (the native one never reports them to JS).
    USE_NATIVE_DRIVER: false,
  };
});

jest.mock('../platform/useReducedMotionPreference', () => ({
  useReducedMotionPreference: () => mockReducedMotion,
}));

import React from 'react';
import { AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AmbientParticles } from '../components/AmbientParticles';
import {
  buildAmbientParticles,
  buildAmbientStars,
  buildShootingStars,
  resolveAmbientParticleCount,
} from '../motion/ambientParticles';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import { ambientParticlesBySkin, type PlatformSkinId } from '../tokens';

const SPEC = ambientParticlesBySkin.ios;
/** A skin with the particles switched off (`enabled: false`). */
const DISABLED = { ...SPEC, enabled: false };

function renderParticles(skin: PlatformSkinId) {
  const view = render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <AmbientParticles />
    </BFlowThemeProvider>
  );
  const layer = screen.queryByTestId('ambient-particles', { includeHiddenElements: true });
  if (layer) {
    fireEvent(layer, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    // The galaxy waits for the first paint before it mounts.
    act(() => {
      jest.advanceTimersByTime(SPEC.startDelayMs);
    });
  }
  return view;
}

function dotStyle(id = 'ambient-particle-0') {
  return StyleSheet.flatten(
    screen.getByTestId(id, { includeHiddenElements: true }).props.style
  ) as { opacity: number; transform?: Array<Record<string, number>> };
}

describe('ambient particle layout', () => {
  it('is deterministic and stays on screen', () => {
    const first = buildAmbientParticles(SPEC, 20);
    expect(buildAmbientParticles(SPEC, 20)).toEqual(first);
    expect(buildAmbientParticles(SPEC, 20, 7)).not.toEqual(first);
    for (const particle of first) {
      expect(particle.xRatio).toBeGreaterThanOrEqual(0.04);
      expect(particle.xRatio).toBeLessThanOrEqual(0.96);
      expect(particle.yRatio).toBeGreaterThanOrEqual(0.06);
      expect(particle.yRatio).toBeLessThanOrEqual(0.96);
      expect(particle.radius).toBeGreaterThanOrEqual(SPEC.minRadius);
      expect(particle.radius).toBeLessThanOrEqual(SPEC.maxRadius);
      expect(particle.cycleMs).toBeGreaterThanOrEqual(SPEC.minCycleMs);
      expect(particle.cycleMs).toBeLessThanOrEqual(SPEC.maxCycleMs);
      expect(Math.abs(particle.sway)).toBeLessThanOrEqual(SPEC.swayDistance);
    }
    expect(new Set(first.map((particle) => particle.tone))).toEqual(new Set(['accent', 'ink']));
  });

  it('spreads the dots over the whole height', () => {
    const particles = buildAmbientParticles(SPEC, 10);
    const bands = new Set(particles.map((particle) => Math.floor(particle.yRatio * 4)));
    expect(bands.size).toBe(4);
  });

  it('adds dots on bigger screens up to the cap, and none without a size or when switched off', () => {
    expect(resolveAmbientParticleCount(SPEC, 390, 844)).toBe(SPEC.count);
    expect(resolveAmbientParticleCount(SPEC, 1024, 1366)).toBeGreaterThan(SPEC.count);
    expect(resolveAmbientParticleCount(SPEC, 4000, 4000)).toBe(SPEC.maxCount);
    expect(resolveAmbientParticleCount(SPEC, 0, 844)).toBe(0);
    expect(resolveAmbientParticleCount(DISABLED, 390, 844)).toBe(0);
    expect(buildAmbientParticles(SPEC, -3)).toEqual([]);
  });
});

describe('star and shooting star layout', () => {
  it('places twinkling stars over the whole screen, none when switched off', () => {
    const stars = buildAmbientStars(SPEC);
    expect(stars).toHaveLength(SPEC.stars.count);
    expect(buildAmbientStars(SPEC)).toEqual(stars);
    for (const star of stars) {
      expect(star.coreRadius).toBeGreaterThanOrEqual(SPEC.stars.minCoreRadius);
      expect(star.coreRadius).toBeLessThanOrEqual(SPEC.stars.maxCoreRadius);
      expect(star.twinkleMs).toBeGreaterThanOrEqual(SPEC.stars.minTwinkleMs);
      expect(star.twinkleMs).toBeLessThanOrEqual(SPEC.stars.maxTwinkleMs);
    }
    expect(buildAmbientStars(DISABLED)).toEqual([]);
  });

  it('mixes white, cool and warm stars, and only some of them flare', () => {
    const stars = buildAmbientStars(SPEC);
    expect(new Set(stars.map((star) => star.tone))).toEqual(new Set(['white', 'accent', 'warm']));
    const flaring = stars.filter((star) => star.flares).length;
    expect(flaring).toBeGreaterThan(0);
    expect(flaring).toBeLessThan(stars.length);
  });

  it('sends shooting stars across the top half, both ways, never together', () => {
    const meteors = buildShootingStars(SPEC);
    expect(meteors).toHaveLength(SPEC.shootingStars.count);
    expect(new Set(meteors.map((meteor) => meteor.direction))).toEqual(new Set([1, -1]));
    for (const meteor of meteors) {
      expect(meteor.yRatio).toBeLessThanOrEqual(0.4);
      expect(meteor.intervalMs).toBeGreaterThanOrEqual(SPEC.shootingStars.minIntervalMs);
      expect(meteor.intervalMs).toBeLessThanOrEqual(SPEC.shootingStars.maxIntervalMs);
      // A rightward star starts on the left half, a leftward one on the right half.
      expect(meteor.direction === 1 ? meteor.xRatio < 0.5 : meteor.xRatio > 0.5).toBe(true);
    }
    const delays = meteors.map((meteor) => meteor.firstDelayMs);
    expect(new Set(delays).size).toBe(delays.length);
    expect(buildShootingStars(DISABLED)).toEqual([]);
  });
});

describe('AmbientParticles', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['ios', 'android', 'web'] as const)('draws faint, untouchable dots on %s', (skin) => {
    renderParticles(skin);
    const layer = screen.getByTestId('ambient-particles', { includeHiddenElements: true });
    expect(layer.props.pointerEvents).toBe('none');
    expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(layer.props.accessibilityElementsHidden).toBe(true);
    expect(layer.props['aria-hidden']).toBe(true);
    expect(
      screen.getAllByTestId(/^ambient-particle-\d+$/, { includeHiddenElements: true })
    ).toHaveLength(SPEC.count);

    act(() => {
      // A few seconds is enough: with fake timers every simulated millisecond is a frame.
      jest.advanceTimersByTime(2000);
    });
    for (let index = 0; index < SPEC.count; index += 1) {
      expect(dotStyle(`ambient-particle-${index}`).opacity).toBeLessThanOrEqual(
        SPEC.peakOpacity.dark
      );
    }
  });

  it('draws each star as round light (core, halo, glow), never as a cross', () => {
    renderParticles('ios');
    const star = screen.getByTestId('ambient-star-0', { includeHiddenElements: true });
    const layers = star.children
      .filter((layer) => typeof layer !== 'string')
      .map(
        (layer) =>
          StyleSheet.flatten(layer.props.style) as {
            width: number;
            height: number;
            borderRadius: number;
          }
      );
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      expect(layer.width).toBe(layer.height);
      expect(layer.borderRadius).toBe(layer.width / 2);
    }
  });

  it('twinkles and floats the stars gently', () => {
    renderParticles('ios');
    const before = dotStyle('ambient-star-0');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    const after = dotStyle('ambient-star-0');
    expect(after.opacity).not.toBe(before.opacity);
    expect(after.opacity).toBeLessThanOrEqual(SPEC.stars.peakOpacity.dark);
    const lift = Math.abs(Object.assign({}, ...(after.transform ?? [])).translateY as number);
    expect(lift).toBeLessThanOrEqual(SPEC.stars.floatDistance);
  });

  it('lets a shooting star cross after its wait, then fade out', () => {
    renderParticles('ios');
    const [meteor] = buildShootingStars(SPEC);
    if (!meteor) throw new Error('expected a shooting star');
    expect(dotStyle(meteor.id).opacity).toBe(0);
    act(() => {
      jest.advanceTimersByTime(meteor.firstDelayMs + SPEC.shootingStars.travelMs * 0.4);
    });
    const midway = dotStyle(meteor.id);
    expect(midway.opacity).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime(SPEC.shootingStars.travelMs);
    });
    expect(dotStyle(meteor.id).opacity).toBe(0);
  });

  it('waits for the first paint, then fades the galaxy in', () => {
    render(
      <BFlowThemeProvider skin="ios" initialMode="dark">
        <AmbientParticles />
      </BFlowThemeProvider>
    );
    const layer = screen.getByTestId('ambient-particles', { includeHiddenElements: true });
    fireEvent(layer, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    expect(screen.queryByTestId('ambient-particle-0', { includeHiddenElements: true })).toBeNull();
    expect(StyleSheet.flatten(layer.props.style).opacity).toBe(0);

    act(() => {
      jest.advanceTimersByTime(SPEC.startDelayMs);
    });
    expect(screen.getByTestId('ambient-particle-0', { includeHiddenElements: true })).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(
      StyleSheet.flatten(
        screen.getByTestId('ambient-particles', { includeHiddenElements: true }).props.style
      ).opacity
    ).toBe(1);
  });

  it('keeps its animated nodes when the shell re-renders', () => {
    const view = renderParticles('ios');
    const before = screen.getByTestId('ambient-particle-0', { includeHiddenElements: true }).props
      .style;
    view.rerender(
      <BFlowThemeProvider skin="ios" initialMode="dark">
        <AmbientParticles />
      </BFlowThemeProvider>
    );
    const after = screen.getByTestId('ambient-particle-0', { includeHiddenElements: true }).props
      .style;
    // Same interpolation nodes: nothing was rebuilt or restarted.
    expect(after[1]).toBe(before[1]);
  });

  it('draws nothing on a skin with the particles switched off', () => {
    const web = ambientParticlesBySkin.web;
    ambientParticlesBySkin.web = DISABLED;
    try {
      renderParticles('web');
      expect(
        screen.queryByTestId('ambient-particles', { includeHiddenElements: true })
      ).toBeNull();
    } finally {
      ambientParticlesBySkin.web = web;
    }
  });

  it('moves the dots over time', () => {
    renderParticles('ios');
    const before = dotStyle();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    const after = dotStyle();
    expect(after.transform).toBeDefined();
    expect(after.transform).not.toEqual(before.transform);
  });

  it('keeps the dots still with Reduce Motion', () => {
    mockReducedMotion = true;
    renderParticles('ios');
    const style = dotStyle();
    expect(style.transform).toBeUndefined();
    expect(style.opacity).toBeGreaterThan(0);
    expect(style.opacity).toBeLessThan(SPEC.peakOpacity.dark);
    expect(dotStyle('ambient-star-0').opacity).toBeGreaterThan(0);
    expect(
      screen.queryByTestId('shooting-star-0', { includeHiddenElements: true })
    ).toBeNull();
  });

  it('stops the loops while the app is in the background', () => {
    let listener: ((state: AppStateStatus) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      renderParticles('ios');
      act(() => listener?.('background'));
      // Paused where it was: no jump when the app returns.
      const frozen = dotStyle();
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(dotStyle()).toEqual(frozen);

      act(() => listener?.('active'));
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(dotStyle().transform).not.toEqual(frozen.transform);
    } finally {
      spy.mockRestore();
    }
  });
});
