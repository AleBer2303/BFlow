import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/firebaseConfig';
import {
  serializeConceptForFirestore,
  serializeDebtForFirestore,
  serializeDebtPaymentForFirestore,
  serializeMonthEntryForFirestore,
  serializeProvisionPlanForFirestore,
  serializeSavingsBucketForFirestore,
} from '../mappers/firestoreSchemas';
import { FirestoreBudgetRepository } from '../repositories/budgetRepository';
import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';
import {
  __resetProfileSyncInFlightForTests,
  loadPersistedSession,
  savePersistedSession,
  signInWithEmail,
  subscribeToAuthUser,
  type BFlowAuthUser,
} from '../../platform/auth/authAdapter';
import {
  loadPersistedAccountEnvelope,
  savePersistedAccount,
} from '../../platform/storage/accountCache';
import { persistentStorage } from '../../platform/storage/persistentStorageAdapter';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from 'firebase/auth';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...segments: string[]) => ({
    path: segments.join('/'),
    type: 'collection',
  })),
  doc: jest.fn((_db, ...segments: string[]) => ({
    path: segments.join('/'),
    id: segments[segments.length - 1],
    type: 'doc',
  })),
  query: jest.fn((colRef) => colRef),
  where: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(async () => undefined),
  deleteDoc: jest.fn(async () => undefined),
  writeBatch: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: {
    credential: jest.fn(),
  },
  browserLocalPersistence: {},
  createUserWithEmailAndPassword: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  setPersistence: jest.fn(async () => undefined),
  signInWithCredential: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(async () => undefined),
  updateProfile: jest.fn(async () => undefined),
}));

jest.mock('../firebase/firebaseConfig', () => ({
  getFirebaseDb: jest.fn(() => ({})),
  getFirebaseAuth: jest.fn(() => ({})),
}));

interface MockFirestoreState {
  docsByPath: Map<string, Record<string, unknown>>;
  collectionDocsByPath: Map<string, Array<{ id: string; data: Record<string, unknown> }>>;
  getDocCalls: string[];
  getDocsCalls: string[];
  docsReadCount: number;
  setDocCalls: Array<{ path: string; data: unknown }>;
  batchCommitCount: number;
}

function createMockFirestoreEnvironment(): MockFirestoreState {
  const state: MockFirestoreState = {
    docsByPath: new Map(),
    collectionDocsByPath: new Map(),
    getDocCalls: [],
    getDocsCalls: [],
    docsReadCount: 0,
    setDocCalls: [],
    batchCommitCount: 0,
  };

  (getDoc as jest.Mock).mockImplementation(async (ref: { path: string }) => {
    state.getDocCalls.push(ref.path);
    const data = state.docsByPath.get(ref.path);
    if (data !== undefined) {
      state.docsReadCount += 1;
    } else {
      // Firestore charges 1 document read even when a document is not found on a direct getDoc
      state.docsReadCount += 1;
    }
    return {
      exists: () => data !== undefined,
      data: () => data,
      id: ref.path.split('/').pop(),
      ref,
    };
  });

  (getDocs as jest.Mock).mockImplementation(async (colRef: { path: string }) => {
    state.getDocsCalls.push(colRef.path);
    const items = state.collectionDocsByPath.get(colRef.path) ?? [];
    // Firestore charges 1 read per returned document, or 1 read minimum if query returns 0 docs
    state.docsReadCount += Math.max(1, items.length);
    return {
      docs: items.map((item) => ({
        id: item.id,
        data: () => item.data,
        ref: { path: `${colRef.path}/${item.id}`, id: item.id },
      })),
    };
  });

  (setDoc as jest.Mock).mockImplementation(
    async (ref: { path: string }, data: Record<string, unknown>) => {
      state.setDocCalls.push({ path: ref.path, data });
      const prev = state.docsByPath.get(ref.path) ?? {};
      state.docsByPath.set(ref.path, { ...prev, ...data });
    }
  );

  (deleteDoc as jest.Mock).mockImplementation(async (ref: { path: string }) => {
    state.docsByPath.delete(ref.path);
  });

  (writeBatch as jest.Mock).mockImplementation(() => {
    const ops: Array<() => void> = [];
    return {
      set: jest.fn((ref: { path: string; id: string }, data: Record<string, unknown>) => {
        ops.push(() => {
          const prev = state.docsByPath.get(ref.path) ?? {};
          const merged = { ...prev, ...data };
          state.docsByPath.set(ref.path, merged);

          const parts = ref.path.split('/');
          if (parts.length === 4) {
            const colPath = parts.slice(0, 3).join('/');
            const list = state.collectionDocsByPath.get(colPath) ?? [];
            const idx = list.findIndex((x) => x.id === ref.id);
            if (idx >= 0) {
              list[idx] = { id: ref.id, data: merged };
            } else {
              list.push({ id: ref.id, data: merged });
            }
            state.collectionDocsByPath.set(colPath, list);
          }
        });
      }),
      delete: jest.fn((ref: { path: string }) => {
        ops.push(() => {
          state.docsByPath.delete(ref.path);
        });
      }),
      commit: jest.fn(async () => {
        for (const op of ops) op();
        state.batchCommitCount += 1;
      }),
    };
  });

  return state;
}

function populateSeededOwnerFirestore(state: MockFirestoreState, uid: string, nowIso: string): void {
  const seed = buildOctober2026SeedPayload();

  state.docsByPath.set(`users/${uid}`, {
    uid,
    email: 'demo.owner@bflow.example',
    displayName: 'Alejandro Bernal',
    seededOctober2026: true,
    onboardingCompleted: true,
    activeMonthKey: '2026-10',
    lastLoginAt: nowIso,
  });

  state.collectionDocsByPath.set(
    `users/${uid}/concepts`,
    seed.concepts.map((c) => ({ id: c.id, data: serializeConceptForFirestore(c) }))
  );
  state.collectionDocsByPath.set(
    `users/${uid}/entries`,
    seed.entries.map((e) => ({ id: e.id, data: serializeMonthEntryForFirestore(e) }))
  );
  state.collectionDocsByPath.set(
    `users/${uid}/debts`,
    seed.debts.map((d) => ({ id: d.id, data: serializeDebtForFirestore(d) }))
  );
  state.collectionDocsByPath.set(
    `users/${uid}/debtPayments`,
    seed.debtPayments.map((dp) => ({ id: dp.id, data: serializeDebtPaymentForFirestore(dp) }))
  );
  state.collectionDocsByPath.set(
    `users/${uid}/savingsBuckets`,
    seed.savingsBuckets.map((sb) => ({ id: sb.id, data: serializeSavingsBucketForFirestore(sb) }))
  );
  state.docsByPath.set(`users/${uid}/provisionPlans/moto_ideal`, {
    id: 'moto_ideal',
    ...serializeProvisionPlanForFirestore(seed.provisionPlan),
  });
  state.collectionDocsByPath.set(`users/${uid}/monthSnapshots`, []);
}

describe('Phase 4 Part A: Firestore Read Counts & Sequential Cascade Elimination (R-11, R-12, R-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistentStorage.clear();
    savePersistedSession(null);
    __resetProfileSyncInFlightForTests();
    (getFirebaseDb as jest.Mock).mockReturnValue({});
    (getFirebaseAuth as jest.Mock).mockReturnValue({});
  });

  it('Scenario 1 (Cold Boot / Arranque): reads users/{uid} only ONCE, performs 0 pre-flight seed round-trips, and skips lastLoginAt write when < 24h', async () => {
    const nowIso = new Date().toISOString();
    const uid = 'uid_owner_boot';
    const state = createMockFirestoreEnvironment();
    populateSeededOwnerFirestore(state, uid, nowIso);

    // Persisted session from < 24h ago
    const persistedUser: BFlowAuthUser = {
      uid,
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
      authProvider: 'password',
      lastLoginAt: nowIso,
      activeMonthKey: '2026-10',
      provider: 'firebase',
    };
    savePersistedSession(persistedUser);

    let authCallback: ((u: unknown) => void) | null = null;
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    const repo = new FirestoreBudgetRepository({} as unknown as Firestore);

    // Trigger auth listener restoration + cloud account load
    subscribeToAuthUser(() => {});
    authCallback!({
      uid,
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
      providerData: [{ providerId: 'password' }],
    });

    const fullAccount = await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example');
    expect(fullAccount.activeMonthKey).toBe('2026-10');
    expect(fullAccount.concepts).toHaveLength(14);
    expect(fullAccount.entries).toHaveLength(12);

    // Exact getDoc & getDocs count verification:
    // - getDoc: users/{uid} (1) + provisionPlans/moto_ideal (1) = 2 getDoc calls total (previously 4)
    // - getDocs: concepts, entries, debts, debtPayments, savingsBuckets, monthSnapshots = 6 getDocs calls
    const userDocReads = state.getDocCalls.filter((p) => p === `users/${uid}`);
    expect(userDocReads).toHaveLength(1);
    expect(state.getDocCalls).toHaveLength(2);
    expect(state.getDocsCalls).toHaveLength(6);

    // Zero redundant writes to users/{uid} on boot when lastLoginAt < 24h and activeMonthKey matches
    expect(state.setDocCalls).toHaveLength(0);

    // Total documents read for 1-month seeded account:
    // 1 (user) + 14 (concepts) + 12 (entries) + 2 (debts) + 1 (debtPayments) + 2 (savingsBuckets) + 1 (plan) + 1 (empty monthSnapshots query min) = 34 docs
    expect(state.docsReadCount).toBe(34);
  });

  it('Scenario 2 (Login): deduplicates concurrent syncUserProfileDocument between signInWithEmail and onAuthStateChanged, reading users/{uid} only once in auth and writing lastLoginAt at most once per 24h', async () => {
    const uid = 'uid_owner_login';
    const staleLoginIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
    const state = createMockFirestoreEnvironment();
    populateSeededOwnerFirestore(state, uid, staleLoginIso);

    let authCallback: ((u: unknown) => void) | null = null;
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    const firebaseUser = {
      uid,
      email: 'demo.owner@bflow.example',
      displayName: 'Alejandro Bernal',
      providerData: [{ providerId: 'password' }],
    };

    (signInWithEmailAndPassword as jest.Mock).mockImplementation(async () => {
      // Firebase Auth fires onAuthStateChanged listener concurrently when signIn resolves
      authCallback?.(firebaseUser);
      return { user: firebaseUser };
    });

    subscribeToAuthUser(() => {});

    const signedInUser = await signInWithEmail('demo.owner@bflow.example', 'secret123');
    expect(signedInUser.uid).toBe(uid);

    const repo = new FirestoreBudgetRepository({} as unknown as Firestore);
    await repo.loadFullCloudAccount(uid, signedInUser.email, { isRegistration: false });

    // Auth profile sync must have read users/{uid} only ONCE (deduplicated between signInWithEmail & onAuthStateChanged)
    // and loadFullCloudAccount read users/{uid} ONCE -> 2 reads total instead of 4
    const userDocReads = state.getDocCalls.filter((p) => p === `users/${uid}`);
    expect(userDocReads).toHaveLength(2);
    expect(state.getDocCalls).toHaveLength(3); // 2 users/{uid} + 1 provisionPlans/moto_ideal
    expect(state.getDocsCalls).toHaveLength(6);

    // Only 1 setDoc write for lastLoginAt (since previous was 48h ago), NOT 2 duplicate writes
    const userProfileWrites = state.setDocCalls.filter((w) => w.path === `users/${uid}`);
    expect(userProfileWrites).toHaveLength(1);

    // If user signs in again within 24 hours, 0 new lastLoginAt writes occur
    state.setDocCalls.length = 0;
    await signInWithEmail('demo.owner@bflow.example', 'secret123');
    expect(state.setDocCalls.filter((w) => w.path === `users/${uid}`)).toHaveLength(0);
    expect(loadPersistedSession()?.uid).toBe(uid);
  });

  it('Scenario 3 (New User / Usuario Nuevo): performs 1 parallel wave without extra seed queries for non-owner and flags needsOnboarding', async () => {
    const uid = 'uid_brand_new_user';
    const state = createMockFirestoreEnvironment();

    const repo = new FirestoreBudgetRepository({} as unknown as Firestore);
    const result = await repo.loadFullCloudAccount(uid, 'nuevo@usuario.com', {
      isRegistration: true,
    });

    expect(result.needsOnboarding).toBe(true);
    expect(result.concepts).toHaveLength(0);
    expect(result.entries).toHaveLength(0);

    // Only 1 read of users/{uid} and 1 read of provisionPlans/moto_ideal
    expect(state.getDocCalls).toEqual([
      `users/${uid}`,
      `users/${uid}/provisionPlans/moto_ideal`,
    ]);
    expect(state.getDocsCalls).toHaveLength(6);
    // 1 batch commit to persist initial activeMonthKey + dataRevision on users/{uid} (0 seed collection writes)
    expect(state.batchCommitCount).toBe(1);
    expect(state.docsByPath.get(`users/${uid}`)?.dataRevision).toBeDefined();
  });

  it('R-14: deleteOrResetEntry performs 0 getDoc calls when entry and concept are passed from the store', async () => {
    const uid = 'uid_owner_reset';
    const state = createMockFirestoreEnvironment();
    const seed = buildOctober2026SeedPayload();
    const sampleEntry = seed.entries.find((e) => e.id === '2026-10_exp_cuota_funfami')!;
    const sampleConcept = seed.concepts.find((c) => c.id === sampleEntry.conceptId)!;

    const repo = new FirestoreBudgetRepository({} as unknown as Firestore);
    await repo.deleteOrResetEntry(uid, sampleEntry.id, {
      entry: sampleEntry,
      concept: sampleConcept,
    });

    // Must perform ZERO getDoc calls (previously 2 sequential getDoc calls)
    expect(state.getDocCalls).toHaveLength(0);
    expect(state.getDocsCalls).toHaveLength(0);
    expect(state.batchCommitCount).toBe(1);

    // Fallback: if called without options, still works by reading from Firestore
    state.docsByPath.set(
      `users/${uid}/entries/${sampleEntry.id}`,
      serializeMonthEntryForFirestore(sampleEntry)
    );
    state.docsByPath.set(
      `users/${uid}/concepts/${sampleConcept.id}`,
      serializeConceptForFirestore(sampleConcept)
    );
    await repo.deleteOrResetEntry(uid, sampleEntry.id);
    expect(state.getDocCalls).toEqual([
      `users/${uid}/entries/${sampleEntry.id}`,
      `users/${uid}/concepts/${sampleConcept.id}`,
    ]);
  });

  describe('Phase 4 Part B: Account dataRevision, Write Path Guard & Conditional Cache Validation (R-13)', () => {
    it('Guard Test: fails if any write method on FirestoreBudgetRepository bypasses commitUserDataMutationBatch or calls raw setDoc/deleteDoc', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as { readFileSync: (p: string, enc: string) => string };
      const source = fs.readFileSync('src/data/repositories/budgetRepository.ts', 'utf8');

      // 1. Forbidden raw setDoc / deleteDoc imports or calls in budgetRepository.ts
      expect(source).not.toMatch(/\bsetDoc\s*\(/);
      expect(source).not.toMatch(/\bdeleteDoc\s*\(/);

      // 2. Every public method on FirestoreBudgetRepository must be either a known read/helper method
      //    or a write method that routes through this.commitUserDataMutationBatch(...)
      const readOrPureMethods = new Set([
        'constructor',
        'loadMonthWorkspace',
        'loadFullCloudAccount',
        'closeMonth', // delegates to persistMonthCloseResult -> commitUserDataMutationBatch
      ]);

      const expectedWriteMethods = [
        'seedOctober2026IfEmpty',
        'toggleEntryCompletion',
        'addMonthEntry',
        'deleteOrResetEntry',
        'persistMonthCloseResult',
        'saveOrUpdateEntry',
        'saveCustomConceptAndEntry',
        'deleteEntryCompletely',
        'reopenMonthInCloud',
        'deleteMonthInCloud',
        'saveConcept',
        'deleteConcept',
        'saveDebt',
        'deleteDebt',
        'saveSavingsBucket',
        'deleteSavingsBucket',
        'saveProvisionPlan',
        'saveInitialAccountSetup',
        'saveActiveMonthKey',
        'saveUserProfile',
        'resetFullAccountInCloud',
      ];

      const protoMethods = Object.getOwnPropertyNames(FirestoreBudgetRepository.prototype).filter(
        (name) =>
          name !== 'constructor' &&
          !name.startsWith('get') &&
          !name.startsWith('restore') &&
          !name.startsWith('commitUserDataMutationBatch')
      );

      for (const methodName of protoMethods) {
        const isKnownRead = readOrPureMethods.has(methodName);
        const isKnownWrite = expectedWriteMethods.includes(methodName);
        expect(isKnownRead || isKnownWrite).toBe(true);
      }

      // 3. Extract the FirestoreBudgetRepository class body and verify every write method calls commitUserDataMutationBatch
      //    and that writeBatch(this.db) is ONLY called inside commitUserDataMutationBatch.
      const classStart = source.indexOf('export class FirestoreBudgetRepository');
      expect(classStart).toBeGreaterThan(0);
      const classBody = source.slice(classStart);

      const writeBatchCalls = classBody.match(/writeBatch\s*\(\s*this\.db\s*\)/g) ?? [];
      expect(writeBatchCalls).toHaveLength(1);

      const methodBlocks = classBody.split(/\r?\n  (?:private\s+)?async\s+/);
      for (const writeMethod of expectedWriteMethods) {
        const block = methodBlocks.find((b) => new RegExp(`^${writeMethod}\\s*\\(`).test(b));
        expect(block).toBeDefined();
        expect(block).toContain('this.commitUserDataMutationBatch(');
      }
    });

    it('updates users/{uid}.dataRevision and local cache envelope dataRevision on every write operation', async () => {
      const uid = 'uid_revision_writer';
      const nowIso = new Date().toISOString();
      const state = createMockFirestoreEnvironment();
      populateSeededOwnerFirestore(state, uid, nowIso);

      const repo = new FirestoreBudgetRepository({} as unknown as Firestore);
      const initialAccount = await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example');
      savePersistedAccount(uid, initialAccount, nowIso, 'rev_initial_0');

      const seed = buildOctober2026SeedPayload();
      const sampleConcept = seed.concepts[0]!;
      await repo.saveConcept(uid, { ...sampleConcept, name: 'Salario Actualizado' });

      const userDoc = state.docsByPath.get(`users/${uid}`);
      expect(typeof userDoc?.dataRevision).toBe('string');
      expect((userDoc?.dataRevision as string).startsWith('rev_')).toBe(true);
      expect(userDoc?.dataRevision).not.toBe('rev_initial_0');

      // Local cache envelope must also have been updated with the exact same dataRevision
      const envelopeAfterConcept = loadPersistedAccountEnvelope(uid);
      expect(envelopeAfterConcept?.dataRevision).toBe(userDoc?.dataRevision);

      const prevRev = userDoc?.dataRevision as string;
      await repo.saveActiveMonthKey(uid, '2026-11');
      const userDocAfterMonth = state.docsByPath.get(`users/${uid}`);
      expect(typeof userDocAfterMonth?.dataRevision).toBe('string');
      expect(userDocAfterMonth?.dataRevision).not.toBe(prevRev);
      expect(loadPersistedAccountEnvelope(uid)?.dataRevision).toBe(userDocAfterMonth?.dataRevision);
    });

    it('Short-circuits collection reads on startup (1 getDoc, 0 getDocs = 1 doc read total) when dataRevision matches and cache is < 24h old', async () => {
      const uid = 'uid_cached_boot';
      const nowIso = new Date().toISOString();
      const state = createMockFirestoreEnvironment();
      populateSeededOwnerFirestore(state, uid, nowIso);
      state.docsByPath.set(`users/${uid}`, {
        ...state.docsByPath.get(`users/${uid}`),
        dataRevision: 'rev_match_12345',
      });

      const repo = new FirestoreBudgetRepository({} as unknown as Firestore);
      // Perform initial load to build cached payload
      const cachedAccount = await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example');
      expect(cachedAccount.dataRevision).toBe('rev_match_12345');

      // Reset counters to measure warm-cache startup
      state.getDocCalls.length = 0;
      state.getDocsCalls.length = 0;
      state.docsReadCount = 0;

      const bootResult = await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example', {
        cachedAccount,
        cachedDataRevision: 'rev_match_12345',
        cachedSavedAt: nowIso,
      });

      // Must read ONLY users/{uid} (1 getDoc, 0 getDocs, 1 document total)
      expect(state.getDocCalls).toEqual([`users/${uid}`]);
      expect(state.getDocsCalls).toHaveLength(0);
      expect(state.docsReadCount).toBe(1);
      expect(bootResult.entries).toHaveLength(12);
      expect(bootResult.dataRevision).toBe('rev_match_12345');
    });

    it('Performs full collection load when dataRevision differs, when cache is >= 24h old, or when forceFullSync is true (manual sync)', async () => {
      const uid = 'uid_full_sync_cases';
      const nowIso = new Date().toISOString();
      const state = createMockFirestoreEnvironment();
      populateSeededOwnerFirestore(state, uid, nowIso);
      state.docsByPath.set(`users/${uid}`, {
        ...state.docsByPath.get(`users/${uid}`),
        dataRevision: 'rev_cloud_v2',
      });

      const repo = new FirestoreBudgetRepository({} as unknown as Firestore);
      const cachedAccount = await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example');

      // Case A: Revision mismatch ('rev_local_v1' !== 'rev_cloud_v2') -> full load, but reuses the single users/{uid} read!
      state.getDocCalls.length = 0;
      state.getDocsCalls.length = 0;
      state.docsReadCount = 0;

      await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example', {
        cachedAccount,
        cachedDataRevision: 'rev_local_v1',
        cachedSavedAt: nowIso,
      });
      expect(state.getDocCalls.filter((p) => p === `users/${uid}`)).toHaveLength(1);
      expect(state.getDocsCalls).toHaveLength(6);
      expect(state.docsReadCount).toBe(34);

      // Case B: Cache older than 24h -> full load
      state.getDocCalls.length = 0;
      state.getDocsCalls.length = 0;
      state.docsReadCount = 0;
      const staleSavedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

      await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example', {
        cachedAccount,
        cachedDataRevision: 'rev_cloud_v2',
        cachedSavedAt: staleSavedAt,
      });
      expect(state.getDocsCalls).toHaveLength(6);
      expect(state.docsReadCount).toBe(34);

      // Case C: Manual sync (forceFullSync: true) -> always performs full load even when revision matches and cache < 24h
      state.getDocCalls.length = 0;
      state.getDocsCalls.length = 0;
      state.docsReadCount = 0;

      await repo.loadFullCloudAccount(uid, 'demo.owner@bflow.example', {
        forceFullSync: true,
        cachedAccount,
        cachedDataRevision: 'rev_cloud_v2',
        cachedSavedAt: nowIso,
      });
      expect(state.getDocsCalls).toHaveLength(6);
      expect(state.docsReadCount).toBe(34);
    });
  });
});
