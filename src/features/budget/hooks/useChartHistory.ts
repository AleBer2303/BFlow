/**
 * src/features/budget/hooks/useChartHistory.ts
 *
 * Month-by-month history behind the charts (Phase 6). It subscribes only to the slices of
 * the store the history reads, so a sync message or a form being typed does not rebuild it
 * (same selector discipline as useActiveMonthSummaries, PERFORMANCE_AUDIT R-15).
 */

import { useMemo } from 'react';
import {
  buildMonthlyHistory,
  formatMonthKeyLabelEs,
  formatMonthKeyShortLabelEs,
  type MonthlyHistoryPoint,
} from '../../../domain';
import { useTabStore } from './useTabStore';

export interface MonthAxis {
  /** "Oct", under the plot. */
  categories: readonly string[];
  /** "Marzo 2027", in the readout and for screen readers. */
  titles: readonly string[];
}

/** Axis labels of a month-by-month history, shared by every history chart. */
export function useMonthAxis(history: readonly Pick<MonthlyHistoryPoint, 'monthKey'>[]): MonthAxis {
  return useMemo(
    () => ({
      categories: history.map((point) => formatMonthKeyShortLabelEs(point.monthKey)),
      titles: history.map((point) => formatMonthKeyLabelEs(point.monthKey)),
    }),
    [history]
  );
}

export function useChartHistory(): readonly MonthlyHistoryPoint[] {
  const activeMonthKey = useTabStore((state) => state.activeMonthKey);
  const availableMonths = useTabStore((state) => state.availableMonths);
  const concepts = useTabStore((state) => state.concepts);
  const entries = useTabStore((state) => state.entries);
  const debtPayments = useTabStore((state) => state.debtPayments);
  const debtsByMonth = useTabStore((state) => state.debtsByMonth);
  const savingsBucketsByMonth = useTabStore((state) => state.savingsBucketsByMonth);
  const closedSnapshots = useTabStore((state) => state.closedSnapshots);

  return useMemo(
    () =>
      buildMonthlyHistory({
        monthKeys: availableMonths,
        activeMonthKey,
        concepts,
        entries,
        debtPayments,
        debtsByMonth,
        savingsBucketsByMonth,
        closedSnapshots,
      }),
    [
      activeMonthKey,
      availableMonths,
      concepts,
      entries,
      debtPayments,
      debtsByMonth,
      savingsBucketsByMonth,
      closedSnapshots,
    ]
  );
}
