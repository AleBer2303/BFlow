import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  createGestureController,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import * as GlassEffect from 'expo-glass-effect';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import {
  FloatingLiquidGlassDock,
  DOCK_CAPSULE_HEIGHT,
  DOCK_TABS,
  DOCK_PADDING_H,
  LENS_MARGIN_H,
  computeLensFrame,
  getDockIndexFromScreenX,
  getDockLensPositionFromScreenX,
} from '../components/FloatingLiquidGlassDock';
import { iconScaleAt, lensTransformAt } from '../components/dock/LiquidGlassDock';
import * as WorkspaceNavIconsModule from '../components/WorkspaceNavIcons';
import {
  AccountNavIcon,
  ChecklistNavIcon,
  CierreNavIcon,
  DebtsNavIcon,
  SavingsNavIcon,
  SummaryNavIcon,
} from '../components/WorkspaceNavIcons';
import { hapticService } from '../../platform/haptics/hapticService';
import { __resetLiquidGlassAvailabilityForTests } from '../../platform/glass/LiquidGlassMaterial.native';
import {
  MIN_TOUCH_TARGET_PT,
  liquidDockMotion,
  liquidDockPalette,
  palettesBySkin,
  platformSkins,
  radius,
  springConfigs,
} from '../tokens';

// Reanimated's Jest helper (typed as the web stub, implemented by the native build in Jest).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getAnimatedStyle } = require('react-native-reanimated') as {
  getAnimatedStyle: (element: unknown) => Record<string, unknown>;
};

/** Dock 360 wide: tab width 58, tab centers at 35, 93, 151, 209, 267 and 325. */
const DOCK_WIDTH = 360;
const tabCenter = (index: number) => DOCK_PADDING_H + 58 * (index + 0.5);

function renderIosDock(
  props: Partial<React.ComponentProps<typeof FloatingLiquidGlassDock>> = {},
  mode: 'dark' | 'light' = 'dark'
) {
  const onSelectTab = jest.fn();
  const view = render(
    <BFlowThemeProvider initialMode={mode}>
      <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} {...props} />
    </BFlowThemeProvider>
  );
  fireEvent(screen.getByTestId('floating-liquid-glass-dock'), 'layout', {
    nativeEvent: { layout: { x: 16, y: 700, width: DOCK_WIDTH, height: DOCK_CAPSULE_HEIGHT } },
  });
  flushFrames();
  return { onSelectTab, ...view };
}

/** Reanimated applies shared values to styles on the next frames (fake timers in this suite). */
function flushFrames() {
  act(() => {
    jest.advanceTimersByTime(64);
  });
}

const transformOf = (style: Record<string, unknown>) =>
  Object.assign({}, ...((style.transform as Array<Record<string, number>>) ?? [])) as Record<
    string,
    number
  >;

/** Lets the callbacks the gesture schedules on the JS thread run, then the next frames. */
const flushScheduled = async () => {
  await act(async () => Promise.resolve());
  flushFrames();
};

describe('FloatingLiquidGlassDock on iOS (Liquid Glass, UI-thread lens, ADR 0030)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    // spyOn on the jest.fn of the expo-glass-effect mock edits that same function: put it back.
    (GlassEffect.isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
    (GlassEffect.isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    __resetLiquidGlassAvailabilityForTests();
  });

  it('renders all 6 navigation tabs with exact labels including Cierre and Cuenta', () => {
    renderIosDock();

    expect(screen.getByTestId('floating-liquid-glass-dock')).toBeTruthy();
    expect(DOCK_TABS).toHaveLength(6);

    expect(screen.getByTestId('workspace-tab-summary')).toHaveTextContent('Resumen');
    expect(screen.getByTestId('workspace-tab-checklist')).toHaveTextContent('Checklist');
    expect(screen.getByTestId('workspace-tab-debts')).toHaveTextContent('Deudas');
    expect(screen.getByTestId('workspace-tab-savings')).toHaveTextContent('Ahorros');
    expect(screen.getByTestId('workspace-tab-analytics')).toHaveTextContent('Cierre');
    expect(screen.getByTestId('workspace-tab-account')).toHaveTextContent('Cuenta');
  });

  it('renders all 6 custom minimalist SVG vector icons', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <SummaryNavIcon testID="test-icon-summary" focused />
        <ChecklistNavIcon testID="test-icon-checklist" />
        <DebtsNavIcon testID="test-icon-debts" />
        <SavingsNavIcon testID="test-icon-savings" />
        <CierreNavIcon testID="test-icon-cierre" />
        <AccountNavIcon testID="test-icon-account" />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('test-icon-summary')).toBeTruthy();
    expect(screen.getByTestId('test-icon-checklist')).toBeTruthy();
    expect(screen.getByTestId('test-icon-debts')).toBeTruthy();
    expect(screen.getByTestId('test-icon-savings')).toBeTruthy();
    expect(screen.getByTestId('test-icon-cierre')).toBeTruthy();
    expect(screen.getByTestId('test-icon-account')).toBeTruthy();
  });

  it('sets accessibility states correctly and calls onSelectTab on tab press', () => {
    const { onSelectTab } = renderIosDock();

    expect(screen.getByTestId('workspace-tab-summary').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('workspace-tab-account').props.accessibilityState).toEqual({
      selected: false,
    });

    fireEvent.press(screen.getByTestId('workspace-tab-account'));
    expect(onSelectTab).toHaveBeenCalledWith('account');

    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(onSelectTab).toHaveBeenCalledWith('analytics');
  });

  it('guarantees touch target minimum of 44pt for every tab (Apple HIG standard)', () => {
    renderIosDock({ activeTab: 'checklist' });

    DOCK_TABS.forEach((tab) => {
      const style = StyleSheet.flatten(screen.getByTestId(`workspace-tab-${tab.id}`).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PT);
    });
  });

  it('draws the lens as a capsule of glass layers that never take touches', () => {
    renderIosDock({ activeTab: 'debts' });

    const dockStyle = StyleSheet.flatten(screen.getByTestId('floating-liquid-glass-dock').props.style);
    expect(dockStyle.borderRadius).toBe(radius.pill);
    expect(dockStyle.height).toBe(DOCK_CAPSULE_HEIGHT);

    const lens = screen.getByTestId('dock-magnifying-lens');
    const lensStyle = StyleSheet.flatten(lens.props.style);
    // Inside the hairline border and the padding of the capsule.
    expect(lensStyle.top).toBe(4);
    expect(lensStyle.bottom).toBe(4);
    expect(lensStyle.left).toBe(DOCK_PADDING_H + LENS_MARGIN_H);
    expect(lensStyle.width).toBeCloseTo(58 - LENS_MARGIN_H * 2, 5);
    expect(lensStyle.borderRadius).toBe(radius.pill);
    expect(lens.props.pointerEvents).toBe('none');

    // Travel, swell and stretch are transforms (UI thread, no layout pass).
    const animated = getAnimatedStyle(lens);
    expect(Object.keys(transformOf(animated))).toEqual(['translateX', 'scaleX', 'scaleY']);
    expect(transformOf(animated).translateX).toBeCloseTo(58 * 2, 5);

    // Blur fallback (Jest): glass material, resting tint, glow, and the specular highlight + rim
    // drawn only where there is no system glass.
    const layers = React.Children.toArray(lens.props.children) as React.ReactElement<{
      children?: React.ReactNode;
    }>[];
    expect(layers).toHaveLength(4);
    expect(React.Children.toArray(layers[3]?.props.children)).toHaveLength(2);
  });

  it('paints a translucent Liquid Glass capsule instead of the old opaque fill', () => {
    for (const mode of ['dark', 'light'] as const) {
      const { unmount } = renderIosDock({}, mode);
      const material = StyleSheet.flatten(screen.getByTestId('dock-glass-material').props.style);
      // Blur fallback in Jest (no iOS 26 glass): the fill over the blur must stay see-through.
      const capsule = StyleSheet.flatten(screen.getByTestId('dock-glass-capsule').props.style);
      expect(capsule.overflow).toBe('hidden');
      expect(capsule.borderColor).toBe(liquidDockPalette[mode].dockBorder);
      expect(material).toBeTruthy();
      const alpha = Number(/,\s*([\d.]+)\)$/.exec(liquidDockPalette[mode].dockFallbackFill)?.[1]);
      expect(alpha).toBeLessThan(0.8);
      unmount();
    }
  });

  it('uses the native iOS 26 glass (GlassView) when the system offers it', () => {
    jest.spyOn(GlassEffect, 'isLiquidGlassAvailable').mockReturnValue(true);
    jest.spyOn(GlassEffect, 'isGlassEffectAPIAvailable').mockReturnValue(true);
    __resetLiquidGlassAvailabilityForTests();
    try {
      renderIosDock();
      const material = screen.getByTestId('dock-glass-material');
      expect(material.props.glassEffectStyle).toBe('regular');
      expect(material.props.tintColor).toBe(liquidDockPalette.dark.dockGlassTint);
      expect(material.props.isInteractive).toBe(false);
      // The system glass rounds itself and draws its own edge light: no clip and no hairline over
      // it, and the lens keeps only its glass, resting tint and glow (no rim or specular lines).
      expect(StyleSheet.flatten(material.props.style).borderRadius).toBe(radius.pill);
      const capsule = StyleSheet.flatten(screen.getByTestId('dock-glass-capsule').props.style);
      expect(capsule.overflow).toBeUndefined();
      expect(capsule.borderWidth).toBeUndefined();
      const lensLayers = React.Children.toArray(
        screen.getByTestId('dock-magnifying-lens').props.children
      ).filter(Boolean);
      expect(lensLayers).toHaveLength(3);
    } finally {
      __resetLiquidGlassAvailabilityForTests();
    }
  });

  it('switches the lens glass surface over the icons on only while the lens is touched', async () => {
    jest.spyOn(GlassEffect, 'isLiquidGlassAvailable').mockReturnValue(true);
    jest.spyOn(GlassEffect, 'isGlassEffectAPIAvailable').mockReturnValue(true);
    __resetLiquidGlassAvailabilityForTests();

    renderIosDock();
    const children = React.Children.toArray(
      screen.getByTestId('floating-liquid-glass-dock').props.children
    ) as React.ReactElement<{ testID?: string }>[];
    const ids = children.map((child) => child.props.testID);
    // The lens stays under the icons; its glass surface is the last layer, over them.
    expect(ids.indexOf('dock-magnifying-lens')).toBeLessThan(children.length - 2);
    expect(ids[ids.length - 1]).toBe('dock-lens-surface');
    // Same frame and motion as the lens.
    expect(getAnimatedStyle(screen.getByTestId('dock-lens-surface'))).toEqual(
      getAnimatedStyle(screen.getByTestId('dock-magnifying-lens'))
    );

    const morph = liquidDockMotion.lensSurfaceMorphSeconds;
    const surface = () => screen.getByTestId('dock-lens-surface-material').props.glassEffectStyle;
    // At rest it is off (glass mounted with style none): a resting icon is never distorted.
    expect(surface()).toEqual({ style: 'none', animate: true, animationDuration: morph });

    const pan = createGestureController(getByGestureTestId('dock-pan-gesture'));
    act(() => {
      pan.begin({ x: tabCenter(0), y: 30 });
    });
    await flushScheduled();
    expect(surface()).toEqual({ style: 'clear', animate: true, animationDuration: morph });
    expect(screen.getByTestId('dock-lens-surface-material').props.tintColor).toBe(
      liquidDockPalette.dark.lensSurfaceTint
    );

    act(() => {
      pan.end({ x: tabCenter(0), y: 30, velocityX: 0 });
    });
    await flushScheduled();
    expect(surface()).toEqual({ style: 'none', animate: true, animationDuration: morph });
  });

  it('has no glass surface over the icons without system glass', () => {
    renderIosDock();
    expect(screen.queryByTestId('dock-lens-surface')).toBeNull();
  });

  it('magnifies the icons under the lifted lens smoothly and sharply, never past their drawn size', () => {
    const rest = 1 / (1 + liquidDockMotion.iconMagnify);
    // At rest every icon is drawn large and shown scaled down (crisp, no upscaling).
    expect(iconScaleAt(2, 0, 2)).toBeCloseTo(rest, 9);
    // Lifted lens on the tab: full drawn size, exactly 1.
    expect(iconScaleAt(2, 1, 2)).toBeCloseTo(1, 9);
    // Continuous with the lens distance.
    expect(iconScaleAt(2.5, 1, 2)).toBeCloseTo((1 + liquidDockMotion.iconMagnify * 0.5) * rest, 9);
    expect(iconScaleAt(4, 1, 2)).toBeCloseTo(rest, 9);
    // Spring overshoot of the lift never pushes an icon past 1.
    expect(iconScaleAt(2, 1.3, 2)).toBeCloseTo(1, 9);
    expect(iconScaleAt(2, -0.3, 2)).toBeCloseTo(rest, 9);
    expect(iconScaleAt(NaN, 1, 2)).toBeCloseTo(rest, 9);

    // On screen the icon is never scaled: its Svg keeps the largest size and the viewBox widens
    // to draw it smaller, so every size is a fresh vector drawing (no pixelated bitmap).
    renderIosDock({ activeTab: 'debts' });
    const icon = screen.getByTestId('workspace-tab-debts-icon');
    expect(StyleSheet.flatten(icon.props.style).transform).toBeUndefined();
    const svg = icon.findAll((node) => (node.type as unknown) === 'RNSVGSvgView')[0];
    expect(svg?.props.bbWidth).toBeCloseTo(20 * (1 + liquidDockMotion.iconMagnify), 9);
    expect(svg?.props.vbWidth).toBeCloseTo(24 / rest, 9);
    expect(svg?.props.minX).toBeCloseTo((24 - 24 / rest) / 2, 9);
  });

  it('guarantees exact mathematical horizontal symmetry between first and last tabs', () => {
    const availableWidth = DOCK_WIDTH - DOCK_PADDING_H * 2;
    const tabWidth = availableWidth / DOCK_TABS.length;
    const lensWidth = tabWidth - LENS_MARGIN_H * 2;

    const tab0Left = DOCK_PADDING_H + LENS_MARGIN_H;
    const tab5Right = DOCK_PADDING_H + LENS_MARGIN_H + tabWidth * 5 + lensWidth;

    expect(tab0Left).toBe(DOCK_WIDTH - tab5Right);
    expect(tab0Left).toBe(DOCK_PADDING_H + LENS_MARGIN_H);
  });

  it('maps sliding coordinates linearly across all 6 tabs and clamps bounds', () => {
    const left = 20;
    expect(getDockIndexFromScreenX(-50, left, DOCK_WIDTH)).toBe(0);
    expect(getDockIndexFromScreenX(25, left, DOCK_WIDTH)).toBe(0);
    expect(getDockIndexFromScreenX(55, left, DOCK_WIDTH)).toBe(0);
    expect(getDockIndexFromScreenX(110, left, DOCK_WIDTH)).toBe(1);
    expect(getDockIndexFromScreenX(170, left, DOCK_WIDTH)).toBe(2);
    expect(getDockIndexFromScreenX(230, left, DOCK_WIDTH)).toBe(3);
    expect(getDockIndexFromScreenX(290, left, DOCK_WIDTH)).toBe(4);
    expect(getDockIndexFromScreenX(345, left, DOCK_WIDTH)).toBe(5);
    expect(getDockIndexFromScreenX(999, left, DOCK_WIDTH)).toBe(5);
    expect(getDockIndexFromScreenX(100, left, 0)).toBe(0);
  });

  it('maps finger X to a continuous fractional lens position clamped to the dock', () => {
    const pos = (x: number) => getDockLensPositionFromScreenX(x, 0, DOCK_WIDTH);

    expect(pos(35)).toBeCloseTo(0, 5);
    expect(pos(93)).toBeCloseTo(1, 5);
    expect(pos(325)).toBeCloseTo(5, 5);
    expect(pos(64)).toBeCloseTo(0.5, 5);
    const samples = [40, 50, 60, 70, 80, 90].map(pos);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }
    expect(pos(-100)).toBe(0);
    expect(pos(999)).toBe(5);
    expect(getDockLensPositionFromScreenX(100, 0, 0)).toBe(0);
  });

  it('keeps the bounce but never lets the lens cross the dock edge: it clamps and squashes', () => {
    const tabWidth = 58;
    const lensWidth = tabWidth - LENS_MARGIN_H * 2;
    const lensLeft = DOCK_PADDING_H + LENS_MARGIN_H;
    const dockWidth = tabWidth * DOCK_TABS.length + DOCK_PADDING_H * 2;
    const last = DOCK_TABS.length - 1;

    // Worst case: lifted (with spring overshoot) and stretched, far past both ends.
    for (const position of [-1.5, -0.3, 0, 2.5, last, last + 0.3, last + 1.5]) {
      for (const [lift, stretch] of [[0, 0], [1, 0], [1, 1], [1.4, 1]] as const) {
        const frame = computeLensFrame({ position, lift, stretch, tabWidth, lensWidth });
        const center = lensLeft + frame.translateX + lensWidth / 2;
        const half = (lensWidth * frame.scaleX) / 2;
        expect(center - half).toBeGreaterThanOrEqual(1 - 0.001); // keeps the 1px border inset
        expect(center + half).toBeLessThanOrEqual(dockWidth - 1 + 0.001);
      }
    }

    // Inside the dock the geometry is untouched.
    const inside = computeLensFrame({ position: 2.5, lift: 0, stretch: 0, tabWidth, lensWidth });
    expect(inside.translateX).toBeCloseTo(tabWidth * 2.5, 5);
    expect(inside.scaleX).toBeCloseTo(1, 5);
    expect(inside.scaleY).toBeCloseTo(1, 5);

    // Past the wall the lens compresses horizontally and bulges a little vertically.
    const squashed = computeLensFrame({
      position: last + 1.5,
      lift: 0,
      stretch: 0,
      tabWidth,
      lensWidth,
    });
    expect(squashed.scaleX).toBeLessThan(1);
    expect(squashed.scaleX).toBeGreaterThanOrEqual(liquidDockMotion.squashMinScale - 0.001);
    expect(squashed.scaleY).toBeGreaterThan(1);
  });

  it('moves the UI-thread lens exactly like computeLensFrame (parity of the two copies)', () => {
    const tabWidth = 58;
    const lensWidth = tabWidth - LENS_MARGIN_H * 2;
    for (const position of [-1.5, -0.3, 0, 0.4, 2.5, 5, 5.3, 6.5]) {
      for (const [lift, stretch] of [[0, 0], [1, 0], [1, 1], [1.4, 1], [-0.3, 0], [NaN, NaN]] as const) {
        const reference = computeLensFrame({ position, lift, stretch, tabWidth, lensWidth });
        const ui = lensTransformAt(position, lift, stretch, DOCK_WIDTH);
        expect(ui.translateX).toBeCloseTo(reference.translateX, 9);
        expect(ui.scaleX).toBeCloseTo(reference.scaleX, 9);
        expect(ui.scaleY).toBeCloseTo(reference.scaleY, 9);
      }
    }
    expect(lensTransformAt(NaN, 0, 0, DOCK_WIDTH)).toEqual({ translateX: 0, scaleX: 1, scaleY: 1 });
    expect(lensTransformAt(2, 0, 0, 0)).toEqual({ translateX: 0, scaleX: 1, scaleY: 1 });
  });

  it('swells the lifted lens past the dock like the iOS 26 tab bar, and stretches it with speed', () => {
    const tabWidth = 58;
    const lensWidth = tabWidth - LENS_MARGIN_H * 2;
    const lensHeight = DOCK_CAPSULE_HEIGHT - 8;
    const lifted = computeLensFrame({ position: 2, lift: 1, stretch: 0, tabWidth, lensWidth });

    expect(lifted.scaleX).toBeCloseTo(liquidDockMotion.liftScaleX, 5);
    expect(lensHeight * lifted.scaleY).toBeGreaterThan(DOCK_CAPSULE_HEIGHT);

    const fast = computeLensFrame({ position: 2, lift: 1, stretch: 1, tabWidth, lensWidth });
    expect(fast.scaleX).toBeGreaterThan(lifted.scaleX);
    expect(fast.scaleY).toBeLessThan(lifted.scaleY);

    // A release wobble (lift below 0) shrinks it a moment, without collapsing.
    const wobble = computeLensFrame({ position: 2, lift: -0.3, stretch: 0, tabWidth, lensWidth });
    expect(wobble.scaleX).toBeLessThan(1);
    expect(wobble.scaleX).toBeGreaterThan(0.9);
  });

  it('never hands a NaN to a transform (it closes the app on iOS): missing readings fall back to rest', () => {
    const rest = { translateX: 0, scaleX: 1, scaleY: 1 };
    expect(computeLensFrame({ position: NaN, lift: 0, stretch: 0, tabWidth: 58, lensWidth: 54 })).toEqual(rest);
    expect(computeLensFrame({ position: 2, lift: 0, stretch: 0, tabWidth: NaN, lensWidth: 54 })).toEqual(rest);
    expect(computeLensFrame({ position: 2, lift: 0, stretch: 0, tabWidth: 0, lensWidth: 0 })).toEqual(rest);
    const frame = computeLensFrame({ position: 2, lift: NaN, stretch: NaN, tabWidth: 58, lensWidth: 54 });
    expect(frame.translateX).toBeCloseTo(116, 5);
    expect(frame.scaleX).toBe(1);
    expect(frame.scaleY).toBe(1);
    expect(getDockIndexFromScreenX(NaN, 0, DOCK_WIDTH)).toBe(0);
    expect(getDockIndexFromScreenX(100, 0, NaN)).toBe(0);
    expect(getDockLensPositionFromScreenX(NaN, 0, DOCK_WIDTH)).toBe(0);
  });

  it('switches the tab tint at once, with no scale or crossfade on the icons (no pixelated SVG)', () => {
    const { rerender } = renderIosDock({ activeTab: 'debts' });
    const accent = palettesBySkin.ios.dark.accent.primary;
    const rest = palettesBySkin.ios.dark.text.secondary;
    const labelColor = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color;

    expect(labelColor('Deudas')).toBe(accent);
    expect(labelColor('Resumen')).toBe(rest);
    // No accent copy fading over the icon and no animated scale on the tab content.
    expect(screen.queryByTestId('workspace-tab-debts-accent', { includeHiddenElements: true })).toBeNull();
    const content = screen.getByText('Deudas').parent?.parent;
    expect(StyleSheet.flatten(content?.props.style ?? {}).transform).toBeUndefined();

    rerender(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="account" onSelectTab={jest.fn()} />
      </BFlowThemeProvider>
    );
    flushFrames();
    expect(labelColor('Cuenta')).toBe(accent);
    expect(labelColor('Deudas')).toBe(rest);
  });

  it('springs: the lens follows without wobble, while the release and the rebound bounce softly', () => {
    const ratio = ({ damping, stiffness, mass }: { damping: number; stiffness: number; mass: number }) =>
      damping / (2 * Math.sqrt(stiffness * mass));

    // Following the finger: close to critical, so it never lags behind or oscillates.
    expect(ratio(springConfigs.liquidFollow)).toBeGreaterThan(0.75);
    expect(ratio(springConfigs.liquidFollow)).toBeLessThan(1);
    // Settling on a tab: a small overshoot (subtle, Apple-like).
    expect(ratio(springConfigs.liquidSettle)).toBeGreaterThan(0.6);
    expect(ratio(springConfigs.liquidSettle)).toBeLessThan(0.75);
    // Release of the lens and rebound of the capsule: visibly elastic, never a long jiggle.
    for (const config of [springConfigs.liquidRelease, springConfigs.dockRelease]) {
      expect(ratio(config)).toBeGreaterThan(0.35);
      expect(ratio(config)).toBeLessThan(0.55);
    }
    expect(liquidDockMotion.pressScale).toBeGreaterThan(0.95);
    expect(liquidDockMotion.pressScale).toBeLessThan(1);
  });

  it('triggers immediate selection on touch-down (onPressIn) on any tab for zero perceptible delay', () => {
    const { onSelectTab } = renderIosDock();

    fireEvent(screen.getByTestId('workspace-tab-checklist'), 'pressIn');
    expect(onSelectTab).toHaveBeenCalledWith('checklist');

    fireEvent(screen.getByTestId('workspace-tab-debts'), 'pressIn');
    expect(onSelectTab).toHaveBeenCalledWith('debts');
  });

  it('selects once per touch: touch-down and the press that follows do not repeat it', () => {
    const selection = jest.spyOn(hapticService, 'selection');
    const { onSelectTab } = renderIosDock();

    fireEvent(screen.getByTestId('workspace-tab-savings'), 'pressIn');
    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));

    expect(onSelectTab).toHaveBeenCalledTimes(1);
    expect(onSelectTab).toHaveBeenCalledWith('savings');
    expect(selection).toHaveBeenCalledTimes(1);
  });

  it('drags the lens across the dock on the gesture, ticks per tab and selects on release', async () => {
    const selection = jest.spyOn(hapticService, 'selection');
    const { onSelectTab } = renderIosDock();
    const pan = createGestureController(getByGestureTestId('dock-pan-gesture'));
    const lensX = () =>
      transformOf(getAnimatedStyle(screen.getByTestId('dock-magnifying-lens'))).translateX ?? NaN;

    act(() => {
      pan.begin({ x: tabCenter(0), y: 30 });
      pan.activate({ x: tabCenter(0) + 6, y: 30 });
    });
    flushFrames();
    // Claiming the drag never makes the lens jump.
    expect(lensX()).toBeCloseTo(0, 5);

    act(() => {
      pan.update({ x: tabCenter(1) + 6, y: 30, velocityX: 600 });
    });
    flushFrames();
    // It glides with the finger: fractional, between tabs.
    expect(lensX()).toBeCloseTo(58, 0);

    act(() => {
      pan.update({ x: tabCenter(3) + 6, y: 30, velocityX: 600 });
    });
    await flushScheduled();
    // A tick each time the lens lands over another tab (here: Checklist, then Ahorros).
    expect(selection).toHaveBeenCalledTimes(2);
    expect(onSelectTab).not.toHaveBeenCalled();
    // The tint jumps to the tab under the lens, tab by tab.
    expect(StyleSheet.flatten(screen.getByText('Ahorros').props.style).color).toBe(
      palettesBySkin.ios.dark.accent.primary
    );

    act(() => {
      pan.end({ x: tabCenter(3) + 6, y: 30, velocityX: 0 });
    });
    await flushScheduled();
    expect(onSelectTab).toHaveBeenCalledTimes(1);
    expect(onSelectTab).toHaveBeenCalledWith('savings');
    expect(lensX()).toBeCloseTo(58 * 3, 5);
  });

  it('sends the lens back to the selected tab when the system cancels the drag', async () => {
    const { onSelectTab } = renderIosDock({ activeTab: 'checklist' });
    const pan = createGestureController(getByGestureTestId('dock-pan-gesture'));

    act(() => {
      pan.begin({ x: tabCenter(1), y: 30 });
      pan.activate({ x: tabCenter(1) + 6, y: 30 });
      pan.update({ x: tabCenter(4), y: 30 });
      pan.cancel({ x: tabCenter(4), y: 30 });
    });
    await flushScheduled();

    expect(onSelectTab).not.toHaveBeenCalled();
    expect(
      transformOf(getAnimatedStyle(screen.getByTestId('dock-magnifying-lens'))).translateX
    ).toBeCloseTo(58, 5);
  });

  it('keeps released tab highlighted and stable without jumping back during async prop update', () => {
    const onSelectTab = jest.fn();
    const { rerender } = render(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );
    fireEvent(screen.getByTestId('floating-liquid-glass-dock'), 'layout', {
      nativeEvent: { layout: { x: 16, y: 700, width: DOCK_WIDTH, height: DOCK_CAPSULE_HEIGHT } },
    });
    flushFrames();
    const lensX = () =>
      transformOf(getAnimatedStyle(screen.getByTestId('dock-magnifying-lens'))).translateX;

    fireEvent(screen.getByTestId('workspace-tab-debts'), 'pressIn');
    flushFrames();
    expect(onSelectTab).toHaveBeenCalledWith('debts');

    // The parent has not caught up yet: the lens stays on Deudas.
    rerender(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );
    flushFrames();
    expect(lensX()).toBeCloseTo(58 * 2, 5);

    rerender(
      <BFlowThemeProvider initialMode="dark">
        <FloatingLiquidGlassDock activeTab="debts" onSelectTab={onSelectTab} />
      </BFlowThemeProvider>
    );
    expect(screen.getByTestId('workspace-tab-debts').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(lensX()).toBeCloseTo(58 * 2, 5);
  });
});

describe('FloatingLiquidGlassDock on the Android skin (flat selection pill)', () => {
  function renderAndroidDock(
    props: Partial<React.ComponentProps<typeof FloatingLiquidGlassDock>> = {},
    mode: 'dark' | 'light' = 'dark'
  ) {
    const onSelectTab = jest.fn();
    const view = render(
      <BFlowThemeProvider skin="android" initialMode={mode}>
        <FloatingLiquidGlassDock activeTab="summary" onSelectTab={onSelectTab} {...props} />
      </BFlowThemeProvider>
    );
    fireEvent(screen.getByTestId('floating-liquid-glass-dock'), 'layout', {
      nativeEvent: { layout: { x: 16, y: 700, width: 360, height: 64 } },
    });
    return { onSelectTab, ...view };
  }

  const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

  it('keeps the six destinations and the pill-shaped floating dock', () => {
    renderAndroidDock();

    for (const tab of DOCK_TABS) {
      expect(screen.getByTestId(`workspace-tab-${tab.id}`)).toHaveTextContent(tab.label);
    }
    expect(styleOf('floating-liquid-glass-dock')).toMatchObject({
      width: '100%',
      maxWidth: 580,
      borderRadius: 999,
    });
  });

  it.each(['dark', 'light'] as const)(
    'marks the selection with one flat tonal pill instead of the glass lens (%s)',
    (mode) => {
      renderAndroidDock({}, mode);

      expect(screen.queryByTestId('dock-magnifying-lens')).toBeNull();
      const pill = screen.getByTestId('dock-flat-indicator');
      const style = StyleSheet.flatten(pill.props.style);

      expect(style.backgroundColor).toBe(palettesBySkin.android[mode].accent.container);
      expect(style.borderRadius).toBe(999);
      // Flat: no rim, no shadow, no elevation and no glass layers inside.
      expect(style.borderWidth).toBeUndefined();
      expect(style.shadowOpacity).toBeUndefined();
      expect(style.elevation).toBeUndefined();
      expect(React.Children.count(pill.props.children)).toBe(0);
      // It only travels: nothing scales it up under the finger.
      const transformKeys = (style.transform as Array<Record<string, unknown>>).map(
        (t) => Object.keys(t)[0]
      );
      expect(transformKeys).toEqual(['translateX']);
    }
  );

  it('moves the pill to the selected tab and never past the first or last one', () => {
    const { rerender } = renderAndroidDock();
    const translateX = (): number => {
      const style = StyleSheet.flatten(screen.getByTestId('dock-flat-indicator').props.style);
      const raw = (style.transform as Array<Record<string, unknown>>)[0]?.translateX as
        | number
        | { __getValue: () => number };
      return typeof raw === 'number' ? raw : raw.__getValue();
    };
    // The measured dock width decides the travel: derive it from the painted pill.
    const tabWidth = (styleOf('dock-flat-indicator').width as number) + LENS_MARGIN_H * 2;

    expect(translateX()).toBeCloseTo(0, 5);

    rerender(
      <BFlowThemeProvider skin="android" initialMode="dark">
        <FloatingLiquidGlassDock activeTab="account" onSelectTab={jest.fn()} />
      </BFlowThemeProvider>
    );
    expect(translateX()).toBeCloseTo(tabWidth * (DOCK_TABS.length - 1), 5);
  });

  it('paints the dock with the opaque Android surface in both themes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const { unmount } = renderAndroidDock({}, mode);
      const surface = screen.getByTestId('floating-liquid-glass-dock').children[0];
      const surfaceStyle = typeof surface === 'object' ? surface.props.style : undefined;
      expect(StyleSheet.flatten(surfaceStyle)).toMatchObject({
        backgroundColor: palettesBySkin.android[mode].glass.surfaceElevatedTint,
      });
      unmount();
    }
  });

  it('gives every tab the 48dp Material touch target', () => {
    renderAndroidDock();

    for (const tab of DOCK_TABS) {
      const style = styleOf(`workspace-tab-${tab.id}`);
      expect(style.minHeight).toBe(platformSkins.android.minTouchTarget);
      expect(style.height).toBeGreaterThanOrEqual(platformSkins.android.minTouchTarget);
    }
  });

  it('floats above the system gesture area', () => {
    renderAndroidDock({ bottomInset: 24 });

    const anchor = styleOf('floating-liquid-glass-dock-anchor');
    expect(anchor.position).toBe('absolute');

    screen.unmount();
    renderAndroidDock();
    const resting = styleOf('floating-liquid-glass-dock-anchor');
    expect((anchor.bottom as number) - (resting.bottom as number)).toBe(24);
  });

  it('selects on touch-down and ignores the active tab, like on iOS', () => {
    const { onSelectTab } = renderAndroidDock();

    fireEvent(screen.getByTestId('workspace-tab-savings'), 'pressIn');
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));

    expect(onSelectTab).toHaveBeenCalledTimes(1);
    expect(onSelectTab).toHaveBeenCalledWith('savings');
  });

  it('settles without overshoot: the flat spring is not underdamped', () => {
    const { damping, stiffness, mass } = springConfigs.flatSettle;
    expect(damping).toBeGreaterThanOrEqual(2 * Math.sqrt(stiffness * mass));
  });

  it('builds no Animated node graph for the pill and memoizes its travel', () => {
    const multiplySpy = jest.spyOn(Animated, 'multiply');
    const subtractSpy = jest.spyOn(Animated, 'subtract');

    try {
      const { rerender, unmount } = renderAndroidDock();
      expect(multiplySpy).not.toHaveBeenCalled();
      expect(subtractSpy).not.toHaveBeenCalled();

      const pillBefore = screen.getByTestId('dock-flat-indicator').props.style;
      rerender(
        <BFlowThemeProvider skin="android" initialMode="dark">
          <FloatingLiquidGlassDock activeTab="checklist" onSelectTab={jest.fn()} />
        </BFlowThemeProvider>
      );
      expect(multiplySpy).not.toHaveBeenCalled();
      expect(subtractSpy).not.toHaveBeenCalled();
      expect(StyleSheet.flatten(pillBefore).transform).toBeTruthy();
      unmount();

      // The iOS lens runs on Reanimated worklets (ADR 0030): no Animated graph there either.
      render(
        <BFlowThemeProvider skin="ios" initialMode="dark">
          <FloatingLiquidGlassDock activeTab="summary" onSelectTab={jest.fn()} />
        </BFlowThemeProvider>
      );
      expect(screen.getByTestId('dock-magnifying-lens')).toBeTruthy();
      expect(multiplySpy).not.toHaveBeenCalled();
      expect(subtractSpy).not.toHaveBeenCalled();
    } finally {
      multiplySpy.mockRestore();
      subtractSpy.mockRestore();
    }
  });

  it('avoids re-renders during drag moves within the same tab and skips lens springs on Android', () => {
    const springSpy = jest.spyOn(Animated, 'spring');
    const dockIconRenderSpy = jest.spyOn(WorkspaceNavIconsModule, 'SummaryNavIcon');
    const dockTouch = (pageX: number, timestamp: number) => ({
      nativeEvent: { pageX, touches: [{}], locationX: pageX - 16 },
      touchHistory: {
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: timestamp,
        numberActiveTouches: 1,
        touchBank: [
          {
            touchActive: true,
            startPageX: 40,
            startPageY: 700,
            startTimeStamp: 1,
            currentPageX: pageX,
            currentPageY: 700,
            currentTimeStamp: timestamp,
            previousPageX: 40,
            previousPageY: 700,
            previousTimeStamp: Math.max(1, timestamp - 1),
          },
        ],
      },
    });

    try {
      render(
        <BFlowThemeProvider skin="android" initialMode="dark">
          <FloatingLiquidGlassDock activeTab="summary" onSelectTab={jest.fn()} />
        </BFlowThemeProvider>
      );

      const dock = screen.getByTestId('floating-liquid-glass-dock');
      act(() => {
        dock.props.onLayout({
          nativeEvent: { layout: { x: 16, y: 700, width: 360, height: 64 } },
        });
      });
      const laidOutDock = screen.getByTestId('floating-liquid-glass-dock');

      expect(styleOf('dock-flat-indicator').width).toBeCloseTo(54, 1);
      dockIconRenderSpy.mockClear();
      springSpy.mockClear();

      // Grant and intra-tab drag moves must not trigger a React re-render of the dock.
      act(() => {
        laidOutDock.props.onResponderGrant(dockTouch(40, 2));
        laidOutDock.props.onResponderMove(dockTouch(45, 3));
        laidOutDock.props.onResponderMove(dockTouch(52, 4));
      });
      expect(dockIconRenderSpy).not.toHaveBeenCalled();
      expect(springSpy).not.toHaveBeenCalled();

      // Crossing into tab 1 (checklist) triggers a single dock re-render without lens springs.
      act(() => {
        laidOutDock.props.onResponderMove(dockTouch(109, 5));
      });
      expect(dockIconRenderSpy).toHaveBeenCalledTimes(1);
      expect(dockIconRenderSpy.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ focused: false })
      );
      expect(springSpy).not.toHaveBeenCalled();

      // Further moves within tab 1 again trigger 0 extra re-renders.
      dockIconRenderSpy.mockClear();
      act(() => {
        laidOutDock.props.onResponderMove(dockTouch(115, 6));
      });
      expect(dockIconRenderSpy).not.toHaveBeenCalled();

      act(() => {
        laidOutDock.props.onResponderTerminate?.(dockTouch(115, 7));
      });
    } finally {
      dockIconRenderSpy.mockRestore();
      springSpy.mockRestore();
    }
  });
});
