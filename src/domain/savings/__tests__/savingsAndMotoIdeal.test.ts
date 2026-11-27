import { buildSampleWorkspace } from '../../../data/sample/sampleWorkspace';
import {
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateProvisionPlanSummary,
  Concept,
  ProvisionPlan,
  MonthEntry,
  SavingsBucket,
} from '../../index';

/** The example budget of the showcase mode, in the month the tests pin. */
const sample = buildSampleWorkspace();

const concepts = sample.concepts as unknown as Concept[];
const octoberEntries = sample.entries as unknown as MonthEntry[];
const savingsBuckets = sample.savingsBuckets as unknown as SavingsBucket[];

describe('domain/savings & domain/moto-ideal — Savings Buckets and Moto Ideal Calculators', () => {
  it('gracefully handles accounts with no default moto or savings buckets (e.g. new users or deleted funds)', () => {
    const budget = calculateMonthlyBudgetSummary(octoberEntries, '2026-10');
    const emptySummary = calculateMonthlySavingsSummary([], concepts, octoberEntries, budget, '2026-10');
    expect(emptySummary.hasReserveBucket).toBe(false);
    expect(emptySummary.hasSavingsBucket).toBe(false);
    expect(emptySummary.totalCurrentSavings).toBe(0);

    const onlyMotoSummary = calculateMonthlySavingsSummary(
      [savingsBuckets[0]!],
      concepts,
      octoberEntries,
      budget,
      '2026-10'
    );
    expect(onlyMotoSummary.hasReserveBucket).toBe(true);
    expect(onlyMotoSummary.hasSavingsBucket).toBe(false);
    expect(onlyMotoSummary.reserve.currentBalance).toBe(2_300_000);
    expect(onlyMotoSummary.savings.currentBalance).toBe(0);
    expect(onlyMotoSummary.totalCurrentSavings).toBe(2_300_000);
  });

  it('computes Moto Ideal monthly gap (-172.667) and strict ceil total (872.668) vs Excel total (872.667)', () => {
    const plan = sample.provisionPlan as unknown as ProvisionPlan;
    const summary = calculateProvisionPlanSummary(plan, octoberEntries, 700_000, '2026-10');

    expect(summary.recurringMonthlyTotalCop).toBe(872_667);
    expect(summary.strictCeilRecurringMonthlyTotalCop).toBe(872_668);
    expect(summary.totalWithTargetGoalsCop).toBe(1_372_667);
    expect(summary.monthlyGapAgainstPlanCop).toBe(-172_667);
  });

  it('calculates custom savings buckets and direct savings contributions alongside standard buckets', () => {
    const customConcepts: Concept[] = [
      ...concepts,
      {
        id: 'exp_ahorro_viaje',
        name: 'Ahorro Viaje',
        type: 'expense',
        group: 'fixed',
        defaultAmount: 300_000,
        recurrence: { kind: 'monthly' },
        allowMultiplePerMonth: false,
        archived: false,
        order: 99,
        savingsContribution: { bucketId: 'bucket_viaje', onlyWhenCompleted: true },
      },
      {
        id: 'exp_ahorro_extra',
        name: 'Ahorro General Extra',
        type: 'expense',
        group: 'variable',
        defaultAmount: 150_000,
        recurrence: { kind: 'monthly' },
        allowMultiplePerMonth: false,
        archived: false,
        order: 100,
        savingsContribution: { bucketId: 'savings', onlyWhenCompleted: true },
      },
    ];
    const customEntries: MonthEntry[] = [
      ...octoberEntries,
      {
        id: '2026-10_exp_ahorro_viaje',
        monthKey: '2026-10',
        conceptId: 'exp_ahorro_viaje',
        conceptName: 'Ahorro Viaje',
        type: 'expense',
        group: 'fixed',
        plannedAmount: 300_000,
        actualAmount: 300_000,
        status: 'completed',
      },
      {
        id: '2026-10_exp_ahorro_extra',
        monthKey: '2026-10',
        conceptId: 'exp_ahorro_extra',
        conceptName: 'Ahorro General Extra',
        type: 'expense',
        group: 'variable',
        plannedAmount: 150_000,
        actualAmount: 150_000,
        status: 'completed',
      },
    ];
    const customBuckets: SavingsBucket[] = [
      ...savingsBuckets,
      {
        id: 'bucket_viaje',
        name: 'Fondo Viaje',
        openingBalance: 500_000,
      },
    ];

    const budget = calculateMonthlyBudgetSummary(customEntries, '2026-10');
    const summary = calculateMonthlySavingsSummary(
      customBuckets,
      customConcepts,
      customEntries,
      budget,
      '2026-10'
    );

    expect(summary.customBuckets).toHaveLength(1);
    expect(summary.customBuckets[0]?.id).toBe('bucket_viaje');
    expect(summary.customBuckets[0]?.openingBalance).toBe(500_000);
    expect(summary.customBuckets[0]?.paidContributionsThisMonth).toBe(300_000);
    expect(summary.customBuckets[0]?.currentBalance).toBe(800_000);
  });

  it('computes monthly goal contribution using periodMonths when targetMonthKey is omitted', () => {
    const plan: ProvisionPlan = {
      recurringMonthlyTotalCop: 0,
      totalWithTargetGoalCop: 1_000_000,
      items: [
        {
          id: 'goal_laptop',
          displayName: 'Laptop',
          monthlyAmountCop: 166_667,
          cycleCostCop: 1_000_000,
          periodMonths: 6,
          targetAmountCop: 1_000_000,
          kind: 'target_goal',
        },
      ],
    };

    const summary = calculateProvisionPlanSummary(plan, octoberEntries, 0, '2026-10');
    expect(summary.targetGoals[0]).toMatchObject({
      id: 'goal_laptop',
      targetAmountCop: 1_000_000,
      targetMonthKey: '2027-04',
      monthsUntilTarget: 6,
      suggestedMonthlySavingCop: 166_667,
    });
  });
});
