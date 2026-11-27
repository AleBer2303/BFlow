/**
 * Credit cards and debit accounts in the Debts tab (ADR 0034): the Deuda / Crédito / Débito
 * selector of "+ Nueva Deuda", the account cards, and editing or deleting them, on every skin.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { Alert, Dimensions } from 'react-native';
import {
  AmountPrivacyProvider,
  HIDDEN_AMOUNT_TEXT,
} from '../../../../design-system/privacy/AmountPrivacyContext';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import {
  calculateFinancialAccountsSummary,
  type DebtSummaryResult,
  type FinancialAccount,
  type MonthEntry,
} from '../../../../domain';
import { DebtsWorkspaceView } from '../DebtsWorkspaceView';
import { formatShortDayLabelEs } from '../../../accounts/components/FinancialAccountCard';

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

const EMPTY_DEBT_SUMMARY: DebtSummaryResult = {
  monthKey: '2026-10',
  openingTotalDebt: 0,
  appliedInstallmentThisMonth: 0,
  totalRemainingDebt: 0,
  isInstallmentPaid: false,
  debts: [],
  projection: { remainingMonths: 0, estimatedPayoffMonthKey: null },
} as unknown as DebtSummaryResult;

const VISA: FinancialAccount = {
  id: 'acc_visa',
  type: 'credit',
  name: 'Visa Oro',
  institution: 'Banco Uno',
  lastFourDigits: '1234',
  openingBalance: 500_000,
  openingMonthKey: '2026-10',
  creditLimit: 2_000_000,
  statementDay: 15,
  paymentDueDay: 30,
  monthlyInterestRate: 2.1,
};

const NOMINA: FinancialAccount = {
  id: 'acc_nomina',
  type: 'debit',
  name: 'Cuenta nómina',
  institution: 'Banco Dos',
  openingBalance: 100_000,
  openingMonthKey: '2026-10',
  debitKind: 'checking',
};

const ENTRIES: MonthEntry[] = [
  {
    id: 'e1',
    monthKey: '2026-10',
    conceptId: 'c1',
    conceptName: 'Mercado',
    type: 'expense',
    group: 'variable',
    plannedAmount: 300_000,
    actualAmount: 300_000,
    status: 'completed',
    accountId: VISA.id,
    accountRole: 'purchase',
  },
  {
    id: 'e2',
    monthKey: '2026-10',
    conceptId: 'c2',
    conceptName: 'Arriendo',
    type: 'expense',
    group: 'fixed',
    plannedAmount: 400_000,
    actualAmount: 400_000,
    status: 'completed',
    accountId: NOMINA.id,
  },
];

const ACCOUNTS = [VISA, NOMINA];
const SUMMARY = calculateFinancialAccountsSummary(ACCOUNTS, ENTRIES, '2026-10', '2026-10-20');

function setWindowSize(width: number, height: number): void {
  act(() => {
    const metrics = { width, height, scale: 2, fontScale: 1 };
    Dimensions.set({ window: metrics, screen: metrics });
  });
}

function renderView(
  skin: PlatformSkinId,
  overrides?: Partial<React.ComponentProps<typeof DebtsWorkspaceView>>,
  hidden = false
) {
  const handlers = {
    onCreateDebt: jest.fn(),
    onUpdateDebt: jest.fn(),
    onDeleteDebt: jest.fn(),
    onCreateAccount: jest.fn(),
    onUpdateAccount: jest.fn(),
    onDeleteAccount: jest.fn(),
  };
  const utils = render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <AmountPrivacyProvider initialHidden={hidden}>
        <DebtsWorkspaceView
          debtSummary={EMPTY_DEBT_SUMMARY}
          financialAccounts={ACCOUNTS}
          accountsSummary={SUMMARY}
          {...handlers}
          {...overrides}
        />
      </AmountPrivacyProvider>
    </BFlowThemeProvider>
  );
  return { ...utils, ...handlers };
}

beforeEach(() => {
  setWindowSize(390, 844);
  jest.restoreAllMocks();
});

afterAll(() => {
  act(() => {
    Dimensions.set({ window: ORIGINAL_WINDOW, screen: ORIGINAL_SCREEN });
  });
});

describe.each(PLATFORM_SKIN_IDS)('Financial accounts in the Debts tab on %s skin', (skin) => {
  it('offers Deuda, Crédito and Débito in + Nueva Deuda, starting on Deuda', () => {
    renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));

    expect(screen.getByTestId('obligation-kind-selector')).toBeTruthy();
    expect(screen.getByTestId('obligation-kind-debt').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByText('Registrar Nueva Deuda')).toBeTruthy();
    expect(screen.getByTestId('debt-form-name-input')).toBeTruthy();
    expect(screen.queryByTestId('account-form-credit')).toBeNull();

    fireEvent.press(screen.getByTestId('obligation-kind-credit'));
    expect(screen.getByText('Registrar Tarjeta de Crédito')).toBeTruthy();
    expect(screen.getByTestId('account-form-credit')).toBeTruthy();
    expect(screen.queryByTestId('debt-form-name-input')).toBeNull();
    expect(screen.getByTestId('account-form-credit-limit-input')).toBeTruthy();
    expect(screen.getByTestId('account-form-statement-day-input')).toBeTruthy();
    expect(screen.getByTestId('account-form-due-day-input')).toBeTruthy();

    fireEvent.press(screen.getByTestId('obligation-kind-debit'));
    // Deudas only registers checking accounts: savings accounts live in Ahorros.
    expect(screen.getByText('Registrar Cuenta Corriente')).toBeTruthy();
    expect(within(screen.getByTestId('debt-form-modal')).getByText('Débito · Corriente')).toBeTruthy();
    expect(screen.getByTestId('account-form-debit')).toBeTruthy();
    expect(screen.queryByTestId('account-form-credit-limit-input')).toBeNull();
    expect(screen.queryByText('Ahorros')).toBeNull();
    expect(screen.getByText('Guardar Cuenta')).toBeTruthy();
  });

  it('registers a credit card with its limit, cut-off and payment days', () => {
    const { onCreateAccount } = renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.press(screen.getByTestId('obligation-kind-credit'));

    fireEvent.changeText(screen.getByTestId('account-form-balance-input'), '250.000');
    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Mastercard');
    fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Banco Tres');
    fireEvent.changeText(screen.getByTestId('account-form-last-four-input'), '98a76');
    // Card digits are not an amount: no thousands separator.
    expect(screen.getByTestId('account-form-last-four-input').props.value).toBe('9876');
    fireEvent.changeText(screen.getByTestId('account-form-credit-limit-input'), '1.000.000');
    expect(screen.getByTestId('account-form-credit-preview').props.children).toBe(
      'Cupo disponible: $ 750.000 · Uso 25%'
    );
    fireEvent.changeText(screen.getByTestId('account-form-statement-day-input'), '5');
    fireEvent.changeText(screen.getByTestId('account-form-due-day-input'), '20');
    fireEvent.changeText(screen.getByTestId('account-form-interest-rate-input'), '1,9');
    fireEvent.press(screen.getByTestId('account-form-submit-button'));

    expect(onCreateAccount).toHaveBeenCalledWith({
      type: 'credit',
      name: 'Mastercard',
      institution: 'Banco Tres',
      lastFourDigits: '9876',
      openingBalance: 250_000,
      creditLimit: 1_000_000,
      statementDay: 5,
      paymentDueDay: 20,
      monthlyInterestRate: 1.9,
    });
    // The form closes after saving.
    expect(screen.getByText('+ Nueva Deuda')).toBeTruthy();
  });

  it('validates the credit card fields inside the form', () => {
    const { onCreateAccount } = renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.press(screen.getByTestId('obligation-kind-credit'));
    const submit = () => fireEvent.press(screen.getByTestId('account-form-submit-button'));

    submit();
    expect(screen.getByText('Escribe el nombre de la tarjeta.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Visa');
    submit();
    expect(screen.getByText('Escribe el banco o la entidad.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Banco');
    fireEvent.changeText(screen.getByTestId('account-form-last-four-input'), '12');
    submit();
    expect(screen.getByText('Los últimos dígitos deben ser exactamente 4 números.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('account-form-last-four-input'), '');
    submit();
    expect(screen.getByText('Ingresa el cupo total de la tarjeta.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('account-form-credit-limit-input'), '900000');
    fireEvent.changeText(screen.getByTestId('account-form-statement-day-input'), '45');
    submit();
    expect(screen.getByText('Los días de corte y de pago deben estar entre 1 y 31.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('account-form-statement-day-input'), '');
    fireEvent.changeText(screen.getByTestId('account-form-interest-rate-input'), '120');
    submit();
    expect(screen.getByText('La tasa de interés mensual debe ser entre 0% y 100%.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('account-form-interest-rate-input'), '');
    submit();

    expect(onCreateAccount).toHaveBeenCalledWith({
      type: 'credit',
      name: 'Visa',
      institution: 'Banco',
      openingBalance: 0,
      creditLimit: 900_000,
    });
  });

  it('registers a checking account with its balance', () => {
    const { onCreateAccount } = renderView(skin);
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    fireEvent.press(screen.getByTestId('obligation-kind-debit'));

    fireEvent.press(screen.getByTestId('account-form-submit-button'));
    expect(screen.getByText('Escribe el nombre de la cuenta.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('account-form-balance-input'), '1.200.000');
    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Ahorros');
    fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Banco Dos');
    fireEvent.press(screen.getByTestId('account-form-submit-button'));

    expect(onCreateAccount).toHaveBeenCalledWith({
      type: 'debit',
      name: 'Ahorros',
      institution: 'Banco Dos',
      openingBalance: 1_200_000,
      debitKind: 'checking',
    });
  });

  it('shows credit and debit cards with their balance, credit line and dates', () => {
    renderView(skin);

    expect(screen.getByTestId('financial-accounts-section')).toBeTruthy();
    expect(screen.getByText('Tarjetas y cuentas')).toBeTruthy();
    expect(screen.getByTestId('account-card-acc_visa')).toBeTruthy();
    expect(screen.getByTestId('account-card-acc_nomina')).toBeTruthy();
    expect(screen.getByText('Banco Uno ·· 1234')).toBeTruthy();
    expect(screen.getByText('Valor pendiente de pago')).toBeTruthy();
    expect(screen.getByText('Disponible $ 1.200.000 de $ 2.000.000 · Uso 40%')).toBeTruthy();
    expect(screen.getByText('Corte: 15 nov · Pago: 30 oct')).toBeTruthy();
    expect(screen.getByText('Este mes: compras $ 300.000 · pagos $ 0')).toBeTruthy();
    expect(screen.getByText('Tasa: 2.1% mensual')).toBeTruthy();
    expect(screen.getByText('Débito · Corriente')).toBeTruthy();
    // 100.000 - 400.000: overdraft.
    expect(screen.getByText('Saldo en sobregiro')).toBeTruthy();
    expect(screen.getByText('Este mes: salidas $ 400.000 · entradas $ 0')).toBeTruthy();
  });

  it('edits an account from Editar mode without offering to change its kind', () => {
    const { onUpdateAccount } = renderView(skin);
    expect(screen.queryByTestId('account-edit-acc_visa')).toBeNull();

    fireEvent.press(screen.getByTestId('debt-action-edit-button'));
    fireEvent.press(screen.getByTestId('account-edit-acc_visa'));

    expect(screen.getByText('Editar Tarjeta de Crédito')).toBeTruthy();
    expect(screen.queryByTestId('obligation-kind-selector')).toBeNull();
    expect(screen.getByTestId('account-form-name-input').props.value).toBe('Visa Oro');
    expect(screen.getByTestId('account-form-credit-limit-input').props.value).toBe('2.000.000');
    expect(screen.getByTestId('account-form-statement-day-input').props.value).toBe('15');

    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Visa Platino');
    fireEvent.press(screen.getByTestId('account-form-submit-button'));

    expect(onUpdateAccount).toHaveBeenCalledWith(
      'acc_visa',
      expect.objectContaining({ name: 'Visa Platino', creditLimit: 2_000_000, statementDay: 15 })
    );
    expect(onUpdateAccount.mock.calls[0]?.[1]).not.toHaveProperty('type');
  });

  it('deletes an account from Eliminar mode after confirming', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { onDeleteAccount } = renderView(skin);

    fireEvent.press(screen.getByTestId('debt-action-delete-button'));
    fireEvent.press(screen.getByTestId('account-delete-acc_nomina'));

    expect(alertSpy).toHaveBeenCalled();
    expect(onDeleteAccount).toHaveBeenCalledWith('acc_nomina');
  });

  it('hides the account amounts with the privacy eye', () => {
    renderView(skin, undefined, true);
    expect(screen.queryByText('Este mes: compras $ 300.000 · pagos $ 0')).toBeNull();
    expect(
      screen.getByText(`Este mes: compras ${HIDDEN_AMOUNT_TEXT} · pagos ${HIDDEN_AMOUNT_TEXT}`)
    ).toBeTruthy();
  });

  it('shows no section and no kind selector when accounts are not wired', () => {
    renderView(skin, {
      accountsSummary: undefined,
      financialAccounts: undefined,
      onCreateAccount: undefined,
    });
    expect(screen.queryByTestId('financial-accounts-section')).toBeNull();
    fireEvent.press(screen.getByTestId('debts-add-new-debt-button'));
    expect(screen.queryByTestId('obligation-kind-selector')).toBeNull();
    expect(screen.getByText('Registrar Nueva Deuda')).toBeTruthy();
  });
});

describe('formatShortDayLabelEs', () => {
  it('formats an ISO date as day and short month', () => {
    expect(formatShortDayLabelEs('2026-11-05')).toBe('5 nov');
    expect(formatShortDayLabelEs('2027-01-31')).toBe('31 ene');
  });
});
