import { toggleMovementStatus } from '../../domain/checklist/checklist';
import { toAppMonthKey } from '../../domain/date/monthKey';
import { calculateDebtsSummary } from '../../domain/debts/debtCalculator';
import type { Debt, MonthSnapshot, SavingsBucket } from '../../domain/models/types';
import { closeMonthAndRollover } from '../../domain/month-close/monthClose';
import {
  serializeMonthSnapshotForFirestore,
  serializeProvisionPlanForFirestore,
} from '../mappers/firestoreSchemas';
import {
  canCheckRevisionFirst,
  chainMonthlyBalances,
  collectSavingsBuckets,
  dropUnusedLegacyDefaultBuckets,
  hasConfiguredAccountData,
  mergeArchivedHistoryEntries,
  parseClosedSnapshots,
  parseSavedActiveMonthKey,
  planUserDocumentSync,
  resolveAccountIdentity,
  resolveAvailableMonths,
  resolveFallbackActiveMonthKey,
  resolveNeedsOnboarding,
  resolveProvisionPlan,
  reuseCachedAccountIfRevisionMatches,
  withPlannedOpenMonths,
  type AccountIdentity,
} from '../repositories/accountHydration';
import { EMPTY_PROVISION_PLAN } from '../repositories/budgetRepositoryShared';
import type { FullCloudAccountData } from '../repositories/budgetRepositoryTypes';
import { buildSampleWorkspace } from '../sample/sampleWorkspace';

const activeAccount = resolveAccountIdentity({});
const resetAccount = resolveAccountIdentity({ accountResetByUser: true });
const newUserStartMonth = `${toAppMonthKey().slice(0, 4)}-01`;

function cachedAccount(overrides: Partial<FullCloudAccountData> = {}): FullCloudAccountData {
  return {
    activeMonthKey: '2026-10',
    availableMonths: ['2026-10'],
    concepts: [],
    entries: [],
    debtsByMonth: {},
    debtPayments: [],
    savingsBucketsByMonth: {},
    provisionPlan: EMPTY_PROVISION_PLAN,
    closedSnapshots: {},
    ...overrides,
  };
}

function closeSampleMonth() {
  const sample = buildSampleWorkspace();
  const result = closeMonthAndRollover({
    closingMonthKey: sample.monthKey,
    closedAtIso: '2026-11-01T00:00:00.000Z',
    concepts: sample.concepts,
    entries: sample.entries,
    debts: sample.debts,
    debtPayments: sample.debtPayments,
    savingsBuckets: sample.savingsBuckets,
  });
  return { sample, result };
}

describe('accountHydration (Fase 4, CC-01; ADR 0037)', () => {
  describe('1. dataRevision negotiation', () => {
    const fresh = new Date().toISOString();

    it('checks the revision first only with a fresh cache that has a revision', () => {
      const base = { cachedAccount: cachedAccount(), cachedDataRevision: 'rev_1', cachedSavedAt: fresh };
      expect(canCheckRevisionFirst(base)).toBe(true);
      expect(canCheckRevisionFirst(undefined)).toBe(false);
      expect(canCheckRevisionFirst({ ...base, forceFullSync: true })).toBe(false);
      expect(canCheckRevisionFirst({ ...base, isRegistration: true })).toBe(false);
      expect(canCheckRevisionFirst({ ...base, cachedDataRevision: '' })).toBe(false);
      expect(canCheckRevisionFirst({ ...base, cachedAccount: null })).toBe(false);
      expect(
        canCheckRevisionFirst({ ...base, cachedSavedAt: '2020-01-01T00:00:00.000Z' })
      ).toBe(false);
    });

    it('reuses the cache only when the cloud revision is the cached one', () => {
      const account = cachedAccount({ activeMonthKey: '2026-11' });
      const options = { cachedAccount: account, cachedDataRevision: 'rev_1' };
      expect(reuseCachedAccountIfRevisionMatches({ dataRevision: 'rev_1' }, options)).toEqual({
        ...account,
        dataRevision: 'rev_1',
      });
      expect(reuseCachedAccountIfRevisionMatches({ dataRevision: 'rev_2' }, options)).toBeNull();
      expect(reuseCachedAccountIfRevisionMatches({}, options)).toBeNull();
      expect(reuseCachedAccountIfRevisionMatches(undefined, options)).toBeNull();
      expect(
        reuseCachedAccountIfRevisionMatches({ dataRevision: 'rev_1' }, { cachedDataRevision: 'rev_1' })
      ).toBeNull();
    });
  });

  describe('2. account state', () => {
    it('tells a reset account apart', () => {
      expect(activeAccount).toEqual({ isResetByUser: false });
      expect(resetAccount).toEqual({ isResetByUser: true });
      expect(resolveAccountIdentity(undefined)).toEqual({ isResetByUser: false });
    });

    it('resolves the fallback active month and the stored one', () => {
      expect(resolveFallbackActiveMonthKey({ activeMonthKey: '2027-03' })).toBe('2027-03');
      expect(resolveFallbackActiveMonthKey(undefined)).toBe(newUserStartMonth);
      expect(parseSavedActiveMonthKey({ activeMonthKey: '2026-11' })).toBe('2026-11');
      expect(parseSavedActiveMonthKey({ activeMonthKey: '2026-13' })).toBeUndefined();
      expect(parseSavedActiveMonthKey({ activeMonthKey: 202611 })).toBeUndefined();
    });
  });

  describe('3. closed months and the history window', () => {
    it('parses snapshots by month and skips malformed ones', () => {
      const { result } = closeSampleMonth();
      const parsed = parseClosedSnapshots([
        { data: () => serializeMonthSnapshotForFirestore(result.snapshot) },
        { data: () => ({ monthKey: 'broken' }) },
      ]);
      expect(Object.keys(parsed)).toEqual(['2026-10']);
    });

    it('merges the cached history only with a plan, a probe and a cache', () => {
      const plan = { cutoffMonthKey: '2026-11', changedSinceIso: '2026-11-01T00:00:00.000Z' };
      const probe = { recentEntries: [], changedEntries: [], archivedCount: 0 };
      const cache = cachedAccount();
      expect(mergeArchivedHistoryEntries({ plan: null, probe, cachedAccount: cache, remoteSnapshots: {} })).toBeNull();
      expect(mergeArchivedHistoryEntries({ plan, probe: null, cachedAccount: cache, remoteSnapshots: {} })).toBeNull();
      expect(mergeArchivedHistoryEntries({ plan, probe, cachedAccount: null, remoteSnapshots: {} })).toBeNull();
      expect(mergeArchivedHistoryEntries({ plan, probe, cachedAccount: cache, remoteSnapshots: {} })).toEqual([]);
    });
  });

  describe('4. buckets, provision plan and needsOnboarding', () => {
    const bucketDoc = (id: string, data: Record<string, unknown>) => ({
      id,
      ref: `ref:${id}`,
      data: () => data,
    });

    it('keeps one bucket per id and skips documents stored under another id', () => {
      const collected = collectSavingsBuckets([
        bucketDoc('reserve', { id: 'reserve', name: 'Reserva', openingBalance: 5 }),
        bucketDoc('copy_doc', { id: 'reserve', name: 'Copia', openingBalance: 7 }),
        bucketDoc('broken', { nope: true }),
      ]);
      expect(collected.buckets).toEqual([{ id: 'reserve', name: 'Reserva', openingBalance: 5 }]);
      expect(collected.migratedBuckets).toEqual([]);
      expect(collected.legacyRefs).toEqual([]);
    });

    it('reads a bucket from its old document id and reports it to be written again (ADR 0037)', () => {
      const legacy = collectSavingsBuckets([
        bucketDoc('moto', { id: 'moto', name: 'Fondo', openingBalance: 9 }),
        bucketDoc('savings', { id: 'savings', name: 'Ahorros', openingBalance: 3 }),
      ]);
      expect(legacy.buckets.map((b) => b.id)).toEqual(['savings', 'reserve']);
      expect(legacy.migratedBuckets).toEqual([{ id: 'reserve', name: 'Fondo', openingBalance: 9 }]);
      expect(legacy.legacyRefs).toEqual(['ref:moto']);

      // The current document wins; the old one is only deleted.
      const both = collectSavingsBuckets([
        bucketDoc('moto', { id: 'moto', name: 'Viejo', openingBalance: 1 }),
        bucketDoc('reserve', { id: 'reserve', name: 'Actual', openingBalance: 2 }),
      ]);
      expect(both.buckets).toEqual([{ id: 'reserve', name: 'Actual', openingBalance: 2 }]);
      expect(both.migratedBuckets).toEqual([]);
      expect(both.legacyRefs).toEqual(['ref:moto']);
    });

    it('drops the empty default buckets only on empty accounts', () => {
      const defaults: SavingsBucket[] = [
        { id: 'reserve', name: 'Reserva', openingBalance: 0 },
        { id: 'savings', name: 'Ahorros', openingBalance: 0 },
      ];
      const empty = { concepts: [], entries: [], debts: [] };
      expect(dropUnusedLegacyDefaultBuckets(defaults, empty)).toEqual([]);
      const funded = [{ ...defaults[0]!, openingBalance: 10 }];
      expect(dropUnusedLegacyDefaultBuckets(funded, empty)).toBe(funded);
      const withConcepts = { ...empty, concepts: buildSampleWorkspace().concepts };
      expect(dropUnusedLegacyDefaultBuckets(defaults, withConcepts)).toBe(defaults);
    });

    it('uses the stored plan, else an empty one', () => {
      const samplePlan = buildSampleWorkspace().provisionPlan;
      const stored = { id: 'default', ...serializeProvisionPlanForFirestore(samplePlan) };
      expect(resolveProvisionPlan(stored).items).toHaveLength(samplePlan.items.length);
      expect(resolveProvisionPlan(undefined)).toBe(EMPTY_PROVISION_PLAN);
      expect(resolveProvisionPlan({ items: 'broken' })).toBe(EMPTY_PROVISION_PLAN);
    });

    it('decides the onboarding wizard', () => {
      const run = (identity: AccountIdentity, isRegistration?: boolean, hasConfiguredData = false) =>
        resolveNeedsOnboarding({ identity, isRegistration, hasConfiguredData });
      expect(run(resetAccount, false, true)).toBe(true);
      expect(run(activeAccount, true, true)).toBe(true);
      expect(run(activeAccount, false)).toBe(false);
      expect(run(activeAccount)).toBe(true);
      expect(run(activeAccount, undefined, true)).toBe(false);
    });

    it('counts any stored data or the onboarding flag as configured', () => {
      const none = { concepts: [], entries: [], debts: [], buckets: [], userData: undefined };
      expect(hasConfiguredAccountData(none)).toBe(false);
      expect(hasConfiguredAccountData({ ...none, userData: { onboardingCompleted: true } })).toBe(true);
      expect(
        hasConfiguredAccountData({ ...none, buckets: [{ id: 'x', name: 'x', openingBalance: 1 }] })
      ).toBe(true);
    });
  });

  describe('5. available months', () => {
    const base = {
      savedActiveMonthKey: undefined,
      concepts: [],
      entries: [],
      debts: [],
      buckets: [],
      closedSnapshots: {},
      fallbackActiveMonthKey: 'fallback',
    };

    it('starts a new account in January of the current year', () => {
      expect(resolveAvailableMonths(base)).toEqual({
        availableMonths: [newUserStartMonth],
        activeMonthKey: newUserStartMonth,
      });
    });

    it('adds the month after each closed one and opens on the latest', () => {
      const closedSnapshots = { '2026-10': {} as MonthSnapshot };
      expect(resolveAvailableMonths({ ...base, closedSnapshots, savedActiveMonthKey: '2026-10' })).toEqual({
        availableMonths: ['2026-10', '2026-11'],
        activeMonthKey: '2026-11',
      });
    });

    it('takes every month with debts, buckets or the saved active month', () => {
      const debts: Debt[] = [
        { id: 'd', groupKey: 'G', name: 'D', lender: 'L', openingBalance: 1, monthKey: '2027-02' },
      ];
      const buckets: SavingsBucket[] = [{ id: 'b', name: 'B', openingBalance: 1, monthKey: '2026-12' }];
      expect(
        resolveAvailableMonths({ ...base, debts, buckets, savedActiveMonthKey: '2026-09' }).availableMonths
      ).toEqual(['2026-09', '2026-12', '2027-02']);
    });
  });

  describe('6. users/{uid} write-back', () => {
    const base = {
      identity: activeAccount,
      needsOnboarding: false,
      savedActiveMonthKey: '2026-11',
      activeMonthKey: '2026-11',
    };

    it('writes nothing when the document is up to date', () => {
      expect(
        planUserDocumentSync({ ...base, userData: { dataRevision: 'rev_1', onboardingCompleted: true } })
      ).toEqual({ existingDataRevision: 'rev_1', fieldsToWrite: null, legacyFieldsToRemove: [] });
    });

    it('writes the active month, the onboarding mark or a missing revision', () => {
      expect(
        planUserDocumentSync({ ...base, activeMonthKey: '2026-12', userData: { dataRevision: 'rev_1' } })
          .fieldsToWrite
      ).toEqual({ activeMonthKey: '2026-12' });
      expect(
        planUserDocumentSync({ ...base, isRegistration: true, userData: { dataRevision: 'rev_1' } })
          .fieldsToWrite
      ).toEqual({ activeMonthKey: '2026-11', onboardingCompleted: true, accountResetByUser: false });
      expect(planUserDocumentSync({ ...base, userData: { dataRevision: '' } })).toEqual({
        existingDataRevision: undefined,
        fieldsToWrite: { activeMonthKey: '2026-11' },
        legacyFieldsToRemove: [],
      });
      expect(
        planUserDocumentSync({
          ...base,
          identity: resetAccount,
          needsOnboarding: true,
          userData: { dataRevision: 'rev_1' },
        }).fieldsToWrite
      ).toBeNull();
    });

    it('removes the fields no build reads any more (ADR 0037)', () => {
      const plan = planUserDocumentSync({
        ...base,
        userData: { dataRevision: 'rev_1', onboardingCompleted: true, seededOctober2026: true },
      });
      expect(plan.fieldsToWrite).toEqual({ activeMonthKey: '2026-11' });
      expect(plan.legacyFieldsToRemove).toEqual(['seededOctober2026']);
    });
  });

  describe('7. open months and the balance chain', () => {
    it('plans the recurring entries of open months without entries only', () => {
      const { sample } = closeSampleMonth();
      const closed = { '2026-09': {} as MonthSnapshot };
      const { entries, entriesByMonth } = withPlannedOpenMonths(
        sample.entries,
        ['2026-09', '2026-10', '2026-11'],
        closed,
        sample.concepts
      );
      expect(entriesByMonth.has('2026-09')).toBe(false);
      expect(entriesByMonth.get('2026-10')).toHaveLength(sample.entries.length);
      expect(entriesByMonth.get('2026-11')?.length).toBeGreaterThan(0);
      expect(entries.length).toBe(sample.entries.length + (entriesByMonth.get('2026-11')?.length ?? 0));
      expect(withPlannedOpenMonths(sample.entries, ['2026-11'], {}, []).entries).toHaveLength(
        sample.entries.length
      );
    });

    it('opens each month with what the previous one left and synthesizes missing payments', () => {
      const { sample } = closeSampleMonth();
      const planned = withPlannedOpenMonths(sample.entries, ['2026-10', '2026-11'], {}, sample.concepts);
      const novInstallment = planned.entries.find(
        (e) => e.monthKey === '2026-11' && e.conceptId === 'exp_loan_installment'
      );
      expect(novInstallment).toBeDefined();
      const entries = toggleMovementStatus(planned.entries, novInstallment!.id, {
        actualAmount: novInstallment!.plannedAmount,
        completedAt: '2026-11-05',
      });
      const chain = chainMonthlyBalances({
        availableMonths: ['2026-10', '2026-11'],
        closedSnapshots: {},
        concepts: sample.concepts,
        entries,
        entriesByMonth: withPlannedOpenMonths(entries, [], {}, []).entriesByMonth,
        currentDebts: sample.debts,
        rawBuckets: sample.savingsBuckets,
        debtPayments: sample.debtPayments,
      });

      const october = calculateDebtsSummary(sample.debts, entries, '2026-10', sample.debtPayments);
      expect(chain.debtsByMonth['2026-11']?.map((d) => [d.id, d.openingBalance])).toEqual(
        october.debts.map((d) => [d.debtId, Math.max(0, d.remainingBalance)])
      );
      expect(chain.debtsByMonth['2026-11']?.every((d) => d.monthKey === '2026-11')).toBe(true);
      expect(chain.debtPayments.some((p) => p.entryId === novInstallment!.id && p.active)).toBe(true);
      expect(chain.debtPayments.length).toBe(sample.debtPayments.length + 1);
      expect(chain.savingsBucketsByMonth['2026-11']?.every((b) => b.monthKey === '2026-11')).toBe(true);
    });

    it('honors a direct edit of the debt in the month', () => {
      const { sample } = closeSampleMonth();
      const novemberOpening = chainMonthlyBalances({
        availableMonths: ['2026-10', '2026-11'],
        closedSnapshots: {},
        concepts: sample.concepts,
        entries: sample.entries,
        entriesByMonth: withPlannedOpenMonths(sample.entries, [], {}, []).entriesByMonth,
        currentDebts: sample.debts.map((d) =>
          d.id === 'debt_auto_loan' ? { ...d, monthKey: '2026-11', openingBalance: 1_234_000 } : d
        ),
        rawBuckets: sample.savingsBuckets,
        debtPayments: sample.debtPayments,
      }).debtsByMonth['2026-11']!.find((d) => d.id === 'debt_auto_loan')!.openingBalance;

      expect(novemberOpening).toBe(1_234_000);
    });

    it('reconstructs a closed first month from its snapshot and chains the next one', () => {
      const { sample, result } = closeSampleMonth();
      const chain = chainMonthlyBalances({
        availableMonths: ['2026-10', '2026-11'],
        closedSnapshots: { '2026-10': result.snapshot },
        concepts: sample.concepts,
        entries: [...sample.entries, ...result.nextMonthEntries],
        entriesByMonth: withPlannedOpenMonths([...sample.entries, ...result.nextMonthEntries], [], {}, [])
          .entriesByMonth,
        currentDebts: result.nextMonthDebts,
        rawBuckets: result.nextMonthSavingsBuckets.map((b) => ({ ...b, monthKey: '2026-11' })),
        debtPayments: sample.debtPayments,
      });
      expect(chain.debtsByMonth['2026-10']?.map((d) => d.openingBalance)).toEqual(
        sample.debts.map((d) => d.openingBalance)
      );
      expect(chain.debtsByMonth['2026-11']?.map((d) => d.openingBalance)).toEqual(
        result.nextMonthDebts.map((d) => d.openingBalance)
      );
      expect(chain.savingsBucketsByMonth['2026-10']?.find((b) => b.id === 'reserve')?.openingBalance).toBe(
        sample.savingsBuckets.find((b) => b.id === 'reserve')?.openingBalance
      );
    });
  });
});
