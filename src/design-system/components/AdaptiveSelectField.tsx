/**
 * src/design-system/components/AdaptiveSelectField.tsx
 *
 * Platform-adaptive select trigger & option picker encapsulated in the design system:
 * - ios & android: opens `IosWheelPickerModal` from the bottom edge with a 3D cylindrical wheel.
 * - web: opens an origin-aware anchored dropdown menu (`transitions-dev` 05-menu-dropdown +
 *   `transitions-polish` asymmetric timing: 250ms open from scale 0.97, 150ms close to 0.99,
 *   cubic-bezier(0.22, 1, 0.36, 1)) styled in the flat editorial Web system (`design-taste-frontend`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { useBFlowTheme } from '../theme/ThemeContext';
import {
  MIN_TOUCH_TARGET_PT,
  REDUCED_MOTION_DURATION_MS,
  motionDuration,
  motionScale,
  webMotion,
  type CubicBezier,
} from '../tokens';
import { AppPressable, type AppPressableElement } from './AppPressable';
import { IosWheelPickerModal, type IosWheelPickerOption } from './IosWheelPickerModal';
import { AppText } from './Typography';

const DROPDOWN_EASE: CubicBezier = [0.22, 1, 0.36, 1];
const DROPDOWN_ROW_HEIGHT = MIN_TOUCH_TARGET_PT;
const DROPDOWN_PADDING = 6;
const DROPDOWN_MAX_HEIGHT = 276;
const DROPDOWN_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 12;

export interface AdaptiveSelectFieldProps<T extends string = string> {
  label: string;
  title: string;
  options: ReadonlyArray<IosWheelPickerOption<T>>;
  selectedValue: T;
  onSelect: (value: T) => void;
  triggerTestID: string;
  valueTestID?: string;
  pickerTestID: string;
  accessibilityLabel: string;
  containerStyle?: StyleProp<ViewStyle>;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  origin: 'top center' | 'bottom center';
}

const DEFAULT_ANCHOR: AnchorRect = {
  top: 140,
  left: 16,
  width: 220,
  maxHeight: DROPDOWN_MAX_HEIGHT,
  origin: 'top center',
};

type WebOnlyTransitionStyle = ViewStyle & {
  transitionProperty?: string;
  transitionDuration?: string;
  transitionTimingFunction?: string;
  boxShadow?: string;
  cursor?: string;
};

interface WebDropdownOptionRowProps<T extends string> {
  option: IosWheelPickerOption<T>;
  isSelected: boolean;
  onSelect: (value: T) => void;
  testID: string;
}

function WebDropdownOptionRow<T extends string>({
  option,
  isSelected,
  onSelect,
  testID,
}: WebDropdownOptionRowProps<T>): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();
  const [hovered, setHovered] = useState(false);

  const rowTransition: WebOnlyTransitionStyle =
    Platform.OS === 'web'
      ? {
          transitionProperty: 'background-color, color',
          transitionDuration: `${hovered ? webMotion.hoverInMs : webMotion.hoverOutMs}ms`,
          transitionTimingFunction: webMotion.easing,
          cursor: 'pointer',
        }
      : {};

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={option.label}
      onPress={() => onSelect(option.value)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        {
          minHeight: DROPDOWN_ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          borderRadius: radius.sm,
          backgroundColor:
            pressed || hovered || isSelected ? colors.glass.surfaceTint : 'transparent',
        },
        rowTransition,
      ]}
    >
      <AppText
        variant="callout"
        color={isSelected ? colors.text.primary : colors.text.secondary}
        numberOfLines={1}
        style={{
          fontSize: 14,
          lineHeight: 20,
          fontWeight: isSelected ? '600' : '400',
        }}
      >
        {option.label}
      </AppText>
      {isSelected ? (
        <AppText
          variant="callout"
          color={colors.semantic.income}
          style={{ fontWeight: '700', marginLeft: spacing.sm }}
        >
          ✓
        </AppText>
      ) : null}
    </Pressable>
  );
}

interface WebDropdownMenuProps<T extends string> {
  visible: boolean;
  options: ReadonlyArray<IosWheelPickerOption<T>>;
  selectedValue: T;
  anchor: AnchorRect;
  onSelect: (value: T) => void;
  onClose: () => void;
  testID: string;
}

function WebDropdownMenu<T extends string>({
  visible,
  options,
  selectedValue,
  anchor,
  onSelect,
  onClose,
  testID,
}: WebDropdownMenuProps<T>): React.JSX.Element | null {
  const { colors, radius, mode, reducedMotion } = useBFlowTheme();
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const progress = useRef(new Animated.Value(IS_MOTION_STATIC && visible ? 1 : 0)).current;
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const hasScrolledRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  const selectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.value === selectedValue);
    return idx >= 0 ? idx : 0;
  }, [options, selectedValue]);

  useEffect(() => {
    if (IS_MOTION_STATIC) {
      mountedRef.current = visible;
      setMounted(visible);
      setIsClosing(false);
      return undefined;
    }

    if (visible) {
      hasScrolledRef.current = false;
      setIsClosing(false);
      mountedRef.current = true;
      setMounted(true);
      progress.setValue(0);

      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: reducedMotion ? REDUCED_MOTION_DURATION_MS : motionDuration.fast,
        easing: toEasing(DROPDOWN_EASE),
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      anim.start();
      return () => anim.stop();
    }

    if (!mountedRef.current) return undefined;

    setIsClosing(true);
    const closeAnim = Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? REDUCED_MOTION_DURATION_MS : motionDuration.quick,
      easing: toEasing(DROPDOWN_EASE),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    closeAnim.start(({ finished }) => {
      if (finished) {
        mountedRef.current = false;
        setIsClosing(false);
        setMounted(false);
      }
    });
    return () => closeAnim.stop();
  }, [progress, reducedMotion, visible]);

  // Escape key closes the dropdown on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || typeof window === 'undefined') {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, visible]);

  const handleScrollLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      if (!visible || hasScrolledRef.current) return;
      hasScrolledRef.current = true;
      const targetOffset = Math.max(0, selectedIndex * DROPDOWN_ROW_HEIGHT - DROPDOWN_ROW_HEIGHT * 2);
      scrollViewRef.current?.scrollTo({ y: targetOffset, animated: false });
    },
    [selectedIndex, visible]
  );

  const isVisibleNow = IS_MOTION_STATIC ? visible : mounted;
  if (!isVisibleNow) {
    return null;
  }

  const startScale = reducedMotion ? 1 : isClosing ? motionScale.menuClose : motionScale.menu;
  const webShadowStyle: WebOnlyTransitionStyle =
    Platform.OS === 'web'
      ? {
          boxShadow:
            mode === 'dark'
              ? '0 14px 34px rgba(0, 0, 0, 0.52)'
              : '0 10px 28px rgba(17, 24, 39, 0.12)',
        }
      : {};

  return (
    <Modal
      visible={isVisibleNow}
      transparent
      animationType="none"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={StyleSheet.absoluteFill} testID={`${testID}-container`}>
        {/* Click-outside backdrop */}
        <AppPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar lista"
          pressEffect="none"
          testID={`${testID}-backdrop`}
        />

        {/* Anchored Web Dropdown Menu (transitions-dev 05-menu-dropdown) */}
        <Animated.View
          testID={`${testID}-sheet`}
          style={[
            {
              position: 'absolute',
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
              borderRadius: radius.md,
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
              padding: DROPDOWN_PADDING,
              overflow: 'hidden',
              transformOrigin: anchor.origin,
              opacity: IS_MOTION_STATIC ? 1 : progress,
              transform: IS_MOTION_STATIC
                ? undefined
                : [
                    {
                      scale: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [startScale, 1],
                      }),
                    },
                  ],
            },
            webShadowStyle,
          ]}
        >
          <ScrollView
            ref={scrollViewRef}
            testID={`${testID}-scroll-view`}
            showsVerticalScrollIndicator
            onLayout={handleScrollLayout}
            style={{ maxHeight: anchor.maxHeight - DROPDOWN_PADDING * 2 }}
          >
            {options.map((option) => (
              <WebDropdownOptionRow
                key={option.value}
                option={option}
                isSelected={option.value === selectedValue}
                onSelect={onSelect}
                testID={`${testID}-option-${option.value}`}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function AdaptiveSelectField<T extends string = string>({
  label,
  title,
  options,
  selectedValue,
  onSelect,
  triggerTestID,
  valueTestID,
  pickerTestID,
  accessibilityLabel,
  containerStyle,
}: AdaptiveSelectFieldProps<T>): React.JSX.Element {
  const { colors, radius, spacing, skin, reducedMotion } = useBFlowTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect>(DEFAULT_ANCHOR);
  const triggerRef = useRef<AppPressableElement>(null);

  const selectedLabel = useMemo(() => {
    return options.find((opt) => opt.value === selectedValue)?.label ?? selectedValue;
  }, [options, selectedValue]);

  const computeAnchorAndOpen = useCallback(() => {
    if (skin !== 'web') {
      setIsOpen(true);
      return;
    }

    const computeMenuRect = (left: number, top: number, width: number, height: number): AnchorRect => {
      const bottom = top + height;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const estimatedContentHeight = Math.min(
        DROPDOWN_MAX_HEIGHT,
        options.length * DROPDOWN_ROW_HEIGHT + DROPDOWN_PADDING * 2
      );
      const spaceBelow = viewportHeight - bottom - VIEWPORT_MARGIN_PX;
      const openUpward = spaceBelow < Math.min(estimatedContentHeight, 200) && top > spaceBelow;
      const maxHeight = Math.max(
        160,
        Math.min(
          DROPDOWN_MAX_HEIGHT,
          openUpward ? top - VIEWPORT_MARGIN_PX - DROPDOWN_GAP_PX : spaceBelow - DROPDOWN_GAP_PX
        )
      );
      const menuHeight = Math.min(estimatedContentHeight, maxHeight);
      const resolvedTop = openUpward
        ? Math.max(VIEWPORT_MARGIN_PX, top - menuHeight - DROPDOWN_GAP_PX)
        : bottom + DROPDOWN_GAP_PX;
      const resolvedWidth = Math.max(width, 160);
      const resolvedLeft = Math.max(
        VIEWPORT_MARGIN_PX,
        Math.min(left, viewportWidth - resolvedWidth - VIEWPORT_MARGIN_PX)
      );

      return {
        top: resolvedTop,
        left: resolvedLeft,
        width: resolvedWidth,
        maxHeight,
        origin: openUpward ? 'bottom center' : 'top center',
      };
    };

    const node = triggerRef.current as unknown as {
      getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;

    if (typeof node?.getBoundingClientRect === 'function') {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setAnchor(computeMenuRect(rect.left, rect.top, rect.width, rect.height));
        setIsOpen(true);
        return;
      }
    }

    setAnchor(DEFAULT_ANCHOR);
    setIsOpen(true);

    if (typeof node?.measureInWindow === 'function') {
      node.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          setAnchor(computeMenuRect(x, y, w, h));
        }
      });
    }
  }, [options.length, skin]);

  const handleToggleTrigger = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    computeAnchorAndOpen();
  }, [computeAnchorAndOpen, isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelectValue = useCallback(
    (value: T) => {
      onSelect(value);
      setIsOpen(false);
    },
    [onSelect]
  );

  const chevronStyle: WebOnlyTransitionStyle =
    skin === 'web'
      ? {
          transform: [{ scaleY: isOpen ? -1 : 1 }],
          ...(Platform.OS === 'web'
            ? {
                transitionProperty: 'transform',
                transitionDuration: `${reducedMotion ? 0 : motionDuration.fast}ms`,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }
            : null),
        }
      : {};

  return (
    <View style={[{ gap: spacing.xxs }, containerStyle]}>
      <AppText variant="caption" color={colors.text.secondary}>
        {label}
      </AppText>

      <AppPressable
        ref={triggerRef}
        testID={triggerTestID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: isOpen }}
        onPress={handleToggleTrigger}
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor:
            isOpen && skin === 'web' ? colors.glass.specularBorder : colors.glass.subtleBorder,
        }}
      >
        <AppText
          testID={valueTestID}
          variant="body"
          numberOfLines={1}
          style={{ fontWeight: '600' }}
        >
          {selectedLabel}
        </AppText>
        <View style={[{ marginLeft: spacing.xs }, chevronStyle]}>
          <AppText variant="caption" color={colors.text.secondary}>
            ▼
          </AppText>
        </View>
      </AppPressable>

      {skin === 'web' ? (
        <WebDropdownMenu
          visible={isOpen}
          options={options}
          selectedValue={selectedValue}
          anchor={anchor}
          onSelect={handleSelectValue}
          onClose={handleClose}
          testID={pickerTestID}
        />
      ) : (
        <IosWheelPickerModal
          visible={isOpen}
          title={title}
          options={options}
          selectedValue={selectedValue}
          onConfirm={handleSelectValue}
          onCancel={handleClose}
          testID={pickerTestID}
        />
      )}
    </View>
  );
}
