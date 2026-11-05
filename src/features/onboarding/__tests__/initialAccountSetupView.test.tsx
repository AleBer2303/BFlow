import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import { InitialAccountSetupView } from '../components/InitialAccountSetupView';

describe('InitialAccountSetupView (Onboarding / Account Reset Wizard)', () => {
  it('renders initial account setup view with default state and native iOS wheel picker modal', () => {
    const mockComplete = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <InitialAccountSetupView defaultMonthKey="2026-03" onCompleteSetup={mockComplete} />
      </BFlowThemeProvider>
    );

    expect(screen.getByTestId('initial-account-setup-view')).toBeTruthy();
    expect(screen.getByText('Personaliza tu BFlow')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-dropdown-trigger')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-input')).toHaveTextContent('2026');
    expect(screen.getByTestId('onboarding-month-dropdown-trigger')).toBeTruthy();

    // Year Wheel Picker: open, check bounds [currentYear - 50, currentYear], select 2025, and confirm
    fireEvent.press(screen.getByTestId('onboarding-year-dropdown-trigger'));
    expect(screen.getByTestId('onboarding-year-picker')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-picker-option-1976')).toBeTruthy();
    expect(screen.getByTestId('onboarding-year-picker-option-2026')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-year-picker-option-2027')).toBeNull();

    fireEvent.press(screen.getByTestId('onboarding-year-picker-option-2025'));
    fireEvent.press(screen.getByTestId('onboarding-year-picker-confirm'));
    expect(screen.getByTestId('onboarding-year-input')).toHaveTextContent('2025');

    // Month Wheel Picker: open, scroll, select "Octubre" (10), and confirm
    expect(screen.queryByTestId('onboarding-month-picker')).toBeNull();
    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    expect(screen.getByTestId('onboarding-month-picker')).toBeTruthy();
    expect(screen.getByTestId('onboarding-month-picker-carousel-area')).toBeTruthy();
    expect(screen.getByTestId('onboarding-month-picker-lens')).toBeTruthy();

    // Test carousel scroll event
    fireEvent.scroll(screen.getByTestId('onboarding-month-picker-scroll-view'), {
      nativeEvent: { contentOffset: { y: 9 * 44 } },
    });

    // Tap option in vertical carousel: "Octubre" (10)
    fireEvent.press(screen.getByTestId('onboarding-month-picker-option-10'));

    // Confirm with "Listo"
    fireEvent.press(screen.getByTestId('onboarding-month-picker-confirm'));

    // Trigger should reflect the selected month
    expect(screen.getByText('Octubre')).toBeTruthy();
  });

  it('cancels wheel picker selection without committing when touching Cancelar or backdrop', () => {
    const mockComplete = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <InitialAccountSetupView defaultMonthKey="2026-03" onCompleteSetup={mockComplete} />
      </BFlowThemeProvider>
    );

    // Open picker
    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    expect(screen.getByTestId('onboarding-month-picker')).toBeTruthy();

    // Tap Cancelar
    fireEvent.press(screen.getByTestId('onboarding-month-picker-cancel'));
    expect(screen.queryByTestId('onboarding-month-picker-sheet')).toBeNull();

    // Open picker again and tap backdrop
    fireEvent.press(screen.getByTestId('onboarding-month-dropdown-trigger'));
    fireEvent.press(screen.getByTestId('onboarding-month-picker-backdrop'));
    expect(screen.queryByTestId('onboarding-month-picker-sheet')).toBeNull();
  });

  it('keeps empty state banners and collapses add forms into smooth accordions by default', () => {
    const mockComplete = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <InitialAccountSetupView defaultMonthKey="2026-10" onCompleteSetup={mockComplete} />
      </BFlowThemeProvider>
    );

    // Verify empty state banners are visible
    expect(screen.getByText(/Sin fondos registrados/)).toBeTruthy();
    expect(screen.getByText(/Sin deudas registradas/)).toBeTruthy();
    expect(screen.getByText(/Sin ingresos registrados/)).toBeTruthy();
    expect(screen.getByText(/Sin gastos registrados aún/)).toBeTruthy();
    expect(screen.getByText(/Sin provisiones registradas/)).toBeTruthy();

    // Verify all form fields are hidden by default
    expect(screen.queryByTestId('onboarding-new-bucket-name-input')).toBeNull();
    expect(screen.queryByTestId('onboarding-debt-name-input')).toBeNull();
    expect(screen.queryByTestId('onboarding-income-name-input')).toBeNull();
    expect(screen.queryByTestId('onboarding-expense-name-input')).toBeNull();
    expect(screen.queryByTestId('onboarding-provision-name-input')).toBeNull();

    // Toggle savings accordion open and cancel
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
    expect(screen.getByTestId('onboarding-new-bucket-name-input')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-cancel-add-bucket'));
    expect(screen.queryByTestId('onboarding-new-bucket-name-input')).toBeNull();
  });

  it('allows adding funds, debts, incomes, expenses, and provisions via accordions, then submits setup', () => {
    const mockComplete = jest.fn();

    render(
      <BFlowThemeProvider initialMode="dark">
        <InitialAccountSetupView defaultMonthKey="2026-10" onCompleteSetup={mockComplete} />
      </BFlowThemeProvider>
    );

    // 1. Add savings bucket via accordion
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
    fireEvent.changeText(screen.getByTestId('onboarding-new-bucket-name-input'), 'Emergencias');
    fireEvent.changeText(screen.getByTestId('onboarding-new-bucket-balance-input'), '500000');
    fireEvent.press(screen.getByTestId('onboarding-add-bucket-button'));
    expect(screen.getByText('Emergencias')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-new-bucket-name-input')).toBeNull();

    // 2. Add debt via accordion
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
    fireEvent.changeText(screen.getByTestId('onboarding-debt-name-input'), 'Crédito Moto');
    fireEvent.changeText(screen.getByTestId('onboarding-debt-lender-input'), 'Bancolombia');
    fireEvent.changeText(screen.getByTestId('onboarding-debt-balance-input'), '2000000');
    fireEvent.changeText(screen.getByTestId('onboarding-debt-installment-input'), '200000');
    fireEvent.press(screen.getByTestId('onboarding-add-debt-button'));
    expect(screen.getByText('Crédito Moto (Bancolombia)')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-debt-name-input')).toBeNull();

    // 3. Add income via accordion
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-income'));
    fireEvent.changeText(screen.getByTestId('onboarding-income-name-input'), 'Salario Principal');
    fireEvent.changeText(screen.getByTestId('onboarding-income-amount-input'), '3500000');
    fireEvent.press(screen.getByTestId('onboarding-income-group-fixed'));
    fireEvent.press(screen.getByTestId('onboarding-add-income-button'));
    expect(screen.getByText('Salario Principal')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-income-name-input')).toBeNull();

    // 4. Add expense linked to debt via accordion
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-expense'));
    fireEvent.changeText(screen.getByTestId('onboarding-expense-name-input'), 'Cuota Préstamo Moto');
    fireEvent.changeText(screen.getByTestId('onboarding-expense-amount-input'), '200000');
    const debtLinkBtn = screen.getByText('Abona a: Crédito Moto');
    fireEvent.press(debtLinkBtn);
    fireEvent.press(screen.getByTestId('onboarding-add-expense-button'));
    expect(screen.getByText('Cuota Préstamo Moto')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-expense-name-input')).toBeNull();

    // 5. Add provision via accordion
    fireEvent.press(screen.getByTestId('onboarding-toggle-add-provision'));
    fireEvent.changeText(screen.getByTestId('onboarding-provision-name-input'), 'SOAT 2027');
    fireEvent.changeText(screen.getByTestId('onboarding-provision-amount-input'), '650000');
    fireEvent.changeText(screen.getByTestId('onboarding-provision-months-input'), '12');
    fireEvent.press(screen.getByTestId('onboarding-add-provision-button'));
    expect(screen.getByText('SOAT 2027')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-provision-name-input')).toBeNull();

    // 6. Complete setup
    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    expect(mockComplete).toHaveBeenCalledTimes(1);

    const config = mockComplete.mock.calls[0][0];
    expect(config.monthKey).toBe('2026-10');
    expect(config.savingsBuckets).toHaveLength(1);
    expect(config.savingsBuckets[0].name).toBe('Emergencias');
    expect(config.savingsBuckets[0].openingBalanceCop).toBe(500000);

    expect(config.debts).toHaveLength(1);
    expect(config.debts[0].name).toBe('Crédito Moto');
    expect(config.debts[0].openingBalanceCop).toBe(2000000);
    expect(config.debts[0].monthlyInstallmentCop).toBe(200000);

    expect(config.incomes).toHaveLength(1);
    expect(config.incomes[0].name).toBe('Salario Principal');
    expect(config.incomes[0].amountCop).toBe(3500000);

    expect(config.expenses).toHaveLength(1);
    expect(config.expenses[0].name).toBe('Cuota Préstamo Moto');
    expect(config.expenses[0].amountCop).toBe(200000);
    expect(config.expenses[0].targetDebtKey).toContain('debt_');

    expect(config.provisions).toHaveLength(1);
    expect(config.provisions[0].name).toBe('SOAT 2027');
    expect(config.provisions[0].amountCop).toBe(650000);
    expect(config.provisions[0].periodMonths).toBe(12);
  });
});
