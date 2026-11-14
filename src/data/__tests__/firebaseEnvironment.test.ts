/**
 * Configuración de Firebase solo desde el entorno (ADR 0027).
 */

import {
  FIREBASE_CONFIG_MISSING_MESSAGE,
  requireFirebaseOptions,
  resolveFirebaseEnvironment,
} from '../firebase/firebaseConfig';

const COMPLETE_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'bflow-test.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'bflow-test',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bflow-test.firebasestorage.app',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:123456789012:web:abcdef',
};

const PRODUCTION = { isTestRuntime: false, isDemoMode: false };

describe('resolveFirebaseEnvironment', () => {
  it('usa las variables EXPO_PUBLIC_FIREBASE_* cuando están completas', () => {
    const environment = resolveFirebaseEnvironment(COMPLETE_ENV, PRODUCTION);

    expect(environment.source).toBe('environment');
    expect(environment.isConfigured).toBe(true);
    expect(environment.missingKeys).toEqual([]);
    expect(environment.options).toEqual({
      apiKey: 'test-api-key',
      authDomain: 'bflow-test.firebaseapp.com',
      projectId: 'bflow-test',
      storageBucket: 'bflow-test.firebasestorage.app',
      messagingSenderId: '123456789012',
      appId: '1:123456789012:web:abcdef',
    });
  });

  it('recorta espacios y acepta que falten las variables opcionales', () => {
    const environment = resolveFirebaseEnvironment(
      {
        EXPO_PUBLIC_FIREBASE_API_KEY: '  test-api-key  ',
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'bflow-test',
        EXPO_PUBLIC_FIREBASE_APP_ID: '1:123456789012:web:abcdef',
      },
      PRODUCTION
    );

    expect(environment.source).toBe('environment');
    expect(environment.options.apiKey).toBe('test-api-key');
    expect(environment.options.authDomain).toBeUndefined();
  });

  it('en un build real sin variables no inventa un proyecto', () => {
    const environment = resolveFirebaseEnvironment({}, PRODUCTION);

    expect(environment.source).toBe('missing');
    expect(environment.isConfigured).toBe(false);
    expect(environment.options).toEqual({});
    expect(environment.missingKeys).toEqual([
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      'EXPO_PUBLIC_FIREBASE_APP_ID',
    ]);
    expect(() => requireFirebaseOptions(environment)).toThrow(FIREBASE_CONFIG_MISSING_MESSAGE);
  });

  it('trata como ausentes los valores vacíos de .env.example y los de relleno', () => {
    const emptyValues = resolveFirebaseEnvironment(
      { ...COMPLETE_ENV, EXPO_PUBLIC_FIREBASE_API_KEY: '', EXPO_PUBLIC_FIREBASE_APP_ID: '   ' },
      PRODUCTION
    );
    expect(emptyValues.source).toBe('missing');
    expect(emptyValues.missingKeys).toEqual([
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_APP_ID',
    ]);

    const placeholders = resolveFirebaseEnvironment(
      {
        EXPO_PUBLIC_FIREBASE_API_KEY: 'your_api_key_here',
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'your-project-id',
        EXPO_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
      },
      PRODUCTION
    );
    expect(placeholders.source).toBe('missing');
    expect(placeholders.missingKeys).toEqual([
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    ]);
  });

  it('los tests sin variables usan el proyecto ficticio', () => {
    const environment = resolveFirebaseEnvironment({}, { isTestRuntime: true, isDemoMode: false });

    expect(environment.source).toBe('offline-mock');
    expect(environment.isConfigured).toBe(false);
    expect(environment.options.projectId).toBe('demo-bflow');
    expect(requireFirebaseOptions(environment)).toBe(environment.options);
  });

  it('el modo vitrina usa el proyecto ficticio aunque el entorno traiga uno real', () => {
    const environment = resolveFirebaseEnvironment(COMPLETE_ENV, {
      isTestRuntime: false,
      isDemoMode: true,
    });

    expect(environment.source).toBe('offline-mock');
    expect(environment.options.projectId).toBe('demo-bflow');
    expect(environment.options.apiKey).not.toBe(COMPLETE_ENV.EXPO_PUBLIC_FIREBASE_API_KEY);
  });

  it('bajo Jest siempre hay una configuración utilizable', () => {
    expect(resolveFirebaseEnvironment().source).not.toBe('missing');
    expect(() => requireFirebaseOptions()).not.toThrow();
  });

  it('el código fuente no lleva credenciales de ningún proyecto real', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as { readFileSync: (p: string, enc: string) => string };
    const source = fs.readFileSync('src/data/firebase/firebaseConfig.ts', 'utf8');

    expect(source).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(source).not.toMatch(/bflow-deaeb/);
    // El appId del proyecto ficticio es todo ceros; cualquier otro sería uno real.
    expect(source).not.toMatch(/\d+:(?!0+:)\d{6,}:web:[0-9a-f]{10,}/);
  });
});
