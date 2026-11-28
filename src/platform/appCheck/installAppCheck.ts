/**
 * src/platform/appCheck/installAppCheck.ts
 *
 * Variante nativa (iOS y Android; Metro elige `installAppCheck.web.ts` en el navegador).
 *
 * El SDK JS de Firebase no sabe pedir una atestación al sistema (App Attest, DeviceCheck o
 * Play Integrity), así que en nativo App Check depende de un módulo que todavía no existe
 * (ADR 0038 §3): ese módulo registrará su fuente de tokens con
 * `registerNativeAppCheckTokenSource` y este archivo la conecta con un `CustomProvider`.
 *
 * Sin `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1` no se hace nada. Con la variable y sin fuente
 * registrada, el estado es `unavailable` y la app sigue sin App Check. Nunca lanza.
 */

import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import type { AppCheckPlan, AppCheckStatus, NativeAppCheckTokenSource } from './appCheck.types';
import { resolveAppCheckPlan, type AppCheckPlanInput } from './appCheckConfig';

export type { AppCheckStatus } from './appCheck.types';

let nativeTokenSource: NativeAppCheckTokenSource | null = null;

/** Lo llama el módulo nativo de atestación antes de que se inicie Firebase. */
export function registerNativeAppCheckTokenSource(source: NativeAppCheckTokenSource | null): void {
  nativeTokenSource = source;
}

export function installAppCheck(
  app: FirebaseApp,
  firebaseSource: AppCheckPlanInput['firebaseSource'],
  plan: AppCheckPlan = resolveAppCheckPlan({ platform: 'native', firebaseSource })
): AppCheckStatus {
  if (plan.kind === 'disabled') {
    return { state: 'disabled', reason: plan.reason };
  }
  if (plan.kind !== 'native-custom') {
    // reCAPTCHA necesita un DOM: en nativo no se usa.
    return { state: 'disabled', reason: 'not-configured' };
  }
  const source = nativeTokenSource;
  if (!source) {
    return { state: 'unavailable' };
  }

  try {
    initializeAppCheck(app, {
      provider: new CustomProvider({ getToken: () => source() }),
      isTokenAutoRefreshEnabled: true,
    });
    return { state: 'active', provider: 'native-custom' };
  } catch {
    return { state: 'failed' };
  }
}
