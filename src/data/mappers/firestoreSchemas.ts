/**
 * src/data/mappers/firestoreSchemas.ts
 *
 * Strict Zod validation schemas and Firestore document mappers for BFlow.
 * Enforces safe non-negative COP integers, valid America/Bogota monthKeys,
 * and strips undefined fields before sending payloads to Cloud Firestore.
 */

import { z } from 'zod';
import type {
  ChecklistProgress,
  Concept,
  Debt,
  DebtPayment,
  IdealMotoPlan,
  MonthEntry,
  MonthNumber,
  MonthSnapshot,
  MonthlyBudgetSummary,
  ProvisionItemSpec,
  SavingsBucket,
} from '../../domain/models/types';

const nonNegativeCopIntSchema = z
  .number()
  .refine((val) => Number.isSafeInteger(val) && val >= 0, {
    message: 'Amount must be a non-negative safe COP integer',
  });

const signedCopIntSchema = z
  .number()
  .refine((val) => Number.isSafeInteger(val), {
    message: 'Amount must be a safe COP integer',
  });

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
  bucketId: z.enum(['moto', 'savings']),
  onlyWhenCompleted: z.boolean(),
});

export const conceptSchema: z.ZodType<Concept, z.ZodTypeDef, unknown> = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.enum(['income', 'expense']),
  group: z.enum(['fixed', 'variable']),
  defaultAmount: nonNegativeCopIntSchema,
  icon: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  allowMultiplePerMonth: z.boolean(),
  recurrence: conceptRecurrenceSchema,
  linkedDebtGroup: z.string().min(1).optional(),
  defaultTargetDebtId: z.string().min(1).optional(),
  savingsContribution: savingsContributionRuleSchema.optional(),
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
  plannedAmount: nonNegativeCopIntSchema,
  actualAmount: nonNegativeCopIntSchema,
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
  openingBalance: nonNegativeCopIntSchema,
  monthKey: monthKeyStringSchema,
});

export const debtPaymentSchema: z.ZodType<DebtPayment> = z
  .object({
    id: z.string().min(1),
    entryId: z.string().min(1),
    monthKey: monthKeyStringSchema,
    debtId: z.string().min(1),
    principalAmount: nonNegativeCopIntSchema,
    interestAmount: nonNegativeCopIntSchema,
    totalApplied: nonNegativeCopIntSchema,
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
  id: z.enum(['moto', 'savings']),
  name: z.string().min(1),
  openingBalance: nonNegativeCopIntSchema,
});

export const provisionItemSpecSchema: z.ZodType<ProvisionItemSpec> = z.object({
  id: z.string().min(1),
  excelRawName: z.string().min(1),
  displayName: z.string().min(1),
  monthlyAmountCop: nonNegativeCopIntSchema,
  cycleCostCop: nonNegativeCopIntSchema.optional(),
  periodMonths: z.number().int().positive().optional(),
  ceilMonthlyCop: nonNegativeCopIntSchema.optional(),
  linkedConceptId: z.string().min(1).optional(),
  targetAmountCop: nonNegativeCopIntSchema.optional(),
  targetMonthKey: monthKeyStringSchema.optional(),
  targetDateIso: z.string().min(1).optional(),
  includedInExcelTotalB43: z.boolean(),
  kind: z.enum(['recurring_provision', 'target_goal']),
});

export const idealMotoPlanSchema: z.ZodType<IdealMotoPlan> = z.object({
  items: z.array(provisionItemSpecSchema),
  recurringMonthlyTotalCop: nonNegativeCopIntSchema,
  totalWithTargetGoalCop: nonNegativeCopIntSchema,
});

const groupBudgetBreakdownSchema = z.object({
  planned: nonNegativeCopIntSchema,
  paid: nonNegativeCopIntSchema,
  pending: nonNegativeCopIntSchema,
});

export const monthlyBudgetSummarySchema: z.ZodType<MonthlyBudgetSummary> = z.object({
  monthKey: monthKeyStringSchema,
  plannedIncome: nonNegativeCopIntSchema,
  receivedIncome: nonNegativeCopIntSchema,
  pendingIncome: nonNegativeCopIntSchema,
  incomeByGroup: z.object({
    fixed: groupBudgetBreakdownSchema,
    variable: groupBudgetBreakdownSchema,
  }),
  plannedExpenses: nonNegativeCopIntSchema,
  paidExpenses: nonNegativeCopIntSchema,
  pendingExpenses: nonNegativeCopIntSchema,
  expensesByGroup: z.object({
    fixed: groupBudgetBreakdownSchema,
    variable: groupBudgetBreakdownSchema,
  }),
  netCashFlow: signedCopIntSchema,
  projectedNetFlow: signedCopIntSchema,
});

export const checklistProgressSchema: z.ZodType<ChecklistProgress> = z.object({
  monthKey: monthKeyStringSchema,
  completedCount: z.number().int().min(0),
  totalTrackableCount: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
  completionRatio: z.number().min(0).max(1),
  completionPercentage: z.number().int().min(0).max(100),
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
      openingBalance: nonNegativeCopIntSchema,
      paidPrincipal: nonNegativeCopIntSchema,
      closingBalance: nonNegativeCopIntSchema,
    })
  ),
  totalClosingDebt: nonNegativeCopIntSchema,
  closingSavings: z.object({
    motoClosingBalance: signedCopIntSchema,
    savingsClosingBalance: signedCopIntSchema,
    totalClosingSavings: signedCopIntSchema,
  }),
});

/**
 * Recursively removes `undefined` fields so Firestore `setDoc` / `writeBatch`
 * never throws on optional domain fields.
 */
export function stripUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedFields(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefinedFields(v);
      }
    }
    return cleaned as T;
  }
  return value;
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

export function serializeIdealMotoPlanForFirestore(plan: IdealMotoPlan): Record<string, unknown> {
  const validated = idealMotoPlanSchema.parse(plan);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseIdealMotoPlanFromFirestore(raw: unknown): IdealMotoPlan {
  return idealMotoPlanSchema.parse(raw);
}

export function serializeMonthSnapshotForFirestore(snapshot: MonthSnapshot): Record<string, unknown> {
  const validated = monthSnapshotSchema.parse(snapshot);
  return stripUndefinedFields({ ...validated }) as Record<string, unknown>;
}

export function parseMonthSnapshotFromFirestore(raw: unknown): MonthSnapshot {
  return monthSnapshotSchema.parse(raw);
}
