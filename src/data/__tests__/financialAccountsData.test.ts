/**
 * Data layer of credit cards and debit accounts (ADR 0034): Zod mappers, security rules,
 * in-memory repository and the offline queue operations.
 */

import {
  monthEntrySchema,
  parseFinancialAccountFromFirestore,
  serializeFinancialAccountForFirestore,
  serializeMonthEntryForFirestore,
} from '../mappers/firestoreSchemas';
import {
  FirestoreBudgetRepository,
  InMemoryBudgetRepository,
} from '../repositories/budgetRepository';
import type { FinancialAccount, MonthEntry } from '../../domain';
import { isEquivalentCloudAccount } from '../../platform/storage/accountCache';
import {
  clearOfflineWriteQueue,
  drainOfflineWriteQueue,
  enqueueOfflineWrite,
  loadOfflineWriteQueue,
} from '../../platform/storage/offlineWriteQueue';

const VISA: FinancialAccount = {
  id: 'acc_visa',
  type: 'credit',
  name: 'Visa Oro',
  institution: 'Banco Uno',
  lastFourDigits: '1234',
  openingBalance: 200_000,
  openingMonthKey: '2026-10',
  creditLimit: 3_000_000,
  statementDay: 15,
  paymentDueDay: 30,
  monthlyInterestRate: 2.1,
};

const ENTRY: MonthEntry = {
  id: '2026-10_exp_mercado',
  monthKey: '2026-10',
  conceptId: 'exp_mercado',
  conceptName: 'Mercado',
  type: 'expense',
  group: 'variable',
  plannedAmount: 100_000,
  actualAmount: 100_000,
  status: 'completed',
  completedAt: '2026-10-05',
  accountId: 'acc_visa',
  accountRole: 'purchase',
};

describe('data/accounts — Firestore mappers and rules (ADR 0034)', () => {
  it('serializes and parses a valid account, stripping undefined fields', () => {
    const serialized = serializeFinancialAccountForFirestore({ ...VISA, debitKind: undefined });
    expect(serialized).toEqual(VISA);
    expect('debitKind' in serialized).toBe(false);
    expect(parseFinancialAccountFromFirestore(serialized)).toEqual(VISA);
    expect(
      parseFinancialAccountFromFirestore({
        id: 'acc_debit',
        type: 'debit',
        name: 'Nómina',
        institution: 'Banco',
        openingBalance: 0,
        openingMonthKey: '2026-10',
        debitKind: 'checking',
      }).debitKind
    ).toBe('checking');
  });

  it.each([
    ['negative opening balance', { openingBalance: -1 }],
    ['decimal opening balance', { openingBalance: 10.5 }],
    ['invalid type', { type: 'loan' }],
    ['invalid month key', { openingMonthKey: '2026-13' }],
    ['three last digits', { lastFourDigits: '123' }],
    ['letters as last digits', { lastFourDigits: 'abcd' }],
    ['statement day 0', { statementDay: 0 }],
    ['payment day 32', { paymentDueDay: 32 }],
    ['fractional day', { statementDay: 15.5 }],
    ['interest above 100', { monthlyInterestRate: 101 }],
    ['empty name', { name: '' }],
    ['invalid debit kind', { debitKind: 'payroll' }],
  ])('rejects an account with %s', (_label, overrides) => {
    expect(() => serializeFinancialAccountForFirestore({ ...VISA, ...overrides } as never)).toThrow();
  });

  it('accepts the account link on entries and rejects an unknown role', () => {
    expect(serializeMonthEntryForFirestore(ENTRY)).toMatchObject({
      accountId: 'acc_visa',
      accountRole: 'purchase',
    });
    expect(monthEntrySchema.safeParse({ ...ENTRY, accountRole: 'refund' }).success).toBe(false);
    expect(monthEntrySchema.safeParse({ ...ENTRY, accountId: '' }).success).toBe(false);
    const { accountId: _id, accountRole: _role, ...unlinked } = ENTRY;
    expect(monthEntrySchema.safeParse(unlinked).success).toBe(true);
  });

  it('declares the financialAccounts collection and the entry link in firestore.rules', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as { readFileSync: (p: string, enc: string) => string };
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('match /financialAccounts/{accountId}');
    expect(rules).toContain('function isValidFinancialAccount(data, accountId)');
    expect(rules).toContain("data.type in ['credit', 'debit']");
    expect(rules).toContain("data.lastFourDigits.matches('^[0-9]{4}$')");
    expect(rules).toContain("isOptionalAccountDay(data, 'statementDay')");
    expect(rules).toContain("isOptionalAccountDay(data, 'paymentDueDay')");
    expect(rules).toContain('request.resource.data.type == resource.data.type');
    // Entries may carry the link, with a closed set of roles.
    expect(rules).toContain("'accountId',");
    expect(rules).toContain("'accountRole',");
    expect(rules).toContain("data.accountRole in ['purchase', 'payment']");
    // Every field the schema can write is allowed by the rules.
    const accountFields = Object.keys(VISA).concat(['debitKind']);
    for (const field of accountFields) {
      expect(rules).toContain(`'${field}'`);
    }
  });
});

describe('data/accounts — repositories and offline queue', () => {
  const uid = 'uid_accounts_data';

  afterEach(() => {
    clearOfflineWriteQueue(uid);
    jest.restoreAllMocks();
  });

  it('saves, lists and deletes accounts in the in-memory repository and clears them on reset', async () => {
    const repo = new InMemoryBudgetRepository();
    await repo.saveFinancialAccount(uid, VISA);
    let account = await repo.loadFullCloudAccount('local-owner');
    expect(account.financialAccounts).toEqual([VISA]);

    await repo.saveFinancialAccount(uid, { ...VISA, name: 'Visa Platino' });
    account = await repo.loadFullCloudAccount('local-owner');
    expect(account.financialAccounts?.[0]?.name).toBe('Visa Platino');

    await repo.deleteFinancialAccount(uid, VISA.id);
    expect((await repo.loadFullCloudAccount('local-owner')).financialAccounts).toEqual([]);

    await repo.saveFinancialAccount(uid, VISA);
    await repo.resetFullAccountInCloud('local-owner', '2027-01');
    expect((await repo.loadFullCloudAccount('local-owner')).financialAccounts).toEqual([]);
  });

  it('replays queued account writes and merges repeated writes of the same account', async () => {
    enqueueOfflineWrite(uid, { type: 'save_financial_account', payload: { account: VISA } });
    enqueueOfflineWrite(uid, {
      type: 'save_financial_account',
      payload: { account: { ...VISA, name: 'Visa 2' } },
    });
    expect(loadOfflineWriteQueue(uid)).toHaveLength(1);
    enqueueOfflineWrite(uid, { type: 'delete_financial_account', payload: { accountId: 'acc_other' } });
    expect(loadOfflineWriteQueue(uid)).toHaveLength(2);

    const save = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveFinancialAccount')
      .mockResolvedValue();
    const remove = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteFinancialAccount')
      .mockResolvedValue();
    const repo = Object.create(FirestoreBudgetRepository.prototype) as FirestoreBudgetRepository;

    const result = await drainOfflineWriteQueue(uid, repo);

    expect(result).toEqual({ processed: 2, remaining: 0, discarded: 0 });
    expect(save).toHaveBeenCalledWith(uid, expect.objectContaining({ name: 'Visa 2' }));
    expect(remove).toHaveBeenCalledWith(uid, 'acc_other');
  });

  it('treats a cached account without the accounts field as equal to one with none', () => {
    const base = {
      activeMonthKey: '2026-10',
      availableMonths: ['2026-10'],
      concepts: [],
      entries: [],
      debtsByMonth: {},
      debtPayments: [],
      savingsBucketsByMonth: {},
      provisionPlan: { items: [], recurringMonthlyTotalCop: 0, totalWithTargetGoalCop: 0 },
      closedSnapshots: {},
    };
    expect(isEquivalentCloudAccount(base, { ...base, financialAccounts: [] })).toBe(true);
    expect(isEquivalentCloudAccount(base, { ...base, financialAccounts: [VISA] })).toBe(false);
    expect(
      isEquivalentCloudAccount(
        { ...base, financialAccounts: [VISA] },
        { ...base, financialAccounts: [{ ...VISA, name: 'Otra' }] }
      )
    ).toBe(false);
  });
});
