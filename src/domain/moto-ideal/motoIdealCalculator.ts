/**
 * src/domain/moto-ideal/motoIdealCalculator.ts
 *
 * Pure calculator for the "IDEAL" Moto provision table (Resolving Inconsistencies #7 and #9):
 * - Models all 8 recurring items as integer COP provisions using `Math.ceil(cycleCost / periodMonths)`
 *   alongside the exact Excel integer total (`872_667` in B43).
 * - Models `Kit de arrastre Honda original ($500.000)` as a one-off TargetGoal with target date `2027-08`.
 * - Computes both totals: `recurringMonthlyTotalCop (872_667)` and `totalWithTargetGoalCop (1_372_667)`.
 * - Computes the gap between actual Moto contributions this month (`700_000`) and the ideal recurring
 *   provision (`700_000 - 872_667 = -172_667`).
 * - Compares linked budget items (`Gasolina` linked to `exp_gasolina_moto_carro`, while `Parqueadero`
 *   in IDEAL is independent from `Parqueadero CEM`).
 */

import { assertValidMonthKey } from '../date/monthKey';
import { IdealMotoPlan, MonthEntry, ProvisionItemSpec } from '../models/types';
import { calculateMonthlyProvisionCeil, sumMoneyIntegers } from '../money/money';

export interface EvaluatedProvisionItem {
  id: string;
  displayName: string;
  excelRawName: string;
  excelMonthlyAmountCop: number;
  strictCeilMonthlyCop: number;
  cycleCostCop: number;
  periodMonths: number;
  linkedConceptId?: string;
  actualBudgetedAmountCop?: number;
  varianceAgainstBudgetCop?: number;
}

export interface EvaluatedTargetGoal {
  id: string;
  displayName: string;
  targetAmountCop: number;
  targetMonthKey: string;
  monthsUntilTarget: number;
  suggestedMonthlySavingCop: number;
}

export interface MotoIdealComparisonSummary {
  monthKey: string;
  recurringItems: EvaluatedProvisionItem[];
  targetGoals: EvaluatedTargetGoal[];
  excelRecurringMonthlyTotalCop: number; // 872_667 (matches B43 rounded to COP integer)
  strictCeilRecurringMonthlyTotalCop: number; // 872_668 (with Llantas 1_000_000 / 12 = 83_334)
  totalWithTargetGoalsCop: number; // 1_372_667
  actualMotoContributionCop: number; // 700_000 in October 2026 (CB300F 500k + Gasolina 200k)
  monthlyGapAgainstIdealCop: number; // 700_000 - 872_667 = -172_667
}

function countMonthsBetween(startMonthKey: string, endMonthKey: string): number {
  assertValidMonthKey(startMonthKey);
  assertValidMonthKey(endMonthKey);
  const [startY, startM] = startMonthKey.split('-').map(Number);
  const [endY, endM] = endMonthKey.split('-').map(Number);
  return Math.max(1, ((endY ?? 0) - (startY ?? 0)) * 12 + ((endM ?? 0) - (startM ?? 0)));
}

export function calculateMotoIdealSummary(
  plan: IdealMotoPlan,
  entries: readonly MonthEntry[],
  actualMotoContributionCop: number,
  currentMonthKey: string
): MotoIdealComparisonSummary {
  assertValidMonthKey(currentMonthKey);

  const monthEntries = entries.filter((e) => e.monthKey === currentMonthKey);

  const recurringSpecs = plan.items.filter(
    (item): item is ProvisionItemSpec => item.kind === 'recurring_provision'
  );
  const goalSpecs = plan.items.filter(
    (item): item is ProvisionItemSpec => item.kind === 'target_goal'
  );

  const recurringItems: EvaluatedProvisionItem[] = recurringSpecs.map((spec) => {
    const cycleCostCop = spec.cycleCostCop ?? spec.monthlyAmountCop;
    const periodMonths = spec.periodMonths ?? 1;
    const strictCeilMonthlyCop = calculateMonthlyProvisionCeil(cycleCostCop, periodMonths);

    const linkedEntry = spec.linkedConceptId
      ? monthEntries.find((e) => e.conceptId === spec.linkedConceptId)
      : undefined;

    const actualBudgetedAmountCop = linkedEntry
      ? linkedEntry.status === 'completed'
        ? linkedEntry.actualAmount
        : linkedEntry.plannedAmount
      : undefined;

    return {
      id: spec.id,
      displayName: spec.displayName,
      excelRawName: spec.excelRawName,
      excelMonthlyAmountCop: spec.monthlyAmountCop,
      strictCeilMonthlyCop,
      cycleCostCop,
      periodMonths,
      ...(spec.linkedConceptId ? { linkedConceptId: spec.linkedConceptId } : {}),
      ...(actualBudgetedAmountCop !== undefined
        ? {
            actualBudgetedAmountCop,
            varianceAgainstBudgetCop: spec.monthlyAmountCop - actualBudgetedAmountCop,
          }
        : {}),
    };
  });

  const targetGoals: EvaluatedTargetGoal[] = goalSpecs.map((spec) => {
    const targetAmountCop = spec.targetAmountCop ?? spec.monthlyAmountCop;
    const targetMonthKey = spec.targetMonthKey ?? '2027-08';
    const monthsUntilTarget = countMonthsBetween(currentMonthKey, targetMonthKey);
    const suggestedMonthlySavingCop = calculateMonthlyProvisionCeil(
      targetAmountCop,
      monthsUntilTarget
    );

    return {
      id: spec.id,
      displayName: spec.displayName,
      targetAmountCop,
      targetMonthKey,
      monthsUntilTarget,
      suggestedMonthlySavingCop,
    };
  });

  const excelRecurringMonthlyTotalCop = sumMoneyIntegers(
    recurringItems.map((i) => i.excelMonthlyAmountCop)
  );
  const strictCeilRecurringMonthlyTotalCop = sumMoneyIntegers(
    recurringItems.map((i) => i.strictCeilMonthlyCop)
  );
  const goalsTotalCop = sumMoneyIntegers(targetGoals.map((g) => g.targetAmountCop));
  const totalWithTargetGoalsCop = excelRecurringMonthlyTotalCop + goalsTotalCop;
  const monthlyGapAgainstIdealCop =
    actualMotoContributionCop - excelRecurringMonthlyTotalCop;

  return {
    monthKey: currentMonthKey,
    recurringItems,
    targetGoals,
    excelRecurringMonthlyTotalCop,
    strictCeilRecurringMonthlyTotalCop,
    totalWithTargetGoalsCop,
    actualMotoContributionCop,
    monthlyGapAgainstIdealCop,
  };
}
