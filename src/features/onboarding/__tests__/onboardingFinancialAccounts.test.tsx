/**
 * Tarjetas de crédito y cuentas débito en el onboarding (ADR 0034).
 *
 * El paso de Deudas registra tarjetas y cuentas corrientes con el mismo «+ Nueva Deuda» de la
 * pestaña Deudas; el de Ahorros, cuentas de ahorros con «+ Nuevo Ahorro». Los movimientos del
 * onboarding se pueden vincular a esas cuentas.
 */

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { BFlowThemeProvider } from '../../../design-system/theme/ThemeContext';
import type { PlatformSkinId } from '../../../design-system/tokens';
import type { InitialOnboardingConfigInput } from '../../budget/store/useBudgetStore';
import { InitialAccountSetupView } from '../components/InitialAccountSetupView';

function renderSetup(skin: PlatformSkinId = 'ios') {
  const onCompleteSetup = jest.fn<void, [InitialOnboardingConfigInput]>();
  render(
    <BFlowThemeProvider initialMode="dark" skin={skin}>
      <InitialAccountSetupView defaultMonthKey="2026-10" onCompleteSetup={onCompleteSetup} />
    </BFlowThemeProvider>
  );
  return { onCompleteSetup };
}

function addCreditCard() {
  fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
  fireEvent.press(screen.getByTestId('obligation-kind-credit'));
  fireEvent.changeText(screen.getByTestId('account-form-balance-input'), '450000');
  fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Visa Oro');
  fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Davivienda');
  fireEvent.changeText(screen.getByTestId('account-form-last-four-input'), '1234');
  fireEvent.changeText(screen.getByTestId('account-form-credit-limit-input'), '3000000');
  fireEvent.changeText(screen.getByTestId('account-form-statement-day-input'), '15');
  fireEvent.changeText(screen.getByTestId('account-form-due-day-input'), '30');
  fireEvent.press(screen.getByTestId('account-form-submit-button'));
}

function addCheckingAccount() {
  fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
  fireEvent.press(screen.getByTestId('obligation-kind-debit'));
  fireEvent.changeText(screen.getByTestId('account-form-balance-input'), '800000');
  fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Nómina');
  fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Bancolombia');
  fireEvent.press(screen.getByTestId('account-form-submit-button'));
}

function addSavingsAccount() {
  fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
  fireEvent.press(screen.getByTestId('savings-kind-account'));
  fireEvent.changeText(screen.getByTestId('account-form-balance-input'), '1200000');
  fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Ahorro Viaje');
  fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Nu');
  fireEvent.press(screen.getByTestId('account-form-submit-button'));
}

function addExpense(name: string, amount: string, accountLabel: string, role?: 'payment') {
  fireEvent.press(screen.getByTestId('onboarding-toggle-add-movement'));
  fireEvent.changeText(screen.getByTestId('movement-amount-input'), amount);
  fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), name);
  fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
  fireEvent.press(screen.getByTestId('add-movement-account-select'));
  fireEvent.press(screen.getByText(accountLabel));
  fireEvent.press(screen.getByTestId('add-movement-account-picker-confirm'));
  if (role) fireEvent.press(screen.getByTestId(`add-movement-account-role-${role}`));
  fireEvent.press(screen.getByTestId('submit-movement-button'));
}

describe('Onboarding · tarjetas y cuentas (ADR 0034)', () => {
  it('ofrece Deuda · Crédito · Débito en el paso de deudas y Fondo · Cuenta de ahorros en el de ahorros', () => {
    renderSetup();

    fireEvent.press(screen.getByTestId('onboarding-toggle-add-debt'));
    expect(screen.getByTestId('obligation-kind-selector')).toBeTruthy();
    expect(screen.getByTestId('obligation-kind-debt')).toBeTruthy();
    expect(screen.getByTestId('obligation-kind-credit')).toBeTruthy();
    expect(screen.getByTestId('obligation-kind-debit')).toBeTruthy();

    fireEvent.press(screen.getByTestId('onboarding-toggle-add-bucket'));
    expect(screen.getByTestId('savings-kind-selector')).toBeTruthy();
    expect(screen.getByTestId('savings-kind-fund')).toBeTruthy();
    expect(screen.getByTestId('savings-kind-account')).toBeTruthy();
    expect(screen.getByTestId('onboarding-toggle-add-bucket')).toHaveTextContent('Cerrar');
  });

  it('registra una tarjeta, una cuenta corriente y una de ahorros, cada una en su paso', () => {
    const { onCompleteSetup } = renderSetup();

    addCreditCard();
    addCheckingAccount();
    addSavingsAccount();

    const debtsStep = within(screen.getByTestId('onboarding-debts-section'));
    expect(debtsStep.getByText('Visa Oro ·· 1234 (Davivienda)')).toBeTruthy();
    expect(debtsStep.getByText(/Tarjeta de crédito · Pendiente al iniciar · Cupo: \$ 3\.000\.000 · Corte: día 15 · Pago: día 30/)).toBeTruthy();
    expect(debtsStep.getByText('Nómina (Bancolombia)')).toBeTruthy();
    expect(debtsStep.getByText(/Cuenta corriente · Saldo al iniciar/)).toBeTruthy();
    expect(debtsStep.queryByText(/Ahorro Viaje/)).toBeNull();
    expect(debtsStep.getByText('2 tarjetas y cuentas')).toBeTruthy();

    const savingsStep = within(screen.getByTestId('onboarding-savings-section'));
    expect(savingsStep.getByText('Ahorro Viaje (Nu)')).toBeTruthy();
    expect(savingsStep.getByText(/Cuenta de ahorros · Saldo al iniciar/)).toBeTruthy();
    expect(savingsStep.getByText('1 cuenta')).toBeTruthy();

    expect(screen.getByTestId('onboarding-summary-strip')).toHaveTextContent(
      /Tarjetas y cuentas \(3\)/
    );

    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    const config = onCompleteSetup.mock.calls[0]?.[0];
    expect(config?.financialAccounts).toHaveLength(3);
    expect(config?.financialAccounts?.[0]).toEqual(
      expect.objectContaining({
        type: 'credit',
        name: 'Visa Oro',
        institution: 'Davivienda',
        lastFourDigits: '1234',
        openingBalance: 450000,
        creditLimit: 3000000,
        statementDay: 15,
        paymentDueDay: 30,
        key: expect.stringMatching(/^acc_/),
      })
    );
    expect(config?.financialAccounts?.[1]).toEqual(
      expect.objectContaining({ type: 'debit', debitKind: 'checking', openingBalance: 800000 })
    );
    expect(config?.financialAccounts?.[2]).toEqual(
      expect.objectContaining({ type: 'debit', debitKind: 'savings', openingBalance: 1200000 })
    );
  });

  it('vincula gastos e ingresos a las cuentas y quita el vínculo al eliminar la cuenta', () => {
    const { onCompleteSetup } = renderSetup('android');

    addCreditCard();
    addSavingsAccount();

    addExpense('Mercado', '350000', 'Visa Oro ·· 1234 · Crédito');
    expect(screen.getByText(/Con: Visa Oro ·· 1234/)).toBeTruthy();

    addExpense('Pago Visa', '450000', 'Visa Oro ·· 1234 · Crédito', 'payment');
    expect(screen.getByText(/Pago a Visa Oro ·· 1234/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('onboarding-toggle-add-movement'));
    fireEvent.press(screen.getByTestId('modal-type-income'));
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '500000');
    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Intereses');
    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    fireEvent.press(screen.getByTestId('add-movement-account-select'));
    fireEvent.press(screen.getByText('Ahorro Viaje · Ahorros'));
    fireEvent.press(screen.getByTestId('add-movement-account-picker-confirm'));
    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(screen.getByText(/En: Ahorro Viaje/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    const first = onCompleteSetup.mock.calls[0]?.[0];
    const cardKey = first?.financialAccounts?.[0]?.key;
    const savingsKey = first?.financialAccounts?.[1]?.key;
    expect(first?.expenses).toEqual([
      expect.objectContaining({ name: 'Mercado', accountKey: cardKey, accountRole: 'purchase' }),
      expect.objectContaining({ name: 'Pago Visa', accountKey: cardKey, accountRole: 'payment' }),
    ]);
    expect(first?.incomes).toEqual([
      expect.objectContaining({ name: 'Intereses', accountKey: savingsKey }),
    ]);

    // Eliminar la tarjeta deja los gastos sin cuenta; el ingreso conserva la suya.
    fireEvent.press(screen.getByTestId(`onboarding-remove-account-${cardKey}`));
    expect(screen.queryByText(/Visa Oro/)).toBeNull();
    fireEvent.press(screen.getByTestId('complete-initial-setup-button'));
    const second = onCompleteSetup.mock.calls[1]?.[0];
    expect(second?.financialAccounts).toHaveLength(1);
    for (const expense of second?.expenses ?? []) {
      expect(expense.accountKey).toBeNull();
      expect(expense.accountRole).toBeUndefined();
    }
    expect(second?.incomes[0]?.accountKey).toBe(savingsKey);
  });
});
