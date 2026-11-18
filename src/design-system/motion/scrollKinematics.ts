/**
 * src/design-system/motion/scrollKinematics.ts
 *
 * Pure reference math for UI-thread scroll choreography across iOS and Android (ADR 0031).
 * Contains zero `'worklet'` directives and zero React/Reanimated imports so unit tests can
 * verify edge cases and UI-thread worklet copies can be parity-tested against it.
 */

import type { ScrollMotionSpec } from '../tokens';

export interface DirectionalChromeState {
  lastY: number;
  accumulatedDelta: number;
  dockHidden: boolean;
  direction: -1 | 0 | 1;
}

export const INITIAL_DIRECTIONAL_CHROME_STATE: DirectionalChromeState = {
  lastY: 0,
  accumulatedDelta: 0,
  dockHidden: false,
  direction: 0,
};

export interface HeroDepthFrame {
  translateY: number;
  scale: number;
}

export interface SectionScrollFrame {
  opacity: number;
  translateY: number;
  scale: number;
}

const JITTER_THRESHOLD_PT = 0.75;
const OVERSCROLL_PULL_RANGE_PT = 96;
const HERO_DEPTH_SCROLL_RANGE_PT = 180;
const INITIAL_FOLD_RATIO = 0.92;
const TOP_RELEASE_WINDOW_PT = 32;
const BOTTOM_RELEASE_WINDOW_PT = 40;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hero card subtle depth parallax on scroll down and gentle rubber-band expansion on iOS pull-down.
 */
export function computeHeroDepthFrame(scrollY: number, spec: ScrollMotionSpec): HeroDepthFrame {
  if (!spec.enabled || !Number.isFinite(scrollY)) {
    return { translateY: 0, scale: 1 };
  }
  if (scrollY < 0 && spec.overscrollMaxScale > 1) {
    const pull = clamp(-scrollY / OVERSCROLL_PULL_RANGE_PT, 0, 1);
    const easedPull = 1 - (1 - pull) * (1 - pull);
    return {
      translateY: -spec.overscrollMaxTranslateY * easedPull,
      scale: 1 + (spec.overscrollMaxScale - 1) * 0.7 * easedPull,
    };
  }
  const progress = clamp(scrollY / HERO_DEPTH_SCROLL_RANGE_PT, 0, 1);
  return {
    translateY: progress * spec.heroParallaxY,
    scale: 1 - progress * (1 - spec.heroMinScale),
  };
}

/**
 * Directional hysteresis state machine for hiding the floating dock on intentional scroll down
 * and revealing it on scroll up (with shorter reveal threshold and edge auto-reveal).
 */
export function stepDirectionalChromeState(
  state: DirectionalChromeState,
  nextY: number,
  contentHeight: number,
  viewportHeight: number,
  spec: ScrollMotionSpec
): DirectionalChromeState {
  if (
    !spec.enabled ||
    !Number.isFinite(nextY) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(state.lastY) ||
    !Number.isFinite(state.accumulatedDelta)
  ) {
    return {
      lastY: Number.isFinite(nextY) ? Math.max(0, nextY) : 0,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: 0,
    };
  }

  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  if (maxScroll < spec.dockMinOverflow) {
    return {
      lastY: Math.max(0, nextY),
      accumulatedDelta: 0,
      dockHidden: false,
      direction: 0,
    };
  }

  if (nextY <= 0) {
    return {
      lastY: 0,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: 0,
    };
  }

  if (nextY > maxScroll) {
    return {
      lastY: maxScroll,
      accumulatedDelta: 0,
      dockHidden: state.dockHidden,
      direction: state.direction,
    };
  }

  if (nextY <= spec.dockHideMinOffset) {
    return {
      lastY: nextY,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: -1,
    };
  }

  if (maxScroll - nextY <= spec.dockBottomAutoReveal) {
    return {
      lastY: nextY,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: state.direction,
    };
  }

  const dy = nextY - state.lastY;
  if (Math.abs(dy) < JITTER_THRESHOLD_PT) {
    return {
      ...state,
      lastY: nextY,
    };
  }

  const reversed =
    (dy > 0 && state.accumulatedDelta < 0) || (dy < 0 && state.accumulatedDelta > 0);
  const accumulatedDelta = reversed ? dy : state.accumulatedDelta + dy;

  if (accumulatedDelta >= spec.dockHideDelta) {
    return {
      lastY: nextY,
      accumulatedDelta,
      dockHidden: true,
      direction: 1,
    };
  }

  if (accumulatedDelta <= -spec.dockRevealDelta) {
    return {
      lastY: nextY,
      accumulatedDelta,
      dockHidden: false,
      direction: -1,
    };
  }

  return {
    lastY: nextY,
    accumulatedDelta,
    dockHidden: state.dockHidden,
    direction: state.direction,
  };
}

/**
 * Bidirectional scroll-driven glide for content sections entering from the bottom (scroll down)
 * or returning from the top edge of the viewport (scroll up).
 */
export function computeSectionScrollFrame(
  scrollY: number,
  viewportHeight: number,
  contentHeight: number,
  sectionTop: number,
  sectionHeight: number,
  topEdgeOffset: number,
  spec: ScrollMotionSpec
): SectionScrollFrame {
  if (
    !spec.enabled ||
    !Number.isFinite(scrollY) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(sectionTop) ||
    !Number.isFinite(sectionHeight) ||
    !Number.isFinite(topEdgeOffset) ||
    sectionTop < 0 ||
    sectionHeight <= 0 ||
    viewportHeight <= 0
  ) {
    return { opacity: 1, translateY: 0, scale: 1 };
  }

  // Initial-fold guard: sections already visible on initial screen never start shifted or dimmed.
  if (scrollY <= 4 && sectionTop < viewportHeight * INITIAL_FOLD_RATIO) {
    return { opacity: 1, translateY: 0, scale: 1 };
  }

  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const remainingBottom = Math.max(0, maxScroll - scrollY);
  const atBottomRelease =
    remainingBottom < BOTTOM_RELEASE_WINDOW_PT
      ? 1 - remainingBottom / BOTTOM_RELEASE_WINDOW_PT
      : 0;
  const rawBottom =
    spec.sectionEntryBand > 0
      ? clamp((scrollY + viewportHeight - sectionTop) / spec.sectionEntryBand, 0, 1)
      : 1;
  const bottomProgress = Math.max(rawBottom, atBottomRelease);

  const atTopRelease =
    scrollY < TOP_RELEASE_WINDOW_PT ? 1 - Math.max(0, scrollY) / TOP_RELEASE_WINDOW_PT : 0;
  const rawTop =
    spec.sectionTopBand > 0
      ? clamp((sectionTop + sectionHeight - (scrollY + topEdgeOffset)) / spec.sectionTopBand, 0, 1)
      : 1;
  const topProgress = Math.max(rawTop, atTopRelease);

  const invBottom = 1 - bottomProgress;
  const invTop = 1 - topProgress;
  const easedBottom = 1 - invBottom * invBottom * invBottom;
  const easedTop = 1 - invTop * invTop * invTop;
  const scaleWeight = sectionHeight > spec.sectionMaxScaleHeight ? 0 : 1;

  const translateY =
    (1 - easedBottom) * spec.sectionBottomTravelY - (1 - easedTop) * spec.sectionTopTravelY;
  const scale =
    1 -
    scaleWeight *
      ((1 - easedBottom) * (1 - spec.sectionBottomScale) +
        (1 - easedTop) * (1 - spec.sectionTopScale));
  const minOpacity = Math.min(spec.sectionBottomMinOpacity, spec.sectionTopMinOpacity);
  const opacity = clamp(
    1 -
      (1 - easedBottom) * (1 - spec.sectionBottomMinOpacity) -
      (1 - easedTop) * (1 - spec.sectionTopMinOpacity),
    minOpacity,
    1
  );

  return { opacity, translateY, scale };
}
