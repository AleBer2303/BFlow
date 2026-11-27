/**
 * src/platform/mode/appVersion.ts
 *
 * Version of the running app, read from the Expo config (`app.json` → `expo.version`) instead
 * of a number written by hand in the UI (CC-04). Null when the config carries no version (Jest's
 * `expo-constants` gives an empty config).
 */

import Constants from 'expo-constants';

type ExpoConfigLike = { version?: unknown } | null | undefined;

export function getAppVersion(config: ExpoConfigLike = Constants.expoConfig): string | null {
  const version = config?.version;
  return typeof version === 'string' && version.trim().length > 0 ? version.trim() : null;
}

/** "BFlow v0.1.0 (Liquid Glass)", or "BFlow (Liquid Glass)" without a known version. */
export function formatAppVersionLabel(edition: string, version: string | null = getAppVersion()): string {
  return version ? `BFlow v${version} (${edition})` : `BFlow (${edition})`;
}
