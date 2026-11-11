/**
 * src/features/savings/components/SavingsTab.tsx
 *
 * Container of the Savings tab: reads only the savings and provision data it shows.
 */

import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { hapticService } from '../../../design-system';
import {
  useActiveMonthKey,
  useBudgetSummary,
  useProvisionPlanSummary,
  useSavingsSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import {
  SavingsAndProvisionsView,
  type SavingsAndProvisionsViewProps,
} from './SavingsAndProvisionsView';

type Props = SavingsAndProvisionsViewProps;

export const SavingsTab = React.memo(function SavingsTab(): React.JSX.Element {
  const monthKey = useActiveMonthKey();
  const budget = useBudgetSummary();
  const savingsSummary = useSavingsSummary(budget);
  const provisionSummary = useProvisionPlanSummary(savingsSummary);
  const provisionPlan = useBudgetStore((state) => state.idealMotoPlan);
  const actions = useBudgetStore(
    useShallow((state) => ({
      updateSavingsOpeningBalance: state.updateSavingsOpeningBalance,
      createSavingsBucket: state.createSavingsBucket,
      deleteSavingsBucket: state.deleteSavingsBucket,
      saveProvisionItem: state.saveProvisionItem,
      deleteProvisionItem: state.deleteProvisionItem,
    }))
  );

  const handleUpdateOpeningBalance = useCallback<NonNullable<Props['onUpdateOpeningBalance']>>(
    (bucketId, newBalanceCop, newName) => {
      hapticService.trigger('success');
      void actions.updateSavingsOpeningBalance(monthKey, bucketId, newBalanceCop, newName);
    },
    [actions, monthKey]
  );
  const handleCreateSavingsBucket = useCallback<NonNullable<Props['onCreateSavingsBucket']>>(
    (name, openingBalanceCop) => {
      hapticService.trigger('success');
      void actions.createSavingsBucket(monthKey, name, openingBalanceCop);
    },
    [actions, monthKey]
  );
  const handleDeleteSavingsBucket = useCallback<NonNullable<Props['onDeleteSavingsBucket']>>(
    (bucketId) => {
      hapticService.trigger('light');
      void actions.deleteSavingsBucket(monthKey, bucketId);
    },
    [actions, monthKey]
  );
  const handleSaveProvisionItem = useCallback<NonNullable<Props['onSaveProvisionItem']>>(
    (item) => {
      hapticService.trigger('success');
      void actions.saveProvisionItem(item);
    },
    [actions]
  );
  const handleDeleteProvisionItem = useCallback<NonNullable<Props['onDeleteProvisionItem']>>(
    (itemId) => {
      hapticService.trigger('light');
      void actions.deleteProvisionItem(itemId);
    },
    [actions]
  );

  return (
    <SavingsAndProvisionsView
      savingsSummary={savingsSummary}
      motoIdealSummary={provisionSummary}
      provisionPlan={provisionPlan}
      onUpdateOpeningBalance={handleUpdateOpeningBalance}
      onCreateSavingsBucket={handleCreateSavingsBucket}
      onDeleteSavingsBucket={handleDeleteSavingsBucket}
      onSaveProvisionItem={handleSaveProvisionItem}
      onDeleteProvisionItem={handleDeleteProvisionItem}
    />
  );
});
