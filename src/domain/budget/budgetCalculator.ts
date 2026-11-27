/**
 * src/domain/budget/budgetCalculator.ts
 *
 * Pure monthly budget metrics: what came in and went out (completed entries) next to what was
 * planned, by group, and the resulting cash flow (ADR 0004 resolves the ambiguous metrics).
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
 * - `receivedIncome` / `paidExpenses`: completed incomes / expenses (`actualAmount`).
 * - `plannedIncome` / `plannedExpenses`: every entry of the month (`plannedAmount`).
 * - `pendingIncome` / `pendingExpenses`: what is still pending.
 * - `netCashFlow` = `receivedIncome - paidExpenses`.
 * - `projectedNetFlow` = `plannedIncome - plannedExpenses`.
 * - `expensesByGroup`: the same split for fixed and variable expenses.
 * The parity with the original spreadsheet is checked by `domain/__tests__/golden-october-2026.test.ts`.
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
