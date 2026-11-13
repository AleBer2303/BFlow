import {
  __resetMemoryCacheForTests,
  __setStorageBackendForTests,
  persistentStorage,
  type RawStorageBackend,
} from '../../storage/persistentStorageAdapter';
import {
  AUTH_COOLDOWN_MS,
  MAX_FAILED_PASSWORD_ATTEMPTS,
  PASSWORD_LOCKOUT_MS,
  __resetAuthRateLimiterForTests,
  assertCooldownElapsed,
  describeLockout,
  describeRemainingAttempts,
  formatWaitTime,
  getAuthAttemptStatus,
  getCooldownRemainingMs,
  isAuthLockoutError,
  recordFailedAuthAttempt,
  resetAuthAttempts,
  runPasswordAttempt,
  startCooldown,
} from '../authRateLimiter';

const NOW = Date.parse('2026-11-13T15:00:00.000Z');

function wrongPassword(): Promise<never> {
  return Promise.reject(
    Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), {
      code: 'auth/invalid-credential',
    })
  );
}

function failTimes(count: number, nowMs = NOW): void {
  for (let attempt = 0; attempt < count; attempt += 1) {
    recordFailedAuthAttempt('login_password', nowMs);
  }
}

describe('authRateLimiter', () => {
  beforeEach(() => {
    persistentStorage.clear();
  });

  describe('password attempts', () => {
    it('starts with five attempts and no lockout', () => {
      expect(getAuthAttemptStatus('login_password', NOW)).toEqual({
        isLocked: false,
        remainingAttempts: MAX_FAILED_PASSWORD_ATTEMPTS,
        retryAfterMs: 0,
      });
    });

    it('counts down the attempts left from 4 to 1', () => {
      const remaining = [1, 2, 3, 4].map(
        () => recordFailedAuthAttempt('login_password', NOW).remainingAttempts
      );
      expect(remaining).toEqual([4, 3, 2, 1]);
      expect(getAuthAttemptStatus('login_password', NOW).isLocked).toBe(false);
    });

    it('locks for 15 minutes on the fifth failure in a row', () => {
      failTimes(4);
      expect(recordFailedAuthAttempt('login_password', NOW)).toEqual({
        isLocked: true,
        remainingAttempts: 0,
        retryAfterMs: PASSWORD_LOCKOUT_MS,
      });
      expect(PASSWORD_LOCKOUT_MS).toBe(15 * 60 * 1000);

      // More failures while locked neither extend nor shorten the lockout.
      const later = NOW + 60_000;
      expect(recordFailedAuthAttempt('login_password', later).retryAfterMs).toBe(
        PASSWORD_LOCKOUT_MS - 60_000
      );
    });

    it('gives the five attempts back once the lockout is over', () => {
      failTimes(5);
      const afterLockout = NOW + PASSWORD_LOCKOUT_MS;

      expect(getAuthAttemptStatus('login_password', afterLockout - 1).isLocked).toBe(true);
      expect(getAuthAttemptStatus('login_password', afterLockout)).toMatchObject({
        isLocked: false,
        remainingAttempts: MAX_FAILED_PASSWORD_ATTEMPTS,
      });
      expect(recordFailedAuthAttempt('login_password', afterLockout).remainingAttempts).toBe(4);
    });

    it('never waits longer than the lockout when the device clock moves back', () => {
      failTimes(5);
      const clockMovedBack = NOW - 6 * 60 * 60 * 1000;
      expect(getAuthAttemptStatus('login_password', clockMovedBack).retryAfterMs).toBe(
        PASSWORD_LOCKOUT_MS
      );
    });

    it('keeps each action apart', () => {
      failTimes(5);
      expect(getAuthAttemptStatus('reauth_email_change', NOW).isLocked).toBe(false);
      expect(recordFailedAuthAttempt('reauth_email_change', NOW).remainingAttempts).toBe(4);
    });

    it('resets the count on demand', () => {
      failTimes(3);
      resetAuthAttempts('login_password');
      expect(getAuthAttemptStatus('login_password', NOW).remainingAttempts).toBe(
        MAX_FAILED_PASSWORD_ATTEMPTS
      );
      // Resetting an action with nothing recorded is harmless.
      resetAuthAttempts('reauth_email_change');
    });

    it('ignores a stored record that is not a valid count', () => {
      persistentStorage.setItem('bflow.auth.rate_limit.v1', {
        attempts: { login_password: { failedAttempts: 'muchos', lockedUntilMs: null } },
        cooldownUntilMs: { manual_sync: 'mañana' },
      });
      expect(getAuthAttemptStatus('login_password', NOW).remainingAttempts).toBe(
        MAX_FAILED_PASSWORD_ATTEMPTS
      );
      expect(getCooldownRemainingMs('manual_sync', NOW)).toBe(0);
    });
  });

  describe('persistence', () => {
    afterEach(() => {
      __setStorageBackendForTests(null);
    });

    it('keeps the lockout after the app restarts, encrypted at rest', () => {
      const disk = new Map<string, string>();
      const backend: RawStorageBackend = {
        getItem: (key) => disk.get(key) ?? null,
        setItem: (key, value) => void disk.set(key, value),
        removeItem: (key) => void disk.delete(key),
        clear: () => disk.clear(),
      };
      __setStorageBackendForTests(backend);

      failTimes(5);
      const stored = disk.get('bflow.auth.rate_limit.v1') ?? '';
      expect(stored.startsWith('enc:v1:')).toBe(true);
      expect(stored).not.toContain('lockedUntilMs');

      // Cold start: the in-memory copy is gone and the state is read back from disk.
      __resetMemoryCacheForTests();
      expect(getAuthAttemptStatus('login_password', NOW + 1_000)).toMatchObject({
        isLocked: true,
        retryAfterMs: PASSWORD_LOCKOUT_MS - 1_000,
      });
    });
  });

  describe('runPasswordAttempt', () => {
    it('returns the result and clears earlier failures when the password is right', async () => {
      failTimes(3, Date.now());

      await expect(
        runPasswordAttempt('login_password', 'Clave incorrecta.', async () => 'sesión')
      ).resolves.toBe('sesión');
      expect(getAuthAttemptStatus('login_password').remainingAttempts).toBe(
        MAX_FAILED_PASSWORD_ATTEMPTS
      );
    });

    it('tells how many attempts are left after each wrong password', async () => {
      await expect(
        runPasswordAttempt('login_password', 'Clave incorrecta.', wrongPassword)
      ).rejects.toThrow('Clave incorrecta. Te quedan 4 intentos antes de un bloqueo de 15 min.');

      failTimes(2, Date.now());
      await expect(
        runPasswordAttempt('login_password', 'Clave incorrecta.', wrongPassword)
      ).rejects.toThrow('Clave incorrecta. Te queda 1 intento antes de un bloqueo de 15 min.');
    });

    it('locks on the fifth wrong password and stops calling Firebase while locked', async () => {
      failTimes(4, Date.now());

      const fifth = await runPasswordAttempt('login_password', 'Clave incorrecta.', wrongPassword).catch(
        (err: unknown) => err
      );
      expect(isAuthLockoutError(fifth)).toBe(true);
      expect((fifth as Error).message).toMatch(
        /^Demasiados intentos fallidos\. Podrás intentarlo de nuevo en 15 min\. Si olvidaste tu contraseña, restablécela por correo\.$/
      );

      const attempt = jest.fn(async () => 'sesión');
      const blocked = await runPasswordAttempt('login_password', 'Clave incorrecta.', attempt).catch(
        (err: unknown) => err
      );
      expect(attempt).not.toHaveBeenCalled();
      expect(isAuthLockoutError(blocked)).toBe(true);
    });

    it('treats an unknown account like a wrong password, so it reveals nothing', async () => {
      const unknownAccount = () =>
        Promise.reject(new Error('Firebase: Error (auth/user-not-found).'));
      const error = await runPasswordAttempt('login_password', 'Clave incorrecta.', unknownAccount).catch(
        (err: unknown) => err
      );
      expect((error as Error).message).toContain('Te quedan 4 intentos');
      expect(isAuthLockoutError(error)).toBe(false);
    });

    it('lets other failures through without counting them', async () => {
      const offline = new Error('Firebase: Error (auth/network-request-failed).');
      await expect(
        runPasswordAttempt('login_password', 'Clave incorrecta.', () => Promise.reject(offline))
      ).rejects.toBe(offline);
      expect(getAuthAttemptStatus('login_password').remainingAttempts).toBe(
        MAX_FAILED_PASSWORD_ATTEMPTS
      );
      expect(isAuthLockoutError(offline)).toBe(false);
      expect(isAuthLockoutError(null)).toBe(false);
    });
  });

  describe('cooldowns', () => {
    it('waits 60 s between account emails and 30 s between manual syncs', () => {
      expect(AUTH_COOLDOWN_MS).toEqual({
        password_reset_email: 60_000,
        verification_email: 60_000,
        manual_sync: 30_000,
      });
    });

    it('runs from the moment the action starts and ends by itself', () => {
      expect(getCooldownRemainingMs('manual_sync', NOW)).toBe(0);
      expect(() => assertCooldownElapsed('manual_sync', NOW)).not.toThrow();

      startCooldown('manual_sync', NOW);
      expect(getCooldownRemainingMs('manual_sync', NOW + 10_000)).toBe(20_000);
      expect(() => assertCooldownElapsed('manual_sync', NOW + 10_000)).toThrow(
        'Espera 20 s antes de volver a intentarlo.'
      );
      expect(getCooldownRemainingMs('manual_sync', NOW + 30_000)).toBe(0);
      expect(() => assertCooldownElapsed('manual_sync', NOW + 30_000)).not.toThrow();
    });

    it('keeps each action apart and never waits longer than its own cooldown', () => {
      startCooldown('password_reset_email', NOW);
      expect(getCooldownRemainingMs('verification_email', NOW)).toBe(0);
      expect(getCooldownRemainingMs('password_reset_email', NOW - 3_600_000)).toBe(60_000);
    });

    it('is cleared by the test reset', () => {
      startCooldown('verification_email', NOW);
      failTimes(5);
      __resetAuthRateLimiterForTests();
      expect(getCooldownRemainingMs('verification_email', NOW)).toBe(0);
      expect(getAuthAttemptStatus('login_password', NOW).isLocked).toBe(false);
    });
  });

  describe('messages', () => {
    it('formats a wait in minutes and seconds', () => {
      expect(formatWaitTime(0)).toBe('0 s');
      expect(formatWaitTime(-5)).toBe('0 s');
      expect(formatWaitTime(1)).toBe('1 s');
      expect(formatWaitTime(42_000)).toBe('42 s');
      expect(formatWaitTime(60_000)).toBe('1 min');
      expect(formatWaitTime(14 * 60_000 + 58_200)).toBe('14 min 59 s');
      expect(formatWaitTime(PASSWORD_LOCKOUT_MS)).toBe('15 min');
    });

    it('describes the lockout with the time left and the way out', () => {
      expect(describeLockout(90_000)).toBe(
        'Demasiados intentos fallidos. Podrás intentarlo de nuevo en 1 min 30 s. Si olvidaste tu contraseña, restablécela por correo.'
      );
    });

    it('uses the singular for the last attempt', () => {
      expect(describeRemainingAttempts(1)).toBe('Te queda 1 intento antes de un bloqueo de 15 min.');
      expect(describeRemainingAttempts(3)).toBe(
        'Te quedan 3 intentos antes de un bloqueo de 15 min.'
      );
    });
  });
});
