/**
 * src/platform/system/systemChrome.ts
 *
 * Native variant of the system chrome adapter (iOS and Android; Metro picks
 * `systemChrome.web.ts` in the browser).
 *
 * Paints the native root view with the theme background, so Android's edge-to-edge system bars
 * and the keyboard / rotation gaps never flash white over a dark screen. Never throws: a
 * missing native module (old dev client, tests) is ignored.
 */

import * as SystemUI from 'expo-system-ui';
import type { SystemChromeTheme } from './systemChrome.types';

export type { SystemChromeTheme } from './systemChrome.types';

export function syncSystemChrome(theme: SystemChromeTheme): void {
  try {
    void SystemUI.setBackgroundColorAsync(theme.backgroundColor).catch(() => undefined);
  } catch {
    // Native module unavailable: the JS root background still covers the screen.
  }
}
