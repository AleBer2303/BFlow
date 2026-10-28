/**
 * src/data/seed/october2026SeedData.ts
 *
 * Pure, deterministic builder and idempotent seed runner for October 2026 ("2026-10")
 * derived directly from `fixtures/seed-october-2026.json` and `fixtures/october-2026.json`.
 */

import october2026Fixture from '../../../fixtures/october-2026.json';
import seedOctober2026Fixture from '../../../fixtures/seed-october-2026.json';
import type {
  Concept,
  Debt,
  DebtPayment,
  IdealMotoPlan,
  MonthEntry,
  ProvisionItemSpec,
  SavingsBucket,
} from '../../domain/models/types';
import {
  parseConceptFromFirestore,
  parseDebtFromFirestore,
  parseDebtPaymentFromFirestore,
  parseIdealMotoPlanFromFirestore,
  parseMonthEntryFromFirestore,
  parseSavingsBucketFromFirestore,
} from '../mappers/firestoreSchemas';

export interface October2026SeedPayload {
  monthKey: '2026-10';
  concepts: Concept[];
  entries: MonthEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsBuckets: SavingsBucket[];
  provisionPlan: IdealMotoPlan;
}

/**
 * Builds and validates the complete October 2026 seed dataset against the Zod domain schemas.
 */
export function buildOctober2026SeedPayload(): October2026SeedPayload {
  const concepts: Concept[] = seedOctober2026Fixture.concepts.map((raw) =>
    parseConceptFromFirestore({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      group: raw.group,
      defaultAmount: raw.defaultAmount,
      allowMultiplePerMonth: raw.allowMultiplePerMonth,
      recurrence: raw.recurrence,
      linkedDebtGroup: (raw as { linkedDebtGroup?: string }).linkedDebtGroup,
      defaultTargetDebtId: (raw as { defaultTargetDebtId?: string }).defaultTargetDebtId,
      savingsContribution: (
        raw as {
          savingsContribution?: { bucketId: 'moto' | 'savings'; onlyWhenCompleted: boolean };
        }
      ).savingsContribution,
      idealMotoCategoryKey: (raw as { idealMotoCategoryKey?: string }).idealMotoCategoryKey,
      archived: raw.archived,
      order: raw.order,
    })
  );

  const entries: MonthEntry[] = seedOctober2026Fixture.entries.map((raw) =>
    parseMonthEntryFromFirestore({
      id: raw.id,
      monthKey: raw.monthKey,
      conceptId: raw.conceptId,
      conceptName: raw.conceptName,
      type: raw.type,
      group: raw.group,
      plannedAmount: raw.plannedAmount,
      actualAmount: raw.actualAmount,
      status: raw.status,
      completedAt: (raw as { completedAt?: string }).completedAt,
    })
  );

  const debts: Debt[] = seedOctober2026Fixture.debts.map((raw) =>
    parseDebtFromFirestore({
      id: raw.id,
      groupKey: raw.groupKey,
      name: raw.name,
      lender: raw.lender,
      openingBalance: raw.openingBalance,
      monthKey: raw.monthKey,
    })
  );

  const debtPayments: DebtPayment[] = seedOctober2026Fixture.debtPayments.map((raw) =>
    parseDebtPaymentFromFirestore({
      id: raw.id,
      entryId: raw.entryId,
      monthKey: raw.monthKey,
      debtId: raw.debtId,
      principalAmount: raw.principalAmount,
      interestAmount: raw.interestAmount,
      totalApplied: raw.totalApplied,
      completedAt: raw.completedAt,
      active: raw.active,
    })
  );

  const savingsBuckets: SavingsBucket[] = seedOctober2026Fixture.savingsBuckets.map((raw) =>
    parseSavingsBucketFromFirestore({
      id: raw.id,
      name: raw.name,
      openingBalance: raw.openingBalance,
    })
  );

  const provisionItems: ProvisionItemSpec[] = october2026Fixture.idealMotoPlan.items.map(
    (item) => ({
      id: item.id,
      excelRawName: item.excelRawName,
      displayName: item.displayName,
      monthlyAmountCop: item.monthlyAmountCop,
      cycleCostCop: (item as { cycleCostCop?: number }).cycleCostCop,
      periodMonths: (item as { periodMonths?: number }).periodMonths,
      ceilMonthlyCop: (item as { ceilMonthlyCop?: number }).ceilMonthlyCop,
      linkedConceptId: (item as { linkedConceptId?: string }).linkedConceptId ?? undefined,
      targetAmountCop: (item as { targetAmountCop?: number }).targetAmountCop,
      targetMonthKey: (item as { targetMonthKey?: string }).targetMonthKey,
      targetDateIso: (item as { targetDateIso?: string }).targetDateIso,
      includedInExcelTotalB43: item.includedInExcelTotalB43,
      kind: item.kind as 'recurring_provision' | 'target_goal',
    })
  );

  const provisionPlan = parseIdealMotoPlanFromFirestore({
    items: provisionItems,
    recurringMonthlyTotalCop: october2026Fixture.idealMotoPlan.recurringMonthlyTotalCop,
    totalWithTargetGoalCop: october2026Fixture.idealMotoPlan.totalWithTargetGoalCop,
  });

  return {
    monthKey: '2026-10',
    concepts,
    entries,
    debts,
    debtPayments,
    savingsBuckets,
    provisionPlan,
  };
}
