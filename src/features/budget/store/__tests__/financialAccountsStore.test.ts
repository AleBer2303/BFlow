/**
 * Credit cards and debit accounts in the store (ADR 0034): CRUD, links from movements, and
 * the rollback / offline queue of their cloud writes.
 */

import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import { calculateFinancialAccountsSummary } from '../../../../domain';
import { DEMO_USER, type BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import {
  cancelPendingPersistedAccountSave,
  clearPersistedAccount,
  flushPendingPersistedAccount,
} from '../../../../platform/storage/accountCache';
import {
  clearOfflineWriteQueue,
  loadOfflineWriteQueue,
} from '../../../../platform/storage/offlineWriteQueue';
import { buildFinancialAccount } from '../slices/createAccountsSlice';
import { useBudgetStore } from '../useBudgetStore';

const CLOUD_USER: BFlowAuthUser = {
  uid: 'uid_cloud_test_accounts',
  email: 'demo@bflow.example',
  displayName: 'Demo',
  authProvider: 'password',
  provider: 'firebase',
};

function permanentError(): Error {
  return Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });
}

async function createVisa() {
  const account = await useBudgetStore.getState().createFinancialAccount('2026-10', {
    type: 'credit',
    name: '  Visa Oro ',
    institution: ' Banco Uno ',
    lastFourDigits: '1234',
    openingBalance: 200_000,
    creditLimit: 3_000_000,
    statementDay: 15,
    paymentDueDay: 30,
    monthlyInterestRate: 2.1,
    debitKind: 'checking',
  });
  if (!account) throw new Error('Expected the account to be created');
  return account;
}

async function createNomina() {
  const account = await useBudgetStore.getState().createFinancialAccount('2026-10', {
    type: 'debit',
    name: 'Cuenta nómina',
    institution: 'Banco Dos',
    openingBalance: 1_000_000,
    debitKind: 'savings',
    creditLimit: 9_999,
  });
  if (!account) throw new Error('Expected the account to be created');
  return account;
}

describe('store/accounts — credit cards and debit accounts (ADR 0034)', () => {
  function clearCloudUserStorage() {
    cancelPendingPersistedAccountSave(CLOUD_USER.uid);
    clearPersistedAccount(CLOUD_USER.uid);
    clearOfflineWriteQueue(CLOUD_USER.uid);
  }

  beforeEach(() => {
    clearCloudUserStorage();
    useBudgetStore.setState({ authUser: DEMO_USER, needsOnboarding: false });
    useBudgetStore.getState().resetToSampleWorkspace();
  });

  afterEach(() => {
    clearCloudUserStorage();
    jest.restoreAllMocks();
  });

  it('starts without accounts and creates a credit card keeping only credit fields', async () => {
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
    const visa = await createVisa();

    expect(visa).toMatchObject({
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
    });
    expect(visa.id).toMatch(/^acc_/);
    expect('debitKind' in visa).toBe(false);
    expect(useBudgetStore.getState().financialAccounts).toEqual([visa]);
  });

  it('creates a debit account keeping only debit fields', async () => {
    const nomina = await createNomina();
    expect(nomina).toMatchObject({ type: 'debit', debitKind: 'savings', openingBalance: 1_000_000 });
    expect('creditLimit' in nomina).toBe(false);
  });

  it('ignores an account without name or institution', async () => {
    const result = await useBudgetStore.getState().createFinancialAccount('2026-10', {
      type: 'debit',
      name: '  ',
      institution: 'Banco',
      openingBalance: 0,
    });
    expect(result).toBeNull();
    expect(useBudgetStore.getState().financialAccounts).toHaveLength(0);
  });

  it('updates an account without changing its type or opening month, and deletes it', async () => {
    const visa = await createVisa();
    await useBudgetStore.getState().updateFinancialAccount(visa.id, {
      name: 'Visa Platino',
      institution: 'Banco Uno',
      openingBalance: 0,
      creditLimit: 5_000_000,
    });

    const updated = useBudgetStore.getState().financialAccounts[0];
    expect(updated).toMatchObject({
      id: visa.id,
      type: 'credit',
      name: 'Visa Platino',
      openingMonthKey: '2026-10',
      creditLimit: 5_000_000,
    });
    // Cleared optional fields are dropped.
    expect(updated?.statementDay).toBeUndefined();
    expect(updated?.lastFourDigits).toBeUndefined();

    await useBudgetStore.getState().updateFinancialAccount('acc_missing', {
      name: 'X',
      institution: 'Y',
      openingBalance: 0,
    });
    expect(useBudgetStore.getState().financialAccounts).toHaveLength(1);

    await useBudgetStore.getState().deleteFinancialAccount(visa.id);
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
    await useBudgetStore.getState().deleteFinancialAccount(visa.id);
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
  });

  it('links a new custom movement to a credit card and counts it in the month summary', async () => {
    const visa = await createVisa();
    await useBudgetStore.getState().createCustomConceptAndMovement({
      monthKey: '2026-10',
      name: 'Mercado con tarjeta',
      type: 'expense',
      group: 'variable',
      amount: 150_000,
      accountId: visa.id,
    });
    await useBudgetStore.getState().createCustomConceptAndMovement({
      monthKey: '2026-10',
      name: 'Pago Visa',
      type: 'expense',
      group: 'variable',
      amount: 120_000,
      accountId: visa.id,
      accountRole: 'payment',
    });

    const state = useBudgetStore.getState();
    const purchase = state.entries.find((e) => e.conceptName === 'Mercado con tarjeta');
    const payment = state.entries.find((e) => e.conceptName === 'Pago Visa');
    expect(purchase).toMatchObject({ accountId: visa.id, accountRole: 'purchase' });
    expect(payment).toMatchObject({ accountId: visa.id, accountRole: 'payment' });

    const summary = calculateFinancialAccountsSummary(
      state.financialAccounts,
      state.entries,
      '2026-10'
    );
    expect(summary.credit).toMatchObject({
      spentThisMonth: 150_000,
      paidThisMonth: 120_000,
      closingBalance: 230_000,
    });
  });

  it('links a completed existing movement to a debit account and edits or removes the link', async () => {
    const nomina = await createNomina();
    const state = useBudgetStore.getState();
    const pendingIncome = state.entries.find(
      (e) => e.monthKey === '2026-10' && e.type === 'income' && e.status === 'pending'
    );
    const concept = state.concepts.find((c) => c.id === pendingIncome?.conceptId);
    if (!pendingIncome || !concept || concept.allowMultiplePerMonth) {
      throw new Error('Expected a pending single income in the October seed');
    }

    await useBudgetStore.getState().addOrCompleteMovement({
      monthKey: '2026-10',
      conceptId: pendingIncome.conceptId,
      actualAmount: 500_000,
      completedAt: '2026-10-10',
      accountId: nomina.id,
      accountRole: 'payment',
    });
    let entry = useBudgetStore.getState().entries.find((e) => e.id === pendingIncome.id);
    expect(entry).toMatchObject({ status: 'completed', accountId: nomina.id });
    expect(entry && 'accountRole' in entry).toBe(false);

    const summary = calculateFinancialAccountsSummary(
      useBudgetStore.getState().financialAccounts,
      useBudgetStore.getState().entries,
      '2026-10'
    );
    expect(summary.debit).toEqual({
      spentThisMonth: 0,
      paidThisMonth: 500_000,
      closingBalance: 1_500_000,
    });

    // Editing without touching the link keeps it.
    await useBudgetStore.getState().editEntry(pendingIncome.id, {
      conceptName: entry?.conceptName ?? 'Ingreso',
      actualAmount: 600_000,
    });
    entry = useBudgetStore.getState().entries.find((e) => e.id === pendingIncome.id);
    expect(entry?.accountId).toBe(nomina.id);

    await useBudgetStore.getState().editEntry(pendingIncome.id, {
      conceptName: entry?.conceptName ?? 'Ingreso',
      actualAmount: 600_000,
      accountId: null,
    });
    entry = useBudgetStore.getState().entries.find((e) => e.id === pendingIncome.id);
    expect(entry && 'accountId' in entry).toBe(false);
  });

  it('ignores an account link to an unknown account', async () => {
    await useBudgetStore.getState().createCustomConceptAndMovement({
      monthKey: '2026-10',
      name: 'Sin cuenta',
      type: 'expense',
      group: 'variable',
      amount: 10_000,
      accountId: 'acc_missing',
    });
    const entry = useBudgetStore.getState().entries.find((e) => e.conceptName === 'Sin cuenta');
    expect(entry && 'accountId' in entry).toBe(false);
  });

  it('rolls back a created account when the cloud rejects it permanently', async () => {
    useBudgetStore.getState().setAuthUser(CLOUD_USER);
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveFinancialAccount')
      .mockRejectedValue(permanentError());

    await createVisa();

    const state = useBudgetStore.getState();
    expect(state.financialAccounts).toEqual([]);
    expect(state.syncMessage).toContain('No se pudo guardar la tarjeta o cuenta');
  });

  it('saves, updates and deletes accounts in the cloud for a real user', async () => {
    useBudgetStore.getState().setAuthUser(CLOUD_USER);
    const save = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveFinancialAccount')
      .mockResolvedValue();
    const remove = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteFinancialAccount')
      .mockResolvedValue();

    const visa = await createVisa();
    expect(save).toHaveBeenCalledWith(CLOUD_USER.uid, visa);

    await useBudgetStore.getState().updateFinancialAccount(visa.id, {
      name: 'Visa 2',
      institution: 'Banco Uno',
      openingBalance: 0,
      creditLimit: 1_000_000,
    });
    expect(save).toHaveBeenLastCalledWith(
      CLOUD_USER.uid,
      expect.objectContaining({ id: visa.id, name: 'Visa 2' })
    );

    await useBudgetStore.getState().deleteFinancialAccount(visa.id);
    expect(remove).toHaveBeenCalledWith(CLOUD_USER.uid, visa.id);
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
  });

  it('rolls back an update and a delete rejected by the cloud', async () => {
    useBudgetStore.getState().setAuthUser(CLOUD_USER);
    const save = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveFinancialAccount')
      .mockResolvedValue();
    const visa = await createVisa();
    save.mockRejectedValue(permanentError());
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteFinancialAccount')
      .mockRejectedValue(permanentError());

    await useBudgetStore.getState().updateFinancialAccount(visa.id, {
      name: 'Otro nombre',
      institution: 'Banco Uno',
      openingBalance: 0,
    });
    expect(useBudgetStore.getState().financialAccounts[0]?.name).toBe('Visa Oro');

    await useBudgetStore.getState().deleteFinancialAccount(visa.id);
    expect(useBudgetStore.getState().financialAccounts).toHaveLength(1);
  });

  it('keeps the account and queues the write while offline', async () => {
    useBudgetStore.getState().setAuthUser(CLOUD_USER);
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveFinancialAccount')
      .mockRejectedValue(new Error('Firestore write timeout'));

    const nomina = await createNomina();

    expect(useBudgetStore.getState().financialAccounts).toEqual([nomina]);
    const queue = loadOfflineWriteQueue(CLOUD_USER.uid);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.type).toBe('save_financial_account');
  });

  it('restores the accounts from the device cache when the session comes back', async () => {
    useBudgetStore.getState().setAuthUser(CLOUD_USER);
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveFinancialAccount').mockResolvedValue();
    const visa = await createVisa();
    flushPendingPersistedAccount();

    useBudgetStore.setState({ authUser: DEMO_USER, financialAccounts: [] });
    useBudgetStore.getState().setAuthUser(CLOUD_USER);

    expect(useBudgetStore.getState().financialAccounts).toEqual([visa]);
  });

  it('clears the accounts when the session is cleared or the account is reset', async () => {
    await createVisa();
    await useBudgetStore.getState().resetFullAccount('2027-01');
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);

    await createNomina();
    useBudgetStore.getState().clearWorkspaceSession();
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
  });

  it('hydrates the accounts from the cloud payload, and an older payload without them', async () => {
    const visa = buildFinancialAccount('acc_cloud', '2026-10', {
      type: 'credit',
      name: 'Nube',
      institution: 'Banco',
      openingBalance: 0,
    });
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
    useBudgetStore.getState().applyFullCloudAccount({ ...base, financialAccounts: [visa] });
    expect(useBudgetStore.getState().financialAccounts).toEqual([visa]);

    useBudgetStore.getState().applyFullCloudAccount(base);
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
  });
});

describe('buildFinancialAccount', () => {
  it('rounds amounts, drops invalid days, rates and last digits', () => {
    const account = buildFinancialAccount('acc_1', '2026-10', {
      type: 'credit',
      name: 'Tarjeta',
      institution: 'Banco',
      lastFourDigits: '12',
      openingBalance: 1500.6,
      creditLimit: -10,
      statementDay: 0,
      paymentDueDay: 40,
      monthlyInterestRate: 150,
    });
    expect(account).toEqual({
      id: 'acc_1',
      type: 'credit',
      name: 'Tarjeta',
      institution: 'Banco',
      openingBalance: 1501,
      openingMonthKey: '2026-10',
    });

    const debit = buildFinancialAccount('acc_2', '2026-10', {
      type: 'debit',
      name: 'Cuenta',
      institution: 'Banco',
      openingBalance: Number.NaN,
    });
    expect(debit.openingBalance).toBe(0);
    expect(debit.debitKind).toBeUndefined();
  });
});
