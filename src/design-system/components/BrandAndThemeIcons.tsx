import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useBFlowTheme } from '../theme/ThemeContext';
import { MIN_TOUCH_TARGET_PT } from '../tokens';

export interface ThemeToggleIconButtonProps {
  testID?: string;
}

/**
 * Minimalist icon-only button (Sun / Moon) for toggling Light and Dark theme modes.
 */
export function ThemeToggleIconButton({
  testID = 'theme-toggle-button',
}: ThemeToggleIconButtonProps): React.JSX.Element {
  const { colors, radius, mode, toggleTheme } = useBFlowTheme();
  const isDark = mode === 'dark';
  const strokeColor = colors.text.primary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onPress={toggleTheme}
      style={{
        width: MIN_TOUCH_TARGET_PT,
        height: MIN_TOUCH_TARGET_PT,
        borderRadius: radius.pill,
        backgroundColor: colors.glass.surfaceElevatedTint,
        borderWidth: 1,
        borderColor: colors.glass.specularBorder,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {isDark ? (
        <View testID="theme-icon-sun">
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
        </View>
      ) : (
        <View testID="theme-icon-moon">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              stroke={strokeColor}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      )}
    </Pressable>
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
