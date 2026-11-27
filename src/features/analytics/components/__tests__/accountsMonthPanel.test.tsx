/**
 * Month close panel of credit cards and debit accounts (ADR 0034).
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  AmountPrivacyProvider,
  BFlowThemeProvider,
  HIDDEN_AMOUNT_TEXT,
  PLATFORM_SKIN_IDS,
} from '../../../../design-system';
import {
  calculateFinancialAccountsSummary,
  type FinancialAccount,
  type MonthEntry,
} from '../../../../domain';
import { AccountsMonthPanel } from '../AccountsMonthPanel';

const VISA: FinancialAccount = {
  id: 'acc_visa',
  type: 'credit',
  name: 'Visa Oro',
  institution: 'Banco Uno',
  lastFourDigits: '1234',
  openingBalance: 500_000,
  openingMonthKey: '2026-10',
  creditLimit: 2_000_000,
};

const NOMINA: FinancialAccount = {
  id: 'acc_nomina',
  type: 'debit',
  name: 'Nómina',
  institution: 'Banco Dos',
  openingBalance: 1_000_000,
  openingMonthKey: '2026-10',
};

function entry(id: string, overrides: Partial<MonthEntry>): MonthEntry {
  return {
    id,
    monthKey: '2026-10',
    conceptId: id,
    conceptName: id,
    type: 'expense',
    group: 'variable',
    plannedAmount: 0,
    actualAmount: 0,
    status: 'completed',
    ...overrides,
  };
}

const ENTRIES: MonthEntry[] = [
  entry('compra', { accountId: VISA.id, actualAmount: 400_000 }),
  entry('pago', { accountId: VISA.id, actualAmount: 150_000, accountRole: 'payment' }),
  entry('salario', { accountId: NOMINA.id, actualAmount: 2_000_000, type: 'income' }),
  entry('arriendo', { accountId: NOMINA.id, actualAmount: 1_200_000 }),
];

function renderPanel(
  accounts: readonly FinancialAccount[],
  entries: readonly MonthEntry[] = ENTRIES,
  hidden = false,
  skin: (typeof PLATFORM_SKIN_IDS)[number] = 'ios'
) {
  const summary = calculateFinancialAccountsSummary(accounts, entries, '2026-10');
  return render(
    <BFlowThemeProvider initialMode="dark" skin={skin}>
      <AmountPrivacyProvider initialHidden={hidden}>
        <AccountsMonthPanel summary={summary} />
      </AmountPrivacyProvider>
    </BFlowThemeProvider>
  );
}

describe.each(PLATFORM_SKIN_IDS)('AccountsMonthPanel on %s skin', (skin) => {
  it('shows spent, paid and pending for cards and the debit flows', () => {
    renderPanel([VISA, NOMINA], ENTRIES, false, skin);

    expect(screen.getByTestId('accounts-month-panel')).toBeTruthy();
    expect(screen.getByText('Tarjetas y Cuentas')).toBeTruthy();
    expect(screen.getByText('Octubre 2026')).toBeTruthy();
    expect(screen.getByTestId('accounts-panel-credit-spent')).toHaveTextContent('$ 400.000');
    expect(screen.getByTestId('accounts-panel-credit-paid')).toHaveTextContent('$ 150.000');
    expect(screen.getByTestId('accounts-panel-credit-pending')).toHaveTextContent('$ 750.000');
    expect(screen.getByText('Cupo disponible: $ 1.250.000')).toBeTruthy();
    expect(screen.getByTestId('accounts-panel-credit-insight')).toHaveTextContent(
      'La deuda en tarjetas subió $ 250.000 este mes.'
    );
    expect(screen.getByTestId('accounts-panel-debit-spent')).toHaveTextContent('$ 1.200.000');
    expect(screen.getByTestId('accounts-panel-debit-paid')).toHaveTextContent('$ 2.000.000');
    expect(screen.getByTestId('accounts-panel-debit-balance')).toHaveTextContent('$ 1.800.000');
    expect(screen.getByTestId('accounts-panel-row-acc_visa')).toBeTruthy();
    expect(
      screen.getByText('Gastado $ 400.000 · Pagado $ 150.000 · Pendiente $ 750.000')
    ).toBeTruthy();
    expect(
      screen.getByText('Salidas $ 1.200.000 · Entradas $ 2.000.000 · Saldo $ 1.800.000')
    ).toBeTruthy();
  });
});

describe('AccountsMonthPanel', () => {
  it('renders nothing without accounts and only the sections that apply', () => {
    const empty = renderPanel([]);
    expect(empty.toJSON()).toBeNull();
    empty.unmount();

    renderPanel([NOMINA]);
    expect(screen.queryByTestId('accounts-panel-credit')).toBeNull();
    expect(screen.getByTestId('accounts-panel-debit')).toBeTruthy();
  });

  it('explains when the card debt went down, stayed equal or had no movements', () => {
    const down = renderPanel([VISA], [
      entry('compra', { accountId: VISA.id, actualAmount: 100_000 }),
      entry('pago', { accountId: VISA.id, actualAmount: 300_000, accountRole: 'payment' }),
    ]);
    expect(screen.getByTestId('accounts-panel-credit-insight')).toHaveTextContent(
      'Pagaste más de lo que compraste: la deuda en tarjetas bajó $ 200.000.'
    );
    down.unmount();

    const equal = renderPanel([VISA], [
      entry('compra', { accountId: VISA.id, actualAmount: 100_000 }),
      entry('pago', { accountId: VISA.id, actualAmount: 100_000, accountRole: 'payment' }),
    ]);
    expect(screen.getByTestId('accounts-panel-credit-insight')).toHaveTextContent(
      'Pagaste lo mismo que compraste con tarjeta este mes.'
    );
    equal.unmount();

    renderPanel([{ ...VISA, creditLimit: undefined }], []);
    expect(screen.getByTestId('accounts-panel-credit-insight')).toHaveTextContent(
      'Sin compras ni pagos con tarjeta este mes.'
    );
    expect(screen.queryByText(/Cupo disponible/)).toBeNull();
  });

  it('hides the amounts with the privacy eye', () => {
    renderPanel([VISA, NOMINA], ENTRIES, true);
    expect(screen.queryByText(/\$ 400\.000/)).toBeNull();
    expect(screen.getAllByText(new RegExp(HIDDEN_AMOUNT_TEXT.replace('$', '\\$'))).length).toBeGreaterThan(0);
  });
});
