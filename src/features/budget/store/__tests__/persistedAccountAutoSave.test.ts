/**
 * OPT-02 (plan consolidado de auditorías, Fase 2): un solo punto de guardado de la caché local y
 * metadatos del sobre en memoria.
 *
 * - Cada cambio de los campos persistidos programa un único guardado, venga de donde venga
 *   (acciones, provisiones, rollback, `setState`).
 * - `savePersistedAccount` y `updatePersistedAccountRevision` ya no leen la caché (que se
 *   descifra y parsea entera) cuando el sobre de ese usuario ya se conoce.
 * - `historySyncedAt` (ADR 0028) y el aislamiento entre usuarios se mantienen.
 *
 * Con BFLOW_RENDER_REPORT=1 imprime las cifras para PERF_BASELINE.md §20.
 */

import type { FullCloudAccountData } from '../../../../data/repositories/budgetRepository';
import { FirestoreBudgetRepository } from '../../../../data/repositories/budgetRepository';
import type { BFlowAuthUser } from '../../../../platform/auth/authAdapter';
import * as accountCache from '../../../../platform/storage/accountCache';
import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  persistentStorage,
  type RawStorageBackend,
} from '../../../../platform/storage/persistentStorageAdapter';
import { clearOfflineWriteQueue } from '../../../../platform/storage/offlineWriteQueue';
import { useBudgetStore } from '../useBudgetStore';

const realUser: BFlowAuthUser = {
  uid: 'uid_cloud_test_autosave',
  email: 'demo@bflow.example',
  displayName: 'Demo',
  authProvider: 'password',
  provider: 'firebase',
};

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

function snapshotOfStore(): FullCloudAccountData {
  const state = useBudgetStore.getState();
  return {
    activeMonthKey: state.activeMonthKey,
    availableMonths: state.availableMonths,
    concepts: state.concepts,
    entries: state.entries,
    debtsByMonth: state.debtsByMonth,
    debtPayments: state.debtPayments,
    savingsBucketsByMonth: state.savingsBucketsByMonth,
    provisionPlan: state.provisionPlan,
    closedSnapshots: state.closedSnapshots,
    financialAccounts: state.financialAccounts,
  };
}

function report(name: string, value: unknown): void {
  if (process.env.BFLOW_RENDER_REPORT === '1') {
    process.stdout.write(`\nAUTOSAVE_REPORT_${name}=${JSON.stringify(value)}\n`);
  }
}

describe('OPT-02 · un solo punto de guardado de la caché', () => {
  const cacheKey = accountCache.getAccountCacheKey(realUser.uid);

  beforeEach(() => {
    __setStorageBackendForTests(createDiskBackend());
    __resetMemoryCacheForTests();
    clearOfflineWriteQueue(realUser.uid);
    useBudgetStore.getState().resetToSampleWorkspace();
    useBudgetStore.setState({ authUser: realUser, isAccountHydrated: true, needsOnboarding: false });
    accountCache.flushPendingPersistedAccount();
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveOrUpdateEntry').mockResolvedValue();
    jest.spyOn(FirestoreBudgetRepository.prototype, 'saveProvisionPlan').mockResolvedValue();
  });

  afterEach(() => {
    accountCache.cancelPendingPersistedAccountSave();
    jest.restoreAllMocks();
    __setStorageBackendForTests(null);
    __resetMemoryCacheForTests();
  });

  it('una acción programa un solo guardado y guardar no vuelve a leer la caché', async () => {
    accountCache.savePersistedAccount(
      realUser.uid,
      { ...snapshotOfStore(), historySyncedAt: '2026-11-01T00:00:00.000Z' },
      '2026-11-01T00:00:00.000Z',
      'rev_cloud_1'
    );
    const schedule = jest.spyOn(accountCache, 'schedulePersistedAccountSave');
    const getItem = jest.spyOn(persistentStorage, 'getItem');
    const setItem = jest.spyOn(persistentStorage, 'setItem');
    const cacheReads = () => getItem.mock.calls.filter(([key]) => key === cacheKey).length;
    const cacheWrites = () => setItem.mock.calls.filter(([key]) => key === cacheKey).length;

    const entry = useBudgetStore.getState().entries[0];
    if (!entry) throw new Error('Expected a sample entry');
    await useBudgetStore.getState().toggleEntryStatus(entry.id);
    await Promise.resolve();
    const toggleSchedules = schedule.mock.calls.length;

    schedule.mockClear();
    await useBudgetStore.getState().deleteProvisionItem(
      useBudgetStore.getState().provisionPlan.items[0]?.id ?? 'none'
    );
    await Promise.resolve();
    const provisionSchedules = schedule.mock.calls.length;

    accountCache.flushPendingPersistedAccount();
    accountCache.updatePersistedAccountRevision(realUser.uid, 'rev_cloud_2');
    const measured = {
      toggleSchedules,
      provisionSchedules,
      cacheReadsOnSaveAndRevision: cacheReads(),
      cacheWrites: cacheWrites(),
    };
    report('counts', measured);

    expect(toggleSchedules).toBe(1);
    expect(provisionSchedules).toBe(1);
    expect(measured.cacheReadsOnSaveAndRevision).toBe(0);

    __resetMemoryCacheForTests();
    const envelope = accountCache.loadPersistedAccountEnvelope(realUser.uid);
    expect(envelope?.dataRevision).toBe('rev_cloud_2');
    expect(envelope?.data.historySyncedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(envelope?.data.entries.find((e) => e.id === entry.id)?.status).not.toBe(entry.status);
  });

  it('un cambio hecho con setState también se guarda una vez', async () => {
    const schedule = jest.spyOn(accountCache, 'schedulePersistedAccountSave');
    useBudgetStore.setState({ concepts: [...useBudgetStore.getState().concepts] });
    useBudgetStore.setState({ syncMessage: 'no persistido' });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('no hereda la revisión de otro usuario ni la de una caché borrada', () => {
    accountCache.savePersistedAccount(realUser.uid, snapshotOfStore(), undefined, 'rev_a');
    accountCache.savePersistedAccount('uid_otro', snapshotOfStore());
    expect(accountCache.loadPersistedAccountEnvelope('uid_otro')?.dataRevision).toBeUndefined();

    accountCache.clearPersistedAccount(realUser.uid);
    accountCache.savePersistedAccount(realUser.uid, snapshotOfStore());
    expect(accountCache.loadPersistedAccountEnvelope(realUser.uid)?.dataRevision).toBeUndefined();
  });

  it('relee la caché si el almacenamiento cambió por debajo (otro backend)', () => {
    accountCache.savePersistedAccount(realUser.uid, snapshotOfStore(), undefined, 'rev_a');
    __setStorageBackendForTests(createDiskBackend());
    __resetMemoryCacheForTests();
    accountCache.savePersistedAccount(realUser.uid, snapshotOfStore());
    expect(accountCache.loadPersistedAccountEnvelope(realUser.uid)?.dataRevision).toBeUndefined();
  });
});
