import octoberFixture from '../../../fixtures/october-2026.json';
import {
  calculateChecklistProgress,
  calculateFunfamiDebtSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateMotoIdealSummary,
  closeMonthAndRollover,
  Concept,
  Debt,
  DebtPayment,
  ensureMonthPlan,
  IdealMotoPlan,
  MonthEntry,
  SavingsBucket,
  uncompleteMovement,
} from '../index';

const concepts = octoberFixture.concepts as unknown as Concept[];
const entries = octoberFixture.monthEntries as unknown as MonthEntry[];
const debts = octoberFixture.debts as unknown as Debt[];
const debtPayments = octoberFixture.debtPayments as unknown as DebtPayment[];
const savingsBuckets = octoberFixture.savingsBuckets as unknown as SavingsBucket[];
const idealMotoPlan = octoberFixture.idealMotoPlan as unknown as IdealMotoPlan;

describe('Golden Parity Suite — Octubre 2026 (Control_Ingresos_y_gastos_mensuales.xlsx)', () => {
  it('reproduces all exact golden formula outputs from the October 2026 sheet', () => {
    const budget = calculateMonthlyBudgetSummary(entries, '2026-10');
    const debt = calculateFunfamiDebtSummary(debts, entries, '2026-10', debtPayments);
    const savings = calculateMonthlySavingsSummary(
      savingsBuckets,
      concepts,
      entries,
      budget,
      '2026-10'
    );
    const checklist = calculateChecklistProgress(concepts, entries, '2026-10');
    const motoIdeal = calculateMotoIdealSummary(
      idealMotoPlan,
      entries,
      savings.moto.paidContributionsThisMonth,
      '2026-10'
    );

    expect(budget.receivedIncome).toBe(4_000_000); // B2 / B17
    expect(budget.plannedIncome).toBe(6_000_000);
    expect(budget.plannedExpenses).toBe(3_370_000); // B3
    expect(budget.paidExpenses).toBe(2_920_000); // B4 / H25
    expect(budget.pendingExpenses).toBe(450_000); // B5
    expect(budget.netCashFlow).toBe(1_080_000); // B6
    expect(budget.projectedNetFlow).toBe(2_630_000);
    expect(budget.expensesByGroup.fixed.paid).toBe(2_620_000); // H18
    expect(budget.expensesByGroup.variable.paid).toBe(300_000); // H24

    expect(debt.totalRemainingDebt).toBe(6_200_000); // H6
    expect(savings.moto.currentBalance).toBe(2_300_000); // K4
    expect(savings.savings.currentBalance).toBe(2_080_000); // K5
    expect(savings.totalCurrentSavings).toBe(4_380_000); // K6

    expect(motoIdeal.excelRecurringMonthlyTotalCop).toBe(872_667); // B43
    expect(motoIdeal.totalWithTargetGoalsCop).toBe(1_372_667);

    expect(checklist.completedCount).toBe(6);
    expect(checklist.totalTrackableCount).toBe(12);
  });

  describe('9 Resolved Excel Inconsistencies (ADR-0004)', () => {
    it('Inconsistency #1: separates receivedIncome (4M, B2) from plannedIncome (6M) and netCashFlow (1.08M) from projectedNetFlow (2.63M)', () => {
      const budget = calculateMonthlyBudgetSummary(entries, '2026-10');
      expect(budget.receivedIncome).toBe(4_000_000);
      expect(budget.plannedIncome).toBe(6_000_000);
      expect(budget.pendingIncome).toBe(2_000_000);
      expect(budget.netCashFlow).toBe(1_080_000);
      expect(budget.projectedNetFlow).toBe(2_630_000);
    });

    it('Inconsistency #2: computes planned, paid, and pending per expense group instead of only paid (H18/H24)', () => {
      const budget = calculateMonthlyBudgetSummary(entries, '2026-10');
      expect(budget.expensesByGroup.fixed).toEqual({
        planned: 2_970_000,
        paid: 2_620_000,
        pending: 350_000,
      });
      expect(budget.expensesByGroup.variable).toEqual({
        planned: 400_000,
        paid: 300_000,
        pending: 100_000,
      });
    });

    it('Inconsistency #3: reduces FUNFAMI debt ONLY when installment is completed, applying 100% principal (1.8M) to CB300F - MOTO', () => {
      const paidState = calculateFunfamiDebtSummary(debts, entries, '2026-10');
      expect(paidState.totalRemainingDebt).toBe(6_200_000);
      expect(paidState.debts.find((d) => d.debtId === 'debt_cb300f_moto')?.remainingBalance).toBe(
        2_600_000
      );
      expect(paidState.debts.find((d) => d.debtId === 'debt_esp_ia')?.remainingBalance).toBe(
        3_600_000
      );

      const entriesUnchecked = uncompleteMovement(entries, '2026-10_exp_cuota_funfami');
      const unpaidState = calculateFunfamiDebtSummary(debts, entriesUnchecked, '2026-10');
      expect(unpaidState.totalRemainingDebt).toBe(8_000_000);
    });

    it('Inconsistency #4: counts Moto savings contributions (CB300F 500k + Gasolina 200k = 2.3M) ONLY when paid', () => {
      const budget = calculateMonthlyBudgetSummary(entries, '2026-10');
      const savingsPaid = calculateMonthlySavingsSummary(
        savingsBuckets,
        concepts,
        entries,
        budget,
        '2026-10'
      );
      expect(savingsPaid.moto.currentBalance).toBe(2_300_000);

      const entriesWithoutCb300f = uncompleteMovement(entries, '2026-10_exp_cb300f');
      const budgetAfterUncheck = calculateMonthlyBudgetSummary(entriesWithoutCb300f, '2026-10');
      const savingsUnchecked = calculateMonthlySavingsSummary(
        savingsBuckets,
        concepts,
        entriesWithoutCb300f,
        budgetAfterUncheck,
        '2026-10'
      );
      expect(savingsUnchecked.moto.currentBalance).toBe(1_800_000);
    });

    it('Inconsistency #5: exposes both live Savings balance (2.08M, K5) and projected balance after pending expenses (1.63M)', () => {
      const budget = calculateMonthlyBudgetSummary(entries, '2026-10');
      const savings = calculateMonthlySavingsSummary(
        savingsBuckets,
        concepts,
        entries,
        budget,
        '2026-10'
      );
      expect(savings.savings.currentBalance).toBe(2_080_000);
      expect(savings.savings.projectedAfterPendingExpenses).toBe(1_630_000);
    });

    it('Inconsistency #6: automatically carries over October closing balances into November opening balances on month close', () => {
      const closeResult = closeMonthAndRollover({
        closingMonthKey: '2026-10',
        closedAtIso: '2026-10-31T23:59:00.000Z',
        concepts,
        entries,
        debts,
        debtPayments,
        savingsBuckets,
      });

      expect(closeResult.nextMonthKey).toBe('2026-11');
      expect(closeResult.nextMonthDebts).toEqual([
        expect.objectContaining({ id: 'debt_cb300f_moto', openingBalance: 2_600_000 }),
        expect.objectContaining({ id: 'debt_esp_ia', openingBalance: 3_600_000 }),
      ]);
      expect(closeResult.nextMonthSavingsBuckets).toEqual([
        { id: 'moto', name: 'Moto', openingBalance: 2_300_000 },
        { id: 'savings', name: 'Ahorros', openingBalance: 2_080_000 },
      ]);
    });

    it('Inconsistency #7: models IDEAL Moto items as COP integers and Kit de Arrastre (500k) as a TargetGoal for 2027-08', () => {
      const motoIdeal = calculateMotoIdealSummary(idealMotoPlan, entries, 700_000, '2026-10');
      expect(motoIdeal.excelRecurringMonthlyTotalCop).toBe(872_667);
      expect(motoIdeal.totalWithTargetGoalsCop).toBe(1_372_667);
      expect(motoIdeal.targetGoals[0]).toEqual({
        id: 'ideal_kit_de_arrastre_honda_original',
        displayName: 'KIT DE ARRASTRE HONDA ORIGINAL',
        targetAmountCop: 500_000,
        targetMonthKey: '2027-08',
        monthsUntilTarget: 10,
        suggestedMonthlySavingCop: 50_000,
      });
    });

    it('Inconsistency #8: restricts Prima recurrence to June and December ([6, 12]) when generating new months', () => {
      const novEntries = ensureMonthPlan('2026-11', concepts, []);
      const decEntries = ensureMonthPlan('2026-12', concepts, []);

      expect(novEntries.some((e) => e.conceptId === 'inc_prima')).toBe(false);
      expect(decEntries.some((e) => e.conceptId === 'inc_prima')).toBe(true);
    });

    it('Inconsistency #9: links IDEAL Gasolina (200k) to budget Gasolina Moto/Carro while keeping IDEAL Parqueadero (210k) separate from Parqueadero CEM (120k)', () => {
      const motoIdeal = calculateMotoIdealSummary(idealMotoPlan, entries, 700_000, '2026-10');
      const gasolina = motoIdeal.recurringItems.find((i) => i.id === 'ideal_gasolina');
      const parqueadero = motoIdeal.recurringItems.find((i) => i.id === 'ideal_parqueadero');

      expect(gasolina?.linkedConceptId).toBe('exp_gasolina_moto_carro');
      expect(gasolina?.actualBudgetedAmountCop).toBe(200_000);
      expect(gasolina?.varianceAgainstBudgetCop).toBe(0);

      expect(parqueadero?.linkedConceptId).toBeUndefined();
      expect(parqueadero?.actualBudgetedAmountCop).toBeUndefined();
    });
  });
});
