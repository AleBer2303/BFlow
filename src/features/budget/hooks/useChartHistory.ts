/**
 * src/features/budget/hooks/useChartHistory.ts
 *
 * Month-by-month history behind the charts (Phase 6). It subscribes only to the slices of
 * the store the history reads, so a sync message or a form being typed does not rebuild it
 * (same selector discipline as useActiveMonthSummaries, PERFORMANCE_AUDIT R-15).
 */

import { useMemo } from 'react';
import { buildMonthlyHistory, type MonthlyHistoryPoint } from '../../../domain';
import { useBudgetStore } from '../store/useBudgetStore';

export function useChartHistory(): readonly MonthlyHistoryPoint[] {
  const activeMonthKey = useBudgetStore((state) => state.activeMonthKey);
  const availableMonths = useBudgetStore((state) => state.availableMonths);
  const concepts = useBudgetStore((state) => state.concepts);
  const entries = useBudgetStore((state) => state.entries);
  const debtPayments = useBudgetStore((state) => state.debtPayments);
  const debtsByMonth = useBudgetStore((state) => state.debtsByMonth);
  const savingsBucketsByMonth = useBudgetStore((state) => state.savingsBucketsByMonth);
  const closedSnapshots = useBudgetStore((state) => state.closedSnapshots);

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
