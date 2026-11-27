import { toggleMovementStatus } from '../../domain/checklist/checklist';
import { toAppMonthKey } from '../../domain/date/monthKey';
import { calculateDebtsSummary } from '../../domain/debts/debtCalculator';
import type { Debt, MonthSnapshot, SavingsBucket } from '../../domain/models/types';
import { closeMonthAndRollover } from '../../domain/month-close/monthClose';
import { DEMO_OWNER_SEED_EMAIL } from '../../platform/mode/ownerSeedEmail';
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
  markOwnerAccountSeeded,
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
  shouldSeedOwnerAccount,
  withPlannedOpenMonths,
  type AccountIdentity,
} from '../repositories/accountHydration';
import { EMPTY_PROVISION_PLAN } from '../repositories/budgetRepositoryShared';
import type { FullCloudAccountData } from '../repositories/budgetRepositoryTypes';
import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';

const ownerSeed = resolveAccountIdentity(undefined, DEMO_OWNER_SEED_EMAIL);
const regularUser = resolveAccountIdentity(undefined, 'persona@example.com');
const resetOwner = resolveAccountIdentity({ accountResetByUser: true }, DEMO_OWNER_SEED_EMAIL);
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

function closeSeedOctober() {
  const seed = buildOctober2026SeedPayload();
  const result = closeMonthAndRollover({
    closingMonthKey: '2026-10',
    closedAtIso: '2026-11-01T00:00:00.000Z',
    concepts: seed.concepts,
    entries: seed.entries,
    debts: seed.debts,
    debtPayments: seed.debtPayments,
    savingsBuckets: seed.savingsBuckets,
  });
  return { seed, result };
}

describe('accountHydration (Fase 4, CC-01)', () => {
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

  describe('2. identity', () => {
    it('tells the owner seed account apart from a reset owner and other users', () => {
      expect(ownerSeed).toMatchObject({ isOwner: true, isResetByUser: false, isOwnerSeedAccount: true });
      expect(resetOwner).toMatchObject({ isOwner: true, isResetByUser: true, isOwnerSeedAccount: false });
      expect(regularUser).toMatchObject({ isOwner: false, isOwnerSeedAccount: false });
    });

    it('falls back to the stored email when the caller has none', () => {
      const identity = resolveAccountIdentity({ email: DEMO_OWNER_SEED_EMAIL }, null);
      expect(identity.resolvedEmail).toBe(DEMO_OWNER_SEED_EMAIL);
      expect(identity.isOwner).toBe(true);
    });

    it('resolves the fallback active month and the stored one', () => {
      expect(resolveFallbackActiveMonthKey({ activeMonthKey: '2027-03' }, false)).toBe('2027-03');
      expect(resolveFallbackActiveMonthKey(undefined, true)).toBe('2026-10');
      expect(resolveFallbackActiveMonthKey(undefined, false)).toBe(newUserStartMonth);
      expect(parseSavedActiveMonthKey({ activeMonthKey: '2026-11' })).toBe('2026-11');
      expect(parseSavedActiveMonthKey({ activeMonthKey: '2026-13' })).toBeUndefined();
      expect(parseSavedActiveMonthKey({ activeMonthKey: 202611 })).toBeUndefined();
    });

    it('seeds only an owner account that was never seeded nor onboarded', () => {
      expect(shouldSeedOwnerAccount(ownerSeed, {})).toBe(true);
      expect(shouldSeedOwnerAccount(ownerSeed, { seededOctober2026: true })).toBe(false);
      expect(shouldSeedOwnerAccount(ownerSeed, { onboardingCompleted: true })).toBe(false);
      expect(shouldSeedOwnerAccount(resetOwner, {})).toBe(false);
      expect(shouldSeedOwnerAccount(regularUser, {})).toBe(false);
      expect(markOwnerAccountSeeded({ email: 'a' }, 'rev_9')).toEqual({
        email: 'a',
        seededOctober2026: true,
        onboardingCompleted: true,
        dataRevision: 'rev_9',
      });
    });
  });

  describe('3. closed months and the history window', () => {
    it('parses snapshots by month and skips malformed ones', () => {
      const { result } = closeSeedOctober();
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

    it('keeps one bucket per id, reports stale documents and heals the owner savings', () => {
      const docs = [
        bucketDoc('moto', { id: 'moto', name: 'Moto', openingBalance: 5 }),
        bucketDoc('legacy_doc', { id: 'moto', name: 'Moto vieja', openingBalance: 7 }),
        bucketDoc('savings', { id: 'savings', name: 'Ahorros', openingBalance: 16_880_000 }),
        bucketDoc('broken', { nope: true }),
      ];
      const owner = collectSavingsBuckets(docs, ownerSeed);
      expect(owner.staleRefs).toEqual(['ref:legacy_doc']);
      expect(owner.healedSavingsBucket?.openingBalance).toBe(1_000_000);
      expect(owner.buckets.map((b) => `${b.id}:${b.openingBalance}`)).toEqual([
        'moto:5',
        'savings:1000000',
      ]);

      const other = collectSavingsBuckets(docs, regularUser);
      expect(other.healedSavingsBucket).toBeNull();
      expect(other.buckets.find((b) => b.id === 'savings')?.openingBalance).toBe(16_880_000);
    });

    it('drops the empty legacy default buckets only on empty non-owner accounts', () => {
      const defaults: SavingsBucket[] = [
        { id: 'moto', name: 'Moto', openingBalance: 0 },
        { id: 'savings', name: 'Ahorros', openingBalance: 0 },
      ];
      const empty = { concepts: [], entries: [], debts: [] };
      expect(dropUnusedLegacyDefaultBuckets(defaults, regularUser, empty)).toEqual([]);
      expect(dropUnusedLegacyDefaultBuckets(defaults, resetOwner, empty)).toEqual([]);
      expect(dropUnusedLegacyDefaultBuckets(defaults, ownerSeed, empty)).toBe(defaults);
      const funded = [{ ...defaults[0]!, openingBalance: 10 }];
      expect(dropUnusedLegacyDefaultBuckets(funded, regularUser, empty)).toBe(funded);
      const withConcepts = { ...empty, concepts: buildOctober2026SeedPayload().concepts };
      expect(dropUnusedLegacyDefaultBuckets(defaults, regularUser, withConcepts)).toBe(defaults);
    });

    it('uses the stored plan, else the seed plan for the owner and an empty one for others', () => {
      const seedPlan = buildOctober2026SeedPayload().provisionPlan;
      const stored = { id: 'moto_ideal', ...serializeProvisionPlanForFirestore(seedPlan) };
      expect(resolveProvisionPlan(stored, regularUser).items).toHaveLength(seedPlan.items.length);
      expect(resolveProvisionPlan(undefined, regularUser)).toBe(EMPTY_PROVISION_PLAN);
      expect(resolveProvisionPlan(undefined, ownerSeed)).toEqual(seedPlan);
      expect(resolveProvisionPlan({ items: 'broken' }, regularUser)).toBe(EMPTY_PROVISION_PLAN);
    });

    it('decides the onboarding wizard', () => {
      const run = (identity: AccountIdentity, isRegistration?: boolean, hasConfiguredData = false) =>
        resolveNeedsOnboarding({ identity, isRegistration, hasConfiguredData });
      expect(run(resetOwner, false, true)).toBe(true);
      expect(run(regularUser, true, true)).toBe(true);
      expect(run(ownerSeed, true)).toBe(false);
      expect(run(regularUser, false)).toBe(false);
      expect(run(regularUser)).toBe(true);
      expect(run(regularUser, undefined, true)).toBe(false);
      expect(run(ownerSeed)).toBe(false);
    });

    it('counts any stored data or account flag as configured', () => {
      const none = { concepts: [], entries: [], debts: [], buckets: [], userData: undefined };
      expect(hasConfiguredAccountData(none)).toBe(false);
      expect(hasConfiguredAccountData({ ...none, userData: { onboardingCompleted: true } })).toBe(true);
      expect(hasConfiguredAccountData({ ...none, userData: { seededOctober2026: true } })).toBe(true);
      expect(
        hasConfiguredAccountData({ ...none, buckets: [{ id: 'x', name: 'x', openingBalance: 1 }] })
      ).toBe(true);
    });
  });

  describe('5. available months', () => {
    const base = {
      userData: undefined,
      savedActiveMonthKey: undefined,
      concepts: [],
      entries: [],
      debts: [],
      buckets: [],
      closedSnapshots: {},
      fallbackActiveMonthKey: 'fallback',
    };

    it('starts a new account in January and the owner seed in October', () => {
      expect(resolveAvailableMonths({ ...base, identity: regularUser })).toEqual({
        availableMonths: [newUserStartMonth],
        activeMonthKey: newUserStartMonth,
      });
      expect(resolveAvailableMonths({ ...base, identity: ownerSeed }).activeMonthKey).toBe('2026-10');
    });

    it('adds the month after each closed one and opens on the latest', () => {
      const closedSnapshots = { '2026-10': {} as MonthSnapshot };
      expect(
        resolveAvailableMonths({ ...base, identity: regularUser, closedSnapshots, savedActiveMonthKey: '2026-10' })
      ).toEqual({ availableMonths: ['2026-10', '2026-11'], activeMonthKey: '2026-11' });
    });

    it('ignores the old default October on other accounts without data in it', () => {
      const debts: Debt[] = [
        { id: 'd', groupKey: 'G', name: 'D', lender: 'L', openingBalance: 1, monthKey: '2027-02' },
      ];
      const buckets: SavingsBucket[] = [{ id: 'b', name: 'B', openingBalance: 1, monthKey: '2026-10' }];
      expect(
        resolveAvailableMonths({ ...base, identity: regularUser, debts, buckets, savedActiveMonthKey: '2026-10' })
          .availableMonths
      ).toEqual(['2027-02']);
      expect(
        resolveAvailableMonths({ ...base, identity: ownerSeed, debts, buckets, savedActiveMonthKey: '2026-10' })
          .availableMonths
      ).toEqual(['2026-10', '2027-02']);
    });
  });

  describe('6. users/{uid} write-back', () => {
    const base = {
      identity: regularUser,
      needsOnboarding: false,
      savedActiveMonthKey: '2026-11',
      activeMonthKey: '2026-11',
    };

    it('writes nothing when the document is up to date', () => {
      expect(
        planUserDocumentSync({ ...base, userData: { dataRevision: 'rev_1', onboardingCompleted: true } })
      ).toEqual({ existingDataRevision: 'rev_1', fieldsToWrite: null });
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
      });
      expect(
        planUserDocumentSync({
          ...base,
          identity: resetOwner,
          needsOnboarding: true,
          userData: { dataRevision: 'rev_1' },
        }).fieldsToWrite
      ).toBeNull();
    });
  });

  describe('7. open months and the balance chain', () => {
    it('plans the recurring entries of open months without entries only', () => {
      const { seed } = closeSeedOctober();
      const closed = { '2026-09': {} as MonthSnapshot };
      const { entries, entriesByMonth } = withPlannedOpenMonths(
        seed.entries,
        ['2026-09', '2026-10', '2026-11'],
        closed,
        seed.concepts
      );
      expect(entriesByMonth.has('2026-09')).toBe(false);
      expect(entriesByMonth.get('2026-10')).toHaveLength(seed.entries.length);
      expect(entriesByMonth.get('2026-11')?.length).toBeGreaterThan(0);
      expect(entries.length).toBe(seed.entries.length + (entriesByMonth.get('2026-11')?.length ?? 0));
      expect(withPlannedOpenMonths(seed.entries, ['2026-11'], {}, []).entries).toHaveLength(
        seed.entries.length
      );
    });

    it('opens each month with what the previous one left and synthesizes missing payments', () => {
      const { seed } = closeSeedOctober();
      const planned = withPlannedOpenMonths(seed.entries, ['2026-10', '2026-11'], {}, seed.concepts);
      const novInstallment = planned.entries.find(
        (e) => e.monthKey === '2026-11' && e.conceptId === 'exp_cuota_funfami'
      );
      expect(novInstallment).toBeDefined();
      const entries = toggleMovementStatus(planned.entries, novInstallment!.id, {
        actualAmount: novInstallment!.plannedAmount,
        completedAt: '2026-11-05',
      });
      const chain = chainMonthlyBalances({
        identity: ownerSeed,
        availableMonths: ['2026-10', '2026-11'],
        closedSnapshots: {},
        concepts: seed.concepts,
        entries,
        entriesByMonth: withPlannedOpenMonths(entries, [], {}, []).entriesByMonth,
        currentDebts: seed.debts,
        rawBuckets: seed.savingsBuckets,
        debtPayments: seed.debtPayments,
      });

      const october = calculateDebtsSummary(seed.debts, entries, '2026-10', seed.debtPayments);
      expect(chain.debtsByMonth['2026-11']?.map((d) => [d.id, d.openingBalance])).toEqual(
        october.debts.map((d) => [d.debtId, Math.max(0, d.remainingBalance)])
      );
      expect(chain.debtsByMonth['2026-11']?.every((d) => d.monthKey === '2026-11')).toBe(true);
      expect(chain.debtPayments.some((p) => p.entryId === novInstallment!.id && p.active)).toBe(true);
      expect(chain.debtPayments.length).toBe(seed.debtPayments.length + 1);
      expect(chain.savingsBucketsByMonth['2026-11']?.every((b) => b.monthKey === '2026-11')).toBe(true);
    });

    it('honors a direct edit in the month, but not the old seed reset value', () => {
      const { seed } = closeSeedOctober();
      const run = (openingBalance: number) =>
        chainMonthlyBalances({
          identity: ownerSeed,
          availableMonths: ['2026-10', '2026-11'],
          closedSnapshots: {},
          concepts: seed.concepts,
          entries: seed.entries,
          entriesByMonth: withPlannedOpenMonths(seed.entries, [], {}, []).entriesByMonth,
          currentDebts: seed.debts.map((d) =>
            d.id === 'debt_cb300f_moto' ? { ...d, monthKey: '2026-11', openingBalance } : d
          ),
          rawBuckets: seed.savingsBuckets,
          debtPayments: seed.debtPayments,
        }).debtsByMonth['2026-11']!.find((d) => d.id === 'debt_cb300f_moto')!.openingBalance;

      expect(run(1_234_000)).toBe(1_234_000);
      expect(run(4_400_000)).not.toBe(4_400_000);
    });

    it('reconstructs a closed first month from its snapshot and chains the next one', () => {
      const { seed, result } = closeSeedOctober();
      const chain = chainMonthlyBalances({
        identity: regularUser,
        availableMonths: ['2026-10', '2026-11'],
        closedSnapshots: { '2026-10': result.snapshot },
        concepts: seed.concepts,
        entries: [...seed.entries, ...result.nextMonthEntries],
        entriesByMonth: withPlannedOpenMonths([...seed.entries, ...result.nextMonthEntries], [], {}, [])
          .entriesByMonth,
        currentDebts: result.nextMonthDebts,
        rawBuckets: result.nextMonthSavingsBuckets.map((b) => ({ ...b, monthKey: '2026-11' })),
        debtPayments: seed.debtPayments,
      });
      expect(chain.debtsByMonth['2026-10']?.map((d) => d.openingBalance)).toEqual(
        seed.debts.map((d) => d.openingBalance)
      );
      expect(chain.debtsByMonth['2026-11']?.map((d) => d.openingBalance)).toEqual(
        result.nextMonthDebts.map((d) => d.openingBalance)
      );
    });
  });
});
