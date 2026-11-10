import type { ThemeMode } from '../../design-system/tokens';

/** What the host system (native window, HTML document) needs to match the app theme. */
export interface SystemChromeTheme {
  mode: ThemeMode;
  backgroundColor: string;
  accentColor: string;
  accentSoftColor: string;
  /** Web skin only: stylesheet of its typeface. Omitted on the other skins. */
  fontStylesheetUrl?: string;
}
