/**
 * src/platform/auth/authAdapter.ts
 *
 * Complete Authentication & User Profile Persistence Service for BFlow:
 * - Supports Registration with personal profile data (`displayName`, `phone`, `financialGoal`, `email`, `password`)
 * - Supports Email/Password Sign-In and Google Sign-In (`GoogleAuthProvider`)
 * - Sends the Firebase Auth verification email on registration and tracks `emailVerified` (ADR 0025).
 *   Password reset and email change live in `accountEmailActions.ts`
 * - Persists user profile and session metadata in Cloud Firestore (`/users/{uid}`)
 * - Persists active session locally (`localStorage` on Web + memory cache) and subscribes to Firebase `onAuthStateChanged`
 */

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
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
import { describeUnmetPasswordRule } from '../../domain/auth/passwordPolicy';
import { toBogotaMonthKey } from '../../domain/date/monthKey';
import { clearPersistedAccount } from '../storage/accountCache';
import { runPasswordAttempt, startCooldown } from './authRateLimiter';
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
  /**
   * Estado del correo en Firebase Auth. Queda sin definir en sesiones locales y en las
   * guardadas antes del ADR 0025.
   */
  emailVerified?: boolean;
  /** La cuenta no entra al presupuesto hasta verificar su correo (ADR 0025). */
  emailVerificationRequired?: boolean;
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

/** Idioma de los correos que envía Firebase Auth (verificación, contraseña, cambio de correo). */
export const ACCOUNT_EMAIL_LANGUAGE = 'es';

/**
 * Las cuentas creadas desde esta fecha deben verificar su correo antes de entrar (ADR 0025).
 * Las anteriores quedan exentas para no dejarlas fuera; pueden verificarlo desde Cuenta.
 * Con `0` la verificación pasa a ser obligatoria para todas las cuentas con contraseña.
 */
export const EMAIL_VERIFICATION_ENFORCED_SINCE_MS = Date.parse('2026-11-13T00:00:00-05:00');

/** Longitudes máximas del perfil; coinciden con `isValidUserProfile` de `firestore.rules`. */
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 120;
export const PROFILE_FINANCIAL_GOAL_MAX_LENGTH = 240;

const SESSION_STORAGE_KEY = 'bflow.auth.session.v1';
const LAST_LOGIN_THROTTLE_MS = 24 * 60 * 60 * 1000;

const profileSyncInFlightByUid = new Map<string, Promise<BFlowAuthUser>>();

function isWithinLast24Hours(isoTimestamp: string | undefined, nowMs = Date.now()): boolean {
  if (!isoTimestamp || typeof isoTimestamp !== 'string') return false;
  const parsedMs = Date.parse(isoTimestamp);
  if (Number.isNaN(parsedMs)) return false;
  return nowMs - parsedMs >= 0 && nowMs - parsedMs < LAST_LOGIN_THROTTLE_MS;
}

export function __resetProfileSyncInFlightForTests(): void {
  profileSyncInFlightByUid.clear();
}

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

/** Lo que se lee del usuario de Firebase para resolver la identidad de la sesión. */
export interface FirebaseIdentitySource {
  email: string | null;
  emailVerified?: boolean;
  providerData?: ReadonlyArray<{ providerId: string }>;
  metadata?: { creationTime?: string };
}

function resolveAuthProvider(firebaseUser: FirebaseIdentitySource): 'password' | 'google.com' {
  return firebaseUser.providerData?.[0]?.providerId === 'google.com' ? 'google.com' : 'password';
}

/**
 * Estado de verificación del correo. Solo las cuentas con contraseña nuevas (recién
 * registradas o creadas desde `EMAIL_VERIFICATION_ENFORCED_SINCE_MS`) están obligadas.
 */
export function resolveEmailVerificationState(
  firebaseUser: FirebaseIdentitySource,
  options?: { isNewRegistration?: boolean }
): Required<Pick<BFlowAuthUser, 'emailVerified' | 'emailVerificationRequired'>> {
  const emailVerified = firebaseUser.emailVerified === true;
  const createdAtMs = Date.parse(firebaseUser.metadata?.creationTime ?? '');
  const isEnforcedAccount =
    options?.isNewRegistration === true ||
    (!Number.isNaN(createdAtMs) && createdAtMs >= EMAIL_VERIFICATION_ENFORCED_SINCE_MS);
  return {
    emailVerified,
    emailVerificationRequired:
      !emailVerified && resolveAuthProvider(firebaseUser) === 'password' && isEnforcedAccount,
  };
}

/** `true` mientras la cuenta deba verificar su correo antes de entrar al presupuesto. */
export function requiresEmailVerification(user: BFlowAuthUser | null): boolean {
  return (
    user?.provider === 'firebase' &&
    user.emailVerificationRequired === true &&
    user.emailVerified !== true
  );
}

/**
 * Copia en la sesión lo que solo Firebase Auth sabe: el correo vigente (cambia al confirmar
 * un cambio de correo) y su estado de verificación.
 */
export function withFirebaseIdentity(
  sessionUser: BFlowAuthUser,
  firebaseUser: FirebaseIdentitySource
): BFlowAuthUser {
  return {
    ...sessionUser,
    email: firebaseUser.email ?? sessionUser.email,
    ...resolveEmailVerificationState(firebaseUser),
  };
}

function hasIdentityChanged(previous: BFlowAuthUser, next: BFlowAuthUser): boolean {
  return (
    previous.email !== next.email ||
    previous.emailVerified !== next.emailVerified ||
    previous.emailVerificationRequired !== next.emailVerificationRequired
  );
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
  const hasExplicitOverrides = Boolean(
    overrides?.isNewRegistration ||
      overrides?.displayName ||
      overrides?.phone ||
      overrides?.financialGoal
  );

  // R-12: Deduplicate concurrent profile syncs (e.g. signInWithEmail + onAuthStateChanged firing together)
  const inFlight = profileSyncInFlightByUid.get(firebaseUser.uid);
  if (inFlight && !hasExplicitOverrides) {
    return inFlight;
  }

  const runSync = (async (): Promise<BFlowAuthUser> => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const persisted = loadPersistedSession();
    const canReusePersistedProfile =
      !hasExplicitOverrides &&
      persisted !== null &&
      persisted.uid === firebaseUser.uid &&
      isWithinLast24Hours(persisted.lastLoginAt, nowMs);

    // R-12: If the session was already synced within the last 24h on this device and has no explicit overrides,
    // skip both the redundant getDoc(users/{uid}) read and the setDoc(lastLoginAt) write on boot/listener.
    if (canReusePersistedProfile && persisted) {
      const current = withFirebaseIdentity(persisted, firebaseUser);
      if (hasIdentityChanged(persisted, current)) {
        savePersistedSession(current);
      }
      return current;
    }

    let db: ReturnType<typeof getFirebaseDb> | null = null;
    let userRef: ReturnType<typeof doc> | null = null;
    try {
      db = getFirebaseDb();
      userRef = doc(db, 'users', firebaseUser.uid);
    } catch {
      // Non-fatal in isolated test environments without Firestore mock
    }

    let existingData: Record<string, unknown> = {};
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      if (userRef) {
        const snap = await Promise.race([
          getDoc(userRef),
          new Promise<null>((resolve) => {
            timeoutHandle = setTimeout(() => resolve(null), 1500);
          }),
        ]);
        if (snap && snap.exists()) {
          existingData = snap.data() as Record<string, unknown>;
        }
      }
    } catch {
      // Offline or first read before rules propagation
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    const resolvedDisplayName =
      overrides?.displayName?.trim() ||
      (typeof existingData.displayName === 'string' && existingData.displayName.trim()
        ? existingData.displayName
        : null) ||
      persisted?.displayName ||
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'Usuario BFlow';

    const resolvedPhone =
      overrides?.phone?.trim() ||
      (typeof existingData.phone === 'string' ? existingData.phone : undefined) ||
      persisted?.phone;

    // Una meta vacía en Firestore es una meta borrada: no se rescata la de la sesión guardada.
    const resolvedGoal =
      overrides?.financialGoal?.trim() ||
      (typeof existingData.financialGoal === 'string'
        ? existingData.financialGoal
        : persisted?.financialGoal);

    const resolvedProvider: 'password' | 'google.com' =
      overrides?.authProvider ?? resolveAuthProvider(firebaseUser);

    const createdAt =
      typeof existingData.createdAt === 'string'
        ? existingData.createdAt
        : persisted?.createdAt ?? nowIso;

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
      : persisted?.activeMonthKey ??
        (isOwner ? '2026-10' : `${toBogotaMonthKey().slice(0, 4)}-01`);

    const previousLastLoginAt =
      typeof existingData.lastLoginAt === 'string'
        ? existingData.lastLoginAt
        : persisted?.lastLoginAt;
    const isLastLoginFresh = isWithinLast24Hours(previousLastLoginAt, nowMs);
    const effectiveLastLoginAt = isLastLoginFresh && previousLastLoginAt ? previousLastLoginAt : nowIso;

    // Tras confirmar un cambio de correo, el perfil en Firestore conserva el anterior.
    const isProfileEmailStale =
      typeof existingData.email === 'string' && existingData.email !== firebaseUser.email;

    const shouldWriteProfileDoc =
      hasExplicitOverrides || !isLastLoginFresh || !hasValidExistingMonth || isProfileEmailStale;

    if (shouldWriteProfileDoc && userRef) {
      const profilePayload = stripUndefinedFields({
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? null,
        displayName: resolvedDisplayName,
        phone: resolvedPhone,
        financialGoal: resolvedGoal,
        authProvider: resolvedProvider,
        createdAt,
        lastLoginAt: effectiveLastLoginAt,
        ...(!hasValidExistingMonth ? { activeMonthKey } : {}),
        updatedAt: nowIso,
      });

      // Asynchronously synchronize user document in background; never block returning the authenticated session
      void setDoc(userRef, profilePayload, { merge: true }).catch(() => {
        // Non-fatal if offline; local cache handles queuing
      });
    }

    const authUser: BFlowAuthUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: resolvedDisplayName,
      ...(resolvedPhone ? { phone: resolvedPhone } : {}),
      ...(resolvedGoal ? { financialGoal: resolvedGoal } : {}),
      authProvider: resolvedProvider,
      createdAt,
      lastLoginAt: effectiveLastLoginAt,
      activeMonthKey,
      ...resolveEmailVerificationState(firebaseUser, {
        isNewRegistration: overrides?.isNewRegistration,
      }),
      provider: 'firebase',
    };

    savePersistedSession(authUser);
    return authUser;
  })();

  profileSyncInFlightByUid.set(firebaseUser.uid, runSync);
  void runSync.finally(() => {
    if (profileSyncInFlightByUid.get(firebaseUser.uid) === runSync) {
      profileSyncInFlightByUid.delete(firebaseUser.uid);
    }
  });

  return runSync;
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
  if (
    msg.includes('auth/weak-password') ||
    msg.includes('auth/password-does-not-meet-requirements')
  ) {
    return 'La contraseña no cumple los requisitos de seguridad. Revisa la lista e intenta de nuevo.';
  }
  if (msg.includes('auth/network-request-failed')) {
    return 'Error de conexión. Revisa tu internet e intenta nuevamente.';
  }
  if (msg.includes('auth/too-many-requests')) {
    return 'Demasiados intentos fallidos. Por seguridad, espera un momento antes de reintentar.';
  }
  if (msg.includes('auth/requires-recent-login')) {
    return 'Por seguridad, cierra sesión, vuelve a entrar y repite la acción.';
  }
  if (msg.includes('auth/user-token-expired')) {
    return 'Tu sesión venció. Inicia sesión de nuevo.';
  }
  if (msg.includes('auth/operation-not-allowed')) {
    return 'Esta acción no está habilitada en el proyecto de Firebase.';
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
  // Cinco contraseñas equivocadas seguidas bloquean el acceso 15 minutos (ADR 0026).
  const credential = await runPasswordAttempt(
    'login_password',
    'Correo o contraseña incorrectos.',
    () => signInWithEmailAndPassword(auth, trimmedEmail, password)
  );
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
  const unmetPasswordRule = describeUnmetPasswordRule(input.password);
  if (unmetPasswordRule) {
    throw new Error(unmetPasswordRule);
  }

  await ensureWebAuthPersistence();
  const auth = getFirebaseAuth();
  auth.languageCode = ACCOUNT_EMAIL_LANGUAGE;
  const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, input.password);

  try {
    await updateProfile(credential.user, { displayName: trimmedName });
  } catch {
    // Continue even if profile update is skipped
  }

  // Firebase Auth envía el correo de verificación con su plantilla (ADR 0025).
  try {
    await sendEmailVerification(credential.user);
    // El correo acaba de salir: reenviarlo espera lo mismo que cualquier otro envío.
    startCooldown('verification_email');
  } catch {
    // La pantalla de verificación permite reenviarlo.
  }

  return syncUserProfileDocument(credential.user, {
    displayName: trimmedName,
    phone: input.phone,
    financialGoal: input.financialGoal,
    authProvider: 'password',
    isNewRegistration: true,
  });
}

/**
 * Copia el nombre al perfil de Firebase Auth, que es el que ve un dispositivo nuevo antes de
 * leer `users/{uid}`. Firestore es la fuente de verdad; si esto falla no se informa.
 */
export async function syncAuthDisplayName(displayName: string): Promise<void> {
  try {
    const user = getFirebaseAuth().currentUser;
    if (user && user.displayName !== displayName) {
      await updateProfile(user, { displayName });
    }
  } catch {
    // El nombre ya quedó en Firestore.
  }
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
        const current = withFirebaseIdentity(persisted, firebaseUser);
        if (hasIdentityChanged(persisted, current)) {
          savePersistedSession(current);
        }
        listener(current);
      } else {
        const isOwner = isOwnerCanonicalEmail(firebaseUser.email);
        const fastUser: BFlowAuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName:
            firebaseUser.displayName ||
            firebaseUser.email?.split('@')[0] ||
            'Usuario BFlow',
          authProvider: resolveAuthProvider(firebaseUser),
          activeMonthKey: isOwner
            ? '2026-10'
            : `${toBogotaMonthKey().slice(0, 4)}-01`,
          ...resolveEmailVerificationState(firebaseUser),
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
