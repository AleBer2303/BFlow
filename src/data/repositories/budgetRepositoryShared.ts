/**
 * src/data/repositories/budgetRepositoryShared.ts
 *
 * Helpers shared by both repository implementations and the account hydration.
 * No Firestore calls here.
 */

import { sumMoneyIntegers } from '../../domain/money/money';
import type {
  Concept,
  Debt,
  ProvisionPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';
import { RESERVE_BUCKET_ID } from '../migrations/legacyFieldMigration';

export function generateDataRevision(): string {
  const randomPart =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `rev_${Date.now().toString(36)}_${randomPart}`;
}

export function safeParseList<T>(
  rawDocs: ReadonlyArray<{ data: () => unknown }>,
  parser: (raw: unknown) => T
): T[] {
  const results: T[] = [];
  for (const docSnap of rawDocs) {
    try {
      results.push(parser(docSnap.data()));
    } catch {
      // Skip malformed legacy document so account sync never aborts
    }
  }
  return results;
}

/** Group of a debt that does not say one. */
export const DEFAULT_DEBT_GROUP_KEY = 'General';

export const EMPTY_PROVISION_PLAN: ProvisionPlan = {
  items: [],
  recurringMonthlyTotalCop: 0,
  totalWithTargetGoalCop: 0,
};

/** Copy of the user's buckets (no standard bucket is forced in). */
export function ensureStandardSavingsBuckets(buckets: readonly SavingsBucket[]): SavingsBucket[] {
  return buckets.map((b) => ({ ...b }));
}

export function reconstructClosedMonthBalances(
  snapshot: MonthSnapshot,
  concepts: readonly Concept[],
  entries: readonly MonthEntry[],
  currentDebts: readonly Debt[] = [],
  currentBuckets: readonly SavingsBucket[] = []
): { debts: Debt[]; savingsBuckets: SavingsBucket[] } {
  const debtMetaById = new Map<string, Debt>();
  for (const d of currentDebts) {
    debtMetaById.set(d.id, d);
  }

  const debts: Debt[] = snapshot.closingDebts.map((cd) => {
    const meta = debtMetaById.get(cd.debtId);
    const monthlyRate = meta?.monthlyInterestRate ?? cd.monthlyInterestRate;
    const annualRate = meta?.annualInterestRate ?? cd.annualInterestRate;
    const rateType = meta?.interestRateType ?? cd.interestRateType;
    const installment = meta?.monthlyInstallment ?? cd.monthlyInstallment;

    return {
      id: cd.debtId,
      groupKey: meta?.groupKey ?? cd.groupKey ?? DEFAULT_DEBT_GROUP_KEY,
      name: meta?.name ?? cd.name,
      lender: meta?.lender ?? cd.lender ?? '',
      openingBalance: cd.openingBalance,
      monthKey: snapshot.monthKey,
      ...(monthlyRate !== undefined ? { monthlyInterestRate: monthlyRate } : {}),
      ...(annualRate !== undefined ? { annualInterestRate: annualRate } : {}),
      ...(rateType ? { interestRateType: rateType } : {}),
      ...(installment !== undefined ? { monthlyInstallment: installment } : {}),
    };
  });

  const reserveConceptIds = new Set(
    concepts
      .filter((c) => !c.archived && c.savingsContribution?.bucketId === RESERVE_BUCKET_ID)
      .map((c) => c.id)
  );
  const paidReserveContributions = sumMoneyIntegers(
    entries
      .filter(
        (e) =>
          e.monthKey === snapshot.monthKey &&
          e.status === 'completed' &&
          reserveConceptIds.has(e.conceptId)
      )
      .map((e) => e.actualAmount)
  );

  const extraBuckets = currentBuckets
    .filter((b) => b.id !== RESERVE_BUCKET_ID && b.id !== 'savings')
    .map((b) => ({ ...b }));

  const hasReserve = currentBuckets.some((b) => b.id === RESERVE_BUCKET_ID);
  const hasSavings = currentBuckets.some((b) => b.id === 'savings');

  const savingsBuckets: SavingsBucket[] = [
    ...(hasReserve
      ? [
          {
            id: RESERVE_BUCKET_ID,
            name: currentBuckets.find((b) => b.id === RESERVE_BUCKET_ID)?.name ?? 'Fondo de reserva',
            openingBalance: Math.max(
              0,
              snapshot.closingSavings.reserveClosingBalance - paidReserveContributions
            ),
          },
        ]
      : []),
    ...(hasSavings
      ? [
          {
            id: 'savings',
            name: currentBuckets.find((b) => b.id === 'savings')?.name ?? 'Fondo Ahorros',
            openingBalance: Math.max(
              0,
              snapshot.closingSavings.savingsClosingBalance - snapshot.budget.netCashFlow
            ),
          },
        ]
      : []),
    ...extraBuckets,
  ];

  return { debts, savingsBuckets };
}
