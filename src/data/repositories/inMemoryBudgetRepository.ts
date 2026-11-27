/**
 * src/data/repositories/inMemoryBudgetRepository.ts
 *
 * In-memory `BudgetRepository` pre-populated with the October 2026 golden dataset.
 */

import {
  deleteMovement,
  ensureMonthPlan,
  registerMovement,
  toggleMovementStatus,
  type RegisterOrCompleteMovementInput,
} from '../../domain/checklist/checklist';
import { addMonthsToMonthKey, toAppIsoDate, toAppMonthKey } from '../../domain/date/monthKey';
import { closeMonthAndRollover, type CloseMonthResult } from '../../domain/month-close/monthClose';
import type {
  Concept,
  Debt,
  DebtPayment,
  FinancialAccount,
  ProvisionPlan as IdealMotoPlan,
  MonthEntry,
  MonthSnapshot,
  SavingsBucket,
} from '../../domain/models/types';
import { buildOctober2026SeedPayload } from '../seed/october2026SeedData';
import {
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  isOwnerCanonicalEmail,
} from './budgetRepositoryShared';
import type {
  AddMonthEntryContext,
  BudgetRepository,
  FullCloudAccountData,
  InitialAccountSetupPayload,
  LoadCloudAccountOptions,
  MonthWorkspaceData,
  ToggleEntryCompletionResult,
  UserProfileFields,
} from './budgetRepositoryTypes';

/**
 * In-memory implementation pre-populated with the October 2026 golden dataset.
 * Used in deterministic unit tests and offline fallback.
 */
export class InMemoryBudgetRepository implements BudgetRepository {
  private concepts = new Map<string, Concept>();
  private entries = new Map<string, MonthEntry>();
  private debtsByMonth = new Map<string, Debt[]>();
  private debtPayments = new Map<string, DebtPayment>();
  private savingsBucketsByMonth = new Map<string, SavingsBucket[]>();
  private provisionPlan: IdealMotoPlan;
  private snapshots = new Map<string, MonthSnapshot>();
  private financialAccounts = new Map<string, FinancialAccount>();
  private seededUsers = new Set<string>();
  private resetUsers = new Set<string>();
  private onboardedUsers = new Set<string>();
  private activeMonthByUser = new Map<string, string>();
  private profilesByUser = new Map<string, UserProfileFields>();

  constructor(autoSeedDefaultUser = true) {
    const seed = buildOctober2026SeedPayload();
    this.provisionPlan = seed.provisionPlan;
    if (autoSeedDefaultUser) {
      this.applySeedPayload(seed);
      this.seededUsers.add('local-owner');
      this.onboardedUsers.add('local-owner');
      this.activeMonthByUser.set('local-owner', '2026-10');
    }
  }

  private applySeedPayload(seed = buildOctober2026SeedPayload()): void {
    for (const c of seed.concepts) {
      this.concepts.set(c.id, c);
    }
    for (const e of seed.entries) {
      this.entries.set(e.id, e);
    }
    this.debtsByMonth.set(
      '2026-10',
      seed.debts.map((d) => ({ ...d }))
    );
    for (const dp of seed.debtPayments) {
      this.debtPayments.set(dp.id, dp);
    }
    this.savingsBucketsByMonth.set(
      '2026-10',
      seed.savingsBuckets.map((sb) => ({ ...sb }))
    );
    this.provisionPlan = seed.provisionPlan;
  }

  async seedOctober2026IfEmpty(
    uid: string,
    userEmail?: string | null
  ): Promise<{ seeded: boolean; monthKey: string }> {
    const defaultNewUserMonth = `${toAppMonthKey().slice(0, 4)}-01`;
    if (this.resetUsers.has(uid)) {
      return {
        seeded: false,
        monthKey: this.activeMonthByUser.get(uid) ?? defaultNewUserMonth,
      };
    }
    if (userEmail && !isOwnerCanonicalEmail(userEmail) && !this.seededUsers.has(uid)) {
      const fallbackMonth = this.activeMonthByUser.get(uid) ?? defaultNewUserMonth;
      this.activeMonthByUser.set(uid, fallbackMonth);
      return { seeded: false, monthKey: fallbackMonth };
    }
    if (this.seededUsers.has(uid) && this.entries.size > 0) {
      return { seeded: false, monthKey: this.activeMonthByUser.get(uid) ?? '2026-10' };
    }
    this.applySeedPayload();
    this.seededUsers.add(uid);
    this.onboardedUsers.add(uid);
    this.activeMonthByUser.set(uid, '2026-10');
    return { seeded: true, monthKey: '2026-10' };
  }

  async loadMonthWorkspace(uid: string, monthKey: string): Promise<MonthWorkspaceData> {
    await this.seedOctober2026IfEmpty(uid);
    const concepts = Array.from(this.concepts.values()).sort((a, b) => a.order - b.order);
    const entries = Array.from(this.entries.values()).filter((e) => e.monthKey === monthKey);
    const debts = (
      this.debtsByMonth.get(monthKey) ??
      this.debtsByMonth.get('2026-10') ??
      []
    ).map((d) => ({ ...d }));
    const debtPayments = Array.from(this.debtPayments.values()).filter(
      (dp) => dp.monthKey === monthKey
    );
    const savingsBuckets = (
      this.savingsBucketsByMonth.get(monthKey) ??
      this.savingsBucketsByMonth.get('2026-10') ??
      ensureStandardSavingsBuckets([])
    ).map((sb) => ({ ...sb }));
    const closedSnapshot = this.snapshots.get(monthKey);

    return {
      monthKey,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
      provisionPlan: this.provisionPlan,
      closedSnapshot,
    };
  }

  async loadFullCloudAccount(
    uid: string,
    userEmail?: string | null,
    options?: LoadCloudAccountOptions
  ): Promise<FullCloudAccountData> {
    const seedInfo = await this.seedOctober2026IfEmpty(uid, userEmail);
    const savedActiveMonthKey = this.activeMonthByUser.get(uid) ?? seedInfo.monthKey;
    const concepts = Array.from(this.concepts.values()).sort((a, b) => a.order - b.order);
    const entries = Array.from(this.entries.values());
    const debtPayments = Array.from(this.debtPayments.values());

    const monthsSet = new Set<string>([savedActiveMonthKey]);
    if (this.seededUsers.has(uid)) {
      monthsSet.add('2026-10');
    }
    for (const e of entries) monthsSet.add(e.monthKey);
    for (const mk of this.debtsByMonth.keys()) monthsSet.add(mk);
    for (const mk of this.savingsBucketsByMonth.keys()) monthsSet.add(mk);
    for (const s of this.snapshots.keys()) {
      monthsSet.add(s);
      monthsSet.add(addMonthsToMonthKey(s, 1));
    }
    const availableMonths = Array.from(monthsSet).sort();
    const activeMonthKey =
      availableMonths[availableMonths.length - 1] ?? savedActiveMonthKey;
    this.activeMonthByUser.set(uid, activeMonthKey);

    for (const mk of availableMonths) {
      if (
        !this.snapshots.has(mk) &&
        concepts.length > 0 &&
        !entries.some((e) => e.monthKey === mk)
      ) {
        const planned = ensureMonthPlan(mk, concepts, []);
        for (const pe of planned) {
          this.entries.set(pe.id, pe);
          entries.push(pe);
        }
      }
    }

    const defaultDebts =
      this.debtsByMonth.get(activeMonthKey) ??
      this.debtsByMonth.get(availableMonths[0] ?? '2026-10') ??
      this.debtsByMonth.get('2026-10') ??
      [];
    const defaultBuckets =
      this.savingsBucketsByMonth.get(activeMonthKey) ??
      this.savingsBucketsByMonth.get(availableMonths[0] ?? '2026-10') ??
      this.savingsBucketsByMonth.get('2026-10') ??
      [];
    const debtsByMonth: Record<string, Debt[]> = {};
    const savingsBucketsByMonth: Record<string, SavingsBucket[]> = {};
    for (const mk of availableMonths) {
      debtsByMonth[mk] = (this.debtsByMonth.get(mk) ?? defaultDebts).map((d) => ({
        ...d,
        monthKey: mk,
      }));
      savingsBucketsByMonth[mk] = ensureStandardSavingsBuckets(
        this.savingsBucketsByMonth.get(mk) ?? defaultBuckets
      );
    }

    const closedSnapshots: Record<string, MonthSnapshot> = {};
    for (const [mk, snap] of this.snapshots.entries()) {
      closedSnapshots[mk] = snap;
    }

    let needsOnboarding: boolean;
    if (this.resetUsers.has(uid)) {
      needsOnboarding = true;
    } else if (options?.isRegistration === true && !isOwnerCanonicalEmail(userEmail)) {
      needsOnboarding = true;
      this.onboardedUsers.add(uid);
    } else if (options?.isRegistration === false) {
      needsOnboarding = false;
      this.onboardedUsers.add(uid);
    } else {
      needsOnboarding =
        !this.onboardedUsers.has(uid) &&
        !this.seededUsers.has(uid) &&
        concepts.length === 0;
      if (needsOnboarding) {
        this.onboardedUsers.add(uid);
      }
    }

    return {
      activeMonthKey,
      availableMonths,
      concepts,
      entries,
      debtsByMonth,
      debtPayments,
      savingsBucketsByMonth,
      provisionPlan: this.provisionPlan,
      closedSnapshots,
      financialAccounts: Array.from(this.financialAccounts.values()).map((a) => ({ ...a })),
      needsOnboarding,
    };
  }

  async toggleEntryCompletion(
    _uid: string,
    entryId: string,
    monthKey: string,
    options?: { actualAmount?: number; completedAtDateIso?: string; targetDebtId?: string }
  ): Promise<ToggleEntryCompletionResult> {
    const existing = this.entries.get(entryId);
    if (!existing || existing.monthKey !== monthKey) {
      throw new Error(`Entry ${entryId} not found in month ${monthKey}`);
    }

    const allEntries = Array.from(this.entries.values());

    const nextEntries = toggleMovementStatus(allEntries, entryId, {
      actualAmount: options?.actualAmount ?? existing.plannedAmount,
      completedAt: options?.completedAtDateIso ?? toAppIsoDate(),
    });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    if (!updatedEntry) {
      throw new Error(`Updated entry ${entryId} missing after toggle`);
    }

    this.entries.set(updatedEntry.id, updatedEntry);

    const concept = this.concepts.get(updatedEntry.conceptId);
    let updatedDebtPayment: DebtPayment | undefined;

    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      const monthDebts = this.debtsByMonth.get(monthKey) ?? [];
      const fallbackDebtId = monthDebts[0]?.id ?? 'debt_obligation_primary';
      const targetDebtId =
        options?.targetDebtId ?? concept.defaultTargetDebtId ?? fallbackDebtId;
      const paymentId = `${updatedEntry.id}_${targetDebtId}`;
      const existingPayment = this.debtPayments.get(paymentId);

      updatedDebtPayment = {
        id: paymentId,
        entryId: updatedEntry.id,
        monthKey: updatedEntry.monthKey,
        debtId: targetDebtId,
        principalAmount: updatedEntry.actualAmount,
        interestAmount: existingPayment?.interestAmount ?? 0,
        totalApplied: updatedEntry.actualAmount + (existingPayment?.interestAmount ?? 0),
        completedAt: updatedEntry.completedAt,
        active: updatedEntry.status === 'completed',
      };
      this.debtPayments.set(paymentId, updatedDebtPayment);
    }

    return {
      updatedEntry,
      updatedDebtPayment,
    };
  }

  async addMonthEntry(
    _uid: string,
    input: RegisterOrCompleteMovementInput,
    context?: AddMonthEntryContext
  ): Promise<MonthEntry> {
    const existingEntriesForMonth = context?.monthEntries
      ? [...context.monthEntries]
      : Array.from(this.entries.values()).filter((e) => e.monthKey === input.monthKey);
    const allConcepts = context?.concepts
      ? [...context.concepts]
      : Array.from(this.concepts.values());
    const nextEntries = registerMovement(existingEntriesForMonth, allConcepts, input);
    const created =
      nextEntries.find(
        (e) =>
          e.monthKey === input.monthKey &&
          e.conceptId === input.conceptId &&
          !existingEntriesForMonth.some((prev) => prev.id === e.id && prev.status === 'completed')
      ) ?? nextEntries[nextEntries.length - 1];
    if (!created) {
      throw new Error('Failed to create month entry');
    }
    this.entries.set(created.id, created);

    const concept = this.concepts.get(created.conceptId);
    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      const monthDebts = this.debtsByMonth.get(input.monthKey) ?? [];
      const fallbackDebtId = monthDebts[0]?.id ?? 'debt_obligation_primary';
      const targetDebtId = concept.defaultTargetDebtId ?? fallbackDebtId;
      const paymentId = `${created.id}_${targetDebtId}`;
      this.debtPayments.set(paymentId, {
        id: paymentId,
        entryId: created.id,
        monthKey: created.monthKey,
        debtId: targetDebtId,
        principalAmount: created.actualAmount,
        interestAmount: 0,
        totalApplied: created.actualAmount,
        completedAt: created.completedAt,
        active: true,
      });
    }

    return created;
  }

  async deleteOrResetEntry(_uid: string, entryId: string): Promise<void> {
    const existing = this.entries.get(entryId);
    if (!existing) return;

    const allEntries = Array.from(this.entries.values());
    const allConcepts = Array.from(this.concepts.values());
    const nextEntries = deleteMovement(allEntries, allConcepts, entryId);
    this.entries.clear();
    for (const e of nextEntries) {
      this.entries.set(e.id, e);
    }

    const concept = this.concepts.get(existing.conceptId);
    if (concept?.linkedDebtGroup || concept?.defaultTargetDebtId) {
      for (const [paymentId, payment] of this.debtPayments.entries()) {
        if (payment.entryId === entryId) {
          const { completedAt: _removed, ...restPayment } = payment;
          this.debtPayments.set(paymentId, {
            ...restPayment,
            principalAmount: existing.plannedAmount,
            totalApplied: existing.plannedAmount + payment.interestAmount,
            active: false,
          });
        }
      }
    }
  }

  async closeMonth(
    uid: string,
    monthKey: string,
    closedAtIso = new Date().toISOString()
  ): Promise<CloseMonthResult> {
    const concepts = Array.from(this.concepts.values());
    const entries = Array.from(this.entries.values()).filter((e) => e.monthKey === monthKey);
    const debts =
      this.debtsByMonth.get(monthKey) ?? this.debtsByMonth.get('2026-10') ?? [];
    const debtPayments = Array.from(this.debtPayments.values()).filter(
      (dp) => dp.monthKey === monthKey
    );
    const savingsBuckets = ensureStandardSavingsBuckets(
      this.savingsBucketsByMonth.get(monthKey) ??
        this.savingsBucketsByMonth.get('2026-10') ??
        []
    );

    const result = closeMonthAndRollover({
      closingMonthKey: monthKey,
      closedAtIso,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
    });

    await this.persistMonthCloseResult(uid, monthKey, result);
    return result;
  }

  async persistMonthCloseResult(
    uid: string,
    closingMonthKey: string,
    result: CloseMonthResult
  ): Promise<void> {
    this.snapshots.set(closingMonthKey, result.snapshot);
    this.debtsByMonth.set(
      result.nextMonthKey,
      result.nextMonthDebts.map((d) => ({ ...d }))
    );
    this.savingsBucketsByMonth.set(
      result.nextMonthKey,
      result.nextMonthSavingsBuckets.map((sb) => ({ ...sb }))
    );
    for (const nextEntry of result.nextMonthEntries) {
      this.entries.set(nextEntry.id, nextEntry);
    }
    this.activeMonthByUser.set(uid, result.nextMonthKey);
  }

  async saveOrUpdateEntry(
    _uid: string,
    entry: MonthEntry,
    linkedConcept?: Concept,
    debtPayments?: DebtPayment[]
  ): Promise<void> {
    this.entries.set(entry.id, entry);
    if (linkedConcept) {
      this.concepts.set(linkedConcept.id, linkedConcept);
    }
    if (debtPayments) {
      for (const [id, existing] of this.debtPayments.entries()) {
        if (existing.entryId === entry.id && !debtPayments.some((dp) => dp.id === id)) {
          this.debtPayments.delete(id);
        }
      }
      for (const dp of debtPayments) {
        this.debtPayments.set(dp.id, dp);
      }
    }
  }

  async saveCustomConceptAndEntry(
    _uid: string,
    concept: Concept,
    entry: MonthEntry,
    debtPayments?: DebtPayment[]
  ): Promise<void> {
    this.concepts.set(concept.id, concept);
    this.entries.set(entry.id, entry);
    if (debtPayments) {
      for (const dp of debtPayments) {
        this.debtPayments.set(dp.id, dp);
      }
    }
  }

  async saveConcept(_uid: string, concept: Concept): Promise<void> {
    this.concepts.set(concept.id, { ...concept });
  }

  async deleteConcept(_uid: string, conceptId: string): Promise<void> {
    this.concepts.delete(conceptId);
  }

  async saveDebt(_uid: string, debt: Debt): Promise<void> {
    const list = this.debtsByMonth.get(debt.monthKey) ?? [];
    const idx = list.findIndex((d) => d.id === debt.id);
    if (idx >= 0) {
      list[idx] = { ...debt };
    } else {
      list.push({ ...debt });
    }
    this.debtsByMonth.set(debt.monthKey, list);

    // Propagate updated debt metadata (interest rates, installment, name, lender) across other tracked months
    for (const [mk, monthDebts] of this.debtsByMonth.entries()) {
      if (mk === debt.monthKey) continue;
      if (!monthDebts.some((d) => d.id === debt.id)) continue;
      this.debtsByMonth.set(
        mk,
        monthDebts.map((d) =>
          d.id === debt.id
            ? {
                ...d,
                name: debt.name,
                lender: debt.lender,
                groupKey: debt.groupKey,
                ...(debt.monthlyInterestRate !== undefined
                  ? { monthlyInterestRate: debt.monthlyInterestRate }
                  : {}),
                ...(debt.annualInterestRate !== undefined
                  ? { annualInterestRate: debt.annualInterestRate }
                  : {}),
                ...(debt.interestRateType ? { interestRateType: debt.interestRateType } : {}),
                ...(debt.monthlyInstallment !== undefined
                  ? { monthlyInstallment: debt.monthlyInstallment }
                  : {}),
              }
            : d
        )
      );
    }
  }

  async deleteDebt(_uid: string, debtId: string): Promise<void> {
    for (const [mk, list] of this.debtsByMonth.entries()) {
      this.debtsByMonth.set(
        mk,
        list.filter((d) => d.id !== debtId)
      );
    }
    // ADR 0035: same cascade as Firestore.
    for (const [id, concept] of this.concepts.entries()) {
      if (concept.defaultTargetDebtId !== debtId) continue;
      const { defaultTargetDebtId: _removed, ...rest } = concept;
      this.concepts.set(id, rest);
    }
    for (const [id, payment] of this.debtPayments.entries()) {
      if (payment.debtId === debtId) {
        this.debtPayments.delete(id);
      }
    }
  }

  async saveFinancialAccount(_uid: string, account: FinancialAccount): Promise<void> {
    this.financialAccounts.set(account.id, { ...account });
  }

  async deleteFinancialAccount(_uid: string, accountId: string): Promise<void> {
    this.financialAccounts.delete(accountId);
  }

  async saveSavingsBucket(
    _uid: string,
    bucketId: string,
    openingBalanceCop: number,
    monthKey: string = '2026-10',
    bucketName?: string
  ): Promise<void> {
    const list = ensureStandardSavingsBuckets(
      this.savingsBucketsByMonth.get(monthKey) ?? []
    );
    const normalizedOpening = Math.max(0, Math.round(openingBalanceCop));
    const exists = list.some((b) => b.id === bucketId);
    const updated = exists
      ? list.map((b) =>
          b.id === bucketId
            ? {
                ...b,
                name: bucketName ?? b.name,
                openingBalance: normalizedOpening,
                monthKey,
              }
            : b
        )
      : [
          ...list,
          {
            id: bucketId,
            name: bucketName ?? bucketId,
            openingBalance: normalizedOpening,
            monthKey,
          },
        ];
    this.savingsBucketsByMonth.set(monthKey, updated);
  }

  async deleteSavingsBucket(_uid: string, bucketId: string): Promise<void> {
    for (const [mk, list] of this.savingsBucketsByMonth.entries()) {
      this.savingsBucketsByMonth.set(
        mk,
        list.filter((b) => b.id !== bucketId)
      );
    }
    // ADR 0035: same cascade as Firestore.
    for (const [id, concept] of this.concepts.entries()) {
      if (concept.savingsContribution?.bucketId !== bucketId) continue;
      const { savingsContribution: _removed, ...rest } = concept;
      this.concepts.set(id, rest);
    }
  }

  async saveProvisionPlan(_uid: string, plan: IdealMotoPlan): Promise<void> {
    this.provisionPlan = {
      items: plan.items.map((item) => ({ ...item })),
      recurringMonthlyTotalCop: plan.recurringMonthlyTotalCop,
      totalWithTargetGoalCop: plan.totalWithTargetGoalCop,
    };
  }

  async saveInitialAccountSetup(
    uid: string,
    payload: InitialAccountSetupPayload
  ): Promise<void> {
    this.concepts.clear();
    this.entries.clear();
    this.debtsByMonth.clear();
    this.debtPayments.clear();
    this.savingsBucketsByMonth.clear();
    this.snapshots.clear();

    for (const c of payload.concepts) {
      this.concepts.set(c.id, { ...c });
    }
    for (const e of payload.entries) {
      this.entries.set(e.id, { ...e });
    }
    this.debtsByMonth.set(
      payload.monthKey,
      payload.debts.map((d) => ({ ...d }))
    );
    for (const dp of payload.debtPayments) {
      this.debtPayments.set(dp.id, { ...dp });
    }
    this.savingsBucketsByMonth.set(
      payload.monthKey,
      ensureStandardSavingsBuckets(payload.savingsBuckets)
    );
    this.provisionPlan = {
      items: payload.provisionPlan.items.map((i) => ({ ...i })),
      recurringMonthlyTotalCop: payload.provisionPlan.recurringMonthlyTotalCop,
      totalWithTargetGoalCop: payload.provisionPlan.totalWithTargetGoalCop,
    };
    this.resetUsers.delete(uid);
    this.onboardedUsers.add(uid);
    this.activeMonthByUser.set(uid, payload.monthKey);
  }

  async saveActiveMonthKey(uid: string, monthKey: string): Promise<void> {
    this.activeMonthByUser.set(uid, monthKey);
  }

  async saveUserProfile(uid: string, profile: UserProfileFields): Promise<void> {
    this.profilesByUser.set(uid, { ...profile });
  }

  /** Perfil guardado con `saveUserProfile` (solo para pruebas). */
  getUserProfile(uid: string): UserProfileFields | undefined {
    return this.profilesByUser.get(uid);
  }

  async resetFullAccountInCloud(uid: string, newStartMonthKey: string): Promise<void> {
    this.concepts.clear();
    this.entries.clear();
    this.debtsByMonth.clear();
    this.debtPayments.clear();
    this.savingsBucketsByMonth.clear();
    this.snapshots.clear();
    this.financialAccounts.clear();
    this.provisionPlan = { ...EMPTY_PROVISION_PLAN, items: [] };
    this.seededUsers.delete(uid);
    this.onboardedUsers.delete(uid);
    this.resetUsers.add(uid);
    this.activeMonthByUser.set(uid, newStartMonthKey);
    this.savingsBucketsByMonth.set(newStartMonthKey, ensureStandardSavingsBuckets([]));
  }

  async deleteEntryCompletely(_uid: string, entryId: string): Promise<void> {
    this.entries.delete(entryId);
    for (const [id, dp] of this.debtPayments.entries()) {
      if (dp.entryId === entryId) {
        this.debtPayments.delete(id);
      }
    }
  }

  async reopenMonthInCloud(uid: string, monthKey: string): Promise<void> {
    this.snapshots.delete(monthKey);
    this.activeMonthByUser.set(uid, monthKey);
  }

  async deleteMonthInCloud(
    uid: string,
    monthKey: string,
    fallbackMonthKey: string
  ): Promise<void> {
    this.snapshots.delete(monthKey);
    this.snapshots.delete(fallbackMonthKey);
    this.debtsByMonth.delete(monthKey);
    this.savingsBucketsByMonth.delete(monthKey);
    for (const [id, e] of this.entries.entries()) {
      if (e.monthKey === monthKey) {
        this.entries.delete(id);
      }
    }
    for (const [id, dp] of this.debtPayments.entries()) {
      if (dp.monthKey === monthKey) {
        this.debtPayments.delete(id);
      }
    }
    this.activeMonthByUser.set(uid, fallbackMonthKey);
  }
}
