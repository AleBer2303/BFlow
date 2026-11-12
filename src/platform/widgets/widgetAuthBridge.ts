/**
 * src/platform/widgets/widgetAuthBridge.ts
 *
 * Mantiene al día las credenciales que usan los widgets nativos para refrescar su snapshot
 * desde Firestore con la app cerrada (ADR 0021). Escucha `onIdTokenChanged`, que dispara al
 * iniciar sesión, al restaurar la sesión, al rotar el token y al cerrarla.
 */

import { onIdTokenChanged, type User } from 'firebase/auth';
import { Platform } from 'react-native';

import { getFirebaseApp, getFirebaseAuth } from '../../data/firebase/firebaseConfig';
import { clearWidgetData, syncWidgetAuth } from './widgetAdapter';
import type { WidgetAuthV1 } from './widgetSnapshot';

export function buildWidgetAuth(
  user: Pick<User, 'uid' | 'refreshToken'> | null,
  options: { apiKey?: string; projectId?: string }
): WidgetAuthV1 | null {
  if (!user?.uid || !user.refreshToken || !options.apiKey || !options.projectId) {
    return null;
  }
  return {
    schemaVersion: 1,
    uid: user.uid,
    refreshToken: user.refreshToken,
    apiKey: options.apiKey,
    projectId: options.projectId,
  };
}

/**
 * Suscribe el puente. En Web no hay widgets, así que no hace nada. Al cerrar sesión borra
 * credenciales y snapshot para que la pantalla de inicio no siga mostrando la cuenta.
 */
export function subscribeWidgetAuthBridge(): () => void {
  if (Platform.OS === 'web') {
    return () => undefined;
  }
  try {
    const auth = getFirebaseAuth();
    const { apiKey, projectId } = getFirebaseApp().options;
    return onIdTokenChanged(auth, (user) => {
      if (!user) {
        clearWidgetData();
        return;
      }
      const widgetAuth = buildWidgetAuth(user, { apiKey, projectId });
      if (widgetAuth) {
        syncWidgetAuth(widgetAuth);
      }
    });
  } catch {
    return () => undefined;
  }
}
