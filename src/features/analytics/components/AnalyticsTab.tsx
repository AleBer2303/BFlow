/**
 * src/features/analytics/components/AnalyticsTab.tsx
 *
 * Container of the Analytics & History tab.
 */

import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { hapticService } from '../../../design-system';
import {
  useActiveMonthKey,
  useBudgetSummary,
  useChecklistProgress,
  useDebtSummary,
  useSavingsSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import { AnalyticsAndHistoryView } from './AnalyticsAndHistoryView';

export const AnalyticsTab = React.memo(function AnalyticsTab(): React.JSX.Element {
  const activeMonthKey = useActiveMonthKey();
  const availableMonths = useBudgetStore((state) => state.availableMonths);
  const concepts = useBudgetStore((state) => state.concepts);
  const entries = useBudgetStore((state) => state.entries);
  const closedSnapshots = useBudgetStore((state) => state.closedSnapshots);
  const budget = useBudgetSummary();
  const checklist = useChecklistProgress();
  const debtSummary = useDebtSummary();
  const savingsSummary = useSavingsSummary(budget);
  const actions = useBudgetStore(
    useShallow((state) => ({
      setActiveMonthKey: state.setActiveMonthKey,
      closeCurrentMonth: state.closeCurrentMonth,
      reopenClosedMonth: state.reopenClosedMonth,
      deleteOrRevertMonth: state.deleteOrRevertMonth,
      resetToOctober2026GoldenState: state.resetToOctober2026GoldenState,
    }))
  );

  const handleCloseMonth = useCallback(async () => {
    hapticService.trigger('success');
    await actions.closeCurrentMonth();
  }, [actions]);
  const handleReopenClosedMonth = useCallback(
    (monthKey: string) => {
      hapticService.trigger('light');
      void actions.reopenClosedMonth(monthKey);
    },
    [actions]
  );
  const handleDeleteOrRevertMonth = useCallback(
    (monthKey: string) => {
      hapticService.trigger('light');
      void actions.deleteOrRevertMonth(monthKey);
    },
    [actions]
  );

  return (
    <AnalyticsAndHistoryView
      activeMonthKey={activeMonthKey}
      availableMonths={availableMonths}
      concepts={concepts}
      entries={entries}
      budget={budget}
      checklist={checklist}
      debtSummary={debtSummary}
      savingsSummary={savingsSummary}
      closedSnapshots={closedSnapshots}
      onSelectMonth={actions.setActiveMonthKey}
      onCloseCurrentMonth={handleCloseMonth}
      onReopenClosedMonth={handleReopenClosedMonth}
      onDeleteOrRevertMonth={handleDeleteOrRevertMonth}
      onResetOctoberSeed={actions.resetToOctober2026GoldenState}
    />
  );
});
