/**
 * src/platform/auth/accountEmailActions.ts
 *
 * Acciones de cuenta que se resuelven con los correos de Firebase Authentication (ADR 0025):
 * verificación del correo, restablecimiento de contraseña y cambio de correo.
 * Firebase envía el mensaje con su plantilla y atiende el enlace en su página; la app no
 * genera códigos ni habla con ningún otro proveedor de correo.
 */

import {
  EmailAuthProvider,
  getIdToken,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  type Auth,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../data/firebase/firebaseConfig';
import {
  ACCOUNT_EMAIL_LANGUAGE,
  loadPersistedSession,
  savePersistedSession,
  withFirebaseIdentity,
  type BFlowAuthUser,
} from './authAdapter';
import { assertCooldownElapsed, runPasswordAttempt, startCooldown } from './authRateLimiter';

const NO_ACTIVE_SESSION_MESSAGE = 'Inicia sesión de nuevo para continuar.';

/** Correo nuevo a la espera de que el usuario abra el enlace de confirmación. */
let pendingEmailChange: string | null = null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getAuthForAccountEmails(): Auth {
  const auth = getFirebaseAuth();
  auth.languageCode = ACCOUNT_EMAIL_LANGUAGE;
  return auth;
}

/**
 * Envía el enlace para definir una nueva contraseña. Sirve con y sin sesión iniciada.
 * No se puede pedir otro hasta que pase la espera entre correos (ADR 0026).
 */
export async function sendPasswordResetLink(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) {
    throw new Error('Escribe el correo electrónico de tu cuenta para enviarte el enlace.');
  }
  assertCooldownElapsed('password_reset_email');
  await sendPasswordResetEmail(getAuthForAccountEmails(), normalized);
  startCooldown('password_reset_email');
}

/** Envía (o reenvía) el correo de verificación a la cuenta con sesión iniciada. */
export async function sendVerificationEmail(): Promise<void> {
  const user = getAuthForAccountEmails().currentUser;
  if (!user) {
    throw new Error(NO_ACTIVE_SESSION_MESSAGE);
  }
  assertCooldownElapsed('verification_email');
  await sendEmailVerification(user);
  startCooldown('verification_email');
}

/**
 * Pide el cambio de correo: confirma la contraseña actual y Firebase envía un enlace al
 * correo nuevo. El correo de la cuenta no cambia hasta que el usuario abre ese enlace;
 * al hacerlo Firebase cierra las sesiones abiertas.
 */
export async function requestEmailChange(newEmail: string, currentPassword: string): Promise<void> {
  const normalized = normalizeEmail(newEmail);
  if (!normalized.includes('@')) {
    throw new Error('Escribe el nuevo correo electrónico.');
  }
  if (!currentPassword) {
    throw new Error('Escribe tu contraseña actual para confirmar el cambio.');
  }

  const user = getAuthForAccountEmails().currentUser;
  if (!user || !user.email) {
    throw new Error(NO_ACTIVE_SESSION_MESSAGE);
  }
  if (normalizeEmail(user.email) === normalized) {
    throw new Error('Ese ya es el correo de tu cuenta.');
  }

  const accountEmail = user.email;
  // Cinco contraseñas equivocadas seguidas bloquean el cambio 15 minutos (ADR 0026).
  await runPasswordAttempt('reauth_email_change', 'La contraseña actual no es correcta.', () =>
    reauthenticateWithCredential(user, EmailAuthProvider.credential(accountEmail, currentPassword))
  );

  await verifyBeforeUpdateEmail(user, normalized);
  pendingEmailChange = normalized;
}

/** `true` mientras haya un cambio de correo pedido en esta sesión y sin confirmar. */
export function hasPendingEmailChange(): boolean {
  return pendingEmailChange !== null;
}

/**
 * Vuelve a leer la cuenta en Firebase Auth y actualiza la sesión guardada con el correo
 * vigente y su estado de verificación. Devuelve `null` si no hay sesión de Firebase.
 * Si la sesión fue revocada (cambio de correo o de contraseña confirmado), `reload` falla
 * y el SDK cierra la sesión por su cuenta.
 */
export async function refreshAccountIdentity(): Promise<BFlowAuthUser | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady?.();
  const user = auth.currentUser;
  if (!user) {
    return null;
  }

  await reload(user);

  const session = loadPersistedSession();
  if (!session || session.uid !== user.uid) {
    return null;
  }
  const refreshed = withFirebaseIdentity(session, user);

  if (refreshed.emailVerified && session.emailVerified !== true) {
    try {
      // El token vigente aún declara el correo como no verificado.
      await getIdToken(user, true);
    } catch {
      // Se renueva solo en la siguiente hora.
    }
  }
  if (pendingEmailChange && normalizeEmail(refreshed.email ?? '') === pendingEmailChange) {
    pendingEmailChange = null;
  }

  savePersistedSession(refreshed);
  return refreshed;
}

export function __resetAccountEmailActionsForTests(): void {
  pendingEmailChange = null;
}
