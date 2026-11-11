/**
 * src/features/budget/store/slices/createProvisionsSlice.ts
 *
 * Provision plan, recurring funds and target goals slice.
 */

import {
  EMPTY_PROVISION_PLAN,
  FirestoreBudgetRepository,
} from '../../../../data/repositories/budgetRepository';
import { type ProvisionItemSpec } from '../../../../domain';
import { executeOptimisticCloudWrite } from '../../../../platform/storage/offlineWriteQueue';
import {
  buildInitialState,
  isRealAuthUser,
  persistHydratedAccountSnapshot,
  recalculateProvisionPlan,
  type ProvisionsSlice,
  type SliceCreator,
} from './sliceTypes';

export const createProvisionsSlice: SliceCreator<ProvisionsSlice> = (set, get) => {
  const initial = buildInitialState();
  return {
    idealMotoPlan: initial.idealMotoPlan,

  saveProvisionItem: async (input) => {
    const state = get();
    const trimmedName = input.name.trim();
    const safeAmount = Math.max(0, Math.round(input.amount));
    const safePeriodMonths = Math.max(1, Math.round(input.periodMonths));
    if (!trimmedName || safeAmount <= 0) return;

    const monthlyContribution = Math.ceil(safeAmount / safePeriodMonths);
    const itemId =
      input.id ??
      `prov_${trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}_${Date.now().toString(36)}`;

    const nextItem: ProvisionItemSpec = {
      id: itemId,
      excelRawName: trimmedName,
      displayName: trimmedName,
      monthlyAmountCop: monthlyContribution,
      cycleCostCop: safeAmount,
      periodMonths: safePeriodMonths,
      ceilMonthlyCop: monthlyContribution,
      ...(input.kind === 'target_goal' ? { targetAmountCop: safeAmount } : {}),
      includedInExcelTotalB43: input.kind === 'recurring',
      kind: input.kind === 'target_goal' ? 'target_goal' : 'recurring_provision',
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };

    const existingItems = state.idealMotoPlan.items;
    const previousPlan = state.idealMotoPlan;
    const exists = existingItems.some((i) => i.id === itemId);
    const nextItems = exists
      ? existingItems.map((i) => (i.id === itemId ? nextItem : i))
      : [...existingItems, nextItem];

    const nextPlan = recalculateProvisionPlan(nextItems);
    set({ idealMotoPlan: nextPlan });
    persistHydratedAccountSnapshot(get());

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_provision_plan',
          payload: { plan: nextPlan },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveProvisionPlan(uid, nextPlan);
        },
        rollback: () => {
          set({ idealMotoPlan: previousPlan });
          persistHydratedAccountSnapshot(get());
        },
        friendlyErrorMessage: 'No se pudo guardar la provisión en la nube.',
        setStoreState: set,
      });
    }
  },

  deleteProvisionItem: async (itemId) => {
    const state = get();
    const previousPlan = state.idealMotoPlan;
    const nextItems = state.idealMotoPlan.items.filter((i) => i.id !== itemId);
    const nextPlan = recalculateProvisionPlan(nextItems);
    set({ idealMotoPlan: nextPlan });
    persistHydratedAccountSnapshot(get());

    const authUser = state.authUser;
    if (isRealAuthUser(authUser)) {
      const uid = authUser.uid;
      await executeOptimisticCloudWrite({
        uid,
        operation: {
          type: 'save_provision_plan',
          payload: { plan: nextPlan },
        },
        performCloudWrite: async () => {
          const repo = new FirestoreBudgetRepository();
          await repo.saveProvisionPlan(uid, nextPlan);
        },
        rollback: () => {
          set({ idealMotoPlan: previousPlan });
          persistHydratedAccountSnapshot(get());
        },
        friendlyErrorMessage: 'No se pudo eliminar la provisión en la nube.',
        setStoreState: set,
      });
    }
  },
};
};
