import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useBFlowTheme } from '../theme/ThemeContext';

export interface WorkspaceNavIconProps {
  size?: number;
  color?: string;
  focused?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Summary / Dashboard icon: Balanced bento grid representing financial overview.
 */
export function SummaryNavIcon({
  size = 20,
  color,
  focused = false,
  style,
  testID = 'nav-icon-summary',
}: WorkspaceNavIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? (focused ? colors.text.primary : colors.text.muted);
  const strokeWidth = focused ? 2 : 1.7;

  return (
    <View testID={testID} style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect
          x={3}
          y={3}
          width={8}
          height={10}
          rx={2.5}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={focused ? colors.glass.specularBorder : 'none'}
        />
        <Rect
          x={13}
          y={3}
          width={8}
          height={6}
          rx={2.5}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
        <Rect
          x={3}
          y={15}
          width={8}
          height={6}
          rx={2.5}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
        <Rect
          x={13}
          y={11}
          width={8}
          height={10}
          rx={2.5}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={focused ? colors.glass.specularBorder : 'none'}
        />
      </Svg>
    </View>
  );
}

/**
 * Checklist icon: Task list with subtle check marks.
 */
export function ChecklistNavIcon({
  size = 20,
  color,
  focused = false,
  style,
  testID = 'nav-icon-checklist',
}: WorkspaceNavIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? (focused ? colors.text.primary : colors.text.muted);
  const strokeWidth = focused ? 2 : 1.7;

  return (
    <View testID={testID} style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 6h11M9 12h11M9 18h11"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Path
          d="M3.5 6.2l1.3 1.3 2.7-2.7"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M3.5 12.2l1.3 1.3 2.7-2.7"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M3.5 18.2l1.3 1.3 2.7-2.7"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * Debts icon: Payment cards / balance amortizations.
 */
export function DebtsNavIcon({
  size = 20,
  color,
  focused = false,
  style,
  testID = 'nav-icon-debts',
}: WorkspaceNavIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? (focused ? colors.text.primary : colors.text.muted);
  const strokeWidth = focused ? 2 : 1.7;

  return (
    <View testID={testID} style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect
          x={2}
          y={5}
          width={20}
          height={14}
          rx={3}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={focused ? colors.glass.specularBorder : 'none'}
        />
        <Path
          d="M2 10h20"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={6.5}
          cy={15}
          r={1.2}
          fill={strokeColor}
        />
        <Path
          d="M14 15h4"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

/**
 * Savings icon: Piggy bank / vault with top coin slot.
 */
export function SavingsNavIcon({
  size = 20,
  color,
  focused = false,
  style,
  testID = 'nav-icon-savings',
}: WorkspaceNavIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? (focused ? colors.text.primary : colors.text.muted);
  const strokeWidth = focused ? 2 : 1.7;

  return (
    <View testID={testID} style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M19 12c0-3.87-3.13-7-7-7a7.003 7.003 0 0 0-6.84 5.54C3.89 10.93 3 12.04 3 13.5 3 15.43 4.57 17 6.5 17H7v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2h2v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2.07c2.28-.9 3.9-3.08 4-5.68l.1-.25z"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={focused ? colors.glass.specularBorder : 'none'}
        />
        <Path
          d="M10 8h4"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Circle
          cx={14.5}
          cy={11.5}
          r={0.9}
          fill={strokeColor}
        />
      </Svg>
    </View>
  );
}

/**
 * Cierre / Analytics icon: Safe lock with month verification check.
 */
export function CierreNavIcon({
  size = 20,
  color,
  focused = false,
  style,
  testID = 'nav-icon-cierre',
}: WorkspaceNavIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? (focused ? colors.text.primary : colors.text.muted);
  const strokeWidth = focused ? 2 : 1.7;

  return (
    <View testID={testID} style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect
          x={4}
          y={10}
          width={16}
          height={11}
          rx={3}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={focused ? colors.glass.specularBorder : 'none'}
        />
        <Path
          d="M8 10V7a4 4 0 1 1 8 0v3"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Path
          d="M9.5 15.5l1.8 1.8 3.5-3.5"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * Account / Profile icon: Clean user silhouette.
 */
export function AccountNavIcon({
  size = 20,
  color,
  focused = false,
  style,
  testID = 'nav-icon-account',
}: WorkspaceNavIconProps): React.JSX.Element {
  const { colors } = useBFlowTheme();
  const strokeColor = color ?? (focused ? colors.text.primary : colors.text.muted);
  const strokeWidth = focused ? 2 : 1.7;

  return (
    <View testID={testID} style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={12}
          cy={7.5}
          r={4}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={focused ? colors.glass.specularBorder : 'none'}
        />
        <Path
          d="M4 20.5c0-4.14 3.58-7.5 8-7.5s8 3.36 8 7.5"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
