/**
 * src/domain/budget/budgetCalculator.ts
 *
 * Pure monthly budget metrics calculator reproducing the exact Excel formulas
 * while also exposing the disambiguated metrics (Resolving Inconsistencies #1 and #2).
 */

import { assertValidMonthKey } from '../date/monthKey';
import { GroupBudgetBreakdown, MonthlyBudgetSummary, MonthEntry } from '../models/types';
import { sumMoneyIntegers } from '../money/money';

function computeGroupBreakdown(entries: readonly MonthEntry[]): GroupBudgetBreakdown {
  const planned = sumMoneyIntegers(entries.map((e) => e.plannedAmount));
  const paid = sumMoneyIntegers(
    entries.filter((e) => e.status === 'completed').map((e) => e.actualAmount)
  );
  const pending = sumMoneyIntegers(
    entries.filter((e) => e.status === 'pending').map((e) => e.plannedAmount)
  );

  return { planned, paid, pending };
}

/**
 * Calculates all monthly income, expense, and cash flow metrics for `monthKey`.
 *
 * Golden values for October 2026 (`2026-10`):
 * - `receivedIncome` (Excel B2 / B17): 4_000_000
 * - `plannedIncome`: 6_000_000
 * - `pendingIncome`: 2_000_000
 * - `plannedExpenses` (Excel B3): 3_370_000
 * - `paidExpenses` (Excel B4 / H25): 2_920_000
 * - `pendingExpenses` (Excel B5): 450_000
 * - `netCashFlow` (Excel B6 = B2 - B4): 1_080_000
 * - `projectedNetFlow` (plannedIncome - plannedExpenses): 2_630_000
 * - `expensesByGroup.fixed.paid` (Excel H18): 2_620_000 (planned: 2_970_000, pending: 350_000)
 * - `expensesByGroup.variable.paid` (Excel H24): 300_000 (planned: 400_000, pending: 100_000)
 */
export function calculateMonthlyBudgetSummary(
  entries: readonly MonthEntry[],
  monthKey: string
): MonthlyBudgetSummary {
  assertValidMonthKey(monthKey);

  const monthEntries = entries.filter((e) => e.monthKey === monthKey);

  const incomeEntries = monthEntries.filter((e) => e.type === 'income');
  const expenseEntries = monthEntries.filter((e) => e.type === 'expense');

  const fixedIncomes = computeGroupBreakdown(incomeEntries.filter((e) => e.group === 'fixed'));
  const variableIncomes = computeGroupBreakdown(
    incomeEntries.filter((e) => e.group === 'variable')
  );

  const fixedExpenses = computeGroupBreakdown(expenseEntries.filter((e) => e.group === 'fixed'));
  const variableExpenses = computeGroupBreakdown(
    expenseEntries.filter((e) => e.group === 'variable')
  );

  const plannedIncome = fixedIncomes.planned + variableIncomes.planned;
  const receivedIncome = fixedIncomes.paid + variableIncomes.paid;
  const pendingIncome = fixedIncomes.pending + variableIncomes.pending;

  const plannedExpenses = fixedExpenses.planned + variableExpenses.planned;
  const paidExpenses = fixedExpenses.paid + variableExpenses.paid;
  const pendingExpenses = fixedExpenses.pending + variableExpenses.pending;

  const netCashFlow = receivedIncome - paidExpenses;
  const projectedNetFlow = plannedIncome - plannedExpenses;

  return {
    monthKey,
    plannedIncome,
    receivedIncome,
    pendingIncome,
    incomeByGroup: {
      fixed: fixedIncomes,
      variable: variableIncomes,
    },
    plannedExpenses,
    paidExpenses,
    pendingExpenses,
    expensesByGroup: {
      fixed: fixedExpenses,
      variable: variableExpenses,
    },
    netCashFlow,
    projectedNetFlow,
  };
}
