/**
 * Enlaces que abren los widgets: `bflow://?tab=checklist`. Se aceptan solo las pestañas que
 * pinta un widget; cualquier otra cosa se ignora.
 */
export type WidgetDeepLinkTab = 'summary' | 'checklist' | 'debts' | 'savings';

const WIDGET_TABS: ReadonlySet<string> = new Set(['summary', 'checklist', 'debts', 'savings']);

export function buildWidgetDeepLink(tab: WidgetDeepLinkTab): string {
  return `bflow://?tab=${tab}`;
}

export function parseWidgetDeepLinkTab(url: string | null | undefined): WidgetDeepLinkTab | null {
  if (!url) return null;
  const queryStart = url.indexOf('?');
  if (queryStart < 0) return null;
  const query = url.slice(queryStart + 1).split('#')[0] ?? '';
  for (const pair of query.split('&')) {
    const [rawKey, rawValue] = pair.split('=');
    if (rawKey === 'tab' && rawValue) {
      let value: string;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        return null;
      }
      return WIDGET_TABS.has(value) ? (value as WidgetDeepLinkTab) : null;
    }
  }
  return null;
}
