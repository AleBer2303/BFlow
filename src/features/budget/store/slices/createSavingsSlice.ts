/**
 * src/features/budget/store/slices/createSavingsSlice.ts
 *
 * Savings buckets, opening balances and savings contribution linkages slice.
 */

import {
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
} from '../../../../data/repositories/budgetRepository';
import { type SavingsBucket } from '../../../../domain';
import {
  buildInitialState,
  isRealAuthUser,
  triggerWidgetSync,
  type SavingsSlice,
  type SliceCreator,
} from './sliceTypes';

export const createSavingsSlice: SliceCreator<SavingsSlice> = (set, get) => {
  const initial = buildInitialState();
  return {
    savingsBucketsByMonth: initial.savingsBucketsByMonth,

  updateSavingsOpeningBalance: async (monthKey, bucketId, newBalanceCop, bucketName) => {
    const state = get();
    const safeAmount = Math.max(0, Math.round(newBalanceCop));
    const monthBuckets = ensureStandardSavingsBuckets(
      state.savingsBucketsByMonth[monthKey] ?? []
    );
    const targetBucket = monthBuckets.find((b) => b.id === bucketId);
    const resolvedName = bucketName?.trim() || targetBucket?.name || bucketId;
    const nextBuckets = targetBucket
      ? monthBuckets.map((b) =>
          b.id === bucketId
            ? { ...b, name: resolvedName, openingBalance: safeAmount, monthKey }
            : b
        )
      : [
          ...monthBuckets,
          { id: bucketId, name: resolvedName, openingBalance: safeAmount, monthKey },
        ];

    const nextSavingsByMonth: Record<string, SavingsBucket[]> = {
      ...state.savingsBucketsByMonth,
      [monthKey]: nextBuckets,
    };
    for (const [mk, list] of Object.entries(nextSavingsByMonth)) {
      if (mk === monthKey) continue;
      if (!list.some((b) => b.id === bucketId)) continue;
      nextSavingsByMonth[mk] = list.map((b) =>
        b.id === bucketId ? { ...b, name: resolvedName } : b
      );
    }

    set({
      savingsBucketsByMonth: nextSavingsByMonth,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveSavingsBucket(
          state.authUser.uid,
          bucketId,
          safeAmount,
          monthKey,
          resolvedName
        );
      } catch {
        set({ syncMessage: '' });
      }
    }
  },

  createSavingsBucket: async (monthKey, name, openingBalanceCop) => {
    const state = get();
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const safeAmount = Math.max(0, Math.round(openingBalanceCop));
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const bucketId = `bucket_${slug || 'ahorro'}_${Date.now().toString(36)}`;
    const newBucket: SavingsBucket = {
      id: bucketId,
      name: trimmedName,
      openingBalance: safeAmount,
      monthKey,
    };

    const monthBuckets = ensureStandardSavingsBuckets(
      state.savingsBucketsByMonth[monthKey] ?? []
    );
    const nextBuckets = [...monthBuckets, newBucket];

    set({
      savingsBucketsByMonth: {
        ...state.savingsBucketsByMonth,
        [monthKey]: nextBuckets,
      },
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveSavingsBucket(
          state.authUser.uid,
          bucketId,
          safeAmount,
          monthKey,
          trimmedName
        );
      } catch {
        set({ syncMessage: '' });
      }
    }

    return newBucket;
  },

  deleteSavingsBucket: async (monthKey, bucketId) => {
    const state = get();
    const nextSavingsByMonth: Record<string, SavingsBucket[]> = {};
    for (const [mk, list] of Object.entries(state.savingsBucketsByMonth)) {
      nextSavingsByMonth[mk] = list.filter((b) => b.id !== bucketId);
    }
    if (!nextSavingsByMonth[monthKey]) {
      nextSavingsByMonth[monthKey] = [];
    }

    const nextConcepts = state.concepts.map((c) => {
      if (c.savingsContribution?.bucketId !== bucketId) return c;
      const { savingsContribution: _removed, ...rest } = c;
      return rest;
    });

    set({
      concepts: nextConcepts,
      savingsBucketsByMonth: nextSavingsByMonth,
    });
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.deleteSavingsBucket(state.authUser.uid, bucketId);
      } catch {
        set({ syncMessage: '' });
      }
    }
  },
};
};
