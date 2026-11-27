/**
 * src/domain/models/types.ts
 *
 * Pure domain entities and value objects for BFlow.
 * Universal and agnostic of specific vehicles, debts, currencies or regional contexts.
 * Zero dependencies on UI, React Native, Expo, or Firebase.
 */

export type ConceptType = 'income' | 'expense';
export type ConceptGroup = 'fixed' | 'variable';
export type EntryStatus = 'pending' | 'completed';
export type SavingsBucketId = 'reserve' | 'savings' | (string & {});
export type DebtInterestRateType = 'monthly' | 'annual';

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
  provisionCategoryKey?: string;
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
  /** Card or bank account the movement went through (ADR 0034). */
  accountId?: string;
  /**
   * Only for an expense on a credit card: `purchase` (bought with the card, default) or
   * `payment` (money paid to the card). Other links ignore it.
   */
  accountRole?: AccountMovementRole;
}

export type FinancialAccountType = 'credit' | 'debit';
export type DebitAccountKind = 'savings' | 'checking';
export type AccountMovementRole = 'purchase' | 'payment';

/**
 * Credit card or debit (bank) account (ADR 0034). Its balance is never stored: it is derived
 * from `openingBalance` plus the completed movements linked to it from `openingMonthKey` on.
 */
export interface FinancialAccount {
  id: string;
  type: FinancialAccountType;
  name: string;
  institution: string;
  /** Last four digits of the card or account, for display only. */
  lastFourDigits?: string;
  /**
   * Debit: balance at the start of `openingMonthKey`. Credit: amount owed on the card at the
   * start of `openingMonthKey`.
   */
  openingBalance: number;
  openingMonthKey: string;
  /** Credit: total credit line (cupo). */
  creditLimit?: number;
  /** Credit: statement closing day (día de corte), 1..31. */
  statementDay?: number;
  /** Credit: payment due day (fecha límite de pago), 1..31. */
  paymentDueDay?: number;
  /** Credit: monthly interest rate in percent, informational. */
  monthlyInterestRate?: number;
  /** Debit: savings or checking account. */
  debitKind?: DebitAccountKind;
}

export interface Debt {
  id: string;
  groupKey: string;
  name: string;
  lender: string;
  openingBalance: number;
  monthKey: string;
  monthlyInterestRate?: number;
  annualInterestRate?: number;
  interestRateType?: DebtInterestRateType;
  monthlyInstallment?: number;
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
  monthKey?: string;
}

export interface ProvisionItemSpec {
  id: string;
  displayName: string;
  monthlyAmountCop: number;
  monthlyAmount?: number;
  cycleCostCop?: number;
  cycleCost?: number;
  periodMonths?: number;
  ceilMonthlyCop?: number;
  ceilMonthly?: number;
  linkedConceptId?: string;
  targetAmountCop?: number;
  targetAmount?: number;
  targetMonthKey?: string;
  targetDateIso?: string;
  kind: 'recurring_provision' | 'target_goal';
  notes?: string;
}

export interface ProvisionPlan {
  items: readonly ProvisionItemSpec[];
  recurringMonthlyTotalCop: number;
  recurringMonthlyTotal?: number;
  totalWithTargetGoalCop: number;
  totalWithTargetGoal?: number;
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
    lender?: string;
    groupKey?: string;
    openingBalance: number;
    paidPrincipal: number;
    closingBalance: number;
    monthlyInterestRate?: number;
    annualInterestRate?: number;
    interestRateType?: DebtInterestRateType;
    monthlyInstallment?: number;
  }>;
  totalClosingDebt: number;
  closingSavings: {
    reserveClosingBalance: number;
    savingsClosingBalance: number;
    totalClosingSavings: number;
    buckets?: ReadonlyArray<{
      id: SavingsBucketId;
      name: string;
      closingBalance: number;
    }>;
  };
}
