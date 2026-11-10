/**
 * src/platform/system/systemChrome.web.ts
 *
 * Web variant of the system chrome adapter: keeps the HTML document in step with the theme.
 * - Page background and `color-scheme` (form controls, scrollbars) follow the palette.
 * - Injects, once, the base stylesheet of the web skin: a 2px accent focus ring for keyboard
 *   users, selection color and reduced-motion handling (design-taste-frontend motion layer).
 * - Loads the web skin's typeface (Geist, Google Fonts) once. If the request fails the
 *   `font-family` stack falls back to the system font; nothing blocks rendering
 *   (`display=swap`).
 *
 * Everything is idempotent and guarded: with no `document` (SSR, tests) it does nothing.
 */

import type { SystemChromeTheme } from './systemChrome.types';

export type { SystemChromeTheme } from './systemChrome.types';

export const BASE_STYLE_ELEMENT_ID = 'bflow-web-base';
export const FONT_LINK_ELEMENT_ID = 'bflow-web-font';

export function buildBaseStylesheet(): string {
  return [
    'html, body, #root { height: 100%; }',
    'body { margin: 0; background-color: var(--bflow-bg); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }',
    ':focus-visible { outline: 2px solid var(--bflow-accent); outline-offset: 2px; }',
    '::selection { background-color: var(--bflow-accent-soft); }',
    '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; } }',
  ].join('\n');
}

function getDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function ensureElement<T extends HTMLElement>(
  doc: Document,
  id: string,
  create: () => T
): T | null {
  if (doc.getElementById(id)) {
    return null;
  }
  const element = create();
  element.id = id;
  doc.head.appendChild(element);
  return element;
}

export function syncSystemChrome(theme: SystemChromeTheme): void {
  const doc = getDocument();
  if (!doc) {
    return;
  }

  const rootStyle = doc.documentElement.style;
  rootStyle.setProperty('--bflow-bg', theme.backgroundColor);
  rootStyle.setProperty('--bflow-accent', theme.accentColor);
  rootStyle.setProperty('--bflow-accent-soft', theme.accentSoftColor);
  rootStyle.setProperty('color-scheme', theme.mode);
  doc.documentElement.lang = 'es';

  ensureElement(doc, BASE_STYLE_ELEMENT_ID, () => {
    const style = doc.createElement('style');
    style.textContent = buildBaseStylesheet();
    return style;
  });

  if (theme.fontStylesheetUrl) {
    const href = theme.fontStylesheetUrl;
    ensureElement(doc, FONT_LINK_ELEMENT_ID, () => {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      return link;
    });
  }
}
