/**
 * src/platform/auth/authAdapter.ts
 *
 * Dual-Mode Authentication Adapter for BFlow:
 * - Mode A (Expo Go / Web): Email/Password (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`),
 *   Web Google OAuth Popup (`signInWithPopup`), and instant local offline demo owner session.
 * - Mode B (`.ipa` native): Supports exchanging a Google ID token via `GoogleAuthProvider.credential(idToken)`.
 */

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { getFirebaseAuth } from '../../data/firebase/firebaseConfig';

export interface BFlowAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider: 'firebase' | 'local-demo';
}

export const DEMO_OWNER_USER: BFlowAuthUser = {
  uid: 'local-owner',
  email: 'abernalg2303@gmail.com',
  displayName: 'Alejandro (Modo Local)',
  provider: 'local-demo',
};

function mapFirebaseUser(user: User): BFlowAuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Usuario BFlow',
    provider: 'firebase',
  };
}

export async function signInWithEmail(email: string, password: string): Promise<BFlowAuthUser> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    throw new Error('Ingresa tu correo y contraseña.');
  }
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
  return mapFirebaseUser(credential.user);
}

export async function registerWithEmail(email: string, password: string): Promise<BFlowAuthUser> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || password.length < 6) {
    throw new Error('Ingresa un correo válido y una contraseña de al menos 6 caracteres.');
  }
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  return mapFirebaseUser(credential.user);
}

export async function signInWithGoogle(idToken?: string): Promise<BFlowAuthUser> {
  const auth = getFirebaseAuth();

  if (idToken) {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    return mapFirebaseUser(result.user);
  }

  if (Platform.OS === 'web') {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return mapFirebaseUser(result.user);
  }

  throw new Error(
    'En Expo Go para iOS usa Correo y Contraseña (Google Sign-In nativo se activa en la build .ipa Modo B o en Web).'
  );
}

export async function signOutCurrentUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export function subscribeToAuthUser(
  listener: (user: BFlowAuthUser | null) => void
): () => void {
  try {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (firebaseUser) => {
      listener(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
    });
  } catch {
    listener(null);
    return () => {};
  }
}
