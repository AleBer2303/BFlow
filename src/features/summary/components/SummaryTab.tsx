/**
 * src/features/summary/components/SummaryTab.tsx
 *
 * Container of the Summary tab: reads only the month data the overview shows.
 */

import React from 'react';
import {
  useBudgetSummary,
  useChecklistProgress,
  useDebtSummary,
  useMonthlyCurve,
  useSavingsSummary,
} from '../../budget/hooks/useActiveMonthSummaries';
import { SummaryOverview } from './SummaryOverview';

export const SummaryTab = React.memo(function SummaryTab(): React.JSX.Element {
  const budget = useBudgetSummary();
  const checklist = useChecklistProgress();
  const debtSummary = useDebtSummary();
  const savingsSummary = useSavingsSummary(budget);
  const curve = useMonthlyCurve(budget, savingsSummary, debtSummary);

  return <SummaryOverview budget={budget} checklist={checklist} curve={curve} />;
});
