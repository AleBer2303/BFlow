/**
 * src/features/analytics/components/AnalyticsTab.tsx
 *
 * Container of the Analytics & History tab: month close, history, the credit cards and debit
 * accounts of the month (ADR 0034) and the charts (Phase 6).
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { ScrollRevealSection, hapticService, useBFlowTheme } from '../../../design-system';
import {
  useActiveMonthKey,
  useBudgetSummary,
  useChecklistProgress,
  useDebtSummary,
  useFinancialAccountsSummary,
  useSavingsSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { useChartHistory } from '../../budget/hooks/useChartHistory';
import { useTabStore } from '../../budget/hooks/useTabStore';
import { AccountsMonthPanel } from './AccountsMonthPanel';
import { AnalyticsChartsPanel } from './AnalyticsChartsPanel';
import { AnalyticsAndHistoryView } from './AnalyticsAndHistoryView';

export const AnalyticsTab = React.memo(function AnalyticsTab(): React.JSX.Element {
  const activeMonthKey = useActiveMonthKey();
  const availableMonths = useTabStore((state) => state.availableMonths);
  const entries = useTabStore((state) => state.entries);
  const closedSnapshots = useTabStore((state) => state.closedSnapshots);
  const budget = useBudgetSummary();
  const checklist = useChecklistProgress();
  const debtSummary = useDebtSummary();
  const savingsSummary = useSavingsSummary(budget);
  const history = useChartHistory();
  const accountsSummary = useFinancialAccountsSummary();
  const { spacing } = useBFlowTheme();
  const actions = useTabStore(
    useShallow((state) => ({
      setActiveMonthKey: state.setActiveMonthKey,
      closeCurrentMonth: state.closeCurrentMonth,
      reopenClosedMonth: state.reopenClosedMonth,
      deleteOrRevertMonth: state.deleteOrRevertMonth,
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
      />
      {accountsSummary.hasAccounts ? (
        <ScrollRevealSection>
          <AccountsMonthPanel summary={accountsSummary} />
        </ScrollRevealSection>
      ) : null}
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
