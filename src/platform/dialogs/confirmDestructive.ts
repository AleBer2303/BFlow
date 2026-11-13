/**
 * src/platform/dialogs/confirmDestructive.ts
 *
 * Asks before an action that cannot be undone. iOS and Android use the system alert; the
 * browser has no `Alert` (react-native-web ships it as a no-op), so it uses its own confirm.
 */

import { Alert, Platform } from 'react-native';

export interface DestructiveConfirmation {
  title: string;
  message: string;
  /** Label of the destructive button: the verb of the action ("Eliminar"). */
  confirmLabel: string;
  onConfirm: () => void;
}

export function confirmDestructive({
  title,
  message,
  confirmLabel,
  onConfirm,
}: DestructiveConfirmation): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
