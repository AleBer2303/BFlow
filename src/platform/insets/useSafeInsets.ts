/**
 * src/platform/insets/useSafeInsets.ts
 *
 * System bar / cutout insets, safe to call without a provider (unit tests, isolated previews):
 * outside a `SafeAreaProvider` every edge is 0 instead of throwing.
 *
 * iOS screens already clear the status bar through `contentInsetAdjustmentBehavior`; Android
 * draws edge to edge, so the Android skin pads these insets itself.
 */

import { useContext } from 'react';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

export const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function useSafeInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;
}
