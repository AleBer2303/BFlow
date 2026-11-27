/**
 * OPT-06 (plan consolidado, Fase 2): los slices comparten un repositorio de Firestore creado
 * la primera vez que se usa (`getBudgetRepository`), en vez de construir uno en cada escritura.
 * Los tests pueden reemplazarlo con `__setBudgetRepositoryForTests`.
 *
 * Con BFLOW_RENDER_REPORT=1 imprime cuántos repositorios se crearon (PERF_BASELINE.md §20).
 */

import * as firebaseConfig from '../../../../data/firebase/firebaseConfig';
import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import { clearOfflineWriteQueue } from '../../../../platform/storage/offlineWriteQueue';
import { __setBudgetRepositoryForTests, getBudgetRepository } from '../slices/sliceTypes';
import { useBudgetStore } from '../useBudgetStore';

const realUser: BFlowAuthUser = {
  uid: 'uid_cloud_test_repo_getter',
  email: 'demo.owner@bflow.example',
  displayName: 'Demo',
  authProvider: 'password',
  provider: 'firebase',
};

describe('getBudgetRepository (OPT-06)', () => {
  beforeEach(() => {
    __setBudgetRepositoryForTests(null);
    clearOfflineWriteQueue(realUser.uid);
    useBudgetStore.getState().resetToOctober2026GoldenState();
    useBudgetStore.getState().setAuthUser(realUser);
  });

  afterEach(() => {
    __setBudgetRepositoryForTests(null);
    clearOfflineWriteQueue(realUser.uid);
    jest.restoreAllMocks();
  });

  it('crea un solo repositorio para varias escrituras seguidas', async () => {
    const getDb = jest.spyOn(firebaseConfig, 'getFirebaseDb').mockReturnValue({} as never);
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry').mockResolvedValue();
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveDebt').mockResolvedValue();

    const [first, second] = useBudgetStore.getState().entries;
    if (!first || !second) throw new Error('Expected seeded entries');
    await useBudgetStore.getState().toggleEntryStatus(first.id);
    await useBudgetStore.getState().toggleEntryStatus(second.id);
    await useBudgetStore.getState().createDebt('2026-10', {
      name: 'Préstamo',
      lender: 'Banco',
      openingBalance: 100_000,
    });

    if (process.env.BFLOW_RENDER_REPORT === '1') {
      process.stdout.write(`\nREPO_REPORT_constructions_for_3_writes=${getDb.mock.calls.length}\n`);
    }
    expect(getDb).toHaveBeenCalledTimes(1);
    expect(getBudgetRepository()).toBe(getBudgetRepository());
  });

  it('los tests pueden reemplazar el repositorio compartido', async () => {
    const saveDebt = jest.fn().mockResolvedValue(undefined);
    __setBudgetRepositoryForTests({ saveDebt } as unknown as FirestoreBudgetRepository);

    await useBudgetStore.getState().createDebt('2026-10', {
      name: 'Préstamo',
      lender: 'Banco',
      openingBalance: 100_000,
    });

    expect(saveDebt).toHaveBeenCalledWith(realUser.uid, expect.objectContaining({ name: 'Préstamo' }));
  });
});
