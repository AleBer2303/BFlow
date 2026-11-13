/**
 * src/features/debts/components/DebtsTab.tsx
 *
 * Container of the Debts tab: reads only the active month's debt summary, plus the
 * month-by-month history for the debt chart (Phase 6).
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { hapticService, useBFlowTheme } from '../../../design-system';
import { useActiveMonthKey, useDebtSummary } from '../../budget/hooks/useActiveMonthSummaries';
import { useChartHistory } from '../../budget/hooks/useChartHistory';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import { DebtTrendChart } from './DebtTrendChart';
import { DebtsWorkspaceView, type DebtsWorkspaceViewProps } from './DebtsWorkspaceView';

type Props = DebtsWorkspaceViewProps;

export const DebtsTab = React.memo(function DebtsTab(): React.JSX.Element {
  const monthKey = useActiveMonthKey();
  const debtSummary = useDebtSummary();
  const history = useChartHistory();
  const { spacing } = useBFlowTheme();
  const actions = useBudgetStore(
    useShallow((state) => ({
      createDebt: state.createDebt,
      updateDebt: state.updateDebt,
      deleteDebt: state.deleteDebt,
    }))
  );

  const handleCreateDebt = useCallback<NonNullable<Props['onCreateDebt']>>(
    (input) => {
      hapticService.trigger('success');
      void actions.createDebt(monthKey, input);
    },
    [actions, monthKey]
  );
  const handleUpdateDebt = useCallback<NonNullable<Props['onUpdateDebt']>>(
    (debtId, updates) => {
      hapticService.trigger('success');
      void actions.updateDebt(monthKey, debtId, updates);
    },
    [actions, monthKey]
  );
  const handleDeleteDebt = useCallback<NonNullable<Props['onDeleteDebt']>>(
    (debtId) => {
      hapticService.trigger('warning');
      void actions.deleteDebt(monthKey, debtId);
    },
    [actions, monthKey]
  );

  return (
    <View style={{ gap: spacing.md }}>
      <DebtsWorkspaceView
        debtSummary={debtSummary}
        onCreateDebt={handleCreateDebt}
        onUpdateDebt={handleUpdateDebt}
        onDeleteDebt={handleDeleteDebt}
      />
      <DebtTrendChart history={history} projection={debtSummary.projection} />
    </View>
  );
});
