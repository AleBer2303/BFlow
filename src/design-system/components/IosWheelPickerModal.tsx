/**
 * src/design-system/components/IosWheelPickerModal.tsx
 *
 * Apple iOS Native-style vertical carousel wheel picker (UIPickerView replica)
 * presented inside an ultra-subtle Apple Liquid Glass floating capsule.
 *
 * Calibrated for all modern iPhones including iPhone 16 Pro Max (440pt width):
 * - Generous breathing room (maxWidth 416pt, ample padding and touch clearance)
 * - Razor-sharp Retina hairline specular borders (StyleSheet.hairlineWidth)
 * - True translucent blur backdrop (BlurView from expo-blur) on the iOS skin; an opaque sheet
 *   in the tokens of the skin on Android and Web
 * - Ultra-subtle backdrop attenuation (rgba(0, 0, 0, 0.28)) and tap-to-dismiss
 * - Floating glass capsule with radius.xl (28pt)
 * - Continuous glass optical refraction (zero opaque inner view blocks)
 * - Dynamic opacity and cylindrical perspective scale hierarchy
 * - Subtle native haptic feedback (expo-haptics)
 */

import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { hapticService } from '../../platform/haptics/hapticService';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { resolvePresenceSpec } from '../motion/motionSpec';
import { useBFlowTheme } from '../theme/ThemeContext';
import { AppPressable } from './AppPressable';
import { MIN_TOUCH_TARGET_PT } from '../tokens';
import { AppText } from './Typography';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 220pt
const PADDING_SPACER = ITEM_HEIGHT * 2; // 88pt top & bottom to allow all items to center

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

export function IosWheelPickerModal<T extends string = string>({
  visible,
  title = 'Seleccionar',
  options,
  selectedValue,
  onConfirm,
  onCancel,
  testID = 'ios-wheel-picker-modal',
}: IosWheelPickerModalProps<T>): React.JSX.Element {
  const { colors, spacing, radius, skinSpec, skin, reducedMotion } = useBFlowTheme();
  const sheetOpen = resolvePresenceSpec({ skin, reducedMotion }, 'dialog').open;
  const sheetProgress = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  const initialIndex = useMemo(() => {
    const idx = options.findIndex((opt) => opt.value === selectedValue);
    return idx >= 0 ? idx : 0;
  }, [options, selectedValue]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [tempValue, setTempValue] = useState<T>(selectedValue);
  const lastHapticIndexRef = useRef(initialIndex);

  // Sync internal state when modal opens
  useEffect(() => {
    if (!visible) return;

    setActiveIndex(initialIndex);
    setTempValue(selectedValue);
    lastHapticIndexRef.current = initialIndex;

    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: initialIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [visible, initialIndex, selectedValue]);

  const triggerWheelHaptic = () => {
    hapticService.selection();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const computedIndex = Math.round(offsetY / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(computedIndex, options.length - 1));

    if (clampedIndex !== activeIndex) {
      setActiveIndex(clampedIndex);
      const chosenOption = options[clampedIndex];
      if (chosenOption) {
        setTempValue(chosenOption.value);
      }
      if (clampedIndex !== lastHapticIndexRef.current) {
        lastHapticIndexRef.current = clampedIndex;
        triggerWheelHaptic();
      }
    }
  };

  const handleSelectOptionDirectly = (index: number, value: T) => {
    setActiveIndex(index);
    setTempValue(value);
    scrollViewRef.current?.scrollTo({
      y: index * ITEM_HEIGHT,
      animated: true,
    });
    if (index !== lastHapticIndexRef.current) {
      lastHapticIndexRef.current = index;
      triggerWheelHaptic();
    }
  };

  // The backdrop fades with the modal; the sheet rises from the edge (iOS) or grows in place
  // (Android, Web) each time it opens. Closing is the modal's own quick fade.
  useEffect(() => {
    if (!visible || IS_MOTION_STATIC) return undefined;
    sheetProgress.setValue(0);
    const animation = Animated.timing(sheetProgress, {
      toValue: 1,
      duration: sheetOpen.durationMs,
      easing: toEasing(sheetOpen.easing),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
    // The spec only changes with the skin or the Reduce Motion setting, never while open.
  }, [visible, sheetProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = () => {
    hapticService.medium();
    onConfirm(tempValue);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      testID={testID}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingBottom: Platform.OS === 'ios' ? 36 : spacing.xxl,
          backgroundColor: 'rgba(0, 0, 0, 0.28)',
        }}
        testID={`${testID}-container`}
      >
        {/* Backdrop Tap to Dismiss */}
        <AppPressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cerrar selector"
          testID={`${testID}-backdrop`}
        />

        {/* Ultra-Subtle Apple Liquid Glass Floating Capsule */}
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 416,
            borderRadius: radius.xl,
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glass.specularBorder,
            overflow: 'hidden',
            transform: [
              {
                translateY: sheetProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sheetOpen.distance, 0],
                }),
              },
              {
                scale: sheetProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sheetOpen.scale, 1],
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

          {/* Minimalist Glass Header Toolbar */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.sm,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.glass.subtleBorder,
            }}
          >
            <AppPressable
              onPressIn={() => hapticService.light()}
              onPress={onCancel}
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
                left: spacing.lg,
                right: spacing.lg,
                height: ITEM_HEIGHT,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glass.specularBorder,
              }}
              testID={`${testID}-lens`}
            />

            {/* Carousel ScrollView */}
            <ScrollView
              ref={scrollViewRef}
              testID={`${testID}-scroll-view`}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={handleScroll}
              contentContainerStyle={{
                paddingTop: PADDING_SPACER,
                paddingBottom: PADDING_SPACER,
              }}
            >
              {options.map((option, idx) => {
                const distance = Math.abs(idx - activeIndex);
                const isSelected = distance === 0;

                // High-resolution perspective & opacity hierarchy
                const opacity = isSelected ? 1 : distance === 1 ? 0.42 : 0.16;
                const scale = isSelected ? 1.02 : distance === 1 ? 0.94 : 0.86;

                return (
                  <AppPressable
                    key={option.value}
                    testID={`${testID}-option-${option.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={option.label}
                    onPressIn={() => handleSelectOptionDirectly(idx, option.value)}
                    onPress={() => handleSelectOptionDirectly(idx, option.value)}
                    style={{
                      height: ITEM_HEIGHT,
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: spacing.md,
                      transform: [{ scale }],
                      opacity,
                    }}
                  >
                    <AppText
                      variant={isSelected ? 'headline' : 'body'}
                      color={isSelected ? colors.text.primary : colors.text.secondary}
                      style={{
                        fontWeight: isSelected ? '600' : '400',
                        textAlign: 'center',
                        fontSize: isSelected ? 18 : 15,
                        lineHeight: isSelected ? 24 : 20,
                      }}
                    >
                      {option.label}
                    </AppText>
                  </AppPressable>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
