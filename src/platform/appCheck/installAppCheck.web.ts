/**
 * src/platform/appCheck/installAppCheck.web.ts
 *
 * Variante Web (Metro elige este archivo en el navegador): Firebase App Check con
 * reCAPTCHA Enterprise (ADR 0038). El SDK añade la cabecera `X-Firebase-AppCheck` a las
 * llamadas de Auth y Firestore y renueva el token solo.
 *
 * Nunca lanza: si el SDK falla, la app sigue funcionando sin token mientras la consola esté en
 * modo supervisión.
 */

import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import type { AppCheckPlan, AppCheckStatus, NativeAppCheckTokenSource } from './appCheck.types';
import { resolveAppCheckPlan, type AppCheckPlanInput } from './appCheckConfig';

export type { AppCheckStatus } from './appCheck.types';

export function installAppCheck(
  app: FirebaseApp,
  firebaseSource: AppCheckPlanInput['firebaseSource'],
  plan: AppCheckPlan = resolveAppCheckPlan({ platform: 'web', firebaseSource })
): AppCheckStatus {
  if (plan.kind === 'disabled') {
    return { state: 'disabled', reason: plan.reason };
  }
  if (plan.kind !== 'recaptcha-enterprise') {
    // `native-custom` solo lo produce la plataforma nativa.
    return { state: 'disabled', reason: 'not-configured' };
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(plan.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return { state: 'active', provider: 'recaptcha-enterprise' };
  } catch {
    return { state: 'failed' };
  }
}

/** En Web no hay módulo nativo: la firma existe para que ambas variantes coincidan. */
export function registerNativeAppCheckTokenSource(_source: NativeAppCheckTokenSource | null): void {
  // Sin efecto en el navegador.
}
