import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth } from '../../../data/firebase/firebaseConfig';
import { persistentStorage } from '../../storage/persistentStorageAdapter';
import {
  EMAIL_VERIFICATION_ENFORCED_SINCE_MS,
  __resetProfileSyncInFlightForTests,
  formatAuthError,
  loadPersistedSession,
  registerWithPersonalProfile,
  requiresEmailVerification,
  resolveEmailVerificationState,
  savePersistedSession,
  signInWithEmail,
  subscribeToAuthUser,
  syncAuthDisplayName,
  withFirebaseIdentity,
  type BFlowAuthUser,
} from '../authAdapter';

jest.mock('../../../data/firebase/firebaseConfig', () => ({
  ...jest.requireActual('../../../data/firebase/firebaseConfig'),
  getFirebaseAuth: jest.fn(),
  getFirebaseDb: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  ...jest.requireActual('firebase/auth'),
  createUserWithEmailAndPassword: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendEmailVerification: jest.fn(),
  setPersistence: jest.fn(async () => undefined),
  signInWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(async () => undefined),
}));

jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
}));

const BEFORE_ENFORCEMENT = new Date(EMAIL_VERIFICATION_ENFORCED_SINCE_MS - 86_400_000).toUTCString();
const AFTER_ENFORCEMENT = new Date(EMAIL_VERIFICATION_ENFORCED_SINCE_MS + 86_400_000).toUTCString();

function buildFirebaseUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'uid_new_account',
    email: 'nueva@correo.com',
    displayName: null,
    emailVerified: false,
    providerData: [{ providerId: 'password' }],
    metadata: { creationTime: AFTER_ENFORCEMENT },
    ...overrides,
  };
}

function mockProfileDocument(data: Record<string, unknown> | null): void {
  (getDoc as jest.Mock).mockResolvedValue({
    exists: () => data !== null,
    data: () => data ?? {},
  });
}

describe('authAdapter: verificación del correo con Firebase Authentication (ADR 0025)', () => {
  let fakeAuth: { languageCode: string | null };

  beforeEach(() => {
    jest.clearAllMocks();
    persistentStorage.clear();
    __resetProfileSyncInFlightForTests();
    fakeAuth = { languageCode: null };
    (getFirebaseAuth as jest.Mock).mockReturnValue(fakeAuth);
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
    mockProfileDocument(null);
  });

  describe('resolveEmailVerificationState', () => {
    it('never requires anything from a verified email', () => {
      expect(resolveEmailVerificationState(buildFirebaseUser({ emailVerified: true }))).toEqual({
        emailVerified: true,
        emailVerificationRequired: false,
      });
    });

    it('requires verification from a password account created since the enforcement date', () => {
      expect(resolveEmailVerificationState(buildFirebaseUser())).toEqual({
        emailVerified: false,
        emailVerificationRequired: true,
      });
    });

    it('exempts accounts created before the enforcement date, which stay unverified', () => {
      expect(
        resolveEmailVerificationState(
          buildFirebaseUser({ metadata: { creationTime: BEFORE_ENFORCEMENT } })
        )
      ).toEqual({ emailVerified: false, emailVerificationRequired: false });
    });

    it('requires verification right after registering, whatever the metadata says', () => {
      expect(
        resolveEmailVerificationState(buildFirebaseUser({ metadata: {} }), {
          isNewRegistration: true,
        }).emailVerificationRequired
      ).toBe(true);
    });

    it('does not lock out an account whose creation date is unknown', () => {
      expect(
        resolveEmailVerificationState({ email: 'x@correo.com' }).emailVerificationRequired
      ).toBe(false);
      expect(
        resolveEmailVerificationState(buildFirebaseUser({ metadata: { creationTime: 'no-date' } }))
          .emailVerificationRequired
      ).toBe(false);
    });

    it('never requires it from an account that signs in with Google', () => {
      expect(
        resolveEmailVerificationState(
          buildFirebaseUser({ providerData: [{ providerId: 'google.com' }] })
        ).emailVerificationRequired
      ).toBe(false);
    });
  });

  describe('requiresEmailVerification', () => {
    const pendingUser: BFlowAuthUser = {
      uid: 'uid_new_account',
      email: 'nueva@correo.com',
      displayName: 'Nueva',
      emailVerified: false,
      emailVerificationRequired: true,
      provider: 'firebase',
    };

    it('gates only Firebase accounts that are required and still unverified', () => {
      expect(requiresEmailVerification(pendingUser)).toBe(true);
      expect(requiresEmailVerification({ ...pendingUser, emailVerified: true })).toBe(false);
      expect(requiresEmailVerification({ ...pendingUser, emailVerificationRequired: false })).toBe(
        false
      );
      expect(requiresEmailVerification({ ...pendingUser, provider: 'local-demo' })).toBe(false);
      expect(requiresEmailVerification(null)).toBe(false);
    });

    it('does not gate a session saved before the verification state existed', () => {
      expect(
        requiresEmailVerification({
          uid: 'uid_old',
          email: 'vieja@correo.com',
          displayName: 'Vieja',
          provider: 'firebase',
        })
      ).toBe(false);
    });
  });

  it('withFirebaseIdentity adopts the email and the verification state that Firebase reports', () => {
    const session: BFlowAuthUser = {
      uid: 'uid_new_account',
      email: 'vieja@correo.com',
      displayName: 'Nombre Guardado',
      financialGoal: 'Meta',
      emailVerified: false,
      emailVerificationRequired: true,
      provider: 'firebase',
    };

    expect(
      withFirebaseIdentity(session, buildFirebaseUser({ email: 'nueva@correo.com', emailVerified: true }))
    ).toEqual({
      ...session,
      email: 'nueva@correo.com',
      emailVerified: true,
      emailVerificationRequired: false,
    });
    // Without an email in Firebase the saved one is kept
    expect(withFirebaseIdentity(session, { email: null }).email).toBe('vieja@correo.com');
  });

  describe('registerWithPersonalProfile', () => {
    const registration = {
      displayName: 'Cuenta Nueva',
      email: ' Nueva@Correo.com ',
      password: 'Secreto123!',
    };

    it('sends the Firebase verification email in Spanish and returns the account as pending', async () => {
      const firebaseUser = buildFirebaseUser();
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: firebaseUser });

      const user = await registerWithPersonalProfile(registration);

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        fakeAuth,
        'nueva@correo.com',
        'Secreto123!'
      );
      expect(fakeAuth.languageCode).toBe('es');
      expect(sendEmailVerification).toHaveBeenCalledWith(firebaseUser);
      expect(user).toMatchObject({
        uid: 'uid_new_account',
        displayName: 'Cuenta Nueva',
        emailVerified: false,
        emailVerificationRequired: true,
      });
      expect(requiresEmailVerification(user)).toBe(true);
      expect(requiresEmailVerification(loadPersistedSession())).toBe(true);
    });

    it('still creates the account when the verification email cannot be sent', async () => {
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: buildFirebaseUser() });
      (sendEmailVerification as jest.Mock).mockRejectedValue(
        new Error('Firebase: Error (auth/too-many-requests).')
      );

      const user = await registerWithPersonalProfile(registration);

      expect(user.uid).toBe('uid_new_account');
      expect(requiresEmailVerification(user)).toBe(true);
    });
  });

  describe('subscribeToAuthUser', () => {
    function emitAuthState(firebaseUser: unknown): Array<BFlowAuthUser | null> {
      const received: Array<BFlowAuthUser | null> = [];
      (onAuthStateChanged as jest.Mock).mockImplementation((_auth, callback) => {
        callback(firebaseUser);
        return () => {};
      });
      subscribeToAuthUser((user) => received.push(user));
      return received;
    }

    it('lifts the gate of a saved session once Firebase reports the email as verified', () => {
      savePersistedSession({
        uid: 'uid_new_account',
        email: 'nueva@correo.com',
        displayName: 'Cuenta Nueva',
        lastLoginAt: new Date().toISOString(),
        emailVerified: false,
        emailVerificationRequired: true,
        provider: 'firebase',
      });

      const received = emitAuthState(buildFirebaseUser({ emailVerified: true }));

      expect(received[0]).toMatchObject({ displayName: 'Cuenta Nueva', emailVerified: true });
      expect(requiresEmailVerification(received[0] ?? null)).toBe(false);
      expect(loadPersistedSession()?.emailVerified).toBe(true);
    });

    it('delivers a first session already carrying the verification state', () => {
      const received = emitAuthState(buildFirebaseUser());

      expect(received[0]).toMatchObject({
        uid: 'uid_new_account',
        authProvider: 'password',
        emailVerified: false,
        emailVerificationRequired: true,
      });
    });
  });

  describe('profile document after an email change', () => {
    const freshProfile = {
      displayName: 'Cuenta Nueva',
      email: 'vieja@correo.com',
      lastLoginAt: new Date().toISOString(),
      createdAt: '2026-11-14T10:00:00.000Z',
      activeMonthKey: '2026-11',
      onboardingCompleted: true,
    };

    it('rewrites the profile email when Firestore still holds the previous one', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: buildFirebaseUser({ emailVerified: true }),
      });
      mockProfileDocument(freshProfile);

      const user = await signInWithEmail('nueva@correo.com', 'secreto123');

      expect(user.email).toBe('nueva@correo.com');
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect((setDoc as jest.Mock).mock.calls[0][1]).toMatchObject({ email: 'nueva@correo.com' });
    });

    it('does not write when the profile email is already current', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: buildFirebaseUser({ emailVerified: true }),
      });
      mockProfileDocument({ ...freshProfile, email: 'nueva@correo.com' });

      await signInWithEmail('nueva@correo.com', 'secreto123');

      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  describe('profile saved in users/{uid}', () => {
    const storedProfile = {
      displayName: 'Nombre En Firestore',
      email: 'nueva@correo.com',
      lastLoginAt: new Date().toISOString(),
      createdAt: '2026-11-14T10:00:00.000Z',
      activeMonthKey: '2026-11',
      onboardingCompleted: true,
    };

    it('treats an empty goal in Firestore as cleared instead of rescuing the one saved on the device', async () => {
      // Session older than 24 h: the profile document is read again
      savePersistedSession({
        uid: 'uid_new_account',
        email: 'nueva@correo.com',
        displayName: 'Nombre Viejo',
        financialGoal: 'Meta vieja del dispositivo',
        lastLoginAt: '2026-01-01T00:00:00.000Z',
        provider: 'firebase',
      });
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: buildFirebaseUser({ emailVerified: true }),
      });
      mockProfileDocument({ ...storedProfile, financialGoal: '' });

      const user = await signInWithEmail('nueva@correo.com', 'secreto123');

      expect(user.displayName).toBe('Nombre En Firestore');
      expect(user.financialGoal).toBeUndefined();
    });

    it('adopts the name and the goal saved from another device', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: buildFirebaseUser({ emailVerified: true }),
      });
      mockProfileDocument({ ...storedProfile, financialGoal: 'Meta desde otro dispositivo' });

      const user = await signInWithEmail('nueva@correo.com', 'secreto123');

      expect(user).toMatchObject({
        displayName: 'Nombre En Firestore',
        financialGoal: 'Meta desde otro dispositivo',
      });
    });

    it('keeps the goal saved on the device while the profile document cannot be read', async () => {
      savePersistedSession({
        uid: 'uid_new_account',
        email: 'nueva@correo.com',
        displayName: 'Nombre Viejo',
        financialGoal: 'Meta del dispositivo',
        lastLoginAt: '2026-01-01T00:00:00.000Z',
        provider: 'firebase',
      });
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: buildFirebaseUser({ emailVerified: true }),
      });
      (getDoc as jest.Mock).mockRejectedValue(new Error('offline'));

      const user = await signInWithEmail('nueva@correo.com', 'secreto123');

      expect(user.financialGoal).toBe('Meta del dispositivo');
    });
  });

  describe('syncAuthDisplayName', () => {
    it('copies the new name to the Firebase Auth profile', async () => {
      const currentUser = { displayName: 'Nombre Viejo' };
      (getFirebaseAuth as jest.Mock).mockReturnValue({ currentUser });

      await syncAuthDisplayName('Nombre Nuevo');

      expect(updateProfile).toHaveBeenCalledWith(currentUser, { displayName: 'Nombre Nuevo' });
    });

    it('skips the call when the name is already current or there is no Firebase session', async () => {
      (getFirebaseAuth as jest.Mock).mockReturnValue({ currentUser: { displayName: 'Mismo' } });
      await syncAuthDisplayName('Mismo');

      (getFirebaseAuth as jest.Mock).mockReturnValue({ currentUser: null });
      await syncAuthDisplayName('Otro');

      expect(updateProfile).not.toHaveBeenCalled();
    });

    it('never fails: Firestore already holds the name', async () => {
      (getFirebaseAuth as jest.Mock).mockReturnValue({ currentUser: { displayName: 'Viejo' } });
      (updateProfile as jest.Mock).mockRejectedValueOnce(
        new Error('Firebase: Error (auth/network-request-failed).')
      );

      await expect(syncAuthDisplayName('Nuevo')).resolves.toBeUndefined();
    });
  });

  it('translates the Firebase errors of the account email actions', () => {
    expect(formatAuthError(new Error('Firebase: Error (auth/requires-recent-login).'), 'x')).toBe(
      'Por seguridad, cierra sesión, vuelve a entrar y repite la acción.'
    );
    expect(formatAuthError(new Error('Firebase: Error (auth/user-token-expired).'), 'x')).toBe(
      'Tu sesión venció. Inicia sesión de nuevo.'
    );
    expect(formatAuthError(new Error('Firebase: Error (auth/operation-not-allowed).'), 'x')).toBe(
      'Esta acción no está habilitada en el proyecto de Firebase.'
    );
  });
});
