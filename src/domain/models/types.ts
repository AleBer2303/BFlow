/**
 * src/domain/models/types.ts
 *
 * Pure domain entities and value objects for BFlow.
 * Zero dependencies on UI, React Native, Expo, or Firebase.
 */

export type ConceptType = 'income' | 'expense';
export type ConceptGroup = 'fixed' | 'variable';
export type EntryStatus = 'pending' | 'completed';
export type SavingsBucketId = 'moto' | 'savings';

export type MonthNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type ConceptRecurrence =
  | { kind: 'monthly' }
  | { kind: 'specific_months'; months: readonly MonthNumber[] };

export interface SavingsContributionRule {
  bucketId: SavingsBucketId;
  onlyWhenCompleted: boolean;
}

export interface Concept {
  id: string;
  name: string;
  type: ConceptType;
  group: ConceptGroup;
  defaultAmount: number;
  icon?: string;
  color?: string;
  allowMultiplePerMonth: boolean;
  recurrence: ConceptRecurrence;
  linkedDebtGroup?: string;
  defaultTargetDebtId?: string;
  savingsContribution?: SavingsContributionRule;
  idealMotoCategoryKey?: string;
  archived: boolean;
  order: number;
}

export interface MonthEntry {
  id: string;
  monthKey: string;
  conceptId: string;
  conceptName: string;
  type: ConceptType;
  group: ConceptGroup;
  plannedAmount: number;
  actualAmount: number;
  status: EntryStatus;
  completedAt?: string;
  note?: string;
}

export interface Debt {
  id: string;
  groupKey: string;
  name: string;
  lender: string;
  openingBalance: number;
  monthKey: string;
}

export interface DebtPayment {
  id: string;
  entryId: string;
  monthKey: string;
  debtId: string;
  principalAmount: number;
  interestAmount: number;
  totalApplied: number;
  completedAt?: string;
  active: boolean;
}

export interface SavingsBucket {
  id: SavingsBucketId;
  name: string;
  openingBalance: number;
}

export interface ProvisionItemSpec {
  id: string;
  excelRawName: string;
  displayName: string;
  monthlyAmountCop: number;
  cycleCostCop?: number;
  periodMonths?: number;
  ceilMonthlyCop?: number;
  linkedConceptId?: string;
  targetAmountCop?: number;
  targetMonthKey?: string;
  targetDateIso?: string;
  includedInExcelTotalB43: boolean;
  kind: 'recurring_provision' | 'target_goal';
}

export interface IdealMotoPlan {
  items: readonly ProvisionItemSpec[];
  recurringMonthlyTotalCop: number;
  totalWithTargetGoalCop: number;
}

export interface GroupBudgetBreakdown {
  planned: number;
  paid: number;
  pending: number;
}

export interface MonthlyBudgetSummary {
  monthKey: string;
  plannedIncome: number;
  receivedIncome: number;
  pendingIncome: number;
  incomeByGroup: {
    fixed: GroupBudgetBreakdown;
    variable: GroupBudgetBreakdown;
  };
  plannedExpenses: number;
  paidExpenses: number;
  pendingExpenses: number;
  expensesByGroup: {
    fixed: GroupBudgetBreakdown;
    variable: GroupBudgetBreakdown;
  };
  netCashFlow: number;
  projectedNetFlow: number;
}

export interface ChecklistProgress {
  monthKey: string;
  completedCount: number;
  totalTrackableCount: number;
  pendingCount: number;
  completionRatio: number;
  completionPercentage: number;
  isMonthComplete: boolean;
}

export interface MonthSnapshot {
  monthKey: string;
  closedAtIso: string;
  budget: MonthlyBudgetSummary;
  checklist: ChecklistProgress;
  closingDebts: ReadonlyArray<{
    debtId: string;
    name: string;
    openingBalance: number;
    paidPrincipal: number;
    closingBalance: number;
  }>;
  totalClosingDebt: number;
  closingSavings: {
    motoClosingBalance: number;
    savingsClosingBalance: number;
    totalClosingSavings: number;
  };
}
