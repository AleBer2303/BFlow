/**
 * Phase 6 charts inside the real app, on the three skins: they appear in the Cierre, Deudas
 * and Ahorros tabs with the golden October 2026 figures and follow the store when a
 * movement is completed or the month is closed. The demo user is not a real account, so
 * nothing here writes to Firestore.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';
import PhaseOneHomeScreen from '../../../../app/index';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import { DEMO_OWNER_USER } from '../../../../platform/auth/authAdapter';
import { useBudgetStore } from '../../../budget/store/useBudgetStore';

function renderApp(skin: PlatformSkinId) {
  return render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <PhaseOneHomeScreen />
    </BFlowThemeProvider>
  );
}

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

function setWindowSize(width: number, height: number): void {
  act(() => {
    const metrics = { width, height, scale: 2, fontScale: 1 };
    Dimensions.set({ window: metrics, screen: metrics });
  });
}

beforeEach(() => {
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

describe.each(PLATFORM_SKIN_IDS)('charts in the app on the %s skin', (skin) => {
  it('shows the charts of each tab with the golden figures', () => {
    renderApp(skin);

    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(screen.getByTestId('analytics-and-history-view')).toBeTruthy();
    expect(screen.getByTestId('analytics-charts-panel')).toBeTruthy();
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Recibido\s*\$ 4\.000\.000/);
    expect(screen.getByTestId('balance-chart-readout')).toHaveTextContent(/\$ 1\.080\.000/);

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    expect(screen.getByTestId('debts-funfami-view')).toBeTruthy();
    expect(screen.getByTestId('debts-chart-trend')).toHaveTextContent(/Cierre estimado: Febrero 2027/);
    expect(screen.getByTestId('debt-trend-chart-readout')).toHaveTextContent(/\$ 6\.200\.000/);

    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('savings-and-moto-ideal-view')).toBeTruthy();
    expect(screen.getByTestId('savings-chart-trend')).toHaveTextContent(/Total hoy: \$ 4\.380\.000/);
    expect(screen.getByTestId('provision-chart-readout')).toHaveTextContent(/Aporte real\s*\$ 700\.000/);
  });
});

describe('charts follow the store', () => {
  it('update when a pending movement is completed', async () => {
    renderApp('ios');
    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(screen.getByTestId('paid-pending-chart-center-value', { includeHiddenElements: true })).toHaveTextContent(
      '$ 3.370.000'
    );

    await act(async () => {
      await useBudgetStore.getState().toggleEntryStatus('2026-10_inc_prima', '2026-10-30');
    });
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Recibido\s*\$ 6\.000\.000/);
    expect(screen.getByTestId('balance-chart-readout')).toHaveTextContent(/\$ 3\.080\.000/);

    await act(async () => {
      await useBudgetStore.getState().toggleEntryStatus('2026-10_exp_smart_fit', '2026-10-30');
    });
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Pendiente\s*\$ 350\.000/);
    expect(screen.getByTestId('paid-pending-chart-legend')).toHaveTextContent(/Pendiente\s*10 %/);
  });

  it('add the closed month to the history and compare both months', async () => {
    renderApp('web');
    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(screen.getByTestId('comparison-chart-empty')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-month-close-button'));
    });

    expect(useBudgetStore.getState().activeMonthKey).toBe('2026-11');
    expect(screen.getByTestId('analytics-charts-panel')).toHaveTextContent(/Últimos 2 meses hasta Noviembre 2026/);
    expect(screen.getByTestId('analytics-chart-comparison')).toHaveTextContent(
      /Noviembre 2026 frente a Octubre 2026/
    );
    fireEvent.press(screen.getByTestId('cash-flow-chart-point-0'));
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Octubre 2026.*Mes cerrado/);

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    // November opens with October's closing debt; the payoff estimate stays the same.
    expect(screen.getByTestId('debt-trend-chart-readout')).toHaveTextContent(/Noviembre 2026.*\$ 6\.200\.000/);
  });
});

describe('charts and cards agree', () => {
  it('on a closed month that is edited again from the history', async () => {
    renderApp('android');
    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-month-close-button'));
    });

    // Back to the closed October, then a pending expense is paid.
    fireEvent.press(screen.getByTestId('history-month-pill-2026-10'));
    await act(async () => {
      await useBudgetStore.getState().toggleEntryStatus('2026-10_exp_smart_fit', '2026-10-31');
    });

    // The card and the charts read the same live month: $ 1.080.000 - $ 100.000.
    expect(screen.getByTestId('analytics-and-history-view')).toHaveTextContent(/\$ 980\.000/);
    expect(screen.getByTestId('balance-chart-readout')).toHaveTextContent(/\$ 980\.000/);
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Pagado\s*\$ 3\.020\.000/);
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Mes cerrado/);
    // October is now the oldest month, already closed: no invitation to close one.
    expect(screen.getByTestId('analytics-charts-panel')).toHaveTextContent(/No hay meses anteriores registrados/);
  });
});

describe('chart layout by width', () => {
  it('stacks the chart cards on a phone and sets them side by side on a desktop', () => {
    renderApp('web');
    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(screen.queryByTestId('analytics-charts-grid-row-0')).toBeNull();

    setWindowSize(1440, 900);
    expect(screen.getByTestId('analytics-charts-grid-row-0')).toBeTruthy();
    expect(screen.getByTestId('analytics-charts-grid-row-2')).toBeTruthy();
    expect(screen.queryByTestId('analytics-charts-grid-row-3')).toBeNull();

    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('savings-charts-grid-row-0')).toBeTruthy();
  });
});
