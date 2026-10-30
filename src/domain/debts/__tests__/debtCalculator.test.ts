import octoberFixture from '../../../../fixtures/october-2026.json';
import {
  buildDebtPaymentsForInstallment,
  calculateFunfamiDebtSummary,
  Debt,
  MonthEntry,
  projectDebtPayoff,
  uncompleteMovement,
} from '../../index';

const debts = octoberFixture.debts as unknown as Debt[];
const octoberEntries = octoberFixture.monthEntries as unknown as MonthEntry[];

describe('domain/debts — FUNFAMI Debt Calculator & Payoff Projections', () => {
  it('applies custom allocations when their sum matches the installment amount', () => {
    const funfamiEntry = octoberEntries.find((e) => e.conceptId === 'exp_cuota_funfami')!;
    const payments = buildDebtPaymentsForInstallment(funfamiEntry, debts, [
      { debtId: 'debt_cb300f_moto', principalAmount: 1_000_000 },
      { debtId: 'debt_esp_ia', principalAmount: 800_000 },
    ]);

    const summary = calculateFunfamiDebtSummary(debts, octoberEntries, '2026-10', payments);
    expect(summary.totalRemainingDebt).toBe(6_200_000);
    expect(summary.debts.find((d) => d.debtId === 'debt_cb300f_moto')?.remainingBalance).toBe(
      3_400_000
    );
    expect(summary.debts.find((d) => d.debtId === 'debt_esp_ia')?.remainingBalance).toBe(
      2_800_000
    );
  });

  it('rejects custom allocations that do not sum to the installment or exceed debt opening balance', () => {
    const funfamiEntry = octoberEntries.find((e) => e.conceptId === 'exp_cuota_funfami')!;

    expect(() =>
      buildDebtPaymentsForInstallment(funfamiEntry, debts, [
        { debtId: 'debt_cb300f_moto', principalAmount: 1_000_000 },
      ])
    ).toThrow(RangeError);

    expect(() =>
      buildDebtPaymentsForInstallment(funfamiEntry, debts, [
        { debtId: 'unknown_debt', principalAmount: 1_800_000 },
      ])
    ).toThrow(/Unknown debtId/);

    expect(() =>
      buildDebtPaymentsForInstallment(funfamiEntry, debts, [
        { debtId: 'debt_esp_ia', principalAmount: 5_000_000 },
        { debtId: 'debt_cb300f_moto', principalAmount: -3_200_000 },
      ])
    ).toThrow(RangeError);
  });

  it('spills installment over from CB300F - MOTO into ESP. IA when CB300F - MOTO balance is smaller than the installment', () => {
    const smallMotoDebts: Debt[] = [
      {
        id: 'debt_esp_ia',
        groupKey: 'FUNFAMI',
        name: 'ESP. IA',
        lender: 'FUNFAMI',
        openingBalance: 3_600_000,
        monthKey: '2026-10',
      },
      {
        id: 'debt_cb300f_moto',
        groupKey: 'FUNFAMI',
        name: 'CB300F - MOTO',
        lender: 'FUNFAMI',
        openingBalance: 800_000,
        monthKey: '2026-10',
      },
    ];

    const summary = calculateFunfamiDebtSummary(smallMotoDebts, octoberEntries, '2026-10');
    expect(summary.debts.find((d) => d.debtId === 'debt_cb300f_moto')?.remainingBalance).toBe(0);
    expect(summary.debts.find((d) => d.debtId === 'debt_esp_ia')?.remainingBalance).toBe(
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
    const uncheckedEntries = uncompleteMovement(octoberEntries, '2026-10_exp_cuota_funfami');
    const summaryWithoutEntry = calculateFunfamiDebtSummary(debts, [], '2026-10');
    expect(summaryWithoutEntry.totalRemainingDebt).toBe(8_000_000);
    expect(
      calculateFunfamiDebtSummary(debts, uncheckedEntries, '2026-10').isInstallmentPaid
    ).toBe(false);
  });

  it('calculates monthly accrued interest when monthlyInterestRate is specified', () => {
    const interestDebts: Debt[] = [
      {
        id: 'debt_credit_card',
        groupKey: 'PERSONAL',
        name: 'Tarjeta Nu',
        lender: 'Nu Colombia',
        openingBalance: 1_000_000,
        monthKey: '2026-10',
        monthlyInterestRate: 2.0,
      },
    ];

    const summary = calculateFunfamiDebtSummary(interestDebts, octoberEntries, '2026-10');
    const cardStatus = summary.debts.find((d) => d.debtId === 'debt_credit_card')!;
    expect(cardStatus.accruedInterestThisMonth).toBe(20_000);
    expect(cardStatus.monthlyInterestRate).toBe(2.0);
  });
});
