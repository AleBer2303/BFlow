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
import { isOwnerCanonicalEmail } from '../../data/repositories/budgetRepository';
import { toBogotaMonthKey } from '../../domain/date/monthKey';
import { clearPersistedAccount } from '../storage/accountCache';
import {
  persistentStorage,
  rotateDeviceSecretToken,
} from '../storage/persistentStorageAdapter';

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
  financialGoal: 'Alcanzar libertad financiera y optimizar flujo de caja',
  authProvider: 'local',
  provider: 'local-demo',
};

const SESSION_STORAGE_KEY = 'bflow.auth.session.v1';

export function savePersistedSession(user: BFlowAuthUser | null): void {
  try {
    if (user) {
      persistentStorage.setItem(SESSION_STORAGE_KEY, user);
    } else {
      persistentStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadPersistedSession(): BFlowAuthUser | null {
  try {
    const user = persistentStorage.getItem<BFlowAuthUser>(SESSION_STORAGE_KEY);
    if (user && typeof user.uid === 'string') {
      return user;
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
    const snap = await Promise.race([
      getDoc(userRef),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (snap && snap.exists()) {
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

  const isOwner = isOwnerCanonicalEmail(firebaseUser.email);
  const hasValidExistingMonth =
    typeof existingData.activeMonthKey === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(existingData.activeMonthKey) &&
    !(
      !isOwner &&
      existingData.activeMonthKey === '2026-10' &&
      existingData.onboardingCompleted !== true
    );

  const activeMonthKey = hasValidExistingMonth
    ? (existingData.activeMonthKey as string)
    : isOwner
      ? '2026-10'
      : `${toBogotaMonthKey().slice(0, 4)}-01`;

  const profilePayload = stripUndefinedFields({
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? null,
    displayName: resolvedDisplayName,
    phone: resolvedPhone,
    financialGoal: resolvedGoal,
    authProvider: resolvedProvider,
    createdAt,
    lastLoginAt: nowIso,
    ...(!hasValidExistingMonth ? { activeMonthKey } : {}),
    updatedAt: nowIso,
  });

  // Asynchronously synchronize user document in background; never block returning the authenticated session
  void setDoc(userRef, profilePayload, { merge: true }).catch(() => {
    // Non-fatal if offline; local cache handles queuing
  });

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

export function formatAuthError(err: unknown, fallbackMessage: string): string {
  if (!(err instanceof Error)) {
    return fallbackMessage;
  }
  const msg = err.message || '';
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
    return 'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'Ya existe una cuenta con este correo. Inicia sesión en su lugar.';
  }
  if (msg.includes('auth/invalid-email')) {
    return 'El formato del correo electrónico no es válido.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
  }
  if (msg.includes('auth/network-request-failed')) {
    return 'Error de conexión. Revisa tu internet e intenta nuevamente.';
  }
  if (msg.includes('auth/too-many-requests')) {
    return 'Demasiados intentos fallidos. Por seguridad, espera un momento antes de reintentar.';
  }
  return msg || fallbackMessage;
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
  const persistedUser = loadPersistedSession();
  savePersistedSession(null);
  if (persistedUser?.uid) {
    clearPersistedAccount(persistedUser.uid);
  }
  try {
    const auth = getFirebaseAuth();
    if (auth.currentUser?.uid && auth.currentUser.uid !== persistedUser?.uid) {
      clearPersistedAccount(auth.currentUser.uid);
    }
    await signOut(auth);
  } catch {
    // Ignore if already signed out
  }
  rotateDeviceSecretToken();
}

export function subscribeToAuthUser(
  listener: (user: BFlowAuthUser | null) => void
): () => void {
  try {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        savePersistedSession(null);
        listener(null);
        return;
      }
      const persisted = loadPersistedSession();
      if (persisted && persisted.uid === firebaseUser.uid) {
        listener(persisted);
      } else {
        const isOwner = isOwnerCanonicalEmail(firebaseUser.email);
        const fastUser: BFlowAuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName:
            firebaseUser.displayName ||
            firebaseUser.email?.split('@')[0] ||
            'Usuario BFlow',
          authProvider:
            firebaseUser.providerData[0]?.providerId === 'google.com'
              ? 'google.com'
              : 'password',
          activeMonthKey: isOwner
            ? '2026-10'
            : `${toBogotaMonthKey().slice(0, 4)}-01`,
          provider: 'firebase',
        };
        savePersistedSession(fastUser);
        listener(fastUser);
      }

      // Run profile document sync strictly in background without blocking listener
      void syncUserProfileDocument(firebaseUser)
        .then((syncedUser) => {
          listener(syncedUser);
        })
        .catch(() => {
          // Non-fatal if offline
        });
    });
  } catch {
    listener(loadPersistedSession());
    return () => {};
  }
}
