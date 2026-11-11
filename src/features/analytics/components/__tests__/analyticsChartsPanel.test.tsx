/**
 * Phase 6 charts of the month-close tab, fed with the golden October 2026 seed, on the
 * three skins.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import seedFixture from '../../../../../fixtures/seed-october-2026.json';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import {
  buildMonthlyHistory,
  calculateMonthlyBudgetSummary,
  type Concept,
  type Debt,
  type DebtPayment,
  type MonthEntry,
  type MonthlyHistoryPoint,
  type SavingsBucket,
} from '../../../../domain';
import { AnalyticsChartsPanel } from '../AnalyticsChartsPanel';

const ENTRIES = seedFixture.entries as unknown as MonthEntry[];
const OCTOBER_HISTORY = buildMonthlyHistory({
  monthKeys: ['2026-10'],
  activeMonthKey: '2026-10',
  concepts: seedFixture.concepts as unknown as Concept[],
  entries: ENTRIES,
  debtPayments: seedFixture.debtPayments as unknown as DebtPayment[],
  debtsByMonth: { '2026-10': seedFixture.debts as unknown as Debt[] },
  savingsBucketsByMonth: { '2026-10': seedFixture.savingsBuckets as unknown as SavingsBucket[] },
  closedSnapshots: {},
});
const OCTOBER = OCTOBER_HISTORY[0] as MonthlyHistoryPoint;
const SEPTEMBER: MonthlyHistoryPoint = {
  ...OCTOBER,
  monthKey: '2026-09',
  isClosed: true,
  plannedIncome: 4_000_000,
  receivedIncome: 4_000_000,
  plannedExpenses: 3_000_000,
  paidExpenses: 2_500_000,
  pendingExpenses: 0,
  netCashFlow: 1_500_000,
};
const BUDGET = calculateMonthlyBudgetSummary(ENTRIES, '2026-10');

function renderPanel(history: readonly MonthlyHistoryPoint[] = OCTOBER_HISTORY, skin: PlatformSkinId = 'ios') {
  return render(
    <BFlowThemeProvider skin={skin}>
      <AnalyticsChartsPanel activeMonthKey="2026-10" history={history} budget={BUDGET} entries={ENTRIES} />
    </BFlowThemeProvider>
  );
}

describe.each(PLATFORM_SKIN_IDS)('AnalyticsChartsPanel on the %s skin', (skin) => {
  it('shows the six charts with the golden October figures', () => {
    renderPanel(OCTOBER_HISTORY, skin);

    for (const id of [
      'analytics-chart-cash-flow',
      'analytics-chart-balance',
      'analytics-chart-plan-vs-actual',
      'analytics-chart-paid-pending',
      'analytics-chart-distribution',
      'analytics-chart-comparison',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }

    const cashFlow = screen.getByTestId('cash-flow-chart-readout');
    expect(cashFlow).toHaveTextContent(/Octubre 2026/);
    expect(cashFlow).toHaveTextContent(/Recibido\s*\$ 4\.000\.000/);
    expect(cashFlow).toHaveTextContent(/Pagado\s*\$ 2\.920\.000/);
    expect(cashFlow).toHaveTextContent(/Pendiente\s*\$ 450\.000/);
    expect(cashFlow).toHaveTextContent(/Mes abierto/);

    expect(screen.getByTestId('balance-chart-readout')).toHaveTextContent(/\$ 1\.080\.000/);
    expect(screen.getByTestId('paid-pending-chart-legend')).toHaveTextContent(/Pagado.*87 %/);
    expect(screen.getByTestId('distribution-chart-legend')).toHaveTextContent(/Cuota FUNFAMI/);
    expect(screen.getByTestId('distribution-chart-legend')).toHaveTextContent(/Otros/);
  });
});

describe('AnalyticsChartsPanel', () => {
  it('invites to close the month while there is a single month of history', () => {
    renderPanel();
    expect(screen.getByTestId('analytics-charts-panel')).toHaveTextContent(
      /Al cerrar el mes verás aquí la evolución/
    );
    expect(screen.getByTestId('comparison-chart-empty')).toBeTruthy();
    expect(screen.queryByTestId('comparison-chart')).toBeNull();
  });

  it('switches the planned vs actual chart between expenses and incomes', () => {
    renderPanel();
    const readout = () => screen.getByTestId('plan-vs-actual-chart-readout');
    expect(readout()).toHaveTextContent(/Previsto\s*\$ 3\.370\.000/);
    expect(readout()).toHaveTextContent(/Pagado\s*\$ 2\.920\.000/);
    expect(readout()).toHaveTextContent(/Diferencia: -\$ 450\.000/);
    expect(screen.getByTestId('plan-vs-actual-kind-expenses').props.accessibilityState).toEqual({
      selected: true,
    });

    fireEvent.press(screen.getByTestId('plan-vs-actual-kind-incomes'));
    expect(readout()).toHaveTextContent(/Previsto\s*\$ 6\.000\.000/);
    expect(readout()).toHaveTextContent(/Recibido\s*\$ 4\.000\.000/);
    expect(readout()).toHaveTextContent(/Diferencia: -\$ 2\.000\.000/);

    // Pressing the chosen option again changes nothing.
    fireEvent.press(screen.getByTestId('plan-vs-actual-kind-incomes'));
    expect(readout()).toHaveTextContent(/Previsto\s*\$ 6\.000\.000/);
  });

  it('compares the month with the previous one and lets the user read any month', () => {
    renderPanel([SEPTEMBER, OCTOBER]);

    expect(screen.getByTestId('analytics-charts-panel')).toHaveTextContent(/Últimos 2 meses/);
    expect(screen.getByTestId('analytics-chart-comparison')).toHaveTextContent(
      /Octubre 2026 frente a Septiembre 2026/
    );
    const comparison = screen.getByTestId('comparison-chart-readout');
    expect(comparison).toHaveTextContent(/Flujo neto/);
    expect(comparison).toHaveTextContent(/Diferencia: -\$ 420\.000/);

    fireEvent.press(screen.getByTestId('comparison-chart-point-0'));
    expect(screen.getByTestId('comparison-chart-readout')).toHaveTextContent(
      /Ingresos recibidos.*Diferencia: \$ 0/
    );

    fireEvent.press(screen.getByTestId('cash-flow-chart-point-0'));
    expect(screen.getByTestId('cash-flow-chart-readout')).toHaveTextContent(/Septiembre 2026.*Mes cerrado/);
  });

  it('states each month to screen readers', () => {
    renderPanel([SEPTEMBER, OCTOBER]);
    expect(screen.getByTestId('balance-chart-point-0').props.accessibilityLabel).toBe(
      'Septiembre 2026: Flujo neto $ 1.500.000. Mes cerrado'
    );
  });

  it('shows an empty donut for a month without expenses', () => {
    render(
      <BFlowThemeProvider>
        <AnalyticsChartsPanel
          activeMonthKey="2026-10"
          history={OCTOBER_HISTORY}
          budget={calculateMonthlyBudgetSummary([], '2026-10')}
          entries={[]}
        />
      </BFlowThemeProvider>
    );
    expect(screen.getByTestId('distribution-chart-legend')).toHaveTextContent(
      'Este mes todavía no tiene gastos.'
    );
    expect(screen.getByTestId('paid-pending-chart-legend')).toHaveTextContent(
      'Este mes todavía no tiene gastos.'
    );
  });
});
