/**
 * src/design-system/components/IosWheelPickerModal.tsx
 *
 * Apple iOS Native-style vertical cylindrical wheel picker (UIPickerView replica)
 * presented inside an Apple Liquid Glass floating capsule on iOS, a tonal Material 3
 * dialog on Android, and a flat editorial dialog on Web.
 *
 * Smoothness & Apple-grade wheel mechanics:
 * - Native UI-thread cylindrical perspective (`perspective`, `rotateX`, `scale`, `translateY`,
 *   `opacity`) driven by `Animated.ScrollView` (`useNativeDriver: true`) with zero JS-thread
 *   re-renders while scrolling (iOS & Android skins).
 * - Immediate tap-safe rows (`onPress` only, never `onPressIn`) so drag gestures are never
 *   hijacked when starting a scroll.
 * - Instant initial positioning via `contentOffset` + `onLayout` with zero post-open jump.
 * - Spring sheet entrance on iOS (`springConfigs.gentle`), timed fade/scale on Android & Web,
 *   and clean exit animation before unmounting.
 */

import { BlurView } from 'expo-blur';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { hapticService } from '../../platform/haptics/hapticService';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { resolvePresenceSpec } from '../motion/motionSpec';
import { useBFlowTheme } from '../theme/ThemeContext';
import { MIN_TOUCH_TARGET_PT, motionBySkin, motionDistance, springConfigs } from '../tokens';
import { AppPressable } from './AppPressable';
import { AppText } from './Typography';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 220pt
const PADDING_SPACER = ITEM_HEIGHT * 2; // 88pt top & bottom so every option centers in the lens

export interface IosWheelPickerOption<T extends string = string> {
  value: T;
  label: string;
}

export interface IosWheelPickerModalProps<T extends string = string> {
  visible: boolean;
  title?: string;
  options: ReadonlyArray<IosWheelPickerOption<T>>;
  selectedValue: T;
  onConfirm: (value: T) => void;
  onCancel: () => void;
  testID?: string;
}

interface WheelPickerRowProps<T extends string> {
  option: IosWheelPickerOption<T>;
  index: number;
  isSelected: boolean;
  activeIndex: number;
  scrollY: Animated.Value;
  useCylindricalWheel: boolean;
  reducedMotion: boolean;
  textColor: string;
  horizontalPadding: number;
  testID: string;
  onSelect: (index: number, value: T) => void;
}

function WheelPickerRowInner<T extends string>({
  option,
  index,
  isSelected,
  activeIndex,
  scrollY,
  useCylindricalWheel,
  reducedMotion,
  textColor,
  horizontalPadding,
  testID,
  onSelect,
}: WheelPickerRowProps<T>): React.JSX.Element {
  const animatedStyle = useMemo(() => {
    if (!useCylindricalWheel) {
      const distance = Math.abs(index - activeIndex);
      const opacity = isSelected ? 1 : distance === 1 ? 0.55 : 0.24;
      const scale = isSelected ? 1.04 : distance === 1 ? 0.92 : 0.82;
      return {
        opacity,
        transform: [{ scale }],
      };
    }

    const center = index * ITEM_HEIGHT;
    const inputRange = [
      center - 3 * ITEM_HEIGHT,
      center - 2 * ITEM_HEIGHT,
      center - ITEM_HEIGHT,
      center,
      center + ITEM_HEIGHT,
      center + 2 * ITEM_HEIGHT,
      center + 3 * ITEM_HEIGHT,
    ];

    const opacity = scrollY.interpolate({
      inputRange,
      outputRange: reducedMotion
        ? [0.16, 0.35, 0.55, 1, 0.55, 0.35, 0.16]
        : [0.06, 0.22, 0.48, 1, 0.48, 0.22, 0.06],
      extrapolate: 'clamp',
    });

    const scale = scrollY.interpolate({
      inputRange,
      outputRange: reducedMotion
        ? [0.94, 0.96, 0.98, 1.02, 0.98, 0.96, 0.94]
        : [0.66, 0.78, 0.9, 1.08, 0.9, 0.78, 0.66],
      extrapolate: 'clamp',
    });

    if (reducedMotion) {
      return {
        opacity,
        transform: [{ scale }],
      };
    }

    const rotateX = scrollY.interpolate({
      inputRange,
      outputRange: ['-56deg', '-38deg', '-19deg', '0deg', '19deg', '38deg', '56deg'],
      extrapolate: 'clamp',
    });

    const translateY = scrollY.interpolate({
      inputRange,
      outputRange: [-10, -4, -1, 0, 1, 4, 10],
      extrapolate: 'clamp',
    });

    return {
      opacity,
      transform: [{ perspective: 900 }, { translateY }, { rotateX }, { scale }],
    };
  }, [activeIndex, index, isSelected, reducedMotion, scrollY, useCylindricalWheel]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={option.label}
      onPress={() => onSelect(index, option.value)}
      style={{
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: horizontalPadding,
      }}
    >
      <Animated.View
        style={[
          {
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          },
          animatedStyle,
        ]}
      >
        <AppText
          variant="headline"
          color={textColor}
          numberOfLines={1}
          style={{
            fontWeight: '600',
            textAlign: 'center',
            fontSize: 18,
            lineHeight: 22,
            letterSpacing: -0.2,
          }}
        >
          {option.label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

const WheelPickerRow = memo(WheelPickerRowInner) as typeof WheelPickerRowInner;

function clampOptionIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function IosWheelPickerModal<T extends string = string>({
  visible,
  title = 'Seleccionar',
  options,
  selectedValue,
  onConfirm,
  onCancel,
  testID = 'ios-wheel-picker-modal',
}: IosWheelPickerModalProps<T>): React.JSX.Element | null {
  const { colors, spacing, radius, skinSpec, skin, reducedMotion } = useBFlowTheme();
  const { open: sheetOpen, close: sheetClose } = resolvePresenceSpec(
    { skin, reducedMotion },
    'dialog'
  );
  const useCylindricalWheel = skin !== 'web';
  const isSheetPresentation = skin !== 'web';
  const isTonalSurface = skinSpec.surfaceMaterial === 'tonal';
  const sheetSlideDistance = reducedMotion ? 0 : isSheetPresentation ? motionDistance.large : 0;
  const sheetStartScale = reducedMotion ? 1 : isSheetPresentation ? 1 : sheetOpen.scale;

  const initialIndex = useMemo(() => {
    const idx = options.findIndex((opt) => opt.value === selectedValue);
    return idx >= 0 ? idx : 0;
  }, [options, selectedValue]);

  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const initialValue = IS_MOTION_STATIC && visible ? 1 : 0;
  const backdropProgress = useRef(new Animated.Value(initialValue)).current;
  const sheetProgress = useRef(new Animated.Value(initialValue)).current;
  const scrollY = useRef(new Animated.Value(initialIndex * ITEM_HEIGHT)).current;

  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const selectedIndexRef = useRef(initialIndex);
  const tempValueRef = useRef<T>(selectedValue);
  const lastHapticIndexRef = useRef(initialIndex);
  const programmaticTargetRef = useRef<number | null>(null);
  const hasScrolledOnOpenRef = useRef(false);
  const webSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    scrollViewRef.current?.scrollTo({
      y: index * ITEM_HEIGHT,
      animated,
    });
  }, []);

  // Sync wheel position and animate modal sheet open / close
  useEffect(() => {
    if (IS_MOTION_STATIC) {
      if (visible) {
        selectedIndexRef.current = initialIndex;
        tempValueRef.current = selectedValue;
        lastHapticIndexRef.current = initialIndex;
        programmaticTargetRef.current = null;
        scrollY.setValue(initialIndex * ITEM_HEIGHT);
        setActiveIndex(initialIndex);
      }
      mountedRef.current = visible;
      setMounted(visible);
      return undefined;
    }

    if (visible) {
      hasScrolledOnOpenRef.current = false;
      programmaticTargetRef.current = null;
      selectedIndexRef.current = initialIndex;
      tempValueRef.current = selectedValue;
      lastHapticIndexRef.current = initialIndex;
      setActiveIndex(initialIndex);
      scrollY.setValue(initialIndex * ITEM_HEIGHT);
      mountedRef.current = true;
      setMounted(true);

      backdropProgress.setValue(0);
      sheetProgress.setValue(0);

      const backdropAnim = Animated.timing(backdropProgress, {
        toValue: 1,
        duration: sheetOpen.durationMs,
        easing: toEasing(sheetOpen.easing),
        useNativeDriver: USE_NATIVE_DRIVER,
      });

      const sheetAnim =
        motionBySkin[skin].allowsOvershoot && !reducedMotion
          ? Animated.spring(sheetProgress, {
              toValue: 1,
              ...springConfigs.gentle,
              useNativeDriver: USE_NATIVE_DRIVER,
            })
          : Animated.timing(sheetProgress, {
              toValue: 1,
              duration: sheetOpen.durationMs,
              easing: toEasing(sheetOpen.easing),
              useNativeDriver: USE_NATIVE_DRIVER,
            });

      const parallel = Animated.parallel([backdropAnim, sheetAnim]);
      parallel.start();

      const frameId = requestAnimationFrame(() => {
        if (!hasScrolledOnOpenRef.current) {
          hasScrolledOnOpenRef.current = true;
          scrollToIndex(initialIndex, false);
        }
      });

      return () => {
        cancelAnimationFrame(frameId);
        parallel.stop();
        if (webSnapTimerRef.current) {
          clearTimeout(webSnapTimerRef.current);
          webSnapTimerRef.current = null;
        }
      };
    }

    if (!mountedRef.current) return undefined;

    const closeAnim = Animated.parallel([
      Animated.timing(backdropProgress, {
        toValue: 0,
        duration: sheetClose.durationMs,
        easing: toEasing(sheetClose.easing),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(sheetProgress, {
        toValue: 0,
        duration: sheetClose.durationMs,
        easing: toEasing(sheetClose.easing),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    closeAnim.start(({ finished }) => {
      if (finished) {
        mountedRef.current = false;
        setMounted(false);
      }
    });

    return () => closeAnim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex, selectedValue]);

  const handleScrollViewLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      if (!visible || hasScrolledOnOpenRef.current) return;
      hasScrolledOnOpenRef.current = true;
      scrollToIndex(selectedIndexRef.current, false);
    },
    [scrollToIndex, visible]
  );

  const handleScrollListener = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const currentOptions = optionsRef.current;
      const clampedIndex = clampOptionIndex(
        Math.round(offsetY / ITEM_HEIGHT),
        currentOptions.length
      );
      const chosenOption = currentOptions[clampedIndex];

      selectedIndexRef.current = clampedIndex;
      if (chosenOption) {
        tempValueRef.current = chosenOption.value;
      }

      if (!useCylindricalWheel) {
        setActiveIndex((prev) => (prev === clampedIndex ? prev : clampedIndex));
      }

      if (
        programmaticTargetRef.current === null &&
        clampedIndex !== lastHapticIndexRef.current
      ) {
        lastHapticIndexRef.current = clampedIndex;
        hapticService.selection();
      }

      if (Platform.OS === 'web') {
        if (webSnapTimerRef.current) {
          clearTimeout(webSnapTimerRef.current);
        }
        webSnapTimerRef.current = setTimeout(() => {
          const targetY = selectedIndexRef.current * ITEM_HEIGHT;
          if (Math.abs(offsetY - targetY) > 1) {
            scrollToIndex(selectedIndexRef.current, !reducedMotion);
          }
          setActiveIndex(selectedIndexRef.current);
        }, 120);
      }
    },
    [reducedMotion, scrollToIndex, useCylindricalWheel]
  );

  const onScrollEvent = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: USE_NATIVE_DRIVER,
          listener: handleScrollListener,
        }
      ),
    [handleScrollListener, scrollY]
  );

  const handleScrollBeginDrag = useCallback(() => {
    programmaticTargetRef.current = null;
  }, []);

  const handleScrollSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const currentOptions = optionsRef.current;
      const clampedIndex = clampOptionIndex(
        Math.round(offsetY / ITEM_HEIGHT),
        currentOptions.length
      );
      const chosenOption = currentOptions[clampedIndex];

      programmaticTargetRef.current = null;
      selectedIndexRef.current = clampedIndex;
      if (chosenOption) {
        tempValueRef.current = chosenOption.value;
      }
      setActiveIndex(clampedIndex);
    },
    []
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityY = event.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(velocityY) < 0.05) {
        handleScrollSettle(event);
      }
    },
    [handleScrollSettle]
  );

  const handleSelectOptionDirectly = useCallback(
    (index: number, value: T) => {
      programmaticTargetRef.current = index;
      selectedIndexRef.current = index;
      tempValueRef.current = value;
      setActiveIndex(index);

      if (index !== lastHapticIndexRef.current) {
        lastHapticIndexRef.current = index;
        hapticService.selection();
      }

      if (reducedMotion || IS_MOTION_STATIC) {
        scrollY.setValue(index * ITEM_HEIGHT);
        scrollToIndex(index, false);
      } else {
        scrollToIndex(index, true);
      }
    },
    [reducedMotion, scrollToIndex, scrollY]
  );

  const handleConfirm = useCallback(() => {
    hapticService.medium();
    onConfirm(tempValueRef.current);
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    hapticService.light();
    onCancel();
  }, [onCancel]);

  const isVisibleNow = IS_MOTION_STATIC ? visible : mounted;
  if (!isVisibleNow) {
    return null;
  }

  return (
    <Modal
      visible={isVisibleNow}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      testID={testID}
    >
      <View
        style={{
          flex: 1,
          justifyContent: isSheetPresentation ? 'flex-end' : 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingBottom: isSheetPresentation ? (Platform.OS === 'ios' ? 34 : spacing.lg) : spacing.md,
        }}
        testID={`${testID}-container`}
      >
        {/* Animated Scrim */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(0, 0, 0, 0.34)',
              opacity: IS_MOTION_STATIC ? 1 : backdropProgress,
            },
          ]}
        />

        {/* Backdrop Tap to Dismiss */}
        <AppPressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cerrar selector"
          testID={`${testID}-backdrop`}
        />

        {/* Apple Liquid Glass Floating Capsule (iOS) / Material 3 Tonal Sheet (Android) */}
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 416,
            borderRadius: radius.xl,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: isTonalSurface ? 0 : StyleSheet.hairlineWidth,
            borderColor: isTonalSurface ? undefined : colors.glass.specularBorder,
            elevation: isTonalSurface ? 6 : 0,
            overflow: 'hidden',
            opacity: IS_MOTION_STATIC ? 1 : backdropProgress,
            transform: IS_MOTION_STATIC
              ? undefined
              : [
                  {
                    translateY: sheetProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [sheetSlideDistance, 0],
                    }),
                  },
                  {
                    scale: sheetProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [sheetStartScale, 1],
                    }),
                  },
                ],
          }}
          testID={`${testID}-sheet`}
        >
          {/* Blur is Liquid Glass: iOS skin only. Android and Web get the opaque sheet. */}
          {skinSpec.surfaceMaterial === 'liquid-glass' && Platform.OS !== 'web' ? (
            <BlurView
              intensity={colors.glass.blurIntensity}
              tint={colors.glass.blurTint}
              style={StyleSheet.absoluteFill}
            />
          ) : null}

          {/* Subtle iOS Sheet Grabber */}
          {isSheetPresentation ? (
            <View
              style={{
                alignItems: 'center',
                paddingTop: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.glass.specularBorder,
                }}
              />
            </View>
          ) : null}

          {/* Minimalist Glass Header Toolbar */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: spacing.md,
              paddingTop: isSheetPresentation ? spacing.xs : spacing.md,
              paddingBottom: spacing.sm,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.glass.subtleBorder,
            }}
          >
            <AppPressable
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancelar selección"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
              }}
              testID={`${testID}-cancel`}
            >
              <AppText variant="body" color={colors.text.secondary}>
                Cancelar
              </AppText>
            </AppPressable>

            <AppText variant="headline" style={{ fontWeight: '600', letterSpacing: -0.2 }}>
              {title}
            </AppText>

            <AppPressable
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel="Confirmar selección"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
              }}
              testID={`${testID}-confirm`}
            >
              <AppText
                variant="headline"
                color={colors.semantic.income}
                style={{ fontWeight: '600' }}
              >
                Listo
              </AppText>
            </AppPressable>
          </View>

          {/* Continuous Glass Vertical Carousel Area */}
          <View
            style={{
              height: WHEEL_HEIGHT,
              position: 'relative',
              justifyContent: 'center',
            }}
            testID={`${testID}-carousel-area`}
          >
            {/* Center Specular Lens Indicator */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: PADDING_SPACER,
                left: spacing.md,
                right: spacing.md,
                height: ITEM_HEIGHT,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glass.specularBorder,
              }}
              testID={`${testID}-lens`}
            />

            {/* Carousel ScrollView (UI-thread animated on native) */}
            <Animated.ScrollView
              ref={scrollViewRef}
              testID={`${testID}-scroll-view`}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              bounces={!reducedMotion}
              overScrollMode="never"
              snapToInterval={ITEM_HEIGHT}
              snapToAlignment="start"
              decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.985}
              scrollEventThrottle={16}
              contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
              onLayout={handleScrollViewLayout}
              onScroll={onScrollEvent}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollEnd={handleScrollSettle}
              contentContainerStyle={{
                paddingTop: PADDING_SPACER,
                paddingBottom: PADDING_SPACER,
              }}
            >
              {options.map((option, idx) => (
                <WheelPickerRow
                  key={option.value}
                  option={option}
                  index={idx}
                  isSelected={idx === activeIndex}
                  activeIndex={activeIndex}
                  scrollY={scrollY}
                  useCylindricalWheel={useCylindricalWheel}
                  reducedMotion={reducedMotion}
                  textColor={colors.text.primary}
                  horizontalPadding={spacing.md}
                  testID={`${testID}-option-${option.value}`}
                  onSelect={handleSelectOptionDirectly}
                />
              ))}
            </Animated.ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
