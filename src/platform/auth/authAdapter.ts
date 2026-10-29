/**
 * src/platform/auth/authAdapter.ts
 *
 * Complete Authentication & User Profile Persistence Service for BFlow:
 * - Supports Registration with personal profile data (`displayName`, `phone`, `financialGoal`, `email`, `password`)
 * - Supports Email/Password Sign-In, Google Sign-In (`GoogleAuthProvider`), and Password Reset
 * - Persists user profile and session metadata in Cloud Firestore (`/users/{uid}`)
 * - Persists active session locally (`localStorage` on Web + memory cache) and subscribes to Firebase `onAuthStateChanged`
 */

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { getFirebaseAuth, getFirebaseDb } from '../../data/firebase/firebaseConfig';
import { stripUndefinedFields } from '../../data/mappers/firestoreSchemas';

export interface BFlowAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone?: string;
  financialGoal?: string;
  authProvider?: 'password' | 'google.com' | 'local';
  createdAt?: string;
  lastLoginAt?: string;
  activeMonthKey?: string;
  provider: 'firebase' | 'local-demo';
}

export interface RegisterPersonalAccountInput {
  displayName: string;
  email: string;
  password: string;
  phone?: string;
  financialGoal?: string;
}

export const DEMO_OWNER_USER: BFlowAuthUser = {
  uid: 'local-owner',
  email: 'abernalg2303@gmail.com',
  displayName: 'Alejandro Bernal',
  phone: '+57 300 000 0000',
  financialGoal: 'Saldar deuda FUNFAMI y fortalecer fondo CB300F',
  authProvider: 'local',
  provider: 'local-demo',
};

const SESSION_STORAGE_KEY = 'bflow.auth.session.v1';
let memorySessionCache: BFlowAuthUser | null = null;

export function savePersistedSession(user: BFlowAuthUser | null): void {
  memorySessionCache = user;
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      if (user) {
        globalThis.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } else {
        globalThis.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors in private browsing or restricted environments
  }
}

export function loadPersistedSession(): BFlowAuthUser | null {
  if (memorySessionCache) {
    return memorySessionCache;
  }
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BFlowAuthUser;
        if (parsed && typeof parsed.uid === 'string') {
          memorySessionCache = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

async function ensureWebAuthPersistence(): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const auth = getFirebaseAuth();
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Ignore if persistence is already configured or unsupported in test runner
  }
}

async function syncUserProfileDocument(
  firebaseUser: User,
  overrides?: {
    displayName?: string;
    phone?: string;
    financialGoal?: string;
    authProvider?: 'password' | 'google.com';
    isNewRegistration?: boolean;
  }
): Promise<BFlowAuthUser> {
  const db = getFirebaseDb();
  const userRef = doc(db, 'users', firebaseUser.uid);
  const nowIso = new Date().toISOString();

  let existingData: Record<string, unknown> = {};
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingData = snap.data() as Record<string, unknown>;
    }
  } catch {
    // Offline or first read before rules propagation
  }

  const resolvedDisplayName =
    overrides?.displayName?.trim() ||
    (typeof existingData.displayName === 'string' && existingData.displayName.trim()
      ? existingData.displayName
      : null) ||
    firebaseUser.displayName ||
    firebaseUser.email?.split('@')[0] ||
    'Usuario BFlow';

  const resolvedPhone =
    overrides?.phone?.trim() ||
    (typeof existingData.phone === 'string' ? existingData.phone : undefined);

  const resolvedGoal =
    overrides?.financialGoal?.trim() ||
    (typeof existingData.financialGoal === 'string' ? existingData.financialGoal : undefined);

  const resolvedProvider: 'password' | 'google.com' =
    overrides?.authProvider ??
    (firebaseUser.providerData[0]?.providerId === 'google.com' ? 'google.com' : 'password');

  const createdAt =
    typeof existingData.createdAt === 'string' ? existingData.createdAt : nowIso;

  const activeMonthKey =
    typeof existingData.activeMonthKey === 'string' ? existingData.activeMonthKey : '2026-10';

  const profilePayload = stripUndefinedFields({
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? null,
    displayName: resolvedDisplayName,
    phone: resolvedPhone,
    financialGoal: resolvedGoal,
    authProvider: resolvedProvider,
    createdAt,
    lastLoginAt: nowIso,
    activeMonthKey,
    updatedAt: nowIso,
  });

  try {
    await setDoc(userRef, profilePayload, { merge: true });
  } catch {
    // Non-fatal if offline; local cache handles queuing
  }

  const authUser: BFlowAuthUser = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: resolvedDisplayName,
    ...(resolvedPhone ? { phone: resolvedPhone } : {}),
    ...(resolvedGoal ? { financialGoal: resolvedGoal } : {}),
    authProvider: resolvedProvider,
    createdAt,
    lastLoginAt: nowIso,
    activeMonthKey,
    provider: 'firebase',
  };

  savePersistedSession(authUser);
  return authUser;
}

export async function signInWithEmail(email: string, password: string): Promise<BFlowAuthUser> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    throw new Error('Escribe tu correo electrónico y tu contraseña para entrar.');
  }
  await ensureWebAuthPersistence();
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
  return syncUserProfileDocument(credential.user, { authProvider: 'password' });
}

export async function registerWithPersonalProfile(
  input: RegisterPersonalAccountInput
): Promise<BFlowAuthUser> {
  const trimmedName = input.displayName.trim();
  const trimmedEmail = input.email.trim().toLowerCase();

  if (trimmedName.length < 2) {
    throw new Error('Escribe tu nombre completo para personalizar tu cuenta.');
  }
  if (!trimmedEmail.includes('@')) {
    throw new Error('Escribe un correo electrónico válido.');
  }
  if (input.password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  await ensureWebAuthPersistence();
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, input.password);

  try {
    await updateProfile(credential.user, { displayName: trimmedName });
  } catch {
    // Continue even if profile update is skipped
  }

  return syncUserProfileDocument(credential.user, {
    displayName: trimmedName,
    phone: input.phone,
    financialGoal: input.financialGoal,
    authProvider: 'password',
    isNewRegistration: true,
  });
}

export async function registerWithEmail(email: string, password: string): Promise<BFlowAuthUser> {
  const fallbackName = email.trim().split('@')[0] || 'Usuario BFlow';
  return registerWithPersonalProfile({
    displayName: fallbackName,
    email,
    password,
  });
}

export async function signInWithGoogle(idToken?: string): Promise<BFlowAuthUser> {
  await ensureWebAuthPersistence();
  const auth = getFirebaseAuth();

  if (idToken) {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    return syncUserProfileDocument(result.user, { authProvider: 'google.com' });
  }

  if (Platform.OS === 'web') {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return syncUserProfileDocument(result.user, { authProvider: 'google.com' });
  }

  throw new Error(
    'En Expo Go para iOS inicia sesión con tu correo y contraseña. El acceso directo con Google en iOS se activa en la build nativa .ipa (Modo B) o desde el navegador web.'
  );
}

export async function sendPasswordRecoveryEmail(email: string): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail.includes('@')) {
    throw new Error('Escribe el correo electrónico de tu cuenta para enviarte el enlace.');
  }
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, trimmedEmail);
}

export async function signOutCurrentUser(): Promise<void> {
  savePersistedSession(null);
  try {
    const auth = getFirebaseAuth();
    await signOut(auth);
  } catch {
    // Ignore if already signed out
  }
}

export function subscribeToAuthUser(
  listener: (user: BFlowAuthUser | null) => void
): () => void {
  try {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        savePersistedSession(null);
        listener(null);
        return;
      }
      const syncedUser = await syncUserProfileDocument(firebaseUser);
      listener(syncedUser);
    });
  } catch {
    listener(loadPersistedSession());
    return () => {};
  }
}
