import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { BFlowThemeProvider, useBFlowTheme } from '../design-system';

function RootNavigator(): React.JSX.Element {
  const { mode, colors } = useBFlowTheme();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.primary },
        }}
      />
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <BFlowThemeProvider initialMode="dark">
      <RootNavigator />
    </BFlowThemeProvider>
  );
}
