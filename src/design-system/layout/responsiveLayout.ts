/**
 * src/design-system/layout/responsiveLayout.ts
 *
 * One responsive contract for the three skins. `resolveResponsiveLayout` is pure (unit tested
 * at every breakpoint); `useResponsiveLayout` feeds it the live window size.
 *
 * Size classes follow Material 3 (compact < 600 <= medium < 840 <= expanded). The web skin also
 * follows the design-taste-frontend grid: one centered 1280px column with 24 / 48 / 80px
 * gutters and 4 / 8 / 12 columns.
 */

import { useWindowDimensions } from 'react-native';
import { useBFlowTheme } from '../theme/ThemeContext';
import { breakpoints, contentMaxWidth, spacing, type PlatformSkinId } from '../tokens';

export type WindowSizeClass = 'compact' | 'medium' | 'expanded';

export interface ResponsiveLayout {
  width: number;
  height: number;
  sizeClass: WindowSizeClass;
  /** True from 1024px: room for side-by-side panels (two-column Summary, split sign-in). */
  isWide: boolean;
  /** Horizontal page padding. */
  gutter: number;
  /** Widest the content column grows; it is centered beyond that. */
  contentMaxWidth: number;
  /** Width actually available to content after gutters and the max width. */
  contentWidth: number;
  columns: 4 | 8 | 12;
  columnGap: number;
}

/** Narrowest supported window (iPhone SE 1st gen / small Android): never lay out below it. */
export const MIN_SUPPORTED_WIDTH = 320;
const NARROW_PHONE_WIDTH = 360;
const WEB_PHONE_MAX_WIDTH = 640;

export function resolveWindowSizeClass(width: number): WindowSizeClass {
  if (width >= breakpoints.expanded) {
    return 'expanded';
  }
  if (width >= breakpoints.medium) {
    return 'medium';
  }
  return 'compact';
}

function resolveGutter(width: number, skin: PlatformSkinId, sizeClass: WindowSizeClass): number {
  if (width < NARROW_PHONE_WIDTH) {
    return spacing.lg;
  }
  if (skin === 'web') {
    if (width < WEB_PHONE_MAX_WIDTH) {
      return spacing.xl;
    }
    return width < breakpoints.wide ? 48 : 80;
  }
  return sizeClass === 'compact' ? spacing.lg : spacing.xl;
}

export function resolveResponsiveLayout(
  width: number,
  height: number,
  skin: PlatformSkinId
): ResponsiveLayout {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : MIN_SUPPORTED_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  const sizeClass = resolveWindowSizeClass(safeWidth);
  const gutter = resolveGutter(safeWidth, skin, sizeClass);
  const maxWidth = contentMaxWidth[skin];

  return {
    width: safeWidth,
    height: safeHeight,
    sizeClass,
    isWide: safeWidth >= breakpoints.wide,
    gutter,
    contentMaxWidth: maxWidth,
    contentWidth: Math.max(0, Math.min(maxWidth, safeWidth - gutter * 2)),
    columns: sizeClass === 'expanded' ? 12 : sizeClass === 'medium' ? 8 : 4,
    columnGap: sizeClass === 'compact' ? spacing.md : spacing.xl,
  };
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const { skin } = useBFlowTheme();
  return resolveResponsiveLayout(width, height, skin);
}
