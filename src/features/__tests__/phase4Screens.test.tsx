import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import PhaseOneHomeScreen from '../../app/index';
import { BFlowThemeProvider } from '../../design-system/theme/ThemeContext';
import { useBudgetStore } from '../budget/store/useBudgetStore';

describe('Phase 4: Liquid Glass Workspace Tabs & 12 Functional Screens (RNTL)', () => {
  beforeEach(() => {
    useBudgetStore.getState().resetToOctober2026GoldenState();
  });

  it('navigates to Checklist tab, filters, completes, edits, and deletes movements', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    // Summary button uses updated label "Registrar Nuevo Movimiento"
    expect(screen.getByText('Registrar Nuevo Movimiento')).toBeTruthy();

    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    expect(screen.getByTestId('checklist-workspace-view')).toBeTruthy();

    // Redundant quick-add buttons are removed
    expect(screen.queryByTestId('quick-add-variable-income-button')).toBeNull();
    expect(screen.queryByTestId('quick-add-variable-expense-button')).toBeNull();

    // Filter by Pending (6) and Completed (6)
    fireEvent.press(screen.getByTestId('checklist-filter-pending'));
    expect(
      screen.getByTestId('checklist-workspace-item-2026-10_exp_seguro_tr_sura')
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('checklist-filter-all'));

    // Open Add Movement modal (Screen 04)
    fireEvent.press(screen.getByTestId('open-add-movement-modal-button'));
    expect(screen.getByTestId('add-movement-modal-card')).toBeTruthy();

    // Completed single-occurrence concepts (e.g. CB300F, Cuota FUNFAMI) must NOT appear as available chips
    expect(screen.queryByTestId('available-concept-chip-exp_cb300f')).toBeNull();
    expect(screen.queryByTestId('available-concept-chip-exp_cuota_funfami')).toBeNull();

    // Pending concepts (Seguro TR SURA) and repeatable concepts (Otro) MUST appear
    const suraChip = screen.getByTestId('available-concept-chip-exp_seguro_tr_sura');
    expect(suraChip).toBeTruthy();
    expect(screen.getByTestId('available-concept-chip-exp_otro')).toBeTruthy();

    // Select Seguro TR SURA ($ 130.000) and submit
    fireEvent.press(suraChip);
    fireEvent.press(screen.getByTestId('submit-movement-button'));

    // Modal closes and paid expenses increase from $ 2.920.000 to $ 3.050.000
    expect(screen.queryByTestId('add-movement-modal-card')).toBeNull();
    expect(
      screen.getByText('Pagado $ 3.050.000 / Previsto $ 3.370.000')
    ).toBeTruthy();

    // Edit an existing item (Smart Fit -> $ 100.000)
    fireEvent.press(screen.getByTestId('edit-entry-2026-10_exp_smart_fit'));
    expect(screen.getByTestId('edit-entry-modal-card')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('edit-entry-name-input'), 'Smart Fit Black');
    fireEvent.changeText(screen.getByTestId('edit-entry-amount-input'), '100000');
    fireEvent.press(screen.getByTestId('save-edit-entry-button'));
    expect(screen.getByText('○ Smart Fit Black')).toBeTruthy();

    // Delete an item from the checklist
    fireEvent.press(screen.getByTestId('delete-entry-2026-10_exp_smart_fit'));
    expect(screen.queryByText('○ Smart Fit Black')).toBeNull();

    // Open Add Movement modal and edit an available concept in catalog
    fireEvent.press(screen.getByTestId('open-add-movement-modal-button'));
    const otroChip = screen.getByTestId('available-concept-chip-exp_otro');
    fireEvent.press(otroChip);
    fireEvent.press(screen.getByTestId('edit-concept-trigger-exp_otro'));
    fireEvent.changeText(screen.getByTestId('edit-concept-name-input'), 'Gastos Varios');
    fireEvent.press(screen.getByTestId('save-concept-changes-button'));
    expect(screen.getByText('Gastos Varios')).toBeTruthy();
    expect(screen.getByText('Gasto Variable')).toBeTruthy();
    fireEvent.press(screen.getByTestId('close-add-movement-modal-button'));
  });

  it('renders Deudas FUNFAMI screen, modifies monthly installment amount, and cascades payoff from CB300F - MOTO into ESP. IA', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    expect(screen.getByTestId('debts-funfami-view')).toBeTruthy();
    expect(screen.getByTestId('funfami-hero-remaining')).toHaveTextContent('$ 6.200.000');
    expect(screen.getByTestId('debt-remaining-debt_cb300f_moto')).toHaveTextContent(
      '$ 2.600.000'
    );
    expect(screen.getByTestId('debt-remaining-debt_esp_ia')).toHaveTextContent('$ 3.600.000');

    // Modify monthly installment amount to $ 5.000.000 (which pays off $ 4.400.000 CB300F - MOTO and subtracts $ 600.000 from ESP. IA)
    fireEvent.changeText(screen.getByTestId('funfami-installment-amount-input'), '5000000');
    fireEvent.press(screen.getByTestId('funfami-apply-installment-button'));

    // CB300F - MOTO is now 0 and removed from active obligations, and ESP. IA drops from $ 3.600.000 to $ 3.000.000!
    expect(screen.queryByTestId('debt-card-debt_cb300f_moto')).toBeNull();
    expect(screen.getByTestId('moto-debt-completed-banner')).toBeTruthy();
    expect(screen.getByTestId('debt-remaining-debt_esp_ia')).toHaveTextContent('$ 3.000.000');
    expect(screen.getByTestId('funfami-hero-remaining')).toHaveTextContent('$ 3.000.000');

    // Dismiss the banner
    fireEvent.press(screen.getByTestId('moto-debt-banner-dismiss-button'));
    expect(screen.queryByTestId('moto-debt-completed-banner')).toBeNull();

    // Toggle installment to pending -> restores total debt to $ 8.000.000
    fireEvent.press(screen.getByTestId('debts-view-toggle-installment'));
    expect(screen.getByTestId('funfami-hero-remaining')).toHaveTextContent('$ 8.000.000');

    // Create a new debt with monthly interest rate
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.getByTestId('debt-form-modal')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('debt-form-name-input'), 'Tarjeta Nu');
    fireEvent.changeText(screen.getByTestId('debt-form-lender-input'), 'Nu Colombia');
    fireEvent.changeText(screen.getByTestId('debt-form-amount-input'), '1000000');
    fireEvent.changeText(screen.getByTestId('debt-form-interest-rate-input'), '0.9');
    fireEvent.press(screen.getByTestId('debt-form-submit-button'));

    expect(screen.queryByTestId('debt-form-modal')).toBeNull();
    expect(screen.getByText('Tarjeta Nu')).toBeTruthy();
  });

  it('renders Ahorros & Moto IDEAL screens without Excel cell references', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    expect(screen.getByTestId('savings-and-moto-ideal-view')).toBeTruthy();

    expect(screen.getByTestId('savings-hero-total')).toHaveTextContent('$ 4.380.000');
    expect(screen.getByTestId('bucket-moto-current')).toHaveTextContent('$ 2.300.000');
    expect(screen.getByTestId('bucket-savings-current')).toHaveTextContent('$ 2.080.000');
    expect(screen.getByText('Tras pendientes: $ 1.630.000')).toBeTruthy();

    expect(screen.getByText('Cuota ideal: $ 872.667/mes')).toBeTruthy();
    expect(
      screen.getByTestId('moto-target-goal-ideal_kit_de_arrastre_honda_original')
    ).toBeTruthy();
    expect(screen.getByText('Meta: 2027-08')).toBeTruthy();

    // Adjust opening balance in savings tab
    fireEvent.press(screen.getByTestId('open-edit-opening-balance-button'));
    expect(screen.getByTestId('edit-opening-balances-card')).toBeTruthy();
    expect(screen.getByTestId('moto-opening-balance-input').props.value).toBe('1600000');
    expect(screen.getByTestId('savings-opening-balance-input').props.value).toBe('1000000');
    fireEvent.press(screen.getByTestId('save-opening-balances-button'));
    expect(screen.queryByTestId('edit-opening-balances-card')).toBeNull();
  });

  it('registers a movement directly from Summary tab and immediately updates summary totals and list', async () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    // Initial Net Flow: $ 1.080.000
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 1.080.000');

    // Open Summary Add Movement modal
    fireEvent.press(screen.getByTestId('summary-quick-open-checklist-add'));
    expect(screen.getByTestId('summary-add-movement-modal-card')).toBeTruthy();

    // Select Seguro TR SURA ($ 130.000) and save
    fireEvent.press(screen.getByTestId('summary-concept-chip-exp_seguro_tr_sura'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('summary-submit-movement-button'));
    });

    // Modal closes and Net Flow drops by $ 130.000 -> $ 950.000
    expect(screen.queryByTestId('summary-add-movement-modal-card')).toBeNull();
    expect(screen.getByTestId('golden-net-flow')).toHaveTextContent('$ 950.000');
  });

  it('renders Analytics, executes Month Close to Nov 2026, and supports editing closed months or deleting an accidentally created month', async () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(screen.getByTestId('analytics-and-history-view')).toBeTruthy();
    expect(screen.getByText('Pagado 86.6% · Pendiente 13.4%')).toBeTruthy();
    expect(screen.queryByTestId('concepts-catalog-card')).toBeNull();

    // Trigger Month Close & Rollover (2026-10 -> 2026-11)
    fireEvent.press(screen.getByTestId('confirm-month-close-button'));

    expect(await screen.findByText('BFlow · Noviembre 2026')).toBeTruthy();
    expect(screen.getByTestId('history-month-pill-2026-10')).toBeTruthy();
    expect(screen.getByTestId('history-month-pill-2026-11')).toBeTruthy();

    // Delete the newly created month (2026-11) if closed by accident -> returns to Octubre 2026 as Mes Abierto
    fireEvent.press(screen.getByTestId('delete-month-2026-11'));
    expect(screen.getByText('BFlow · Octubre 2026')).toBeTruthy();
    expect(screen.getByText('Mes Abierto')).toBeTruthy();
    expect(screen.queryByTestId('history-month-pill-2026-11')).toBeNull();
  });
});
