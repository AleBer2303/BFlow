/**
 * Functional tests of the whole app on the three platform skins and across window sizes.
 *
 * The same flows (navigate the six tabs, complete a checklist item, register a movement,
 * switch theme, sign-in gate) must work identically on iOS, Android and Web; only the frame
 * around them changes. Window sizes are driven through `Dimensions`, like a real resize.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';
import { GLView } from 'expo-gl';
import React from 'react';
import { Dimensions, StyleSheet, type ViewStyle } from 'react-native';
import PhaseOneHomeScreen from '../../../app/index';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import {
  PLATFORM_SKIN_IDS,
  palettesBySkin,
  type PlatformSkinId,
} from '../../../design-system/tokens';
import { DEMO_OWNER_USER } from '../../../platform/auth/authAdapter';
import { WEB_HERO_COPY } from '../../auth/components/AuthScreen';
import { useBudgetStore } from '../../budget/store/useBudgetStore';

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

function setWindowSize(width: number, height: number): void {
  act(() => {
    const metrics = { width, height, scale: 2, fontScale: 1 };
    Dimensions.set({ window: metrics, screen: metrics });
  });
}

function renderApp(skin: PlatformSkinId, mode: 'dark' | 'light' = 'dark') {
  return render(
    <BFlowThemeProvider skin={skin} initialMode={mode}>
      <PhaseOneHomeScreen />
    </BFlowThemeProvider>
  );
}

function styleOf(testID: string): ViewStyle {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
}

const WORKSPACE_VIEWS = [
  ['checklist', 'checklist-workspace-view'],
  ['debts', 'debts-funfami-view'],
  ['savings', 'savings-and-moto-ideal-view'],
  ['analytics', 'analytics-and-history-view'],
  ['account', 'account-profile-workspace-view'],
  ['summary', 'net-flow-hero-card'],
] as const;

beforeEach(() => {
  // Each test starts signed in as the demo owner with the golden month, on a phone.
  act(() => {
    useBudgetStore.setState({ authUser: DEMO_OWNER_USER, needsOnboarding: false });
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });
  setWindowSize(390, 844);
});

afterAll(() => {
  act(() => {
    Dimensions.set({ window: ORIGINAL_WINDOW, screen: ORIGINAL_SCREEN });
  });
});

describe.each(PLATFORM_SKIN_IDS)('core flows on the %s skin', (skin) => {
  it('shows the golden October 2026 figures', () => {
    renderApp(skin);

    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 1.080.000');
    expect(screen.getByText('Checklist 6 de 12')).toBeTruthy();
    expect(screen.getByText('Previstos: $ 6.000.000')).toBeTruthy();
    expect(screen.getByText('Pendientes: $ 450.000')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-section')).toBeTruthy();
  });

  it('reaches the six workspaces through the same tab ids', () => {
    renderApp(skin);

    for (const [tab, viewTestID] of WORKSPACE_VIEWS) {
      fireEvent.press(screen.getByTestId(`workspace-tab-${tab}`));
      expect(screen.getByTestId(viewTestID)).toBeTruthy();
      expect(screen.getByTestId(`workspace-tab-${tab}`).props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true })
      );
    }
  });

  it('recalculates debt and checklist progress when a checklist item changes', () => {
    renderApp(skin);

    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    fireEvent.press(screen.getByTestId('checklist-workspace-item-2026-10_exp_cuota_funfami'));
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));

    expect(screen.getByText('Checklist 5 de 12')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-debt').props.accessibilityLabel).toContain(
      '$ 8.000.000'
    );
  });

  it('registers a movement from the checklist and updates the paid expenses', () => {
    renderApp(skin);

    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    fireEvent.press(screen.getByTestId('open-add-movement-modal-button'));
    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Seguro TR SURA');
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '130000');
    fireEvent.press(screen.getByTestId('submit-movement-button'));

    expect(screen.queryByTestId('add-movement-modal-card')).toBeNull();
    fireEvent.press(screen.getByTestId('workspace-tab-summary'));
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 950.000');
  });

  it('switches between dark and light and repaints with the skin palette', () => {
    renderApp(skin);

    expect(styleOf('workspace-shell').backgroundColor).toBe(
      palettesBySkin[skin].dark.background.primary
    );
    fireEvent.press(screen.getByTestId('theme-toggle-button'));
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
    expect(styleOf('workspace-shell').backgroundColor).toBe(
      palettesBySkin[skin].light.background.primary
    );
  });

  it('hides the navigation while the account is being set up', () => {
    act(() => {
      useBudgetStore.setState({ needsOnboarding: true });
    });
    renderApp(skin);

    expect(screen.getByTestId('initial-account-setup-view')).toBeTruthy();
    expect(screen.queryByTestId('liquid-glass-tab-bar')).toBeNull();
    expect(screen.queryByTestId('workspace-tab-summary')).toBeNull();
  });

  it('shows the sign-in gate when there is no session', () => {
    act(() => {
      useBudgetStore.getState().requireAuthenticationGate();
    });
    renderApp(skin);

    expect(screen.getByTestId('auth-gate-screen')).toBeTruthy();
    expect(screen.getByTestId('auth-primary-submit-button')).toBeTruthy();
    expect(screen.getByTestId('auth-theme-toggle-button')).toBeTruthy();
    expect(screen.queryByTestId('workspace-shell')).toBeNull();
  });

  it.each([320, 360, 390, 440])('lays out the summary on a %ipt wide phone', (width) => {
    setWindowSize(width, 800);
    renderApp(skin);

    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();
    expect(screen.getByTestId('income-summary-card')).toBeTruthy();
    expect(screen.getByTestId('expense-summary-card')).toBeTruthy();

    const column = styleOf('workspace-content-column');
    expect(column.width).toBe('100%');
    expect(column.alignSelf).toBe('center');
  });
});

describe('iOS skin · Liquid Glass frame', () => {
  it('keeps the large title, the floating glass dock and the blurred cards', () => {
    renderApp('ios');

    expect(screen.getByText('BFlow · Octubre 2026')).toBeTruthy();
    expect(screen.getByTestId('liquid-glass-tab-bar')).toBeTruthy();
    expect(screen.getByTestId('dock-magnifying-lens')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(BlurView).length).toBeGreaterThan(0);
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(1);

    expect(screen.queryByTestId('material-top-app-bar')).toBeNull();
    expect(screen.queryByTestId('web-app-header')).toBeNull();
  });

  it('caps the content column and keeps the dock within its maximum width on a tablet', () => {
    setWindowSize(1024, 768);
    renderApp('ios');

    expect(styleOf('workspace-content-column').maxWidth).toBe(560);
    expect(styleOf('liquid-glass-tab-bar')).toMatchObject({ width: '100%', maxWidth: 580 });
    // Native skins never switch to the desktop composition.
    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();
  });
});

describe('Android skin · Material 3 frame', () => {
  it('uses a top app bar and an anchored navigation bar, with no Liquid Glass anywhere', () => {
    renderApp('android');

    expect(screen.getByTestId('material-top-app-bar')).toBeTruthy();
    expect(screen.getByText('BFlow · Octubre 2026')).toBeTruthy();
    expect(screen.getByTestId('liquid-glass-tab-bar')).toBeTruthy();
    expect(screen.getAllByTestId('material-nav-active-indicator')).toHaveLength(1);

    expect(screen.queryByTestId('dock-magnifying-lens')).toBeNull();
    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    expect(styleOf('net-flow-hero-card').borderWidth).toBeUndefined();
  });

  it('has no blur on any workspace', () => {
    renderApp('android');

    for (const [tab] of WORKSPACE_VIEWS) {
      fireEvent.press(screen.getByTestId(`workspace-tab-${tab}`));
      expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    }
  });

  it('keeps the navigation bar in the layout flow so content is never covered', () => {
    renderApp('android');

    expect(styleOf('liquid-glass-tab-bar').position).toBeUndefined();
    // The 3D curve stays on Android: the platform differs in material, not in features.
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(1);
  });

  it('centers a capped column on foldables and tablets', () => {
    setWindowSize(900, 1200);
    renderApp('android');

    expect(styleOf('workspace-content-column').maxWidth).toBe(600);
    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();
  });
});

describe('Web skin · redesigned frame', () => {
  it('draws the curve as vectors and never mounts a WebGL surface', () => {
    renderApp('web');

    expect(screen.getByTestId('monthly-curve-vector-stage')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(GLView)).toHaveLength(0);
    expect(screen.UNSAFE_queryAllByType(BlurView)).toHaveLength(0);
    expect(screen.queryByTestId('dock-magnifying-lens')).toBeNull();
  });

  it('on a phone: slim header, page heading and a tab bar at the foot', () => {
    renderApp('web');

    expect(screen.getByTestId('web-app-header')).toBeTruthy();
    expect(screen.getByTestId('web-page-heading')).toHaveTextContent('ResumenOctubre 2026');
    expect(screen.queryByTestId('web-header-context')).toBeNull();
    expect(styleOf('liquid-glass-tab-bar')).toMatchObject({ height: 64, borderTopWidth: 1 });
    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    expect(screen.getByTestId('web-page-heading')).toHaveTextContent('DeudasOctubre 2026');
  });

  it('on a tablet (768px): still the foot bar, single column', () => {
    setWindowSize(768, 1024);
    renderApp('web');

    expect(styleOf('liquid-glass-tab-bar').height).toBe(64);
    expect(screen.getByTestId('web-header-context')).toHaveTextContent('Octubre 2026');
    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();
  });

  it('on a desktop (1440px): navigation in the header and the dashboard composition', () => {
    setWindowSize(1440, 900);
    renderApp('web', 'light');

    // Words in the header; no foot bar.
    expect(styleOf('liquid-glass-tab-bar').flexDirection).toBe('row');
    expect(styleOf('liquid-glass-tab-bar').height).toBeUndefined();
    expect(screen.getAllByTestId('web-nav-current-bar')).toHaveLength(1);
    expect(screen.getByTestId('web-header-context')).toHaveTextContent('Octubre 2026');

    // Figures in one row, curve as a split panel with a metric table.
    expect(screen.getByTestId('summary-overview-wide')).toBeTruthy();
    expect(styleOf('summary-figure-cards').flexDirection).toBe('row');
    expect(screen.getByTestId('monthly-curve-metric-list')).toBeTruthy();
    expect(screen.getByTestId('monthly-curve-metric-debt')).toHaveTextContent('Deudas$ 6.200.000');

    expect(styleOf('workspace-content-column').maxWidth).toBe(1280);
  });

  it('on a desktop: places panels side by side on every workspace', () => {
    setWindowSize(1440, 900);
    renderApp('web');

    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    expect(styleOf('checklist-sections-row-0').flexDirection).toBe('row');

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    expect(styleOf('debt-cards-grid-row-0').flexDirection).toBe('row');

    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(styleOf('savings-panels-row-0').flexDirection).toBe('row');

    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(styleOf('analytics-panels-row-0').flexDirection).toBe('row');

    fireEvent.press(screen.getByTestId('workspace-tab-account'));
    expect(styleOf('account-panels-row-0').flexDirection).toBe('row');
    expect(screen.getByText('BFlow v1.0.0 (Web)')).toBeTruthy();
  });

  it('on a phone: the same workspaces stack in one column', () => {
    renderApp('web');

    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    expect(screen.getByTestId('checklist-sections')).toBeTruthy();
    expect(screen.queryByTestId('checklist-sections-row-0')).toBeNull();

    fireEvent.press(screen.getByTestId('workspace-tab-account'));
    expect(screen.queryByTestId('account-panels-row-0')).toBeNull();
  });

  it('follows a live resize from phone to desktop and back', () => {
    renderApp('web');
    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();

    setWindowSize(1440, 900);
    expect(screen.getByTestId('summary-overview-wide')).toBeTruthy();

    setWindowSize(390, 844);
    expect(screen.getByTestId('summary-overview-stacked')).toBeTruthy();
  });

  it('marks the main action with the one filled accent button', () => {
    renderApp('web', 'light');

    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    expect(styleOf('open-add-movement-modal-button').backgroundColor).toBe('#256F82');

    // Once the form is open the opener steps back and the submit button carries the accent.
    fireEvent.press(screen.getByTestId('open-add-movement-modal-button'));
    expect(styleOf('open-add-movement-modal-button').backgroundColor).toBe(
      palettesBySkin.web.light.glass.surfaceElevatedTint
    );
    expect(styleOf('submit-movement-button').backgroundColor).toBe('#256F82');
  });

  it('shows the first-screen hero beside the sign-in form on desktop', () => {
    act(() => {
      useBudgetStore.getState().requireAuthenticationGate();
    });
    setWindowSize(1440, 900);
    renderApp('web', 'light');

    expect(screen.getByTestId('web-app-header')).toBeTruthy();
    expect(screen.getByTestId('auth-web-hero')).toBeTruthy();
    expect(screen.getByText(WEB_HERO_COPY.headline)).toBeTruthy();
    expect(screen.getByText(WEB_HERO_COPY.fact)).toBeTruthy();
    expect(styleOf('auth-primary-submit-button').backgroundColor).toBe('#256F82');
  });
});

describe('sign-in gate on the native skins', () => {
  it.each(['ios', 'android'] as const)('keeps the centered card without the web hero (%s)', (skin) => {
    act(() => {
      useBudgetStore.getState().requireAuthenticationGate();
    });
    renderApp(skin);

    expect(screen.getByTestId('auth-glass-card')).toBeTruthy();
    expect(screen.queryByTestId('auth-web-hero')).toBeNull();
    expect(screen.queryByTestId('web-app-header')).toBeNull();
    expect(screen.queryByText(WEB_HERO_COPY.headline)).toBeNull();
  });

  it('uses a filled Material button for the main action on Android', () => {
    act(() => {
      useBudgetStore.getState().requireAuthenticationGate();
    });
    renderApp('android', 'light');

    expect(styleOf('auth-primary-submit-button')).toMatchObject({
      backgroundColor: palettesBySkin.android.light.accent.primary,
      borderRadius: 999,
    });
  });
});
