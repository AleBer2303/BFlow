import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import type { BFlowWorkspaceTab } from '../../features/budget/store/useBudgetStore';
import { GlassSurface } from '../../platform/glass/GlassSurface';
import { hapticService } from '../../platform/haptics/hapticService';
import { useBFlowTheme } from '../theme/ThemeContext';
import { MIN_TOUCH_TARGET_PT, springConfigs } from '../tokens';
import { WORKSPACE_TABS } from './navigation/workspaceTabs';
import { AppText } from './Typography';
import {
  AccountNavIcon,
  ChecklistNavIcon,
  CierreNavIcon,
  DebtsNavIcon,
  SavingsNavIcon,
  SummaryNavIcon,
} from './WorkspaceNavIcons';

export interface FloatingLiquidGlassDockProps {
  activeTab: BFlowWorkspaceTab;
  onSelectTab: (tab: BFlowWorkspaceTab) => void;
  testID?: string;
}

export interface DockTabConfig {
  id: BFlowWorkspaceTab;
  label: string;
}

/** The dock shows the shared workspace destinations (see navigation/workspaceTabs). */
export const DOCK_TABS: ReadonlyArray<DockTabConfig> = WORKSPACE_TABS;

export const DOCK_PADDING_H = 6;
export const DOCK_MAX_WIDTH = 580;
export const LENS_MARGIN_H = 2;

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
  if (dockWidth <= 0 || tabCount <= 0) return 0;
  const availableWidth = Math.max(0, dockWidth - dockPaddingH * 2);
  const tabWidth = availableWidth > 0 ? availableWidth / tabCount : 1;
  const xInTabArea = screenX - dockScreenLeft - dockPaddingH;
  const rawIndex = Math.floor(xInTabArea / tabWidth);
  return Math.max(0, Math.min(tabCount - 1, rawIndex));
}

/** Max inner room (px) between the lens at rest and the dock's clipping edge. */
export const LENS_EDGE_INSET = 1;
const LENS_EDGE_ROOM = DOCK_PADDING_H + LENS_MARGIN_H - LENS_EDGE_INSET;
/** Overshoot distance (px) at which the wall-squash reaches its maximum. */
const LENS_SQUASH_DISTANCE = 26;
const LENS_SQUASH_MIN_SCALE = 0.84;

// Any composed Animated node (add/subtract/interpolation) supports `interpolate` at runtime.
type AnimatedMath = Animated.AnimatedNode;

/** max(node, 0) on the native thread. */
function relu(node: AnimatedMath): Animated.AnimatedInterpolation<number> {
  return (node as Animated.AnimatedInterpolation<number>).interpolate({
    inputRange: [0, 1000],
    outputRange: [0, 1000],
    extrapolateLeft: 'clamp',
    extrapolateRight: 'extend',
  });
}

/** 0 when node <= 0, 1 as soon as it is > 0 (native step). */
function step(node: AnimatedMath): Animated.AnimatedInterpolation<number> {
  return (node as Animated.AnimatedInterpolation<number>).interpolate({
    inputRange: [0, 0.001],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
}

interface SpringParams {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

/** Runs a native-driven spring (jumps straight to the value in the test environment). */
function runSpring(
  value: Animated.Value,
  toValue: number,
  config: SpringParams,
  velocity: number = 0
): void {
  if (process.env.NODE_ENV === 'test') {
    value.setValue(toValue);
    return;
  }
  Animated.spring(value, {
    toValue,
    velocity,
    damping: config.damping,
    stiffness: config.stiffness,
    mass: config.mass,
    useNativeDriver: true,
  }).start();
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
  if (dockWidth <= 0 || tabCount <= 0) return 0;
  const availableWidth = Math.max(0, dockWidth - dockPaddingH * 2);
  const tabWidth = availableWidth > 0 ? availableWidth / tabCount : 1;
  const xInTabArea = screenX - dockScreenLeft - dockPaddingH;
  const raw = xInTabArea / tabWidth - 0.5;
  return Math.max(0, Math.min(tabCount - 1, raw));
}

export interface LensGeometryInput {
  gliderAnim: Animated.Value;
  liftAnim: Animated.Value;
  stretchAnim: Animated.Value;
  tabWidth: number;
  lensWidth: number;
}

/**
 * Builds the native-driven transform nodes of the liquid lens.
 * The settle spring may overshoot (bounce) past the first/last tab; since the dock clips its
 * content, the travel is clamped so the lens (including lift/stretch growth) never crosses the
 * inner edge, and the overshoot is converted into a horizontal squash against the wall.
 */
export function buildLensGeometry({
  gliderAnim,
  liftAnim,
  stretchAnim,
  tabWidth,
  lensWidth,
}: LensGeometryInput) {
  // Unclamped travel: extends past both ends so the settle spring may overshoot (bounce)
  const rawTranslateX = gliderAnim.interpolate({
    inputRange: [0, DOCK_TABS.length - 1],
    outputRange: [0, tabWidth * (DOCK_TABS.length - 1)],
    extrapolate: 'extend',
  });

  // Lens "lifts" (grows) under the finger and stretches with velocity, like a liquid drop
  const lensScaleX = Animated.multiply(
    liftAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12], extrapolate: 'clamp' }),
    stretchAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2], extrapolate: 'clamp' })
  );

  // Edge handling: the dock clips its content, so the lens (including the growth from
  // lift/stretch) must never cross the inner edge. The bounce is kept, but when the lens
  // hits the wall its travel is clamped and the overshoot is converted into a horizontal
  // squash, like a drop of liquid compressing against the border.
  const edgeGrowth = Animated.multiply(Animated.subtract(lensScaleX, 1), lensWidth / 2);
  const minTranslateX = Animated.subtract(edgeGrowth, LENS_EDGE_ROOM);
  const maxTranslateX = Animated.subtract(
    tabWidth * (DOCK_TABS.length - 1) + LENS_EDGE_ROOM,
    edgeGrowth
  );
  const pastMax = relu(Animated.subtract(rawTranslateX, maxTranslateX));
  const pastMin = relu(Animated.subtract(minTranslateX, rawTranslateX));
  const gliderTranslateX = Animated.add(
    Animated.subtract(rawTranslateX, pastMax),
    pastMin
  );
  const lensSquash = Animated.add(pastMax, pastMin).interpolate({
    inputRange: [0, LENS_SQUASH_DISTANCE],
    outputRange: [1, LENS_SQUASH_MIN_SCALE],
    extrapolate: 'clamp',
  });
  // Keeps the squashed side flush against the wall instead of floating away from it
  const squashShift = Animated.multiply(
    Animated.multiply(Animated.subtract(1, lensSquash), lensScaleX),
    lensWidth / 2
  );
  const touchingMax = step(pastMax);
  const touchingMin = step(pastMin);
  const lensTranslateX = Animated.add(
    gliderTranslateX,
    Animated.subtract(
      Animated.multiply(squashShift, touchingMax),
      Animated.multiply(squashShift, touchingMin)
    )
  );
  const lensScaleXFinal = Animated.multiply(lensScaleX, lensSquash);

  return { lensTranslateX, lensScaleX: lensScaleXFinal };
}

/**
 * Floating Liquid Glass Dock navigation with custom vector icons,
 * fluid 60/120Hz ProMotion spring animations, touch/drag gesture sliding,
 * zero-delay mechanical haptic feedback on touch-down, and Apple magnifying lens.
 */
export function FloatingLiquidGlassDock({
  activeTab,
  onSelectTab,
  testID = 'floating-liquid-glass-dock',
}: FloatingLiquidGlassDockProps): React.JSX.Element {
  const { colors, mode, radius, spacing } = useBFlowTheme();
  // Light mode: bone-white dock with a defined outline + deeper accent so it reads against the sand page.
  const accentColor = colors.accent.primary;
  const dockBackground =
    mode === 'dark' ? colors.glass.surfaceElevatedTint : 'rgba(247, 244, 236, 0.97)';
  const dockBorder = mode === 'dark' ? colors.glass.specularBorder : 'rgba(90, 75, 45, 0.26)';
  const screenWidth = Dimensions.get('window').width;
  const defaultWidth = Math.min(DOCK_MAX_WIDTH, Math.max(304, screenWidth - spacing.sm * 2));
  const [dockWidth, setDockWidth] = useState<number>(defaultWidth);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const dockRef = useRef<React.ElementRef<typeof View>>(null);
  const dockScreenLeftRef = useRef<number>(Math.max(spacing.sm, (screenWidth - defaultWidth) / 2));

  // Protect against race conditions on release: keeps the glider and highlight
  // stable at the released index until parent state updates activeTab to match.
  const pendingReleaseIndexRef = useRef<number | null>(null);

  const activeIndex = useMemo(() => {
    const idx = DOCK_TABS.findIndex((t) => t.id === activeTab);
    return idx >= 0 ? idx : 0;
  }, [activeTab]);

  // Current visual active index taking into account dragging and pending release
  const displayedIndex = draggedIndex ?? (pendingReleaseIndexRef.current ?? activeIndex);

  // Animated lens glider position and tab scales (100% native driver 60/120Hz ProMotion)
  const gliderAnim = useRef(new Animated.Value(activeIndex)).current;
  const tabScaleAnims = useRef(
    DOCK_TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1.05 : 1))
  ).current;

  // Liquid lens physics (all native-driven): "lift" grows the lens while touched,
  // "stretch" elongates it along the direction of motion proportionally to velocity.
  const liftAnim = useRef(new Animated.Value(0)).current;
  const stretchAnim = useRef(new Animated.Value(0)).current;

  // Track current visual index during gesture
  const visualIndexRef = useRef<number>(activeIndex);

  // Sync animations when activeIndex changes and not actively dragging
  useEffect(() => {
    // If user is actively dragging, do not interrupt
    if (draggedIndex !== null) return;

    // If we recently released on an index and props.activeTab has not updated yet, do not revert!
    if (
      pendingReleaseIndexRef.current !== null &&
      pendingReleaseIndexRef.current !== activeIndex
    ) {
      return;
    }

    pendingReleaseIndexRef.current = null;
    visualIndexRef.current = activeIndex;

    if (process.env.NODE_ENV === 'test') {
      gliderAnim.setValue(activeIndex);
      tabScaleAnims.forEach((anim, i) => {
        anim.setValue(i === activeIndex ? 1.05 : 1);
      });
      return;
    }

    runSpring(gliderAnim, activeIndex, springConfigs.liquidSettle);
    tabScaleAnims.forEach((anim, i) => {
      runSpring(anim, i === activeIndex ? 1.05 : 1, springConfigs.gentle);
    });
  }, [activeIndex, draggedIndex, gliderAnim, tabScaleAnims]);

  const handleSelectIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(DOCK_TABS.length - 1, index));
      const targetTab = DOCK_TABS[clamped];
      if (!targetTab) return;

      if (targetTab.id !== activeTab) {
        pendingReleaseIndexRef.current = clamped;
        visualIndexRef.current = clamped;
        hapticService.selection();

        runSpring(gliderAnim, clamped, springConfigs.liquidSettle);
        tabScaleAnims.forEach((anim, i) => {
          runSpring(anim, i === clamped ? 1.05 : 1, springConfigs.gentle);
        });

        onSelectTab(targetTab.id);
      }
    },
    [activeTab, gliderAnim, onSelectTab, tabScaleAnims]
  );

  // Continuous lens position (tab units) under the finger; the lens follows it
  // 1:1 while dragging and only snaps to a tab on release.
  const getLensPositionFromScreenX = useCallback(
    (screenX: number): number => {
      return getDockLensPositionFromScreenX(screenX, dockScreenLeftRef.current, dockWidth);
    },
    [dockWidth]
  );

  // Offset between the lens (where it sat at drag start) and the finger,
  // so the lens does not jump when the pan gesture is claimed.
  const dragOffsetRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  const springGliderTo = useCallback(
    (toValue: number) => runSpring(gliderAnim, toValue, springConfigs.liquidSettle),
    [gliderAnim]
  );

  // Frame-by-frame follow loop: exponential smoothing toward the finger (frame-rate
  // independent). Produces continuous, fluid motion with no restarts, and derives the
  // lens velocity (tabs/s) used for the elastic stretch and the release momentum.
  const dragTargetRef = useRef<number>(activeIndex);
  const lensCurrentRef = useRef<number>(activeIndex);
  const lensVelocityRef = useRef<number>(0);
  const stretchValueRef = useRef<number>(0);
  const followRafRef = useRef<number | null>(null);

  const stopFollowLoop = useCallback(() => {
    if (followRafRef.current !== null) {
      cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
    }
    stretchValueRef.current = 0;
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

      const velocity = ((next - previous) / dtMs) * 1000; // tabs per second
      lensVelocityRef.current = velocity;

      // Elastic stretch follows speed, smoothed so it breathes instead of flickering
      const stretchTarget = Math.min(1, Math.abs(velocity) / 7);
      stretchValueRef.current += (stretchTarget - stretchValueRef.current) * 0.18;
      stretchAnim.setValue(stretchValueRef.current);

      followRafRef.current = requestAnimationFrame(tick);
    };
    followRafRef.current = requestAnimationFrame(tick);
  }, [gliderAnim, stretchAnim]);

  useEffect(() => stopFollowLoop, [stopFollowLoop]);

  // Lens returns to rest size/shape (used on release and on cancelled gestures)
  const relaxLens = useCallback(() => {
    runSpring(liftAnim, 0, springConfigs.liquidLift);
    runSpring(stretchAnim, 0, springConfigs.liquidLift);
  }, [liftAnim, stretchAnim]);

  // PanResponder calibrated for 100% accurate, fluid Apple gesture sliding
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          // Swiftly claim horizontal sliding without deadband
          return Math.abs(gestureState.dx) > 4;
        },
        onMoveShouldSetPanResponderCapture: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          // Capture horizontal gesture before child Pressables can swallow or delay it
          return Math.abs(gestureState.dx) > 4;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          // Use current touch position to avoid past-offset jumps
          const currentX =
            event.nativeEvent.pageX ??
            gestureState.moveX ??
            (gestureState.x0 + gestureState.dx);
          const initialIndex = visualIndexRef.current;
          // Keep the lens where it is (no jump); it will track the finger from here.
          dragOffsetRef.current = Math.max(
            -0.5,
            Math.min(0.5, initialIndex - getLensPositionFromScreenX(currentX))
          );
          isDraggingRef.current = true;
          dragTargetRef.current = initialIndex;
          setDraggedIndex(initialIndex);
          // Lens lifts under the finger like a drop of liquid glass
          runSpring(liftAnim, 1, springConfigs.liquidLift);
          // Take over from any in-flight spring at its CURRENT value (no jump)
          gliderAnim.stopAnimation((value) => {
            if (!isDraggingRef.current) return;
            lensCurrentRef.current = Number.isFinite(value) ? value : initialIndex;
            startFollowLoop();
          });
        },
        onPanResponderMove: (event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          const currentScreenX =
            event.nativeEvent.pageX ??
            gestureState.moveX ??
            (gestureState.x0 + gestureState.dx);
          // Lens glides continuously with the finger (no per-tab stops)
          const lensPosition = Math.max(
            0,
            Math.min(
              DOCK_TABS.length - 1,
              getLensPositionFromScreenX(currentScreenX) + dragOffsetRef.current
            )
          );
          // The lens eases toward the finger frame by frame (see the follow loop),
          // instead of restarting a spring on every touch event (which stutters).
          dragTargetRef.current = lensPosition;
          if (process.env.NODE_ENV === 'test') {
            gliderAnim.setValue(lensPosition);
          }

          // Only the highlighted tab (icon/label tint, haptic) is discrete
          const clampedIndex = Math.round(lensPosition);

          if (clampedIndex !== visualIndexRef.current) {
            visualIndexRef.current = clampedIndex;
            setDraggedIndex(clampedIndex);

            // Instant crisp mechanical notch feedback
            hapticService.selection();

            tabScaleAnims.forEach((anim, i) => {
              runSpring(anim, i === clampedIndex ? 1.05 : 1, springConfigs.gentle);
            });
          }
        },
        onPanResponderRelease: () => {
          const finalIndex = visualIndexRef.current;
          pendingReleaseIndexRef.current = finalIndex;
          isDraggingRef.current = false;
          stopFollowLoop();
          setDraggedIndex(null);
          dragOffsetRef.current = 0;

          // Settle the lens softly on the tab it is over (keeping its momentum),
          // and relax its shape
          runSpring(
            gliderAnim,
            finalIndex,
            springConfigs.liquidSettle,
            Math.max(-12, Math.min(12, lensVelocityRef.current))
          );
          lensVelocityRef.current = 0;
          relaxLens();

          const targetTab = DOCK_TABS[finalIndex];
          if (targetTab && targetTab.id !== activeTab) {
            onSelectTab(targetTab.id);
          }
        },
        onPanResponderTerminate: () => {
          pendingReleaseIndexRef.current = null;
          setDraggedIndex(null);
          visualIndexRef.current = activeIndex;
          dragOffsetRef.current = 0;
          isDraggingRef.current = false;
          stopFollowLoop();
          lensVelocityRef.current = 0;
          springGliderTo(activeIndex);
          relaxLens();
        },
      }),
    [
      activeIndex,
      activeTab,
      getLensPositionFromScreenX,
      gliderAnim,
      liftAnim,
      onSelectTab,
      relaxLens,
      springGliderTo,
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
    const computedLeft =
      typeof x === 'number' && x > 0
        ? x
        : Math.max(spacing.sm, (currentScreenWidth - (width || defaultWidth)) / 2);
    dockScreenLeftRef.current = computedLeft;

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

  const renderIcon = (id: BFlowWorkspaceTab, focused: boolean) => {
    // Exact iOS 26 color palette: vibrant sapphire blue for active lens tab, crisp secondary text for inactive
    const iconColor = focused ? accentColor : colors.text.secondary;
    const iconSize = focused ? 20 : 19;

    switch (id) {
      case 'summary':
        return <SummaryNavIcon size={iconSize} color={iconColor} focused={focused} />;
      case 'checklist':
        return <ChecklistNavIcon size={iconSize} color={iconColor} focused={focused} />;
      case 'debts':
        return <DebtsNavIcon size={iconSize} color={iconColor} focused={focused} />;
      case 'savings':
        return <SavingsNavIcon size={iconSize} color={iconColor} focused={focused} />;
      case 'analytics':
        return <CierreNavIcon size={iconSize} color={iconColor} focused={focused} />;
      case 'account':
        return <AccountNavIcon size={iconSize} color={iconColor} focused={focused} />;
    }
  };

  const availableWidth = Math.max(0, dockWidth - DOCK_PADDING_H * 2);
  const tabWidth = availableWidth > 0 ? availableWidth / DOCK_TABS.length : 0;
  const lensWidth = Math.max(0, tabWidth - LENS_MARGIN_H * 2);

  const { lensTranslateX, lensScaleX: lensScaleXFinal } = buildLensGeometry({
    gliderAnim,
    liftAnim,
    stretchAnim,
    tabWidth,
    lensWidth,
  });
  const lensScaleY = Animated.multiply(
    liftAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06], extrapolate: 'clamp' }),
    stretchAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92], extrapolate: 'clamp' })
  );
  const lensGlowOpacity = liftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const lens =
    mode === 'dark'
      ? {
          base: 'rgba(255, 255, 255, 0.10)',
          rim: 'rgba(255, 255, 255, 0.14)',
          rimTop: 'rgba(255, 255, 255, 0.20)',
          rimBottom: 'rgba(255, 255, 255, 0.06)',
          glow: 'rgba(120, 170, 255, 0.14)',
          specular: 'rgba(255, 255, 255, 0.025)',
          shade: 'rgba(0, 0, 0, 0.10)',
        }
      : {
          base: 'rgba(206, 224, 247, 0.62)',
          rim: 'rgba(36, 95, 159, 0.16)',
          rimTop: 'rgba(255, 255, 255, 0.35)',
          rimBottom: 'rgba(36, 95, 159, 0.22)',
          glow: 'rgba(36, 95, 159, 0.10)',
          specular: 'rgba(255, 255, 255, 0.10)',
          shade: 'rgba(36, 95, 159, 0.04)',
        };

  return (
    // Full-width anchor: an absolutely positioned view with left/right AND maxWidth pins to the
    // left edge, so the dock is centered by its parent instead (tablets, landscape, browsers).
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 24 : 16,
        left: spacing.sm,
        right: spacing.sm,
        alignItems: 'center',
        zIndex: 999,
      }}
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
          paddingVertical: 3,
          paddingHorizontal: 0,
          overflow: 'hidden',
          backgroundColor: dockBackground,
          borderColor: dockBorder,
          borderWidth: 1,
        }}
      >
        {/* iOS 26 Liquid Glass Lens Glider (Clean Symmetrical Specular Squircle) */}
        {availableWidth > 0 && lensWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            testID="dock-magnifying-lens"
            style={{
              position: 'absolute',
              top: 3,
              bottom: 3,
              left: DOCK_PADDING_H + LENS_MARGIN_H,
              width: lensWidth,
              transform: [
                { translateX: lensTranslateX },
                { scaleX: lensScaleXFinal },
                { scaleY: lensScaleY },
              ],
              borderRadius: radius.pill,
              borderCurve: 'continuous',
              backgroundColor: lens.base,
              borderColor: lens.rim,
              borderTopColor: lens.rimTop,
              borderBottomColor: lens.rimBottom,
              borderWidth: 1,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: mode === 'dark' ? 0.32 : 0.06,
              shadowRadius: 8,
              elevation: 3,
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            {/* Refraction glow: brightens while the lens is lifted by the finger */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                borderRadius: radius.pill,
                backgroundColor: lens.glow,
                opacity: lensGlowOpacity,
              }}
            />
            {/* Specular highlight on the upper edge (simulates curved glass) */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 1,
                left: '12%',
                right: '12%',
                height: '38%',
                borderRadius: radius.pill,
                backgroundColor: lens.specular,
              }}
            />
            {/* Soft inner shade on the lower edge for depth */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: 0,
                left: '8%',
                right: '8%',
                height: '30%',
                borderBottomLeftRadius: radius.pill,
                borderBottomRightRadius: radius.pill,
                backgroundColor: lens.shade,
              }}
            />
          </Animated.View>
        ) : null}

        {/* 6 Workspace Tab Items */}
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
                onPressIn={() => {
                  handleSelectIndex(idx);
                  runSpring(liftAnim, 1, springConfigs.liquidLift);
                }}
                onPressOut={() => {
                  if (!isDraggingRef.current) relaxLens();
                }}
                onPress={() => handleSelectIndex(idx)}
                style={{
                  flex: 1,
                  height: 54,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Animated.View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    transform: [{ scale }],
                  }}
                >
                  {renderIcon(tab.id, isHighlighted)}
                  <AppText
                    variant="micro"
                    color={isHighlighted ? accentColor : colors.text.secondary}
                    style={{
                      fontSize: 10,
                      lineHeight: 13,
                      fontWeight: isHighlighted ? '600' : '500',
                      letterSpacing: -0.2,
                      textAlign: 'center',
                    }}
                  >
                    {tab.label}
                  </AppText>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
    </View>
  );
}
