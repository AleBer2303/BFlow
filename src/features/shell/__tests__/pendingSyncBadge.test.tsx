/**
 * CC-04 (plan consolidado, Fase 3): el indicador de cambios sin sincronizar es el mismo en las
 * tres pieles: un solo testID, el radio del tema, un icono vectorial en vez del emoji ☁️ y una
 * etiqueta para lectores de pantalla.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import PhaseOneHomeScreen from '../../../app/index';
import { radiusBySkin, type PlatformSkinId } from '../../../design-system/tokens';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { DEMO_USER } from '../../../platform/auth/authAdapter';
import { useBudgetStore } from '../../budget/store/useBudgetStore';

beforeEach(() => {
  act(() => {
    useBudgetStore.setState({ authUser: DEMO_USER, needsOnboarding: false });
    useBudgetStore.getState().resetToSampleWorkspace();
  });
});

afterEach(() => {
  act(() => {
    useBudgetStore.setState({ pendingOfflineWritesCount: 0 });
  });
});

describe.each([
  ['ios', '3'],
  ['android', '3'],
  ['web', '3 pendientes'],
] as const)('indicador de cambios pendientes (piel %s)', (skin, text) => {
  it('usa un único testID, el radio del tema y un icono, sin emoji', async () => {
    render(
      <BFlowThemeProvider skin={skin as PlatformSkinId} initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );
    await act(async () => {
      useBudgetStore.setState({ pendingOfflineWritesCount: 3 });
    });

    const badge = screen.getByTestId('pending-offline-sync-badge');
    const style = (StyleSheet.flatten(badge.props.style) ?? {}) as ViewStyle;
    expect(style.borderRadius).toBe(radiusBySkin[skin as PlatformSkinId].sm);
    expect(badge.props.accessibilityLabel).toBe('3 cambios pendientes por sincronizar');
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByTestId('icon-cloud-sync')).toBeTruthy();
    expect(screen.queryByText(/☁️/)).toBeNull();
    expect(screen.queryByTestId('pending-offline-sync-badge-android')).toBeNull();
    expect(screen.queryByTestId('pending-offline-sync-badge-web')).toBeNull();
  });

  it('desaparece sin cambios pendientes', async () => {
    render(
      <BFlowThemeProvider skin={skin as PlatformSkinId} initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );
    await act(async () => {});
    expect(screen.queryByTestId('pending-offline-sync-badge')).toBeNull();
  });
});
