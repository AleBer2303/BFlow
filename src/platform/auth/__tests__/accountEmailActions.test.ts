import {
  getIdToken,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../../data/firebase/firebaseConfig';
import { persistentStorage } from '../../storage/persistentStorageAdapter';
import {
  __resetAccountEmailActionsForTests,
  hasPendingEmailChange,
  refreshAccountIdentity,
  requestEmailChange,
  sendPasswordResetLink,
  sendVerificationEmail,
} from '../accountEmailActions';
import {
  loadPersistedSession,
  savePersistedSession,
  type BFlowAuthUser,
} from '../authAdapter';

jest.mock('../../../data/firebase/firebaseConfig', () => ({
  ...jest.requireActual('../../../data/firebase/firebaseConfig'),
  getFirebaseAuth: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  ...jest.requireActual('firebase/auth'),
  getIdToken: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  reload: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  verifyBeforeUpdateEmail: jest.fn(),
}));

interface FakeFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  providerData: Array<{ providerId: string }>;
  metadata: { creationTime?: string };
}

interface FakeAuth {
  currentUser: FakeFirebaseUser | null;
  languageCode: string | null;
  authStateReady?: () => Promise<void>;
}

const NEW_ACCOUNT_CREATION_TIME = 'Sat, 14 Nov 2026 15:00:00 GMT';

function buildFirebaseUser(overrides: Partial<FakeFirebaseUser> = {}): FakeFirebaseUser {
  return {
    uid: 'uid_account_01',
    email: 'cuenta@correo.com',
    emailVerified: false,
    providerData: [{ providerId: 'password' }],
    metadata: { creationTime: NEW_ACCOUNT_CREATION_TIME },
    ...overrides,
  };
}

function useAuth(currentUser: FakeFirebaseUser | null): FakeAuth {
  const auth: FakeAuth = {
    currentUser,
    languageCode: null,
    authStateReady: jest.fn().mockResolvedValue(undefined),
  };
  (getFirebaseAuth as jest.Mock).mockReturnValue(auth);
  return auth;
}

const sessionUser: BFlowAuthUser = {
  uid: 'uid_account_01',
  email: 'cuenta@correo.com',
  displayName: 'Cuenta Nueva',
  authProvider: 'password',
  emailVerified: false,
  emailVerificationRequired: true,
  provider: 'firebase',
};

describe('accountEmailActions: correos de cuenta con Firebase Authentication (ADR 0025)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistentStorage.clear();
    __resetAccountEmailActionsForTests();
    (reauthenticateWithCredential as jest.Mock).mockResolvedValue({});
    (verifyBeforeUpdateEmail as jest.Mock).mockResolvedValue(undefined);
    (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
    (sendPasswordResetEmail as jest.Mock).mockResolvedValue(undefined);
    (reload as jest.Mock).mockResolvedValue(undefined);
    (getIdToken as jest.Mock).mockResolvedValue('token');
  });

  describe('sendPasswordResetLink', () => {
    it('asks Firebase for the reset email in Spanish, with the address normalized', async () => {
      const auth = useAuth(null);

      await sendPasswordResetLink('  Cuenta@Correo.com ');

      expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'cuenta@correo.com');
      expect(auth.languageCode).toBe('es');
    });

    it('rejects an address without @ before reaching Firebase', async () => {
      useAuth(null);

      await expect(sendPasswordResetLink('sin-arroba')).rejects.toThrow(
        'Escribe el correo electrónico de tu cuenta para enviarte el enlace.'
      );
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends the verification email to the signed-in account, in Spanish', async () => {
      const user = buildFirebaseUser();
      const auth = useAuth(user);

      await sendVerificationEmail();

      expect(sendEmailVerification).toHaveBeenCalledWith(user);
      expect(auth.languageCode).toBe('es');
    });

    it('needs a Firebase session', async () => {
      useAuth(null);

      await expect(sendVerificationEmail()).rejects.toThrow('Inicia sesión de nuevo para continuar.');
      expect(sendEmailVerification).not.toHaveBeenCalled();
    });
  });

  describe('requestEmailChange', () => {
    it('confirms the current password and asks Firebase to email the new address', async () => {
      const user = buildFirebaseUser();
      useAuth(user);

      await requestEmailChange(' Nuevo@Correo.com ', 'claveActual123');

      const [reauthUser, credential] = (reauthenticateWithCredential as jest.Mock).mock.calls[0];
      expect(reauthUser).toBe(user);
      expect(credential.providerId).toBe('password');
      expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(user, 'nuevo@correo.com');
      // The account keeps its email until the link is opened
      expect(user.email).toBe('cuenta@correo.com');
      expect(hasPendingEmailChange()).toBe(true);
    });

    it('validates the input before talking to Firebase', async () => {
      useAuth(buildFirebaseUser());

      await expect(requestEmailChange('sin-arroba', 'clave')).rejects.toThrow(
        'Escribe el nuevo correo electrónico.'
      );
      await expect(requestEmailChange('nuevo@correo.com', '')).rejects.toThrow(
        'Escribe tu contraseña actual para confirmar el cambio.'
      );
      await expect(requestEmailChange('CUENTA@correo.com', 'clave')).rejects.toThrow(
        'Ese ya es el correo de tu cuenta.'
      );
      expect(reauthenticateWithCredential).not.toHaveBeenCalled();
      expect(hasPendingEmailChange()).toBe(false);
    });

    it('needs a Firebase session', async () => {
      useAuth(null);

      await expect(requestEmailChange('nuevo@correo.com', 'clave')).rejects.toThrow(
        'Inicia sesión de nuevo para continuar.'
      );
    });

    it('reports a wrong current password and sends nothing', async () => {
      useAuth(buildFirebaseUser());
      (reauthenticateWithCredential as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), {
          code: 'auth/invalid-credential',
        })
      );

      await expect(requestEmailChange('nuevo@correo.com', 'claveMala')).rejects.toThrow(
        'La contraseña actual no es correcta.'
      );
      expect(verifyBeforeUpdateEmail).not.toHaveBeenCalled();
      expect(hasPendingEmailChange()).toBe(false);
    });

    it('lets other Firebase errors through so the caller can translate them', async () => {
      useAuth(buildFirebaseUser());
      (reauthenticateWithCredential as jest.Mock).mockRejectedValue(
        new Error('Firebase: Error (auth/network-request-failed).')
      );

      await expect(requestEmailChange('nuevo@correo.com', 'clave')).rejects.toThrow(
        'auth/network-request-failed'
      );

      (reauthenticateWithCredential as jest.Mock).mockResolvedValue({});
      (verifyBeforeUpdateEmail as jest.Mock).mockRejectedValue(
        new Error('Firebase: Error (auth/email-already-in-use).')
      );
      await expect(requestEmailChange('nuevo@correo.com', 'clave')).rejects.toThrow(
        'auth/email-already-in-use'
      );
      expect(hasPendingEmailChange()).toBe(false);
    });
  });

  describe('refreshAccountIdentity', () => {
    it('reloads the account and stores the verified state once the link was opened', async () => {
      const user = buildFirebaseUser();
      useAuth(user);
      savePersistedSession(sessionUser);
      (reload as jest.Mock).mockImplementation(async (target: FakeFirebaseUser) => {
        target.emailVerified = true;
      });

      const refreshed = await refreshAccountIdentity();

      expect(reload).toHaveBeenCalledWith(user);
      expect(refreshed).toMatchObject({
        uid: 'uid_account_01',
        displayName: 'Cuenta Nueva',
        emailVerified: true,
        emailVerificationRequired: false,
      });
      expect(loadPersistedSession()?.emailVerified).toBe(true);
      // The token in use still said "unverified": it is renewed
      expect(getIdToken).toHaveBeenCalledWith(user, true);
    });

    it('keeps the account pending while the email is still unverified', async () => {
      useAuth(buildFirebaseUser());
      savePersistedSession(sessionUser);

      const refreshed = await refreshAccountIdentity();

      expect(refreshed).toMatchObject({ emailVerified: false, emailVerificationRequired: true });
      expect(getIdToken).not.toHaveBeenCalled();
    });

    it('still reports the verified state when the token renewal fails', async () => {
      useAuth(buildFirebaseUser({ emailVerified: true }));
      savePersistedSession(sessionUser);
      (getIdToken as jest.Mock).mockRejectedValue(new Error('offline'));

      await expect(refreshAccountIdentity()).resolves.toMatchObject({ emailVerified: true });
    });

    it('adopts the new email and clears the pending change once it was confirmed', async () => {
      const user = buildFirebaseUser({ emailVerified: true });
      useAuth(user);
      savePersistedSession({ ...sessionUser, emailVerified: true, emailVerificationRequired: false });

      await requestEmailChange('nuevo@correo.com', 'claveActual123');
      expect(hasPendingEmailChange()).toBe(true);

      (reload as jest.Mock).mockImplementation(async (target: FakeFirebaseUser) => {
        target.email = 'nuevo@correo.com';
      });
      const refreshed = await refreshAccountIdentity();

      expect(refreshed?.email).toBe('nuevo@correo.com');
      expect(loadPersistedSession()?.email).toBe('nuevo@correo.com');
      expect(hasPendingEmailChange()).toBe(false);
    });

    it('returns null without a Firebase session or when the saved session is another account', async () => {
      useAuth(null);
      expect(await refreshAccountIdentity()).toBeNull();
      expect(reload).not.toHaveBeenCalled();

      useAuth(buildFirebaseUser({ uid: 'uid_other' }));
      savePersistedSession(sessionUser);
      expect(await refreshAccountIdentity()).toBeNull();
      expect(loadPersistedSession()?.uid).toBe('uid_account_01');
    });

    it('works when the Auth instance has no authStateReady', async () => {
      const auth = useAuth(buildFirebaseUser());
      delete auth.authStateReady;
      savePersistedSession(sessionUser);

      await expect(refreshAccountIdentity()).resolves.toMatchObject({ uid: 'uid_account_01' });
    });

    it('lets the revoked-session error through after an email or password change', async () => {
      useAuth(buildFirebaseUser());
      savePersistedSession(sessionUser);
      (reload as jest.Mock).mockRejectedValue(
        new Error('Firebase: Error (auth/user-token-expired).')
      );

      await expect(refreshAccountIdentity()).rejects.toThrow('auth/user-token-expired');
    });
  });
});
