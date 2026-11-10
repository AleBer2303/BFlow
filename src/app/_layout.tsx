import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import {
  BFlowThemeProvider,
  WEB_FONT_STYLESHEET_URL,
  resolveInitialThemeMode,
  useBFlowTheme,
} from '../design-system';
import { useSafeInsets } from '../platform/insets/useSafeInsets';
import { syncSystemChrome } from '../platform/system/systemChrome';

function RootNavigator(): React.JSX.Element {
  const { mode, colors, skin } = useBFlowTheme();
  const insets = useSafeInsets();

  useEffect(() => {
    syncSystemChrome({
      mode,
      backgroundColor: colors.background.primary,
      accentColor: colors.accent.primary,
      accentSoftColor: colors.accent.container,
      ...(skin === 'web' ? { fontStylesheetUrl: WEB_FONT_STYLESHEET_URL } : null),
    });
  }, [mode, colors, skin]);

  return (
    // Android draws edge to edge: the status bar area is padded here once for every screen.
    // iOS scroll views already clear it (contentInsetAdjustmentBehavior) and web has none.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background.primary,
        paddingTop: skin === 'android' ? insets.top : 0,
      }}
    >
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.primary },
        }}
      />
    </View>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <BFlowThemeProvider initialMode={resolveInitialThemeMode('dark')}>
      <RootNavigator />
    </BFlowThemeProvider>
  );
}
