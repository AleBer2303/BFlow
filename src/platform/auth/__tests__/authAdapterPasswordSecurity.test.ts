/**
 * Password policy on registration and the five-attempt limit on sign-in (ADR 0026).
 */

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth } from '../../../data/firebase/firebaseConfig';
import { persistentStorage } from '../../storage/persistentStorageAdapter';
import {
  __resetProfileSyncInFlightForTests,
  formatAuthError,
  registerWithPersonalProfile,
  signInWithEmail,
} from '../authAdapter';
import {
  PASSWORD_LOCKOUT_MS,
  getAuthAttemptStatus,
  getCooldownRemainingMs,
  isAuthLockoutError,
} from '../authRateLimiter';

jest.mock('../../../data/firebase/firebaseConfig', () => ({
  ...jest.requireActual('../../../data/firebase/firebaseConfig'),
  getFirebaseAuth: jest.fn(),
  getFirebaseDb: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  ...jest.requireActual('firebase/auth'),
  createUserWithEmailAndPassword: jest.fn(),
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

const firebaseUser = {
  uid: 'uid_security_account',
  email: 'cuenta@correo.com',
  displayName: null,
  emailVerified: true,
  providerData: [{ providerId: 'password' }],
  metadata: { creationTime: 'Sat, 14 Nov 2026 15:00:00 GMT' },
};

function rejectWith(code: string): void {
  (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(
    Object.assign(new Error(`Firebase: Error (${code}).`), { code })
  );
}

async function signInError(): Promise<unknown> {
  return signInWithEmail('cuenta@correo.com', 'claveEquivocada').catch((err: unknown) => err);
}

describe('authAdapter: política de contraseña y límite de intentos (ADR 0026)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistentStorage.clear();
    __resetProfileSyncInFlightForTests();
    (getFirebaseAuth as jest.Mock).mockReturnValue({ languageCode: null });
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false, data: () => ({}) });
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: firebaseUser });
    (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: firebaseUser });
  });

  describe('registerWithPersonalProfile', () => {
    const registration = { displayName: 'Cuenta Nueva', email: 'cuenta@correo.com' };

    it.each([
      ['corta1!', 'mínimo 8 caracteres (máximo 128)'],
      ['presupuesto2026!', 'una letra mayúscula'],
      ['PRESUPUESTO2026!', 'una letra minúscula'],
      ['Presupuesto!', 'un número'],
      ['Presupuesto2026', 'un carácter especial, como ! @ # $ %'],
      ['Presupuesto2026! ', 'sin espacios al inicio ni al final'],
    ])('rejects %p before creating the account in Firebase', async (password, rule) => {
      await expect(registerWithPersonalProfile({ ...registration, password })).rejects.toThrow(
        `La contraseña no cumple este requisito: ${rule}.`
      );
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('creates the account with a password that meets the policy', async () => {
      const user = await registerWithPersonalProfile({ ...registration, password: 'Presupuesto2026!' });

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'cuenta@correo.com',
        'Presupuesto2026!'
      );
      expect(user.uid).toBe('uid_security_account');
    });

    it('starts the wait before the verification email can be sent again', async () => {
      await registerWithPersonalProfile({ ...registration, password: 'Presupuesto2026!' });
      expect(getCooldownRemainingMs('verification_email')).toBeGreaterThan(0);
    });

    it('starts no wait when the verification email could not be sent', async () => {
      (sendEmailVerification as jest.Mock).mockRejectedValue(new Error('sin red'));
      await registerWithPersonalProfile({ ...registration, password: 'Presupuesto2026!' });
      expect(getCooldownRemainingMs('verification_email')).toBe(0);
    });
  });

  describe('signInWithEmail', () => {
    it('does not apply the registration policy: an older, shorter password still signs in', async () => {
      const user = await signInWithEmail('cuenta@correo.com', 'abc123');
      expect(user.uid).toBe('uid_security_account');
    });

    it.each(['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'])(
      'counts %s as a failed attempt and says how many are left',
      async (code) => {
        rejectWith(code);

        const error = await signInError();

        expect((error as Error).message).toBe(
          'Correo o contraseña incorrectos. Te quedan 4 intentos antes de un bloqueo de 15 min.'
        );
        expect(isAuthLockoutError(error)).toBe(false);
        expect(getAuthAttemptStatus('login_password').remainingAttempts).toBe(4);
      }
    );

    it('locks the sign-in for 15 minutes on the fifth wrong password and stops calling Firebase', async () => {
      rejectWith('auth/invalid-credential');

      const remaining: string[] = [];
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        remaining.push(((await signInError()) as Error).message);
      }
      expect(remaining.map((message) => message.match(/quedan? (\d)/)?.[1])).toEqual([
        '4',
        '3',
        '2',
        '1',
      ]);

      const fifth = await signInError();
      expect(isAuthLockoutError(fifth)).toBe(true);
      expect((fifth as Error).message).toContain('Podrás intentarlo de nuevo en 15 min');
      expect((fifth as Error).message).toContain('restablécela por correo');
      // The message reaches the screen as it is, not replaced by a generic one.
      expect(formatAuthError(fifth, 'No fue posible iniciar sesión.')).toBe((fifth as Error).message);

      // Locked: even the right password is not sent to Firebase.
      (signInWithEmailAndPassword as jest.Mock).mockClear();
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: firebaseUser });
      const sixth = await signInWithEmail('cuenta@correo.com', 'Presupuesto2026!').catch(
        (err: unknown) => err
      );
      expect(isAuthLockoutError(sixth)).toBe(true);
      expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
      expect(getAuthAttemptStatus('login_password').retryAfterMs).toBeGreaterThan(
        PASSWORD_LOCKOUT_MS - 5_000
      );
    });

    it('starts the count again after a successful sign-in', async () => {
      rejectWith('auth/invalid-credential');
      await signInError();
      await signInError();
      expect(getAuthAttemptStatus('login_password').remainingAttempts).toBe(3);

      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: firebaseUser });
      await signInWithEmail('cuenta@correo.com', 'Presupuesto2026!');

      expect(getAuthAttemptStatus('login_password').remainingAttempts).toBe(5);
    });

    it('does not count a network failure as a wrong password', async () => {
      rejectWith('auth/network-request-failed');

      const error = await signInError();

      expect(formatAuthError(error, 'x')).toBe(
        'Error de conexión. Revisa tu internet e intenta nuevamente.'
      );
      expect(getAuthAttemptStatus('login_password').remainingAttempts).toBe(5);
    });
  });

  it('explains a password that Firebase rejects for its own policy', () => {
    const message =
      'La contraseña no cumple los requisitos de seguridad. Revisa la lista e intenta de nuevo.';
    expect(formatAuthError(new Error('Firebase: Error (auth/weak-password).'), 'x')).toBe(message);
    expect(
      formatAuthError(new Error('Firebase: Error (auth/password-does-not-meet-requirements).'), 'x')
    ).toBe(message);
  });
});
