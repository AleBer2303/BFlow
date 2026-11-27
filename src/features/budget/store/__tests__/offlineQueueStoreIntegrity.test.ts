/**
 * src/features/budget/store/__tests__/offlineQueueStoreIntegrity.test.ts
 *
 * Fase 1 del plan consolidado: integridad de la cola offline vista desde el store.
 * BUG-01 (borrar sin red), BUG-02 (editar y borrar), BUG-03 (onboarding con cola) y
 * BUG-04 (limpieza en cascada al borrar deudas y fondos, con rollback, ADR 0035).
 */

import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import {
  clearOfflineWriteQueue,
  drainOfflineWriteQueue,
  loadOfflineWriteQueue,
} from '../../../../platform/storage/offlineWriteQueue';
import { useBudgetStore } from '../useBudgetStore';

const testUser: BFlowAuthUser = {
  uid: 'uid_cloud_test_queue_integrity',
  email: 'demo@bflow.example',
  displayName: 'Demo',
  authProvider: 'password',
  provider: 'firebase',
};

function offlineError(): Error {
  const err = new Error('Client is offline');
  (err as unknown as { code: string }).code = 'unavailable';
  return err;
}

function permissionError(): Error {
  const err = new Error('Missing or insufficient permissions.');
  (err as unknown as { code: string }).code = 'permission-denied';
  return err;
}

beforeEach(() => {
  clearOfflineWriteQueue(testUser.uid);
  useBudgetStore.getState().resetToSampleWorkspace();
  useBudgetStore.setState({ authUser: testUser });
});

afterEach(() => {
  clearOfflineWriteQueue(testUser.uid);
  jest.restoreAllMocks();
});

describe('BUG-01 · borrar un movimiento sin red', () => {
  it('encola delete_entry_completely y al reconectar lo borra en vez de restablecerlo', async () => {
    const entry = useBudgetStore.getState().entries[0];
    if (!entry) throw new Error('Expected a sample entry');
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteEntryCompletely')
      .mockRejectedValueOnce(offlineError());

    await useBudgetStore.getState().deleteEntryById(entry.id);

    expect(useBudgetStore.getState().entries.some((e) => e.id === entry.id)).toBe(false);
    const queue = loadOfflineWriteQueue(testUser.uid);
    expect(queue.map((op) => op.type)).toEqual(['delete_entry_completely']);

    const completely = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteEntryCompletely')
      .mockResolvedValue();
    const reset = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteOrResetEntry')
      .mockResolvedValue();
    const repo = Object.create(FirestoreBudgetRepository.prototype) as FirestoreBudgetRepository;

    await drainOfflineWriteQueue(testUser.uid, repo);

    expect(completely).toHaveBeenCalledWith(testUser.uid, entry.id);
    expect(reset).not.toHaveBeenCalled();
  });

  it('restablecer un movimiento sigue usando delete_or_reset_entry', async () => {
    const entry = useBudgetStore.getState().entries[0];
    if (!entry) throw new Error('Expected a sample entry');
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteOrResetEntry')
      .mockRejectedValueOnce(offlineError());

    await useBudgetStore.getState().removeOrResetEntry(entry.id);

    expect(loadOfflineWriteQueue(testUser.uid).map((op) => op.type)).toEqual([
      'delete_or_reset_entry',
    ]);
  });
});

describe('BUG-02 · editar y luego borrar sin red', () => {
  it('deja una sola operación sobre el movimiento: el borrado', async () => {
    const entry = useBudgetStore.getState().entries.find((e) => e.type === 'expense');
    if (!entry) throw new Error('Expected a sample expense');
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry')
      .mockRejectedValue(offlineError());
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteEntryCompletely')
      .mockRejectedValue(offlineError());

    await useBudgetStore.getState().editEntry(entry.id, {
      conceptName: entry.conceptName,
      actualAmount: entry.actualAmount + 1_000,
    });
    await useBudgetStore.getState().deleteEntryById(entry.id);

    const queue = loadOfflineWriteQueue(testUser.uid);
    const entryOps = queue.filter((op) => op.type !== 'save_concept');
    expect(entryOps.map((op) => op.type)).toEqual(['delete_entry_completely']);
    // La edición también guardaba el concepto: se conserva aparte para no perder el cambio.
    expect(queue.filter((op) => op.type === 'save_concept')).toHaveLength(1);
    expect(useBudgetStore.getState().pendingOfflineWritesCount).toBe(queue.length);
  });
});

describe('BUG-03 · configuración inicial con la cola offline', () => {
  const input = {
    monthKey: '2026-11',
    incomes: [
      { name: 'Salario', amountCop: 5_000_000, group: 'fixed' as const, persistMonthly: true },
    ],
    expenses: [
      { name: 'Arriendo', amountCop: 1_000_000, group: 'fixed' as const, persistMonthly: true },
    ],
    debts: [],
    savingsBuckets: [{ id: 'savings', name: 'Fondo Ahorros', openingBalanceCop: 0 }],
  };

  it('encola save_initial_account_setup sin red y lo reintenta con el mismo payload', async () => {
    const save = jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveInitialAccountSetup')
      .mockRejectedValueOnce(offlineError())
      .mockResolvedValue();

    await useBudgetStore.getState().completeInitialAccountSetup(input);

    const state = useBudgetStore.getState();
    expect(state.needsOnboarding).toBe(false);
    expect(state.activeMonthKey).toBe('2026-11');
    expect(state.pendingOfflineWritesCount).toBe(1);
    const queue = loadOfflineWriteQueue(testUser.uid);
    expect(queue.map((op) => op.type)).toEqual(['save_initial_account_setup']);

    const repo = Object.create(FirestoreBudgetRepository.prototype) as FirestoreBudgetRepository;
    await drainOfflineWriteQueue(testUser.uid, repo);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[1]).toEqual(save.mock.calls[0]?.[1]);
    expect(loadOfflineWriteQueue(testUser.uid)).toEqual([]);
  });

  it('revierte la configuración ante un rechazo permanente', async () => {
    const before = useBudgetStore.getState();
    const previousConcepts = before.concepts;
    const previousMonth = before.activeMonthKey;
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'saveInitialAccountSetup')
      .mockRejectedValue(permissionError());

    await useBudgetStore.getState().completeInitialAccountSetup(input);

    const state = useBudgetStore.getState();
    expect(state.concepts).toBe(previousConcepts);
    expect(state.activeMonthKey).toBe(previousMonth);
    expect(state.syncMessage).toBe('No se pudo guardar la configuración inicial en la nube.');
    expect(loadOfflineWriteQueue(testUser.uid)).toEqual([]);
  });
});

describe('BUG-04 · limpieza en cascada (ADR 0035)', () => {
  const DEBT_ID = 'debt_auto_loan';

  it('al borrar una deuda quita defaultTargetDebtId de los conceptos y sus abonos', async () => {
    const before = useBudgetStore.getState();
    expect(before.concepts.some((c) => c.defaultTargetDebtId === DEBT_ID)).toBe(true);
    jest.spyOn(FirestoreBudgetRepository.prototype, 'deleteDebt').mockResolvedValue();

    await useBudgetStore.getState().deleteDebt('2026-10', DEBT_ID);

    const state = useBudgetStore.getState();
    expect(state.concepts.some((c) => c.defaultTargetDebtId === DEBT_ID)).toBe(false);
    expect(state.debtPayments.some((dp) => dp.debtId === DEBT_ID)).toBe(false);
    expect(Object.values(state.debtsByMonth).flat().some((d) => d.id === DEBT_ID)).toBe(false);
  });

  it('revierte deudas, conceptos y abonos si la nube rechaza el borrado', async () => {
    const before = useBudgetStore.getState();
    const previous = {
      debtsByMonth: before.debtsByMonth,
      concepts: before.concepts,
      debtPayments: before.debtPayments,
    };
    jest.spyOn(FirestoreBudgetRepository.prototype, 'deleteDebt').mockRejectedValue(permissionError());

    await useBudgetStore.getState().deleteDebt('2026-10', DEBT_ID);

    const state = useBudgetStore.getState();
    expect(state.debtsByMonth).toBe(previous.debtsByMonth);
    expect(state.concepts).toBe(previous.concepts);
    expect(state.debtPayments).toBe(previous.debtPayments);
    expect(state.syncMessage).toBe('No se pudo eliminar la deuda en la nube.');
  });

  it('al borrar un fondo quita savingsContribution de los conceptos y lo revierte si falla', async () => {
    const before = useBudgetStore.getState();
    const linked = before.concepts.find((c) => c.savingsContribution);
    const bucketId = linked?.savingsContribution?.bucketId;
    if (!bucketId) throw new Error('Expected a concept linked to a savings bucket');
    jest
      .spyOn(FirestoreBudgetRepository.prototype, 'deleteSavingsBucket')
      .mockRejectedValue(permissionError());

    await useBudgetStore.getState().deleteSavingsBucket('2026-10', bucketId);

    expect(useBudgetStore.getState().concepts).toBe(before.concepts);
  });
});
