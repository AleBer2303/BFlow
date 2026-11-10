/**
 * src/platform/mode/demoMode.ts
 *
 * Local showcase mode (`EXPO_PUBLIC_BFLOW_DEMO=1`, see `npm run web:demo`).
 *
 * The app boots signed in as the local demo owner with the October 2026 seed, never talks to
 * Firebase (the demo user is not a "real" auth user, so the store skips every cloud write) and
 * accepts `?skin=ios|android|web` and `?theme=dark|light` in the URL. It exists so the three
 * platform skins can be reviewed and tested from a browser on Windows without credentials.
 *
 * Production builds never set the flag: without it both helpers are inert.
 */

const ENABLED_VALUES = new Set(['1', 'true']);

export function isDemoModeEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_BFLOW_DEMO
): boolean {
  return flag !== undefined && ENABLED_VALUES.has(flag.trim().toLowerCase());
}

function readLocationSearch(): string {
  try {
    const location = (globalThis as { location?: { search?: unknown } }).location;
    return typeof location?.search === 'string' ? location.search : '';
  } catch {
    return '';
  }
}

/**
 * Reads a URL query parameter, only while the demo mode is on.
 * Returns null on native, in production and when the parameter is missing or empty.
 */
export function readDemoQueryParam(
  name: string,
  search: string = readLocationSearch(),
  enabled: boolean = isDemoModeEnabled()
): string | null {
  if (!enabled || search.length === 0) {
    return null;
  }

  const query = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    const separatorIndex = pair.indexOf('=');
    const key = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    if (key !== name) {
      continue;
    }
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
    try {
      const value = decodeURIComponent(rawValue).trim().toLowerCase();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}
