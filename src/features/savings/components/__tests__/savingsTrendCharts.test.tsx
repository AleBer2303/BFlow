/**
 * Phase 6 savings charts: stacked balances and the ideal provision against real
 * contributions, on the three skins.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import type { MonthlyHistoryPoint } from '../../../../domain';
import { SavingsTrendCharts } from '../SavingsTrendCharts';

const OCTOBER: MonthlyHistoryPoint = {
  monthKey: '2026-10',
  isClosed: false,
  plannedIncome: 6_000_000,
  receivedIncome: 4_000_000,
  plannedExpenses: 3_370_000,
  paidExpenses: 2_920_000,
  pendingExpenses: 450_000,
  netCashFlow: 1_080_000,
  totalDebt: 6_200_000,
  reserveName: 'Moto',
  reserveBalance: 2_300_000,
  savingsName: 'Ahorros',
  savingsBalance: 2_080_000,
  otherSavingsBalance: 0,
  totalSavings: 4_380_000,
  reserveContribution: 700_000,
};

function renderCharts(
  history: MonthlyHistoryPoint[] = [OCTOBER],
  idealMonthlyProvision = 872_667,
  skin: PlatformSkinId = 'ios'
) {
  return render(
    <BFlowThemeProvider skin={skin}>
      <SavingsTrendCharts history={history} idealMonthlyProvision={idealMonthlyProvision} />
    </BFlowThemeProvider>
  );
}

describe.each(PLATFORM_SKIN_IDS)('SavingsTrendCharts on the %s skin', (skin) => {
  it('reproduces K4, K5 and K6 and the gap against the ideal provision', () => {
    renderCharts([OCTOBER], 872_667, skin);

    expect(screen.getByTestId('savings-chart-trend')).toHaveTextContent(/Total hoy: \$ 4\.380\.000/);
    const balances = screen.getByTestId('savings-trend-chart-readout');
    expect(balances).toHaveTextContent(/Moto\s*\$ 2\.300\.000/);
    expect(balances).toHaveTextContent(/Ahorros\s*\$ 2\.080\.000/);
    expect(balances).toHaveTextContent(/Total: \$ 4\.380\.000/);

    expect(screen.getByTestId('savings-chart-provision')).toHaveTextContent(/Ideal mensual: \$ 872\.667/);
    const provision = screen.getByTestId('provision-chart-readout');
    expect(provision).toHaveTextContent(/Aporte real\s*\$ 700\.000/);
    expect(provision).toHaveTextContent(/Brecha frente al ideal: -\$ 172\.667/);
    expect(screen.getByTestId('provision-chart-legend')).toHaveTextContent(/Ideal/);
  });
});

describe('SavingsTrendCharts', () => {
  it('adds the other buckets as their own layer only when they hold money', () => {
    renderCharts();
    expect(screen.getByTestId('savings-trend-chart-legend')).not.toHaveTextContent(/Otros fondos/);
  });

  it('shows the other buckets and a surplus over the ideal', () => {
    const november: MonthlyHistoryPoint = {
      ...OCTOBER,
      monthKey: '2026-11',
      otherSavingsBalance: 300_000,
      totalSavings: 4_680_000,
      reserveContribution: 900_000,
    };
    renderCharts([OCTOBER, november]);
    expect(screen.getByTestId('savings-trend-chart-legend')).toHaveTextContent(/Otros fondos/);
    expect(screen.getByTestId('provision-chart-readout')).toHaveTextContent(
      /Brecha frente al ideal: \+\$ 27\.333/
    );

    fireEvent.press(screen.getByTestId('savings-trend-chart-point-0'));
    expect(screen.getByTestId('savings-trend-chart-readout')).toHaveTextContent(/Octubre 2026/);
  });

  it('asks for a provision plan when there is no ideal to compare with', () => {
    renderCharts([OCTOBER], 0);
    expect(screen.getByTestId('savings-chart-provision')).toHaveTextContent(
      /Agrega ítems al plan de provisión/
    );
    expect(screen.getByTestId('provision-chart-readout')).not.toHaveTextContent(/Brecha/);
    expect(screen.getByTestId('provision-chart-legend')).not.toHaveTextContent(/Ideal/);
  });
});
