/**
 * Geometry shared by the two docks (iOS Liquid Glass lens, ADR 0030; Android flat pill, ADR 0024).
 *
 * These run on the JS thread only (Android dock, tests). They are NOT worklets: the iOS dock keeps
 * its own UI-thread copies in LiquidGlassDock.tsx, because a worklet whose default parameter reads a
 * captured variable (`tabCount = DOCK_TABS.length`) throws on the UI runtime and aborts a
 * release build such as Expo Go (ADR 0030 §5; guard: scripts/worklet-closure-guard.test.mjs).
 */

import type { BFlowWorkspaceTab } from '../../../features/budget/store/useBudgetStore';
import { liquidDockMotion } from '../../tokens';
import { WORKSPACE_TABS } from '../navigation/workspaceTabs';

export interface DockTabConfig {
  id: BFlowWorkspaceTab;
  label: string;
}

/** The dock shows the shared workspace destinations (see navigation/workspaceTabs). */
export const DOCK_TABS: ReadonlyArray<DockTabConfig> = WORKSPACE_TABS;

export const DOCK_PADDING_H = 6;
export const DOCK_MAX_WIDTH = 580;
export const LENS_MARGIN_H = 2;
export const DOCK_TAB_HEIGHT = 54;
export const DOCK_SURFACE_PADDING_V = 3;
export const DOCK_SURFACE_BORDER = 1;
/** Total outer height of the floating dock capsule (tabs + vertical padding + hairline border). */
export const DOCK_CAPSULE_HEIGHT =
  DOCK_TAB_HEIGHT + (DOCK_SURFACE_PADDING_V + DOCK_SURFACE_BORDER) * 2;
/** Distance from the bottom edge (plus `bottomInset`) where the dock rests per native skin. */
export const DOCK_BOTTOM_OFFSET = {
  ios: 24,
  android: 16,
} as const;

/** Max inner room (px) between the lens at rest and the dock's edge. */
export const LENS_EDGE_INSET = 1;
export const LENS_EDGE_ROOM = DOCK_PADDING_H + LENS_MARGIN_H - LENS_EDGE_INSET;

/**
 * Maps an absolute screen X coordinate to the corresponding dock tab index.
 * Clamps safely within [0, tabCount - 1].
 */
export function getDockIndexFromScreenX(
  screenX: number,
  dockScreenLeft: number,
  dockWidth: number,
  tabCount: number = DOCK_TABS.length,
  dockPaddingH: number = DOCK_PADDING_H
): number {
  if (!(dockWidth > 0) || tabCount <= 0 || !Number.isFinite(screenX)) return 0;
  const availableWidth = Math.max(0, dockWidth - dockPaddingH * 2);
  const tabWidth = availableWidth > 0 ? availableWidth / tabCount : 1;
  const xInTabArea = screenX - dockScreenLeft - dockPaddingH;
  const rawIndex = Math.floor(xInTabArea / tabWidth);
  return Math.max(0, Math.min(tabCount - 1, rawIndex));
}

/**
 * Maps an absolute screen X coordinate to a CONTINUOUS (fractional) lens position,
 * expressed in tab units where `i` is the center of tab `i`.
 * Clamped to [0, tabCount - 1] so the lens never leaves the dock.
 */
export function getDockLensPositionFromScreenX(
  screenX: number,
  dockScreenLeft: number,
  dockWidth: number,
  tabCount: number = DOCK_TABS.length,
  dockPaddingH: number = DOCK_PADDING_H
): number {
  if (!(dockWidth > 0) || tabCount <= 0 || !Number.isFinite(screenX)) return 0;
  const availableWidth = Math.max(0, dockWidth - dockPaddingH * 2);
  const tabWidth = availableWidth > 0 ? availableWidth / tabCount : 1;
  const xInTabArea = screenX - dockScreenLeft - dockPaddingH;
  const raw = xInTabArea / tabWidth - 0.5;
  return Math.max(0, Math.min(tabCount - 1, raw));
}

export interface LensFrameInput {
  /** Lens position in tab units (may overshoot past both ends while a spring bounces). */
  position: number;
  /** 0 at rest, 1 lifted under the finger (springs may overshoot either way). */
  lift: number;
  /** 0 still, 1 at full drag speed. */
  stretch: number;
  tabWidth: number;
  lensWidth: number;
  tabCount?: number;
}

export interface LensFrame {
  translateX: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Transform of the liquid lens for one frame (reference for the UI-thread copy in LiquidGlassDock).
 *
 * The lens swells when lifted and stretches with speed. Its travel is clamped so the lens
 * (including that growth) never crosses the dock's inner edge: a spring overshooting past the
 * first or last tab is turned into a horizontal squash against the wall, with the squashed side
 * kept flush and a small vertical bulge, like a drop of liquid pressed against a border.
 */
export function computeLensFrame({
  position,
  lift,
  stretch,
  tabWidth,
  lensWidth,
  tabCount = DOCK_TABS.length,
}: LensFrameInput): LensFrame {
  const motion = liquidDockMotion;
  // A NaN in a transform closes the app on iOS: a missing reading falls back to rest.
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(tabWidth) ||
    !Number.isFinite(lensWidth) ||
    tabWidth <= 0
  ) {
    return { translateX: 0, scaleX: 1, scaleY: 1 };
  }
  // Springs may overshoot: keep the jelly wobble, never an absurd shape.
  const l = Number.isFinite(lift) ? Math.max(-0.4, Math.min(1.4, lift)) : 0;
  const s = Number.isFinite(stretch) ? Math.max(0, Math.min(1, stretch)) : 0;
  const baseScaleX = (1 + (motion.liftScaleX - 1) * l) * (1 + motion.stretchScaleX * s);
  const baseScaleY = (1 + (motion.liftScaleY - 1) * l) * (1 - motion.stretchScaleY * s);

  const rawX = position * tabWidth;
  const edgeGrowth = ((baseScaleX - 1) * lensWidth) / 2;
  const minX = edgeGrowth - LENS_EDGE_ROOM;
  const maxX = tabWidth * (tabCount - 1) + LENS_EDGE_ROOM - edgeGrowth;
  const pastMax = Math.max(0, rawX - maxX);
  const pastMin = Math.max(0, minX - rawX);
  const overshoot = pastMax + pastMin;
  const squash =
    overshoot > 0
      ? 1 - (1 - motion.squashMinScale) * Math.min(1, overshoot / motion.squashDistance)
      : 1;
  // Keeps the squashed side against the wall instead of floating away from it.
  const shift = ((1 - squash) * baseScaleX * lensWidth) / 2;
  const translateX =
    rawX - pastMax + pastMin + (pastMax > 0 ? shift : 0) - (pastMin > 0 ? shift : 0);

  return {
    translateX,
    scaleX: baseScaleX * squash,
    scaleY: baseScaleY * (1 + (1 - squash) * 0.6),
  };
}

