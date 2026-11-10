import * as SystemUI from 'expo-system-ui';
import { syncSystemChrome as syncNativeChrome } from '../systemChrome';
import {
  BASE_STYLE_ELEMENT_ID,
  FONT_LINK_ELEMENT_ID,
  buildBaseStylesheet,
  syncSystemChrome as syncWebChrome,
} from '../systemChrome.web';
import type { SystemChromeTheme } from '../systemChrome.types';

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

const DARK_THEME: SystemChromeTheme = {
  mode: 'dark',
  backgroundColor: '#0A0A0A',
  accentColor: '#256F82',
  accentSoftColor: 'rgba(95, 179, 198, 0.16)',
  fontStylesheetUrl: 'https://fonts.example/geist.css',
};

interface FakeElement {
  id: string;
  tagName: string;
  textContent: string;
  rel?: string;
  href?: string;
}

function installFakeDocument() {
  const properties = new Map<string, string>();
  const head: FakeElement[] = [];
  const fakeDocument = {
    documentElement: {
      lang: '',
      style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    },
    head: { appendChild: (element: FakeElement) => head.push(element) },
    getElementById: (id: string) => head.find((element) => element.id === id) ?? null,
    createElement: (tagName: string): FakeElement => ({ id: '', tagName, textContent: '' }),
  };
  (globalThis as { document?: unknown }).document = fakeDocument;
  return { properties, head, fakeDocument };
}

describe('platform/system/systemChrome (native)', () => {
  const setBackgroundColorAsync = SystemUI.setBackgroundColorAsync as jest.Mock;

  beforeEach(() => setBackgroundColorAsync.mockClear());

  it('paints the native root view with the theme background', () => {
    syncNativeChrome(DARK_THEME);
    expect(setBackgroundColorAsync).toHaveBeenCalledWith('#0A0A0A');
  });

  it('never throws when the native module rejects or is missing', async () => {
    setBackgroundColorAsync.mockImplementationOnce(() => Promise.reject(new Error('no module')));
    expect(() => syncNativeChrome(DARK_THEME)).not.toThrow();
    await Promise.resolve();

    setBackgroundColorAsync.mockImplementationOnce(() => {
      throw new Error('not linked');
    });
    expect(() => syncNativeChrome(DARK_THEME)).not.toThrow();
  });
});

describe('platform/system/systemChrome (web)', () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it('does nothing without a document', () => {
    expect(() => syncWebChrome(DARK_THEME)).not.toThrow();
  });

  it('publishes the theme as CSS variables and sets the document language', () => {
    const { properties, fakeDocument } = installFakeDocument();

    syncWebChrome(DARK_THEME);

    expect(properties.get('--bflow-bg')).toBe('#0A0A0A');
    expect(properties.get('--bflow-accent')).toBe('#256F82');
    expect(properties.get('--bflow-accent-soft')).toBe('rgba(95, 179, 198, 0.16)');
    expect(properties.get('color-scheme')).toBe('dark');
    expect(fakeDocument.documentElement.lang).toBe('es');
  });

  it('injects the base stylesheet and the typeface once, however often the theme changes', () => {
    const { properties, head } = installFakeDocument();

    syncWebChrome(DARK_THEME);
    syncWebChrome({ ...DARK_THEME, mode: 'light', backgroundColor: '#DEDAD3' });

    expect(head).toHaveLength(2);
    expect(head.find((element) => element.id === BASE_STYLE_ELEMENT_ID)?.tagName).toBe('style');
    const link = head.find((element) => element.id === FONT_LINK_ELEMENT_ID);
    expect(link).toMatchObject({ tagName: 'link', rel: 'stylesheet', href: DARK_THEME.fontStylesheetUrl });
    expect(properties.get('--bflow-bg')).toBe('#DEDAD3');
    expect(properties.get('color-scheme')).toBe('light');
  });

  it('loads no typeface for the skins that do not ask for one', () => {
    const { head } = installFakeDocument();
    const { fontStylesheetUrl: _unused, ...withoutFont } = DARK_THEME;

    syncWebChrome(withoutFont);

    expect(head.map((element) => element.id)).toEqual([BASE_STYLE_ELEMENT_ID]);
  });

  it('ships a keyboard focus ring, a selection color and reduced-motion handling', () => {
    const css = buildBaseStylesheet();
    expect(css).toContain(':focus-visible { outline: 2px solid var(--bflow-accent); outline-offset: 2px; }');
    expect(css).toContain('::selection');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('background-color: var(--bflow-bg)');
  });
});
