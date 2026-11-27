import { buildSampleWorkspace } from '../../../data/sample/sampleWorkspace';
import {
  calculateChecklistProgress,
  completeExistingMovement,
  Concept,
  deleteMovement,
  ensureMonthPlan,
  getAvailableConcepts,
  getDeterministicEntryId,
  isConceptActiveInMonth,
  MonthEntry,
  registerMovement,
  toggleMovementStatus,
  uncompleteMovement,
} from '../../index';

/** The example budget of the showcase mode, in the month the tests pin. */
const sample = buildSampleWorkspace();

const concepts = sample.concepts as unknown as Concept[];
const octoberEntries = sample.entries as unknown as MonthEntry[];

describe('domain/checklist — Monthly Checklist Core Rules', () => {
  it('validates deterministic entry IDs and rejects empty conceptId', () => {
    expect(getDeterministicEntryId('2026-10', 'inc_salary')).toBe(
      '2026-10_inc_salary'
    );
    expect(() => getDeterministicEntryId('2026-10', '   ')).toThrow(TypeError);
  });

  it('hides completed single-occurrence concepts in October 2026 (Salario, Parqueadero, etc.)', () => {
    const availableIncomes = getAvailableConcepts(concepts, octoberEntries, '2026-10', 'income');
    const availableExpenses = getAvailableConcepts(concepts, octoberEntries, '2026-10', 'expense');

    // Salario is completed in Oct 2026 -> hidden; Prima is pending & Otros ingresos is repeatable -> shown
    expect(availableIncomes.map((c) => c.id)).toEqual([
      'inc_bonus',
      'inc_other',
    ]);

    // Completed expenses (vehículo, Cuota de préstamo, Parqueadero, Gasolina, Tarjeta de crédito) are hidden
    expect(availableExpenses.map((c) => c.id)).toEqual([
      'exp_phone_plan',
      'exp_insurance',
      'exp_internet',
      'exp_subscriptions',
      'exp_gym',
      'exp_other',
    ]);
  });

  it('makes a completed concept reappear in the following month (2026-11) and across year rollover (2026-12 -> 2027-01)', () => {
    const novEntries = ensureMonthPlan('2026-11', concepts, octoberEntries);
    const availableNovIncomes = getAvailableConcepts(concepts, novEntries, '2026-11', 'income');
    const availableNovExpenses = getAvailableConcepts(concepts, novEntries, '2026-11', 'expense');

    expect(availableNovIncomes.map((c) => c.id)).toContain('inc_salary');
    expect(availableNovExpenses.map((c) => c.id)).toContain('exp_parking');

    const jan2027Entries = ensureMonthPlan('2027-01', concepts, novEntries);
    const availableJanIncomes = getAvailableConcepts(concepts, jan2027Entries, '2027-01', 'income');
    expect(availableJanIncomes.map((c) => c.id)).toContain('inc_salary');
  });

  it('makes a completed concept reappear immediately when unchecked or deleted in the same month', () => {
    const afterUncheck = uncompleteMovement(
      octoberEntries,
      '2026-10_exp_parking'
    );
    const availableAfterUncheck = getAvailableConcepts(
      concepts,
      afterUncheck,
      '2026-10',
      'expense'
    );
    expect(availableAfterUncheck.map((c) => c.id)).toContain('exp_parking');

    const afterDelete = deleteMovement(
      octoberEntries,
      concepts,
      '2026-10_inc_salary'
    );
    const availableIncomesAfterDelete = getAvailableConcepts(
      concepts,
      afterDelete,
      '2026-10',
      'income'
    );
    expect(availableIncomesAfterDelete.map((c) => c.id)).toContain('inc_salary');
  });

  it('keeps allowMultiplePerMonth concepts ("Otro" and "Otros ingresos") ALWAYS available even after multiple completions', () => {
    let currentEntries = [...octoberEntries];

    currentEntries = registerMovement(currentEntries, concepts, {
      monthKey: '2026-10',
      conceptId: 'exp_other',
      actualAmount: 45_000,
      completedAt: '2026-10-28',
      note: 'Almuerzo especial',
      customEntryId: '2026-10_exp_other_1',
    });

    currentEntries = registerMovement(currentEntries, concepts, {
      monthKey: '2026-10',
      conceptId: 'exp_other',
      actualAmount: 30_000,
      completedAt: '2026-10-29',
      note: 'Taxi',
      customEntryId: '2026-10_exp_other_2',
    });

    const availableExpenses = getAvailableConcepts(concepts, currentEntries, '2026-10', 'expense');
    expect(availableExpenses.map((c) => c.id)).toContain('exp_other');

    // Deleting a repeatable movement removes that specific row
    const afterDeletingOne = deleteMovement(currentEntries, concepts, '2026-10_exp_other_1');
    expect(afterDeletingOne.some((e) => e.id === '2026-10_exp_other_1')).toBe(false);
    expect(afterDeletingOne.some((e) => e.id === '2026-10_exp_other_2')).toBe(true);
  });

  it('enforces idempotency and offline duplicate resolution in ensureMonthPlan', () => {
    const firstRun = ensureMonthPlan('2026-12', concepts, []);
    const secondRun = ensureMonthPlan('2026-12', concepts, firstRun);
    expect(secondRun).toEqual(firstRun);

    // Simulate offline concurrent creation where one replica is pending and another is completed
    const pendingReplica: MonthEntry = {
      id: '2026-12_inc_salary',
      monthKey: '2026-12',
      conceptId: 'inc_salary',
      conceptName: 'Salario',
      type: 'income',
      group: 'fixed',
      plannedAmount: 4_000_000,
      actualAmount: 4_000_000,
      status: 'pending',
    };
    const completedReplica: MonthEntry = {
      ...pendingReplica,
      status: 'completed',
      completedAt: '2026-12-20',
    };

    const deduplicated = ensureMonthPlan('2026-12', concepts, [pendingReplica, completedReplica]);
    const salarioEntries = deduplicated.filter((e) => e.id === '2026-12_inc_salary');
    expect(salarioEntries).toHaveLength(1);
    expect(salarioEntries[0]?.status).toBe('completed');
  });

  it('reaches "Mes completo" (12/12, 100%) when all pending non-repeatable concepts are completed', () => {
    let entries = [...octoberEntries];
    const pendingIds = [
      'inc_bonus',
      'exp_phone_plan',
      'exp_insurance',
      'exp_internet',
      'exp_subscriptions',
      'exp_gym',
    ];

    for (const conceptId of pendingIds) {
      entries = registerMovement(entries, concepts, {
        monthKey: '2026-10',
        conceptId,
        completedAt: '2026-10-30',
      });
    }

    const progress = calculateChecklistProgress(concepts, entries, '2026-10');
    expect(progress).toEqual({
      monthKey: '2026-10',
      completedCount: 12,
      totalTrackableCount: 12,
      pendingCount: 0,
      completionRatio: 1,
      completionPercentage: 100,
      isMonthComplete: true,
    });
  });

  it('handles archived concepts, unknown concepts, and duplicate single-occurrence completion attempts', () => {
    const archivedConcept: Concept = {
      ...concepts[0]!,
      id: 'inc_archived',
      archived: true,
    };
    expect(isConceptActiveInMonth(archivedConcept, '2026-10')).toBe(false);

    expect(() =>
      registerMovement(octoberEntries, concepts, {
        monthKey: '2026-10',
        conceptId: 'non_existent',
        completedAt: '2026-10-28',
      })
    ).toThrow(/not found/);

    expect(() =>
      registerMovement(octoberEntries, concepts, {
        monthKey: '2026-10',
        conceptId: 'inc_salary',
        completedAt: '2026-10-28',
      })
    ).toThrow(/already completed/);

    // Registering a movement for a month that didn't call ensureMonthPlan yet creates the entry directly
    const directEntries = registerMovement([], concepts, {
      monthKey: '2026-11',
      conceptId: 'inc_salary',
      completedAt: '2026-11-20',
      note: 'Pago directo',
    });
    expect(directEntries).toHaveLength(1);
    expect(directEntries[0]?.status).toBe('completed');

    // Deleting a non-existent entry returns a copy without mutating
    expect(deleteMovement(directEntries, concepts, 'missing_id')).toEqual(directEntries);

    // Empty month progress has ratio 1 and isMonthComplete false
    const emptyProgress = calculateChecklistProgress(concepts, [], '2026-11');
    expect(emptyProgress.completionRatio).toBe(1);
    expect(emptyProgress.isMonthComplete).toBe(false);
  });

  it('toggleMovementStatus toggles movements back and forth in-place without duplicating entries', () => {
    // 1. Register a new repeatable movement (e.g. exp_other)
    const registered = registerMovement(octoberEntries, concepts, {
      monthKey: '2026-10',
      conceptId: 'exp_other',
      actualAmount: 75_000,
      completedAt: '2026-10-29',
      customEntryId: '2026-10_exp_other_test',
    });
    const initialCount = registered.length;
    const initialItem = registered.find((e) => e.id === '2026-10_exp_other_test')!;
    expect(initialItem.status).toBe('completed');
    expect(initialItem.actualAmount).toBe(75_000);

    // 2. Uncheck it -> becomes pending, preserves amount
    const unchecked = toggleMovementStatus(registered, '2026-10_exp_other_test');
    expect(unchecked).toHaveLength(initialCount);
    const pendingItem = unchecked.find((e) => e.id === '2026-10_exp_other_test')!;
    expect(pendingItem.status).toBe('pending');
    expect(pendingItem.actualAmount).toBe(75_000);

    // 3. Check it again -> becomes completed, NEVER duplicates
    const rechecked = toggleMovementStatus(unchecked, '2026-10_exp_other_test');
    expect(rechecked).toHaveLength(initialCount);
    const completedAgain = rechecked.find((e) => e.id === '2026-10_exp_other_test')!;
    expect(completedAgain.status).toBe('completed');
    expect(completedAgain.actualAmount).toBe(75_000);

    // 4. Repeated toggles NEVER increase length
    let current = rechecked;
    for (let i = 0; i < 6; i++) {
      current = toggleMovementStatus(current, '2026-10_exp_other_test');
      expect(current).toHaveLength(initialCount);
    }
  });
});
