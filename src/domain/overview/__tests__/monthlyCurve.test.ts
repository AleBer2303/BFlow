import seedFixture from '../../../../fixtures/seed-october-2026.json';
import { calculateMonthlyBudgetSummary } from '../../budget/budgetCalculator';
import { calculateDebtsSummary } from '../../debts/debtCalculator';
import type {
  Concept,
  Debt,
  DebtPayment,
  MonthEntry,
  SavingsBucket,
} from '../../models/types';
import { calculateMonthlySavingsSummary } from '../../savings/savingsCalculator';
import { buildMonthlyCurve, MONTHLY_CURVE_METRIC_IDS } from '../monthlyCurve';

const SEED_CONCEPTS = seedFixture.concepts as unknown as Concept[];
const SEED_ENTRIES = seedFixture.entries as unknown as MonthEntry[];
const SEED_PAYMENTS = seedFixture.debtPayments as unknown as DebtPayment[];
const SEED_DEBTS = seedFixture.debts as unknown as Debt[];
const SEED_BUCKETS = seedFixture.savingsBuckets as unknown as SavingsBucket[];

interface Scenario {
  monthKey?: string;
  todayIso?: string;
  entries?: MonthEntry[];
  concepts?: Concept[];
  payments?: DebtPayment[];
  debts?: Debt[];
  buckets?: SavingsBucket[];
}

function curveFor(scenario: Scenario = {}) {
  const {
    monthKey = '2026-10',
    todayIso = '2026-10-27',
    entries = SEED_ENTRIES,
    concepts = SEED_CONCEPTS,
    payments = SEED_PAYMENTS,
    debts = SEED_DEBTS,
    buckets = SEED_BUCKETS,
  } = scenario;
  const budget = calculateMonthlyBudgetSummary(entries, monthKey);

  return buildMonthlyCurve({
    monthKey,
    todayIso,
    entries,
    concepts,
    debtPayments: payments,
    budget,
    savings: calculateMonthlySavingsSummary(buckets, concepts, entries, budget, monthKey),
    debts: calculateDebtsSummary(debts, entries, monthKey, payments),
  });
}

function entry(overrides: Partial<MonthEntry> & Pick<MonthEntry, 'id'>): MonthEntry {
  return {
    monthKey: '2026-10',
    conceptId: 'concept',
    conceptName: 'Concepto',
    type: 'income',
    group: 'fixed',
    plannedAmount: 100,
    actualAmount: 100,
    status: 'completed',
    completedAt: '2026-10-05',
    ...overrides,
  };
}

function concept(overrides: Partial<Concept> & Pick<Concept, 'id'>): Concept {
  return {
    name: 'Concepto',
    type: 'expense',
    group: 'fixed',
    defaultAmount: 100,
    allowMultiplePerMonth: false,
    recurrence: { kind: 'monthly' },
    archived: false,
    order: 1,
    ...overrides,
  };
}

function lastValue(values: readonly number[]): number | undefined {
  return values[values.length - 1];
}

describe('buildMonthlyCurve', () => {
  it('ends every series on the October 2026 golden figures and projects the month end', () => {
    const { series, cutoffDay, daysInMonth, isCurrentMonth, hasProjection } = curveFor();

    expect({ cutoffDay, daysInMonth, isCurrentMonth, hasProjection }).toEqual({
      cutoffDay: 27,
      daysInMonth: 31,
      isCurrentMonth: true,
      hasProjection: true,
    });
    expect(series.flow.values[27]).toBe(1_080_000);
    expect(series.income.values[27]).toBe(4_000_000);
    expect(series.expenses.values[27]).toBe(2_920_000);
    expect(series.savings.values[27]).toBe(4_380_000);
    expect(series.debt.values[27]).toBe(6_200_000);

    expect(series.flow.projectedClose).toBe(2_630_000);
    expect(series.income.projectedClose).toBe(6_000_000);
    expect(series.expenses.projectedClose).toBe(3_370_000);
    expect(series.savings.projectedClose).toBe(5_930_000);
    expect(series.debt.projectedClose).toBe(6_200_000);
  });

  it('places each movement on the day it was completed', () => {
    const { series } = curveFor();

    expect(series.flow.values.slice(0, 21)).toEqual(new Array(21).fill(0));
    expect(series.flow.values[21]).toBe(2_880_000);
    expect(series.flow.values[26]).toBe(2_880_000);
    expect(series.savings.values[0]).toBe(2_600_000);
    expect(series.savings.values[21]).toBe(6_180_000);
  });

  it('keeps the debt flat on salary day and lowers it only with the real payment', () => {
    const { values } = curveFor().series.debt;

    expect(values[20]).toBe(8_000_000);
    expect(values[21]).toBe(8_000_000);
    expect(values[26]).toBe(8_000_000);
    expect(values[27]).toBe(6_200_000);
  });

  it('projects a pending installment without moving the debt before it is paid', () => {
    const entries = SEED_ENTRIES.map((candidate) =>
      candidate.conceptId === 'exp_cuota_funfami'
        ? { ...candidate, status: 'pending' as const, completedAt: undefined }
        : candidate
    );
    const { debt } = curveFor({ entries }).series;

    expect(lastValue(debt.values)).toBe(8_000_000);
    expect(debt.projectedClose).toBe(6_200_000);
  });

  it('never projects a debt below zero', () => {
    const entries = SEED_ENTRIES.map((candidate) =>
      candidate.conceptId === 'exp_cuota_funfami'
        ? { ...candidate, status: 'pending' as const, completedAt: undefined }
        : candidate
    );
    const debts = [{ ...(SEED_DEBTS[0] as Debt), openingBalance: 500_000 }];

    expect(curveFor({ entries, debts, payments: [] }).series.debt.projectedClose).toBe(0);
  });

  it('has no projection once the month is over', () => {
    const curve = curveFor({ todayIso: '2026-11-09' });

    expect(curve.cutoffDay).toBe(31);
    expect(curve.isCurrentMonth).toBe(false);
    expect(curve.hasProjection).toBe(false);
    expect(curve.series.flow.values).toHaveLength(32);
    expect(curve.series.flow.projectedClose).toBe(1_080_000);
    expect(curve.series.debt.projectedClose).toBe(6_200_000);
  });

  it('has no projection on the last day of the current month', () => {
    const curve = curveFor({ todayIso: '2026-10-31' });

    expect(curve.isCurrentMonth).toBe(true);
    expect(curve.hasProjection).toBe(false);
  });

  it('keeps a future month on its opening point and still projects it', () => {
    const curve = curveFor({ todayIso: '2026-09-15' });

    expect(curve.cutoffDay).toBe(1);
    expect(curve.isCurrentMonth).toBe(false);
    expect(curve.hasProjection).toBe(true);
    expect(curve.series.flow.values).toEqual([0, 1_080_000]);
  });

  it.each([
    ['no date', undefined, 1],
    ['an unreadable date', 'ayer', 1],
    ['a date before the month', '2026-09-28', 1],
    ['a date after the month', '2026-11-02', 15],
    ['a future date within the month', '2026-10-30', 15],
    ['day zero', '2026-10-00', 1],
    ['a regular date', '2026-10-09', 9],
  ])('places a movement with %s on the right day', (_label, completedAt, expectedDay) => {
    const entries = [entry({ id: 'e1', completedAt })];
    const { values } = curveFor({
      entries,
      concepts: [],
      payments: [],
      todayIso: '2026-10-15',
    }).series.income;

    expect(values[expectedDay - 1]).toBe(0);
    expect(values[expectedDay]).toBe(100);
    expect(lastValue(values)).toBe(100);
  });

  it('ignores movements from other months, pending ones and inactive payments', () => {
    const entries = [
      entry({ id: 'e1', actualAmount: 500, plannedAmount: 500 }),
      entry({ id: 'other', monthKey: '2026-09', completedAt: '2026-09-05' }),
      entry({ id: 'pending', status: 'pending', completedAt: undefined }),
    ];
    const payments: DebtPayment[] = [
      { id: 'p1', entryId: 'e1', monthKey: '2026-10', debtId: 'd', principalAmount: 9, interestAmount: 0, totalApplied: 9, active: false },
      { id: 'p2', entryId: 'pending', monthKey: '2026-10', debtId: 'd', principalAmount: 9, interestAmount: 0, totalApplied: 9, active: true },
      { id: 'p3', entryId: 'e1', monthKey: '2026-09', debtId: 'd', principalAmount: 9, interestAmount: 0, totalApplied: 9, active: true },
    ];
    const debts = [{ ...(SEED_DEBTS[0] as Debt), id: 'd', openingBalance: 1_000 }];
    const { series } = curveFor({ entries, payments, debts, concepts: [] });

    expect(lastValue(series.income.values)).toBe(500);
    expect(series.income.projectedClose).toBe(600);
    expect(series.debt.values.every((value) => value === 1_000)).toBe(true);
  });

  it('dates a payment from its own record when the entry has no date', () => {
    const entries = [entry({ id: 'e1', type: 'expense', completedAt: undefined })];
    const payments: DebtPayment[] = [
      { id: 'p1', entryId: 'e1', monthKey: '2026-10', debtId: 'd', principalAmount: 40, interestAmount: 0, totalApplied: 40, completedAt: '2026-10-12', active: true },
    ];
    const debts = [{ ...(SEED_DEBTS[0] as Debt), id: 'd', openingBalance: 1_000 }];
    const { values } = curveFor({ entries, payments, debts, concepts: [] }).series.debt;

    expect(values[11]).toBe(1_000);
    expect(values[12]).toBe(960);
  });

  it('leaves net flow out of savings when there is no general savings bucket', () => {
    const buckets = SEED_BUCKETS.filter((bucket) => bucket.id !== 'savings');
    const { savings } = curveFor({ buckets }).series;

    expect(savings.values[0]).toBe(1_600_000);
    expect(savings.values[21]).toBe(2_300_000);
    expect(savings.projectedClose).toBe(2_300_000);
  });

  it('counts direct and custom bucket contributions on their own day', () => {
    const concepts = [
      concept({ id: 'direct', savingsContribution: { bucketId: 'savings', onlyWhenCompleted: true } }),
      concept({ id: 'custom', savingsContribution: { bucketId: 'trip', onlyWhenCompleted: true } }),
      concept({ id: 'archived', archived: true, savingsContribution: { bucketId: 'savings', onlyWhenCompleted: true } }),
    ];
    const entries = [
      entry({ id: 'd', conceptId: 'direct', type: 'expense', completedAt: '2026-10-03' }),
      entry({ id: 'c', conceptId: 'custom', type: 'expense', completedAt: '2026-10-08' }),
      entry({ id: 'a', conceptId: 'archived', type: 'expense', completedAt: '2026-10-10' }),
      entry({ id: 'pc', conceptId: 'custom', type: 'expense', status: 'pending', completedAt: undefined, plannedAmount: 70 }),
    ];
    const buckets: SavingsBucket[] = [
      { id: 'savings', name: 'Ahorros', openingBalance: 1_000 },
      { id: 'trip', name: 'Viaje', openingBalance: 500 },
    ];
    const { savings } = curveFor({ entries, concepts, buckets, payments: [] }).series;

    expect(savings.values[0]).toBe(1_500);
    // Expense and contribution cancel out when the money stays in the savings bucket.
    expect(savings.values[3]).toBe(1_500);
    expect(savings.values[8]).toBe(1_500);
    expect(savings.values[10]).toBe(1_400);
    expect(lastValue(savings.values)).toBe(1_400);
    expect(savings.projectedClose).toBe(1_400);
  });

  it('anchors the opening when a balance was clamped by its calculator', () => {
    const entries = [entry({ id: 'e1', type: 'expense' })];
    const payments: DebtPayment[] = [
      { id: 'p1', entryId: 'e1', monthKey: '2026-10', debtId: 'd', principalAmount: 900, interestAmount: 0, totalApplied: 900, active: true },
    ];
    const debts = [{ ...(SEED_DEBTS[0] as Debt), id: 'd', openingBalance: 300 }];
    const { values } = curveFor({ entries, payments, debts, concepts: [] }).series.debt;

    expect(lastValue(values)).toBe(0);
    expect(values[0]).toBe(900);
  });

  it('uses a scale that always includes zero and every value', () => {
    const entries = [entry({ id: 'e1', type: 'expense', actualAmount: 800, plannedAmount: 800 })];
    const { flow } = curveFor({ entries, concepts: [], payments: [] }).series;

    expect(flow.scaleMin).toBe(-800);
    expect(flow.scaleMax).toBe(0);
  });

  it('gives a blank month a valid non-empty scale', () => {
    const curve = curveFor({ entries: [], concepts: [], payments: [], debts: [], buckets: [] });

    for (const id of MONTHLY_CURVE_METRIC_IDS) {
      expect(curve.series[id].values.every((value) => value === 0)).toBe(true);
      expect(curve.series[id].scaleMin).toBe(0);
      expect(curve.series[id].scaleMax).toBe(1);
    }
  });

  it.each([
    ['2024-02', '2024-03-01', 29],
    ['2026-02', '2026-03-01', 28],
    ['2026-04', '2026-05-01', 30],
  ])('resolves the length of %s', (monthKey, todayIso, expectedDays) => {
    expect(
      curveFor({ monthKey, todayIso, entries: [], concepts: [], payments: [], debts: [], buckets: [] })
        .daysInMonth
    ).toBe(expectedDays);
  });

  it('rejects invalid month keys, dates and decimal money', () => {
    expect(() => curveFor({ monthKey: '2026-13' })).toThrow(RangeError);
    expect(() => curveFor({ todayIso: 'hoy' })).toThrow(RangeError);

    const budget = calculateMonthlyBudgetSummary([], '2026-10');
    const savings = calculateMonthlySavingsSummary([], [], [], budget, '2026-10');
    expect(() =>
      buildMonthlyCurve({
        monthKey: '2026-10',
        todayIso: '2026-10-05',
        entries: [],
        concepts: [],
        debtPayments: [],
        budget,
        savings,
        debts: { totalRemainingDebt: 10.5 },
      })
    ).toThrow(TypeError);
  });
});
