import { fireEvent, render, screen } from '@testing-library/react-native';
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

    // Toggle installment to pending -> restores total debt to $ 8.000.000
    fireEvent.press(screen.getByTestId('debts-view-toggle-installment'));
    expect(screen.getByTestId('funfami-hero-remaining')).toHaveTextContent('$ 8.000.000');
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
    expect(screen.getByText('Catálogo de Conceptos (14)')).toBeTruthy();

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
