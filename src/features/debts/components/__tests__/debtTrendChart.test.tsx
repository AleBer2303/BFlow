/**
 * Phase 6 debt chart: history and projected payoff, on the three skins.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import type { DebtPayoffProjection, MonthlyHistoryPoint } from '../../../../domain';
import { DebtTrendChart } from '../DebtTrendChart';

function point(monthKey: string, totalDebt: number): MonthlyHistoryPoint {
  return {
    monthKey,
    isClosed: false,
    plannedIncome: 0,
    receivedIncome: 0,
    plannedExpenses: 0,
    paidExpenses: 0,
    pendingExpenses: 0,
    netCashFlow: 0,
    totalDebt,
    reserveName: 'Moto',
    reserveBalance: 0,
    savingsName: 'Ahorros',
    savingsBalance: 0,
    otherSavingsBalance: 0,
    totalSavings: 0,
  };
}

const OCTOBER_PROJECTION: DebtPayoffProjection = { remainingMonths: 4, estimatedPayoffMonthKey: '2027-02' };

function renderChart(
  history: MonthlyHistoryPoint[],
  projection: DebtPayoffProjection,
  skin: PlatformSkinId = 'ios'
) {
  return render(
    <BFlowThemeProvider skin={skin}>
      <DebtTrendChart history={history} projection={projection} />
    </BFlowThemeProvider>
  );
}

describe.each(PLATFORM_SKIN_IDS)('DebtTrendChart on the %s skin', (skin) => {
  it('states the estimated payoff of October 2026 and reads the current balance', () => {
    renderChart([point('2026-10', 6_200_000)], OCTOBER_PROJECTION, skin);

    expect(screen.getByTestId('debts-chart-trend')).toHaveTextContent(
      /Cierre estimado: Febrero 2027, en 4 meses/
    );
    expect(screen.getByTestId('debt-trend-chart-readout')).toHaveTextContent(/Octubre 2026/);
    expect(screen.getByTestId('debt-trend-chart-readout')).toHaveTextContent(/\$ 6\.200\.000/);
    expect(screen.getByTestId('debt-trend-chart-legend')).toHaveTextContent(/Proyección con la cuota actual/);
  });
});

describe('DebtTrendChart', () => {
  it('shows the projected payoff point when touched', () => {
    renderChart([point('2026-09', 8_000_000), point('2026-10', 6_200_000)], OCTOBER_PROJECTION);
    fireEvent.press(screen.getByTestId('debt-trend-chart-point-2'));
    const readout = screen.getByTestId('debt-trend-chart-readout');
    expect(readout).toHaveTextContent(/Febrero 2027 · cierre estimado/);
    expect(readout).toHaveTextContent(/\$ 0/);
    expect(readout).toHaveTextContent(/Faltan 4 meses de cuotas/);
    // The estimate may lie in another year, so its axis label carries it.
    expect(screen.getByTestId('debt-trend-chart')).toHaveTextContent(/Feb ’27/);
  });

  it('uses the singular for a single month left', () => {
    renderChart([point('2026-10', 1_000_000)], { remainingMonths: 1, estimatedPayoffMonthKey: '2026-11' });
    expect(screen.getByTestId('debts-chart-trend')).toHaveTextContent(/en 1 mes(?!es)/);
  });

  it('says when the debt is paid off', () => {
    renderChart([point('2026-09', 500_000), point('2026-10', 0)], {
      remainingMonths: 0,
      estimatedPayoffMonthKey: '2026-10',
    });
    expect(screen.getByTestId('debts-chart-trend')).toHaveTextContent(/Deuda saldada/);
    expect(screen.getByTestId('debt-trend-chart')).toBeTruthy();
  });

  it('explains when there is no installment to project with', () => {
    renderChart([point('2026-10', 1_000_000)], {
      remainingMonths: Number.POSITIVE_INFINITY,
      estimatedPayoffMonthKey: null,
    });
    expect(screen.getByTestId('debts-chart-trend')).toHaveTextContent(
      /Sin cuota configurada para estimar el cierre/
    );
    expect(screen.getByTestId('debt-trend-chart-legend')).not.toHaveTextContent(/Proyección/);
  });

  it('shows a message instead of an empty chart without debts', () => {
    renderChart([point('2026-10', 0)], { remainingMonths: 0, estimatedPayoffMonthKey: '2026-10' });
    expect(screen.getByTestId('debt-trend-chart-empty')).toHaveTextContent(
      'No hay deudas con saldo en estos meses.'
    );
    expect(screen.queryByTestId('debt-trend-chart')).toBeNull();
  });
});
