/**
 * Linking a movement to a credit card or debit account from the checklist forms (ADR 0034),
 * and the account chip on the checklist row.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import {
  AmountPrivacyProvider,
  BFlowThemeProvider,
  PLATFORM_SKIN_IDS,
  type PlatformSkinId,
} from '../../../design-system';
import type { FinancialAccount, MonthEntry, MonthlyBudgetSummary } from '../../../domain';
import { calculateMonthlyBudgetSummary } from '../../../domain';
import { describeAccountLink } from '../components/AccountLinkFields';
import { ChecklistAddMovementForm } from '../components/ChecklistAddMovementForm';
import { ChecklistEditEntryForm } from '../components/ChecklistEditEntryForm';
import { ChecklistWorkspaceView } from '../components/ChecklistWorkspaceView';

const VISA: FinancialAccount = {
  id: 'acc_visa',
  type: 'credit',
  name: 'Visa Oro',
  institution: 'Banco Uno',
  lastFourDigits: '1234',
  openingBalance: 0,
  openingMonthKey: '2026-10',
  creditLimit: 2_000_000,
};

const NOMINA: FinancialAccount = {
  id: 'acc_nomina',
  type: 'debit',
  name: 'Nómina',
  institution: 'Banco Dos',
  openingBalance: 0,
  openingMonthKey: '2026-10',
};

const ACCOUNTS = [VISA, NOMINA];

const LINKED_ENTRY: MonthEntry = {
  id: '2026-10_exp_mercado',
  monthKey: '2026-10',
  conceptId: 'exp_mercado',
  conceptName: 'Mercado',
  type: 'expense',
  group: 'variable',
  plannedAmount: 90_000,
  actualAmount: 90_000,
  status: 'completed',
  completedAt: '2026-10-03',
  accountId: VISA.id,
  accountRole: 'payment',
};

function pickAccount(skin: PlatformSkinId, prefix: string, accountId: string): void {
  fireEvent.press(screen.getByTestId(`${prefix}-account-select`));
  fireEvent.press(screen.getByTestId(`${prefix}-account-picker-option-${accountId}`));
  if (skin !== 'web') {
    fireEvent.press(screen.getByTestId(`${prefix}-account-picker-confirm`));
  }
}

function renderAddForm(skin: PlatformSkinId, accounts: readonly FinancialAccount[] = ACCOUNTS) {
  const onAddOrCompleteMovement = jest.fn();
  const onCreateCustomMovement = jest.fn();
  render(
    <BFlowThemeProvider initialMode="dark" skin={skin}>
      <AmountPrivacyProvider initialHidden={false}>
        <ChecklistAddMovementForm
          monthKey="2026-10"
          monthEntries={[]}
          concepts={[]}
          debts={[]}
          savingsBuckets={[]}
          financialAccounts={accounts}
          onAddOrCompleteMovement={onAddOrCompleteMovement}
          onCreateCustomMovement={onCreateCustomMovement}
          onSubmitted={jest.fn()}
        />
      </AmountPrivacyProvider>
    </BFlowThemeProvider>
  );
  return { onAddOrCompleteMovement, onCreateCustomMovement };
}

describe.each(PLATFORM_SKIN_IDS)('Account link in the movement forms on %s skin', (skin) => {
  it('links a new expense to a credit card as a payment to the card', () => {
    const { onCreateCustomMovement } = renderAddForm(skin);

    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    expect(screen.getByTestId('add-movement-account-value')).toHaveTextContent(
      'Sin tarjeta ni cuenta'
    );
    // The role only appears for a credit card.
    expect(screen.queryByTestId('add-movement-account-role-payment')).toBeNull();

    pickAccount(skin, 'add-movement', VISA.id);
    expect(screen.getByTestId('add-movement-account-value')).toHaveTextContent(
      'Visa Oro ·· 1234 · Crédito'
    );
    expect(
      screen.getByTestId('add-movement-account-role-purchase').props.accessibilityState
    ).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId('add-movement-account-role-payment'));

    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    expect(screen.getByText('Pago a Visa Oro ·· 1234')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Pago tarjeta');
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '300000');
    fireEvent.press(screen.getByTestId('submit-movement-button'));

    expect(onCreateCustomMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pago tarjeta',
        type: 'expense',
        amount: 300_000,
        accountId: VISA.id,
        accountRole: 'payment',
      })
    );
  });

  it('links an income to a debit account without asking for a role', () => {
    const { onCreateCustomMovement } = renderAddForm(skin);
    fireEvent.press(screen.getByTestId('modal-type-income'));
    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    expect(screen.getByText('¿A qué tarjeta o cuenta llegó? (opcional)')).toBeTruthy();

    pickAccount(skin, 'add-movement', NOMINA.id);
    expect(screen.queryByTestId('add-movement-account-role-purchase')).toBeNull();

    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Salario');
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '2000000');
    fireEvent.press(screen.getByTestId('submit-movement-button'));

    expect(onCreateCustomMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', accountId: NOMINA.id })
    );
  });

  it('sends no account link when none is chosen and hides the field without accounts', () => {
    const { onCreateCustomMovement } = renderAddForm(skin, []);
    fireEvent.press(screen.getByTestId('add-movement-more-options-toggle'));
    expect(screen.queryByTestId('add-movement-account-select')).toBeNull();

    fireEvent.changeText(screen.getByTestId('custom-concept-name-input'), 'Café');
    fireEvent.changeText(screen.getByTestId('movement-amount-input'), '8000');
    fireEvent.press(screen.getByTestId('submit-movement-button'));
    expect(onCreateCustomMovement.mock.calls[0]?.[0]).not.toHaveProperty('accountId');
  });

  it('loads the link of an edited entry and lets the user remove it', () => {
    const onEditEntry = jest.fn();
    render(
      <BFlowThemeProvider initialMode="dark" skin={skin}>
        <ChecklistEditEntryForm
          entry={LINKED_ENTRY}
          debts={[]}
          savingsBuckets={[]}
          financialAccounts={ACCOUNTS}
          onEditEntry={onEditEntry}
          onClose={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByText('Pago a Visa Oro ·· 1234')).toBeTruthy();
    fireEvent.press(screen.getByTestId('edit-entry-more-options-toggle'));
    expect(
      screen.getByTestId('edit-entry-account-role-payment').props.accessibilityState
    ).toMatchObject({ selected: true });

    pickAccount(skin, 'edit-entry', '__none__');
    fireEvent.press(screen.getByTestId('save-edit-entry-button'));

    expect(onEditEntry).toHaveBeenCalledWith(
      LINKED_ENTRY.id,
      expect.objectContaining({ accountId: null })
    );
  });
});

describe('Account chip on the checklist row', () => {
  it('shows the card a movement was paid with, and a payment to the card', () => {
    const entries: MonthEntry[] = [
      LINKED_ENTRY,
      {
        ...LINKED_ENTRY,
        id: '2026-10_exp_gasolina',
        conceptId: 'exp_gasolina',
        conceptName: 'Gasolina',
        accountId: NOMINA.id,
        accountRole: undefined,
      },
    ];
    const budget: MonthlyBudgetSummary = calculateMonthlyBudgetSummary(entries, '2026-10');
    render(
      <BFlowThemeProvider initialMode="dark" skin="ios">
        <ChecklistWorkspaceView
          monthKey="2026-10"
          concepts={[]}
          entries={entries}
          budget={budget}
          financialAccounts={ACCOUNTS}
          onToggleEntry={jest.fn()}
          onAddOrCompleteMovement={jest.fn()}
          onRemoveRepeatableEntry={jest.fn()}
        />
      </BFlowThemeProvider>
    );

    expect(screen.getByText('Pago a Visa Oro ·· 1234')).toBeTruthy();
    expect(screen.getByText('Nómina')).toBeTruthy();
  });
});

describe('describeAccountLink', () => {
  it('describes the link for the forms summary', () => {
    expect(describeAccountLink(ACCOUNTS, 'expense', null, 'purchase')).toBeNull();
    expect(describeAccountLink(ACCOUNTS, 'expense', 'acc_missing', 'purchase')).toBeNull();
    expect(describeAccountLink(ACCOUNTS, 'expense', VISA.id, 'purchase')).toBe('Visa Oro ·· 1234');
    expect(describeAccountLink(ACCOUNTS, 'expense', VISA.id, 'payment')).toBe(
      'Pago a Visa Oro ·· 1234'
    );
    expect(describeAccountLink(ACCOUNTS, 'income', VISA.id, 'payment')).toBe('Visa Oro ·· 1234');
    expect(describeAccountLink(ACCOUNTS, 'expense', NOMINA.id, 'payment')).toBe('Nómina');
  });
});
