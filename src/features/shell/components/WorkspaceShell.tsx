/**
 * src/features/shell/components/WorkspaceShell.tsx
 *
 * The frame around every workspace screen: page header, scrolling content column and the
 * navigation of the active platform skin. Screens render inside it and never position
 * themselves against the window.
 *
 * | Skin    | Header                         | Navigation                              |
 * |---------|--------------------------------|-----------------------------------------|
 * | ios     | Large title + theme switch     | Floating Liquid Glass dock (overlaps)   |
 * | android | Material top app bar           | Same floating dock, flat selection pill |
 * | web     | Opaque header with a hairline  | Words in the header from 840px, else a  |
 * |         |                                | tab bar at the foot                     |
 *
 * The content column is centered and capped per skin (`useResponsiveLayout`), so a tablet, a
 * foldable or a desktop browser never gets a stretched phone layout.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import {
  Easing,
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  AccountHeaderAvatarButton,
  AmbientParticles,
  AppText,
  DOCK_BOTTOM_OFFSET,
  DOCK_CAPSULE_HEIGHT,
  FloatingLiquidGlassDock,
  IS_MOTION_STATIC,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewElement,
  ScrollChoreographyProvider,
  type ScrollChoreographyContextValue,
  WORKSPACE_TABS,
  WebAppHeader,
  WebTabBar,
  hapticService,
  motionDuration,
  scrollMotionBySkin,
  springConfigs,
  useBFlowTheme,
  useResponsiveLayout,
} from '../../../design-system';
import { useSafeInsets } from '../../../platform/insets/useSafeInsets';
import type { BFlowWorkspaceTab } from '../../budget/store/useBudgetStore';

export interface WorkspaceShellProps {
  /** "Octubre 2026" */
  monthLabel: string;
  activeTab: BFlowWorkspaceTab;
  /**
   * Tab whose content is on screen. It trails `activeTab` while the new tab mounts as a
   * transition (`useDeferredValue` in `src/app/index.tsx`); the scroll returns to the top
   * when this one changes, so the previous tab is never shown shifted. Defaults to `activeTab`.
   */
  contentTab?: BFlowWorkspaceTab;
  onSelectTab: (tab: BFlowWorkspaceTab) => void;
  /** Hidden while the account is being set up (onboarding). */
  showNavigation: boolean;
  /** User profile photo URI rendered in the top-right Account avatar button (ADR 0033). */
  accountPhotoUrl?: string | null;
  /** Pending offline mutations waiting to be synced to cloud. */
  pendingSyncCount?: number;
  children: React.ReactNode;
}

/** Space the floating dock covers at the bottom of the scroll content. */
const IOS_DOCK_CLEARANCE = 84;
// Android draws edge-to-edge and does not add ScrollView safe-area insets automatically:
// reserve the dock footprint (offset + capsule height) plus a compact gap above it.
const ANDROID_DOCK_BREATHING_GAP = 18;
const ANDROID_DOCK_CLEARANCE =
  DOCK_BOTTOM_OFFSET.android + DOCK_CAPSULE_HEIGHT + ANDROID_DOCK_BREATHING_GAP;
const ANDROID_TOP_APP_BAR_HEIGHT = 64;
const NAVIGATION_TEST_ID = 'liquid-glass-tab-bar';

const IOS_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const ANDROID_ENTER_EASE = Easing.bezier(0.05, 0.7, 0.1, 1);
const ANDROID_EXIT_EASE = Easing.bezier(0.3, 0, 0.8, 0.15);

/**
 * UI-thread worklet copy of `stepDirectionalChromeState` (scrollKinematics.ts).
 * Positional arguments only and zero default parameters (ADR 0030 §3 / worklet closure guard).
 */
export function stepDockChromeOnUI(
  lastY: number,
  accDelta: number,
  wasHidden: boolean,
  wasDirection: -1 | 0 | 1,
  nextY: number,
  contentH: number,
  viewportH: number,
  enabled: boolean,
  hideDelta: number,
  revealDelta: number,
  minOffset: number,
  minOverflow: number,
  bottomAutoReveal: number
): { lastY: number; accumulatedDelta: number; dockHidden: boolean; direction: -1 | 0 | 1 } {
  'worklet';
  if (
    !enabled ||
    !Number.isFinite(nextY) ||
    !Number.isFinite(contentH) ||
    !Number.isFinite(viewportH) ||
    !Number.isFinite(lastY) ||
    !Number.isFinite(accDelta)
  ) {
    return {
      lastY: Number.isFinite(nextY) ? Math.max(0, nextY) : 0,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: 0,
    };
  }

  const maxScroll = Math.max(0, contentH - viewportH);
  if (maxScroll < minOverflow) {
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
      dockHidden: wasHidden,
      direction: wasDirection,
    };
  }

  if (nextY <= minOffset) {
    return {
      lastY: nextY,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: -1,
    };
  }

  if (maxScroll - nextY <= bottomAutoReveal) {
    return {
      lastY: nextY,
      accumulatedDelta: 0,
      dockHidden: false,
      direction: wasDirection,
    };
  }

  const dy = nextY - lastY;
  if (Math.abs(dy) < 0.75) {
    return {
      lastY: nextY,
      accumulatedDelta: accDelta,
      dockHidden: wasHidden,
      direction: wasDirection,
    };
  }

  const reversed = (dy > 0 && accDelta < 0) || (dy < 0 && accDelta > 0);
  const accumulatedDelta = reversed ? dy : accDelta + dy;

  if (accumulatedDelta >= hideDelta) {
    return {
      lastY: nextY,
      accumulatedDelta,
      dockHidden: true,
      direction: 1,
    };
  }

  if (accumulatedDelta <= -revealDelta) {
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
    dockHidden: wasHidden,
    direction: wasDirection,
  };
}

export function WorkspaceShell({
  monthLabel,
  activeTab,
  contentTab = activeTab,
  onSelectTab,
  showNavigation,
  accountPhotoUrl,
  pendingSyncCount,
  children,
}: WorkspaceShellProps): React.JSX.Element {
  const { colors, spacing, skin, skinSpec, reducedMotion } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeInsets();

  const isWeb = skin === 'web';
  const isAndroid = skin === 'android';
  const isIos = skin === 'ios';
  const showsDock = showNavigation && skinSpec.navigation === 'floating-dock';
  // iOS clears its home indicator by itself; Android draws edge to edge, so there the dock and
  // the end of the scroll content clear the system gesture area.
  const bottomSystemInset = isAndroid ? insets.bottom : 0;
  const showsWebTabBar = isWeb && showNavigation && layout.sizeClass !== 'expanded';
  const contentTabLabel = WORKSPACE_TABS.find((tab) => tab.id === contentTab)?.label ?? '';
  const title = `BFlow · ${monthLabel}`;
  // Stable while the tab is unchanged, so the memoized web header can skip re-rendering.
  const webHeaderNavigation = useMemo(
    () => (showNavigation ? { activeTab, onSelectTab, testID: NAVIGATION_TEST_ID } : undefined),
    [showNavigation, activeTab, onSelectTab]
  );

  const scrollSpec = scrollMotionBySkin[skin];
  const scrollActive = scrollSpec.enabled && !reducedMotion && !IS_MOTION_STATIC;
  const topEdgeOffset = isIos ? insets.top : 0;

  const scrollRef = useRef<KeyboardAwareScrollViewElement | null>(null);
  const contentColumnRef = useRef<React.ElementRef<typeof View> | null>(null);
  const layoutListenersRef = useRef<Set<() => void>>(new Set());
  const lastReportedContentHeightRef = useRef<number>(0);
  const prevContentTabRef = useRef<BFlowWorkspaceTab>(contentTab);

  const scrollY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const dockHidden = useSharedValue(0);
  const lastScrollYSV = useSharedValue(0);
  const accumulatedDeltaSV = useSharedValue(0);
  const isDockHiddenSV = useSharedValue(false);
  const directionSV = useSharedValue<-1 | 0 | 1>(0);

  const specEnabled = scrollActive;
  const hideDelta = scrollSpec.dockHideDelta;
  const revealDelta = scrollSpec.dockRevealDelta;
  const hideMinOffset = scrollSpec.dockHideMinOffset;
  const minOverflow = scrollSpec.dockMinOverflow;
  const bottomAutoReveal = scrollSpec.dockBottomAutoReveal;
  const hideDurationMs = scrollSpec.dockHideDurationMs;
  const revealDurationMs = scrollSpec.dockRevealDurationMs;
  const usesSpringReveal = scrollSpec.usesSpringReveal;

  const revealDock = useCallback(() => {
    accumulatedDeltaSV.value = 0;
    isDockHiddenSV.value = false;
    if (!scrollActive) {
      dockHidden.value = 0;
      return;
    }
    if (usesSpringReveal) {
      dockHidden.value = withSpring(0, springConfigs.scrollDockReveal);
    } else {
      dockHidden.value = withTiming(0, {
        duration: revealDurationMs,
        easing: ANDROID_ENTER_EASE,
      });
    }
  }, [
    accumulatedDeltaSV,
    dockHidden,
    isDockHiddenSV,
    revealDurationMs,
    scrollActive,
    usesSpringReveal,
  ]);

  const animatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const y = event.contentOffset.y;
        const vh = event.layoutMeasurement.height;
        const ch = event.contentSize.height;
        if (!Number.isFinite(y)) return;

        scrollY.value = y;
        if (Number.isFinite(vh) && vh > 0) {
          viewportHeight.value = vh;
        }
        if (Number.isFinite(ch) && ch > 0) {
          contentHeight.value = ch;
        }

        const nextState = stepDockChromeOnUI(
          lastScrollYSV.value,
          accumulatedDeltaSV.value,
          isDockHiddenSV.value,
          directionSV.value,
          y,
          contentHeight.value,
          viewportHeight.value,
          specEnabled,
          hideDelta,
          revealDelta,
          hideMinOffset,
          minOverflow,
          bottomAutoReveal
        );
        lastScrollYSV.value = nextState.lastY;
        accumulatedDeltaSV.value = nextState.accumulatedDelta;
        directionSV.value = nextState.direction;

        if (nextState.dockHidden !== isDockHiddenSV.value) {
          isDockHiddenSV.value = nextState.dockHidden;
          if (nextState.dockHidden) {
            dockHidden.value = withTiming(1, {
              duration: hideDurationMs,
              easing: usesSpringReveal ? IOS_EASE : ANDROID_EXIT_EASE,
            });
          } else if (usesSpringReveal) {
            dockHidden.value = withSpring(0, springConfigs.scrollDockReveal);
          } else {
            dockHidden.value = withTiming(0, {
              duration: revealDurationMs,
              easing: ANDROID_ENTER_EASE,
            });
          }
        }
      },
    },
    Platform.OS === 'web'
      ? [
          accumulatedDeltaSV,
          bottomAutoReveal,
          contentHeight,
          directionSV,
          dockHidden,
          hideDelta,
          hideDurationMs,
          hideMinOffset,
          isDockHiddenSV,
          lastScrollYSV,
          minOverflow,
          revealDelta,
          revealDurationMs,
          scrollY,
          specEnabled,
          usesSpringReveal,
          viewportHeight,
        ]
      : undefined
  );

  const handleScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      if (Number.isFinite(h) && h > 0) {
        viewportHeight.value = h;
      }
    },
    [viewportHeight]
  );

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      if (!Number.isFinite(h) || h <= 0) return;
      contentHeight.value = h;
      if (h - viewportHeight.value < minOverflow) {
        revealDock();
      }
      if (Math.abs(h - lastReportedContentHeightRef.current) > 16) {
        lastReportedContentHeightRef.current = h;
        layoutListenersRef.current.forEach((listener) => listener());
      }
    },
    [contentHeight, minOverflow, revealDock, viewportHeight]
  );

  // Every tab opens at the top, in the same commit that swaps the content: a layout effect runs
  // before the frame is painted, so neither the outgoing tab nor the incoming one is drawn at a
  // stale offset. Keyed on the rendered tab, not on the dock selection, which leads it by a
  // transition.
  useLayoutEffect(() => {
    if (prevContentTabRef.current === contentTab) {
      return undefined;
    }
    prevContentTabRef.current = contentTab;

    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    scrollY.value = 0;
    lastScrollYSV.value = 0;
    accumulatedDeltaSV.value = 0;
    directionSV.value = 0;
    revealDock();

    const notifyLayout = () => layoutListenersRef.current.forEach((listener) => listener());
    const rafId = requestAnimationFrame(notifyLayout);
    // Again once the incoming tab has settled (`TabTransition`), in case a section was
    // measured while the tab was still sliding or growing into place.
    const settledTimer = setTimeout(notifyLayout, motionDuration.fast);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settledTimer);
    };
  }, [
    contentTab,
    accumulatedDeltaSV,
    directionSV,
    lastScrollYSV,
    revealDock,
    scrollY,
  ]);

  const scrollToTop = useCallback(() => {
    if (scrollY.value > 4) {
      hapticService.selection();
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    }
    revealDock();
  }, [revealDock, scrollY]);

  const getContentContainerNode = useCallback(() => contentColumnRef.current, []);

  const subscribeLayoutChange = useCallback((listener: () => void) => {
    layoutListenersRef.current.add(listener);
    return () => {
      layoutListenersRef.current.delete(listener);
    };
  }, []);

  const choreographyValue = useMemo<ScrollChoreographyContextValue>(
    () => ({
      active: scrollActive,
      scrollY,
      viewportHeight,
      contentHeight,
      dockHidden,
      topEdgeOffset,
      revealDock,
      getContentContainerNode,
      subscribeLayoutChange,
    }),
    [
      scrollActive,
      scrollY,
      viewportHeight,
      contentHeight,
      dockHidden,
      topEdgeOffset,
      revealDock,
      getContentContainerNode,
      subscribeLayoutChange,
    ]
  );

  const contentGap = isWeb && layout.sizeClass !== 'compact' ? spacing.xl : spacing.md;
  const paddingTop = isWeb ? (layout.isWide ? spacing.xxxl : spacing.xxl) : spacing.xl;
  const dockClearance = isAndroid ? ANDROID_DOCK_CLEARANCE : IOS_DOCK_CLEARANCE;
  // iOS turns the automatic content inset off (see the scroll view below), so the home
  // indicator area is reserved here too; the dock itself still clears it on its own.
  const bottomEdgeOffset = isIos ? insets.bottom : bottomSystemInset;
  const paddingBottom =
    (showsDock ? dockClearance : isWeb ? spacing.huge : spacing.xl) + bottomEdgeOffset;

  return (
    <View testID="workspace-shell" style={{ flex: 1, backgroundColor: colors.background.primary }}>
      {/* Faint drifting dots behind the content (iOS and Android; nothing on Web). */}
      <AmbientParticles />
      <ScrollChoreographyProvider value={choreographyValue}>
        {isWeb ? (
          <WebAppHeader
            layout={layout}
            contextLabel={monthLabel}
            navigation={webHeaderNavigation}
            accountPhotoUrl={accountPhotoUrl}
          />
        ) : null}

        <KeyboardAwareScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          animatedScrollHandler={scrollActive ? animatedScrollHandler : undefined}
          scrollYShared={scrollActive ? scrollY : undefined}
          onLayout={scrollActive ? handleScrollViewLayout : undefined}
          onContentSizeChange={scrollActive ? handleContentSizeChange : undefined}
          // iOS: the status bar / notch area is reserved as content padding instead of an
          // automatic content inset. With the automatic inset the resting offset is
          // `y = -insets.top`, so `scrollTo({ y: 0 })` (tab switch, scroll-to-top) parked the
          // title and the theme switch under the clock and the battery.
          contentInsetAdjustmentBehavior={isIos ? 'never' : undefined}
          scrollIndicatorInsets={
            isIos
              ? {
                  top: insets.top,
                  bottom: (showNavigation ? dockClearance : 0) + insets.bottom,
                }
              : undefined
          }
          contentContainerStyle={{
            paddingHorizontal: layout.gutter,
            paddingTop: isAndroid ? 0 : paddingTop + topEdgeOffset,
            paddingBottom,
          }}
        >
          <View
            ref={contentColumnRef}
            testID="workspace-content-column"
            style={{
              width: '100%',
              maxWidth: layout.contentMaxWidth,
              alignSelf: 'center',
              gap: contentGap,
            }}
          >
            {isIos ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                  <AppText
                    variant="title1"
                    accessibilityRole="header"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{ flexShrink: 1 }}
                  >
                    {title}
                  </AppText>
                  {pendingSyncCount && pendingSyncCount > 0 ? (
                    <View
                      testID="pending-offline-sync-badge"
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: 10,
                        backgroundColor: colors.background.secondary,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.pending}>
                        {`☁️ ${pendingSyncCount}`}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                {showNavigation ? (
                  <AccountHeaderAvatarButton
                    testID="workspace-tab-account"
                    photoUrl={accountPhotoUrl}
                    isSelected={activeTab === 'account'}
                    onPress={() => {
                      if (activeTab === 'account') {
                        scrollToTop();
                      } else {
                        onSelectTab('account');
                      }
                    }}
                  />
                ) : null}
              </View>
            ) : null}

            {isAndroid ? (
              <View
                testID="material-top-app-bar"
                style={{
                  minHeight: ANDROID_TOP_APP_BAR_HEIGHT,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                  <AppText
                    variant="title2"
                    accessibilityRole="header"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={{ flexShrink: 1 }}
                  >
                    {title}
                  </AppText>
                  {pendingSyncCount && pendingSyncCount > 0 ? (
                    <View
                      testID="pending-offline-sync-badge-android"
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: colors.background.secondary,
                      }}
                    >
                      <AppText variant="caption" color={colors.semantic.pending}>
                        {`☁️ ${pendingSyncCount}`}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                {showNavigation ? (
                  <AccountHeaderAvatarButton
                    testID="workspace-tab-account"
                    photoUrl={accountPhotoUrl}
                    isSelected={activeTab === 'account'}
                    onPress={() => {
                      if (activeTab === 'account') {
                        scrollToTop();
                      } else {
                        onSelectTab('account');
                      }
                    }}
                  />
                ) : null}
              </View>
            ) : null}

            {isWeb && showNavigation ? (
              <View
                testID="web-page-heading"
                accessibilityRole="header"
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  columnGap: spacing.sm,
                }}
              >
                <AppText variant="title1">{contentTabLabel}</AppText>
                <AppText variant="title1" color={colors.text.muted}>
                  {monthLabel}
                </AppText>
                {pendingSyncCount && pendingSyncCount > 0 ? (
                  <View
                    testID="pending-offline-sync-badge-web"
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: colors.background.secondary,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                    }}
                  >
                    <AppText variant="caption" color={colors.semantic.pending}>
                      {`☁️ ${pendingSyncCount} pendientes`}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}

            {children}
          </View>
        </KeyboardAwareScrollView>

        {showsDock ? (
          <FloatingLiquidGlassDock
            testID={NAVIGATION_TEST_ID}
            activeTab={activeTab}
            onSelectTab={onSelectTab}
            onReselectActiveTab={scrollToTop}
            bottomInset={bottomSystemInset}
          />
        ) : null}

        {showsWebTabBar ? (
          <WebTabBar
            testID={NAVIGATION_TEST_ID}
            activeTab={activeTab}
            onSelectTab={onSelectTab}
            layout={layout}
          />
        ) : null}
      </ScrollChoreographyProvider>
    </View>
  );
}
