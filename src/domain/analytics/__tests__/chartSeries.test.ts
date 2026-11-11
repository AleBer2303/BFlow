import seedFixture from '../../../../fixtures/seed-october-2026.json';
import { calculateMonthlyBudgetSummary } from '../../budget/budgetCalculator';
import { formatMonthKeyShortLabelEs } from '../../date/monthKey';
import { calculateDebtsSummary } from '../../debts/debtCalculator';
import { closeMonthAndRollover } from '../../month-close/monthClose';
import type {
  Concept,
  Debt,
  DebtPayment,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../models/types';
import {
  buildDebtTrajectory,
  buildExpenseDistribution,
  buildMonthComparison,
  buildMonthlyHistory,
  buildPaidVsPendingSplit,
  OTHER_SLICE_ID,
  resolveHistoryWindow,
  type MonthlyHistoryInput,
  type MonthlyHistoryPoint,
} from '../chartSeries';

const CONCEPTS = seedFixture.concepts as unknown as Concept[];
const ENTRIES = seedFixture.entries as unknown as MonthEntry[];
const PAYMENTS = seedFixture.debtPayments as unknown as DebtPayment[];
const DEBTS = seedFixture.debts as unknown as Debt[];
const BUCKETS = seedFixture.savingsBuckets as unknown as SavingsBucket[];

function octoberInput(overrides: Partial<MonthlyHistoryInput> = {}): MonthlyHistoryInput {
  return {
    monthKeys: ['2026-10'],
    activeMonthKey: '2026-10',
    concepts: CONCEPTS,
    entries: ENTRIES,
    debtPayments: PAYMENTS,
    debtsByMonth: { '2026-10': DEBTS },
    savingsBucketsByMonth: { '2026-10': BUCKETS },
    closedSnapshots: {},
    ...overrides,
  };
}

/** October closed with the real rollover, November open and untouched. */
function closedOctoberInput(): MonthlyHistoryInput {
  const result = closeMonthAndRollover({
    closingMonthKey: '2026-10',
    closedAtIso: '2026-10-31T23:00:00.000Z',
    concepts: CONCEPTS,
    entries: ENTRIES,
    debts: DEBTS,
    debtPayments: PAYMENTS,
    savingsBuckets: BUCKETS,
  });
  return octoberInput({
    monthKeys: ['2026-11', '2026-10'],
    activeMonthKey: '2026-11',
    entries: [...ENTRIES, ...result.nextMonthEntries],
    debtsByMonth: { '2026-10': DEBTS, '2026-11': result.nextMonthDebts },
    savingsBucketsByMonth: {
      '2026-10': BUCKETS,
      '2026-11': result.nextMonthSavingsBuckets,
    },
    closedSnapshots: { '2026-10': result.snapshot },
  });
}

function pointFor(monthKey: string, overrides: Partial<MonthlyHistoryPoint> = {}) {
  return {
    monthKey,
    isClosed: false,
    plannedIncome: 0,
    receivedIncome: 0,
    plannedExpenses: 0,
    paidExpenses: 0,
    pendingExpenses: 0,
    netCashFlow: 0,
    totalDebt: 0,
    reserveName: 'Moto',
    reserveBalance: 0,
    savingsName: 'Ahorros',
    savingsBalance: 0,
    otherSavingsBalance: 0,
    totalSavings: 0,
    reserveContribution: 0,
    ...overrides,
  } satisfies MonthlyHistoryPoint;
}

describe('resolveHistoryWindow', () => {
  it('sorts, removes duplicates and keeps the months up to the active one', () => {
    expect(
      resolveHistoryWindow(['2026-12', '2026-10', '2026-11', '2026-10', '2027-01'], '2026-12')
    ).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('always includes the active month and keeps only the last months of a long history', () => {
    expect(resolveHistoryWindow([], '2026-10')).toEqual(['2026-10']);
    const year = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    expect(resolveHistoryWindow(year, '2026-12')).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(resolveHistoryWindow(year, '2026-03', 2)).toEqual(['2026-02', '2026-03']);
  });

  it('crosses the year boundary in calendar order', () => {
    expect(resolveHistoryWindow(['2027-01', '2026-12', '2026-11'], '2027-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });

  it('rejects invalid month keys and window sizes', () => {
    expect(() => resolveHistoryWindow(['2026-13'], '2026-10')).toThrow(RangeError);
    expect(() => resolveHistoryWindow([], 'oct')).toThrow(RangeError);
    expect(() => resolveHistoryWindow([], '2026-10', 0)).toThrow(RangeError);
    expect(() => resolveHistoryWindow([], '2026-10', 1.5)).toThrow(RangeError);
  });
});

describe('buildMonthlyHistory', () => {
  it('reproduces the October 2026 golden values for an open month', () => {
    const [october] = buildMonthlyHistory(octoberInput());

    expect(october).toEqual({
      monthKey: '2026-10',
      isClosed: false,
      plannedIncome: 6_000_000,
      receivedIncome: 4_000_000,
      plannedExpenses: 3_370_000,
      paidExpenses: 2_920_000,
      pendingExpenses: 450_000,
      netCashFlow: 1_080_000,
      totalDebt: 6_200_000,
      reserveName: 'Moto',
      reserveBalance: 2_300_000,
      savingsName: 'Ahorros',
      savingsBalance: 2_080_000,
      otherSavingsBalance: 0,
      totalSavings: 4_380_000,
      reserveContribution: 700_000,
    });
  });

  it('reads a closed month from its snapshot and the next month from the rollover', () => {
    const history = buildMonthlyHistory(closedOctoberInput());

    expect(history.map((point) => point.monthKey)).toEqual(['2026-10', '2026-11']);
    const [october, november] = history as [MonthlyHistoryPoint, MonthlyHistoryPoint];

    expect(october).toMatchObject({
      isClosed: true,
      receivedIncome: 4_000_000,
      paidExpenses: 2_920_000,
      netCashFlow: 1_080_000,
      totalDebt: 6_200_000,
      reserveBalance: 2_300_000,
      savingsBalance: 2_080_000,
      totalSavings: 4_380_000,
      reserveContribution: 700_000,
    });
    // November opens with October's closing balances and nothing paid yet.
    expect(november).toMatchObject({
      isClosed: false,
      receivedIncome: 0,
      paidExpenses: 0,
      totalDebt: 6_200_000,
      reserveBalance: 2_300_000,
      savingsBalance: 2_080_000,
      totalSavings: 4_380_000,
      reserveContribution: 0,
    });
  });

  it('prefers the frozen snapshot over the live entries of a closed month', () => {
    const input = closedOctoberInput();
    const snapshot = input.closedSnapshots['2026-10'] as MonthSnapshot;
    const frozen: MonthSnapshot = {
      ...snapshot,
      budget: { ...snapshot.budget, netCashFlow: 999_000 },
      totalClosingDebt: 5_000_000,
      closingSavings: {
        reserveClosingBalance: 2_000_000,
        motoClosingBalance: 1_000_000,
        savingsClosingBalance: 1_500_000,
        totalClosingSavings: 4_000_000,
      },
    };
    const [october] = buildMonthlyHistory({ ...input, closedSnapshots: { '2026-10': frozen } });

    expect(october).toMatchObject({
      netCashFlow: 999_000,
      totalDebt: 5_000_000,
      reserveBalance: 2_000_000,
      savingsBalance: 1_500_000,
      otherSavingsBalance: 500_000,
      totalSavings: 4_000_000,
    });
  });

  it('computes the active month live even when it is closed, so it agrees with the cards', () => {
    const input = closedOctoberInput();
    // Back to October from the history, then a pending expense is paid after the close.
    const edited = input.entries.map((entry) =>
      entry.id === '2026-10_exp_smart_fit'
        ? { ...entry, status: 'completed' as const, actualAmount: entry.plannedAmount }
        : entry
    );
    const history = buildMonthlyHistory({ ...input, activeMonthKey: '2026-10', entries: edited });
    const live = calculateMonthlyBudgetSummary(edited, '2026-10');

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      monthKey: '2026-10',
      isClosed: true,
      paidExpenses: live.paidExpenses,
      netCashFlow: live.netCashFlow,
    });
    expect(history[0]?.paidExpenses).toBe(3_020_000);
    // The snapshot still holds the figures frozen at the close.
    expect(input.closedSnapshots['2026-10']?.budget.paidExpenses).toBe(2_920_000);
  });

  it('falls back to the legacy moto balance and default bucket names', () => {
    const input = closedOctoberInput();
    const snapshot = input.closedSnapshots['2026-10'] as MonthSnapshot;
    const legacy: MonthSnapshot = {
      ...snapshot,
      closingSavings: {
        motoClosingBalance: 2_300_000,
        savingsClosingBalance: 2_080_000,
        totalClosingSavings: 4_380_000,
      },
    };
    const [october] = buildMonthlyHistory({
      ...input,
      closedSnapshots: { '2026-10': legacy },
      savingsBucketsByMonth: { '2026-10': [{ id: 'moto', name: '  ', openingBalance: 0 }] },
    });

    expect(october).toMatchObject({
      reserveBalance: 2_300_000,
      reserveName: 'Fondo de Reserva',
      savingsName: 'Ahorros',
      otherSavingsBalance: 0,
    });
  });

  it('adds user buckets to the other savings and handles months with no data', () => {
    const [october] = buildMonthlyHistory(
      octoberInput({
        savingsBucketsByMonth: {
          '2026-10': [...BUCKETS, { id: 'trip', name: 'Viaje', openingBalance: 300_000 }],
        },
      })
    );
    expect(october).toMatchObject({ otherSavingsBalance: 300_000, totalSavings: 4_680_000 });

    const [empty] = buildMonthlyHistory(
      octoberInput({
        entries: [],
        debtsByMonth: {},
        savingsBucketsByMonth: {},
      })
    );
    expect(empty).toMatchObject({
      receivedIncome: 0,
      totalDebt: 0,
      reserveName: 'Fondo de Reserva',
      reserveBalance: 0,
      totalSavings: 0,
    });
  });
});

describe('buildExpenseDistribution', () => {
  it('splits October by concept and adds up to paid plus pending expenses', () => {
    const distribution = buildExpenseDistribution(ENTRIES, '2026-10');
    const budget = calculateMonthlyBudgetSummary(ENTRIES, '2026-10');

    expect(distribution.total).toBe(budget.paidExpenses + budget.pendingExpenses);
    expect(distribution.total).toBe(3_370_000);
    expect(distribution.slices.reduce((sum, slice) => sum + slice.amount, 0)).toBe(
      distribution.total
    );
    expect(distribution.slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10);
    expect(distribution.slices).toHaveLength(6);
    expect(distribution.slices[0]).toMatchObject({ label: 'Cuota FUNFAMI', amount: 1_800_000 });
    expect(distribution.slices[1]).toMatchObject({ label: 'CB300F', amount: 500_000 });

    const other = distribution.slices[5];
    expect(other?.id).toBe(OTHER_SLICE_ID);
    expect(other?.label).toBe('Otros');
    // Parqueadero 120k + Plan 100k + ETB 100k + Smart Fit 100k + Gemini 20k.
    expect(other?.amount).toBe(440_000);
  });

  it('is sorted from the largest slice down', () => {
    const { slices } = buildExpenseDistribution(ENTRIES, '2026-10', 20);
    const amounts = slices.map((slice) => slice.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(slices.some((slice) => slice.id === OTHER_SLICE_ID)).toBe(false);
  });

  it('uses the actual amount of paid entries and the planned one of pending entries', () => {
    const base: MonthEntry = {
      id: 'a',
      monthKey: '2026-10',
      conceptId: 'exp_a',
      conceptName: 'A',
      type: 'expense',
      group: 'variable',
      plannedAmount: 100_000,
      actualAmount: 80_000,
      status: 'completed',
    };
    const distribution = buildExpenseDistribution(
      [
        base,
        { ...base, id: 'a2', status: 'pending', actualAmount: 0, plannedAmount: 50_000 },
        { ...base, id: 'b', conceptId: 'exp_b', conceptName: 'B', status: 'pending' },
        { ...base, id: 'z', conceptId: 'exp_z', conceptName: 'Cero', plannedAmount: 0, status: 'pending' },
        { ...base, id: 'inc', conceptId: 'inc_a', type: 'income' },
        { ...base, id: 'nov', monthKey: '2026-11' },
      ],
      '2026-10'
    );

    expect(distribution.slices).toEqual([
      { id: 'exp_a', label: 'A', amount: 130_000, share: 130_000 / 230_000 },
      { id: 'exp_b', label: 'B', amount: 100_000, share: 100_000 / 230_000 },
    ]);
  });

  it('keeps a single leftover concept under its own name instead of "Otros"', () => {
    const entries = ['a', 'b', 'c'].map<MonthEntry>((id, index) => ({
      id,
      monthKey: '2026-10',
      conceptId: id,
      conceptName: id.toUpperCase(),
      type: 'expense',
      group: 'fixed',
      plannedAmount: (3 - index) * 1_000,
      actualAmount: 0,
      status: 'pending',
    }));
    expect(buildExpenseDistribution(entries, '2026-10', 2).slices.map((s) => s.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(buildExpenseDistribution(entries, '2026-10', 1).slices.map((s) => s.label)).toEqual([
      'A',
      'Otros',
    ]);
  });

  it('returns an empty distribution for a month without expenses and validates input', () => {
    expect(buildExpenseDistribution([], '2026-10')).toEqual({
      monthKey: '2026-10',
      total: 0,
      slices: [],
    });
    expect(() => buildExpenseDistribution([], '2026-1')).toThrow(RangeError);
    expect(() => buildExpenseDistribution([], '2026-10', 0)).toThrow(RangeError);
  });

  it('refuses non-integer money', () => {
    const entry: MonthEntry = {
      id: 'x',
      monthKey: '2026-10',
      conceptId: 'x',
      conceptName: 'X',
      type: 'expense',
      group: 'fixed',
      plannedAmount: 10.5,
      actualAmount: 0,
      status: 'pending',
    };
    expect(() => buildExpenseDistribution([entry], '2026-10')).toThrow();
  });
});

describe('buildPaidVsPendingSplit', () => {
  it('matches Excel B4 and B5 for October 2026', () => {
    const split = buildPaidVsPendingSplit(calculateMonthlyBudgetSummary(ENTRIES, '2026-10'));
    expect(split).toEqual({
      paid: 2_920_000,
      pending: 450_000,
      total: 3_370_000,
      paidShare: 2_920_000 / 3_370_000,
    });
  });

  it('reports a zero share when there is nothing to pay and refuses decimals', () => {
    expect(buildPaidVsPendingSplit({ paidExpenses: 0, pendingExpenses: 0 }).paidShare).toBe(0);
    expect(() => buildPaidVsPendingSplit({ paidExpenses: 1.2, pendingExpenses: 0 })).toThrow();
  });
});

describe('buildMonthComparison', () => {
  it('compares the last month with the one before it', () => {
    const comparison = buildMonthComparison([
      pointFor('2026-09', { receivedIncome: 3_000_000, paidExpenses: 2_500_000, netCashFlow: 500_000 }),
      pointFor('2026-10', { receivedIncome: 4_000_000, paidExpenses: 2_920_000, netCashFlow: 1_080_000 }),
    ]);

    expect(comparison).toEqual({
      previousMonthKey: '2026-09',
      currentMonthKey: '2026-10',
      rows: [
        { id: 'receivedIncome', label: 'Ingresos recibidos', previous: 3_000_000, current: 4_000_000, delta: 1_000_000 },
        { id: 'paidExpenses', label: 'Gastos pagados', previous: 2_500_000, current: 2_920_000, delta: 420_000 },
        { id: 'netCashFlow', label: 'Flujo neto', previous: 500_000, current: 1_080_000, delta: 580_000 },
      ],
    });
  });

  it('returns null without a previous month', () => {
    expect(buildMonthComparison([])).toBeNull();
    expect(buildMonthComparison([pointFor('2026-10')])).toBeNull();
  });
});

describe('buildDebtTrajectory', () => {
  it('projects the October 2026 debt to zero in the payoff month of the Debts tab', () => {
    const history = buildMonthlyHistory(octoberInput());
    const summary = calculateDebtsSummary(DEBTS, ENTRIES, '2026-10', PAYMENTS);
    const trajectory = buildDebtTrajectory(history, summary.projection);

    // 6.200.000 / 1.800.000 = 3,44 → 4 cuotas más: febrero de 2027.
    expect(summary.projection).toEqual({ remainingMonths: 4, estimatedPayoffMonthKey: '2027-02' });
    expect(trajectory).toEqual({
      points: [
        { monthKey: '2026-10', balance: 6_200_000, isProjected: false },
        { monthKey: '2027-02', balance: 0, isProjected: true },
      ],
      remainingMonths: 4,
      estimatedPayoffMonthKey: '2027-02',
    });
  });

  it('counts the projection from the last month of the window', () => {
    const trajectory = buildDebtTrajectory(
      [pointFor('2026-10', { totalDebt: 8_000_000 }), pointFor('2026-11', { totalDebt: 6_200_000 })],
      { remainingMonths: 4, estimatedPayoffMonthKey: '2027-03' }
    );
    expect(trajectory.points.map((p) => p.monthKey)).toEqual(['2026-10', '2026-11', '2027-03']);
  });

  it('marks a paid-off debt as closed in the current month and draws no projection', () => {
    expect(
      buildDebtTrajectory([pointFor('2026-10', { totalDebt: 0 })], {
        remainingMonths: 0,
        estimatedPayoffMonthKey: '2026-10',
      })
    ).toEqual({
      points: [{ monthKey: '2026-10', balance: 0, isProjected: false }],
      remainingMonths: 0,
      estimatedPayoffMonthKey: '2026-10',
    });
  });

  it('draws no projection when there is no installment to project with', () => {
    expect(
      buildDebtTrajectory([pointFor('2026-10', { totalDebt: 1_000 })], {
        remainingMonths: Number.POSITIVE_INFINITY,
        estimatedPayoffMonthKey: null,
      })
    ).toEqual({
      points: [{ monthKey: '2026-10', balance: 1_000, isProjected: false }],
      remainingMonths: null,
      estimatedPayoffMonthKey: null,
    });
    expect(buildDebtTrajectory([], { remainingMonths: 1, estimatedPayoffMonthKey: '2026-11' })).toEqual({
      points: [],
      remainingMonths: null,
      estimatedPayoffMonthKey: null,
    });
  });
});

describe('formatMonthKeyShortLabelEs', () => {
  it('abbreviates the month for chart axes', () => {
    expect(formatMonthKeyShortLabelEs('2026-10')).toBe('Oct');
    expect(formatMonthKeyShortLabelEs('2027-01')).toBe('Ene');
    expect(formatMonthKeyShortLabelEs('2026-09')).toBe('Sep');
    expect(() => formatMonthKeyShortLabelEs('2026-00')).toThrow(RangeError);
  });
});
