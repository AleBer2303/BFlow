/**
 * src/features/summary/scene/scenePalette.ts
 *
 * Maps design tokens to the colors and strengths used by the curve.
 * Contains no three.js import so the 2D views can share the metric colors.
 */

import type { ColorPalette, ThemeMode } from '../../../design-system/tokens';
import type { MonthlyCurveMetricId } from '../../../domain/overview/monthlyCurve';

export interface ScenePalette {
  /** Matches the page background so the opaque canvas blends with the screen. */
  backdrop: string;
  isDark: boolean;
  glowStrength: number;
  /** How much the center of the line whitens. Only reads as light on a dark background. */
  lineHeat: number;
  areaStrength: number;
  metrics: Record<MonthlyCurveMetricId, string>;
}

export function getMetricColor(colors: ColorPalette, id: MonthlyCurveMetricId): string {
  switch (id) {
    case 'flow':
    case 'income':
      return colors.semantic.income;
    case 'expenses':
      return colors.semantic.expense;
    case 'savings':
      return colors.semantic.reserve;
    case 'debt':
      return colors.semantic.debt;
  }
}

export function toScenePalette(colors: ColorPalette, mode: ThemeMode): ScenePalette {
  const isDark = mode === 'dark';

  return {
    backdrop: colors.background.primary,
    isDark,
    glowStrength: isDark ? 0.5 : 0.24,
    lineHeat: isDark ? 1 : 0,
    areaStrength: isDark ? 0.92 : 0.72,
    metrics: {
      flow: getMetricColor(colors, 'flow'),
      income: getMetricColor(colors, 'income'),
      expenses: getMetricColor(colors, 'expenses'),
      savings: getMetricColor(colors, 'savings'),
      debt: getMetricColor(colors, 'debt'),
    },
  };
}
