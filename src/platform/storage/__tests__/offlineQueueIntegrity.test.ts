/**
 * src/platform/storage/__tests__/offlineQueueIntegrity.test.ts
 *
 * Integridad de la cola offline (Fase 1 del plan consolidado, ADR 0017 y 0035):
 * payload tipado y validado al leer (BUG-01/02), borrado completo, claves por objetivo
 * y compactación, y drenado que relee la cola en cada paso.
 */

import type { FirestoreBudgetRepository } from '../../../data/repositories/budgetRepository';
import type { Concept, MonthEntry } from '../../../domain';
import {
  consumeDiscardedOfflineWritesCount,
  drainOfflineWriteQueue,
  enqueueOfflineWrite,
  getOfflineQueueStorageKey,
  isPermanentCloudError,
  loadOfflineWriteQueue,
} from '../offlineWriteQueue';
import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  persistentStorage,
  type RawStorageBackend,
} from '../persistentStorageAdapter';
import { z } from 'zod';

const uid = 'uid_queue_integrity';

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
};

const CONCEPT = {
  id: 'exp_mercado',
  name: 'Mercado',
  type: 'expense',
  group: 'variable',
  defaultAmount: 100_000,
} as unknown as Concept;

function createDiskBackend(): RawStorageBackend {
  const disk = new Map<string, string>();
  return {
    getItem: (key) => disk.get(key) ?? null,
    setItem: (key, value) => {
      disk.set(key, value);
    },
    removeItem: (key) => {
      disk.delete(key);
    },
    clear: () => {
      disk.clear();
    },
  };
}

function legacyOp(type: string, payload: Record<string, unknown>, id = `op_legacy_${type}`) {
  return { id, uid, type, payload, createdAtIso: '2026-11-01T00:00:00.000Z', retryCount: 0 };
}

beforeEach(() => {
  __setStorageBackendForTests(createDiskBackend());
  __resetMemoryCacheForTests();
  consumeDiscardedOfflineWritesCount(uid);
});

afterEach(() => {
  __setStorageBackendForTests(null);
  __resetMemoryCacheForTests();
});

describe('BUG-01 · borrado completo de un movimiento', () => {
  it('drena delete_entry_completely con deleteEntryCompletely, nunca con deleteOrResetEntry', async () => {
    enqueueOfflineWrite(uid, {
      type: 'delete_entry_completely',
      payload: { entryId: ENTRY.id, conceptId: ENTRY.conceptId, monthKey: ENTRY.monthKey },
    });
    const repo = {
      deleteEntryCompletely: jest.fn().mockResolvedValue(undefined),
      deleteOrResetEntry: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirestoreBudgetRepository;

    const result = await drainOfflineWriteQueue(uid, repo);

    expect(result).toEqual({ processed: 1, remaining: 0, discarded: 0 });
    expect(repo.deleteEntryCompletely).toHaveBeenCalledWith(uid, ENTRY.id);
    expect(repo.deleteOrResetEntry).not.toHaveBeenCalled();
  });

  it('convierte el borrado guardado por versiones anteriores (sin entry) en borrado completo', () => {
    persistentStorage.setItem(getOfflineQueueStorageKey(uid), [
      legacyOp('delete_or_reset_entry', {
        entryId: ENTRY.id,
        conceptId: ENTRY.conceptId,
        monthKey: ENTRY.monthKey,
      }),
    ]);

    const queue = loadOfflineWriteQueue(uid);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.type).toBe('delete_entry_completely');
  });

  it('conserva el restablecimiento cuando la operación lleva el movimiento', () => {
    persistentStorage.setItem(getOfflineQueueStorageKey(uid), [
      legacyOp('delete_or_reset_entry', {
        entryId: ENTRY.id,
        conceptId: ENTRY.conceptId,
        monthKey: ENTRY.monthKey,
        entry: ENTRY,
      }),
    ]);

    expect(loadOfflineWriteQueue(uid)[0]?.type).toBe('delete_or_reset_entry');
  });
});

describe('ADR 0034 · cuentas en la configuración inicial encolada', () => {
  const setup = {
    monthKey: '2026-11',
    concepts: [],
    entries: [],
    debts: [],
    debtPayments: [],
    savingsBuckets: [],
    provisionPlan: { items: [], recurringMonthlyTotalCop: 0, totalWithTargetGoalCop: 0 },
  };

  it('acepta la configuración guardada antes de las cuentas (sin financialAccounts)', () => {
    persistentStorage.setItem(getOfflineQueueStorageKey(uid), [
      legacyOp('save_initial_account_setup', setup),
    ]);

    const queue = loadOfflineWriteQueue(uid);
    expect(queue.map((op) => op.type)).toEqual(['save_initial_account_setup']);
    expect(consumeDiscardedOfflineWritesCount(uid)).toBe(0);
  });

  it('conserva las cuentas de la configuración y descarta una lista mal formada', () => {
    const account = {
      id: 'acc_visa',
      type: 'credit',
      name: 'Visa',
      institution: 'Banco',
      openingBalance: 0,
      openingMonthKey: '2026-11',
    };
    persistentStorage.setItem(getOfflineQueueStorageKey(uid), [
      legacyOp('save_initial_account_setup', { ...setup, financialAccounts: [account] }, 'op_ok'),
      legacyOp('save_initial_account_setup', { ...setup, financialAccounts: 'x' }, 'op_bad'),
    ]);

    const queue = loadOfflineWriteQueue(uid);
    expect(queue.map((op) => op.id)).toEqual(['op_ok']);
    expect(queue[0]?.payload).toEqual(expect.objectContaining({ financialAccounts: [account] }));
  });
});

describe('BUG-02 · claves por objetivo y compactación', () => {
  it('editar y luego borrar el mismo movimiento deja una sola operación sobre el movimiento', () => {
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: { ...ENTRY, actualAmount: 120_000 } },
    });
    enqueueOfflineWrite(uid, {
      type: 'delete_entry_completely',
      payload: { entryId: ENTRY.id, conceptId: ENTRY.conceptId, monthKey: ENTRY.monthKey },
    });

    const queue = loadOfflineWriteQueue(uid);
    expect(queue.map((op) => op.type)).toEqual(['delete_entry_completely']);
  });

  it('al borrar, conserva como save_concept el concepto que viajaba con la edición', () => {
    const renamed = { ...CONCEPT, name: 'Mercado del mes' };
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: ENTRY, concept: renamed },
    });
    enqueueOfflineWrite(uid, {
      type: 'delete_entry_completely',
      payload: { entryId: ENTRY.id, conceptId: ENTRY.conceptId, monthKey: ENTRY.monthKey },
    });

    const queue = loadOfflineWriteQueue(uid);
    expect(queue.map((op) => op.type)).toEqual(['save_concept', 'delete_entry_completely']);
    expect(queue[0]?.payload).toEqual({ concept: renamed });
  });

  it('borrar un movimiento creado sin red deja la creación del concepto y el borrado', () => {
    enqueueOfflineWrite(uid, {
      type: 'save_custom_concept_and_entry',
      payload: { concept: CONCEPT, entry: ENTRY, createdPayments: [] },
    });
    enqueueOfflineWrite(uid, {
      type: 'delete_entry_completely',
      payload: { entryId: ENTRY.id, conceptId: ENTRY.conceptId, monthKey: ENTRY.monthKey },
    });

    const queue = loadOfflineWriteQueue(uid);
    expect(queue.map((op) => op.type)).toEqual(['save_concept', 'delete_entry_completely']);
  });

  it('editar un movimiento creado sin red actualiza la creación pendiente', () => {
    enqueueOfflineWrite(uid, {
      type: 'save_custom_concept_and_entry',
      payload: { concept: CONCEPT, entry: ENTRY, createdPayments: [] },
    });
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: { ...ENTRY, actualAmount: 90_000 } },
    });

    const queue = loadOfflineWriteQueue(uid);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.type).toBe('save_custom_concept_and_entry');
    expect(queue[0]?.payload).toMatchObject({
      concept: CONCEPT,
      entry: { actualAmount: 90_000 },
      createdPayments: [],
    });
  });

  it('dos ediciones seguidas conservan el concepto y los abonos de la primera si la segunda no los trae', () => {
    const payment = {
      id: `${ENTRY.id}_debt_1`,
      entryId: ENTRY.id,
      monthKey: ENTRY.monthKey,
      debtId: 'debt_1',
      principalAmount: 1,
      interestAmount: 0,
      totalApplied: 1,
      active: true,
    };
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: ENTRY, concept: CONCEPT, debtPayments: [payment] },
    });
    enqueueOfflineWrite(uid, {
      type: 'save_or_update_entry',
      payload: { entry: { ...ENTRY, actualAmount: 1 } },
    });

    const queue = loadOfflineWriteQueue(uid);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.payload).toEqual({
      entry: { ...ENTRY, actualAmount: 1 },
      concept: CONCEPT,
      debtPayments: [payment],
    });
  });

  it('guardar después de borrar conserva el orden FIFO', () => {
    enqueueOfflineWrite(uid, { type: 'delete_debt', payload: { debtId: 'debt_1' } });
    enqueueOfflineWrite(uid, { type: 'save_concept', payload: { concept: CONCEPT } });
    enqueueOfflineWrite(uid, {
      type: 'save_debt',
      payload: { debt: { id: 'debt_1' } as never },
    });

    expect(loadOfflineWriteQueue(uid).map((op) => op.type)).toEqual([
      'delete_debt',
      'save_concept',
      'save_debt',
    ]);
  });

  it.each([
    ['concept', 'save_concept', { concept: { id: 'c1' } }, 'delete_concept', { conceptId: 'c1' }],
    ['debt', 'save_debt', { debt: { id: 'd1' } }, 'delete_debt', { debtId: 'd1' }],
    [
      'account',
      'save_financial_account',
      { account: { id: 'a1' } },
      'delete_financial_account',
      { accountId: 'a1' },
    ],
    [
      'bucket',
      'save_savings_bucket',
      { bucketId: 'b1', openingBalanceCop: 0, monthKey: '2026-10' },
      'delete_savings_bucket',
      { bucketId: 'b1' },
    ],
  ])('el borrado de %s reemplaza su guardado pendiente', (_label, saveType, savePayload, deleteType, deletePayload) => {
    enqueueOfflineWrite(uid, { type: 'save_concept', payload: { concept: { id: 'other' } as never } });
    enqueueOfflineWrite(uid, { type: saveType, payload: savePayload } as never);
    enqueueOfflineWrite(uid, { type: deleteType, payload: deletePayload } as never);

    expect(loadOfflineWriteQueue(uid).map((op) => op.type)).toEqual(['save_concept', deleteType]);
  });

  it('no compacta operaciones de mes distintas (cerrar y reabrir se ejecutan en orden)', () => {
    enqueueOfflineWrite(uid, {
      type: 'persist_month_close',
      payload: {
        monthKey: '2026-10',
        result: {
          snapshot: { monthKey: '2026-10' },
          nextMonthKey: '2026-11',
          nextMonthDebts: [],
          nextMonthSavingsBuckets: [],
          nextMonthEntries: [],
        } as never,
      },
    });
    enqueueOfflineWrite(uid, { type: 'reopen_month', payload: { monthKey: '2026-10' } });

    expect(loadOfflineWriteQueue(uid).map((op) => op.type)).toEqual([
      'persist_month_close',
      'reopen_month',
    ]);
  });

  it('el perfil conserva la foto pendiente cuando el siguiente guardado no la cambia', () => {
    enqueueOfflineWrite(uid, {
      type: 'save_user_profile',
      payload: { displayName: 'A', financialGoal: '', photoUrl: 'data:image/png;base64,AA' },
    });
    enqueueOfflineWrite(uid, {
      type: 'save_user_profile',
      payload: { displayName: 'B', financialGoal: 'Meta' },
    });

    const queue = loadOfflineWriteQueue(uid);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.payload).toEqual({
      displayName: 'B',
      financialGoal: 'Meta',
      photoUrl: 'data:image/png;base64,AA',
    });
  });
});

describe('payload tipado · lectura de colas guardadas', () => {
  it('descarta sin lanzar las operaciones que no encajan y lo cuenta una sola vez', () => {
    persistentStorage.setItem(getOfflineQueueStorageKey(uid), [
      legacyOp('save_concept', { concept: { id: 'c1' } }, 'op_ok'),
      legacyOp('save_concept', { concept: { name: 'sin id' } }, 'op_bad_payload'),
      legacyOp('unknown_type', {}, 'op_bad_type'),
      { ...legacyOp('save_debt', { debt: { id: 'd1' } }, 'op_other_uid'), uid: 'otro' },
      'basura',
    ]);

    expect(() => loadOfflineWriteQueue(uid)).not.toThrow();
    expect(loadOfflineWriteQueue(uid).map((op) => op.id)).toEqual(['op_ok']);
    expect(consumeDiscardedOfflineWritesCount(uid)).toBe(4);
    expect(consumeDiscardedOfflineWritesCount(uid)).toBe(0);

    // La cola limpia queda guardada: al recargar no vuelve a contar descartes.
    __resetMemoryCacheForTests();
    expect(loadOfflineWriteQueue(uid)).toHaveLength(1);
    expect(consumeDiscardedOfflineWritesCount(uid)).toBe(0);
  });

  it('el drenado informa cuántas operaciones antiguas se descartaron', async () => {
    persistentStorage.setItem(getOfflineQueueStorageKey(uid), [
      legacyOp('save_debt', { debt: {} }, 'op_bad'),
    ]);
    const repo = {} as FirestoreBudgetRepository;

    await expect(drainOfflineWriteQueue(uid, repo)).resolves.toEqual({
      processed: 0,
      remaining: 0,
      discarded: 1,
    });
  });

  it('trata un error de validación de Zod como permanente para no bloquear la cola', async () => {
    const zodError = z.object({ id: z.string() }).safeParse({}).error;
    expect(isPermanentCloudError(zodError)).toBe(true);

    enqueueOfflineWrite(uid, { type: 'save_concept', payload: { concept: CONCEPT } });
    enqueueOfflineWrite(uid, { type: 'delete_debt', payload: { debtId: 'd1' } });
    const repo = {
      saveConcept: jest.fn().mockRejectedValue(zodError),
      deleteDebt: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirestoreBudgetRepository;

    const result = await drainOfflineWriteQueue(uid, repo);
    expect(result.remaining).toBe(0);
    expect(repo.deleteDebt).toHaveBeenCalledWith(uid, 'd1');
  });

  it('el drenado no ejecuta una operación que fue reemplazada mientras corría otra', async () => {
    enqueueOfflineWrite(uid, { type: 'save_concept', payload: { concept: { id: 'c0' } as never } });
    enqueueOfflineWrite(uid, { type: 'save_debt', payload: { debt: { id: 'd1', name: 'v1' } as never } });

    const savedDebts: string[] = [];
    const repo = {
      saveConcept: jest.fn().mockImplementation(async () => {
        // Mientras se sube el concepto, el usuario borra la deuda pendiente.
        enqueueOfflineWrite(uid, { type: 'delete_debt', payload: { debtId: 'd1' } });
      }),
      saveDebt: jest.fn().mockImplementation(async (_uid: string, debt: { name: string }) => {
        savedDebts.push(debt.name);
      }),
      deleteDebt: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirestoreBudgetRepository;

    const result = await drainOfflineWriteQueue(uid, repo);

    expect(savedDebts).toEqual([]);
    expect(repo.deleteDebt).toHaveBeenCalledWith(uid, 'd1');
    expect(result).toEqual({ processed: 2, remaining: 0, discarded: 0 });
  });

  it('drena save_initial_account_setup con saveInitialAccountSetup', async () => {
    const payload = {
      monthKey: '2026-11',
      concepts: [CONCEPT],
      entries: [ENTRY],
      debts: [],
      debtPayments: [],
      savingsBuckets: [],
      provisionPlan: { items: [], recurringMonthlyTotalCop: 0, totalWithTargetGoalCop: 0 },
    };
    enqueueOfflineWrite(uid, { type: 'save_initial_account_setup', payload });
    const repo = {
      saveInitialAccountSetup: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirestoreBudgetRepository;

    await drainOfflineWriteQueue(uid, repo);
    expect(repo.saveInitialAccountSetup).toHaveBeenCalledWith(uid, payload);
  });
});
