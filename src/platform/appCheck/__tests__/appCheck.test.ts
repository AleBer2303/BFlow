/**
 * App Check (AUD-01, ADR 0038): qué decide cada build y cómo lo instala cada plataforma.
 */

import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { resolveAppCheckPlan } from '../appCheckConfig';
import {
  installAppCheck as installNativeAppCheck,
  registerNativeAppCheckTokenSource,
} from '../installAppCheck';
import {
  installAppCheck as installWebAppCheck,
  registerNativeAppCheckTokenSource as registerWebTokenSource,
} from '../installAppCheck.web';

jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(() => ({})),
  ReCaptchaEnterpriseProvider: jest.fn(function ReCaptchaEnterpriseProvider(this: object, siteKey: string) {
    Object.assign(this, { kind: 'recaptcha-enterprise', siteKey });
  }),
  CustomProvider: jest.fn(function CustomProvider(this: object, options: object) {
    Object.assign(this, { kind: 'custom', options });
  }),
}));

const mockedInitializeAppCheck = initializeAppCheck as jest.MockedFunction<typeof initializeAppCheck>;
const FAKE_APP = { name: '[DEFAULT]' } as FirebaseApp;
const SITE_KEY = '6Lc_site_key_publica';

beforeEach(() => {
  jest.clearAllMocks();
  registerNativeAppCheckTokenSource(null);
});

describe('resolveAppCheckPlan', () => {
  it('Web con clave de sitio usa reCAPTCHA Enterprise (sin espacios)', () => {
    expect(
      resolveAppCheckPlan({
        platform: 'web',
        firebaseSource: 'environment',
        env: { EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: `  ${SITE_KEY} ` },
      })
    ).toEqual({ kind: 'recaptcha-enterprise', siteKey: SITE_KEY });
  });

  it('Web sin clave queda apagado', () => {
    expect(
      resolveAppCheckPlan({ platform: 'web', firebaseSource: 'environment', env: {} })
    ).toEqual({ kind: 'disabled', reason: 'not-configured' });
    expect(
      resolveAppCheckPlan({
        platform: 'web',
        firebaseSource: 'environment',
        env: { EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: '   ' },
      })
    ).toEqual({ kind: 'disabled', reason: 'not-configured' });
  });

  it('tests, vitrina y builds sin proyecto nunca lo activan, aunque haya variables', () => {
    const env = {
      EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: SITE_KEY,
      EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE: '1',
    };
    for (const firebaseSource of ['offline-mock', 'missing'] as const) {
      expect(resolveAppCheckPlan({ platform: 'web', firebaseSource, env })).toEqual({
        kind: 'disabled',
        reason: 'no-firebase-project',
      });
      expect(resolveAppCheckPlan({ platform: 'native', firebaseSource, env })).toEqual({
        kind: 'disabled',
        reason: 'no-firebase-project',
      });
    }
  });

  it('nativo solo se activa con EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE=1 o true', () => {
    const plan = (value: string | undefined) =>
      resolveAppCheckPlan({
        platform: 'native',
        firebaseSource: 'environment',
        env: { EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE: value },
      });

    expect(plan('1')).toEqual({ kind: 'native-custom' });
    expect(plan(' TRUE ')).toEqual({ kind: 'native-custom' });
    expect(plan(undefined)).toEqual({ kind: 'disabled', reason: 'not-configured' });
    expect(plan('0')).toEqual({ kind: 'disabled', reason: 'not-configured' });
  });

  it('la clave de reCAPTCHA no activa nada en nativo', () => {
    expect(
      resolveAppCheckPlan({
        platform: 'native',
        firebaseSource: 'environment',
        env: { EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: SITE_KEY },
      })
    ).toEqual({ kind: 'disabled', reason: 'not-configured' });
  });

  it('lee las variables del bundle cuando no se le pasan', () => {
    // En Jest no hay proyecto real: el valor por defecto no importa, pero no debe lanzar.
    expect(resolveAppCheckPlan({ platform: 'web', firebaseSource: 'offline-mock' }).kind).toBe(
      'disabled'
    );
  });
});

describe('installAppCheck (Web)', () => {
  it('instala reCAPTCHA Enterprise con renovación automática', () => {
    const status = installWebAppCheck(FAKE_APP, 'environment', {
      kind: 'recaptcha-enterprise',
      siteKey: SITE_KEY,
    });

    expect(status).toEqual({ state: 'active', provider: 'recaptcha-enterprise' });
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith(SITE_KEY);
    expect(mockedInitializeAppCheck).toHaveBeenCalledTimes(1);
    const [app, options] = mockedInitializeAppCheck.mock.calls[0] ?? [];
    expect(app).toBe(FAKE_APP);
    expect(options).toMatchObject({
      isTokenAutoRefreshEnabled: true,
      provider: { kind: 'recaptcha-enterprise', siteKey: SITE_KEY },
    });
  });

  it('sin plan no llama al SDK', () => {
    expect(installWebAppCheck(FAKE_APP, 'offline-mock')).toEqual({
      state: 'disabled',
      reason: 'no-firebase-project',
    });
    expect(
      installWebAppCheck(FAKE_APP, 'environment', { kind: 'disabled', reason: 'not-configured' })
    ).toEqual({ state: 'disabled', reason: 'not-configured' });
    expect(installWebAppCheck(FAKE_APP, 'environment', { kind: 'native-custom' })).toEqual({
      state: 'disabled',
      reason: 'not-configured',
    });
    expect(mockedInitializeAppCheck).not.toHaveBeenCalled();
  });

  it('si el SDK lanza, la app sigue sin App Check', () => {
    mockedInitializeAppCheck.mockImplementationOnce(() => {
      throw new Error('already-initialized');
    });

    expect(
      installWebAppCheck(FAKE_APP, 'environment', { kind: 'recaptcha-enterprise', siteKey: SITE_KEY })
    ).toEqual({ state: 'failed' });
  });

  it('registrar una fuente nativa en Web no tiene efecto', () => {
    expect(() =>
      registerWebTokenSource(async () => ({ token: 't', expireTimeMillis: 1 }))
    ).not.toThrow();
  });
});

describe('installAppCheck (nativo)', () => {
  it('con la variable y sin módulo nativo queda no disponible y no llama al SDK', () => {
    expect(installNativeAppCheck(FAKE_APP, 'environment', { kind: 'native-custom' })).toEqual({
      state: 'unavailable',
    });
    expect(mockedInitializeAppCheck).not.toHaveBeenCalled();
  });

  it('con una fuente registrada usa un CustomProvider que le pide el token', async () => {
    const source = jest.fn(async () => ({ token: 'token-nativo', expireTimeMillis: 1_800_000 }));
    registerNativeAppCheckTokenSource(source);

    const status = installNativeAppCheck(FAKE_APP, 'environment', { kind: 'native-custom' });

    expect(status).toEqual({ state: 'active', provider: 'native-custom' });
    expect(CustomProvider).toHaveBeenCalledTimes(1);
    const [providerOptions] = (CustomProvider as unknown as jest.Mock).mock.calls[0] ?? [];
    await expect(providerOptions.getToken()).resolves.toEqual({
      token: 'token-nativo',
      expireTimeMillis: 1_800_000,
    });
    expect(source).toHaveBeenCalledTimes(1);
    expect(mockedInitializeAppCheck.mock.calls[0]?.[1]).toMatchObject({
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('sin variable, o con un plan de Web, no hace nada', () => {
    registerNativeAppCheckTokenSource(async () => ({ token: 't', expireTimeMillis: 1 }));

    expect(installNativeAppCheck(FAKE_APP, 'environment')).toEqual({
      state: 'disabled',
      reason: 'not-configured',
    });
    expect(
      installNativeAppCheck(FAKE_APP, 'environment', {
        kind: 'recaptcha-enterprise',
        siteKey: SITE_KEY,
      })
    ).toEqual({ state: 'disabled', reason: 'not-configured' });
    expect(mockedInitializeAppCheck).not.toHaveBeenCalled();
  });

  it('si el SDK lanza, devuelve failed', () => {
    registerNativeAppCheckTokenSource(async () => ({ token: 't', expireTimeMillis: 1 }));
    mockedInitializeAppCheck.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(installNativeAppCheck(FAKE_APP, 'environment', { kind: 'native-custom' })).toEqual({
      state: 'failed',
    });
  });
});
