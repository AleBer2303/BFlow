/**
 * Phase 6 savings chart: stacked balances per month, on the three skins, with only the
 * title, the readout and the drawing.
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
};

function renderChart(history: MonthlyHistoryPoint[] = [OCTOBER], skin: PlatformSkinId = 'ios') {
  return render(
    <BFlowThemeProvider skin={skin}>
      <SavingsTrendCharts history={history} />
    </BFlowThemeProvider>
  );
}

describe.each(PLATFORM_SKIN_IDS)('SavingsTrendCharts on the %s skin', (skin) => {
  it('reproduces K4 and K5 in the readout of the active month', () => {
    renderChart([OCTOBER], skin);

    expect(screen.getByRole('header')).toHaveTextContent('Evolución de ahorros');
    const balances = screen.getByTestId('savings-trend-chart-readout');
    expect(balances).toHaveTextContent(/Octubre 2026/);
    expect(balances).toHaveTextContent(/Moto\s*\$ 2\.300\.000/);
    expect(balances).toHaveTextContent(/Ahorros\s*\$ 2\.080\.000/);
  });
});

describe('SavingsTrendCharts', () => {
  it('keeps only the title, the readout and the drawing', () => {
    renderChart();
    expect(screen.getByTestId('savings-trend-chart-readout')).not.toHaveTextContent(/Otros fondos/);
    expect(screen.queryByTestId('savings-trend-chart-legend')).toBeNull();
    expect(screen.getByTestId('savings-chart-trend')).not.toHaveTextContent(/Total/);
    // The ideal provision chart was removed from the Savings tab.
    expect(screen.queryByTestId('savings-chart-provision')).toBeNull();
  });

  it('adds the other buckets as their own layer only when they hold money', () => {
    const november: MonthlyHistoryPoint = {
      ...OCTOBER,
      monthKey: '2026-11',
      otherSavingsBalance: 300_000,
      totalSavings: 4_680_000,
    };
    renderChart([OCTOBER, november]);
    expect(screen.getByTestId('savings-trend-chart-readout')).toHaveTextContent(
      /Otros fondos\s*\$ 300\.000/
    );
  });

  it('reads any month of the history when touched', () => {
    renderChart([OCTOBER, { ...OCTOBER, monthKey: '2026-11', reserveBalance: 2_500_000 }]);
    fireEvent.press(screen.getByTestId('savings-trend-chart-point-0'));
    expect(screen.getByTestId('savings-trend-chart-readout')).toHaveTextContent(/Octubre 2026/);
  });
});
