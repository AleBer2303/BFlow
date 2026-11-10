/**
 * src/design-system/components/ResponsiveColumns.tsx
 *
 * Lays its children out in equal columns when the content column is wide enough for each to
 * keep `minColumnWidth`, and as a single stacked column otherwise. Screens use it so a desktop
 * browser gets side-by-side panels while a phone keeps the exact stacked layout it had.
 *
 * Children fill the grid row by row; a short last row is padded with empty cells so every
 * column keeps the same width and the left and right edges stay on the page's lines.
 */

import React from 'react';
import { View } from 'react-native';
import { useResponsiveLayout } from '../layout/responsiveLayout';
import { useBFlowTheme } from '../theme/ThemeContext';

export interface ResponsiveColumnsProps {
  children: React.ReactNode;
  /** Narrowest a column may get before the layout drops a column. */
  minColumnWidth?: number;
  maxColumns?: number;
  /** Defaults to the grid gap of the current size class. */
  gap?: number;
  /** 'start' keeps each panel at its own height; 'stretch' equalizes a row. */
  align?: 'start' | 'stretch';
  testID?: string;
}

export const DEFAULT_MIN_COLUMN_WIDTH = 400;

export function resolveColumnCount(
  contentWidth: number,
  minColumnWidth: number,
  gap: number,
  maxColumns: number
): number {
  if (minColumnWidth <= 0 || maxColumns <= 1) {
    return 1;
  }
  const fitting = Math.floor((contentWidth + gap) / (minColumnWidth + gap));
  return Math.max(1, Math.min(maxColumns, fitting));
}

export function ResponsiveColumns({
  children,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
  maxColumns = 2,
  gap,
  align = 'start',
  testID,
}: ResponsiveColumnsProps): React.JSX.Element {
  const { spacing } = useBFlowTheme();
  const layout = useResponsiveLayout();
  const resolvedGap = gap ?? (layout.sizeClass === 'compact' ? spacing.md : layout.columnGap);
  const items = React.Children.toArray(children);
  const columns = Math.min(
    items.length,
    resolveColumnCount(layout.contentWidth, minColumnWidth, resolvedGap, maxColumns)
  );

  if (columns <= 1) {
    return (
      <View testID={testID} style={{ gap: resolvedGap }}>
        {items}
      </View>
    );
  }

  const rows: React.ReactNode[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }

  return (
    <View testID={testID} style={{ gap: resolvedGap }}>
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          testID={testID ? `${testID}-row-${rowIndex}` : undefined}
          style={{
            flexDirection: 'row',
            alignItems: align === 'stretch' ? 'stretch' : 'flex-start',
            gap: resolvedGap,
          }}
        >
          {Array.from({ length: columns }, (_, columnIndex) => (
            <View key={columnIndex} style={{ flex: 1, minWidth: 0 }}>
              {row[columnIndex] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
