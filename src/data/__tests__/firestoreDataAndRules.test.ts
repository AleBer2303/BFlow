import {
  calculateFunfamiDebtSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
} from '../../domain';
import { resolveFirebaseEnvironment } from '../firebase/firebaseConfig';
import {
  parseConceptFromFirestore,
  parseDebtFromFirestore,
  parseDebtPaymentFromFirestore,
  parseMonthEntryFromFirestore,
  parseSavingsBucketFromFirestore,
  serializeConceptForFirestore,
  serializeDebtPaymentForFirestore,
  serializeMonthEntryForFirestore,
  stripUndefinedFields,
} from '../mappers/firestoreSchemas';
import { InMemoryBudgetRepository } from '../repositories/budgetRepository';
import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';

describe('Phase 3: Firebase Config, Zod Mappers, Idempotent Seed, Repository & Security Rules', () => {
  it('resolves Firebase environment for bflow-deaeb by default and supports overrides', () => {
    const defaultEnv = resolveFirebaseEnvironment({});
    expect(defaultEnv.isConfigured).toBe(true);
    expect(defaultEnv.options.projectId).toBe('bflow-deaeb');
    expect(defaultEnv.options.authDomain).toBe('bflow-deaeb.firebaseapp.com');

    const placeholderEnv = resolveFirebaseEnvironment({
      EXPO_PUBLIC_FIREBASE_API_KEY: 'your_api_key_here',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'your-project-id',
      EXPO_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
    });
    expect(placeholderEnv.isConfigured).toBe(false);
  });

  it('builds and validates the complete October 2026 seed payload against Zod schemas', () => {
    const seed = buildOctober2026SeedPayload();

    expect(seed.monthKey).toBe('2026-10');
    expect(seed.concepts).toHaveLength(14);
    expect(seed.entries).toHaveLength(12);
    expect(seed.debts).toHaveLength(2);
    expect(seed.debtPayments).toHaveLength(1);
    expect(seed.savingsBuckets).toHaveLength(2);
    expect(seed.provisionPlan.items).toHaveLength(9);

    const budget = calculateMonthlyBudgetSummary(seed.entries, '2026-10');
    expect(budget.receivedIncome).toBe(4_000_000);
    expect(budget.paidExpenses).toBe(2_920_000);
    expect(budget.pendingExpenses).toBe(450_000);
    expect(budget.netCashFlow).toBe(1_080_000);

    const debtsSummary = calculateFunfamiDebtSummary(
      seed.debts,
      seed.entries,
      '2026-10',
      seed.debtPayments
    );
    expect(debtsSummary.totalRemainingDebt).toBe(6_200_000);
  });

  it('enforces safe COP integers, valid monthKey, and strips undefined fields in Firestore mappers', () => {
    const cleaned = stripUndefinedFields({
      id: '2026-10_exp_smart_fit',
      note: undefined,
      nested: { a: 1, b: undefined },
    });
    expect('note' in cleaned).toBe(false);
    expect('b' in (cleaned.nested as Record<string, unknown>)).toBe(false);

    // Reject float or negative amounts
    expect(() =>
      parseMonthEntryFromFirestore({
        id: '2026-10_exp_smart_fit',
        monthKey: '2026-10',
        conceptId: 'exp_smart_fit',
        conceptName: 'Smart Fit',
        type: 'expense',
        group: 'variable',
        plannedAmount: 100000.5,
        actualAmount: 100000,
        status: 'pending',
      })
    ).toThrow(/safe COP integer/);

    expect(() =>
      parseDebtFromFirestore({
        id: 'debt_cb300f_moto',
        groupKey: 'FUNFAMI',
        name: 'CB300F - MOTO',
        lender: 'FUNFAMI',
        openingBalance: -100,
        monthKey: '2026-10',
      })
    ).toThrow(/non-negative safe COP integer/);

    // Reject invalid monthKey
    expect(() =>
      parseDebtFromFirestore({
        id: 'debt_cb300f_moto',
        groupKey: 'FUNFAMI',
        name: 'CB300F - MOTO',
        lender: 'FUNFAMI',
        openingBalance: 4400000,
        monthKey: '2026-13',
      })
    ).toThrow(/Invalid monthKey/);

    // Reject mismatched debtPayment totalApplied != principalAmount + interestAmount
    expect(() =>
      parseDebtPaymentFromFirestore({
        id: 'dp_1',
        entryId: '2026-10_exp_cuota_funfami',
        monthKey: '2026-10',
        debtId: 'debt_cb300f_moto',
        principalAmount: 1800000,
        interestAmount: 0,
        totalApplied: 1500000,
        active: true,
      })
    ).toThrow(/totalApplied must equal principalAmount \+ interestAmount/);

    // Roundtrip valid serialization
    const seed = buildOctober2026SeedPayload();
    const serializedConcept = serializeConceptForFirestore(seed.concepts[0]!);
    expect(parseConceptFromFirestore(serializedConcept).id).toBe(seed.concepts[0]!.id);

    const serializedEntry = serializeMonthEntryForFirestore(seed.entries[0]!);
    expect(parseMonthEntryFromFirestore(serializedEntry).id).toBe(seed.entries[0]!.id);

    const serializedPayment = serializeDebtPaymentForFirestore(seed.debtPayments[0]!);
    expect(parseDebtPaymentFromFirestore(serializedPayment).totalApplied).toBe(1_800_000);

    expect(parseSavingsBucketFromFirestore(seed.savingsBuckets[0]!).openingBalance).toBe(
      1_600_000
    );
  });

  it('performs idempotent seeding, atomic Cuota FUNFAMI toggle, and month rollover in BudgetRepository', async () => {
    const repo = new InMemoryBudgetRepository(false);

    const firstSeed = await repo.seedOctober2026IfEmpty('user_123');
    expect(firstSeed.seeded).toBe(true);

    const secondSeed = await repo.seedOctober2026IfEmpty('user_123');
    expect(secondSeed.seeded).toBe(false);

    const workspace = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(workspace.entries).toHaveLength(12);

    // Uncomplete Cuota FUNFAMI -> debt payment becomes inactive -> total debt returns to $8.000.000
    const uncompleteResult = await repo.toggleEntryCompletion(
      'user_123',
      '2026-10_exp_cuota_funfami',
      '2026-10'
    );
    expect(uncompleteResult.updatedEntry.status).toBe('pending');
    expect(uncompleteResult.updatedDebtPayment?.active).toBe(false);

    const afterUncomplete = await repo.loadMonthWorkspace('user_123', '2026-10');
    const debtSummaryPending = calculateFunfamiDebtSummary(
      afterUncomplete.debts,
      afterUncomplete.entries,
      '2026-10',
      afterUncomplete.debtPayments
    );
    expect(debtSummaryPending.totalRemainingDebt).toBe(8_000_000);

    // Complete Cuota FUNFAMI again -> debt payment becomes active -> total debt drops to $6.200.000
    const completeResult = await repo.toggleEntryCompletion(
      'user_123',
      '2026-10_exp_cuota_funfami',
      '2026-10',
      { actualAmount: 1_800_000, completedAtDateIso: '2026-10-27' }
    );
    expect(completeResult.updatedEntry.status).toBe('completed');
    expect(completeResult.updatedDebtPayment?.active).toBe(true);

    // Resetting non-repeatable Cuota FUNFAMI via deleteOrResetEntry deactivates linked DebtPayment
    await repo.deleteOrResetEntry('user_123', '2026-10_exp_cuota_funfami');
    const afterReset = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(
      afterReset.entries.find((e) => e.id === '2026-10_exp_cuota_funfami')?.status
    ).toBe('pending');
    expect(afterReset.debtPayments[0]?.active).toBe(false);

    // Re-complete Cuota FUNFAMI via addMonthEntry so October closes with $6.200.000 remaining debt
    await repo.addMonthEntry('user_123', {
      monthKey: '2026-10',
      conceptId: 'exp_cuota_funfami',
      actualAmount: 1_800_000,
      completedAt: '2026-10-27',
    });

    // Add repeatable variable expense ("exp_otro")
    const addedVariable = await repo.addMonthEntry('user_123', {
      monthKey: '2026-10',
      conceptId: 'exp_otro',
      actualAmount: 50_000,
      completedAt: '2026-10-28',
      note: 'Lavado moto',
    });
    expect(addedVariable.conceptId).toBe('exp_otro');
    expect(addedVariable.actualAmount).toBe(50_000);

    // Close October 2026 and rollover to November 2026
    const closeResult = await repo.closeMonth('user_123', '2026-10');
    expect(closeResult.nextMonthKey).toBe('2026-11');
    expect(closeResult.snapshot.totalClosingDebt).toBe(6_200_000);

    // Historical October 2026 workspace must preserve its original opening balances (no double-subtraction)
    const octClosedWorkspace = await repo.loadMonthWorkspace('user_123', '2026-10');
    const octClosedDebtSummary = calculateFunfamiDebtSummary(
      octClosedWorkspace.debts,
      octClosedWorkspace.entries,
      '2026-10',
      octClosedWorkspace.debtPayments
    );
    expect(octClosedDebtSummary.openingTotalDebt).toBe(8_000_000);
    expect(octClosedDebtSummary.totalRemainingDebt).toBe(6_200_000);

    const novWorkspace = await repo.loadMonthWorkspace('user_123', '2026-11');
    // Prima is excluded in November (specific_months [6, 12]), so 11 non-repeatable entries
    expect(novWorkspace.entries).toHaveLength(11);
    const novBudget = calculateMonthlyBudgetSummary(novWorkspace.entries, '2026-11');
    const novSavings = calculateMonthlySavingsSummary(
      novWorkspace.savingsBuckets,
      novWorkspace.concepts,
      novWorkspace.entries,
      novBudget,
      '2026-11'
    );
    expect(novSavings.moto.openingBalance).toBe(2_300_000);

    // Test new persistent cloud methods: saveOrUpdateEntry, saveCustomConceptAndEntry, deleteEntryCompletely, reopenMonthInCloud
    const sampleEntry = octClosedWorkspace.entries[0]!;
    await repo.saveOrUpdateEntry('user_123', {
      ...sampleEntry,
      conceptName: 'Salario Modificado',
      actualAmount: 4_500_000,
    });
    const reloaded = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(reloaded.entries.find((e) => e.id === sampleEntry.id)?.actualAmount).toBe(4_500_000);

    // Save custom concept and entry
    const customConcept = {
      ...octClosedWorkspace.concepts[0]!,
      id: 'custom_freelance',
      name: 'Freelance App',
      defaultAmount: 800_000,
    };
    const customEntry = {
      ...sampleEntry,
      id: '2026-10_custom_freelance',
      conceptId: 'custom_freelance',
      conceptName: 'Freelance App',
      actualAmount: 800_000,
    };
    await repo.saveCustomConceptAndEntry('user_123', customConcept, customEntry);
    const withCustom = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(withCustom.concepts.find((c) => c.id === 'custom_freelance')).toBeTruthy();
    expect(withCustom.entries.find((e) => e.id === '2026-10_custom_freelance')).toBeTruthy();

    // Update concept
    await repo.saveConcept('user_123', {
      ...customConcept,
      name: 'Freelance App Pro',
      defaultAmount: 950_000,
    });
    const withUpdatedConcept = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(withUpdatedConcept.concepts.find((c) => c.id === 'custom_freelance')?.name).toBe(
      'Freelance App Pro'
    );

    // Delete concept
    await repo.deleteConcept('user_123', 'custom_freelance');
    const afterDeleteConcept = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(afterDeleteConcept.concepts.find((c) => c.id === 'custom_freelance')).toBeUndefined();

    // Save savings bucket opening balance
    await repo.saveSavingsBucket('user_123', 'moto', 1_700_000, '2026-10');
    const afterBucketSave = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(afterBucketSave.savingsBuckets.find((b) => b.id === 'moto')?.openingBalance).toBe(
      1_700_000
    );

    // Delete custom entry
    await repo.deleteEntryCompletely('user_123', '2026-10_custom_freelance');
    const afterDelete = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(afterDelete.entries.find((e) => e.id === '2026-10_custom_freelance')).toBeUndefined();

    // Reopen closed month
    await repo.reopenMonthInCloud('user_123', '2026-10');
    const afterReopen = await repo.loadMonthWorkspace('user_123', '2026-10');
    expect(afterReopen.closedSnapshot).toBeUndefined();
  });

  it('validates that firestore.rules enforces strict owner isolation, COP integers, and all 7 subcollections', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as { readFileSync: (p: string, enc: string) => string };
    const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

    expect(rulesContent).toContain("rules_version = '2';");
    expect(rulesContent).toContain('request.auth != null');
    expect(rulesContent).toContain('isAuthenticated() && request.auth.uid == uid');
    expect(rulesContent).toContain('val is int && val >= 0');
    expect(rulesContent).toContain('^\\\\d{4}-(0[1-9]|1[0-2])$');
    expect(rulesContent).toContain('match /concepts/{conceptId}');
    expect(rulesContent).toContain('match /entries/{entryId}');
    expect(rulesContent).toContain('match /debts/{debtId}');
    expect(rulesContent).toContain("'monthlyInterestRate',");
    expect(rulesContent).toContain('data.monthlyInterestRate >= 0 &&');
    expect(rulesContent).toContain('data.monthlyInterestRate <= 100');
    expect(rulesContent).toContain('match /debtPayments/{paymentId}');
    expect(rulesContent).toContain('match /savingsBuckets/{bucketId}');
    expect(rulesContent).toContain('match /provisionPlans/{planId}');
    expect(rulesContent).toContain('match /monthSnapshots/{snapshotId}');
    expect(rulesContent).toContain('request.resource.data.monthKey == resource.data.monthKey');
    expect(rulesContent).toContain('request.resource.data.entryId == resource.data.entryId');
    expect(rulesContent).toContain('allow read, write: if false;');
  });
});
