import {
  calculateDebtsSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateProvisionPlanSummary,
} from '../../domain';
import {
  parseConceptFromFirestore,
  parseDebtFromFirestore,
  parseMonthEntryFromFirestore,
  parseProvisionPlanFromFirestore,
  parseSavingsBucketFromFirestore,
} from '../mappers/firestoreSchemas';
import { buildSampleWorkspace, resolveSampleMonthKey } from '../sample/sampleWorkspace';

describe('sampleWorkspace (ADR 0037)', () => {
  const ORIGINAL_MONTH = process.env.BFLOW_SAMPLE_MONTH_KEY;
  afterEach(() => {
    process.env.BFLOW_SAMPLE_MONTH_KEY = ORIGINAL_MONTH;
  });

  it('starts in the month the tests pin, and in any month asked for', () => {
    expect(buildSampleWorkspace().monthKey).toBe(ORIGINAL_MONTH);
    const march = buildSampleWorkspace('2031-03');
    expect(march.monthKey).toBe('2031-03');
    expect(march.entries.every((e) => e.monthKey === '2031-03' && e.id.startsWith('2031-03_'))).toBe(
      true
    );
    expect(march.debts.every((d) => d.monthKey === '2031-03')).toBe(true);
    expect(march.provisionPlan.items.find((i) => i.kind === 'target_goal')?.targetMonthKey).toBe(
      '2032-01'
    );
    expect(() => buildSampleWorkspace('2031-13')).toThrow();
  });

  it('uses the current month when no month is pinned', () => {
    delete process.env.BFLOW_SAMPLE_MONTH_KEY;
    expect(resolveSampleMonthKey()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    process.env.BFLOW_SAMPLE_MONTH_KEY = 'not-a-month';
    expect(resolveSampleMonthKey()).not.toBe('not-a-month');
  });

  it('passes the Firestore schemas', () => {
    const sample = buildSampleWorkspace();
    for (const c of sample.concepts) expect(parseConceptFromFirestore(c)).toEqual(c);
    for (const e of sample.entries) expect(parseMonthEntryFromFirestore(e)).toEqual(e);
    for (const d of sample.debts) expect(parseDebtFromFirestore(d)).toEqual(d);
    for (const b of sample.savingsBuckets) expect(parseSavingsBucketFromFirestore(b)).toEqual(b);
    expect(parseProvisionPlanFromFirestore(sample.provisionPlan)).toEqual(sample.provisionPlan);
  });

  it('keeps the figures of the example consistent', () => {
    const sample = buildSampleWorkspace();
    const budget = calculateMonthlyBudgetSummary(sample.entries, sample.monthKey);
    const debts = calculateDebtsSummary(sample.debts, sample.entries, sample.monthKey, sample.debtPayments);
    const savings = calculateMonthlySavingsSummary(
      sample.savingsBuckets,
      sample.concepts,
      sample.entries,
      budget,
      sample.monthKey
    );
    const plan = calculateProvisionPlanSummary(
      sample.provisionPlan,
      sample.entries,
      savings.reserve.paidContributionsThisMonth,
      sample.monthKey
    );

    expect(debts.totalRemainingDebt).toBe(6_200_000);
    expect(savings.reserve.currentBalance).toBe(2_300_000);
    expect(savings.savings.currentBalance).toBe(2_080_000);
    expect(plan.recurringMonthlyTotalCop).toBe(872_667);
    expect(plan.totalWithTargetGoalsCop).toBe(1_372_667);
    expect(new Set(sample.concepts.map((c) => c.id)).size).toBe(sample.concepts.length);
  });
});
