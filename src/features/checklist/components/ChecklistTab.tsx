/**
 * src/features/checklist/components/ChecklistTab.tsx
 *
 * Container of the Checklist tab: fine-grained store selectors and stable handlers, so the
 * memoized rows only re-render when their own entry changes.
 */

import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { hapticService } from '../../../design-system';
import { toAppIsoDate, type MonthEntry } from '../../../domain';
import {
  useActiveDebts,
  useActiveMonthKey,
  useActiveSavingsBuckets,
  useBudgetSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { useBudgetStore } from '../../budget/store/useBudgetStore';
import {
  ChecklistWorkspaceView,
  type ChecklistWorkspaceViewProps,
} from './ChecklistWorkspaceView';

type Props = ChecklistWorkspaceViewProps;

export const ChecklistTab = React.memo(function ChecklistTab(): React.JSX.Element {
  const monthKey = useActiveMonthKey();
  const concepts = useBudgetStore((state) => state.concepts);
  const entries = useBudgetStore((state) => state.entries);
  const budget = useBudgetSummary();
  const debts = useActiveDebts();
  const savingsBuckets = useActiveSavingsBuckets();
  const actions = useBudgetStore(
    useShallow((state) => ({
      toggleEntryStatus: state.toggleEntryStatus,
      addOrCompleteMovement: state.addOrCompleteMovement,
      createCustomConceptAndMovement: state.createCustomConceptAndMovement,
      updateConcept: state.updateConcept,
      deleteConcept: state.deleteConcept,
      editEntry: state.editEntry,
      deleteEntryById: state.deleteEntryById,
      removeOrResetEntry: state.removeOrResetEntry,
    }))
  );

  const handleToggleEntry = useCallback(
    async (entry: MonthEntry) => {
      await actions.toggleEntryStatus(entry.id, toAppIsoDate());
    },
    [actions]
  );
  const handleAddMovement = useCallback<Props['onAddOrCompleteMovement']>(
    async (input) => {
      hapticService.trigger('success');
      await actions.addOrCompleteMovement(input);
    },
    [actions]
  );
  const handleCreateCustomMovement = useCallback<NonNullable<Props['onCreateCustomMovement']>>(
    (input) => {
      hapticService.trigger('success');
      void actions.createCustomConceptAndMovement(input);
    },
    [actions]
  );
  const handleUpdateConcept = useCallback<NonNullable<Props['onUpdateConcept']>>(
    (conceptId, updates) => {
      hapticService.trigger('success');
      void actions.updateConcept(conceptId, updates);
    },
    [actions]
  );
  const handleDeleteConcept = useCallback<NonNullable<Props['onDeleteConcept']>>(
    (conceptId) => {
      hapticService.trigger('light');
      void actions.deleteConcept(conceptId);
    },
    [actions]
  );
  const handleEditEntry = useCallback<NonNullable<Props['onEditEntry']>>(
    (entryId, updates) => {
      hapticService.trigger('success');
      void actions.editEntry(entryId, updates);
    },
    [actions]
  );
  const handleDeleteEntry = useCallback<NonNullable<Props['onDeleteEntry']>>(
    (entryId) => {
      hapticService.trigger('light');
      void actions.deleteEntryById(entryId);
    },
    [actions]
  );

  return (
    <ChecklistWorkspaceView
      monthKey={monthKey}
      concepts={concepts}
      entries={entries}
      budget={budget}
      debts={debts}
      savingsBuckets={savingsBuckets}
      onToggleEntry={handleToggleEntry}
      onAddOrCompleteMovement={handleAddMovement}
      onCreateCustomMovement={handleCreateCustomMovement}
      onUpdateConcept={handleUpdateConcept}
      onDeleteConcept={handleDeleteConcept}
      onEditEntry={handleEditEntry}
      onDeleteEntry={handleDeleteEntry}
      onRemoveRepeatableEntry={actions.removeOrResetEntry}
    />
  );
});
