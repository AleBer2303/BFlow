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

export const DOCK_TABS: ReadonlyArray<DockTabConfig> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'debts', label: 'Deudas' },
  { id: 'savings', label: 'Ahorros' },
  { id: 'analytics', label: 'Cierre' },
  { id: 'account', label: 'Cuenta' },
];

export const DOCK_PADDING_H = 6;
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
  const screenWidth = Dimensions.get('window').width;
  const defaultWidth = Math.min(580, Math.max(320, screenWidth - spacing.sm * 2));
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

    Animated.spring(gliderAnim, {
      toValue: activeIndex,
      damping: springConfigs.snappy.damping,
      stiffness: springConfigs.snappy.stiffness,
      mass: springConfigs.snappy.mass,
      useNativeDriver: true,
    }).start();

    tabScaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === activeIndex ? 1.05 : 1,
        damping: springConfigs.snappy.damping,
        stiffness: springConfigs.snappy.stiffness,
        mass: springConfigs.snappy.mass,
        useNativeDriver: true,
      }).start();
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

        if (process.env.NODE_ENV !== 'test') {
          Animated.spring(gliderAnim, {
            toValue: clamped,
            damping: springConfigs.snappy.damping,
            stiffness: springConfigs.snappy.stiffness,
            mass: springConfigs.snappy.mass,
            useNativeDriver: true,
          }).start();

          tabScaleAnims.forEach((anim, i) => {
            Animated.spring(anim, {
              toValue: i === clamped ? 1.05 : 1,
              damping: springConfigs.snappy.damping,
              stiffness: springConfigs.snappy.stiffness,
              mass: springConfigs.snappy.mass,
              useNativeDriver: true,
            }).start();
          });
        } else {
          gliderAnim.setValue(clamped);
        }

        onSelectTab(targetTab.id);
      }
    },
    [activeTab, gliderAnim, onSelectTab, tabScaleAnims]
  );

  // Precise mapping from absolute screen X coordinate to tab index
  const getIndexFromScreenX = useCallback(
    (screenX: number): number => {
      return getDockIndexFromScreenX(screenX, dockScreenLeftRef.current, dockWidth);
    },
    [dockWidth]
  );

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
          const initialIndex = getIndexFromScreenX(currentX);
          visualIndexRef.current = initialIndex;
          setDraggedIndex(initialIndex);

          if (process.env.NODE_ENV !== 'test') {
            Animated.spring(gliderAnim, {
              toValue: initialIndex,
              damping: springConfigs.snappy.damping,
              stiffness: springConfigs.snappy.stiffness,
              mass: springConfigs.snappy.mass,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderMove: (event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          const currentScreenX =
            event.nativeEvent.pageX ??
            gestureState.moveX ??
            (gestureState.x0 + gestureState.dx);
          const clampedIndex = getIndexFromScreenX(currentScreenX);

          if (clampedIndex !== visualIndexRef.current) {
            visualIndexRef.current = clampedIndex;
            setDraggedIndex(clampedIndex);

            // Instant crisp mechanical notch feedback
            hapticService.selection();

            // Fluid native spring slider follows finger immediately
            if (process.env.NODE_ENV !== 'test') {
              Animated.spring(gliderAnim, {
                toValue: clampedIndex,
                damping: springConfigs.snappy.damping,
                stiffness: springConfigs.snappy.stiffness,
                mass: springConfigs.snappy.mass,
                useNativeDriver: true,
              }).start();

              tabScaleAnims.forEach((anim, i) => {
                Animated.spring(anim, {
                  toValue: i === clampedIndex ? 1.05 : 1,
                  damping: springConfigs.snappy.damping,
                  stiffness: springConfigs.snappy.stiffness,
                  mass: springConfigs.snappy.mass,
                  useNativeDriver: true,
                }).start();
              });
            }
          }
        },
        onPanResponderRelease: () => {
          const finalIndex = visualIndexRef.current;
          pendingReleaseIndexRef.current = finalIndex;
          setDraggedIndex(null);

          const targetTab = DOCK_TABS[finalIndex];
          if (targetTab && targetTab.id !== activeTab) {
            onSelectTab(targetTab.id);
          }
        },
        onPanResponderTerminate: () => {
          pendingReleaseIndexRef.current = null;
          setDraggedIndex(null);
          visualIndexRef.current = activeIndex;
          if (process.env.NODE_ENV !== 'test') {
            Animated.spring(gliderAnim, {
              toValue: activeIndex,
              damping: springConfigs.snappy.damping,
              stiffness: springConfigs.snappy.stiffness,
              mass: springConfigs.snappy.mass,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [activeIndex, activeTab, getIndexFromScreenX, gliderAnim, onSelectTab, tabScaleAnims]
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
    const iconColor = focused ? '#388AF6' : colors.text.secondary;
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

  const gliderTranslateX = gliderAnim.interpolate({
    inputRange: [0, DOCK_TABS.length - 1],
    outputRange: [0, tabWidth * (DOCK_TABS.length - 1)],
  });

  return (
    <View
      ref={dockRef}
      testID={testID}
      accessibilityRole="tablist"
      style={{
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 24 : 16,
        left: spacing.sm,
        right: spacing.sm,
        maxWidth: 580,
        alignSelf: 'center',
        zIndex: 999,
        elevation: 8,
        borderRadius: radius.pill,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: mode === 'dark' ? 0.35 : 0.12,
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
          backgroundColor: colors.glass.surfaceElevatedTint,
          borderColor: colors.glass.specularBorder,
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
              transform: [{ translateX: gliderTranslateX }],
              borderRadius: radius.lg,
              borderCurve: 'continuous',
              backgroundColor:
                mode === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.78)',
              borderColor:
                mode === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)',
              borderWidth: 1,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: mode === 'dark' ? 0.28 : 0.08,
              shadowRadius: 5,
              elevation: 3,
              zIndex: 1,
            }}
          />
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
                onPressIn={() => handleSelectIndex(idx)}
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
                    color={isHighlighted ? '#388AF6' : colors.text.secondary}
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
  );
}
