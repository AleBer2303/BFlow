/**
 * src/data/firebase/authPersistence.ts
 *
 * Resolves the Firebase Auth `Persistence` strategy for Web and test runtimes:
 * - Web (`Platform.OS === 'web'`): `browserLocalPersistence`
 * - Node / Jest test environment: `inMemoryPersistence`
 *
 * On iOS and Android, Metro resolves `authPersistence.native.ts` instead.
 */

import {
  browserLocalPersistence,
  inMemoryPersistence,
  type Persistence,
} from 'firebase/auth';
import { Platform } from 'react-native';

export function resolveFirebaseAuthPersistence(): Persistence {
  if (Platform.OS === 'web' && browserLocalPersistence) {
    return browserLocalPersistence;
  }
  return inMemoryPersistence;
}
