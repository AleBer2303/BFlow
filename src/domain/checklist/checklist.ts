/**
 * src/domain/checklist/checklist.ts
 *
 * Pure functions implementing the core "Monthly Checklist" rules:
 * - Deterministic entry IDs `${monthKey}_${conceptId}` for single-occurrence concepts.
 * - Idempotent `ensureMonthPlan` respecting `recurrence` and excluding `allowMultiplePerMonth`.
 * - `getAvailableConcepts`: hides completed single-occurrence concepts for that month,
 *   keeps pending concepts and `allowMultiplePerMonth` concepts available.
 * - `calculateChecklistProgress`: counts only non-repeatable concepts (`6 / 12` in Oct 2026).
 */

import { assertValidMonthKey } from '../date/monthKey';
import {
  ChecklistProgress,
  Concept,
  ConceptType,
  MonthEntry,
  MonthNumber,
} from '../models/types';
import { assertSafeMoneyInteger } from '../money/money';

export function getDeterministicEntryId(monthKey: string, conceptId: string): string {
  assertValidMonthKey(monthKey);
  if (!conceptId.trim()) {
    throw new TypeError('conceptId must be a non-empty string');
  }
  return `${monthKey}_${conceptId}`;
}

export function getMonthNumberFromMonthKey(monthKey: string): MonthNumber {
  assertValidMonthKey(monthKey);
  const monthPart = Number(monthKey.split('-')[1]);
  return monthPart as MonthNumber;
}

export function isConceptActiveInMonth(concept: Concept, monthKey: string): boolean {
  assertValidMonthKey(monthKey);
  if (concept.archived) {
    return false;
  }
  if (concept.recurrence.kind === 'monthly') {
    return true;
  }
  const monthNum = getMonthNumberFromMonthKey(monthKey);
  return concept.recurrence.months.includes(monthNum);
}

/**
 * Idempotently ensures a `pending` MonthEntry exists for every active concept
 * whose `recurrence` includes `monthKey` and where `allowMultiplePerMonth === false`.
 * Also deduplicates concurrent/offline entries sharing the same deterministic ID
 * (keeping `completed` status if one replica was already completed).
 */
export function ensureMonthPlan(
  monthKey: string,
  concepts: readonly Concept[],
  existingEntries: readonly MonthEntry[]
): MonthEntry[] {
  assertValidMonthKey(monthKey);

  // Deduplicate existing entries by ID (if offline sync produced duplicates, completed wins)
  const byId = new Map<string, MonthEntry>();
  for (const entry of existingEntries) {
    const prev = byId.get(entry.id);
    if (!prev || (prev.status === 'pending' && entry.status === 'completed')) {
      byId.set(entry.id, entry);
    }
  }

  const sortedConcepts = [...concepts].sort((a, b) => a.order - b.order);

  for (const concept of sortedConcepts) {
    if (concept.allowMultiplePerMonth) {
      continue;
    }
    if (!isConceptActiveInMonth(concept, monthKey)) {
      continue;
    }

    const deterministicId = getDeterministicEntryId(monthKey, concept.id);
    const hasEntryForConceptInMonth = Array.from(byId.values()).some(
      (e) => e.monthKey === monthKey && e.conceptId === concept.id
    );

    if (!hasEntryForConceptInMonth) {
      byId.set(deterministicId, {
        id: deterministicId,
        monthKey,
        conceptId: concept.id,
        conceptName: concept.name,
        type: concept.type,
        group: concept.group,
        plannedAmount: assertSafeMoneyInteger(concept.defaultAmount, 'defaultAmount'),
        actualAmount: assertSafeMoneyInteger(concept.defaultAmount, 'defaultAmount'),
        status: 'pending',
      });
    }
  }

  return Array.from(byId.values());
}

/**
 * Returns the concepts available to select in "Add Movement" for a given month and type.
 * A concept is available if:
 * - It is not archived, matches `type`, and its recurrence is active in `monthKey`
 *   (or it already has a pending entry in `monthKey`, e.g. historical October 2026 Prima), AND
 * - Either `allowMultiplePerMonth === true`, OR it has NO `completed` entry in `monthKey`.
 */
export function getAvailableConcepts(
  concepts: readonly Concept[],
  entries: readonly MonthEntry[],
  monthKey: string,
  type: ConceptType
): Concept[] {
  assertValidMonthKey(monthKey);

  const monthEntries = entries.filter((e) => e.monthKey === monthKey);

  return [...concepts]
    .filter((concept) => {
      if (concept.archived || concept.type !== type) {
        return false;
      }
      if (concept.allowMultiplePerMonth) {
        return true;
      }

      const conceptEntriesInMonth = monthEntries.filter((e) => e.conceptId === concept.id);
      const hasCompleted = conceptEntriesInMonth.some((e) => e.status === 'completed');
      if (hasCompleted) {
        return false;
      }

      const hasPendingInMonth = conceptEntriesInMonth.some((e) => e.status === 'pending');
      return hasPendingInMonth || isConceptActiveInMonth(concept, monthKey);
    })
    .sort((a, b) => a.order - b.order);
}

export interface RegisterOrCompleteMovementInput {
  monthKey: string;
  conceptId: string;
  actualAmount?: number;
  completedAt: string;
  note?: string;
  customEntryId?: string;
}

/**
 * Registers or completes a movement for `monthKey`:
 * - For standard (`!allowMultiplePerMonth`) concepts: updates existing pending entry (or creates
 *   deterministic entry) as `completed` with `actualAmount` (defaulting to `plannedAmount`).
 * - For `allowMultiplePerMonth` concepts: appends a new `completed` entry (or updates an existing
 *   zero-amount placeholder row if one was imported from Excel).
 */
export function registerMovement(
  entries: readonly MonthEntry[],
  concepts: readonly Concept[],
  input: RegisterOrCompleteMovementInput
): MonthEntry[] {
  assertValidMonthKey(input.monthKey);
  const concept = concepts.find((c) => c.id === input.conceptId);
  if (!concept) {
    throw new Error(`Concept "${input.conceptId}" not found`);
  }

  const resolvedAmount = assertSafeMoneyInteger(
    input.actualAmount ?? concept.defaultAmount,
    'movement actualAmount'
  );

  if (!concept.allowMultiplePerMonth) {
    const existingCompleted = entries.find(
      (e) =>
        e.monthKey === input.monthKey &&
        e.conceptId === concept.id &&
        e.status === 'completed'
    );
    if (existingCompleted) {
      throw new Error(
        `Concept "${concept.name}" is already completed in ${input.monthKey} and does not allow multiple entries per month.`
      );
    }

    const deterministicId = getDeterministicEntryId(input.monthKey, concept.id);
    const existingPendingIdx = entries.findIndex(
      (e) => e.monthKey === input.monthKey && e.conceptId === concept.id
    );

    if (existingPendingIdx >= 0) {
      return entries.map((entry, idx) =>
        idx === existingPendingIdx
          ? {
              ...entry,
              actualAmount: resolvedAmount,
              status: 'completed',
              completedAt: input.completedAt,
              ...(input.note !== undefined ? { note: input.note } : {}),
            }
          : entry
      );
    }

    return [
      ...entries,
      {
        id: deterministicId,
        monthKey: input.monthKey,
        conceptId: concept.id,
        conceptName: concept.name,
        type: concept.type,
        group: concept.group,
        plannedAmount: concept.defaultAmount,
        actualAmount: resolvedAmount,
        status: 'completed',
        completedAt: input.completedAt,
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    ];
  }

  // allowMultiplePerMonth === true:
  const entryId =
    input.customEntryId ?? `${input.monthKey}_${concept.id}_${entries.length + 1}`;
  return [
    ...entries,
    {
      id: entryId,
      monthKey: input.monthKey,
      conceptId: concept.id,
      conceptName: concept.name,
      type: concept.type,
      group: concept.group,
      plannedAmount: resolvedAmount,
      actualAmount: resolvedAmount,
      status: 'completed',
      completedAt: input.completedAt,
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  ];
}

/**
 * Unchecks a completed movement back to `pending` (restoring its availability in the checklist).
 */
export function uncompleteMovement(
  entries: readonly MonthEntry[],
  entryId: string
): MonthEntry[] {
  return entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    const { completedAt: _removed, ...rest } = entry;
    return {
      ...rest,
      actualAmount: entry.plannedAmount,
      status: 'pending',
    };
  });
}

/**
 * Deletes a movement:
 * - If the concept is repeatable (`allowMultiplePerMonth`), removes the entry completely.
 * - If the concept is part of the monthly checklist (`!allowMultiplePerMonth`), resets it to `pending`
 *   so the checklist item remains trackable and becomes available again.
 */
export function deleteMovement(
  entries: readonly MonthEntry[],
  concepts: readonly Concept[],
  entryId: string
): MonthEntry[] {
  const target = entries.find((e) => e.id === entryId);
  if (!target) return [...entries];

  const concept = concepts.find((c) => c.id === target.conceptId);
  if (concept?.allowMultiplePerMonth) {
    return entries.filter((e) => e.id !== entryId);
  }
  return uncompleteMovement(entries, entryId);
}

/**
 * Calculates checklist progress for a given month.
 * Rule: Only concepts with `allowMultiplePerMonth === false` count toward checklist progress.
 * In October 2026: 6 of 12 completed (2 incomes + 10 expenses).
 */
export function calculateChecklistProgress(
  concepts: readonly Concept[],
  entries: readonly MonthEntry[],
  monthKey: string
): ChecklistProgress {
  assertValidMonthKey(monthKey);
  const nonRepeatableIds = new Set(
    concepts.filter((c) => !c.archived && !c.allowMultiplePerMonth).map((c) => c.id)
  );

  const trackableEntries = entries.filter(
    (e) => e.monthKey === monthKey && nonRepeatableIds.has(e.conceptId)
  );

  const totalTrackableCount = trackableEntries.length;
  const completedCount = trackableEntries.filter((e) => e.status === 'completed').length;
  const pendingCount = totalTrackableCount - completedCount;
  const completionRatio = totalTrackableCount === 0 ? 1 : completedCount / totalTrackableCount;
  const completionPercentage = Math.round(completionRatio * 100);

  return {
    monthKey,
    completedCount,
    totalTrackableCount,
    pendingCount,
    completionRatio,
    completionPercentage,
    isMonthComplete: totalTrackableCount > 0 && completedCount === totalTrackableCount,
  };
}
