/**
 * src/data/mappers/firestoreSchemas.ts
 *
 * Strict Zod validation schemas and Firestore document mappers for BFlow.
 * Enforces safe non-negative integers, valid monthKeys,
 * and strips undefined fields before sending payloads to Cloud Firestore.
 */

import { z } from 'zod';
import type {
  ChecklistProgress,
  Concept,
  Debt,
  DebtPayment,
  MonthEntry,
  MonthNumber,
  MonthSnapshot,
  MonthlyBudgetSummary,
  ProvisionItemSpec,
  ProvisionPlan,
  SavingsBucket,
} from '../../domain/models/types';

export const nonNegativeIntSchema = z
  .number()
  .refine((val) => Number.isSafeInteger(val) && val >= 0, {
    message: 'Amount must be a non-negative safe integer',
  });

export const signedIntSchema = z
  .number()
  .refine((val) => Number.isSafeInteger(val), {
    message: 'Amount must be a safe integer',
  });

/** @deprecated use nonNegativeIntSchema */
export const nonNegativeCopIntSchema = nonNegativeIntSchema;
/** @deprecated use signedIntSchema */
export const signedCopIntSchema = signedIntSchema;

export const monthKeyStringSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid monthKey format (expected YYYY-MM)');

const monthNumberSchema = z.custom<MonthNumber>(
  (val) => typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 12,
  { message: 'Month number must be an integer between 1 and 12' }
);

const conceptRecurrenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('monthly'),
  }),
  z.object({
    kind: z.literal('specific_months'),
    months: z.array(monthNumberSchema).min(1),
  }),
]);

const savingsContributionRuleSchema = z.object({
  bucketId: z.string().min(1).max(120),
  onlyWhenCompleted: z.boolean(),
});

export const conceptSchema: z.ZodType<Concept, unknown> = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.enum(['income', 'expense']),
  group: z.enum(['fixed', 'variable']),
  defaultAmount: nonNegativeIntSchema,
  icon: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  allowMultiplePerMonth: z.boolean(),
  recurrence: conceptRecurrenceSchema,
  linkedDebtGroup: z.string().min(1).optional(),
  defaultTargetDebtId: z.string().min(1).optional(),
  savingsContribution: savingsContributionRuleSchema.optional(),
  provisionCategoryKey: z.string().min(1).optional(),
  idealMotoCategoryKey: z.string().min(1).optional(),
  archived: z.boolean(),
  order: z.number().int(),
});

export const monthEntrySchema: z.ZodType<MonthEntry> = z.object({
  id: z.string().min(1),
  monthKey: monthKeyStringSchema,
  conceptId: z.string().min(1),
  conceptName: z.string().min(1),
  type: z.enum(['income', 'expense']),
  group: z.enum(['fixed', 'variable']),
  plannedAmount: nonNegativeIntSchema,
  actualAmount: nonNegativeIntSchema,
  status: z.enum(['pending', 'completed']),
  completedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'completedAt must be YYYY-MM-DD')
    .optional(),
  note: z.string().optional(),
});

export const debtSchema: z.ZodType<Debt> = z.object({
  id: z.string().min(1),
  groupKey: z.string().min(1),
  name: z.string().min(1),
  lender: z.string().min(1),
  openingBalance: nonNegativeIntSchema,
  monthKey: monthKeyStringSchema,
  monthlyInterestRate: z.number().min(0).max(100).optional(),
  annualInterestRate: z.number().min(0).max(1000).optional(),
  interestRateType: z.enum(['monthly', 'annual']).optional(),
  monthlyInstallment: nonNegativeIntSchema.optional(),
});

export const debtPaymentSchema: z.ZodType<DebtPayment> = z
  .object({
    id: z.string().min(1),
    entryId: z.string().min(1),
    monthKey: monthKeyStringSchema,
    debtId: z.string().min(1),
    principalAmount: nonNegativeIntSchema,
    interestAmount: nonNegativeIntSchema,
    totalApplied: nonNegativeIntSchema,
    completedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    active: z.boolean(),
  })
  .refine((val) => val.totalApplied === val.principalAmount + val.interestAmount, {
    message: 'totalApplied must equal principalAmount + interestAmount',
  });

export const savingsBucketSchema: z.ZodType<SavingsBucket> = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  openingBalance: nonNegativeIntSchema,
  monthKey: monthKeyStringSchema.optional(),
});

export const provisionItemSpecSchema: z.ZodType<ProvisionItemSpec> = z.object({
  id: z.string().min(1),
  excelRawName: z.string().min(1).optional(),
  displayName: z.string().min(1),
  monthlyAmountCop: nonNegativeIntSchema,
  monthlyAmount: nonNegativeIntSchema.optional(),
  cycleCostCop: nonNegativeIntSchema.optional(),
  cycleCost: nonNegativeIntSchema.optional(),
  periodMonths: z.number().int().positive().optional(),
  ceilMonthlyCop: nonNegativeIntSchema.optional(),
  ceilMonthly: nonNegativeIntSchema.optional(),
  linkedConceptId: z.string().min(1).optional(),
  targetAmountCop: nonNegativeIntSchema.optional(),
  targetAmount: nonNegativeIntSchema.optional(),
  targetMonthKey: monthKeyStringSchema.optional(),
  targetDateIso: z.string().min(1).optional(),
  includedInExcelTotalB43: z.boolean().optional(),
  kind: z.enum(['recurring_provision', 'target_goal']),
  notes: z.string().optional(),
});

export const provisionPlanSchema: z.ZodType<ProvisionPlan> = z.object({
  items: z.array(provisionItemSpecSchema),
  recurringMonthlyTotalCop: nonNegativeIntSchema,
  recurringMonthlyTotal: nonNegativeIntSchema.optional(),
  totalWithTargetGoalCop: nonNegativeIntSchema,
  totalWithTargetGoal: nonNegativeIntSchema.optional(),
});

/** @deprecated use provisionPlanSchema */
export const idealMotoPlanSchema = provisionPlanSchema;

const groupBudgetBreakdownSchema = z.object({
  planned: nonNegativeIntSchema,
  paid: nonNegativeIntSchema,
  pending: nonNegativeIntSchema,
});

export const monthlyBudgetSummarySchema: z.ZodType<MonthlyBudgetSummary> = z.object({
  monthKey: monthKeyStringSchema,
  plannedIncome: nonNegativeIntSchema,
  receivedIncome: nonNegativeIntSchema,
  pendingIncome: nonNegativeIntSchema,
  incomeByGroup: z.object({
    fixed: groupBudgetBreakdownSchema,
    variable: groupBudgetBreakdownSchema,
  }),
  plannedExpenses: nonNegativeIntSchema,
  paidExpenses: nonNegativeIntSchema,
  pendingExpenses: nonNegativeIntSchema,
  expensesByGroup: z.object({
    fixed: groupBudgetBreakdownSchema,
    variable: groupBudgetBreakdownSchema,
  }),
  netCashFlow: signedIntSchema,
  projectedNetFlow: signedIntSchema,
});

export const checklistProgressSchema: z.ZodType<ChecklistProgress> = z.object({
  monthKey: monthKeyStringSchema,
  completedCount: z.number().int().min(0),
  totalTrackableCount: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
  completionRatio: z.number().min(0).max(1),
  completionPercentage: z.number().min(0).max(100),
  isMonthComplete: z.boolean(),
});

export const monthSnapshotSchema: z.ZodType<MonthSnapshot> = z.object({
  monthKey: monthKeyStringSchema,
  closedAtIso: z.string().min(1),
  budget: monthlyBudgetSummarySchema,
  checklist: checklistProgressSchema,
  closingDebts: z.array(
    z.object({
      debtId: z.string().min(1),
      name: z.string().min(1),
      lender: z.string().optional(),
      groupKey: z.string().optional(),
      openingBalance: nonNegativeIntSchema,
      paidPrincipal: nonNegativeIntSchema,
      closingBalance: nonNegativeIntSchema,
      monthlyInterestRate: z.number().min(0).max(100).optional(),
      annualInterestRate: z.number().min(0).max(1000).optional(),
      interestRateType: z.enum(['monthly', 'annual']).optional(),
      monthlyInstallment: nonNegativeIntSchema.optional(),
    })
  ),
  totalClosingDebt: nonNegativeIntSchema,
  closingSavings: z.object({
    reserveClosingBalance: signedIntSchema.optional(),
    motoClosingBalance: signedIntSchema,
    savingsClosingBalance: signedIntSchema,
    totalClosingSavings: signedIntSchema,
  }),
});

export function stripUndefinedFields(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        clean[key] = stripUndefinedFields(value as Record<string, unknown>);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

export function serializeConceptForFirestore(concept: Concept): Record<string, unknown> {
  const validated = conceptSchema.parse(concept);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseConceptFromFirestore(raw: unknown): Concept {
  return conceptSchema.parse(raw);
}

export function serializeMonthEntryForFirestore(entry: MonthEntry): Record<string, unknown> {
  const validated = monthEntrySchema.parse(entry);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseMonthEntryFromFirestore(raw: unknown): MonthEntry {
  return monthEntrySchema.parse(raw);
}

export function serializeDebtForFirestore(debt: Debt): Record<string, unknown> {
  const validated = debtSchema.parse(debt);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseDebtFromFirestore(raw: unknown): Debt {
  return debtSchema.parse(raw);
}

export function serializeDebtPaymentForFirestore(payment: DebtPayment): Record<string, unknown> {
  const validated = debtPaymentSchema.parse(payment);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseDebtPaymentFromFirestore(raw: unknown): DebtPayment {
  return debtPaymentSchema.parse(raw);
}

export function serializeSavingsBucketForFirestore(bucket: SavingsBucket): Record<string, unknown> {
  const validated = savingsBucketSchema.parse(bucket);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseSavingsBucketFromFirestore(raw: unknown): SavingsBucket {
  return savingsBucketSchema.parse(raw);
}

export function serializeProvisionPlanForFirestore(plan: ProvisionPlan): Record<string, unknown> {
  const validated = provisionPlanSchema.parse(plan);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseProvisionPlanFromFirestore(raw: unknown): ProvisionPlan {
  return provisionPlanSchema.parse(raw);
}

/** @deprecated use serializeProvisionPlanForFirestore */
export const serializeIdealMotoPlanForFirestore = serializeProvisionPlanForFirestore;
/** @deprecated use parseProvisionPlanFromFirestore */
export const parseIdealMotoPlanFromFirestore = parseProvisionPlanFromFirestore;

export function serializeMonthSnapshotForFirestore(snapshot: MonthSnapshot): Record<string, unknown> {
  const validated = monthSnapshotSchema.parse(snapshot);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseMonthSnapshotFromFirestore(raw: unknown): MonthSnapshot {
  return monthSnapshotSchema.parse(raw);
}
