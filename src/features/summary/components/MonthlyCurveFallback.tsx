/**
 * src/features/summary/components/MonthlyCurveFallback.tsx
 *
 * 2D stand-in used when WebGL is unavailable: one bar per day on the curve's own scale,
 * and a muted bar for the projected month end.
 */

import React from 'react';
import { View } from 'react-native';
import { useBFlowTheme } from '../../../design-system';
import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import { CURVE_MARGIN_PT, normalizeCurveValue } from '../scene/curveGeometry';
import { getMetricColor } from '../scene/scenePalette';

export interface MonthlyCurveFallbackProps {
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
}

export function MonthlyCurveFallback({
  curve,
  metricId,
}: MonthlyCurveFallbackProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const series = curve.series[metricId];
  const days = Array.from({ length: curve.daysInMonth }, (_, index) => index + 1);

  return (
    <View
      testID="monthly-curve-fallback"
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.xxs,
        paddingHorizontal: CURVE_MARGIN_PT,
        paddingVertical: spacing.sm,
      }}
    >
      {days.map((day) => {
        const value = series.values[day];
        const isProjectedClose =
          value === undefined && curve.hasProjection && day === curve.daysInMonth;
        const displayed = isProjectedClose ? series.projectedClose : value;

        return (
          <View
            key={day}
            testID={`monthly-curve-fallback-day-${day}`}
            style={{
              flex: 1,
              height:
                displayed === undefined
                  ? 0
                  : `${normalizeCurveValue(series, displayed) * 100}%`,
              borderTopLeftRadius: radius.xs / 2,
              borderTopRightRadius: radius.xs / 2,
              backgroundColor: isProjectedClose
                ? colors.text.muted
                : getMetricColor(colors, metricId),
            }}
          />
        );
      })}
    </View>
  );
}
