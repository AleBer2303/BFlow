/**
 * src/data/firebase/firebaseConfig.ts
 *
 * Firebase JS SDK initialization for BFlow (Mode A & Mode B compatible).
 * Uses `EXPO_PUBLIC_FIREBASE_*` environment variables with fallback to the
 * public client configuration of project `bflow-deaeb` so Expo Go and Web
 * connect out of the box.
 */

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  type Firestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';

export interface BFlowFirebaseEnvironment {
  options: FirebaseOptions;
  isConfigured: boolean;
}

const DEFAULT_BFLOW_FIREBASE_OPTIONS: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAWzxVFw0B9PDibx494JzZXMpfrxXvKD04',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'bflow-deaeb.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'bflow-deaeb',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'bflow-deaeb.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '836510275030',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:836510275030:web:b4ca05235e73e724c78077',
};

export function resolveFirebaseEnvironment(
  env: Record<string, string | undefined> = process.env
): BFlowFirebaseEnvironment {
  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY ?? DEFAULT_BFLOW_FIREBASE_OPTIONS.apiKey;
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? DEFAULT_BFLOW_FIREBASE_OPTIONS.projectId;
  const appId = env.EXPO_PUBLIC_FIREBASE_APP_ID ?? DEFAULT_BFLOW_FIREBASE_OPTIONS.appId;

  const isConfigured = Boolean(
    apiKey &&
      projectId &&
      appId &&
      !apiKey.includes('your_api_key') &&
      !projectId.includes('your-project-id')
  );

  return {
    options: {
      apiKey,
      authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? DEFAULT_BFLOW_FIREBASE_OPTIONS.authDomain,
      projectId,
      storageBucket:
        env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? DEFAULT_BFLOW_FIREBASE_OPTIONS.storageBucket,
      messagingSenderId:
        env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
        DEFAULT_BFLOW_FIREBASE_OPTIONS.messagingSenderId,
      appId,
    },
    isConfigured,
  };
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
  const { options } = resolveFirebaseEnvironment();
  cachedApp = initializeApp(options);
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
        ? persistentLocalCache()
        : memoryLocalCache();
    cachedDb = initializeFirestore(app, {
      localCache,
    });
  } catch {
    cachedDb = getFirestore(app);
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
      persistence: Platform.OS === 'web' ? browserLocalPersistence : inMemoryPersistence,
    });
  } catch {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}
