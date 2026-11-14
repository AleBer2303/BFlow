import { doc, writeBatch, type Firestore } from 'firebase/firestore';
import {
  FirestoreBudgetRepository,
  InMemoryBudgetRepository,
} from '../repositories/budgetRepository';

const batchSet = jest.fn();
const batchCommit = jest.fn();

jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  doc: jest.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  writeBatch: jest.fn(),
}));

describe('saveUserProfile: perfil del usuario en users/{uid}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    batchCommit.mockResolvedValue(undefined);
    (writeBatch as jest.Mock).mockReturnValue({ set: batchSet, commit: batchCommit });
  });

  it('merges the name and the goal into the user document through the common write path', async () => {
    const db = {} as Firestore;
    const repo = new FirestoreBudgetRepository(db);

    await repo.saveUserProfile('uid_profile_01', {
      displayName: 'Alejandro Bernal G.',
      financialGoal: 'Viaje a Japón',
    });

    expect(doc).toHaveBeenCalledWith(db, 'users', 'uid_profile_01');
    // A single write: the user document, nothing in the subcollections
    expect(batchSet).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = batchSet.mock.calls[0];
    expect(ref).toEqual({ path: 'users/uid_profile_01' });
    expect(options).toEqual({ merge: true });
    // Only fields that isValidUserProfile (firestore.rules) accepts
    expect(Object.keys(payload).sort()).toEqual([
      'dataRevision',
      'displayName',
      'financialGoal',
      'uid',
      'updatedAt',
    ]);
    expect(payload).toMatchObject({
      uid: 'uid_profile_01',
      displayName: 'Alejandro Bernal G.',
      financialGoal: 'Viaje a Japón',
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes an empty goal so a cleared goal reaches the cloud', async () => {
    const repo = new FirestoreBudgetRepository({} as Firestore);

    await repo.saveUserProfile('uid_profile_01', { displayName: 'Alejandro', financialGoal: '' });

    expect(batchSet.mock.calls[0][1].financialGoal).toBe('');
  });

  it('lets a Firestore failure reach the caller, which decides between queue and rollback', async () => {
    batchCommit.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    const repo = new FirestoreBudgetRepository({} as Firestore);

    await expect(
      repo.saveUserProfile('uid_profile_01', { displayName: 'Alejandro', financialGoal: '' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('keeps one profile per user in the in-memory repository', async () => {
    const repo = new InMemoryBudgetRepository(false);

    await repo.saveUserProfile('uid_a', { displayName: 'Ana', financialGoal: 'Casa' });
    await repo.saveUserProfile('uid_b', { displayName: 'Beto', financialGoal: '' });
    await repo.saveUserProfile('uid_a', { displayName: 'Ana María', financialGoal: 'Casa propia' });

    expect(repo.getUserProfile('uid_a')).toEqual({
      displayName: 'Ana María',
      financialGoal: 'Casa propia',
    });
    expect(repo.getUserProfile('uid_b')).toEqual({ displayName: 'Beto', financialGoal: '' });
    expect(repo.getUserProfile('uid_c')).toBeUndefined();
  });
});
