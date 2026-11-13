/**
 * src/features/analytics/components/AnalyticsTab.tsx
 *
 * Container of the Analytics & History tab: month close, history and the charts (Phase 6).
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { hapticService, useBFlowTheme } from '../../../design-system';
import {
  useActiveMonthKey,
  useBudgetSummary,
  useChecklistProgress,
  useDebtSummary,
  useSavingsSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { useChartHistory } from '../../budget/hooks/useChartHistory';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import { AnalyticsChartsPanel } from './AnalyticsChartsPanel';
import { AnalyticsAndHistoryView } from './AnalyticsAndHistoryView';

export const AnalyticsTab = React.memo(function AnalyticsTab(): React.JSX.Element {
  const activeMonthKey = useActiveMonthKey();
  const availableMonths = useBudgetStore((state) => state.availableMonths);
  const entries = useBudgetStore((state) => state.entries);
  const closedSnapshots = useBudgetStore((state) => state.closedSnapshots);
  const budget = useBudgetSummary();
  const checklist = useChecklistProgress();
  const debtSummary = useDebtSummary();
  const savingsSummary = useSavingsSummary(budget);
  const history = useChartHistory();
  const { spacing } = useBFlowTheme();
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
      hapticService.trigger('warning');
      void actions.deleteOrRevertMonth(monthKey);
    },
    [actions]
  );

  return (
    <View style={{ gap: spacing.xl }}>
      <AnalyticsAndHistoryView
        activeMonthKey={activeMonthKey}
        availableMonths={availableMonths}
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
      <AnalyticsChartsPanel
        activeMonthKey={activeMonthKey}
        history={history}
        budget={budget}
        entries={entries}
        hasClosedMonths={Object.keys(closedSnapshots).length > 0}
      />
    </View>
  );
});
