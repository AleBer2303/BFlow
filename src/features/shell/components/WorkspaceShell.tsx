/**
 * src/features/shell/components/WorkspaceShell.tsx
 *
 * The frame around every workspace screen: page header, scrolling content column and the
 * navigation of the active platform skin. Screens render inside it and never position
 * themselves against the window.
 *
 * | Skin    | Header                         | Navigation                              |
 * |---------|--------------------------------|-----------------------------------------|
 * | ios     | Large title + theme switch     | Floating Liquid Glass dock (overlaps)   |
 * | android | Material top app bar           | Same floating dock, flat selection pill |
 * | web     | Opaque header with a hairline  | Words in the header from 840px, else a  |
 * |         |                                | tab bar at the foot                     |
 *
 * The content column is centered and capped per skin (`useResponsiveLayout`), so a tablet, a
 * foldable or a desktop browser never gets a stretched phone layout.
 */

import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import {
  AppText,
  FloatingLiquidGlassDock,
  KeyboardAwareScrollView,
  ThemeToggleIconButton,
  WORKSPACE_TABS,
  WebAppHeader,
  WebTabBar,
  useBFlowTheme,
  useResponsiveLayout,
} from '../../../design-system';
import { useSafeInsets } from '../../../platform/insets/useSafeInsets';
import type { BFlowWorkspaceTab } from '../../budget/store/useBudgetStore';

export interface WorkspaceShellProps {
  /** "Octubre 2026" */
  monthLabel: string;
  activeTab: BFlowWorkspaceTab;
  onSelectTab: (tab: BFlowWorkspaceTab) => void;
  /** Hidden while the account is being set up (onboarding). */
  showNavigation: boolean;
  /** Pending offline mutations waiting to be synced to cloud. */
  pendingSyncCount?: number;
  children: React.ReactNode;
}

/** Space the floating dock covers at the bottom of the scroll content. */
const DOCK_CLEARANCE = Platform.OS === 'ios' ? 84 : 76;
const ANDROID_TOP_APP_BAR_HEIGHT = 64;
const NAVIGATION_TEST_ID = 'liquid-glass-tab-bar';

export function WorkspaceShell({
  monthLabel,
  activeTab,
  onSelectTab,
  showNavigation,
  pendingSyncCount,
  children,
}: WorkspaceShellProps): React.JSX.Element {
  const { colors, spacing, skin, skinSpec } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeInsets();

  const isWeb = skin === 'web';
  const isAndroid = skin === 'android';
  const isIos = skin === 'ios';
  const showsDock = showNavigation && skinSpec.navigation === 'floating-dock';
  // iOS clears its home indicator by itself; Android draws edge to edge, so there the dock and
  // the end of the scroll content clear the system gesture area.
  const bottomSystemInset = isAndroid ? insets.bottom : 0;
  const showsWebTabBar = isWeb && showNavigation && layout.sizeClass !== 'expanded';
  const activeTabLabel = WORKSPACE_TABS.find((tab) => tab.id === activeTab)?.label ?? '';
  const title = `BFlow · ${monthLabel}`;
  // Stable while the tab is unchanged, so the memoized web header can skip re-rendering.
  const webHeaderNavigation = useMemo(
    () => (showNavigation ? { activeTab, onSelectTab, testID: NAVIGATION_TEST_ID } : undefined),
    [showNavigation, activeTab, onSelectTab]
  );

  const contentGap = isWeb && layout.sizeClass !== 'compact' ? spacing.xl : spacing.md;
  const paddingTop = isWeb ? (layout.isWide ? spacing.xxxl : spacing.xxl) : spacing.xl;
  const paddingBottom =
    (showsDock ? DOCK_CLEARANCE : isWeb ? spacing.huge : spacing.xl) + bottomSystemInset;

  return (
    <View testID="workspace-shell" style={{ flex: 1, backgroundColor: colors.background.primary }}>
      {isWeb ? (
        <WebAppHeader layout={layout} contextLabel={monthLabel} navigation={webHeaderNavigation} />
      ) : null}

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: isAndroid ? 0 : paddingTop,
          paddingBottom,
        }}
      >
        <View
          testID="workspace-content-column"
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            gap: contentGap,
          }}
        >
          {isIos ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                <AppText
                  variant="title1"
                  accessibilityRole="header"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{ flexShrink: 1 }}
                >
                  {title}
                </AppText>
                {pendingSyncCount && pendingSyncCount > 0 ? (
                  <View
                    testID="pending-offline-sync-badge"
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 2,
                      borderRadius: 10,
                      backgroundColor: colors.background.secondary,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                    }}
                  >
                    <AppText variant="caption" color={colors.semantic.pending}>
                      {`☁️ ${pendingSyncCount}`}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <ThemeToggleIconButton testID="theme-toggle-button" />
            </View>
          ) : null}

          {isAndroid ? (
            <View
              testID="material-top-app-bar"
              style={{
                minHeight: ANDROID_TOP_APP_BAR_HEIGHT,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
                <AppText
                  variant="title2"
                  accessibilityRole="header"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{ flexShrink: 1 }}
                >
                  {title}
                </AppText>
                {pendingSyncCount && pendingSyncCount > 0 ? (
                  <View
                    testID="pending-offline-sync-badge-android"
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 2,
                      borderRadius: 8,
                      backgroundColor: colors.background.secondary,
                    }}
                  >
                    <AppText variant="caption" color={colors.semantic.pending}>
                      {`☁️ ${pendingSyncCount}`}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <ThemeToggleIconButton testID="theme-toggle-button" />
            </View>
          ) : null}

          {isWeb && showNavigation ? (
            <View
              testID="web-page-heading"
              accessibilityRole="header"
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: spacing.sm,
              }}
            >
              <AppText variant="title1">{activeTabLabel}</AppText>
              <AppText variant="title1" color={colors.text.muted}>
                {monthLabel}
              </AppText>
              {pendingSyncCount && pendingSyncCount > 0 ? (
                <View
                  testID="pending-offline-sync-badge-web"
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: 6,
                    backgroundColor: colors.background.secondary,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                  }}
                >
                  <AppText variant="caption" color={colors.semantic.pending}>
                    {`☁️ ${pendingSyncCount} pendientes`}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          {children}
        </View>
      </KeyboardAwareScrollView>

      {showsDock ? (
        <FloatingLiquidGlassDock
          testID={NAVIGATION_TEST_ID}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          bottomInset={bottomSystemInset}
        />
      ) : null}

      {showsWebTabBar ? (
        <WebTabBar
          testID={NAVIGATION_TEST_ID}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          layout={layout}
        />
      ) : null}
    </View>
  );
}
