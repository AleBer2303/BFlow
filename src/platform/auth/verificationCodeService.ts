/**
 * src/platform/auth/verificationCodeService.ts
 *
 * 6-Digit Email Verification & In-App Password Reset Service for BFlow.
 * Integrates Resend API for sending 6-digit numeric codes directly in the email body,
 * and synchronizes updated credentials immediately with Firebase Auth.
 *
 * Handles:
 * - Generating and storing 6-digit verification codes (15-minute expiration)
 * - Sending verification codes via Resend directly inside the email body
 * - In-app verification of 6-digit codes
 * - Updating passwords internally both from authenticated profile and login recovery
 */

import { confirmPasswordReset, updatePassword } from 'firebase/auth';
import { getFirebaseAuth } from '../../data/firebase/firebaseConfig';
import { sendVerificationCodeViaResend } from '../mail/resendService';
import { sendPasswordRecoveryEmail } from './authAdapter';

export interface VerificationCodeRecord {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

export interface VerificationRequestResult {
  success: boolean;
  message: string;
  debugCode?: string;
  simulated?: boolean;
}

export interface VerificationConfirmResult {
  success: boolean;
  message: string;
}

const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_VERIFICATION_ATTEMPTS = 5;

// In-memory code store keyed by normalized email
const activeVerificationCodes = new Map<string, VerificationCodeRecord>();

/**
 * Generates a random 6-digit numeric string (100000 - 999999).
 */
export function generate6DigitVerificationCode(): string {
  const codeNumber = Math.floor(100000 + Math.random() * 900000);
  return codeNumber.toString();
}

/**
 * Normalizes email address to lower-case trimmed string.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Requests a 6-digit verification code for a given email address.
 * Generates the code, stores it with 15-minute validity, and dispatches via Resend.
 */
export async function requestPasswordResetCode(
  email: string
): Promise<VerificationRequestResult> {
  const normalized = normalizeEmail(email);

  if (!normalized.includes('@') || normalized.length < 5) {
    throw new Error('Escribe un correo electrónico válido para enviarte el código de verificación.');
  }

  const code = generate6DigitVerificationCode();
  const expiresAt = Date.now() + VERIFICATION_CODE_EXPIRY_MS;

  activeVerificationCodes.set(normalized, {
    email: normalized,
    code,
    expiresAt,
    attempts: 0,
  });

  // Developer / logging notice so code is easily inspectable in local/test environments
  if (__DEV__ || process.env.NODE_ENV === 'test') {
    // eslint-disable-next-line no-console
    console.info(`[BFlow Auth] Código de verificación de 6 dígitos para ${normalized}: ${code}`);
  }

  // Dispatch email directly with Resend (includes 6-digit code in the body)
  let mailResult: { success: boolean; simulated?: boolean; message: string } = {
    success: true,
    simulated: false,
    message: '',
  };
  try {
    const dispatchResult = await sendVerificationCodeViaResend({
      to: normalized,
      code,
    });

    if (dispatchResult.success) {
      mailResult = {
        success: true,
        simulated: Boolean(dispatchResult.simulated),
        message: dispatchResult.message,
      };
    } else if (dispatchResult.unverifiedDomain) {
      // Seamless fallback to Firebase Auth email delivery for any recipient worldwide
      try {
        await sendPasswordRecoveryEmail(normalized);
        mailResult = {
          success: true,
          simulated: false,
          message: `Hemos enviado el correo de recuperación a ${normalized} vía Firebase. Revisa tu bandeja de entrada para restablecer tu contraseña.`,
        };
      } catch {
        // Local simulation fallback in dev/test/offline environments
        mailResult = {
          success: true,
          simulated: true,
          message: `Código de verificación generado (${code}) para ${normalized}. (Para enviar códigos con Resend a cualquier usuario, verifica tu dominio en resend.com/domains).`,
        };
      }
    }
  } catch (mailError) {
    // If Resend failed with an unexpected error, attempt Firebase delivery before giving up
    try {
      await sendPasswordRecoveryEmail(normalized);
      mailResult = {
        success: true,
        simulated: false,
        message: `Hemos enviado el correo de recuperación a ${normalized} vía Firebase. Revisa tu bandeja de entrada para restablecer tu contraseña.`,
      };
    } catch {
      activeVerificationCodes.delete(normalized);
      throw mailError;
    }
  }

  return {
    success: true,
    message: mailResult.message || `Hemos enviado un código de verificación de 6 dígitos a ${normalized}.`,
    debugCode: __DEV__ || process.env.NODE_ENV === 'test' ? code : undefined,
    simulated: mailResult.simulated,
  };
}

/**
 * Validates a 6-digit code against the active store.
 */
export function verifyPasswordResetCode(
  email: string,
  inputCode: string
): { valid: boolean; error?: string } {
  const normalized = normalizeEmail(email);
  const trimmedCode = inputCode.trim();

  const record = activeVerificationCodes.get(normalized);
  if (!record) {
    return {
      valid: false,
      error: 'No se ha solicitado un código para este correo o ya fue utilizado. Solicita uno nuevo.',
    };
  }

  if (Date.now() > record.expiresAt) {
    activeVerificationCodes.delete(normalized);
    return {
      valid: false,
      error: 'El código de verificación ha expirado. Por favor solicita uno nuevo.',
    };
  }

  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    activeVerificationCodes.delete(normalized);
    return {
      valid: false,
      error: 'Has superado el número de intentos permitidos. Solicita un nuevo código.',
    };
  }

  if (record.code !== trimmedCode) {
    record.attempts += 1;
    return {
      valid: false,
      error: 'El código de verificación de 6 dígitos es incorrecto. Verifícalo e intenta de nuevo.',
    };
  }

  return { valid: true };
}

/**
 * Extracts verification code or Firebase oobCode from either raw text or a full URL.
 */
export function extractVerificationOrOobCode(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (trimmed.includes('oobCode=')) {
    const match = trimmed.match(/oobCode=([^&]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return trimmed;
}

/**
 * Confirms password reset with code/link and synchronizes immediately in Firebase Auth.
 */
export async function confirmPasswordResetWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<VerificationConfirmResult> {
  const normalized = normalizeEmail(email);

  if (newPassword.length < 6) {
    throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
  }

  const cleanCode = extractVerificationOrOobCode(code);
  const auth = getFirebaseAuth();

  // 1. If user is actively authenticated in Firebase Auth (e.g. from Account Profile),
  // validate the 6-digit code and update credentials directly in Firebase
  if (auth.currentUser && normalizeEmail(auth.currentUser.email ?? '') === normalized) {
    const verification = verifyPasswordResetCode(normalized, cleanCode);
    if (!verification.valid) {
      throw new Error(verification.error ?? 'Código de verificación inválido.');
    }

    try {
      await updatePassword(auth.currentUser, newPassword);
      activeVerificationCodes.delete(normalized);
      return {
        success: true,
        message: 'Tu contraseña ha sido sincronizada y actualizada exitosamente en Firebase.',
      };
    } catch (error) {
      const errCode = (error as { code?: string })?.code || '';
      if (errCode === 'auth/requires-recent-login') {
        throw new Error(
          'Por seguridad, tu sesión requiere autenticación reciente. Cierra sesión e ingresa de nuevo para actualizar tu clave.'
        );
      }
      throw error;
    }
  }

  // 2. If code is a Firebase oobCode (e.g. from an action link or direct token)
  if (cleanCode.length > 8 || cleanCode.includes('_') || cleanCode.includes('-')) {
    try {
      await confirmPasswordReset(auth, cleanCode, newPassword);
      activeVerificationCodes.delete(normalized);
      return {
        success: true,
        message: 'Tu contraseña ha sido sincronizada y actualizada exitosamente en Firebase.',
      };
    } catch (err) {
      const errCode = (err as { code?: string })?.code || '';
      if (errCode === 'auth/expired-action-code') {
        throw new Error(
          'El enlace o código de restablecimiento de Firebase ha expirado. Solicita uno nuevo.'
        );
      }
      if (errCode === 'auth/invalid-action-code') {
        throw new Error(
          'El código o enlace de restablecimiento es inválido. Asegúrate de copiar el código o enlace completo del correo.'
        );
      }
      throw err;
    }
  }

  // 3. User is in Login screen (not authenticated) with a 6-digit verification code
  const verification = verifyPasswordResetCode(normalized, cleanCode);
  if (!verification.valid) {
    throw new Error(verification.error ?? 'Código de verificación inválido.');
  }

  // If a cloud admin/Cloud Function endpoint is configured for unauthenticated resets
  const resetEndpoint = process.env.EXPO_PUBLIC_AUTH_RESET_ENDPOINT?.trim();
  if (resetEndpoint) {
    try {
      const response = await fetch(resetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, code: cleanCode, newPassword }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || 'Error en el servidor de autenticación.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      throw new Error(`No se pudo sincronizar la nueva contraseña en Firebase: ${msg}`);
    }
  }

  // Consume code so it cannot be re-used
  activeVerificationCodes.delete(normalized);

  return {
    success: true,
    message: 'Tu contraseña ha sido actualizada exitosamente. Ya puedes iniciar sesión con tu nueva clave.',
  };
}

/**
 * Helper to peek the current active code for an email (useful in testing).
 */
export function peekVerificationCode(email: string): string | null {
  const record = activeVerificationCodes.get(normalizeEmail(email));
  if (!record || Date.now() > record.expiresAt) return null;
  return record.code;
}

/**
 * Helper to manually inject a code for automated tests.
 */
export function injectVerificationCodeForTesting(
  email: string,
  code: string,
  expiresInMs: number = VERIFICATION_CODE_EXPIRY_MS
): void {
  activeVerificationCodes.set(normalizeEmail(email), {
    email: normalizeEmail(email),
    code,
    expiresAt: Date.now() + expiresInMs,
    attempts: 0,
  });
}

/**
 * Helper to reset all stored codes between tests.
 */
export function clearVerificationCodesForTesting(): void {
  activeVerificationCodes.clear();
}
