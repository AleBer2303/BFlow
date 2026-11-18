/**
 * Active-motion integration tests for UI-thread scroll choreography across iOS, Android,
 * Web, and Reduce Motion (`IS_MOTION_STATIC` mocked to `false`, matching `activeMotionRuntime.test.tsx`).
 */

jest.mock('../motion/motionRuntime', () => {
  const actual = jest.requireActual<typeof import('../motion/motionRuntime')>(
    '../motion/motionRuntime'
  );
  return {
    ...actual,
    IS_MOTION_STATIC: false,
  };
});

import React, { useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';
import * as GlassEffect from 'expo-glass-effect';
import { WorkspaceShell } from '../../features/shell/components/WorkspaceShell';
import type { BFlowWorkspaceTab } from '../../features/budget/store/useBudgetStore';
import { __resetLiquidGlassAvailabilityForTests } from '../../platform/glass/LiquidGlassMaterial.native';
import { hapticService } from '../../platform/haptics/hapticService';
import { ScrollDepthHero } from '../motion/ScrollDepthHero';
import { ScrollRevealSection } from '../motion/ScrollRevealSection';
import { BFlowThemeProvider } from '../theme/ThemeContext';
import type { PlatformSkinId } from '../tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getAnimatedStyle } = require('react-native-reanimated') as {
  getAnimatedStyle: (element: unknown) => Record<string, unknown>;
};

const transformOf = (style: Record<string, unknown>) =>
  Object.assign({}, ...((style.transform as Array<Record<string, number>>) ?? [])) as Record<
    string,
    number
  >;

function Harness({
  skin,
  initialTab = 'summary',
}: {
  skin: PlatformSkinId;
  initialTab?: BFlowWorkspaceTab;
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<BFlowWorkspaceTab>(initialTab);
  return (
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <WorkspaceShell
        monthLabel="Octubre 2026"
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        showNavigation
      >
        <ScrollDepthHero testID="hero-depth-wrapper">
          <View testID="hero-card-inner" style={{ height: 180 }}>
            <Text>Hero Card</Text>
          </View>
        </ScrollDepthHero>
        <ScrollRevealSection testID="reveal-section-wrapper">
          <View testID="reveal-section-inner" style={{ height: 200 }}>
            <Text>Section Card</Text>
          </View>
        </ScrollRevealSection>
        <View style={{ height: 1800 }} />
      </WorkspaceShell>
    </BFlowThemeProvider>
  );
}

function advanceFrames(ms = 400): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function dispatchScroll(y: number, contentHeight = 2200, viewportHeight = 800): void {
  const scrollView = screen.UNSAFE_getByType(ScrollView);
  const payload = {
    nativeEvent: {
      contentOffset: { x: 0, y },
      layoutMeasurement: { width: 390, height: viewportHeight },
      contentSize: { width: 390, height: contentHeight },
    },
  };
  act(() => {
    fireEvent.scroll(scrollView, payload);
  });
  advanceFrames(320);
}

describe('active UI-thread scroll choreography across skins', () => {
  let scrollToSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    scrollToSpy = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    (GlassEffect.isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
    (GlassEffect.isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    __resetLiquidGlassAvailabilityForTests();
  });

  it('retracts & spring-reveals iOS dock, drives hero/section transforms, and renders no sticky header or progress bar', () => {
    jest.spyOn(GlassEffect, 'isLiquidGlassAvailable').mockReturnValue(true);
    jest.spyOn(GlassEffect, 'isGlassEffectAPIAvailable').mockReturnValue(true);
    __resetLiquidGlassAvailabilityForTests();

    const selectionSpy = jest.spyOn(hapticService, 'selection').mockImplementation(() => undefined);

    render(<Harness skin="ios" />);
    advanceFrames(64);

    // No fixed top header or progress bar is rendered at rest.
    expect(
      screen.queryByTestId('workspace-scroll-header', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      screen.queryByTestId('workspace-scroll-progress-bar', { includeHiddenElements: true })
    ).toBeNull();

    // Layout the ScrollView + ScrollRevealSection below initial fold (y = 1000).
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    act(() => {
      fireEvent(scrollView, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } },
      });
      fireEvent(scrollView, 'contentSizeChange', 390, 2200);
      fireEvent(screen.getByTestId('reveal-section-wrapper'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 1000, width: 358, height: 200 } },
      });
    });

    // Pull-down elastic overscroll on iOS stretches hero slightly above 1.
    dispatchScroll(-48);
    expect(transformOf(getAnimatedStyle(screen.getByTestId('hero-depth-wrapper'))).scale).toBeGreaterThan(1);

    // Scroll down progressively past dock hide threshold (28 after 48).
    dispatchScroll(30);
    dispatchScroll(60);
    dispatchScroll(180);

    expect(
      screen.queryByTestId('workspace-scroll-header', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      screen.queryByTestId('workspace-scroll-progress-bar', { includeHiddenElements: true })
    ).toBeNull();

    // Dock retracts via translateY + subtle scale ONLY (never animates opacity on GlassView).
    const hiddenDockStyle = getAnimatedStyle(screen.getByTestId('liquid-glass-tab-bar'));
    expect(hiddenDockStyle.opacity).toBeUndefined();
    expect(transformOf(hiddenDockStyle).translateY).toBeGreaterThan(0);
    expect(transformOf(hiddenDockStyle).scale).toBeLessThan(1);

    // Hero recedes subtly on scroll down.
    const heroDown = transformOf(getAnimatedStyle(screen.getByTestId('hero-depth-wrapper')));
    expect(heroDown.translateY).toBeGreaterThan(0);
    expect(heroDown.scale).toBeLessThan(1);

    // Reveal section gliding in from bottom edge at y = 250 -> settles cleanly at y = 450 ->
    // partially scrolled past the top edge at y = 1150 so scrolling up glides it down smoothly.
    dispatchScroll(250);
    const enteringSectionStyle = getAnimatedStyle(screen.getByTestId('reveal-section-wrapper'));
    expect(enteringSectionStyle.opacity as number).toBeGreaterThanOrEqual(0.82);
    expect(enteringSectionStyle.opacity as number).toBeLessThan(1);
    expect(transformOf(enteringSectionStyle).translateY).toBeGreaterThan(0);

    dispatchScroll(450);
    const settledSectionStyle = getAnimatedStyle(screen.getByTestId('reveal-section-wrapper'));
    expect(settledSectionStyle.opacity).toBe(1);
    expect(transformOf(settledSectionStyle).translateY).toBe(0);

    dispatchScroll(1150);
    const topEdgeSectionStyle = getAnimatedStyle(screen.getByTestId('reveal-section-wrapper'));
    expect(transformOf(topEdgeSectionStyle).translateY).toBeLessThan(0);

    // Scrolling up reveals the iOS dock smoothly via spring.
    dispatchScroll(1120);
    expect(
      transformOf(getAnimatedStyle(screen.getByTestId('liquid-glass-tab-bar'))).translateY
    ).toBeCloseTo(0, 2);

    // Re-tapping active dock tab when scrolled down triggers scroll-to-top with selection haptic.
    scrollToSpy.mockClear();
    selectionSpy.mockClear();
    dispatchScroll(240);
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));
    expect(scrollToSpy).toHaveBeenCalledWith({ y: 0, animated: true });
    expect(selectionSpy).toHaveBeenCalledTimes(1);
  });

  it('saves and restores per-tab scroll position and reveals the dock when switching tabs', () => {
    render(<Harness skin="ios" />);
    advanceFrames(64);

    dispatchScroll(40);
    dispatchScroll(180);
    scrollToSpy.mockClear();

    // Switch to checklist: outgoing scrollY (180) is saved; checklist opens at 0 and reveals dock.
    fireEvent(screen.getByTestId('workspace-tab-checklist'), 'pressIn');
    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    advanceFrames(320);

    expect(scrollToSpy).toHaveBeenCalledWith({ y: 0, animated: false });
    expect(
      transformOf(getAnimatedStyle(screen.getByTestId('liquid-glass-tab-bar'))).translateY
    ).toBeCloseTo(0, 2);

    // Switch back to summary: restores saved offset (180) on both ScrollView and shared choreography state.
    scrollToSpy.mockClear();
    fireEvent(screen.getByTestId('workspace-tab-summary'), 'pressIn');
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));
    advanceFrames(320);

    expect(scrollToSpy).toHaveBeenCalledWith({ y: 180, animated: false });
    expect(transformOf(getAnimatedStyle(screen.getByTestId('hero-depth-wrapper'))).translateY).toBeGreaterThan(0);
  });

  it('uses zero BlurView, renders no sticky header or progress bar, and retracts/reveals the flat Android dock', () => {
    render(<Harness skin="android" />);
    advanceFrames(64);

    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    expect(
      screen.queryByTestId('workspace-scroll-header', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      screen.queryByTestId('workspace-scroll-progress-bar', { includeHiddenElements: true })
    ).toBeNull();

    // Scroll down past hide threshold.
    dispatchScroll(40);
    dispatchScroll(180);

    expect(
      screen.queryByTestId('workspace-scroll-header', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      screen.queryByTestId('workspace-scroll-progress-bar', { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);

    const retractedDock = getAnimatedStyle(screen.getByTestId('liquid-glass-tab-bar-scroll-frame'));
    expect(transformOf(retractedDock).translateY).toBeGreaterThan(0);
    expect(transformOf(retractedDock).scale).toBeLessThan(1);

    // Scroll up reveals the Android dock back to resting position.
    dispatchScroll(150);
    const revealedDock = getAnimatedStyle(screen.getByTestId('liquid-glass-tab-bar-scroll-frame'));
    expect(transformOf(revealedDock).translateY).toBeCloseTo(0, 2);
    expect(transformOf(revealedDock).scale).toBeCloseTo(1, 3);
  });

  it('keeps Web completely free of scroll choreography, sticky header, progress bar, and wrappers', () => {
    render(<Harness skin="web" />);
    advanceFrames(64);

    expect(
      screen.queryByTestId('workspace-scroll-header', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      screen.queryByTestId('workspace-scroll-progress-bar', { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.queryByTestId('hero-depth-wrapper')).toBeNull();
    expect(screen.queryByTestId('reveal-section-wrapper')).toBeNull();
    expect(screen.getByTestId('hero-card-inner')).toBeTruthy();
    expect(screen.getByTestId('reveal-section-inner')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
  });

  it('disables all scroll choreography when system Reduce Motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    render(<Harness skin="ios" />);
    await act(async () => {
      await Promise.resolve();
    });
    advanceFrames(64);

    // With Reduce Motion on, hero & section wrappers are bypassed and dock stays stationary.
    expect(screen.queryByTestId('hero-depth-wrapper')).toBeNull();
    expect(screen.queryByTestId('reveal-section-wrapper')).toBeNull();
    expect(screen.getByTestId('hero-card-inner')).toBeTruthy();
    expect(screen.getByTestId('reveal-section-inner')).toBeTruthy();

    dispatchScroll(180);
    expect(
      screen.queryByTestId('workspace-scroll-header', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      screen.queryByTestId('workspace-scroll-progress-bar', { includeHiddenElements: true })
    ).toBeNull();
    expect(
      transformOf(getAnimatedStyle(screen.getByTestId('liquid-glass-tab-bar'))).translateY
    ).toBe(0);
  });
});
