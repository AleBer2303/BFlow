import octoberFixture from '../../../../fixtures/october-2026.json';
import {
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateMotoIdealSummary,
  Concept,
  IdealMotoPlan,
  MonthEntry,
  SavingsBucket,
} from '../../index';

const concepts = octoberFixture.concepts as unknown as Concept[];
const octoberEntries = octoberFixture.monthEntries as unknown as MonthEntry[];
const savingsBuckets = octoberFixture.savingsBuckets as unknown as SavingsBucket[];
const idealMotoPlan = octoberFixture.idealMotoPlan as unknown as IdealMotoPlan[];

describe('domain/savings & domain/moto-ideal — Savings Buckets and Moto Ideal Calculators', () => {
  it('throws if either moto or savings bucket is missing', () => {
    const budget = calculateMonthlyBudgetSummary(octoberEntries, '2026-10');
    expect(() =>
      calculateMonthlySavingsSummary([savingsBuckets[0]!], concepts, octoberEntries, budget, '2026-10')
    ).toThrow(/Both "moto" and "savings" buckets are required/);
  });

  it('computes Moto Ideal monthly gap (-172.667) and strict ceil total (872.668) vs Excel total (872.667)', () => {
    const plan = octoberFixture.idealMotoPlan as unknown as IdealMotoPlan;
    const summary = calculateMotoIdealSummary(plan, octoberEntries, 700_000, '2026-10');

    expect(summary.excelRecurringMonthlyTotalCop).toBe(872_667);
    expect(summary.strictCeilRecurringMonthlyTotalCop).toBe(872_668);
    expect(summary.totalWithTargetGoalsCop).toBe(1_372_667);
    expect(summary.monthlyGapAgainstIdealCop).toBe(-172_667);
  });
});
