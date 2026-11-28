/**
 * src/platform/appCheck/appCheck.types.ts
 *
 * Tipos compartidos por las dos variantes de `installAppCheck` (ADR 0038).
 */

export type AppCheckPlatform = 'web' | 'native';

export type AppCheckDisabledReason =
  /** Tests, modo vitrina o build sin `EXPO_PUBLIC_FIREBASE_*`. */
  | 'no-firebase-project'
  /** Falta la clave de sitio (Web) o la variable de activación (nativo). */
  | 'not-configured';

export type AppCheckPlan =
  | { kind: 'disabled'; reason: AppCheckDisabledReason }
  | { kind: 'recaptcha-enterprise'; siteKey: string }
  | { kind: 'native-custom' };

export type AppCheckStatus =
  | { state: 'active'; provider: 'recaptcha-enterprise' | 'native-custom' }
  | { state: 'disabled'; reason: AppCheckDisabledReason }
  /** Activado por variable, pero ningún módulo nativo registró una fuente de tokens. */
  | { state: 'unavailable' }
  /** El SDK lanzó al iniciar: la app sigue sin App Check (Firestore lo tolera en modo supervisión). */
  | { state: 'failed' };

/** Token de App Check emitido por un módulo nativo (App Attest / DeviceCheck / Play Integrity). */
export interface NativeAppCheckToken {
  token: string;
  /** Milisegundos desde la época Unix. */
  expireTimeMillis: number;
}

export type NativeAppCheckTokenSource = () => Promise<NativeAppCheckToken>;
