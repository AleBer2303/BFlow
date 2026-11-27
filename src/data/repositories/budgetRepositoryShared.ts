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
  ProvisionPlan as IdealMotoPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';
import { resolveOwnerSeedEmails } from '../../platform/mode/ownerSeedEmail';

export function generateDataRevision(): string {
  const randomPart =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `rev_${Date.now().toString(36)}_${randomPart}`;
}

const OWNER_SEED_EMAILS = resolveOwnerSeedEmails();

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

/** Groups items by `monthKey`, keeping their order (OPT-04). */
export function groupByMonthKey<T extends { monthKey: string }>(items: readonly T[]): Map<string, T[]> {
  const byMonth = new Map<string, T[]>();
  for (const item of items) {
    const list = byMonth.get(item.monthKey);
    if (list) {
      list.push(item);
    } else {
      byMonth.set(item.monthKey, [item]);
    }
  }
  return byMonth;
}

export function paymentEntryKey(entryId: string, monthKey: string): string {
  return `${monthKey}|${entryId}`;
}

export function isOwnerCanonicalEmail(email?: string | null): boolean {
  if (!email) return false;
  return OWNER_SEED_EMAILS.has(email.trim().toLowerCase());
}

export const EMPTY_PROVISION_PLAN: IdealMotoPlan = {
  items: [],
  recurringMonthlyTotalCop: 0,
  totalWithTargetGoalCop: 0,
};

/** Copy of the user's buckets (the standard Moto / Ahorros buckets are no longer forced in). */
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
      groupKey: meta?.groupKey ?? cd.groupKey ?? 'FUNFAMI',
      name: meta?.name ?? cd.name,
      lender: meta?.lender ?? cd.lender ?? 'FUNFAMI',
      openingBalance: cd.openingBalance,
      monthKey: snapshot.monthKey,
      ...(monthlyRate !== undefined ? { monthlyInterestRate: monthlyRate } : {}),
      ...(annualRate !== undefined ? { annualInterestRate: annualRate } : {}),
      ...(rateType ? { interestRateType: rateType } : {}),
      ...(installment !== undefined ? { monthlyInstallment: installment } : {}),
    };
  });

  const motoConceptIds = new Set(
    concepts
      .filter((c) => !c.archived && c.savingsContribution?.bucketId === 'moto')
      .map((c) => c.id)
  );
  const paidMotoContributions = sumMoneyIntegers(
    entries
      .filter(
        (e) =>
          e.monthKey === snapshot.monthKey &&
          e.status === 'completed' &&
          motoConceptIds.has(e.conceptId)
      )
      .map((e) => e.actualAmount)
  );

  const extraBuckets = currentBuckets
    .filter((b) => b.id !== 'moto' && b.id !== 'savings')
    .map((b) => ({ ...b }));

  const hasMoto = currentBuckets.some((b) => b.id === 'moto');
  const hasSavings = currentBuckets.some((b) => b.id === 'savings');

  const savingsBuckets: SavingsBucket[] = [
    ...(hasMoto
      ? [
          {
            id: 'moto',
            name: currentBuckets.find((b) => b.id === 'moto')?.name ?? 'Fondo Moto',
            openingBalance: Math.max(
              0,
              snapshot.closingSavings.motoClosingBalance - paidMotoContributions
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
