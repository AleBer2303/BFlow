/**
 * src/features/budget/hooks/useActiveMonthSummaries.ts
 *
 * Fine-grained selectors and derived summaries of the active month. Each tab container
 * subscribes only to the slices of the store it shows, so a change elsewhere in the store
 * (sync message, another tab's data) does not re-render it, and each summary is computed
 * only where it is used (PERFORMANCE_AUDIT_2026-11-09, R-15).
 */

import { useMemo } from 'react';
import { ensureStandardSavingsBuckets } from '../../../data/repositories/budgetRepository';
import {
  buildMonthlyCurve,
  calculateChecklistProgress,
  calculateDebtsSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateProvisionPlanSummary,
  toAppIsoDate,
  type ChecklistProgress,
  type Debt,
  type MonthlyBudgetSummary,
  type MonthlyCurve,
  type MonthlySavingsSummary,
  type SavingsBucket,
} from '../../../domain';
import { useBudgetStore } from '../store/useBudgetStore';

type DebtsSummary = ReturnType<typeof calculateDebtsSummary>;
type ProvisionPlanSummary = ReturnType<typeof calculateProvisionPlanSummary>;

const EMPTY_DEBTS: Debt[] = [];

export function useActiveMonthKey(): string {
  return useBudgetStore((state) => state.activeMonthKey);
}

export function useActiveDebts(): readonly Debt[] {
  return useBudgetStore((state) => state.debtsByMonth[state.activeMonthKey] ?? EMPTY_DEBTS);
}

export function useActiveSavingsBuckets(): readonly SavingsBucket[] {
  const rawBuckets = useBudgetStore((state) => state.savingsBucketsByMonth[state.activeMonthKey]);
  return useMemo(() => ensureStandardSavingsBuckets(rawBuckets ?? [], 0, 0), [rawBuckets]);
}

export function useBudgetSummary(): MonthlyBudgetSummary {
  const monthKey = useActiveMonthKey();
  const entries = useBudgetStore((state) => state.entries);
  return useMemo(() => calculateMonthlyBudgetSummary(entries, monthKey), [entries, monthKey]);
}

export function useChecklistProgress(): ChecklistProgress {
  const monthKey = useActiveMonthKey();
  const concepts = useBudgetStore((state) => state.concepts);
  const entries = useBudgetStore((state) => state.entries);
  return useMemo(
    () => calculateChecklistProgress(concepts, entries, monthKey),
    [concepts, entries, monthKey]
  );
}

function useActiveDebtPayments() {
  const monthKey = useActiveMonthKey();
  const debtPayments = useBudgetStore((state) => state.debtPayments);
  return useMemo(
    () => debtPayments.filter((payment) => payment.monthKey === monthKey),
    [debtPayments, monthKey]
  );
}

export function useDebtSummary(): DebtsSummary {
  const monthKey = useActiveMonthKey();
  const entries = useBudgetStore((state) => state.entries);
  const debts = useActiveDebts();
  const payments = useActiveDebtPayments();
  return useMemo(
    () => calculateDebtsSummary(debts, entries, monthKey, payments),
    [debts, entries, monthKey, payments]
  );
}

export function useSavingsSummary(budget: MonthlyBudgetSummary): MonthlySavingsSummary {
  const monthKey = useActiveMonthKey();
  const concepts = useBudgetStore((state) => state.concepts);
  const entries = useBudgetStore((state) => state.entries);
  const buckets = useActiveSavingsBuckets();
  return useMemo(
    () => calculateMonthlySavingsSummary(buckets, concepts, entries, budget, monthKey),
    [buckets, concepts, entries, budget, monthKey]
  );
}

export function useProvisionPlanSummary(
  savingsSummary: MonthlySavingsSummary
): ProvisionPlanSummary {
  const monthKey = useActiveMonthKey();
  const entries = useBudgetStore((state) => state.entries);
  const plan = useBudgetStore((state) => state.idealMotoPlan);
  const paidThisMonth = savingsSummary.moto.paidContributionsThisMonth;
  return useMemo(
    () => calculateProvisionPlanSummary(plan, entries, paidThisMonth, monthKey),
    [plan, entries, paidThisMonth, monthKey]
  );
}

export function useMonthlyCurve(
  budget: MonthlyBudgetSummary,
  savings: MonthlySavingsSummary,
  debts: DebtsSummary
): MonthlyCurve {
  const monthKey = useActiveMonthKey();
  const concepts = useBudgetStore((state) => state.concepts);
  const entries = useBudgetStore((state) => state.entries);
  const payments = useActiveDebtPayments();
  return useMemo(
    () =>
      buildMonthlyCurve({
        monthKey,
        todayIso: toAppIsoDate(),
        entries,
        concepts,
        debtPayments: payments,
        budget,
        savings,
        debts,
      }),
    [monthKey, entries, concepts, payments, budget, savings, debts]
  );
}
