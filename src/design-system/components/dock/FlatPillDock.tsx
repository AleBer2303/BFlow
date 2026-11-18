/**
 * Android dock (ADR 0024): the floating dock with a flat selection pill in `accent.container`.
 * It slides and follows the finger, but has no rim, shine, shadow, growth or overshoot.
 * The iOS dock is `LiquidGlassDock` (ADR 0030); both share `dockGeometry`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { BFlowWorkspaceTab } from '../../../features/budget/store/useBudgetStore';
import { GlassSurface } from '../../../platform/glass/GlassSurface';
import { hapticService } from '../../../platform/haptics/hapticService';
import { useScrollChoreography } from '../../motion/ScrollChoreographyContext';
import { useBFlowTheme } from '../../theme/ThemeContext';
import { scrollMotionBySkin, springConfigs } from '../../tokens';
import type { FloatingLiquidGlassDockProps } from '../FloatingLiquidGlassDock';
import { DockTabContent } from './DockTabContent';
import {
  DOCK_BOTTOM_OFFSET,
  DOCK_CAPSULE_HEIGHT,
  DOCK_MAX_WIDTH,
  DOCK_PADDING_H,
  DOCK_SURFACE_BORDER,
  DOCK_SURFACE_PADDING_V,
  DOCK_TAB_HEIGHT,
  DOCK_TABS,
  LENS_MARGIN_H,
  getDockLensPositionFromScreenX,
} from './dockGeometry';

interface SpringParams {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

/** Runs a native-driven spring (jumps straight to the value in the test environment). */
function runSpring(value: Animated.Value, toValue: number, config: SpringParams): void {
  if (process.env.NODE_ENV === 'test') {
    value.setValue(toValue);
    return;
  }
  Animated.spring(value, {
    toValue,
    damping: config.damping,
    stiffness: config.stiffness,
    mass: config.mass,
    useNativeDriver: true,
  }).start();
}

export const FlatPillDock = React.memo(function FlatPillDock({
  activeTab,
  onSelectTab,
  onReselectActiveTab,
  bottomInset = 0,
  testID = 'floating-liquid-glass-dock',
}: FloatingLiquidGlassDockProps): React.JSX.Element {
  const { colors, mode, radius, spacing, reducedMotion, skinSpec } = useBFlowTheme();
  const choreography = useScrollChoreography();
  const fallbackHiddenSV = useSharedValue(0);
  const dockHiddenSV = choreography?.dockHidden ?? fallbackHiddenSV;
  const isScrollChoreographyActive = Boolean(choreography?.active);
  const onReselectActiveTabRef = useRef(onReselectActiveTab);
  onReselectActiveTabRef.current = onReselectActiveTab;
  const revealDockRef = useRef(choreography?.revealDock);
  revealDockRef.current = choreography?.revealDock;
  const justSelectedTabRef = useRef<BFlowWorkspaceTab | null>(null);
  // Reduce Motion: the pill and the icons jump to their place, with no spring.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const spring = useRef((value: Animated.Value, toValue: number, config: SpringParams): void => {
    if (reducedMotionRef.current) {
      value.setValue(toValue);
      return;
    }
    runSpring(value, toValue, config);
  }).current;
  // The pill settles on a tab without overshoot.
  const settle = useRef((value: Animated.Value, toValue: number): void => {
    spring(value, toValue, springConfigs.flatSettle);
  }).current;

  const accentColor = colors.accent.primary;
  // The dock is an opaque surface of the skin's own palette.
  const dockBackground = colors.glass.surfaceElevatedTint;
  const dockBorder = colors.glass.specularBorder;
  const screenWidth = Dimensions.get('window').width;
  const defaultWidth = Math.min(DOCK_MAX_WIDTH, Math.max(304, screenWidth - spacing.sm * 2));
  const [dockWidth, setDockWidth] = useState<number>(defaultWidth);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const dockRef = useRef<React.ElementRef<typeof View>>(null);
  const dockScreenLeftRef = useRef<number>(Math.max(spacing.sm, (screenWidth - defaultWidth) / 2));

  // Protect against race conditions on release: keeps the pill and highlight stable at the
  // released index until parent state updates activeTab to match.
  const pendingReleaseIndexRef = useRef<number | null>(null);

  const activeIndex = useMemo(() => {
    const idx = DOCK_TABS.findIndex((t) => t.id === activeTab);
    return idx >= 0 ? idx : 0;
  }, [activeTab]);

  // Current visual active index taking into account dragging and pending release
  const displayedIndex = draggedIndex ?? (pendingReleaseIndexRef.current ?? activeIndex);

  const gliderAnim = useRef(new Animated.Value(activeIndex)).current;
  const tabScaleAnims = useRef(
    DOCK_TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1.05 : 1))
  ).current;

  // Track current visual index during gesture
  const visualIndexRef = useRef<number>(activeIndex);
  const dragOffsetRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  // Sync animations when activeIndex changes and not actively dragging
  useEffect(() => {
    if (isDraggingRef.current || draggedIndex !== null) return;

    // If we recently released on an index and props.activeTab has not updated yet, do not revert!
    if (
      pendingReleaseIndexRef.current !== null &&
      pendingReleaseIndexRef.current !== activeIndex
    ) {
      return;
    }

    pendingReleaseIndexRef.current = null;
    visualIndexRef.current = activeIndex;

    settle(gliderAnim, activeIndex);
    tabScaleAnims.forEach((anim, i) => {
      spring(anim, i === activeIndex ? 1.05 : 1, springConfigs.gentle);
    });
  }, [activeIndex, draggedIndex, gliderAnim, settle, spring, tabScaleAnims]);

  const selectTabAtIndex = useCallback(
    (index: number, fromPressIn: boolean) => {
      const clamped = Math.max(0, Math.min(DOCK_TABS.length - 1, index));
      const targetTab = DOCK_TABS[clamped];
      if (!targetTab) return;

      if (targetTab.id !== activeTab) {
        if (fromPressIn) {
          justSelectedTabRef.current = targetTab.id;
        }
        pendingReleaseIndexRef.current = clamped;
        visualIndexRef.current = clamped;
        hapticService.selection();

        settle(gliderAnim, clamped);
        tabScaleAnims.forEach((anim, i) => {
          spring(anim, i === clamped ? 1.05 : 1, springConfigs.gentle);
        });

        onSelectTab(targetTab.id);
      }
    },
    [activeTab, gliderAnim, onSelectTab, settle, spring, tabScaleAnims]
  );

  const handlePressInIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(DOCK_TABS.length - 1, index));
      const targetTab = DOCK_TABS[clamped];
      if (targetTab && targetTab.id === activeTab) {
        justSelectedTabRef.current = null;
        return;
      }
      selectTabAtIndex(index, true);
    },
    [activeTab, selectTabAtIndex]
  );

  const handlePressIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(DOCK_TABS.length - 1, index));
      const targetTab = DOCK_TABS[clamped];
      if (!targetTab) return;
      if (justSelectedTabRef.current === targetTab.id) {
        justSelectedTabRef.current = null;
        return;
      }
      if (targetTab.id === activeTab && pendingReleaseIndexRef.current === null) {
        onReselectActiveTabRef.current?.();
        return;
      }
      selectTabAtIndex(index, false);
    },
    [activeTab, selectTabAtIndex]
  );

  // Continuous pill position (tab units) under the finger.
  const getLensPositionFromScreenX = useCallback(
    (screenX: number): number =>
      getDockLensPositionFromScreenX(screenX, dockScreenLeftRef.current, dockWidth),
    [dockWidth]
  );

  // Frame-by-frame follow loop: exponential smoothing toward the finger (frame-rate independent).
  const dragTargetRef = useRef<number>(activeIndex);
  const lensCurrentRef = useRef<number>(activeIndex);
  const followRafRef = useRef<number | null>(null);

  const stopFollowLoop = useCallback(() => {
    if (followRafRef.current !== null) {
      cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
    }
  }, []);

  const startFollowLoop = useCallback(() => {
    if (process.env.NODE_ENV === 'test' || followRafRef.current !== null) return;
    let last = 0;
    const tick = (now: number) => {
      if (!isDraggingRef.current) {
        followRafRef.current = null;
        return;
      }
      const dtMs = last === 0 ? 16.67 : Math.min(48, Math.max(4, now - last));
      last = now;
      const previous = lensCurrentRef.current;
      // 55ms time-constant: smooth, yet still tightly attached to the finger
      const alpha = 1 - Math.exp(-dtMs / 55);
      const next = previous + (dragTargetRef.current - previous) * alpha;
      lensCurrentRef.current = next;
      gliderAnim.setValue(next);
      followRafRef.current = requestAnimationFrame(tick);
    };
    followRafRef.current = requestAnimationFrame(tick);
  }, [gliderAnim]);

  useEffect(() => stopFollowLoop, [stopFollowLoop]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) =>
          Math.abs(g.dx) > 4,
        onMoveShouldSetPanResponderCapture: (
          _: GestureResponderEvent,
          g: PanResponderGestureState
        ) => Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent, g: PanResponderGestureState) => {
          revealDockRef.current?.();
          const currentX = event.nativeEvent.pageX ?? g.moveX ?? g.x0 + g.dx;
          const initialIndex = visualIndexRef.current;
          // Keep the pill where it is (no jump); it will track the finger from here.
          dragOffsetRef.current = Math.max(
            -0.5,
            Math.min(0.5, initialIndex - getLensPositionFromScreenX(currentX))
          );
          isDraggingRef.current = true;
          dragTargetRef.current = initialIndex;
          gliderAnim.stopAnimation((value) => {
            if (!isDraggingRef.current) return;
            lensCurrentRef.current = Number.isFinite(value) ? value : initialIndex;
            startFollowLoop();
          });
        },
        onPanResponderMove: (event: GestureResponderEvent, g: PanResponderGestureState) => {
          const currentScreenX = event.nativeEvent.pageX ?? g.moveX ?? g.x0 + g.dx;
          const lensPosition = Math.max(
            0,
            Math.min(
              DOCK_TABS.length - 1,
              getLensPositionFromScreenX(currentScreenX) + dragOffsetRef.current
            )
          );
          dragTargetRef.current = lensPosition;
          if (process.env.NODE_ENV === 'test') {
            gliderAnim.setValue(lensPosition);
          }

          const clampedIndex = Math.round(lensPosition);
          if (clampedIndex !== visualIndexRef.current) {
            visualIndexRef.current = clampedIndex;
            setDraggedIndex((prev) => (prev === clampedIndex ? prev : clampedIndex));
            hapticService.selection();
            tabScaleAnims.forEach((anim, i) => {
              spring(anim, i === clampedIndex ? 1.05 : 1, springConfigs.gentle);
            });
          }
        },
        onPanResponderRelease: () => {
          const finalIndex = visualIndexRef.current;
          pendingReleaseIndexRef.current = finalIndex;
          isDraggingRef.current = false;
          stopFollowLoop();
          setDraggedIndex((prev) => (prev === null ? prev : null));
          dragOffsetRef.current = 0;
          settle(gliderAnim, finalIndex);

          const targetTab = DOCK_TABS[finalIndex];
          if (targetTab && targetTab.id !== activeTab) {
            onSelectTab(targetTab.id);
          }
        },
        onPanResponderTerminate: () => {
          pendingReleaseIndexRef.current = null;
          setDraggedIndex((prev) => (prev === null ? prev : null));
          visualIndexRef.current = activeIndex;
          dragOffsetRef.current = 0;
          isDraggingRef.current = false;
          stopFollowLoop();
          settle(gliderAnim, activeIndex);
        },
      }),
    [
      activeIndex,
      activeTab,
      getLensPositionFromScreenX,
      gliderAnim,
      onSelectTab,
      settle,
      spring,
      startFollowLoop,
      stopFollowLoop,
      tabScaleAnims,
    ]
  );

  const handleDockLayout = (event: LayoutChangeEvent) => {
    const { width, x } = event.nativeEvent.layout;
    if (width > 0) {
      setDockWidth(width);
    }
    const currentScreenWidth = Dimensions.get('window').width;
    dockScreenLeftRef.current =
      typeof x === 'number' && x > 0
        ? x
        : Math.max(spacing.sm, (currentScreenWidth - (width || defaultWidth)) / 2);

    if (dockRef.current && typeof dockRef.current.measureInWindow === 'function') {
      dockRef.current.measureInWindow((screenX: number, _screenY: number, measuredWidth: number) => {
        if (typeof screenX === 'number' && !isNaN(screenX)) {
          dockScreenLeftRef.current = screenX;
        }
        if (typeof measuredWidth === 'number' && measuredWidth > 0) {
          setDockWidth(measuredWidth);
        }
      });
    }
  };

  const availableWidth = Math.max(0, dockWidth - DOCK_PADDING_H * 2);
  const tabWidth = availableWidth > 0 ? availableWidth / DOCK_TABS.length : 0;
  const lensWidth = Math.max(0, tabWidth - LENS_MARGIN_H * 2);

  // Plain travel, clamped to the first and last tab.
  const flatTranslateX = useMemo(
    () =>
      gliderAnim.interpolate({
        inputRange: [0, DOCK_TABS.length - 1],
        outputRange: [0, tabWidth * (DOCK_TABS.length - 1)],
        extrapolate: 'clamp',
      }),
    [gliderAnim, tabWidth]
  );

  const dockTravel = DOCK_CAPSULE_HEIGHT + DOCK_BOTTOM_OFFSET.android + bottomInset + 20;
  const hiddenScale = scrollMotionBySkin.android.dockHiddenScale;
  const scrollDockStyle = useAnimatedStyle(() => {
    if (!isScrollChoreographyActive) {
      return {
        opacity: 1,
        transform: [{ translateY: 0 }, { scale: 1 }],
      };
    }
    const raw = dockHiddenSV.value;
    const hidden = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    return {
      opacity: 1 - 0.15 * hidden,
      transform: [
        { translateY: hidden * dockTravel },
        { scale: 1 - (1 - hiddenScale) * hidden },
      ],
    };
  }, [dockHiddenSV, dockTravel, hiddenScale, isScrollChoreographyActive]);

  return (
    // Full-width anchor: an absolutely positioned view with left/right AND maxWidth pins to the
    // left edge, so the dock is centered by its parent instead (tablets, landscape, browsers).
    <View
      testID={`${testID}-anchor`}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: DOCK_BOTTOM_OFFSET.android + bottomInset,
        left: spacing.sm,
        right: spacing.sm,
        alignItems: 'center',
        zIndex: 999,
      }}
    >
      <Reanimated.View
        testID={`${testID}-scroll-frame`}
        style={[{ width: '100%', alignItems: 'center' }, scrollDockStyle]}
      >
        <View
          ref={dockRef}
          testID={testID}
          accessibilityRole="tablist"
          style={{
            width: '100%',
            maxWidth: DOCK_MAX_WIDTH,
            elevation: 8,
            borderRadius: radius.pill,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: mode === 'dark' ? 0.35 : 0.22,
            shadowRadius: 12,
          }}
          onLayout={handleDockLayout}
          {...panResponder.panHandlers}
        >
        <GlassSurface
          elevated
          noPadding
          style={{
            borderRadius: radius.pill,
            borderCurve: 'continuous',
            paddingVertical: DOCK_SURFACE_PADDING_V,
            paddingHorizontal: 0,
            overflow: 'hidden',
            backgroundColor: dockBackground,
            borderColor: dockBorder,
            borderWidth: DOCK_SURFACE_BORDER,
          }}
        >
          {/* Flat selection pill: one tonal fill, nothing that reads as glass */}
          {availableWidth > 0 && lensWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              testID="dock-flat-indicator"
              style={{
                position: 'absolute',
                top: 3,
                bottom: 3,
                left: DOCK_PADDING_H + LENS_MARGIN_H,
                width: lensWidth,
                transform: [{ translateX: flatTranslateX }],
                borderRadius: radius.pill,
                backgroundColor: colors.accent.container,
                zIndex: 1,
              }}
            />
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: DOCK_PADDING_H,
              zIndex: 2,
            }}
          >
            {DOCK_TABS.map((tab, idx) => {
              const isSelected = tab.id === activeTab;
              const isHighlighted = idx === displayedIndex;
              const scale = tabScaleAnims[idx] ?? new Animated.Value(1);

              return (
                <Pressable
                  key={tab.id}
                  testID={`workspace-tab-${tab.id}`}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isSelected }}
                  onPressIn={() => handlePressInIndex(idx)}
                  onPress={() => handlePressIndex(idx)}
                  style={{
                    flex: 1,
                    height: DOCK_TAB_HEIGHT,
                    minHeight: skinSpec.minTouchTarget,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Animated.View style={{ transform: [{ scale }] }}>
                    <DockTabContent
                      id={tab.id}
                      label={tab.label}
                      focused={isHighlighted}
                      color={isHighlighted ? accentColor : colors.text.secondary}
                    />
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
        </View>
      </Reanimated.View>
    </View>
  );
});
