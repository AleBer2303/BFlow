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
import { clearPersistedAccount } from '../../../../platform/storage/accountCache';
import { executeOptimisticCloudWrite } from '../../../../platform/storage/offlineWriteQueue';
import {
  applyConceptLinkageUpdates,
  buildInitialState,
  buildOctober2026SeedWorkspaceState,
  isRealAuthUser,
  resolveDefaultInitialAuthUser,
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

    const authUser = state.authUser;
    if (updatedEntry && isRealAuthUser(authUser)) {
      await executeOptimisticCloudWrite({
        uid: authUser.uid,
        operation: {
          type: 'save_or_update_entry',
          payload: {
            entry: updatedEntry,
            concept,
            debtPayments: nextDebtPayments.filter((dp) => dp.entryId === entryId),
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveOrUpdateEntry(
            authUser.uid,
            updatedEntry,
            concept,
            nextDebtPayments.filter((dp) => dp.entryId === entryId)
          );
        },
        rollback: () => {
          set({
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'Error de sincronización. No se pudo guardar el cambio en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
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

    const authUser = state.authUser;
    if (updatedEntry && isRealAuthUser(authUser)) {
      const entryPayments = nextDebtPayments.filter((dp) => dp.entryId === updatedEntry.id);
      await executeOptimisticCloudWrite({
        uid: authUser.uid,
        operation: {
          type: 'save_or_update_entry',
          payload: {
            entry: updatedEntry,
            concept,
            debtPayments: entryPayments,
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveOrUpdateEntry(
            authUser.uid,
            updatedEntry,
            concept,
            entryPayments
          );
        },
        rollback: () => {
          set({
            concepts: previousConcepts,
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'Error de conexión. No se pudo registrar el movimiento en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  createCustomConceptAndMovement: async (input) => {
    const state = get();
    const previousConcepts = state.concepts;
    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

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

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      await executeOptimisticCloudWrite({
        uid: authUser.uid,
        operation: {
          type: 'save_custom_concept_and_entry',
          payload: {
            concept: newConcept,
            entry: newEntry,
            createdPayments,
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveCustomConceptAndEntry(
            authUser.uid,
            newConcept,
            newEntry,
            createdPayments
          );
        },
        rollback: () => {
          set({
            concepts: previousConcepts,
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'No se pudo guardar el concepto personalizado en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  updateConcept: async (conceptId, updates) => {
    const state = get();
    const previousConcepts = state.concepts;
    const previousEntries = state.entries;
    const previousDebtPayments = state.debtPayments;

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

    const updateAuthUser = state.authUser;
    if (isRealAuthUser(updateAuthUser)) {
      await executeOptimisticCloudWrite({
        uid: updateAuthUser.uid,
        operation: {
          type: activeEntry ? 'save_or_update_entry' : 'save_concept',
          payload: activeEntry
            ? {
                entry: activeEntry,
                concept: updatedConcept,
                debtPayments: nextDebtPayments.filter((dp) => dp.entryId === activeEntry.id),
              }
            : { concept: updatedConcept },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          if (activeEntry) {
            await repo.saveOrUpdateEntry(
              updateAuthUser.uid,
              activeEntry,
              updatedConcept,
              nextDebtPayments.filter((dp) => dp.entryId === activeEntry.id)
            );
          } else {
            await repo.saveConcept(updateAuthUser.uid, updatedConcept);
          }
        },
        rollback: () => {
          set({
            concepts: previousConcepts,
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'No se pudo actualizar el concepto en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  deleteConcept: async (conceptId) => {
    const state = get();
    const previousConcepts = state.concepts;
    const previousEntries = state.entries;

    const nextConcepts = state.concepts.filter((c) => c.id !== conceptId);
    const nextEntries = state.entries.filter(
      (e) => !(e.conceptId === conceptId && e.status === 'pending')
    );

    set({
      concepts: nextConcepts,
      entries: nextEntries,
    });
    triggerWidgetSync(get());

    const deleteAuthUser = state.authUser;
    if (isRealAuthUser(deleteAuthUser)) {
      await executeOptimisticCloudWrite({
        uid: deleteAuthUser.uid,
        operation: {
          type: 'delete_concept',
          payload: { conceptId },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.deleteConcept(deleteAuthUser.uid, conceptId);
        },
        rollback: () => {
          set({
            concepts: previousConcepts,
            entries: previousEntries,
          });
        },
        friendlyErrorMessage: 'No se pudo eliminar el concepto en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  editEntry: async (entryId, updates) => {
    const state = get();
    const previousEntries = state.entries;
    const previousConcepts = state.concepts;
    const previousDebtPayments = state.debtPayments;

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

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      const paymentsForSync =
        entryPaymentsForCloud ?? nextDebtPayments.filter((dp) => dp.entryId === entryId);
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_or_update_entry',
          payload: {
            entry: updatedEntry,
            concept: updatedConcept,
            debtPayments: paymentsForSync,
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveOrUpdateEntry(
            uid,
            updatedEntry,
            updatedConcept,
            paymentsForSync
          );
        },
        rollback: () => {
          set({
            entries: previousEntries,
            concepts: previousConcepts,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'Error de sincronización. No se pudo editar el movimiento en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
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

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'delete_or_reset_entry',
          payload: {
            entryId,
            conceptId: target.conceptId,
            monthKey: target.monthKey,
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.deleteEntryCompletely(uid, entryId);
        },
        rollback: () => {
          set({
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'Error de conexión. No se pudo eliminar la entrada en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
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

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'delete_or_reset_entry',
          payload: {
            entryId,
            conceptId: target?.conceptId ?? '',
            monthKey: target?.monthKey ?? '',
          },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.deleteOrResetEntry(uid, entryId);
        },
        rollback: () => {
          set({
            entries: previousEntries,
            debtPayments: previousDebtPayments,
          });
        },
        friendlyErrorMessage: 'Error de conexión. No se pudo restablecer la entrada en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
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

    const previousClosedSnapshots = state.closedSnapshots;
    const previousUser = state.authUser;
    const previousMonthKey = state.activeMonthKey;
    const previousAvailableMonths = state.availableMonths;
    const previousEntries = state.entries;
    const previousDebtsByMonth = state.debtsByMonth;
    const previousSavingsBucketsByMonth = state.savingsBucketsByMonth;

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

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'persist_month_close',
          payload: { monthKey: currentMonthKey, result },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.persistMonthCloseResult(uid, currentMonthKey, result);
        },
        rollback: () => {
          set({
            activeMonthKey: previousMonthKey,
            availableMonths: previousAvailableMonths,
            entries: previousEntries,
            debtsByMonth: previousDebtsByMonth,
            savingsBucketsByMonth: previousSavingsBucketsByMonth,
            closedSnapshots: previousClosedSnapshots,
            ...(previousUser ? { authUser: previousUser } : {}),
          });
        },
        friendlyErrorMessage: 'No se pudo registrar el cierre del mes en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }

    return result;
  },

  reopenClosedMonth: async (monthKey) => {
    const state = get();
    const previousClosedSnapshots = state.closedSnapshots;
    const previousActiveMonth = state.activeMonthKey;

    const nextClosedSnapshots = { ...state.closedSnapshots };
    delete nextClosedSnapshots[monthKey];

    set({
      activeMonthKey: monthKey,
      closedSnapshots: nextClosedSnapshots,
    });
    triggerWidgetSync(get());

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'reopen_month',
          payload: { monthKey },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.reopenMonthInCloud(uid, monthKey);
        },
        rollback: () => {
          set({
            activeMonthKey: previousActiveMonth,
            closedSnapshots: previousClosedSnapshots,
          });
        },
        friendlyErrorMessage: 'No se pudo reabrir el mes en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  deleteOrRevertMonth: async (monthKey) => {
    const state = get();
    const previousState = {
      activeMonthKey: state.activeMonthKey,
      availableMonths: state.availableMonths,
      entries: state.entries,
      debtsByMonth: state.debtsByMonth,
      savingsBucketsByMonth: state.savingsBucketsByMonth,
      debtPayments: state.debtPayments,
      closedSnapshots: state.closedSnapshots,
    };

    const sortedMonths = [...state.availableMonths].sort();

    if (sortedMonths.length <= 1) {
      const nextSnapshots = { ...state.closedSnapshots };
      delete nextSnapshots[monthKey];
      set({
        activeMonthKey: monthKey,
        closedSnapshots: nextSnapshots,
      });
      triggerWidgetSync(get());
      const authUser = state.authUser;
      if (isRealAuthUser(authUser)) {
        const uid = authUser.uid;
        await executeOptimisticCloudWrite({
          uid,
          operation: {
            type: 'reopen_month',
            payload: { monthKey },
          },
          performCloudWrite: async () => {
            const repo = new FirestoreBudgetRepository();
            await repo.reopenMonthInCloud(uid, monthKey);
          },
          rollback: () => {
            set(previousState);
          },
          friendlyErrorMessage: 'No se pudo restablecer el mes en la nube.',
          setStoreState: set,
          onWidgetSync: () => triggerWidgetSync(get()),
        });
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

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'delete_month',
          payload: { monthKey, fallbackMonth },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.deleteMonthInCloud(uid, monthKey, fallbackMonth);
        },
        rollback: () => {
          set(previousState);
        },
        friendlyErrorMessage: 'No se pudo revertir el mes en la nube.',
        setStoreState: set,
        onWidgetSync: () => triggerWidgetSync(get()),
      });
    }
  },

  resetToOctober2026GoldenState: () => {
    const currentUser = get().authUser;
    if (currentUser?.uid) {
      clearPersistedAccount(currentUser.uid);
    }
    set(buildOctober2026SeedWorkspaceState(currentUser ?? resolveDefaultInitialAuthUser()));
    triggerWidgetSync(get());
  },
};
};
