import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AnalyticsAndHistoryView } from '../AnalyticsAndHistoryView';
import { BFlowThemeProvider } from '../../../../design-system';
import type {
  ChecklistProgress,
  DebtSummaryResult,
  GeneralSavingsBucketSummary,
  MonthlyBudgetSummary,
  MonthlySavingsSummary,
  MonthSnapshot,
  ReserveBucketSummary,
} from '../../../../domain';

const mockBudget: MonthlyBudgetSummary = {
  monthKey: '2026-10',
  receivedIncome: 4000000,
  plannedIncome: 6000000,
  pendingIncome: 2000000,
  paidExpenses: 2920000,
  plannedExpenses: 3370000,
  pendingExpenses: 450000,
  netCashFlow: 1080000,
  projectedNetFlow: 2630000,
  incomeByGroup: {
    fixed: { paid: 4000000, planned: 4000000, pending: 0 },
    variable: { paid: 0, planned: 2000000, pending: 2000000 },
  },
  expensesByGroup: {
    fixed: { paid: 2620000, planned: 2920000, pending: 300000 },
    variable: { paid: 300000, planned: 450000, pending: 150000 },
  },
};

const mockChecklistPending: ChecklistProgress = {
  monthKey: '2026-10',
  completedCount: 6,
  totalTrackableCount: 12,
  pendingCount: 6,
  completionRatio: 0.5,
  completionPercentage: 50,
  isMonthComplete: false,
};

const mockChecklistCompleted: ChecklistProgress = {
  monthKey: '2026-10',
  completedCount: 12,
  totalTrackableCount: 12,
  pendingCount: 0,
  completionRatio: 1,
  completionPercentage: 100,
  isMonthComplete: true,
};

const mockDebtSummary: DebtSummaryResult = {
  monthKey: '2026-10',
  openingTotalDebt: 8100000,
  appliedInstallmentThisMonth: 1000000,
  totalRemainingDebt: 7100000,
  isInstallmentPaid: true,
  debts: [],
  projection: {
    remainingMonths: 8,
    estimatedPayoffMonthKey: '2027-06',
  },
};

const mockReserveSummary: ReserveBucketSummary = {
  bucketId: 'moto',
  name: 'Fondo de Reserva',
  openingBalance: 1200000,
  paidContributionsThisMonth: 0,
  pendingContributionsThisMonth: 0,
  currentBalance: 1200000,
  projectedBalanceIfAllPaid: 1200000,
  contributingEntries: [],
};

const mockGeneralSavings: GeneralSavingsBucketSummary = {
  bucketId: 'savings',
  name: 'Fondo Ahorros',
  openingBalance: 500000,
  netCashFlowContribution: 0,
  currentBalance: 500000,
  projectedAfterPendingExpenses: 500000,
  projectedFullMonthBalance: 500000,
};

const mockSavingsSummary: MonthlySavingsSummary = {
  monthKey: '2026-10',
  hasReserveBucket: true,
  hasMotoBucket: true,
  reserve: mockReserveSummary,
  moto: mockReserveSummary,
  hasSavingsBucket: true,
  savings: mockGeneralSavings,
  customBuckets: [],
  totalCurrentSavings: 1700000,
  totalProjectedAfterPendingExpenses: 1700000,
};

const mockClosedSnapshot: MonthSnapshot = {
  monthKey: '2026-10',
  closedAtIso: '2026-10-31T23:59:59.000Z',
  budget: mockBudget,
  checklist: mockChecklistCompleted,
  closingDebts: [],
  totalClosingDebt: 7100000,
  closingSavings: {
    motoClosingBalance: 1200000,
    savingsClosingBalance: 500000,
    totalClosingSavings: 1700000,
  },
};

describe('AnalyticsAndHistoryView (Cierre de Mes e Historial)', () => {
  it('renders minimalist layout with open month status, checklist health, bento financial tiles, and close CTA', () => {
    const handleClose = jest.fn();
    const handleSelect = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-10"
          availableMonths={['2026-10']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistPending}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{}}
          onSelectMonth={handleSelect}
          onCloseCurrentMonth={handleClose}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('analytics-and-history-view')).toBeTruthy();
    expect(screen.getByTestId('month-close-and-history-card')).toBeTruthy();
    expect(screen.getByText('Cierre de Mes')).toBeTruthy();
    expect(screen.getByText('Mes Abierto')).toBeTruthy();
    expect(screen.getByText(/Tienes 6 movimientos pendientes/)).toBeTruthy();

    // Bento financial tiles
    expect(screen.getByText('FLUJO NETO HOY')).toBeTruthy();
    expect(screen.getByText('$ 1.080.000')).toBeTruthy();
    expect(screen.getByText('DEUDAS TOTALES')).toBeTruthy();
    expect(screen.getByText('$ 7.100.000')).toBeTruthy();
    expect(screen.getByText('TOTAL AHORROS')).toBeTruthy();
    expect(screen.getByText('$ 1.700.000')).toBeTruthy();

    // Confirm CTA
    const closeBtn = screen.getByTestId('confirm-month-close-button');
    expect(closeBtn).toBeTruthy();
    fireEvent.press(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders completed checklist health indicator when pendingCount is 0', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-10"
          availableMonths={['2026-10']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistCompleted}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{}}
          onSelectMonth={jest.fn()}
          onCloseCurrentMonth={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(
      screen.getByText('✨ Todos los movimientos del checklist están completados y al día.')
    ).toBeTruthy();
  });

  it('renders closed snapshot status badge when active month is closed', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-10"
          availableMonths={['2026-10']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistCompleted}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{ '2026-10': mockClosedSnapshot }}
          onSelectMonth={jest.fn()}
          onCloseCurrentMonth={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByText('Mes Cerrado · Snapshot')).toBeTruthy();
  });

  it('renders [Editar Mes] and [Eliminar Mes] buttons directly under "Historial de Meses", and complete history list underneath', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-11"
          availableMonths={['2026-10', '2026-11']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistPending}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{ '2026-10': mockClosedSnapshot }}
          onSelectMonth={jest.fn()}
          onCloseCurrentMonth={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('history-months-section')).toBeTruthy();
    expect(screen.getByText('Historial de Meses')).toBeTruthy();

    // The two buttons directly under the header
    const editBtn = screen.getByTestId('history-action-edit-button');
    const deleteBtn = screen.getByTestId('history-action-delete-button');
    expect(editBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();
    expect(screen.getByText('Editar Mes')).toBeTruthy();
    expect(screen.getByText('Eliminar Mes')).toBeTruthy();

    // The complete history list underneath
    expect(screen.getByTestId('history-months-list')).toBeTruthy();
    expect(screen.getByTestId('history-month-pill-2026-10')).toBeTruthy();
    expect(screen.getByTestId('history-month-pill-2026-11')).toBeTruthy();

    // In normal mode, no row displays edit or delete buttons
    expect(screen.queryByTestId('reopen-month-2026-10')).toBeNull();
    expect(screen.queryByTestId('delete-month-2026-11')).toBeNull();
  });

  it('toggles edit mode to reveal direct edit action in existing list and allows reopening closed month without noisy banner messages', () => {
    const handleReopen = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-11"
          availableMonths={['2026-10', '2026-11']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistPending}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{ '2026-10': mockClosedSnapshot }}
          onSelectMonth={jest.fn()}
          onCloseCurrentMonth={jest.fn()}
          onReopenClosedMonth={handleReopen}
        />
      </BFlowThemeProvider>
    );

    // Click [Editar Mes] under Historial de Meses
    fireEvent.press(screen.getByTestId('history-action-edit-button'));

    // Mode is now active: button shows "Cancelar Edición"
    expect(screen.getByText('Cancelar Edición')).toBeTruthy();
    // No noisy banner messages
    expect(screen.queryByText(/Modo edición activo/)).toBeNull();

    // The existing list directly displays the edit option on the closed month
    const reopenPill = screen.getByTestId('reopen-month-2026-10');
    expect(reopenPill).toBeTruthy();
    fireEvent.press(reopenPill);

    expect(handleReopen).toHaveBeenCalledWith('2026-10');
  });

  it('toggles delete mode to reveal direct delete action in existing list and allows deleting month without noisy banner messages', () => {
    const handleDelete = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-11"
          availableMonths={['2026-10', '2026-11']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistPending}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{ '2026-10': mockClosedSnapshot }}
          onSelectMonth={jest.fn()}
          onCloseCurrentMonth={jest.fn()}
          onDeleteOrRevertMonth={handleDelete}
        />
      </BFlowThemeProvider>
    );

    // Click [Eliminar Mes] under Historial de Meses
    fireEvent.press(screen.getByTestId('history-action-delete-button'));

    // Mode is now active: button shows "Cancelar Eliminación"
    expect(screen.getByText('Cancelar Eliminación')).toBeTruthy();
    // No noisy banner messages
    expect(screen.queryByText(/Modo eliminación activo/)).toBeNull();

    // The existing list directly displays the delete option on the eligible month
    const deletePill = screen.getByTestId('delete-month-2026-11');
    expect(deletePill).toBeTruthy();
    fireEvent.press(deletePill);

    expect(handleDelete).toHaveBeenCalledWith('2026-11');
  });

  it('selecting a month in the history list does NOT show edit or delete buttons on rows', () => {
    const handleSelect = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <AnalyticsAndHistoryView
          activeMonthKey="2026-11"
          availableMonths={['2026-10', '2026-11']}
          entries={[]}
          budget={mockBudget}
          checklist={mockChecklistPending}
          debtSummary={mockDebtSummary}
          savingsSummary={mockSavingsSummary}
          closedSnapshots={{ '2026-10': mockClosedSnapshot }}
          onSelectMonth={handleSelect}
          onCloseCurrentMonth={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    // In normal mode, row 2026-11 is selected, but has NO edit or delete buttons
    expect(screen.queryByTestId('delete-month-2026-11')).toBeNull();
    expect(screen.queryByTestId('reopen-month-2026-11')).toBeNull();

    // Tap on row 2026-10 to select it
    fireEvent.press(screen.getByTestId('history-month-pill-2026-10'));
    expect(handleSelect).toHaveBeenCalledWith('2026-10');

    // Still NO edit or delete buttons on rows
    expect(screen.queryByTestId('reopen-month-2026-10')).toBeNull();
    expect(screen.queryByTestId('delete-month-2026-10')).toBeNull();
  });
});
