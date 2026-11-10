/**
 * src/design-system/platform/platformSkin.ts
 *
 * Resolves which visual identity ("piel") the running app wears. One skin per operating
 * system; the local showcase mode may force another one with `?skin=` to review all three
 * from a browser (see src/platform/mode/demoMode.ts).
 */

import { Platform } from 'react-native';
import { readDemoQueryParam } from '../../platform/mode/demoMode';
import { PLATFORM_SKIN_IDS, type PlatformSkinId, type ThemeMode } from '../tokens';

export function parsePlatformSkin(value: string | null | undefined): PlatformSkinId | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return PLATFORM_SKIN_IDS.find((id) => id === normalized) ?? null;
}

/**
 * @param os        `Platform.OS` (injected in tests).
 * @param override  Value of the demo-only `?skin=` parameter; ignored when invalid.
 */
export function resolvePlatformSkin(
  os: string = Platform.OS,
  override: string | null = readDemoQueryParam('skin')
): PlatformSkinId {
  const forcedSkin = parsePlatformSkin(override);
  if (forcedSkin) {
    return forcedSkin;
  }
  if (os === 'android') {
    return 'android';
  }
  if (os === 'web') {
    return 'web';
  }
  // iOS, and any other Apple-family target (macOS Catalyst, visionOS), keep Liquid Glass.
  return 'ios';
}

/** Demo-only `?theme=dark|light`; otherwise the given fallback. */
export function resolveInitialThemeMode(
  fallback: ThemeMode = 'dark',
  override: string | null = readDemoQueryParam('theme')
): ThemeMode {
  return override === 'dark' || override === 'light' ? override : fallback;
}
