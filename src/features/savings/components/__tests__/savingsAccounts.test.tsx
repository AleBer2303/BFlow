/**
 * Savings bank accounts in the Savings tab (ADR 0034): "+ Nuevo Ahorro" picks a fund or a
 * savings account, the account cards, and editing or deleting them, on every skin.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { Alert, Dimensions } from 'react-native';
import { BFlowThemeProvider } from '../../../../design-system/theme/ThemeContext';
import { PLATFORM_SKIN_IDS, type PlatformSkinId } from '../../../../design-system/tokens';
import {
  calculateFinancialAccountsSummary,
  type FinancialAccount,
  type MonthEntry,
  type MonthlySavingsSummary,
  type ProvisionPlanComparisonSummary,
} from '../../../../domain';
import { SavingsAndMotoIdealView } from '../SavingsAndMotoIdealView';

const ORIGINAL_WINDOW = Dimensions.get('window');
const ORIGINAL_SCREEN = Dimensions.get('screen');

const EMPTY_BUCKET = {
  bucketId: 'moto',
  name: 'Fondo de Reserva',
  openingBalance: 0,
  paidContributionsThisMonth: 0,
  pendingContributionsThisMonth: 0,
  currentBalance: 0,
  projectedBalanceIfAllPaid: 0,
  contributingEntries: [],
};

const NO_FUNDS_SUMMARY: MonthlySavingsSummary = {
  monthKey: '2026-10',
  hasReserveBucket: false,
  hasMotoBucket: false,
  hasSavingsBucket: false,
  reserve: EMPTY_BUCKET,
  moto: EMPTY_BUCKET,
  savings: {
    bucketId: 'savings',
    name: 'Fondo Ahorros',
    openingBalance: 0,
    netCashFlowContribution: 0,
    currentBalance: 0,
    projectedAfterPendingExpenses: 0,
    projectedFullMonthBalance: 0,
  },
  customBuckets: [],
  totalCurrentSavings: 0,
  totalProjectedAfterPendingExpenses: 0,
};

const NO_PROVISIONS: ProvisionPlanComparisonSummary = {
  monthKey: '2026-10',
  recurringItems: [],
  targetGoals: [],
  recurringMonthlyTotal: 0,
  excelRecurringMonthlyTotalCop: 0,
  strictCeilRecurringMonthlyTotal: 0,
  strictCeilRecurringMonthlyTotalCop: 0,
  totalWithTargetGoals: 0,
  totalWithTargetGoalsCop: 0,
  actualContribution: 0,
  actualMotoContributionCop: 0,
  monthlyGapAgainstIdeal: 0,
  monthlyGapAgainstIdealCop: 0,
};

const BOLSILLO: FinancialAccount = {
  id: 'acc_bolsillo',
  type: 'debit',
  debitKind: 'savings',
  name: 'Bolsillo Viaje',
  institution: 'Banco Uno',
  lastFourDigits: '7788',
  openingBalance: 1_000_000,
  openingMonthKey: '2026-10',
};

const ENTRIES: MonthEntry[] = [
  {
    id: 'deposito',
    monthKey: '2026-10',
    conceptId: 'deposito',
    conceptName: 'Ahorro quincena',
    type: 'income',
    group: 'fixed',
    plannedAmount: 300_000,
    actualAmount: 300_000,
    status: 'completed',
    accountId: BOLSILLO.id,
  },
  {
    id: 'retiro',
    monthKey: '2026-10',
    conceptId: 'retiro',
    conceptName: 'Tiquetes',
    type: 'expense',
    group: 'variable',
    plannedAmount: 100_000,
    actualAmount: 100_000,
    status: 'completed',
    accountId: BOLSILLO.id,
  },
];

const ACCOUNTS_SUMMARY = calculateFinancialAccountsSummary([BOLSILLO], ENTRIES, '2026-10');
const EMPTY_ACCOUNTS_SUMMARY = calculateFinancialAccountsSummary([], [], '2026-10');

function renderView(
  skin: PlatformSkinId,
  overrides?: Partial<React.ComponentProps<typeof SavingsAndMotoIdealView>>
) {
  const handlers = {
    onCreateSavingsBucket: jest.fn(),
    onUpdateOpeningBalance: jest.fn(),
    onDeleteSavingsBucket: jest.fn(),
    onCreateAccount: jest.fn(),
    onUpdateAccount: jest.fn(),
    onDeleteAccount: jest.fn(),
  };
  const utils = render(
    <BFlowThemeProvider skin={skin} initialMode="dark">
      <SavingsAndMotoIdealView
        savingsSummary={NO_FUNDS_SUMMARY}
        motoIdealSummary={NO_PROVISIONS}
        savingsAccounts={[BOLSILLO]}
        savingsAccountsSummary={ACCOUNTS_SUMMARY}
        {...handlers}
        {...overrides}
      />
    </BFlowThemeProvider>
  );
  return { ...utils, ...handlers };
}

beforeEach(() => {
  act(() => {
    const metrics = { width: 390, height: 844, scale: 2, fontScale: 1 };
    Dimensions.set({ window: metrics, screen: metrics });
  });
  jest.restoreAllMocks();
});

afterAll(() => {
  act(() => {
    Dimensions.set({ window: ORIGINAL_WINDOW, screen: ORIGINAL_SCREEN });
  });
});

describe.each(PLATFORM_SKIN_IDS)('Savings accounts in the Savings tab on %s skin', (skin) => {
  it('names the button "+ Nuevo Ahorro" and the modes Editar / Eliminar Ahorro', () => {
    renderView(skin);
    expect(screen.getByText('+ Nuevo Ahorro')).toBeTruthy();
    expect(screen.queryByText('+ Nuevo Fondo')).toBeNull();
    expect(screen.getByText('Editar Ahorro')).toBeTruthy();
    expect(screen.getByText('Eliminar Ahorro')).toBeTruthy();
  });

  it('offers Fondo and Cuenta de ahorros, starting on Fondo', () => {
    const { onCreateSavingsBucket } = renderView(skin);
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));

    const form = screen.getByTestId('add-savings-bucket-card');
    expect(within(form).getByTestId('savings-kind-selector')).toBeTruthy();
    expect(screen.getByTestId('savings-kind-fund').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(within(form).getByText('Nuevo Fondo de Ahorro')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('new-bucket-name-input'), 'Emergencias');
    fireEvent.changeText(screen.getByTestId('new-bucket-balance-input'), '200000');
    fireEvent.press(screen.getByTestId('submit-new-bucket-button'));
    expect(onCreateSavingsBucket).toHaveBeenCalledWith('Emergencias', 200_000);
  });

  it('registers a savings account from + Nuevo Ahorro', () => {
    const { onCreateAccount, onCreateSavingsBucket } = renderView(skin);
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    fireEvent.press(screen.getByTestId('savings-kind-account'));

    expect(screen.getByText('Nueva Cuenta de Ahorros')).toBeTruthy();
    expect(screen.getByTestId('account-form-savings')).toBeTruthy();
    expect(screen.queryByTestId('new-bucket-name-input')).toBeNull();
    expect(screen.queryByTestId('account-form-credit-limit-input')).toBeNull();

    fireEvent.changeText(screen.getByTestId('account-form-balance-input'), '2.500.000');
    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Cuenta de ahorros');
    fireEvent.changeText(screen.getByTestId('account-form-institution-input'), 'Banco Dos');
    fireEvent.changeText(screen.getByTestId('account-form-last-four-input'), '1122');
    fireEvent.press(screen.getByTestId('account-form-submit-button'));

    expect(onCreateAccount).toHaveBeenCalledWith({
      type: 'debit',
      debitKind: 'savings',
      name: 'Cuenta de ahorros',
      institution: 'Banco Dos',
      lastFourDigits: '1122',
      openingBalance: 2_500_000,
    });
    expect(onCreateSavingsBucket).not.toHaveBeenCalled();
    expect(screen.getByText('+ Nuevo Ahorro')).toBeTruthy();
  });

  it('lists the savings accounts with their balance and month deposits', () => {
    renderView(skin);

    expect(screen.getByTestId('savings-accounts-section')).toBeTruthy();
    expect(screen.getByText('Cuentas de ahorro')).toBeTruthy();
    expect(screen.getByText('Saldo total: $ 1.200.000 · Depósitos del mes: $ 300.000')).toBeTruthy();
    const card = screen.getByTestId('account-card-acc_bolsillo');
    expect(within(card).getByText('Cuenta de ahorros')).toBeTruthy();
    expect(within(card).getByText('Banco Uno ·· 7788')).toBeTruthy();
    expect(
      within(card).getByText('Este mes: depósitos $ 300.000 · retiros $ 100.000')
    ).toBeTruthy();
    expect(screen.getByTestId('savings-hero-accounts-balance')).toHaveTextContent(
      'En cuentas de ahorro: $ 1.200.000'
    );
    // With an account there is no "no savings yet" message.
    expect(screen.queryByTestId('empty-savings-buckets-card')).toBeNull();
  });

  it('edits a savings account from Editar Ahorro without offering the kind selector', () => {
    const { onUpdateAccount } = renderView(skin);
    fireEvent.press(screen.getByTestId('bucket-action-edit-button'));
    fireEvent.press(screen.getByTestId('account-edit-acc_bolsillo'));

    expect(screen.getByText('Editar Cuenta de Ahorros')).toBeTruthy();
    expect(screen.queryByTestId('savings-kind-selector')).toBeNull();
    expect(screen.getByTestId('account-form-name-input').props.value).toBe('Bolsillo Viaje');

    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Bolsillo Europa');
    fireEvent.press(screen.getByTestId('account-form-submit-button'));

    expect(onUpdateAccount).toHaveBeenCalledWith(
      'acc_bolsillo',
      expect.objectContaining({ name: 'Bolsillo Europa', debitKind: 'savings' })
    );
    expect(screen.queryByTestId('edit-savings-account-card')).toBeNull();
  });

  it('deletes a savings account from Eliminar Ahorro after confirming', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { onDeleteAccount } = renderView(skin);

    fireEvent.press(screen.getByTestId('bucket-action-delete-button'));
    fireEvent.press(screen.getByTestId('account-delete-acc_bolsillo'));

    expect(alertSpy).toHaveBeenCalled();
    expect(onDeleteAccount).toHaveBeenCalledWith('acc_bolsillo');
  });
});

describe('Savings tab without savings accounts', () => {
  it('shows the empty message and hides the accounts section and hero line', () => {
    renderView('ios', { savingsAccounts: [], savingsAccountsSummary: EMPTY_ACCOUNTS_SUMMARY });
    expect(screen.getByTestId('empty-savings-buckets-card')).toBeTruthy();
    expect(screen.getByText(/Usa "\+ Nuevo Ahorro"/)).toBeTruthy();
    expect(screen.queryByTestId('savings-accounts-section')).toBeNull();
    expect(screen.queryByTestId('savings-hero-accounts-balance')).toBeNull();
  });

  it('offers only funds when accounts are not wired', () => {
    renderView('ios', {
      savingsAccounts: undefined,
      savingsAccountsSummary: undefined,
      onCreateAccount: undefined,
    });
    fireEvent.press(screen.getByTestId('open-add-savings-bucket-button'));
    expect(screen.queryByTestId('savings-kind-selector')).toBeNull();
    expect(screen.getByTestId('new-bucket-name-input')).toBeTruthy();
  });
});
