/**
 * src/data/firebase/firebaseConfig.ts
 *
 * Firebase JS SDK initialization for BFlow (Mode A & Mode B compatible).
 *
 * The project configuration comes only from `EXPO_PUBLIC_FIREBASE_*` (ADR 0027): the source
 * carries no project credentials. Tests and the showcase mode use an offline placeholder
 * project; a real build without the variables fails with an explicit error.
 */

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  CACHE_SIZE_UNLIMITED,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { isDemoModeEnabled } from '../../platform/mode/demoMode';
import { resolveFirebaseAuthPersistence } from './authPersistence';

/** De dónde sale la configuración: del entorno, del proyecto ficticio o de ningún sitio. */
export type FirebaseConfigSource = 'environment' | 'offline-mock' | 'missing';

export interface BFlowFirebaseEnvironment {
  options: FirebaseOptions;
  isConfigured: boolean;
  source: FirebaseConfigSource;
  missingKeys: string[];
}

export interface FirebaseEnvironmentRuntime {
  isTestRuntime?: boolean;
  isDemoMode?: boolean;
}

type FirebaseEnvRecord = Record<string, string | undefined>;

/**
 * Metro solo sustituye `process.env.EXPO_PUBLIC_*` cuando se lee con acceso estático, así que
 * cada variable se nombra aquí completa.
 */
const BUNDLED_FIREBASE_ENV: FirebaseEnvRecord = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const REQUIRED_FIREBASE_ENV_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const PLACEHOLDER_FRAGMENTS = ['your_api_key', 'your-project-id'];

/** Proyecto ficticio (`demo-` es el prefijo de proyectos sin conexión de Firebase). */
const OFFLINE_FIREBASE_OPTIONS: FirebaseOptions = {
  apiKey: 'offline-placeholder-api-key',
  authDomain: 'demo-bflow.firebaseapp.com',
  projectId: 'demo-bflow',
  storageBucket: 'demo-bflow.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
};

export const FIREBASE_CONFIG_MISSING_MESSAGE =
  'BFlow no está conectado a Firebase: este build no trae las variables EXPO_PUBLIC_FIREBASE_*.';

function readConfiguredValue(env: FirebaseEnvRecord, key: string): string | undefined {
  const value = env[key]?.trim();
  if (!value || PLACEHOLDER_FRAGMENTS.some((fragment) => value.includes(fragment))) {
    return undefined;
  }
  return value;
}

export function resolveFirebaseEnvironment(
  env: FirebaseEnvRecord = BUNDLED_FIREBASE_ENV,
  runtime: FirebaseEnvironmentRuntime = {}
): BFlowFirebaseEnvironment {
  const { isTestRuntime = process.env.NODE_ENV === 'test', isDemoMode = isDemoModeEnabled() } =
    runtime;

  const offlineMock: BFlowFirebaseEnvironment = {
    options: OFFLINE_FIREBASE_OPTIONS,
    isConfigured: false,
    source: 'offline-mock',
    missingKeys: [],
  };
  // El modo vitrina no habla con Firebase aunque el entorno traiga un proyecto real.
  if (isDemoMode) {
    return offlineMock;
  }

  const missingKeys = REQUIRED_FIREBASE_ENV_KEYS.filter(
    (key) => readConfiguredValue(env, key) === undefined
  );
  if (missingKeys.length > 0) {
    return isTestRuntime
      ? offlineMock
      : { options: {}, isConfigured: false, source: 'missing', missingKeys };
  }

  return {
    options: {
      apiKey: readConfiguredValue(env, 'EXPO_PUBLIC_FIREBASE_API_KEY'),
      authDomain: readConfiguredValue(env, 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
      projectId: readConfiguredValue(env, 'EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
      storageBucket: readConfiguredValue(env, 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: readConfiguredValue(env, 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
      appId: readConfiguredValue(env, 'EXPO_PUBLIC_FIREBASE_APP_ID'),
    },
    isConfigured: true,
    source: 'environment',
    missingKeys: [],
  };
}

/** Opciones para `initializeApp`; lanza si el build no trae configuración. */
export function requireFirebaseOptions(
  environment: BFlowFirebaseEnvironment = resolveFirebaseEnvironment()
): FirebaseOptions {
  if (environment.source === 'missing') {
    throw new Error(FIREBASE_CONFIG_MISSING_MESSAGE);
  }
  return environment.options;
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) {
    return cachedApp;
  }
  const existing = getApps();
  if (existing.length > 0 && existing[0]) {
    cachedApp = existing[0];
    return cachedApp;
  }
  cachedApp = initializeApp(requireFirebaseOptions());
  return cachedApp;
}

export function getFirebaseDb(): Firestore {
  if (cachedDb) {
    return cachedDb;
  }
  const app = getFirebaseApp();
  try {
    const localCache =
      Platform.OS === 'web' && typeof indexedDB !== 'undefined'
        ? persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
            cacheSizeBytes: CACHE_SIZE_UNLIMITED,
          })
        : memoryLocalCache();
    cachedDb = initializeFirestore(app, {
      localCache,
    });
  } catch {
    try {
      cachedDb = initializeFirestore(app, {
        localCache: memoryLocalCache(),
      });
    } catch {
      cachedDb = getFirestore(app);
    }
  }
  return cachedDb;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) {
    return cachedAuth;
  }
  const app = getFirebaseApp();
  try {
    cachedAuth = initializeAuth(app, {
      persistence: resolveFirebaseAuthPersistence(),
    });
  } catch {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}
