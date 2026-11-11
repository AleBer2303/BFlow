/**
 * src/design-system/components/navigation/MaterialNavigationBar.tsx
 *
 * Android navigation: a Material 3 navigation bar. Deliberately the opposite of the iOS dock:
 * anchored edge to edge at the bottom (not floating), opaque tonal container (no blur, no
 * glass, no lens), a pill "active indicator" behind the selected icon and a ripple on touch.
 * It sits in the layout flow, so content never hides behind it, and pads the system gesture
 * area itself.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { hapticService } from '../../../platform/haptics/hapticService';
import { useBFlowTheme } from '../../theme/ThemeContext';
import { AppPressable } from '../AppPressable';
import { AppText } from '../Typography';
import {
  WORKSPACE_TABS,
  WorkspaceTabIcon,
  type WorkspaceNavigationProps,
  type WorkspaceTabConfig,
} from './workspaceTabs';

export const MATERIAL_NAV_BAR_HEIGHT = 80;
export const MATERIAL_NAV_INDICATOR = { width: 56, height: 32 } as const;
const MATERIAL_NAV_ICON_SIZE = 24;
const MATERIAL_NAV_MAX_WIDTH = 640;
const INDICATOR_ENTER_MS = 200;

export interface MaterialNavigationBarProps extends WorkspaceNavigationProps {
  /** System gesture / navigation area below the bar (edge-to-edge). */
  bottomInset?: number;
}

interface MaterialNavItemProps {
  tab: WorkspaceTabConfig;
  isSelected: boolean;
  onSelect: (tab: WorkspaceTabConfig) => void;
}

function MaterialNavItem({ tab, isSelected, onSelect }: MaterialNavItemProps): React.JSX.Element {
  const { colors, radius, spacing } = useBFlowTheme();
  const skipMotion = process.env.NODE_ENV === 'test';
  const indicator = useRef(new Animated.Value(1)).current;
  const wasSelected = useRef(isSelected);

  // Selection is state, never animation: the pill exists only on the selected item. Motion
  // only widens it on entry, so a paused or dropped animation can never leave it on the
  // wrong destination.
  useEffect(() => {
    const becameSelected = isSelected && !wasSelected.current;
    wasSelected.current = isSelected;
    if (!becameSelected || skipMotion) {
      indicator.setValue(1);
      return;
    }
    indicator.setValue(0);
    Animated.timing(indicator, {
      toValue: 1,
      duration: INDICATOR_ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [indicator, isSelected, skipMotion]);

  return (
    <AppPressable
      testID={`workspace-tab-${tab.id}`}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isSelected }}
      onPress={() => onSelect(tab)}
      style={{
        flex: 1,
        height: MATERIAL_NAV_BAR_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
      }}
    >
      <View
        style={{
          width: MATERIAL_NAV_INDICATOR.width,
          height: MATERIAL_NAV_INDICATOR.height,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSelected ? (
          <Animated.View
            testID="material-nav-active-indicator"
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: radius.pill,
                backgroundColor: colors.accent.container,
                transform: [
                  {
                    scaleX: indicator.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        <WorkspaceTabIcon
          id={tab.id}
          size={MATERIAL_NAV_ICON_SIZE}
          color={isSelected ? colors.accent.onContainer : colors.text.secondary}
          focused={isSelected}
        />
      </View>
      <AppText
        variant="caption"
        numberOfLines={1}
        color={isSelected ? colors.text.primary : colors.text.secondary}
        style={isSelected ? { fontWeight: '700' } : undefined}
      >
        {tab.label}
      </AppText>
    </AppPressable>
  );
}

export const MaterialNavigationBar = React.memo(function MaterialNavigationBar({
  activeTab,
  onSelectTab,
  bottomInset = 0,
  testID = 'material-navigation-bar',
}: MaterialNavigationBarProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();

  const handleSelect = (tab: WorkspaceTabConfig) => {
    if (tab.id === activeTab) {
      return;
    }
    hapticService.selection();
    onSelectTab(tab.id);
  };

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{
        backgroundColor: colors.background.elevated,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.glass.subtleBorder,
        paddingBottom: bottomInset,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          width: '100%',
          maxWidth: MATERIAL_NAV_MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: spacing.xs,
        }}
      >
        {WORKSPACE_TABS.map((tab) => (
          <MaterialNavItem
            key={tab.id}
            tab={tab}
            isSelected={tab.id === activeTab}
            onSelect={handleSelect}
          />
        ))}
      </View>
    </View>
  );
});
