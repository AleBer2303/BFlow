/**
 * src/platform/appCheck/appCheckConfig.ts
 *
 * Decide si este build activa Firebase App Check y con qué proveedor (ADR 0038). Función pura:
 * no importa Firebase, así que se prueba igual en las dos variantes de `installAppCheck`.
 *
 * - Web: reCAPTCHA Enterprise con la clave de sitio `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`
 *   (es pública: va en el HTML que carga el navegador).
 * - iOS y Android: apagado salvo `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1`, y aun así solo funciona
 *   si un módulo nativo registró una fuente de tokens (`registerNativeAppCheckTokenSource`).
 * - Tests, modo vitrina y builds sin proyecto Firebase: siempre apagado.
 */

import type { AppCheckPlan, AppCheckPlatform } from './appCheck.types';

type AppCheckEnvRecord = Record<string, string | undefined>;

/** Metro solo sustituye `process.env.EXPO_PUBLIC_*` con acceso estático (ADR 0027). */
const BUNDLED_APP_CHECK_ENV: AppCheckEnvRecord = {
  EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY:
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY,
  EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE: process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE,
};

const ENABLED_FLAG_VALUES = new Set(['1', 'true']);

export interface AppCheckPlanInput {
  platform: AppCheckPlatform;
  /** `source` de `resolveFirebaseEnvironment()`: solo un proyecto real activa App Check. */
  firebaseSource: 'environment' | 'offline-mock' | 'missing';
  env?: AppCheckEnvRecord;
}

export function resolveAppCheckPlan({
  platform,
  firebaseSource,
  env = BUNDLED_APP_CHECK_ENV,
}: AppCheckPlanInput): AppCheckPlan {
  if (firebaseSource !== 'environment') {
    return { kind: 'disabled', reason: 'no-firebase-project' };
  }

  if (platform === 'web') {
    const siteKey = env.EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY?.trim();
    return siteKey
      ? { kind: 'recaptcha-enterprise', siteKey }
      : { kind: 'disabled', reason: 'not-configured' };
  }

  const nativeFlag = env.EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE?.trim().toLowerCase();
  return nativeFlag !== undefined && ENABLED_FLAG_VALUES.has(nativeFlag)
    ? { kind: 'native-custom' }
    : { kind: 'disabled', reason: 'not-configured' };
}
