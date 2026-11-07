/**
 * src/domain/provisions/provisionCalculator.ts
 *
 * Universal pure calculator for recurring provisions and sinking fund target goals.
 * Computes:
 * - Recurring provision quotas using `Math.ceil(cycleCost / periodMonths)`.
 * - Sinking fund / target goals with suggested monthly savings until target date.
 * - Gap between actual reserve contributions and recurring provisions.
 * - Comparison against linked budget entries.
 */

import { assertValidMonthKey } from '../date/monthKey';
import { MonthEntry, ProvisionItemSpec, ProvisionPlan } from '../models/types';
import { calculateMonthlyProvisionCeil, sumMoneyIntegers } from '../money/money';

export interface EvaluatedProvisionItem {
  id: string;
  displayName: string;
  excelRawName?: string;
  monthlyAmount: number;
  excelMonthlyAmountCop: number;
  strictCeilMonthly: number;
  strictCeilMonthlyCop: number;
  cycleCost: number;
  cycleCostCop: number;
  periodMonths: number;
  linkedConceptId?: string;
  actualBudgetedAmount?: number;
  actualBudgetedAmountCop?: number;
  varianceAgainstBudget?: number;
  varianceAgainstBudgetCop?: number;
  notes?: string;
}

export interface EvaluatedTargetGoal {
  id: string;
  displayName: string;
  targetAmountCop: number;
  targetMonthKey: string;
  monthsUntilTarget: number;
  suggestedMonthlySavingCop: number;
  targetAmount?: number;
  suggestedMonthlySaving?: number;
  notes?: string;
}

export interface ProvisionPlanComparisonSummary {
  monthKey: string;
  recurringItems: EvaluatedProvisionItem[];
  targetGoals: EvaluatedTargetGoal[];
  recurringMonthlyTotal: number;
  excelRecurringMonthlyTotalCop: number;
  strictCeilRecurringMonthlyTotal: number;
  strictCeilRecurringMonthlyTotalCop: number;
  totalWithTargetGoals: number;
  totalWithTargetGoalsCop: number;
  actualContribution: number;
  actualMotoContributionCop: number;
  monthlyGapAgainstIdeal: number;
  monthlyGapAgainstIdealCop: number;
}

/** @deprecated use ProvisionPlanComparisonSummary */
export type MotoIdealComparisonSummary = ProvisionPlanComparisonSummary;

function countMonthsBetween(startMonthKey: string, endMonthKey: string): number {
  assertValidMonthKey(startMonthKey);
  assertValidMonthKey(endMonthKey);
  const [startY, startM] = startMonthKey.split('-').map(Number);
  const [endY, endM] = endMonthKey.split('-').map(Number);
  return Math.max(1, ((endY ?? 0) - (startY ?? 0)) * 12 + ((endM ?? 0) - (startM ?? 0)));
}

export function calculateProvisionPlanSummary(
  plan: ProvisionPlan,
  entries: readonly MonthEntry[],
  actualContribution: number,
  currentMonthKey: string
): ProvisionPlanComparisonSummary {
  assertValidMonthKey(currentMonthKey);

  const monthEntries = entries.filter((e) => e.monthKey === currentMonthKey);

  const recurringSpecs = plan.items.filter(
    (item): item is ProvisionItemSpec => item.kind === 'recurring_provision'
  );
  const goalSpecs = plan.items.filter(
    (item): item is ProvisionItemSpec => item.kind === 'target_goal'
  );

  const recurringItems: EvaluatedProvisionItem[] = recurringSpecs.map((spec) => {
    const monthlyAmount = spec.monthlyAmount ?? spec.monthlyAmountCop;
    const cycleCost = spec.cycleCost ?? spec.cycleCostCop ?? monthlyAmount;
    const periodMonths = spec.periodMonths ?? 1;
    const strictCeilMonthly = calculateMonthlyProvisionCeil(cycleCost, periodMonths);

    const linkedEntry = spec.linkedConceptId
      ? monthEntries.find((e) => e.conceptId === spec.linkedConceptId)
      : undefined;

    const actualBudgetedAmount = linkedEntry
      ? linkedEntry.status === 'completed'
        ? linkedEntry.actualAmount
        : linkedEntry.plannedAmount
      : undefined;

    const varianceAgainstBudget =
      actualBudgetedAmount !== undefined ? actualBudgetedAmount - monthlyAmount : undefined;

    const item: EvaluatedProvisionItem = {
      id: spec.id,
      displayName: spec.displayName,
      excelRawName: spec.excelRawName,
      excelMonthlyAmountCop: monthlyAmount,
      strictCeilMonthlyCop: strictCeilMonthly,
      cycleCostCop: cycleCost,
      periodMonths,
      ...(spec.linkedConceptId ? { linkedConceptId: spec.linkedConceptId } : {}),
      ...(actualBudgetedAmount !== undefined
        ? {
            actualBudgetedAmountCop: actualBudgetedAmount,
            varianceAgainstBudgetCop: varianceAgainstBudget,
          }
        : {}),
      ...(spec.notes ? { notes: spec.notes } : {}),
      monthlyAmount,
      strictCeilMonthly,
      cycleCost,
      ...(actualBudgetedAmount !== undefined
        ? {
            actualBudgetedAmount,
            varianceAgainstBudget,
          }
        : {}),
    };

    return item;
  });

  const targetGoals: EvaluatedTargetGoal[] = goalSpecs.map((spec) => {
    const targetAmount = spec.targetAmount ?? spec.targetAmountCop ?? 0;
    const targetMonthKey = spec.targetMonthKey ?? currentMonthKey;
    const monthsUntilTarget = countMonthsBetween(currentMonthKey, targetMonthKey);
    const suggestedMonthlySaving = Math.ceil(targetAmount / monthsUntilTarget);

    const goal: EvaluatedTargetGoal = {
      id: spec.id,
      displayName: spec.displayName,
      targetAmountCop: targetAmount,
      targetMonthKey,
      monthsUntilTarget,
      suggestedMonthlySavingCop: suggestedMonthlySaving,
      ...(spec.notes ? { notes: spec.notes } : {}),
    };

    Object.defineProperties(goal, {
      targetAmount: {
        get() {
          return targetAmount;
        },
        enumerable: false,
      },
      suggestedMonthlySaving: {
        get() {
          return suggestedMonthlySaving;
        },
        enumerable: false,
      },
    });

    return goal;
  });

  const excelRecurringMonthlyTotal =
    plan.recurringMonthlyTotal ??
    plan.recurringMonthlyTotalCop ??
    sumMoneyIntegers(recurringItems.map((i) => i.excelMonthlyAmountCop));

  const strictCeilRecurringMonthlyTotal = sumMoneyIntegers(
    recurringItems.map((i) => i.strictCeilMonthlyCop)
  );

  const goalsTotal = sumMoneyIntegers(targetGoals.map((g) => g.targetAmountCop));
  const totalWithTargetGoals = plan.totalWithTargetGoal ?? plan.totalWithTargetGoalCop ?? excelRecurringMonthlyTotal + goalsTotal;

  const monthlyGapAgainstIdeal = actualContribution - excelRecurringMonthlyTotal;

  return {
    monthKey: currentMonthKey,
    recurringItems,
    targetGoals,
    recurringMonthlyTotal: excelRecurringMonthlyTotal,
    excelRecurringMonthlyTotalCop: excelRecurringMonthlyTotal,
    strictCeilRecurringMonthlyTotal,
    strictCeilRecurringMonthlyTotalCop: strictCeilRecurringMonthlyTotal,
    totalWithTargetGoals,
    totalWithTargetGoalsCop: totalWithTargetGoals,
    actualContribution,
    actualMotoContributionCop: actualContribution,
    monthlyGapAgainstIdeal,
    monthlyGapAgainstIdealCop: monthlyGapAgainstIdeal,
  };
}

/** @deprecated use calculateProvisionPlanSummary */
export const calculateMotoIdealSummary = calculateProvisionPlanSummary;
