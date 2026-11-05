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

  it('renders Deudas screen and manages obligations with monthly interest rate', () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    expect(screen.getByTestId('debts-funfami-view')).toBeTruthy();
    expect(screen.getByText('Total Deudas')).toBeTruthy();
    expect(screen.getByTestId('funfami-hero-remaining')).toHaveTextContent('$ 6.200.000');
    expect(screen.getByTestId('debt-remaining-debt_cb300f_moto')).toHaveTextContent(
      '$ 2.600.000'
    );
    expect(screen.getByTestId('debt-remaining-debt_esp_ia')).toHaveTextContent('$ 3.600.000');

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

  it('links a checklist expense to a debt, manages custom savings funds & provisions, and resets account into InitialAccountSetupView', async () => {
    render(
      <BFlowThemeProvider initialMode="dark">
        <PhaseOneHomeScreen />
      </BFlowThemeProvider>
    );

    // Tab label is renamed to "Ahorros"
    expect(screen.getByTestId('workspace-tab-savings')).toHaveTextContent('Ahorros');

    // Link Smart Fit ($ 90.000 pending) to debt_esp_ia and complete it
    fireEvent.press(screen.getByTestId('workspace-tab-checklist'));
    fireEvent.press(screen.getByTestId('edit-entry-2026-10_exp_smart_fit'));
    fireEvent.press(screen.getByTestId('edit-entry-debt-debt_esp_ia'));
    fireEvent.press(screen.getByTestId('save-edit-entry-button'));

    // Mark Smart Fit ($ 100.000) as completed -> should deduct $ 100.000 from ESP. IA ($ 3.600.000 -> $ 3.500.000)
    fireEvent.press(screen.getByTestId('checklist-workspace-item-2026-10_exp_smart_fit'));
    fireEvent.press(screen.getByTestId('workspace-tab-debts'));
    expect(screen.getByTestId('debt-remaining-debt_esp_ia')).toHaveTextContent('$ 3.500.000');

    // Create a custom savings fund and a custom provision in Ahorros tab
    fireEvent.press(screen.getByTestId('workspace-tab-savings'));
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Fondo Viaje');
    fireEvent.changeText(screen.getByTestId('new-bucket-balance-input'), '500000');
    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));
    expect(screen.getByText('Fondo Viaje')).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-add-provision-button'));
    fireEvent.changeText(screen.getByTestId('provision-name-input'), 'Impuesto Vehicular');
    fireEvent.changeText(screen.getByTestId('provision-amount-input'), '240000');
    fireEvent.changeText(screen.getByTestId('provision-months-input'), '12');
    fireEvent.press(screen.getByTestId('submit-provision-button'));
    expect(screen.getByText('Impuesto Vehicular')).toBeTruthy();

    // Go to Analytics & Cierre and click "Reiniciar toda la cuenta"
    fireEvent.press(screen.getByTestId('workspace-tab-analytics'));
    expect(screen.getByTestId('analytics-paid-progress-bar')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reset-full-account-button'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-reset-full-account-button'));
    });

    // Must render InitialAccountSetupView
    expect(screen.getByTestId('initial-account-setup-view')).toBeTruthy();

    // Configure an income and complete setup
    fireEvent.changeText(screen.getByTestId('onboarding-income-name-input'), 'Salario Mensual');
    fireEvent.changeText(screen.getByTestId('onboarding-income-amount-input'), '5000000');
    fireEvent.press(screen.getByTestId('onboarding-add-income-button'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('initial-account-setup-view')).toBeNull();
      expect(screen.getByTestId('net-flow-hero-card')).toBeTruthy();
    });
  });
});
