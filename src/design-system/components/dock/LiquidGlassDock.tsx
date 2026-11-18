/**
 * iOS dock (ADR 0030): a floating capsule of Liquid Glass with a liquid lens marking the selection.
 *
 * Everything that moves runs on the UI thread (Reanimated 4 + Gesture Handler 3), so a busy JS
 * thread (a heavy tab rendering right after the selection) never drops a frame of the lens:
 *
 * - Touch down anywhere on the dock: the capsule sinks a little and the lens swells into a drop of
 *   clear glass, taller than the dock, magnifying the icon under it.
 * - Drag: the lens follows the finger with a spring retargeted on every touch event (it keeps its
 *   velocity, so it never restarts or stutters), stretches with speed, and the tint of every icon
 *   and label crossfades continuously with the lens distance. A selection tick plays per tab.
 * - Release: the lens settles on the nearest tab keeping the finger's momentum, shrinks back with
 *   one jelly wobble, and the capsule rebounds just past its resting size.
 *
 * Taps still select on touch-down through the tab's own `Pressable` (zero delay, VoiceOver and
 * the tests use it); the gesture only adds the shape of the touch. Reduce Motion: no swelling,
 * sinking or stretching, and the lens jumps to its tab. Under Jest everything is static.
 *
 * Android keeps its flat pill (`FlatPillDock`, ADR 0024).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Svg from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { BFlowWorkspaceTab } from '../../../features/budget/store/useBudgetStore';
import {
  LiquidGlassMaterial,
  isNativeLiquidGlassAvailable,
} from '../../../platform/glass/LiquidGlassMaterial';
import { hapticService } from '../../../platform/haptics/hapticService';
import { IS_MOTION_STATIC } from '../../motion/motionRuntime';
import { useScrollChoreography } from '../../motion/ScrollChoreographyContext';
import { useBFlowTheme } from '../../theme/ThemeContext';
import {
  liquidDockMotion,
  liquidDockPalette,
  scrollMotionBySkin,
  springConfigs,
} from '../../tokens';
import type { FloatingLiquidGlassDockProps } from '../FloatingLiquidGlassDock';
import type { WorkspaceNavIconProps } from '../WorkspaceNavIcons';
import { DockTabIcon } from './DockTabContent';
import {
  DOCK_BOTTOM_OFFSET,
  DOCK_CAPSULE_HEIGHT,
  DOCK_MAX_WIDTH,
  DOCK_PADDING_H,
  DOCK_SURFACE_BORDER,
  DOCK_SURFACE_PADDING_V,
  DOCK_TAB_HEIGHT,
  DOCK_TABS,
  LENS_EDGE_ROOM,
  LENS_MARGIN_H,
} from './dockGeometry';

interface SpringParams {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

/** Inset of the lens from the capsule's outer edge (hairline border + padding). */
const LENS_INSET_V = DOCK_SURFACE_BORDER + DOCK_SURFACE_PADDING_V;
const LENS_LEFT = DOCK_PADDING_H + LENS_MARGIN_H;
const ICON_SIZE = 20;
const LAST_INDEX = DOCK_TABS.length - 1;
const DOCK_HIDDEN_SCALE_IOS = scrollMotionBySkin.ios.dockHiddenScale;

const TAB_COUNT = DOCK_TABS.length;
const PADDING_H = DOCK_PADDING_H;
const MARGIN_H = LENS_MARGIN_H;
// Every worklet that runs on the UI thread lives in THIS file, takes positional arguments and has
// no default parameters. Calling a worklet imported from another module (dockGeometry.ts) aborted
// Expo Go on iOS on launch (ADR 0030 §5). dockGeometry.ts keeps the same math for the JS side and
// the tests, and a parity test checks both stay equal.
const LIFT_SCALE_X = liquidDockMotion.liftScaleX;
const LIFT_SCALE_Y = liquidDockMotion.liftScaleY;
const STRETCH_SCALE_X = liquidDockMotion.stretchScaleX;
const STRETCH_SCALE_Y = liquidDockMotion.stretchScaleY;
const SQUASH_DISTANCE = liquidDockMotion.squashDistance;
const SQUASH_MIN_SCALE = liquidDockMotion.squashMinScale;
const EDGE_ROOM = LENS_EDGE_ROOM;

function tabWidthOf(dockWidth: number): number {
  'worklet';
  const available = Math.max(0, dockWidth - PADDING_H * 2);
  return available > 0 ? available / TAB_COUNT : 0;
}

/**
 * Icon magnification without any bitmap scaling. Each icon's Svg is laid out at its largest size
 * (ICON_RENDER_SCALE × ICON_SIZE) and Reanimated animates its viewBox: a wider viewBox shows the
 * icon smaller. Every change redraws the vector at full resolution, so it stays sharp at every
 * size; a `scale` transform resamples the rasterized icon and looked pixelated on device.
 */
const ICON_MAGNIFY = liquidDockMotion.iconMagnify;
const ICON_RENDER_SCALE = 1 + ICON_MAGNIFY;
/** Side of the icons' own viewBox (WorkspaceNavIcons draw in 0 0 24 24). */
const ICON_VIEWBOX = 24;
const ICON_REST_EXTENT = ICON_VIEWBOX * ICON_RENDER_SCALE;
const ICON_REST_ORIGIN = (ICON_VIEWBOX - ICON_REST_EXTENT) / 2;
const ICON_REST_VIEWBOX = `${ICON_REST_ORIGIN} ${ICON_REST_ORIGIN} ${ICON_REST_EXTENT} ${ICON_REST_EXTENT}`;
const AnimatedSvg = Animated.createAnimatedComponent(Svg) as unknown as NonNullable<
  WorkspaceNavIconProps['svgComponent']
>;

/** 1 when the lens sits on tab `index`, fading linearly to 0 one tab away. */
function proximityTo(lensPosition: number, index: number): number {
  'worklet';
  return Math.max(0, 1 - Math.abs(lensPosition - index));
}

/**
 * Size of a tab icon relative to its laid-out (largest) size: 1 / ICON_RENDER_SCALE at rest, up to
 * exactly 1 when the lifted lens sits on it. Lift is clamped to [0, 1], so the lens springs never
 * push an icon past its laid-out size.
 */
export function iconScaleAt(lensPosition: number, liftValue: number, index: number): number {
  'worklet';
  const lifted = Number.isFinite(liftValue) ? Math.max(0, Math.min(1, liftValue)) : 0;
  const near = Number.isFinite(lensPosition) ? proximityTo(lensPosition, index) : 0;
  return (1 + ICON_MAGNIFY * lifted * near) / ICON_RENDER_SCALE;
}

/** Tab under a local X coordinate of the dock, clamped to the six tabs. */
function tabIndexAt(x: number, dockWidth: number): number {
  'worklet';
  const tabWidth = tabWidthOf(dockWidth);
  if (!(tabWidth > 0) || !Number.isFinite(x)) return 0;
  const index = Math.floor((x - PADDING_H) / tabWidth);
  return Math.max(0, Math.min(TAB_COUNT - 1, index));
}

/** Continuous lens position (tab units, tab i centred at i) under a local X coordinate. */
function lensPositionAt(x: number, dockWidth: number): number {
  'worklet';
  const tabWidth = tabWidthOf(dockWidth);
  if (!(tabWidth > 0) || !Number.isFinite(x)) return 0;
  const raw = (x - PADDING_H) / tabWidth - 0.5;
  return Math.max(0, Math.min(TAB_COUNT - 1, raw));
}


/**
 * Transform of the liquid lens (UI-thread copy of computeLensFrame in dockGeometry.ts; a parity
 * test keeps both equal). The lens swells when lifted and stretches with speed; past the first or
 * last tab its travel is clamped and the overshoot becomes a squash against the wall.
 */
export function lensTransformAt(
  lensPosition: number,
  liftValue: number,
  stretchValue: number,
  dockWidth: number
): { translateX: number; scaleX: number; scaleY: number } {
  'worklet';
  const tabWidth = tabWidthOf(dockWidth);
  const lensWidth = Math.max(0, tabWidth - MARGIN_H * 2);
  if (!Number.isFinite(lensPosition) || !(tabWidth > 0)) {
    return { translateX: 0, scaleX: 1, scaleY: 1 };
  }
  const l = Number.isFinite(liftValue) ? Math.max(-0.4, Math.min(1.4, liftValue)) : 0;
  const st = Number.isFinite(stretchValue) ? Math.max(0, Math.min(1, stretchValue)) : 0;
  const baseScaleX = (1 + (LIFT_SCALE_X - 1) * l) * (1 + STRETCH_SCALE_X * st);
  const baseScaleY = (1 + (LIFT_SCALE_Y - 1) * l) * (1 - STRETCH_SCALE_Y * st);
  const rawX = lensPosition * tabWidth;
  const edgeGrowth = ((baseScaleX - 1) * lensWidth) / 2;
  const minX = edgeGrowth - EDGE_ROOM;
  const maxX = tabWidth * (TAB_COUNT - 1) + EDGE_ROOM - edgeGrowth;
  const pastMax = Math.max(0, rawX - maxX);
  const pastMin = Math.max(0, minX - rawX);
  const overshoot = pastMax + pastMin;
  const squash =
    overshoot > 0 ? 1 - (1 - SQUASH_MIN_SCALE) * Math.min(1, overshoot / SQUASH_DISTANCE) : 1;
  const shift = ((1 - squash) * baseScaleX * lensWidth) / 2;
  return {
    translateX: rawX - pastMax + pastMin + (pastMax > 0 ? shift : 0) - (pastMin > 0 ? shift : 0),
    scaleX: baseScaleX * squash,
    scaleY: baseScaleY * (1 + (1 - squash) * 0.6),
  };
}

/** Spring to a value on the UI thread, or jump there when motion is static. */
function springTo(
  value: SharedValue<number>,
  toValue: number,
  config: SpringParams,
  isStatic: boolean,
  velocity: number
): void {
  'worklet';
  // A NaN that reaches a transform closes the app on iOS (CALayer rejects it): never animate one.
  if (!Number.isFinite(toValue)) return;
  if (isStatic) {
    value.value = toValue;
    return;
  }
  value.value = withSpring(toValue, {
    damping: config.damping,
    stiffness: config.stiffness,
    mass: config.mass,
    velocity: Number.isFinite(velocity) ? velocity : 0,
  });
}

interface LiquidDockTabProps {
  id: BFlowWorkspaceTab;
  label: string;
  index: number;
  isSelected: boolean;
  /** The tab under the lens: the selected one, or the one under the finger while dragging. */
  isHighlighted: boolean;
  position: SharedValue<number>;
  lift: SharedValue<number>;
  accentColor: string;
  restColor: string;
  labelStyle: object;
  minTouchTarget: number;
  onPressInIndex: (index: number) => void;
  onPressIndex: (index: number) => void;
}

/**
 * One destination. Its icon and label switch to the accent colour at once when the lens reaches
 * it (no crossfade: a fading SVG looks pixelated). The icon grows smoothly under the lifted lens,
 * drawn large and scaled down at rest so it stays crisp (see ICON_RENDER_SCALE).
 */
const LiquidDockTab = React.memo(function LiquidDockTab({
  id,
  label,
  index,
  isSelected,
  isHighlighted,
  position,
  lift,
  accentColor,
  restColor,
  labelStyle,
  minTouchTarget,
  onPressInIndex,
  onPressIndex,
}: LiquidDockTabProps): React.JSX.Element {
  const tint = isHighlighted ? accentColor : restColor;
  // viewBox of the 24-unit icon that shows it at the current size, centred.
  const iconSvgProps = useAnimatedProps(() => {
    const extent = ICON_VIEWBOX / iconScaleAt(position.value, lift.value, index);
    const origin = (ICON_VIEWBOX - extent) / 2;
    return { minX: origin, minY: origin, vbWidth: extent, vbHeight: extent };
  });
  // The resting viewBox also goes as a plain prop, so the first paint and every React re-render
  // already draw the icon at its resting size; Reanimated moves it from there.
  const svgProps = useMemo(
    // The web Svg is DOM: its viewBox props are not animatable there, so it stays at rest.
    () =>
      Platform.OS === 'web'
        ? { viewBox: ICON_REST_VIEWBOX }
        : { viewBox: ICON_REST_VIEWBOX, animatedProps: iconSvgProps },
    [iconSvgProps]
  );
  const handlePressIn = useCallback(() => onPressInIndex(index), [index, onPressInIndex]);
  const handlePress = useCallback(() => onPressIndex(index), [index, onPressIndex]);

  return (
    <Pressable
      testID={`workspace-tab-${id}`}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      // react-native-web drops accessibilityState (see AppPressable).
      aria-selected={isSelected}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={{
        flex: 1,
        height: DOCK_TAB_HEIGHT,
        minHeight: minTouchTarget,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <View style={styles.iconSlot}>
          <View testID={`workspace-tab-${id}-icon`} style={styles.iconDrawn}>
            <DockTabIcon
              id={id}
              focused={isHighlighted}
              color={tint}
              size={ICON_SIZE * ICON_RENDER_SCALE}
              svgComponent={AnimatedSvg}
              svgProps={svgProps}
            />
          </View>
        </View>
        <Text allowFontScaling style={[labelStyle, { color: tint }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

export const LiquidGlassDock = React.memo(function LiquidGlassDock({
  activeTab,
  onSelectTab,
  onReselectActiveTab,
  bottomInset = 0,
  testID = 'floating-liquid-glass-dock',
}: FloatingLiquidGlassDockProps): React.JSX.Element {
  const { colors, mode, radius, spacing, reducedMotion, skinSpec, typography } = useBFlowTheme();
  const choreography = useScrollChoreography();
  const palette = liquidDockPalette[mode];
  const nativeGlass = isNativeLiquidGlassAvailable();
  const isStatic = IS_MOTION_STATIC || reducedMotion;
  const fallbackHiddenSV = useSharedValue(0);
  const dockHiddenSV = choreography?.dockHidden ?? fallbackHiddenSV;
  const isScrollChoreoActive = Boolean(choreography?.active && !isStatic);
  const scrollChoreoActiveSV = useSharedValue(isScrollChoreoActive);

  useEffect(() => {
    scrollChoreoActiveSV.value = isScrollChoreoActive;
  }, [isScrollChoreoActive, scrollChoreoActiveSV]);

  const activeIndex = useMemo(() => {
    const idx = DOCK_TABS.findIndex((t) => t.id === activeTab);
    return idx >= 0 ? idx : 0;
  }, [activeTab]);

  const screenWidth = Dimensions.get('window').width;
  const defaultWidth = Math.min(DOCK_MAX_WIDTH, Math.max(304, screenWidth - spacing.sm * 2));
  const [dockWidth, setDockWidth] = useState<number>(defaultWidth);

  // UI-thread state of the dock.
  const position = useSharedValue(activeIndex); // lens position, in tab units
  const lift = useSharedValue(0); // 0 at rest, 1 swollen under the finger
  const press = useSharedValue(0); // 0 at rest, 1 capsule sunk
  const stretch = useSharedValue(0); // 0 still, 1 full drag speed
  const dockWidthSV = useSharedValue(defaultWidth);
  const activeIndexSV = useSharedValue(activeIndex);
  const staticSV = useSharedValue(isStatic);
  const dragging = useSharedValue(false);
  const didDrag = useSharedValue(false);
  const dragOffset = useSharedValue(0);
  const hoverIndex = useSharedValue(activeIndex);

  useEffect(() => {
    staticSV.value = isStatic;
  }, [isStatic, staticSV]);

  // Latest props for the JS callbacks scheduled from the UI thread.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const onSelectTabRef = useRef(onSelectTab);
  onSelectTabRef.current = onSelectTab;
  const onReselectActiveTabRef = useRef(onReselectActiveTab);
  onReselectActiveTabRef.current = onReselectActiveTab;
  const revealDockRef = useRef(choreography?.revealDock);
  revealDockRef.current = choreography?.revealDock;
  const isStaticRef = useRef(isStatic);
  isStaticRef.current = isStatic;

  // Keeps the lens on the tab just picked until the parent's activeTab catches up.
  const pendingReleaseIndexRef = useRef<number | null>(null);
  // Tracks whether the current touch already triggered a tab switch on pressIn,
  // so the trailing onPress does not treat the newly active tab as a reselect-to-top tap.
  const justSelectedTabRef = useRef<BFlowWorkspaceTab | null>(null);
  // Tab drawn in the accent colour: follows the lens tab by tab, never in between.
  const [highlightIndex, setHighlightIndex] = useState(activeIndex);
  // The lens' glass surface over the icons is on only while the lens is touched.
  const [isLensTouched, setLensTouched] = useState(false);

  useEffect(() => {
    activeIndexSV.value = activeIndex;
    if (dragging.value) return;
    if (
      pendingReleaseIndexRef.current !== null &&
      pendingReleaseIndexRef.current !== activeIndex
    ) {
      return;
    }
    pendingReleaseIndexRef.current = null;
    hoverIndex.value = activeIndex;
    setHighlightIndex(activeIndex);
    springTo(position, activeIndex, springConfigs.liquidSettle, isStaticRef.current, 0);
  }, [activeIndex, activeIndexSV, dragging, hoverIndex, position]);

  const selectTabAtIndex = useCallback(
    (index: number, fromPressIn: boolean): boolean => {
      const clamped = Math.max(0, Math.min(LAST_INDEX, index));
      const targetTab = DOCK_TABS[clamped];
      if (!targetTab || targetTab.id === activeTabRef.current) return false;
      if (pendingReleaseIndexRef.current === clamped) return false;
      if (fromPressIn) {
        justSelectedTabRef.current = targetTab.id;
      }
      pendingReleaseIndexRef.current = clamped;
      hoverIndex.value = clamped;
      setHighlightIndex(clamped);
      hapticService.selection();
      springTo(position, clamped, springConfigs.liquidSettle, isStaticRef.current, 0);
      onSelectTabRef.current(targetTab.id);
      return true;
    },
    [hoverIndex, position]
  );

  // Tap: select on touch-down (JS, through the tab's Pressable).
  const handlePressInIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(LAST_INDEX, index));
      const targetTab = DOCK_TABS[clamped];
      if (targetTab && targetTab.id === activeTabRef.current) {
        justSelectedTabRef.current = null;
        return;
      }
      selectTabAtIndex(index, true);
    },
    [selectTabAtIndex]
  );

  const handlePressIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(LAST_INDEX, index));
      const targetTab = DOCK_TABS[clamped];
      if (!targetTab) return;
      if (justSelectedTabRef.current === targetTab.id) {
        justSelectedTabRef.current = null;
        return;
      }
      if (targetTab.id === activeTabRef.current && pendingReleaseIndexRef.current === null) {
        onReselectActiveTabRef.current?.();
        return;
      }
      selectTabAtIndex(index, false);
    },
    [selectTabAtIndex]
  );

  const notifyDockRevealed = useCallback(() => {
    revealDockRef.current?.();
  }, []);

  // Drag callbacks scheduled from the UI thread.
  const handleDragCross = useCallback((index: number) => {
    setHighlightIndex(index);
    hapticService.selection();
  }, []);
  const handleDragRelease = useCallback((index: number) => {
    pendingReleaseIndexRef.current = index;
    setHighlightIndex(index);
    const targetTab = DOCK_TABS[index];
    if (targetTab && targetTab.id !== activeTabRef.current) {
      onSelectTabRef.current(targetTab.id);
    }
  }, []);
  const handleDragCancel = useCallback(() => {
    pendingReleaseIndexRef.current = null;
    setHighlightIndex(activeIndexSV.value);
  }, [activeIndexSV]);
  // A touch that selected nothing (the active tab, the capsule's rim): the lens, which left for
  // the touched spot on touch-down, goes back to the tab that is really selected.
  const handleTouchEnd = useCallback(() => {
    const target = pendingReleaseIndexRef.current ?? activeIndexSV.value;
    hoverIndex.value = target;
    setHighlightIndex(target);
    springTo(position, target, springConfigs.liquidSettle, isStaticRef.current, 0);
  }, [activeIndexSV, hoverIndex, position]);

  const pan = usePanGesture({
    testID: 'dock-pan-gesture',
    // Tests drive the callbacks on the JS thread; on device they are UI-thread worklets.
    runOnJS: IS_MOTION_STATIC,
    // A tap never activates the pan, so the tab's Pressable keeps it.
    activeOffsetX: [-6, 6],
    onBegin: (event) => {
      'worklet';
      const touched = tabIndexAt(event.x, dockWidthSV.value);
      hoverIndex.value = touched;
      scheduleOnRN(setLensTouched, true);
      if (scrollChoreoActiveSV.value && !staticSV.value && dockHiddenSV.value > 0.01) {
        dockHiddenSV.value = withSpring(0, springConfigs.scrollDockReveal);
        scheduleOnRN(notifyDockRevealed);
      }
      if (!staticSV.value) {
        springTo(press, 1, springConfigs.dockPressIn, false, 0);
        springTo(lift, 1, springConfigs.liquidLift, false, 0);
      }
      // The lens leaves for the touched tab right away, without waiting for the JS thread.
      if (touched !== activeIndexSV.value) {
        springTo(position, touched, springConfigs.liquidSettle, staticSV.value, 0);
      }
    },
    onActivate: (event) => {
      'worklet';
      dragging.value = true;
      didDrag.value = true;
      const finger = lensPositionAt(event.x, dockWidthSV.value);
      // No jump when the drag is claimed: the lens keeps its offset to the finger.
      dragOffset.value = Math.max(-0.5, Math.min(0.5, hoverIndex.value - finger));
    },
    onUpdate: (event) => {
      'worklet';
      if (!dragging.value) return;
      const target = Math.max(
        0,
        Math.min(
          LAST_INDEX,
          lensPositionAt(event.x, dockWidthSV.value) + dragOffset.value
        )
      );
      springTo(position, target, springConfigs.liquidFollow, staticSV.value, 0);
      if (!staticSV.value) {
        const tabWidth = tabWidthOf(dockWidthSV.value);
        const speed = tabWidth > 0 ? Math.abs(event.velocityX) / tabWidth : 0;
        springTo(
          stretch,
          Math.min(1, speed / liquidDockMotion.stretchFullSpeed),
          springConfigs.liquidStretch,
          false,
          0
        );
      }
      const index = Math.round(target);
      if (index !== hoverIndex.value) {
        hoverIndex.value = index;
        scheduleOnRN(handleDragCross, index);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      if (!dragging.value) return;
      dragging.value = false;
      springTo(stretch, 0, springConfigs.liquidStretch, staticSV.value, 0);
      if (event.canceled) {
        // Interrupted by the system: back to the tab that is really selected.
        hoverIndex.value = activeIndexSV.value;
        springTo(position, activeIndexSV.value, springConfigs.liquidSettle, staticSV.value, 0);
        scheduleOnRN(handleDragCancel);
        return;
      }
      const finalIndex = hoverIndex.value;
      const tabWidth = tabWidthOf(dockWidthSV.value);
      const limit = liquidDockMotion.maxReleaseVelocity;
      const velocity =
        tabWidth > 0 ? Math.max(-limit, Math.min(limit, event.velocityX / tabWidth)) : 0;
      // Settles on the nearest tab keeping the finger's momentum (the small bounce).
      springTo(position, finalIndex, springConfigs.liquidSettle, staticSV.value, velocity);
      scheduleOnRN(handleDragRelease, finalIndex);
    },
    onFinalize: () => {
      'worklet';
      // The lens shrinks back with a wobble and the capsule rebounds past its resting size.
      springTo(lift, 0, springConfigs.liquidRelease, staticSV.value, 0);
      springTo(press, 0, springConfigs.dockRelease, staticSV.value, 0);
      scheduleOnRN(setLensTouched, false);
      if (!didDrag.value) scheduleOnRN(handleTouchEnd);
      didDrag.value = false;
    },
  });

  const handleDockLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      if (width > 0) {
        setDockWidth(width);
        dockWidthSV.value = width;
      }
    },
    [dockWidthSV]
  );

  const tabWidth = tabWidthOf(dockWidth);
  const lensWidth = Math.max(0, tabWidth - LENS_MARGIN_H * 2);
  const dockTravel = DOCK_CAPSULE_HEIGHT + DOCK_BOTTOM_OFFSET.ios + bottomInset + 24;

  // Never animate opacity on GlassView (ADR 0030 §2.4): retract via translateY + subtle scale only.
  const dockStyle = useAnimatedStyle(() => {
    const pressScale = 1 - (1 - liquidDockMotion.pressScale) * press.value;
    const rawHidden = scrollChoreoActiveSV.value ? dockHiddenSV.value : 0;
    const hidden = Number.isFinite(rawHidden) ? Math.min(1, Math.max(0, rawHidden)) : 0;
    const hideScale = 1 - (1 - DOCK_HIDDEN_SCALE_IOS) * hidden;
    return {
      transform: [
        { translateY: hidden * dockTravel },
        { scale: pressScale * hideScale },
      ],
    };
  }, [dockHiddenSV, dockTravel, press, scrollChoreoActiveSV]);
  const lensStyle = useAnimatedStyle(() => {
    const frame = lensTransformAt(position.value, lift.value, stretch.value, dockWidthSV.value);
    return {
      transform: [
        { translateX: frame.translateX },
        { scaleX: frame.scaleX },
        { scaleY: frame.scaleY },
      ],
    };
  });
  // The resting pill fades as the lens swells into clear glass; the glow does the opposite.
  const lensRestStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.75 * Math.max(0, Math.min(1, lift.value)),
  }));
  const lensGlowStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, lift.value)),
  }));

  const labelStyle = useMemo(
    () => ({
      ...typography.micro,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '500' as const,
      letterSpacing: -0.2,
      textAlign: 'center' as const,
    }),
    [typography.micro]
  );

  const accentColor = colors.accent.primary;
  const restColor = colors.text.secondary;

  // The lens, drawn under the icons.
  const lens =
    lensWidth > 0 ? (
      <Animated.View
        pointerEvents="none"
        testID="dock-magnifying-lens"
        style={[
          {
            position: 'absolute',
            top: LENS_INSET_V,
            bottom: LENS_INSET_V,
            left: LENS_LEFT,
            width: lensWidth,
            borderRadius: radius.pill,
          },
          lensStyle,
        ]}
      >
        <LiquidGlassMaterial
          testID="dock-lens-material"
          variant={palette.lensGlassStyle}
          tintColor={palette.lensGlassTint}
          fallbackColor={palette.lensFallbackFill}
          opaqueColor={palette.lensRestTint}
          colorScheme={mode}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius.pill, backgroundColor: palette.lensRestTint },
            lensRestStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius.pill, backgroundColor: palette.lensGlow },
            lensGlowStyle,
          ]}
        />
        {/*
          Specular highlight and rim: only over the blur fallback. The system glass has its
          own, and 1 px lines scaled with the lifted lens looked blurry.
        */}
        {nativeGlass ? null : (
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 1,
                left: '14%',
                right: '14%',
                height: '36%',
                borderRadius: radius.pill,
                backgroundColor: palette.lensSpecular,
              }}
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: palette.lensRimBottom,
                  borderTopColor: palette.lensRimTop,
                },
              ]}
            />
          </>
        )}
      </Animated.View>
    ) : null;

  return (
    // Full-width anchor: an absolutely positioned view with left/right AND maxWidth pins to the
    // left edge, so the dock is centered by its parent instead (tablets, landscape, browsers).
    // It is also the gesture root, so the dock works wherever it is mounted.
    <GestureHandlerRootView
      testID={`${testID}-anchor`}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: DOCK_BOTTOM_OFFSET.ios + bottomInset,
        left: spacing.sm,
        right: spacing.sm,
        alignItems: 'center',
        zIndex: 999,
      }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          testID={testID}
          accessibilityRole="tablist"
          onLayout={handleDockLayout}
          style={[
            {
              width: '100%',
              maxWidth: DOCK_MAX_WIDTH,
              height: DOCK_CAPSULE_HEIGHT,
              borderRadius: radius.pill,
            },
            dockStyle,
          ]}
        >
          {/* Capsule: the system glass draws its own depth; the blur fallback gets a shadow. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: radius.pill },
              nativeGlass
                ? null
                : {
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: palette.shadowOpacity,
                    shadowRadius: 16,
                  },
            ]}
          >
            {/*
              The system glass rounds itself (its own corner configuration) and draws its own edge
              light: clipping it or drawing a hairline over it gave hard, blurry edges on device.
              Only the blur fallback is clipped and outlined.
            */}
            <View
              testID="dock-glass-capsule"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: radius.pill, borderCurve: 'continuous' },
                nativeGlass
                  ? null
                  : {
                      overflow: 'hidden',
                      borderWidth: DOCK_SURFACE_BORDER,
                      borderColor: palette.dockBorder,
                    },
              ]}
            >
              <LiquidGlassMaterial
                testID="dock-glass-material"
                variant="regular"
                tintColor={palette.dockGlassTint}
                fallbackColor={palette.dockFallbackFill}
                opaqueColor={palette.dockOpaqueFill}
                blurIntensity={palette.dockBlurIntensity}
                colorScheme={mode}
                style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
              />
            </View>
          </View>


          {/* The lens, under the icons: at rest they look exactly as they are. */}
          {lens}

          {/* The six destinations. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: DOCK_PADDING_H },
            ]}
          >
            {DOCK_TABS.map((tab, idx) => (
              <LiquidDockTab
                key={tab.id}
                id={tab.id}
                label={tab.label}
                index={idx}
                isSelected={tab.id === activeTab}
                isHighlighted={idx === highlightIndex}
                position={position}
                lift={lift}
                accentColor={accentColor}
                restColor={restColor}
                labelStyle={labelStyle}
                minTouchTarget={skinSpec.minTouchTarget}
                onPressInIndex={handlePressInIndex}
                onPressIndex={handlePressIndex}
              />
            ))}
          </View>

          {/*
            The lens' glass surface over the icons (system glass only). It has the lens' exact frame
            and motion and is switched off at rest, so a resting icon is never distorted. While the
            lens is touched it morphs into clear glass (system transition) and refracts the icons
            it passes over, as the iOS 26/27 tab bar does; on release it switches off again.
          */}
          {nativeGlass && lensWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              testID="dock-lens-surface"
              style={[
                {
                  position: 'absolute',
                  top: LENS_INSET_V,
                  bottom: LENS_INSET_V,
                  left: LENS_LEFT,
                  width: lensWidth,
                  borderRadius: radius.pill,
                },
                lensStyle,
              ]}
            >
              <LiquidGlassMaterial
                testID="dock-lens-surface-material"
                variant={isLensTouched ? 'clear' : 'none'}
                variantTransitionSeconds={liquidDockMotion.lensSurfaceMorphSeconds}
                tintColor={palette.lensSurfaceTint}
                fallbackColor="transparent"
                opaqueColor="transparent"
                colorScheme={mode}
                style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
              />
            </Animated.View>
          ) : null}

        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  // Keeps the layout of a ICON_SIZE icon; the larger drawn icon is centred over it.
  iconSlot: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconDrawn: {
    width: ICON_SIZE * ICON_RENDER_SCALE,
    height: ICON_SIZE * ICON_RENDER_SCALE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
