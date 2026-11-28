/**
 * `completeInitialAccountSetup` con tarjetas y cuentas débito (ADR 0034).
 *
 * Las cuentas del onboarding se construyen con las mismas reglas que `createFinancialAccount`
 * (`buildFinancialAccount`), su saldo es el del inicio del mes elegido, los movimientos se
 * vinculan con `applyEntryAccountLink` y todo viaja en el mismo guardado inicial, también por
 * la cola offline.
 */

import { InMemoryBudgetRepository } from '../../../../data/repositories/inMemoryBudgetRepository';
import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import type { InitialAccountSetupPayload } from '../../../../data/repositories/budgetRepository';
import { calculateFinancialAccountsSummary } from '../../../../domain';
import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import { DEMO_USER } from '../../../../platform/auth/authAdapter';
import {
  clearOfflineWriteQueue,
  drainOfflineWriteQueue,
  loadOfflineWriteQueue,
} from '../../../../platform/storage/offlineWriteQueue';
import type { InitialOnboardingConfigInput } from '../useBudgetStore';
import { useBudgetStore } from '../useBudgetStore';

const cloudUser: BFlowAuthUser = {
  uid: 'uid_cloud_test_onboarding_accounts',
  email: 'demo@bflow.example',
  displayName: 'Demo',
  authProvider: 'password',
  provider: 'firebase',
};

const input: InitialOnboardingConfigInput = {
  monthKey: '2026-11',
  incomes: [
    {
      name: 'Salario',
      amountCop: 4_000_000,
      group: 'fixed',
      persistMonthly: true,
      completed: true,
      accountKey: 'acc_nomina',
    },
    { name: 'Intereses', amountCop: 20_000, group: 'variable', persistMonthly: false, accountKey: 'acc_ahorro' },
  ],
  expenses: [
    {
      name: 'Mercado',
      amountCop: 350_000,
      group: 'variable',
      persistMonthly: true,
      completed: true,
      accountKey: 'acc_visa',
    },
    {
      name: 'Pago Visa',
      amountCop: 450_000,
      group: 'fixed',
      persistMonthly: true,
      completed: true,
      accountKey: 'acc_visa',
      accountRole: 'payment',
    },
    {
      name: 'Arriendo',
      amountCop: 1_500_000,
      group: 'fixed',
      persistMonthly: true,
      accountKey: 'acc_nomina',
      accountRole: 'payment',
    },
    { name: 'Cuenta borrada', amountCop: 10_000, group: 'variable', persistMonthly: false, accountKey: 'acc_no_existe' },
  ],
  debts: [],
  savingsBuckets: [],
  provisions: [],
  financialAccounts: [
    {
      key: 'acc_visa',
      type: 'credit',
      name: ' Visa Oro ',
      institution: 'Davivienda',
      lastFourDigits: '1234',
      openingBalance: 450_000,
      creditLimit: 3_000_000,
      statementDay: 15,
      paymentDueDay: 30,
      debitKind: 'savings',
    },
    {
      key: 'acc_nomina',
      type: 'debit',
      name: 'Nómina',
      institution: 'Bancolombia',
      openingBalance: 800_000,
      debitKind: 'checking',
      creditLimit: 9_999,
    },
    { key: 'acc_ahorro', type: 'debit', name: 'Ahorro', institution: 'Nu', openingBalance: 1_200_000, debitKind: 'savings' },
    { key: 'acc_sin_entidad', type: 'debit', name: 'Sin entidad', institution: '  ', openingBalance: 5 },
  ],
};

beforeEach(() => {
  clearOfflineWriteQueue(cloudUser.uid);
  useBudgetStore.setState({ authUser: DEMO_USER, needsOnboarding: false });
  useBudgetStore.getState().resetToSampleWorkspace();
});

afterEach(() => {
  jest.restoreAllMocks();
  clearOfflineWriteQueue(cloudUser.uid);
});

describe('completeInitialAccountSetup · tarjetas y cuentas (ADR 0034)', () => {
  it('construye las cuentas como createFinancialAccount y descarta las que no tienen entidad', async () => {
    await useBudgetStore.getState().completeInitialAccountSetup(input);

    const accounts = useBudgetStore.getState().financialAccounts;
    expect(accounts.map((a) => a.id)).toEqual(['acc_visa', 'acc_nomina', 'acc_ahorro']);
    expect(accounts[0]).toEqual({
      id: 'acc_visa',
      type: 'credit',
      name: 'Visa Oro',
      institution: 'Davivienda',
      lastFourDigits: '1234',
      openingBalance: 450_000,
      openingMonthKey: '2026-11',
      creditLimit: 3_000_000,
      statementDay: 15,
      paymentDueDay: 30,
    });
    // Una cuenta débito no guarda campos de crédito.
    expect(accounts[1]).toEqual({
      id: 'acc_nomina',
      type: 'debit',
      name: 'Nómina',
      institution: 'Bancolombia',
      openingBalance: 800_000,
      openingMonthKey: '2026-11',
      debitKind: 'checking',
    });
    expect(accounts[2]?.debitKind).toBe('savings');
  });

  it('vincula los movimientos: rol solo en gastos con tarjeta, sin vínculo si la cuenta no existe', async () => {
    await useBudgetStore.getState().completeInitialAccountSetup(input);

    const byName = new Map(useBudgetStore.getState().entries.map((e) => [e.conceptName, e]));
    expect(byName.get('Salario')).toEqual(expect.objectContaining({ accountId: 'acc_nomina' }));
    expect(byName.get('Salario')?.accountRole).toBeUndefined();
    expect(byName.get('Intereses')?.accountId).toBe('acc_ahorro');
    expect(byName.get('Mercado')).toEqual(
      expect.objectContaining({ accountId: 'acc_visa', accountRole: 'purchase' })
    );
    expect(byName.get('Pago Visa')).toEqual(
      expect.objectContaining({ accountId: 'acc_visa', accountRole: 'payment' })
    );
    // En débito el rol no se guarda.
    expect(byName.get('Arriendo')?.accountId).toBe('acc_nomina');
    expect(byName.get('Arriendo')?.accountRole).toBeUndefined();
    expect(byName.get('Cuenta borrada')?.accountId).toBeUndefined();
  });

  it('los saldos del mes salen de los movimientos completados del onboarding', async () => {
    await useBudgetStore.getState().completeInitialAccountSetup(input);
    const state = useBudgetStore.getState();

    const summary = calculateFinancialAccountsSummary(
      state.financialAccounts,
      state.entries,
      '2026-11',
      '2026-11-20'
    );
    const byId = new Map(summary.accounts.map((a) => [a.accountId, a]));
    // Visa: 450.000 + compra 350.000 − pago 450.000.
    expect(byId.get('acc_visa')?.closingBalance).toBe(350_000);
    // Nómina: 800.000 + salario 4.000.000 (el arriendo sigue pendiente).
    expect(byId.get('acc_nomina')?.closingBalance).toBe(4_800_000);
    // Ahorro: los intereses están pendientes.
    expect(byId.get('acc_ahorro')?.closingBalance).toBe(1_200_000);
  });

  it('sin cuentas en la entrada, el workspace queda sin cuentas', async () => {
    const { financialAccounts: _accounts, ...withoutAccounts } = input;
    await useBudgetStore.getState().completeInitialAccountSetup(withoutAccounts);
    expect(useBudgetStore.getState().financialAccounts).toEqual([]);
  });

  it('envía las cuentas en el guardado inicial y la cola offline las repite igual', async () => {
    useBudgetStore.setState({ authUser: cloudUser });
    const save = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveInitialAccountSetup')
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }))
      .mockResolvedValue();

    await useBudgetStore.getState().completeInitialAccountSetup(input);

    const sent = save.mock.calls[0]?.[1] as InitialAccountSetupPayload;
    expect(sent.financialAccounts?.map((a) => a.id)).toEqual(['acc_visa', 'acc_nomina', 'acc_ahorro']);
    expect(loadOfflineWriteQueue(cloudUser.uid).map((op) => op.type)).toEqual([
      'save_initial_account_setup',
    ]);

    const repo = Object.create(FirestoreBudgetRepository.prototype) as FirestoreBudgetRepository;
    await drainOfflineWriteQueue(cloudUser.uid, repo);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[1]).toEqual(sent);
    expect(loadOfflineWriteQueue(cloudUser.uid)).toEqual([]);
  });

  it('el repositorio guarda las cuentas del onboarding y las devuelve al cargar la cuenta', async () => {
    useBudgetStore.setState({ authUser: cloudUser });
    let sent: InitialAccountSetupPayload | undefined;
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveInitialAccountSetup')
      .mockImplementation(async (_uid, payload) => {
        sent = payload;
      });
    await useBudgetStore.getState().completeInitialAccountSetup(input);

    const repo = new InMemoryBudgetRepository();
    await repo.saveFinancialAccount(cloudUser.uid, {
      id: 'acc_anterior',
      type: 'debit',
      name: 'Anterior',
      institution: 'Banco',
      openingBalance: 1,
      openingMonthKey: '2026-01',
    });
    await repo.saveInitialAccountSetup(cloudUser.uid, sent!);
    const loaded = await repo.loadFullCloudAccount(cloudUser.uid);
    expect(loaded.financialAccounts?.map((a) => a.id)).toEqual([
      'acc_visa',
      'acc_nomina',
      'acc_ahorro',
    ]);
  });
});
