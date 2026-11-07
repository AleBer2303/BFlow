/**
 * src/features/budget/store/slices/createBudgetSlice.ts
 *
 * Concepts, movements/entries, monthly closure and rollover slice.
 */

import {
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
} from '../../../../data/repositories/budgetRepository';
import {
  buildDebtPaymentsForInstallment,
  closeMonthAndRollover,
  deleteMovement,
  getMonthNumberFromMonthKey,
  registerMovement,
  toAppIsoDate,
  toggleMovementStatus,
  type Concept,
  type DebtPayment,
  type MonthEntry,
} from '../../../../domain';
import { savePersistedSession } from '../../../../platform/auth/authAdapter';
import {
  applyConceptLinkageUpdates,
  buildInitialState,
  isRealAuthUser,
  triggerWidgetSync,
  type BudgetSlice,
  type SliceCreator,
} from './sliceTypes';

export const createBudgetSlice: SliceCreator<BudgetSlice> = (set, get) => {
  const initial = buildInitialState();
  return {
    concepts: initial.concepts,
    entries: initial.entries,
    closedSnapshots: initial.closedSnapshots,

  toggleEntryStatus: async (entryId, completedAtDateIso = toAppIsoDate()) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

    const nextEntries = toggleMovementStatus(state.entries, entryId, {
      completedAt: completedAtDateIso,
    });

    const updatedEntry = nextEntries.find((e) => e.id === entryId);
    const concept = state.concepts.find((c) => c.id === target.conceptId);

    let nextDebtPayments = state.debtPayments;
    if ((concept?.linkedDebtGroup || concept?.defaultTargetDebtId) && updatedEntry) {
      const monthDebts =
        state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
      const cascadedPayments = buildDebtPaymentsForInstallment(
        updatedEntry,
        monthDebts,
        undefined,
        concept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (updatedEntry && isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          concept,
          nextDebtPayments.filter((dp) => dp.entryId === entryId)
        );
      } catch {
        // Rollback optimistic update if cloud write fails
        set({
          entries: previousEntries,
          debtPayments: previousDebtPayments,
          syncMessage: 'Error de sincronización. No se pudo guardar el cambio en la nube.',
        });
        triggerWidgetSync(get());
      }
    }
  },

  addOrCompleteMovement: async (input) => {
    const state = get();
    const previousConcepts = state.concepts;
    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

    const monthDebts =
      state.debtsByMonth[input.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    let concept = state.concepts.find((c) => c.id === input.conceptId);
    let nextConcepts = state.concepts;

    if (
      concept &&
      (input.targetDebtId !== undefined || input.savingsBucketId !== undefined)
    ) {
      concept = applyConceptLinkageUpdates(concept, input.monthKey, monthDebts, {
        targetDebtId: input.targetDebtId,
        savingsBucketId: input.savingsBucketId,
      });
      nextConcepts = state.concepts.map((c) => (c.id === concept!.id ? concept! : c));
    }

    const nextEntries = registerMovement(state.entries, nextConcepts, input);
    const updatedEntry = nextEntries.find(
      (e) =>
        e.monthKey === input.monthKey &&
        e.conceptId === input.conceptId &&
        (!state.entries.some((prev) => prev.id === e.id && prev.status === 'completed') ||
          !concept?.allowMultiplePerMonth)
    );

    let nextDebtPayments = state.debtPayments;
    if ((concept?.linkedDebtGroup || concept?.defaultTargetDebtId) && updatedEntry) {
      const cascadedPayments = buildDebtPaymentsForInstallment(
        updatedEntry,
        monthDebts,
        undefined,
        concept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
    }

    set({
      concepts: nextConcepts,
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (updatedEntry && isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          concept,
          nextDebtPayments.filter((dp) => dp.entryId === updatedEntry.id)
        );
      } catch {
        // Rollback optimistic update if cloud write fails
        set({
          concepts: previousConcepts,
          entries: previousEntries,
          debtPayments: previousDebtPayments,
          syncMessage: 'Error de conexión. No se pudo registrar el movimiento en la nube.',
        });
        triggerWidgetSync(get());
      }
    }
  },

  createCustomConceptAndMovement: async (input) => {
    const state = get();
    const rawAmount = input.amount ?? input.amountCop ?? 0;
    const safeAmount = Math.max(0, Math.round(rawAmount));
    const trimmedName = input.name.trim();
    if (!trimmedName || safeAmount <= 0) return;

    const monthDebts =
      state.debtsByMonth[input.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const customConceptId = `${input.type === 'income' ? 'inc' : 'exp'}_custom_${slug}_${Date.now().toString(36)}`;
    const baseConcept: Concept = {
      id: customConceptId,
      name: trimmedName,
      type: input.type,
      group: input.group,
      defaultAmount: safeAmount,
      recurrence:
        input.persistMonthly === false
          ? { kind: 'specific_months', months: [getMonthNumberFromMonthKey(input.monthKey)] }
          : { kind: 'monthly' },
      allowMultiplePerMonth: false,
      archived: false,
      order: state.concepts.length + 1,
    };

    const newConcept = applyConceptLinkageUpdates(
      baseConcept,
      input.monthKey,
      monthDebts,
      {
        targetDebtId: input.targetDebtId,
        savingsBucketId: input.savingsBucketId,
        persistMonthly: input.persistMonthly,
      }
    );

    const isCompleted = input.markCompleted !== false;
    const newEntry: MonthEntry = {
      id: `${input.monthKey}_${customConceptId}`,
      monthKey: input.monthKey,
      conceptId: customConceptId,
      conceptName: trimmedName,
      type: input.type,
      group: input.group,
      plannedAmount: safeAmount,
      actualAmount: safeAmount,
      status: isCompleted ? 'completed' : 'pending',
      ...(isCompleted ? { completedAt: toAppIsoDate() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };

    let createdPayments: DebtPayment[] = [];
    let nextDebtPayments = state.debtPayments;
    if (newConcept.linkedDebtGroup || newConcept.defaultTargetDebtId) {
      createdPayments = buildDebtPaymentsForInstallment(
        newEntry,
        monthDebts,
        undefined,
        newConcept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== newEntry.id),
        ...createdPayments,
      ];
    }

    set({
      concepts: [...state.concepts, newConcept],
      entries: [...state.entries, newEntry],
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveCustomConceptAndEntry(
          state.authUser.uid,
          newConcept,
          newEntry,
          createdPayments
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  updateConcept: async (conceptId, updates) => {
    const state = get();
    const target = state.concepts.find((c) => c.id === conceptId);
    if (!target) return;

    const monthDebts =
      state.debtsByMonth[state.activeMonthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const baseUpdated: Concept = {
      ...target,
      ...(updates.name?.trim() ? { name: updates.name.trim() } : {}),
      ...(updates.defaultAmount !== undefined
        ? { defaultAmount: Math.max(0, Math.round(updates.defaultAmount)) }
        : {}),
      ...(updates.group ? { group: updates.group } : {}),
    };

    const updatedConcept = applyConceptLinkageUpdates(
      baseUpdated,
      state.activeMonthKey,
      monthDebts,
      {
        targetDebtId: updates.targetDebtId,
        savingsBucketId: updates.savingsBucketId,
        persistMonthly: updates.persistMonthly,
      }
    );

    const nextConcepts = state.concepts.map((c) => (c.id === conceptId ? updatedConcept : c));
    const nextEntries = state.entries.map((entry) => {
      if (entry.conceptId !== conceptId) return entry;
      return {
        ...entry,
        conceptName: updatedConcept.name,
        group: updatedConcept.group,
        ...(entry.status === 'pending' && updates.defaultAmount !== undefined
          ? {
              plannedAmount: updatedConcept.defaultAmount,
              actualAmount: updatedConcept.defaultAmount,
            }
          : {}),
      };
    });

    let nextDebtPayments = state.debtPayments;
    const activeEntry = nextEntries.find(
      (e) => e.conceptId === conceptId && e.monthKey === state.activeMonthKey
    );
    if (activeEntry && updates.targetDebtId !== undefined) {
      if (updatedConcept.linkedDebtGroup || updatedConcept.defaultTargetDebtId) {
        const cascaded = buildDebtPaymentsForInstallment(
          activeEntry,
          monthDebts,
          undefined,
          updatedConcept.defaultTargetDebtId
        );
        nextDebtPayments = [
          ...state.debtPayments.filter((dp) => dp.entryId !== activeEntry.id),
          ...cascaded,
        ];
      } else {
        nextDebtPayments = state.debtPayments.filter((dp) => dp.entryId !== activeEntry.id);
      }
    }

    set({
      concepts: nextConcepts,
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        if (activeEntry) {
          await repo.saveOrUpdateEntry(
            state.authUser.uid,
            activeEntry,
            updatedConcept,
            nextDebtPayments.filter((dp) => dp.entryId === activeEntry.id)
          );
        } else {
          await repo.saveConcept(state.authUser.uid, updatedConcept);
        }
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteConcept: async (conceptId) => {
    const state = get();
    const nextConcepts = state.concepts.filter((c) => c.id !== conceptId);
    const nextEntries = state.entries.filter(
      (e) => !(e.conceptId === conceptId && e.status === 'pending')
    );

    set({
      concepts: nextConcepts,
      entries: nextEntries,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteConcept(state.authUser.uid, conceptId);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  editEntry: async (entryId, updates) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const safeActual = Math.max(0, Math.round(updates.actualAmount));
    const safePlanned =
      updates.plannedAmount !== undefined
        ? Math.max(0, Math.round(updates.plannedAmount))
        : safeActual;
    const nextName = updates.conceptName.trim() || target.conceptName;
    const trimmedNote = updates.note?.trim();

    const updatedEntry: MonthEntry = {
      ...target,
      conceptName: nextName,
      actualAmount: safeActual,
      plannedAmount: safePlanned,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };
    if (!trimmedNote && 'note' in updatedEntry) {
      delete (updatedEntry as { note?: string }).note;
    }

    const monthDebts =
      state.debtsByMonth[updatedEntry.monthKey] ?? state.debtsByMonth['2026-10'] ?? [];
    const existingConcept = state.concepts.find((c) => c.id === target.conceptId);
    const updatedConcept = existingConcept
      ? applyConceptLinkageUpdates(
          {
            ...existingConcept,
            name: nextName,
            defaultAmount: safePlanned,
          },
          updatedEntry.monthKey,
          monthDebts,
          {
            targetDebtId: updates.targetDebtId,
            savingsBucketId: updates.savingsBucketId,
            persistMonthly: updates.persistMonthly,
          }
        )
      : undefined;

    const nextEntries = state.entries.map((e) => (e.id === entryId ? updatedEntry : e));
    const nextConcepts = state.concepts.map((c) =>
      c.id === target.conceptId && updatedConcept ? updatedConcept : c
    );

    let nextDebtPayments = state.debtPayments;
    let entryPaymentsForCloud: DebtPayment[] | undefined;

    if (updatedConcept?.linkedDebtGroup || updatedConcept?.defaultTargetDebtId) {
      const cascadedPayments = buildDebtPaymentsForInstallment(
        updatedEntry,
        monthDebts,
        undefined,
        updatedConcept.defaultTargetDebtId
      );
      nextDebtPayments = [
        ...state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id),
        ...cascadedPayments,
      ];
      entryPaymentsForCloud = cascadedPayments;
    } else if (updates.targetDebtId === null || updates.targetDebtId === '') {
      nextDebtPayments = state.debtPayments.filter((dp) => dp.entryId !== updatedEntry.id);
      entryPaymentsForCloud = [];
    }

    set({
      entries: nextEntries,
      concepts: nextConcepts,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveOrUpdateEntry(
          state.authUser.uid,
          updatedEntry,
          updatedConcept,
          entryPaymentsForCloud ?? nextDebtPayments.filter((dp) => dp.entryId === entryId)
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteEntryById: async (entryId) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    if (!target) return;

    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

    const nextEntries = state.entries.filter((e) => e.id !== entryId);
    const nextDebtPayments = state.debtPayments.filter((dp) => dp.entryId !== entryId);

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteEntryCompletely(state.authUser.uid, entryId);
      } catch {
        // Rollback optimistic deletion if cloud write fails
        set({
          entries: previousEntries,
          debtPayments: previousDebtPayments,
          syncMessage: 'Error de conexión. No se pudo eliminar la entrada en la nube.',
        });
        triggerWidgetSync(get());
      }
    }
  },

  removeOrResetEntry: async (entryId) => {
    const state = get();
    const target = state.entries.find((e) => e.id === entryId);
    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

    const nextEntries = deleteMovement(state.entries, state.concepts, entryId);
    const concept = target ? state.concepts.find((c) => c.id === target.conceptId) : undefined;

    let nextDebtPayments = state.debtPayments;
    if (target && (concept?.linkedDebtGroup || concept?.defaultTargetDebtId)) {
      nextDebtPayments = state.debtPayments.map((dp) => {
        if (dp.entryId !== entryId) return dp;
        const { completedAt: _removed, ...restPayment } = dp;
        return {
          ...restPayment,
          principalAmount: target.plannedAmount,
          totalApplied: target.plannedAmount + dp.interestAmount,
          active: false,
        };
      });
    }

    set({
      entries: nextEntries,
      debtPayments: nextDebtPayments,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteOrResetEntry(state.authUser.uid, entryId);
      } catch {
        // Rollback optimistic reset if cloud write fails
        set({
          entries: previousEntries,
          debtPayments: previousDebtPayments,
          syncMessage: 'Error de conexión. No se pudo restablecer la entrada en la nube.',
        });
        triggerWidgetSync(get());
      }
    }
  },

  closeCurrentMonth: async (closedAtIso = new Date().toISOString()) => {
    const state = get();
    const currentMonthKey = state.activeMonthKey;
    const currentDebts = state.debtsByMonth[currentMonthKey] ?? [];
    const currentBuckets = ensureStandardSavingsBuckets(
      state.savingsBucketsByMonth[currentMonthKey] ?? []
    );
    const currentDebtPayments = state.debtPayments.filter(
      (dp) => dp.monthKey === currentMonthKey
    );

    const result = closeMonthAndRollover({
      closingMonthKey: currentMonthKey,
      closedAtIso,
      concepts: state.concepts,
      entries: state.entries,
      debts: currentDebts,
      debtPayments: currentDebtPayments,
      savingsBuckets: currentBuckets,
    });

    const otherMonthsEntries = state.entries.filter((e) => e.monthKey !== result.nextMonthKey);
    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: result.nextMonthKey }
      : null;

    set({
      activeMonthKey: result.nextMonthKey,
      availableMonths: state.availableMonths.includes(result.nextMonthKey)
        ? state.availableMonths
        : [...state.availableMonths, result.nextMonthKey],
      entries: [...otherMonthsEntries, ...result.nextMonthEntries],
      debtsByMonth: {
        ...state.debtsByMonth,
        [result.nextMonthKey]: result.nextMonthDebts,
      },
      savingsBucketsByMonth: {
        ...state.savingsBucketsByMonth,
        [result.nextMonthKey]: result.nextMonthSavingsBuckets,
      },
      closedSnapshots: {
        ...state.closedSnapshots,
        [currentMonthKey]: result.snapshot,
      },
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.persistMonthCloseResult(state.authUser.uid, currentMonthKey, result);
      } catch {
        set({ syncMessage: '' });
      }
    }

    return result;
  },

  reopenClosedMonth: async (monthKey) => {
    const state = get();
    const nextClosedSnapshots = { ...state.closedSnapshots };
    delete nextClosedSnapshots[monthKey];

    set({
      activeMonthKey: monthKey,
      closedSnapshots: nextClosedSnapshots,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.reopenMonthInCloud(state.authUser.uid, monthKey);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  deleteOrRevertMonth: async (monthKey) => {
    const state = get();
    const sortedMonths = [...state.availableMonths].sort();

    if (sortedMonths.length <= 1) {
      const nextSnapshots = { ...state.closedSnapshots };
      delete nextSnapshots[monthKey];
      set({
        activeMonthKey: monthKey,
        closedSnapshots: nextSnapshots,
      });
      triggerWidgetSync(get());
      if (isRealAuthUser(state.authUser)) {
        try {
          const repo = new FirestoreBudgetRepository();
          await repo.reopenMonthInCloud(state.authUser.uid, monthKey);
        } catch {
          // Non-fatal
        }
      }
      return;
    }

    const remainingMonths = sortedMonths.filter((m) => m !== monthKey);
    const targetIndex = sortedMonths.indexOf(monthKey);
    const fallbackMonth =
      remainingMonths[Math.max(0, targetIndex - 1)] ?? remainingMonths[0] ?? '2026-10';

    const nextDebtsByMonth = { ...state.debtsByMonth };
    delete nextDebtsByMonth[monthKey];

    const nextSavingsByMonth = { ...state.savingsBucketsByMonth };
    delete nextSavingsByMonth[monthKey];

    const nextSnapshots = { ...state.closedSnapshots };
    delete nextSnapshots[monthKey];
    delete nextSnapshots[fallbackMonth];

    set({
      activeMonthKey: fallbackMonth,
      availableMonths: remainingMonths,
      entries: state.entries.filter((e) => e.monthKey !== monthKey),
      debtsByMonth: nextDebtsByMonth,
      savingsBucketsByMonth: nextSavingsByMonth,
      debtPayments: state.debtPayments.filter((dp) => dp.monthKey !== monthKey),
      closedSnapshots: nextSnapshots,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteMonthInCloud(state.authUser.uid, monthKey, fallbackMonth);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  resetToOctober2026GoldenState: () => {
    const currentUser = get().authUser;
    set(buildInitialState(currentUser));
    triggerWidgetSync(get());
  },
};
};
