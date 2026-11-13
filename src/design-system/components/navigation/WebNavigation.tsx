/**
 * src/design-system/components/navigation/WebNavigation.tsx
 *
 * Web navigation, built to the design-taste-frontend system (references/system.md, Nav):
 *
 * - `WebAppHeader`: an opaque bar the full width of the page with a 1px hairline under it, the
 *   same at every scroll depth. No blur, no transparency, no floating pill, no shadow. The mark
 *   sits on the left content line and the theme switch ends on the right one. From 840px it
 *   carries the six destinations as plain words; the current one takes a 2px bar.
 * - `WebTabBar`: below 840px the destinations move to an opaque bar at the foot with a 1px top
 *   hairline (the system's phone bar), one 44px-plus target each.
 *
 * Both are flat and neutral: selection is shown by the ink, not by a tinted pill.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import type { ResponsiveLayout } from '../../layout/responsiveLayout';
import { useBFlowTheme } from '../../theme/ThemeContext';
import { AppPressable } from '../AppPressable';
import { ThemeToggleIconButton } from '../BrandAndThemeIcons';
import { AppText } from '../Typography';
import {
  WORKSPACE_TABS,
  WorkspaceTabIcon,
  type WorkspaceNavigationProps,
  type WorkspaceTabConfig,
} from './workspaceTabs';

export const WEB_HEADER_HEIGHT = { phone: 56, desktop: 72 } as const;
export const WEB_TAB_BAR_HEIGHT = 64;
const WEB_PHONE_MAX_WIDTH = 640;
const WEB_CURRENT_BAR_HEIGHT = 2;
const WEB_MARK_SIZE = 28;
const WEB_TAB_BAR_ICON_SIZE = 22;
/** Below this cell width a 13px label would wrap or clip, so the bar shows icons only. */
const WEB_TAB_LABEL_MIN_CELL_WIDTH = 60;

export function resolveWebHeaderHeight(width: number): number {
  return width < WEB_PHONE_MAX_WIDTH ? WEB_HEADER_HEIGHT.phone : WEB_HEADER_HEIGHT.desktop;
}

export interface WebAppHeaderProps {
  layout: ResponsiveLayout;
  /** Month shown beside the theme switch ("Octubre 2026"). */
  contextLabel?: string;
  /** When given (and the window is wide enough) the destinations render in the bar. */
  navigation?: WorkspaceNavigationProps;
  themeToggleTestID?: string;
  testID?: string;
}

function BrandMark(): React.JSX.Element {
  const { colors, radius, spacing, typography } = useBFlowTheme();

  return (
    <View
      testID="web-brand-mark"
      accessibilityRole="header"
      accessibilityLabel="BFlow"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <View
        style={{
          width: WEB_MARK_SIZE,
          height: WEB_MARK_SIZE,
          borderRadius: radius.sm,
          backgroundColor: colors.text.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText
          variant="callout"
          color={colors.background.primary}
          style={{ fontWeight: '600' }}
          accessibilityElementsHidden
          importantForAccessibility="no"
          aria-hidden
        >
          B
        </AppText>
      </View>
      <AppText
        variant="title2"
        style={{ letterSpacing: typography.title2.letterSpacing }}
        accessibilityElementsHidden
        importantForAccessibility="no"
        aria-hidden
      >
        BFlow
      </AppText>
    </View>
  );
}

interface HeaderWordProps {
  tab: WorkspaceTabConfig;
  isSelected: boolean;
  height: number;
  onSelect: (tab: WorkspaceTabConfig) => void;
}

function HeaderWord({ tab, isSelected, height, onSelect }: HeaderWordProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const [hovered, setHovered] = useState(false);
  const isEmphasized = isSelected || hovered;

  return (
    <AppPressable
      testID={`workspace-tab-${tab.id}`}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isSelected }}
      onPress={() => onSelect(tab)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        height,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText
        variant="callout"
        numberOfLines={1}
        color={isEmphasized ? colors.text.primary : colors.text.secondary}
      >
        {tab.label}
      </AppText>
      {isSelected ? (
        <View
          testID="web-nav-current-bar"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            bottom: 0,
            height: WEB_CURRENT_BAR_HEIGHT,
            backgroundColor: colors.text.primary,
          }}
        />
      ) : null}
    </AppPressable>
  );
}

export const WebAppHeader = React.memo(function WebAppHeader({
  layout,
  contextLabel,
  navigation,
  themeToggleTestID = 'theme-toggle-button',
  testID = 'web-app-header',
}: WebAppHeaderProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const height = resolveWebHeaderHeight(layout.width);
  const showsWords = navigation !== undefined && layout.sizeClass === 'expanded';
  const showsContext = contextLabel !== undefined && layout.sizeClass !== 'compact';

  const handleSelect = (tab: WorkspaceTabConfig) => {
    if (navigation && tab.id !== navigation.activeTab) {
      navigation.onSelectTab(tab.id);
    }
  };

  return (
    <View
      testID={testID}
      style={{
        backgroundColor: colors.background.primary,
        borderBottomWidth: 1,
        borderBottomColor: colors.glass.subtleBorder,
        zIndex: 10,
      }}
    >
      <View
        style={{
          height,
          width: '100%',
          maxWidth: layout.contentMaxWidth + layout.gutter * 2,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xl,
        }}
      >
        <BrandMark />

        {showsWords ? (
          <View
            testID={navigation.testID ?? 'web-header-navigation'}
            accessibilityRole="tablist"
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            {WORKSPACE_TABS.map((tab) => (
              <HeaderWord
                key={tab.id}
                tab={tab}
                height={height}
                isSelected={tab.id === navigation.activeTab}
                onSelect={handleSelect}
              />
            ))}
          </View>
        ) : null}

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: spacing.lg,
          }}
        >
          {showsContext ? (
            <AppText
              testID="web-header-context"
              variant="caption"
              numberOfLines={1}
              color={colors.text.muted}
            >
              {contextLabel}
            </AppText>
          ) : null}
          <ThemeToggleIconButton testID={themeToggleTestID} />
        </View>
      </View>
    </View>
  );
});

export interface WebTabBarProps extends WorkspaceNavigationProps {
  layout: ResponsiveLayout;
}

export const WebTabBar = React.memo(function WebTabBar({
  activeTab,
  onSelectTab,
  layout,
  testID = 'web-tab-bar',
}: WebTabBarProps): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const cellWidth = layout.width / WORKSPACE_TABS.length;
  const showsLabels = cellWidth >= WEB_TAB_LABEL_MIN_CELL_WIDTH;

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        height: WEB_TAB_BAR_HEIGHT,
        backgroundColor: colors.background.primary,
        borderTopWidth: 1,
        borderTopColor: colors.glass.subtleBorder,
      }}
    >
      {WORKSPACE_TABS.map((tab) => {
        const isSelected = tab.id === activeTab;
        const tint = isSelected ? colors.text.primary : colors.text.secondary;

        return (
          <AppPressable
            key={tab.id}
            testID={`workspace-tab-${tab.id}`}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              if (!isSelected) {
                onSelectTab(tab.id);
              }
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xxs,
            }}
          >
            {isSelected ? (
              <View
                testID="web-nav-current-bar"
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: spacing.md,
                  right: spacing.md,
                  height: WEB_CURRENT_BAR_HEIGHT,
                  backgroundColor: colors.text.primary,
                }}
              />
            ) : null}
            <WorkspaceTabIcon
              id={tab.id}
              size={WEB_TAB_BAR_ICON_SIZE}
              color={tint}
              focused={isSelected}
            />
            {showsLabels ? (
              <AppText variant="micro" numberOfLines={1} color={tint}>
                {tab.label}
              </AppText>
            ) : null}
          </AppPressable>
        );
      })}
    </View>
  );
});
