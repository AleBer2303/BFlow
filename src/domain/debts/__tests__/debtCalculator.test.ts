import { buildSampleWorkspace } from '../../../data/sample/sampleWorkspace';
import {
  buildDebtPaymentsForInstallment,
  calculateDebtsSummary,
  Debt,
  MonthEntry,
  orderDebtsForCascade,
  projectDebtPayoff,
  uncompleteMovement,
} from '../../index';

/** The example budget of the showcase mode, in the month the tests pin. */
const sample = buildSampleWorkspace();

const debts = sample.debts as unknown as Debt[];
const octoberEntries = sample.entries as unknown as MonthEntry[];

describe('domain/debts — FUNFAMI Debt Calculator & Payoff Projections', () => {
  it('applies custom allocations when their sum matches the installment amount', () => {
    const installmentEntry = octoberEntries.find((e) => e.conceptId === 'exp_loan_installment')!;
    const payments = buildDebtPaymentsForInstallment(installmentEntry, debts, [
      { debtId: 'debt_auto_loan', principalAmount: 1_000_000 },
      { debtId: 'debt_education_loan', principalAmount: 800_000 },
    ]);

    const summary = calculateDebtsSummary(debts, octoberEntries, '2026-10', payments);
    expect(summary.totalRemainingDebt).toBe(6_200_000);
    expect(summary.debts.find((d) => d.debtId === 'debt_auto_loan')?.remainingBalance).toBe(
      3_400_000
    );
    expect(summary.debts.find((d) => d.debtId === 'debt_education_loan')?.remainingBalance).toBe(
      2_800_000
    );
  });

  it('rejects custom allocations that do not sum to the installment or exceed debt opening balance', () => {
    const installmentEntry = octoberEntries.find((e) => e.conceptId === 'exp_loan_installment')!;

    expect(() =>
      buildDebtPaymentsForInstallment(installmentEntry, debts, [
        { debtId: 'debt_auto_loan', principalAmount: 1_000_000 },
      ])
    ).toThrow(RangeError);

    expect(() =>
      buildDebtPaymentsForInstallment(installmentEntry, debts, [
        { debtId: 'unknown_debt', principalAmount: 1_800_000 },
      ])
    ).toThrow(/Unknown debtId/);

    expect(() =>
      buildDebtPaymentsForInstallment(installmentEntry, debts, [
        { debtId: 'debt_education_loan', principalAmount: 5_000_000 },
        { debtId: 'debt_auto_loan', principalAmount: -3_200_000 },
      ])
    ).toThrow(RangeError);
  });

  it('spills installment over from Crédito de vehículo into Crédito educativo when Crédito de vehículo balance is smaller than the installment', () => {
    const smallFirstDebts: Debt[] = [
      {
        id: 'debt_education_loan',
        groupKey: 'General',
        name: 'Crédito educativo',
        lender: 'Banco',
        openingBalance: 3_600_000,
        monthKey: '2026-10',
      },
      {
        id: 'debt_auto_loan',
        groupKey: 'General',
        name: 'Crédito de vehículo',
        lender: 'Banco',
        openingBalance: 800_000,
        monthKey: '2026-10',
      },
    ];

    const installment = octoberEntries.find((e) => e.conceptId === 'exp_loan_installment')!;
    const payments = buildDebtPaymentsForInstallment(installment, smallFirstDebts);
    const summary = calculateDebtsSummary(smallFirstDebts, octoberEntries, '2026-10', payments);
    expect(summary.debts.find((d) => d.debtId === 'debt_auto_loan')?.remainingBalance).toBe(0);
    expect(summary.debts.find((d) => d.debtId === 'debt_education_loan')?.remainingBalance).toBe(
      2_600_000
    );
  });

  it('calculates payoff projections accurately across edge cases', () => {
    // 6.200.000 remaining at 1.800.000/month -> ceil(6.2 / 1.8) = 4 months -> 2027-02
    expect(projectDebtPayoff(6_200_000, 1_800_000, '2026-10')).toEqual({
      remainingMonths: 4,
      estimatedPayoffMonthKey: '2027-02',
    });

    // Already paid off
    expect(projectDebtPayoff(0, 1_800_000, '2026-10')).toEqual({
      remainingMonths: 0,
      estimatedPayoffMonthKey: '2026-10',
    });

    // Zero monthly installment
    expect(projectDebtPayoff(6_200_000, 0, '2026-10')).toEqual({
      remainingMonths: Number.POSITIVE_INFINITY,
      estimatedPayoffMonthKey: null,
    });

    // Unchecked installment entry produces inactive payments
    const uncheckedEntries = uncompleteMovement(octoberEntries, '2026-10_exp_loan_installment');
    const summaryWithoutEntry = calculateDebtsSummary(debts, [], '2026-10');
    expect(summaryWithoutEntry.totalRemainingDebt).toBe(8_000_000);
    expect(
      calculateDebtsSummary(debts, uncheckedEntries, '2026-10').isInstallmentPaid
    ).toBe(false);
  });

  it('calculates monthly accrued interest when monthlyInterestRate is specified', () => {
    const interestDebts: Debt[] = [
      {
        id: 'debt_credit_card',
        groupKey: 'PERSONAL',
        name: 'Tarjeta de crédito',
        lender: 'Banco',
        openingBalance: 1_000_000,
        monthKey: '2026-10',
        monthlyInterestRate: 2.0,
      },
    ];

    // No installment this month: only the interest on the untouched balance.
    const summary = calculateDebtsSummary(interestDebts, [], '2026-10');
    const cardStatus = summary.debts.find((d) => d.debtId === 'debt_credit_card')!;
    expect(cardStatus.accruedInterestThisMonth).toBe(20_000);
    expect(cardStatus.monthlyInterestRate).toBe(2.0);
  });
});

describe('domain/debts — cascade order (CC-05, ADR 0036)', () => {
  const debt = (id: string, openingBalance: number): Debt => ({
    id,
    groupKey: 'General',
    name: id,
    lender: 'Banco',
    openingBalance,
    monthKey: '2026-11',
  });
  const installment: MonthEntry = {
    id: '2026-11_exp_cuota',
    monthKey: '2026-11',
    conceptId: 'exp_cuota',
    plannedAmount: 500_000,
    actualAmount: 500_000,
    status: 'completed',
    completedAt: '2026-11-05',
  } as MonthEntry;

  it('puts the explicit target first and the rest by id, whatever the input order', () => {
    const list = [debt('debt_zeta', 1), debt('debt_auto_loan', 1), debt('debt_alfa', 1)];
    expect(orderDebtsForCascade(list).map((d) => d.id)).toEqual([
      'debt_alfa',
      'debt_auto_loan',
      'debt_zeta',
    ]);
    expect(orderDebtsForCascade([...list].reverse(), 'debt_zeta').map((d) => d.id)).toEqual([
      'debt_zeta',
      'debt_alfa',
      'debt_auto_loan',
    ]);
    expect(list.map((d) => d.id)).toEqual(['debt_zeta', 'debt_auto_loan', 'debt_alfa']);
  });

  it('no longer gives the seed debt priority without an explicit target', () => {
    const payments = buildDebtPaymentsForInstallment(installment, [
      debt('debt_auto_loan', 1_000_000),
      debt('debt_auto', 300_000),
    ]);
    expect(payments.map((p) => [p.debtId, p.principalAmount])).toEqual([
      ['debt_auto', 300_000],
      ['debt_auto_loan', 200_000],
    ]);
  });

  it('spills from the explicit target into the next debts by id', () => {
    const payments = buildDebtPaymentsForInstallment(
      installment,
      [debt('debt_b', 400_000), debt('debt_c', 400_000), debt('debt_a', 50_000)],
      undefined,
      'debt_c'
    );
    expect(payments.map((p) => [p.debtId, p.principalAmount])).toEqual([
      ['debt_c', 400_000],
      ['debt_a', 50_000],
      ['debt_b', 50_000],
    ]);
  });
});
