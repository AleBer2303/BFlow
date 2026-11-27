import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { hapticService } from '../../platform/haptics/hapticService';
import { IS_MOTION_STATIC, USE_NATIVE_DRIVER, toEasing } from '../motion/motionRuntime';
import { resolvePresenceSpec } from '../motion/motionSpec';
import { useReplayOnChange } from '../motion/useReplayOnChange';
import { useAmountPrivacy } from '../privacy/AmountPrivacyContext';
import { useBFlowTheme } from '../theme/ThemeContext';
import { motionDuration } from '../tokens';
import { AppPressable } from './AppPressable';
import { AccountNavIcon } from './WorkspaceNavIcons';

export interface AccountHeaderAvatarButtonProps {
  /** User profile photo URI (compressed Data URI or HTTPS URL); falls back to AccountNavIcon. */
  photoUrl?: string | null;
  isSelected?: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * Top-right header button for opening the Account workspace view (ADR 0033).
 * Renders the user's profile photo when available, or the minimalist Account vector icon otherwise.
 */
export function AccountHeaderAvatarButton({
  photoUrl,
  isSelected = false,
  onPress,
  testID = 'workspace-tab-account',
}: AccountHeaderAvatarButtonProps): React.JSX.Element {
  const { colors, radius, minTouchTarget, skin } = useBFlowTheme();
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);

  const trimmedPhoto = typeof photoUrl === 'string' ? photoUrl.trim() : '';
  const showPhoto = trimmedPhoto.length > 0 && failedPhotoUrl !== trimmedPhoto;

  return (
    <AppPressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel="Cuenta"
      accessibilityState={{ selected: isSelected }}
      onPressIn={() => hapticService.selection()}
      onPress={onPress}
      style={{
        width: minTouchTarget,
        height: minTouchTarget,
        borderRadius: skin === 'web' ? radius.sm : radius.pill,
        backgroundColor: isSelected ? colors.accent.container : colors.glass.surfaceElevatedTint,
        borderWidth: isSelected ? 1.5 : 1,
        borderColor: isSelected ? colors.accent.primary : colors.glass.specularBorder,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {showPhoto ? (
        <Image
          testID="account-header-avatar-image"
          source={{ uri: trimmedPhoto }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setFailedPhotoUrl(trimmedPhoto)}
        />
      ) : (
        <AccountNavIcon
          testID="account-header-avatar-icon"
          size={20}
          color={isSelected ? colors.accent.primary : colors.text.primary}
          focused={isSelected}
        />
      )}
    </AppPressable>
  );
}

export interface ThemeToggleIconButtonProps {
  testID?: string;
}

/**
 * Minimalist icon-only button (Sun / Moon) for toggling Light and Dark theme modes.
 */
export function ThemeToggleIconButton({
  testID = 'theme-toggle-button',
}: ThemeToggleIconButtonProps): React.JSX.Element {
  const { colors, radius, mode, toggleTheme, minTouchTarget, skin } = useBFlowTheme();
  const isDark = mode === 'dark';
  const strokeColor = colors.text.primary;
  // Icon swap: the new icon turns a quarter and grows into the slot the old one left.
  const swap = useReplayOnChange(mode, motionDuration.fast);
  // Memoized: `swap` is a stable Animated.Value, so re-renders reuse the interpolations (OPT-06).
  const swapStyle = useMemo(
    () => ({
      opacity: swap,
      transform: [
        { rotate: swap.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) },
        { scale: swap.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
      ],
    }),
    [swap]
  );

  return (
    <AppPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onPressIn={() => hapticService.light()}
      onPress={toggleTheme}
      style={{
        width: minTouchTarget,
        height: minTouchTarget,
        // Round on iOS and Android; the web skin keeps its one sharp radius family.
        borderRadius: skin === 'web' ? radius.sm : radius.pill,
        backgroundColor: colors.glass.surfaceElevatedTint,
        borderWidth: 1,
        borderColor: colors.glass.specularBorder,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {isDark ? (
        <Animated.View testID="theme-icon-sun" style={swapStyle}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Circle
              cx={12}
              cy={12}
              r={4.5}
              stroke={strokeColor}
              strokeWidth={1.8}
            />
            <Line x1={12} y1={2} x2={12} y2={4.5} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={12} y1={19.5} x2={12} y2={22} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={4.93} y1={4.93} x2={6.7} y2={6.7} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={17.3} y1={17.3} x2={19.07} y2={19.07} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={2} y1={12} x2={4.5} y2={12} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={19.5} y1={12} x2={22} y2={12} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={4.93} y1={19.07} x2={6.7} y2={17.3} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={17.3} y1={6.7} x2={19.07} y2={4.93} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      ) : (
        <Animated.View testID="theme-icon-moon" style={swapStyle}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              stroke={strokeColor}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      )}
    </AppPressable>
  );
}

/** Eye icon size on screen, drawn from a 24-unit viewBox. */
const EYE_ICON_SIZE = 20;
const EYE_UNIT = EYE_ICON_SIZE / 24;
/** The slash runs from (3.5, 3.5) to (20.5, 20.5) of the viewBox, 1.8 units thick. */
const EYE_SLASH_LENGTH = Math.hypot(17, 17) * EYE_UNIT;
const EYE_SLASH_THICKNESS = 1.8 * EYE_UNIT;
const EYE_SLASH_START = 3.5 * EYE_UNIT;

export interface AmountVisibilityIconButtonProps {
  testID?: string;
}

/**
 * Eye (open / closed) that hides or shows every amount in the app (`AmountPrivacyProvider`).
 * Same touch target as `ThemeToggleIconButton`, but with no fill or border, so the eye sits
 * directly on the card. Hiding draws the slash across the eye and showing erases it.
 */
export function AmountVisibilityIconButton({
  testID = 'amount-visibility-toggle',
}: AmountVisibilityIconButtonProps): React.JSX.Element {
  const { colors, radius, minTouchTarget, skin, reducedMotion } = useBFlowTheme();
  const { amountsHidden, toggleAmountsHidden } = useAmountPrivacy();
  const strokeColor = colors.text.secondary;
  // 1 = slash fully drawn (amounts hidden). The eye is a still SVG: a scaled or faded SVG is
  // rasterised and looked pixelated on the iPhone. The slash is a plain rounded View that
  // grows from its top-left end (scaleX on the native driver), which stays crisp, and works on
  // the web, where an animated SVG prop crashed react-native-svg.
  const slash = useRef(new Animated.Value(amountsHidden ? 1 : 0)).current;

  useEffect(() => {
    const target = amountsHidden ? 1 : 0;
    if (IS_MOTION_STATIC || reducedMotion) {
      slash.setValue(target);
      return undefined;
    }
    const { open, close } = resolvePresenceSpec({ skin, reducedMotion }, 'control');
    const step = amountsHidden ? open : close;
    const animation = Animated.timing(slash, {
      toValue: target,
      duration: step.durationMs,
      easing: toEasing(step.easing),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [amountsHidden, reducedMotion, skin, slash]);

  // The rounded ends would leave a dot at scale 0; the slash is transparent until it starts.
  const slashOpacity = slash.interpolate({
    inputRange: [0, 0.05, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <AppPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={amountsHidden ? 'Mostrar montos' : 'Ocultar montos'}
      accessibilityState={{ selected: amountsHidden }}
      onPressIn={() => hapticService.light()}
      onPress={toggleAmountsHidden}
      style={{
        width: minTouchTarget,
        height: minTouchTarget,
        // Sin fondo ni borde: el ojo se dibuja directo sobre la tarjeta. El área táctil
        // sigue siendo `minTouchTarget` y el radio solo da forma al anillo de foco en Web.
        borderRadius: skin === 'web' ? radius.sm : radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <View
        testID={amountsHidden ? 'amount-visibility-icon-hidden' : 'amount-visibility-icon-visible'}
      >
        <Svg width={EYE_ICON_SIZE} height={EYE_ICON_SIZE} viewBox="0 0 24 24" fill="none">
          <Path
            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
            stroke={strokeColor}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={12} r={3} stroke={strokeColor} strokeWidth={1.8} />
        </Svg>
        <Animated.View
          testID="amount-visibility-slash"
          pointerEvents="none"
          style={{
            position: 'absolute',
            // Its left end sits on (3.5, 3.5) and it turns 45° about that end down to (20.5, 20.5).
            left: EYE_SLASH_START,
            top: EYE_SLASH_START - EYE_SLASH_THICKNESS / 2,
            width: EYE_SLASH_LENGTH,
            height: EYE_SLASH_THICKNESS,
            borderRadius: EYE_SLASH_THICKNESS / 2,
            backgroundColor: strokeColor,
            opacity: slashOpacity,
            transformOrigin: 'left center',
            transform: [{ rotate: '45deg' }, { scaleX: slash }],
          }}
        />
      </View>
    </AppPressable>
  );
}

export interface GoogleLogoIconProps {
  size?: number;
}

/**
 * Official 4-color Google "G" vector emblem for "Continuar con Google" buttons.
 */
export function GoogleLogoIcon({ size = 20 }: GoogleLogoIconProps): React.JSX.Element {
  return (
    <View testID="google-logo-icon" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <Path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <Path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <Path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </Svg>
    </View>
  );
}

export interface EyeIconProps {
  size?: number;
  color?: string;
  testID?: string;
}

/**
 * Minimalist open eye vector icon for revealing password text.
 */
export function EyeIcon({
  size = 20,
  color,
  testID = 'icon-eye-open',
}: EyeIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? colors.text.secondary;

  return (
    <View testID={testID} style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
          stroke={strokeColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={12} cy={12} r={3} stroke={strokeColor} strokeWidth={1.8} />
      </Svg>
    </View>
  );
}

/**
 * Minimalist closed/slash eye vector icon for obscuring password text.
 */
export function EyeOffIcon({
  size = 20,
  color,
  testID = 'icon-eye-closed',
}: EyeIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? colors.text.secondary;

  return (
    <View testID={testID} style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
          stroke={strokeColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line
          x1={1}
          y1={1}
          x2={23}
          y2={23}
          stroke={strokeColor}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

export interface VectorIconProps {
  size?: number;
  color?: string;
  testID?: string;
}

/**
 * Minimalist luxury Trash Bin vector icon (eliminates cheap emojis like 🗑️).
 */
export function TrashBinIcon({
  size = 18,
  color,
  testID = 'icon-trash-bin',
}: VectorIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? colors.semantic.expense;

  return (
    <View testID={testID} style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M3 6h18" stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
        <Path
          d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          stroke={strokeColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line x1={10} y1={11} x2={10} y2={17} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
        <Line x1={14} y1={11} x2={14} y2={17} stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/**
 * Minimalist luxury Pencil Edit vector icon (eliminates cheap emojis like ✏️).
 */
export function PencilEditIcon({
  size = 18,
  color,
  testID = 'icon-pencil-edit',
}: VectorIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? colors.text.secondary;

  return (
    <View testID={testID} style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
          stroke={strokeColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
