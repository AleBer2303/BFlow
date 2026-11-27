/**
 * src/features/debts/components/DebtsTab.tsx
 *
 * Container of the Debts tab: reads only the active month's debt summary, plus the
 * month-by-month history for the debt chart (Phase 6), and the credit cards and checking
 * accounts with their month summary (ADR 0034).
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { ScrollRevealSection, hapticService, useBFlowTheme } from '../../../design-system';
import {
  useActiveMonthKey,
  useDebtSummary,
  useFinancialAccounts,
  useFinancialAccountsSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { useChartHistory } from '../../budget/hooks/useChartHistory';
import { useTabStore } from '../../budget/hooks/useTabStore';
import { DebtTrendChart } from './DebtTrendChart';
import { DebtsWorkspaceView, type DebtsWorkspaceViewProps } from './DebtsWorkspaceView';

type Props = DebtsWorkspaceViewProps;

export const DebtsTab = React.memo(function DebtsTab(): React.JSX.Element {
  const monthKey = useActiveMonthKey();
  const debtSummary = useDebtSummary();
  const history = useChartHistory();
  // Savings accounts are shown in Ahorros; Deudas keeps the cards and checking accounts.
  const financialAccounts = useFinancialAccounts('debts');
  const accountsSummary = useFinancialAccountsSummary('debts');
  const { spacing } = useBFlowTheme();
  const actions = useTabStore(
    useShallow((state) => ({
      createDebt: state.createDebt,
      updateDebt: state.updateDebt,
      deleteDebt: state.deleteDebt,
      createFinancialAccount: state.createFinancialAccount,
      updateFinancialAccount: state.updateFinancialAccount,
      deleteFinancialAccount: state.deleteFinancialAccount,
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

  const handleCreateAccount = useCallback<NonNullable<Props['onCreateAccount']>>(
    (input) => {
      hapticService.trigger('success');
      void actions.createFinancialAccount(monthKey, input);
    },
    [actions, monthKey]
  );
  const handleUpdateAccount = useCallback<NonNullable<Props['onUpdateAccount']>>(
    (accountId, updates) => {
      hapticService.trigger('success');
      void actions.updateFinancialAccount(accountId, updates);
    },
    [actions]
  );
  const handleDeleteAccount = useCallback<NonNullable<Props['onDeleteAccount']>>(
    (accountId) => {
      hapticService.trigger('warning');
      void actions.deleteFinancialAccount(accountId);
    },
    [actions]
  );

  return (
    <View style={{ gap: spacing.md }}>
      <DebtsWorkspaceView
        debtSummary={debtSummary}
        onCreateDebt={handleCreateDebt}
        onUpdateDebt={handleUpdateDebt}
        onDeleteDebt={handleDeleteDebt}
        financialAccounts={financialAccounts}
        accountsSummary={accountsSummary}
        onCreateAccount={handleCreateAccount}
        onUpdateAccount={handleUpdateAccount}
        onDeleteAccount={handleDeleteAccount}
      />
      <ScrollRevealSection>
        <DebtTrendChart history={history} projection={debtSummary.projection} />
      </ScrollRevealSection>
    </View>
  );
});
