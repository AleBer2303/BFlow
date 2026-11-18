/**
 * Pure unit tests for `scrollKinematics.ts` and strict parity checks against every
 * UI-thread Reanimated worklet copy (`WorkspaceShell`, `ScrollDepthHero`, `ScrollRevealSection`),
 * ensuring zero divergence and full NaN safety.
 */

import {
  INITIAL_DIRECTIONAL_CHROME_STATE,
  computeHeroDepthFrame,
  computeSectionScrollFrame,
  stepDirectionalChromeState,
} from '../motion/scrollKinematics';
import { heroDepthTransformAt } from '../motion/ScrollDepthHero';
import { sectionScrollTransformAt } from '../motion/ScrollRevealSection';
import { stepDockChromeOnUI } from '../../features/shell/components/WorkspaceShell';
import { PLATFORM_SKIN_IDS, scrollMotionBySkin } from '../tokens';

describe('computeHeroDepthFrame', () => {
  it('applies subtle downward parallax and iOS-only elastic pull-down overscroll', () => {
    const iosHeroDown = computeHeroDepthFrame(90, scrollMotionBySkin.ios);
    expect(iosHeroDown.translateY).toBeCloseTo(scrollMotionBySkin.ios.heroParallaxY * 0.5, 9);
    expect(iosHeroDown.scale).toBeCloseTo(
      1 - 0.5 * (1 - scrollMotionBySkin.ios.heroMinScale),
      9
    );

    const iosPullDown = computeHeroDepthFrame(-96, scrollMotionBySkin.ios);
    expect(iosPullDown.translateY).toBeCloseTo(-scrollMotionBySkin.ios.overscrollMaxTranslateY, 9);
    expect(iosPullDown.scale).toBeGreaterThan(1);

    // Android never applies rubber-band overscroll stretching.
    const androidPullDown = computeHeroDepthFrame(-96, scrollMotionBySkin.android);
    expect(androidPullDown).toEqual({ translateY: 0, scale: 1 });

    // Web remains completely stationary.
    expect(computeHeroDepthFrame(120, scrollMotionBySkin.web)).toEqual({ translateY: 0, scale: 1 });
  });
});

describe('stepDirectionalChromeState', () => {
  const contentHeight = 2000;
  const viewportHeight = 800;

  it('requires sustained downward travel past minOffset before hiding and reveals sooner on scroll up', () => {
    const spec = scrollMotionBySkin.ios;
    let state = { ...INITIAL_DIRECTIONAL_CHROME_STATE };

    // Small initial movement near top keeps dock visible.
    state = stepDirectionalChromeState(state, 40, contentHeight, viewportHeight, spec);
    expect(state.dockHidden).toBe(false);

    // Scroll down past minOffset (48) by 20pt (< dockHideDelta 28): still visible.
    state = stepDirectionalChromeState(state, 60, contentHeight, viewportHeight, spec);
    expect(state.dockHidden).toBe(false);

    // Sub-pixel jitter (< 0.75) is ignored cleanly.
    state = stepDirectionalChromeState(state, 60.4, contentHeight, viewportHeight, spec);
    expect(state.dockHidden).toBe(false);

    // Continue scrolling down across dockHideDelta (cumulative +36 >= 28): dock hides.
    state = stepDirectionalChromeState(state, 76, contentHeight, viewportHeight, spec);
    expect(state.dockHidden).toBe(true);
    expect(state.direction).toBe(1);

    // Tiny upward jitter (6pt < dockRevealDelta 14) does not flicker the dock open.
    state = stepDirectionalChromeState(state, 70, contentHeight, viewportHeight, spec);
    expect(state.dockHidden).toBe(true);

    // Sustained upward scroll (cumulative -20 <= -14) reveals the dock cleanly.
    state = stepDirectionalChromeState(state, 56, contentHeight, viewportHeight, spec);
    expect(state.dockHidden).toBe(false);
    expect(state.direction).toBe(-1);
  });

  it('keeps the dock visible on short pages and auto-reveals near the top and bottom edges', () => {
    const spec = scrollMotionBySkin.android;

    // Short page (< dockMinOverflow 120): never hides.
    const shortState = stepDirectionalChromeState(
      { ...INITIAL_DIRECTIONAL_CHROME_STATE, dockHidden: true },
      60,
      900,
      800,
      spec
    );
    expect(shortState.dockHidden).toBe(false);

    // Near bottom (maxScroll 1200, nextY 1170 -> remaining 30 <= 48): auto-reveals.
    const bottomState = stepDirectionalChromeState(
      { lastY: 900, accumulatedDelta: 40, dockHidden: true, direction: 1 },
      1170,
      contentHeight,
      viewportHeight,
      spec
    );
    expect(bottomState.dockHidden).toBe(false);

    // Near top (nextY <= 48): auto-reveals.
    const topState = stepDirectionalChromeState(
      { lastY: 120, accumulatedDelta: 40, dockHidden: true, direction: 1 },
      40,
      contentHeight,
      viewportHeight,
      spec
    );
    expect(topState.dockHidden).toBe(false);
  });

  it('ignores overscroll rubber-band edges and disables hiding on Web or NaN inputs', () => {
    const spec = scrollMotionBySkin.ios;
    const maxScroll = contentHeight - viewportHeight;

    // Bottom overscroll preserves hidden state instead of misreading bounce-back as scroll up.
    const pastBottom = stepDirectionalChromeState(
      { lastY: maxScroll - 60, accumulatedDelta: 50, dockHidden: true, direction: 1 },
      maxScroll + 25,
      contentHeight,
      viewportHeight,
      spec
    );
    expect(pastBottom.dockHidden).toBe(true);
    expect(pastBottom.lastY).toBe(maxScroll);

    // Top overscroll resets cleanly to visible.
    const pastTop = stepDirectionalChromeState(
      { lastY: 20, accumulatedDelta: -10, dockHidden: true, direction: -1 },
      -15,
      contentHeight,
      viewportHeight,
      spec
    );
    expect(pastTop.dockHidden).toBe(false);
    expect(pastTop.lastY).toBe(0);

    // Web never hides.
    expect(
      stepDirectionalChromeState(
        INITIAL_DIRECTIONAL_CHROME_STATE,
        300,
        contentHeight,
        viewportHeight,
        scrollMotionBySkin.web
      ).dockHidden
    ).toBe(false);

    // NaN never propagates.
    expect(
      stepDirectionalChromeState(
        INITIAL_DIRECTIONAL_CHROME_STATE,
        NaN,
        contentHeight,
        viewportHeight,
        spec
      )
    ).toEqual({
      lastY: 0,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: 0,
    });
  });
});

describe('computeSectionScrollFrame', () => {
  const viewportHeight = 800;
  const contentHeight = 2200;
  const topEdgeOffset = 54;

  it('keeps initial-fold, unmeasured, NaN, and Web sections completely at rest', () => {
    const ios = scrollMotionBySkin.ios;

    // Initial fold (scrollY <= 4 and sectionTop < 0.92 * viewportHeight).
    expect(
      computeSectionScrollFrame(0, viewportHeight, contentHeight, 300, 180, topEdgeOffset, ios)
    ).toEqual({ opacity: 1, translateY: 0, scale: 1 });

    // Unmeasured or invalid dimensions.
    expect(
      computeSectionScrollFrame(200, viewportHeight, contentHeight, -1, 180, topEdgeOffset, ios)
    ).toEqual({ opacity: 1, translateY: 0, scale: 1 });
    expect(
      computeSectionScrollFrame(NaN, viewportHeight, contentHeight, 900, 180, topEdgeOffset, ios)
    ).toEqual({ opacity: 1, translateY: 0, scale: 1 });

    // Web always stays resting.
    expect(
      computeSectionScrollFrame(
        200,
        viewportHeight,
        contentHeight,
        950,
        180,
        0,
        scrollMotionBySkin.web
      )
    ).toEqual({ opacity: 1, translateY: 0, scale: 1 });
  });

  it('glides sections in from the bottom on scroll down and down from the top edge on scroll up', () => {
    const ios = scrollMotionBySkin.ios;
    const sectionTop = 1000;
    const sectionHeight = 200;

    // Partially entering from the bottom edge (scrollY = 260 -> bottom edge = 1060 -> 60pt in).
    const enteringBottom = computeSectionScrollFrame(
      260,
      viewportHeight,
      contentHeight,
      sectionTop,
      sectionHeight,
      topEdgeOffset,
      ios
    );
    expect(enteringBottom.translateY).toBeGreaterThan(0);
    expect(enteringBottom.scale).toBeLessThan(1);
    expect(enteringBottom.opacity).toBeGreaterThanOrEqual(ios.sectionBottomMinOpacity);
    expect(enteringBottom.opacity).toBeLessThan(1);

    // Centered comfortably inside the viewport: fully settled at 1 / 0 / 1.
    const settled = computeSectionScrollFrame(
      400,
      viewportHeight,
      contentHeight,
      sectionTop,
      sectionHeight,
      topEdgeOffset,
      ios
    );
    expect(settled).toEqual({ opacity: 1, translateY: 0, scale: 1 });

    // Partially scrolled past the top edge (remaining = 1200 - 1154 = 46 < 96), ready to glide down on scroll up.
    const nearTop = computeSectionScrollFrame(
      1100,
      viewportHeight,
      contentHeight,
      sectionTop,
      sectionHeight,
      topEdgeOffset,
      ios
    );
    expect(nearTop.translateY).toBeLessThan(0);
    expect(nearTop.scale).toBeLessThan(1);
    expect(nearTop.opacity).toBeGreaterThanOrEqual(ios.sectionTopMinOpacity);
  });

  it('skips scale modulation on tall sections and guarantees full settlement at the bottom edge', () => {
    const android = scrollMotionBySkin.android;

    const tallSection = computeSectionScrollFrame(
      260,
      viewportHeight,
      contentHeight,
      1000,
      560,
      0,
      android
    );
    expect(tallSection.scale).toBe(1);
    expect(tallSection.translateY).toBeGreaterThan(0);

    // At the bottom of the scroll view (scrollY === maxScroll = 1400), even a trailing section
    // whose top is near the viewport floor settles to 1 / 0 / 1.
    const bottomFinal = computeSectionScrollFrame(
      1400,
      viewportHeight,
      contentHeight,
      2160,
      120,
      0,
      android
    );
    expect(bottomFinal).toEqual({ opacity: 1, translateY: 0, scale: 1 });
  });
});

describe('UI-thread worklet parity with pure scrollKinematics', () => {
  it.each(PLATFORM_SKIN_IDS)('matches reference math across all skins (%s)', (skin) => {
    const spec = scrollMotionBySkin[skin];
    const scrollSamples = [-96, -24, 0, 12, 40, 120, 400, 1100, 1400, NaN];

    for (const y of scrollSamples) {
      expect(
        heroDepthTransformAt(
          y,
          spec.enabled,
          spec.heroParallaxY,
          spec.heroMinScale,
          spec.overscrollMaxScale,
          spec.overscrollMaxTranslateY
        )
      ).toEqual(computeHeroDepthFrame(y, spec));

      for (const [top, height] of [
        [-1, 180],
        [200, 180],
        [1000, 200],
        [1000, 560],
        [2160, 120],
      ] as const) {
        expect(
          sectionScrollTransformAt(
            y,
            800,
            2200,
            top,
            height,
            54,
            spec.enabled,
            spec.sectionEntryBand,
            spec.sectionBottomTravelY,
            spec.sectionBottomScale,
            spec.sectionBottomMinOpacity,
            spec.sectionTopBand,
            spec.sectionTopTravelY,
            spec.sectionTopScale,
            spec.sectionTopMinOpacity,
            spec.sectionMaxScaleHeight
          )
        ).toEqual(computeSectionScrollFrame(y, 800, 2200, top, height, 54, spec));
      }
    }

    // Sequential state machine parity for directional dock hiding & reveal.
    let refState = { ...INITIAL_DIRECTIONAL_CHROME_STATE };
    let uiState = { ...INITIAL_DIRECTIONAL_CHROME_STATE };
    for (const nextY of [0, 30, 60, 95, 130, 129.5, 118, 102, 42, 180, 1175, 1225, -12, NaN]) {
      refState = stepDirectionalChromeState(refState, nextY, 2000, 800, spec);
      uiState = stepDockChromeOnUI(
        uiState.lastY,
        uiState.accumulatedDelta,
        uiState.dockHidden,
        uiState.direction,
        nextY,
        2000,
        800,
        spec.enabled,
        spec.dockHideDelta,
        spec.dockRevealDelta,
        spec.dockHideMinOffset,
        spec.dockMinOverflow,
        spec.dockBottomAutoReveal
      );
      expect(uiState).toEqual(refState);
    }
  });
});
