import {
  applyEntryAccountLink,
  calculateFinancialAccountMonthSummary,
  calculateFinancialAccountsSummary,
  filterFinancialAccountsByScope,
  financialAccountKindLabel,
  formatFinancialAccountLabel,
  isSavingsAccount,
  isValidAccountDay,
  normalizeLastFourDigits,
  resolveAccountMovementEffect,
  resolveNextMonthlyDate,
  type FinancialAccount,
  type MonthEntry,
} from '../../index';

const VISA: FinancialAccount = {
  id: 'acc_visa',
  type: 'credit',
  name: 'Visa Oro',
  institution: 'Banco Uno',
  lastFourDigits: '1234',
  openingBalance: 500_000,
  openingMonthKey: '2026-10',
  creditLimit: 3_000_000,
  statementDay: 15,
  paymentDueDay: 30,
  monthlyInterestRate: 2.1,
};

const NOMINA: FinancialAccount = {
  id: 'acc_nomina',
  type: 'debit',
  name: 'Cuenta nómina',
  institution: 'Banco Dos',
  openingBalance: 1_000_000,
  openingMonthKey: '2026-10',
  debitKind: 'savings',
};

let entryCounter = 0;
function entry(overrides: Partial<MonthEntry>): MonthEntry {
  entryCounter += 1;
  return {
    id: `entry_${entryCounter}`,
    monthKey: '2026-10',
    conceptId: `concept_${entryCounter}`,
    conceptName: `Movimiento ${entryCounter}`,
    type: 'expense',
    group: 'variable',
    plannedAmount: overrides.actualAmount ?? 0,
    actualAmount: 0,
    status: 'completed',
    completedAt: '2026-10-05',
    ...overrides,
  };
}

describe('domain/accounts — credit cards and debit accounts (ADR 0034)', () => {
  it('classifies linked movements as spent or paid per account type and role', () => {
    const purchase = entry({ accountId: VISA.id, actualAmount: 100, accountRole: 'purchase' });
    const purchaseNoRole = entry({ accountId: VISA.id, actualAmount: 100 });
    const payment = entry({ accountId: VISA.id, actualAmount: 100, accountRole: 'payment' });
    const refund = entry({ accountId: VISA.id, actualAmount: 100, type: 'income' });
    const withdrawal = entry({ accountId: NOMINA.id, actualAmount: 100 });
    const deposit = entry({ accountId: NOMINA.id, actualAmount: 100, type: 'income' });

    expect(resolveAccountMovementEffect(purchase, VISA)).toBe('spent');
    expect(resolveAccountMovementEffect(purchaseNoRole, VISA)).toBe('spent');
    expect(resolveAccountMovementEffect(payment, VISA)).toBe('paid');
    expect(resolveAccountMovementEffect(refund, VISA)).toBe('paid');
    expect(resolveAccountMovementEffect(withdrawal, NOMINA)).toBe('spent');
    expect(resolveAccountMovementEffect(deposit, NOMINA)).toBe('paid');
    // A debit account ignores the credit role.
    expect(
      resolveAccountMovementEffect({ ...withdrawal, accountRole: 'payment' }, NOMINA)
    ).toBe('spent');
  });

  it('ignores pending, zero-amount and other-account movements', () => {
    expect(
      resolveAccountMovementEffect(
        entry({ accountId: VISA.id, actualAmount: 100, status: 'pending' }),
        VISA
      )
    ).toBeNull();
    expect(
      resolveAccountMovementEffect(entry({ accountId: VISA.id, actualAmount: 0 }), VISA)
    ).toBeNull();
    expect(
      resolveAccountMovementEffect(entry({ accountId: NOMINA.id, actualAmount: 100 }), VISA)
    ).toBeNull();
    expect(resolveAccountMovementEffect(entry({ actualAmount: 100 }), VISA)).toBeNull();
  });

  it('derives the credit card balance, available credit and utilization for the month', () => {
    const entries = [
      entry({ accountId: VISA.id, actualAmount: 300_000 }),
      entry({ accountId: VISA.id, actualAmount: 200_000, accountRole: 'purchase' }),
      entry({ accountId: VISA.id, actualAmount: 400_000, accountRole: 'payment' }),
      entry({ accountId: VISA.id, actualAmount: 50_000, type: 'income' }),
      entry({ accountId: VISA.id, actualAmount: 999_999, status: 'pending' }),
      entry({ accountId: NOMINA.id, actualAmount: 70_000 }),
    ];

    const summary = calculateFinancialAccountMonthSummary(VISA, entries, '2026-10', '2026-10-20');
    expect(summary.openingBalance).toBe(500_000);
    expect(summary.spentThisMonth).toBe(500_000);
    expect(summary.paidThisMonth).toBe(450_000);
    expect(summary.closingBalance).toBe(550_000);
    expect(summary.movementCount).toBe(4);
    expect(summary.creditLimit).toBe(3_000_000);
    expect(summary.availableCredit).toBe(2_450_000);
    expect(summary.utilizationRatio).toBeCloseTo(550_000 / 3_000_000, 6);
    expect(summary.monthlyInterestRate).toBe(2.1);
    expect(summary.lastFourDigits).toBe('1234');
    // Statement day 15 already passed on the 20th: next one is in November.
    expect(summary.nextStatementDate).toBe('2026-11-15');
    expect(summary.nextPaymentDueDate).toBe('2026-10-30');
  });

  it('carries previous months into the opening balance and ignores movements before registration', () => {
    const entries = [
      entry({ monthKey: '2026-09', accountId: VISA.id, actualAmount: 800_000 }),
      entry({ monthKey: '2026-10', accountId: VISA.id, actualAmount: 300_000 }),
      entry({ monthKey: '2026-10', accountId: VISA.id, actualAmount: 100_000, accountRole: 'payment' }),
      entry({ monthKey: '2026-11', accountId: VISA.id, actualAmount: 50_000 }),
      entry({ monthKey: '2026-12', accountId: VISA.id, actualAmount: 70_000 }),
    ];

    const november = calculateFinancialAccountMonthSummary(VISA, entries, '2026-11');
    expect(november.openingBalance).toBe(700_000);
    expect(november.spentThisMonth).toBe(50_000);
    expect(november.closingBalance).toBe(750_000);
    expect(november.nextStatementDate).toBeUndefined();

    const september = calculateFinancialAccountMonthSummary(VISA, entries, '2026-09');
    expect(september.isActiveInMonth).toBe(false);
    expect(september.openingBalance).toBe(0);
  });

  it('derives the debit balance, allowing an overdraft (negative balance)', () => {
    const entries = [
      entry({ accountId: NOMINA.id, actualAmount: 2_500_000, type: 'income' }),
      entry({ accountId: NOMINA.id, actualAmount: 3_800_000 }),
    ];
    const summary = calculateFinancialAccountMonthSummary(NOMINA, entries, '2026-10');
    expect(summary.spentThisMonth).toBe(3_800_000);
    expect(summary.paidThisMonth).toBe(2_500_000);
    expect(summary.closingBalance).toBe(-300_000);
    expect(summary.debitKind).toBe('savings');
    expect(summary.creditLimit).toBeUndefined();
    expect(summary.availableCredit).toBeUndefined();
  });

  it('leaves out credit fields that were not configured', () => {
    const bare: FinancialAccount = {
      id: 'acc_bare',
      type: 'credit',
      name: 'Sin cupo',
      institution: 'Banco',
      openingBalance: 0,
      openingMonthKey: '2026-10',
    };
    const summary = calculateFinancialAccountMonthSummary(bare, [], '2026-10', '2026-10-01');
    expect(summary.creditLimit).toBeUndefined();
    expect(summary.utilizationRatio).toBeUndefined();
    expect(summary.statementDay).toBeUndefined();
    expect(summary.nextPaymentDueDate).toBeUndefined();
    expect(summary.monthlyInterestRate).toBeUndefined();
    expect(summary.lastFourDigits).toBeUndefined();
  });

  it('caps utilization at 100% and never reports negative available credit', () => {
    const entries = [entry({ accountId: VISA.id, actualAmount: 4_000_000 })];
    const summary = calculateFinancialAccountMonthSummary(VISA, entries, '2026-10');
    expect(summary.closingBalance).toBe(4_500_000);
    expect(summary.availableCredit).toBe(0);
    expect(summary.utilizationRatio).toBe(1);

    const overpaid = calculateFinancialAccountMonthSummary(
      VISA,
      [entry({ accountId: VISA.id, actualAmount: 600_000, accountRole: 'payment' })],
      '2026-10'
    );
    expect(overpaid.closingBalance).toBe(-100_000);
    expect(overpaid.utilizationRatio).toBe(0);
    expect(overpaid.availableCredit).toBe(3_100_000);
  });

  it('totals credit and debit accounts and skips accounts registered later', () => {
    const later: FinancialAccount = { ...NOMINA, id: 'acc_later', openingMonthKey: '2026-12' };
    const entries = [
      entry({ accountId: VISA.id, actualAmount: 300_000 }),
      entry({ accountId: VISA.id, actualAmount: 200_000, accountRole: 'payment' }),
      entry({ accountId: NOMINA.id, actualAmount: 100_000 }),
      entry({ accountId: NOMINA.id, actualAmount: 400_000, type: 'income' }),
    ];

    const summary = calculateFinancialAccountsSummary(
      [VISA, NOMINA, later],
      entries,
      '2026-10',
      '2026-10-01'
    );
    expect(summary.hasAccounts).toBe(true);
    expect(summary.accounts.map((a) => a.accountId)).toEqual([VISA.id, NOMINA.id]);
    expect(summary.credit).toEqual({
      spentThisMonth: 300_000,
      paidThisMonth: 200_000,
      closingBalance: 600_000,
      creditLimit: 3_000_000,
      availableCredit: 2_400_000,
    });
    expect(summary.debit).toEqual({
      spentThisMonth: 100_000,
      paidThisMonth: 400_000,
      closingBalance: 1_300_000,
    });

    const empty = calculateFinancialAccountsSummary([], entries, '2026-10');
    expect(empty.hasAccounts).toBe(false);
    expect(empty.credit.closingBalance).toBe(0);
  });

  it('rejects invalid month keys and non-integer amounts', () => {
    expect(() => calculateFinancialAccountsSummary([VISA], [], '2026-13')).toThrow();
    expect(() =>
      calculateFinancialAccountMonthSummary({ ...VISA, openingBalance: 10.5 }, [], '2026-10')
    ).toThrow(TypeError);
    expect(() =>
      calculateFinancialAccountMonthSummary(
        VISA,
        [entry({ accountId: VISA.id, actualAmount: 1.5 })],
        '2026-10'
      )
    ).toThrow(TypeError);
  });

  it('resolves the next monthly date, clamping to the end of short months', () => {
    expect(resolveNextMonthlyDate('2026-10-15', 15)).toBe('2026-10-15');
    expect(resolveNextMonthlyDate('2026-10-16', 15)).toBe('2026-11-15');
    expect(resolveNextMonthlyDate('2026-11-05', 31)).toBe('2026-11-30');
    expect(resolveNextMonthlyDate('2027-01-31', 30)).toBe('2027-02-28');
    expect(resolveNextMonthlyDate('2028-02-10', 31)).toBe('2028-02-29');
    expect(resolveNextMonthlyDate('2026-12-20', 10)).toBe('2027-01-10');
    expect(() => resolveNextMonthlyDate('2026-10', 10)).toThrow(RangeError);
    expect(() => resolveNextMonthlyDate('2026-10-01', 0)).toThrow(RangeError);
    expect(() => resolveNextMonthlyDate('2026-10-01', 32)).toThrow(RangeError);
  });

  it('validates days and last four digits', () => {
    expect(isValidAccountDay(1)).toBe(true);
    expect(isValidAccountDay(31)).toBe(true);
    expect(isValidAccountDay(0)).toBe(false);
    expect(isValidAccountDay(12.5)).toBe(false);
    expect(isValidAccountDay(undefined)).toBe(false);
    expect(normalizeLastFourDigits('12 34')).toBe('1234');
    expect(normalizeLastFourDigits('123')).toBeUndefined();
    expect(normalizeLastFourDigits('12345')).toBeUndefined();
    expect(normalizeLastFourDigits(undefined)).toBeUndefined();
    expect(formatFinancialAccountLabel(VISA)).toBe('Visa Oro ·· 1234');
    expect(formatFinancialAccountLabel(NOMINA)).toBe('Cuenta nómina');
  });

  it('separates savings accounts (Ahorros) from cards and checking accounts (Deudas)', () => {
    const checking: FinancialAccount = { ...NOMINA, id: 'acc_corriente', debitKind: 'checking' };
    const noKind: FinancialAccount = { ...NOMINA, id: 'acc_sin_tipo', debitKind: undefined };
    const accounts = [VISA, NOMINA, checking, noKind];

    expect(isSavingsAccount(NOMINA)).toBe(true);
    expect(isSavingsAccount(checking)).toBe(false);
    expect(isSavingsAccount(noKind)).toBe(false);
    expect(isSavingsAccount({ type: 'credit', debitKind: 'savings' })).toBe(false);

    expect(filterFinancialAccountsByScope(accounts, 'savings').map((a) => a.id)).toEqual([
      NOMINA.id,
    ]);
    expect(filterFinancialAccountsByScope(accounts, 'debts').map((a) => a.id)).toEqual([
      VISA.id,
      checking.id,
      noKind.id,
    ]);
    const all = filterFinancialAccountsByScope(accounts, 'all');
    expect(all).toEqual(accounts);
    expect(all).not.toBe(accounts);

    expect(financialAccountKindLabel(VISA)).toBe('Crédito');
    expect(financialAccountKindLabel(NOMINA)).toBe('Ahorros');
    expect(financialAccountKindLabel(checking)).toBe('Débito');
    expect(financialAccountKindLabel(noKind)).toBe('Débito');
  });

  describe('applyEntryAccountLink', () => {
    const accounts = [VISA, NOMINA];

    it('links an expense to a credit card as a purchase by default and keeps a payment role', () => {
      const base = entry({ actualAmount: 100 });
      expect(applyEntryAccountLink(base, { accountId: VISA.id }, accounts)).toMatchObject({
        accountId: VISA.id,
        accountRole: 'purchase',
      });
      expect(
        applyEntryAccountLink(base, { accountId: VISA.id, accountRole: 'payment' }, accounts)
      ).toMatchObject({ accountId: VISA.id, accountRole: 'payment' });
    });

    it('drops the role for incomes and debit accounts', () => {
      const income = entry({ actualAmount: 100, type: 'income' });
      const linkedIncome = applyEntryAccountLink(
        income,
        { accountId: VISA.id, accountRole: 'payment' },
        accounts
      );
      expect(linkedIncome.accountId).toBe(VISA.id);
      expect('accountRole' in linkedIncome).toBe(false);

      const expense = entry({ actualAmount: 100, accountId: VISA.id, accountRole: 'payment' });
      const onDebit = applyEntryAccountLink(expense, { accountId: NOMINA.id }, accounts);
      expect(onDebit.accountId).toBe(NOMINA.id);
      expect('accountRole' in onDebit).toBe(false);
    });

    it('removes the link with null, empty or an unknown account', () => {
      const linked = entry({ actualAmount: 100, accountId: VISA.id, accountRole: 'payment' });
      for (const accountId of [null, '', 'acc_missing']) {
        const result = applyEntryAccountLink(linked, { accountId }, accounts);
        expect('accountId' in result).toBe(false);
        expect('accountRole' in result).toBe(false);
      }
    });

    it('leaves the entry untouched when nothing is requested and updates only the role', () => {
      const linked = entry({ actualAmount: 100, accountId: VISA.id, accountRole: 'purchase' });
      expect(applyEntryAccountLink(linked, {}, accounts)).toBe(linked);
      expect(applyEntryAccountLink(linked, { accountRole: 'payment' }, accounts)).toMatchObject({
        accountId: VISA.id,
        accountRole: 'payment',
      });
      expect(applyEntryAccountLink(linked, { accountRole: null }, accounts)).toMatchObject({
        accountRole: 'purchase',
      });
    });
  });
});
