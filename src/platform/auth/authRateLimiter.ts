/**
 * src/platform/auth/authRateLimiter.ts
 *
 * Límites de uso de las acciones de cuenta en este dispositivo (ADR 0026):
 * - Intentos de contraseña: 5 fallos seguidos bloquean la acción 15 minutos. Un acierto
 *   reinicia la cuenta.
 * - Esperas: tras enviar un correo de cuenta o sincronizar a mano, la misma acción no se
 *   repite hasta que pase su espera.
 *
 * El estado se guarda cifrado con `persistentStorage`, así que sobrevive a cerrar la app.
 * Es un freno en el cliente: quien borre los datos de la app o llame a Firebase por fuera
 * lo salta. El límite que no se puede saltar es el de Firebase (`auth/too-many-requests`).
 */

import { persistentStorage } from '../storage/persistentStorageAdapter';

export type AuthAttemptAction = 'login_password' | 'reauth_email_change';
export type AuthCooldownAction = 'password_reset_email' | 'verification_email' | 'manual_sync';

export const MAX_FAILED_PASSWORD_ATTEMPTS = 5;
export const PASSWORD_LOCKOUT_MS = 15 * 60 * 1000;
export const AUTH_COOLDOWN_MS: Record<AuthCooldownAction, number> = {
  password_reset_email: 60_000,
  verification_email: 60_000,
  manual_sync: 30_000,
};

const STORAGE_KEY = 'bflow.auth.rate_limit.v1';

/**
 * Lo que Firebase responde a una contraseña equivocada. `auth/user-not-found` cuenta igual:
 * tratarlo distinto revelaría qué correos tienen cuenta.
 */
const INVALID_CREDENTIAL_CODES = [
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/invalid-login-credentials',
  'auth/user-not-found',
] as const;

interface AttemptRecord {
  failedAttempts: number;
  lockedUntilMs: number | null;
}

interface RateLimitState {
  attempts: Partial<Record<AuthAttemptAction, AttemptRecord>>;
  cooldownUntilMs: Partial<Record<AuthCooldownAction, number>>;
}

export interface AuthAttemptStatus {
  isLocked: boolean;
  /** Intentos que quedan antes del bloqueo; 0 mientras dura. */
  remainingAttempts: number;
  /** Milisegundos hasta que se pueda volver a intentar; 0 si no hay bloqueo. */
  retryAfterMs: number;
}

const UNLOCKED_STATUS: AuthAttemptStatus = {
  isLocked: false,
  remainingAttempts: MAX_FAILED_PASSWORD_ATTEMPTS,
  retryAfterMs: 0,
};

function readState(): RateLimitState {
  const stored = persistentStorage.getItem<Partial<RateLimitState>>(STORAGE_KEY);
  return {
    attempts: { ...stored?.attempts },
    cooldownUntilMs: { ...stored?.cooldownUntilMs },
  };
}

function writeState(state: RateLimitState): void {
  persistentStorage.setItem(STORAGE_KEY, state);
}

/** Lo que falta para `untilMs`, nunca más que `maxMs`: un reloj atrasado no alarga la espera. */
function remainingUntil(untilMs: unknown, nowMs: number, maxMs: number): number {
  if (typeof untilMs !== 'number' || !Number.isFinite(untilMs)) {
    return 0;
  }
  return Math.min(maxMs, Math.max(0, untilMs - nowMs));
}

export function getAuthAttemptStatus(
  action: AuthAttemptAction,
  nowMs: number = Date.now()
): AuthAttemptStatus {
  const record = readState().attempts[action];
  if (!record) {
    return UNLOCKED_STATUS;
  }
  if (record.lockedUntilMs !== null && record.lockedUntilMs !== undefined) {
    const retryAfterMs = remainingUntil(record.lockedUntilMs, nowMs, PASSWORD_LOCKOUT_MS);
    // Un bloqueo vencido devuelve los cinco intentos.
    return retryAfterMs > 0
      ? { isLocked: true, remainingAttempts: 0, retryAfterMs }
      : UNLOCKED_STATUS;
  }
  const failedAttempts = Number.isSafeInteger(record.failedAttempts) ? record.failedAttempts : 0;
  return {
    isLocked: false,
    remainingAttempts: Math.max(0, MAX_FAILED_PASSWORD_ATTEMPTS - Math.max(0, failedAttempts)),
    retryAfterMs: 0,
  };
}

/** Cuenta un fallo y bloquea la acción al quinto seguido. */
export function recordFailedAuthAttempt(
  action: AuthAttemptAction,
  nowMs: number = Date.now()
): AuthAttemptStatus {
  const current = getAuthAttemptStatus(action, nowMs);
  if (current.isLocked) {
    return current;
  }
  const failedAttempts = MAX_FAILED_PASSWORD_ATTEMPTS - current.remainingAttempts + 1;
  const state = readState();
  state.attempts[action] = {
    failedAttempts,
    lockedUntilMs:
      failedAttempts >= MAX_FAILED_PASSWORD_ATTEMPTS ? nowMs + PASSWORD_LOCKOUT_MS : null,
  };
  writeState(state);
  return getAuthAttemptStatus(action, nowMs);
}

export function resetAuthAttempts(action: AuthAttemptAction): void {
  const state = readState();
  if (state.attempts[action]) {
    delete state.attempts[action];
    writeState(state);
  }
}

/** "14 min 59 s", "15 min" o "42 s". */
export function formatWaitTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds} s`;
  }
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

export function describeLockout(retryAfterMs: number): string {
  return `Demasiados intentos fallidos. Podrás intentarlo de nuevo en ${formatWaitTime(retryAfterMs)}. Si olvidaste tu contraseña, restablécela por correo.`;
}

export function describeRemainingAttempts(remainingAttempts: number): string {
  const lockout = formatWaitTime(PASSWORD_LOCKOUT_MS);
  return remainingAttempts === 1
    ? `Te queda 1 intento antes de un bloqueo de ${lockout}.`
    : `Te quedan ${remainingAttempts} intentos antes de un bloqueo de ${lockout}.`;
}

/** Error de una contraseña rechazada o de una acción bloqueada, con el estado del límite. */
export class AuthAttemptLimitError extends Error {
  readonly status: AuthAttemptStatus;

  constructor(message: string, status: AuthAttemptStatus) {
    super(message);
    this.name = 'AuthAttemptLimitError';
    this.status = status;
  }
}

/** `true` si el error dice que la acción quedó bloqueada (no solo que la contraseña falló). */
export function isAuthLockoutError(err: unknown): boolean {
  return (err as { status?: { isLocked?: unknown } } | null)?.status?.isLocked === true;
}

function isInvalidCredentialError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : '';
  return INVALID_CREDENTIAL_CODES.some(
    (candidate) => code === candidate || message.includes(candidate)
  );
}

/**
 * Ejecuta una comprobación de contraseña bajo el límite de intentos: no la intenta si la
 * acción está bloqueada, cuenta el fallo si Firebase rechaza la contraseña y reinicia la
 * cuenta si acierta. Cualquier otro error (red, cuenta deshabilitada) pasa sin contar.
 */
export async function runPasswordAttempt<T>(
  action: AuthAttemptAction,
  wrongPasswordMessage: string,
  attempt: () => Promise<T>
): Promise<T> {
  const before = getAuthAttemptStatus(action);
  if (before.isLocked) {
    throw new AuthAttemptLimitError(describeLockout(before.retryAfterMs), before);
  }

  let result: T;
  try {
    result = await attempt();
  } catch (err) {
    if (!isInvalidCredentialError(err)) {
      throw err;
    }
    const status = recordFailedAuthAttempt(action);
    throw new AuthAttemptLimitError(
      status.isLocked
        ? describeLockout(status.retryAfterMs)
        : `${wrongPasswordMessage} ${describeRemainingAttempts(status.remainingAttempts)}`,
      status
    );
  }

  resetAuthAttempts(action);
  return result;
}

export function getCooldownRemainingMs(
  action: AuthCooldownAction,
  nowMs: number = Date.now()
): number {
  return remainingUntil(readState().cooldownUntilMs[action], nowMs, AUTH_COOLDOWN_MS[action]);
}

export function startCooldown(action: AuthCooldownAction, nowMs: number = Date.now()): void {
  const state = readState();
  state.cooldownUntilMs[action] = nowMs + AUTH_COOLDOWN_MS[action];
  writeState(state);
}

/** Rechaza con un mensaje para el usuario si la acción todavía está en espera. */
export function assertCooldownElapsed(
  action: AuthCooldownAction,
  nowMs: number = Date.now()
): void {
  const remainingMs = getCooldownRemainingMs(action, nowMs);
  if (remainingMs > 0) {
    throw new Error(`Espera ${formatWaitTime(remainingMs)} antes de volver a intentarlo.`);
  }
}

export function __resetAuthRateLimiterForTests(): void {
  persistentStorage.removeItem(STORAGE_KEY);
}
