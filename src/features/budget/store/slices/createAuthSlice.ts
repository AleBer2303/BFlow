/**
 * src/features/budget/store/slices/createAuthSlice.ts
 *
 * Authentication, profile management and initial onboarding slice.
 */

import {
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  FirestoreBudgetRepository,
  isOwnerCanonicalEmail,
  type InitialAccountSetupPayload,
} from '../../../../data/repositories/budgetRepository';
import {
  buildDebtPaymentsForInstallment,
  getMonthNumberFromMonthKey,
  toAppIsoDate,
  toAppMonthKey,
  type Concept,
  type Debt,
  type DebtInterestRateType,
  type DebtPayment,
  type MonthEntry,
  type ProvisionItemSpec,
  type SavingsBucket,
} from '../../../../domain';
import {
  savePersistedSession,
  type BFlowAuthUser,
} from '../../../../platform/auth/authAdapter';
import { isDemoModeEnabled } from '../../../../platform/mode/demoMode';
import {
  clearPersistedAccount,
  loadPersistedAccount,
} from '../../../../platform/storage/accountCache';
import {
  clearOfflineWriteQueue,
  isPermanentCloudError,
} from '../../../../platform/storage/offlineWriteQueue';
import {
  buildCleanEmptyWorkspaceState,
  buildHydratedWorkspaceState,
  buildInitialState,
  isRealAuthUser,
  recalculateProvisionPlan,
  triggerWidgetSync,
  type AuthSlice,
  type SliceCreator,
} from './sliceTypes';

export const createAuthSlice: SliceCreator<AuthSlice> = (set, get) => {
  const initial = buildInitialState();
  return {
    authUser: initial.authUser,
    needsOnboarding: initial.needsOnboarding,

  setAuthUser: (user) => {
    const prevUser = get().authUser;
    if (!user) {
      set(buildCleanEmptyWorkspaceState(null));
      return;
    }
    const isSwitchingAccount =
      !prevUser ||
      prevUser.uid !== user.uid ||
      (prevUser.email ?? '').trim().toLowerCase() !== (user.email ?? '').trim().toLowerCase();

    const cachedAccount =
      user.uid && user.uid !== 'local-owner' && user.uid !== 'local-demo'
        ? loadPersistedAccount(user.uid)
        : null;

    if (isSwitchingAccount) {
      if (cachedAccount) {
        set(buildHydratedWorkspaceState(user, cachedAccount));
      } else if (
        (process.env.NODE_ENV === 'test' || isDemoModeEnabled()) &&
        isOwnerCanonicalEmail(user.email)
      ) {
        set(buildInitialState(user));
      } else {
        const isLiveRuntime = process.env.NODE_ENV !== 'test' && !isDemoModeEnabled();
        set({
          ...buildCleanEmptyWorkspaceState(user),
          isAccountHydrated: !isLiveRuntime,
          isSyncing: isLiveRuntime,
        });
      }
      return;
    }

    if (!get().isAccountHydrated && cachedAccount) {
      set(buildHydratedWorkspaceState(user, cachedAccount));
      return;
    }

    set({ authUser: user });
  },

  updateAuthUserProfile: async (updates) => {
    const current = get().authUser;
    if (!current) return;
    const updatedUser: BFlowAuthUser = {
      ...current,
      ...(updates.displayName !== undefined
        ? { displayName: updates.displayName.trim() || current.displayName }
        : {}),
      ...(updates.email !== undefined ? { email: updates.email.trim() || current.email } : {}),
      ...(updates.financialGoal !== undefined ? { financialGoal: updates.financialGoal.trim() } : {}),
    };
    savePersistedSession(updatedUser);
    set({ authUser: updatedUser });
  },

  clearWorkspaceSession: () => {
    const prevUid = get().authUser?.uid;
    if (prevUid) {
      clearPersistedAccount(prevUid);
      clearOfflineWriteQueue(prevUid);
    }
    set(buildCleanEmptyWorkspaceState(null));
  },

  requireAuthenticationGate: () => set(buildCleanEmptyWorkspaceState(null)),

  setNeedsOnboarding: (needsOnboarding) => set({ needsOnboarding }),

  completeInitialAccountSetup: async (input) => {
    const state = get();
    const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(input.monthKey)
      ? input.monthKey
      : `${toAppMonthKey().slice(0, 4)}-01`;

    // 1. Build savings buckets (always ensuring standard buckets)
    const rawBuckets: SavingsBucket[] = input.savingsBuckets
      .filter((b) => b.name.trim().length > 0)
      .map((b, idx) => {
        const slug = b.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        return {
          id: b.id ?? `bucket_${slug || idx}_${idx + 1}`,
          name: b.name.trim(),
          openingBalance: Math.max(0, Math.round(b.openingBalanceCop)),
          monthKey,
        };
      });
    const savingsBuckets = ensureStandardSavingsBuckets(rawBuckets, 0, 0);

    // 2. Build debts
    const debtIdByKey = new Map<string, Debt>();
    const debts: Debt[] = input.debts
      .filter((d) => d.name.trim().length > 0 && d.openingBalanceCop > 0)
      .map((d, idx) => {
        const slug = d.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        const id = d.key || `debt_${slug || 'personal'}_${idx + 1}`;
        const rateType: DebtInterestRateType = d.interestRateType ?? 'monthly';
        const rawRate = d.interestRate ?? 0;
        const monthlyInterestRate =
          rateType === 'annual' ? Number((rawRate / 12).toFixed(4)) : rawRate;
        const annualInterestRate =
          rateType === 'annual' ? rawRate : Number((rawRate * 12).toFixed(4));
        const monthlyInstallment = Math.max(0, Math.round(d.monthlyInstallmentCop ?? 0));

        const built: Debt = {
          id,
          groupKey: 'PERSONAL',
          name: d.name.trim(),
          lender: d.lender.trim() || 'Entidad',
          openingBalance: Math.max(0, Math.round(d.openingBalanceCop)),
          monthKey,
          interestRateType: rateType,
          monthlyInterestRate,
          annualInterestRate,
          ...(monthlyInstallment > 0 ? { monthlyInstallment } : {}),
        };
        if (d.key) {
          debtIdByKey.set(d.key, built);
        }
        debtIdByKey.set(id, built);
        return built;
      });

    // 3. Build income and expense concepts & entries
    const concepts: Concept[] = [];
    const entries: MonthEntry[] = [];
    const debtPayments: DebtPayment[] = [];
    let orderCounter = 1;

    for (const inc of input.incomes) {
      const trimmedName = inc.name.trim();
      const safeAmount = Math.max(0, Math.round(inc.amountCop));
      if (!trimmedName || safeAmount <= 0) continue;

      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const conceptId = `inc_${slug || orderCounter}_${orderCounter}`;
      const concept: Concept = {
        id: conceptId,
        name: trimmedName,
        type: 'income',
        group: inc.group,
        defaultAmount: safeAmount,
        recurrence: inc.persistMonthly
          ? { kind: 'monthly' }
          : { kind: 'specific_months', months: [getMonthNumberFromMonthKey(monthKey)] },
        allowMultiplePerMonth: false,
        archived: false,
        order: orderCounter++,
      };
      concepts.push(concept);

      const isCompleted = inc.completed === true;
      entries.push({
        id: `${monthKey}_${conceptId}`,
        monthKey,
        conceptId,
        conceptName: trimmedName,
        type: 'income',
        group: inc.group,
        plannedAmount: safeAmount,
        actualAmount: safeAmount,
        status: isCompleted ? 'completed' : 'pending',
        ...(isCompleted ? { completedAt: toAppIsoDate() } : {}),
      });
    }

    const explicitlyLinkedDebtIds = new Set<string>();

    for (const exp of input.expenses) {
      const trimmedName = exp.name.trim();
      const safeAmount = Math.max(0, Math.round(exp.amountCop));
      if (!trimmedName || safeAmount <= 0) continue;

      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const conceptId = `exp_${slug || orderCounter}_${orderCounter}`;

      const linkedDebt = exp.targetDebtKey ? debtIdByKey.get(exp.targetDebtKey) : undefined;
      if (linkedDebt) {
        explicitlyLinkedDebtIds.add(linkedDebt.id);
      }

      const concept: Concept = {
        id: conceptId,
        name: trimmedName,
        type: 'expense',
        group: exp.group,
        defaultAmount: safeAmount,
        recurrence: exp.persistMonthly
          ? { kind: 'monthly' }
          : { kind: 'specific_months', months: [getMonthNumberFromMonthKey(monthKey)] },
        allowMultiplePerMonth: false,
        archived: false,
        order: orderCounter++,
        ...(linkedDebt
          ? {
              linkedDebtGroup: linkedDebt.groupKey,
              defaultTargetDebtId: linkedDebt.id,
            }
          : {}),
        ...(exp.savingsBucketKey
          ? {
              savingsContribution: {
                bucketId: exp.savingsBucketKey,
                onlyWhenCompleted: true,
              },
            }
          : {}),
      };
      concepts.push(concept);

      const isCompleted = exp.completed === true;
      const entry: MonthEntry = {
        id: `${monthKey}_${conceptId}`,
        monthKey,
        conceptId,
        conceptName: trimmedName,
        type: 'expense',
        group: exp.group,
        plannedAmount: safeAmount,
        actualAmount: safeAmount,
        status: isCompleted ? 'completed' : 'pending',
        ...(isCompleted ? { completedAt: toAppIsoDate() } : {}),
      };
      entries.push(entry);

      if (linkedDebt) {
        const payments = buildDebtPaymentsForInstallment(
          entry,
          debts,
          undefined,
          linkedDebt.id
        );
        debtPayments.push(...payments);
      }
    }

    // 4. Auto-create installment expenses for debts with monthlyInstallment > 0
    for (const debt of debts) {
      if (
        debt.monthlyInstallment &&
        debt.monthlyInstallment > 0 &&
        !explicitlyLinkedDebtIds.has(debt.id)
      ) {
        const conceptId = `exp_cuota_${debt.id}`;
        const conceptName = `Cuota ${debt.name}`;
        const concept: Concept = {
          id: conceptId,
          name: conceptName,
          type: 'expense',
          group: 'fixed',
          defaultAmount: debt.monthlyInstallment,
          recurrence: { kind: 'monthly' },
          allowMultiplePerMonth: false,
          archived: false,
          order: orderCounter++,
          linkedDebtGroup: debt.groupKey,
          defaultTargetDebtId: debt.id,
        };
        concepts.push(concept);

        const entry: MonthEntry = {
          id: `${monthKey}_${conceptId}`,
          monthKey,
          conceptId,
          conceptName,
          type: 'expense',
          group: 'fixed',
          plannedAmount: debt.monthlyInstallment,
          actualAmount: debt.monthlyInstallment,
          status: 'pending',
        };
        entries.push(entry);

        const payments = buildDebtPaymentsForInstallment(entry, debts, undefined, debt.id);
        debtPayments.push(...payments);
      }
    }

    // 5. Build provisions plan
    const provisionItems: ProvisionItemSpec[] = (input.provisions ?? [])
      .filter((p) => p.name.trim().length > 0 && p.amountCop > 0)
      .map((p, idx) => {
        const safeAmount = Math.max(0, Math.round(p.amountCop));
        const safeMonths = Math.max(1, Math.round(p.periodMonths));
        const monthlyContribution = Math.ceil(safeAmount / safeMonths);
        const trimmedName = p.name.trim();
        return {
          id: `prov_${idx + 1}_${Date.now().toString(36)}`,
          excelRawName: trimmedName,
          displayName: trimmedName,
          monthlyAmountCop: monthlyContribution,
          cycleCostCop: safeAmount,
          periodMonths: safeMonths,
          ceilMonthlyCop: monthlyContribution,
          ...(p.kind === 'target_goal' ? { targetAmountCop: safeAmount } : {}),
          includedInExcelTotalB43: p.kind === 'recurring',
          kind: p.kind === 'target_goal' ? 'target_goal' : 'recurring_provision',
          ...(p.notes?.trim() ? { notes: p.notes.trim() } : {}),
        };
      });
    const provisionPlan = recalculateProvisionPlan(provisionItems);

    const payload: InitialAccountSetupPayload = {
      monthKey,
      concepts,
      entries,
      debts,
      debtPayments,
      savingsBuckets,
      provisionPlan,
    };

    const previousState = {
      activeTab: state.activeTab,
      activeMonthKey: state.activeMonthKey,
      availableMonths: state.availableMonths,
      concepts: state.concepts,
      entries: state.entries,
      debtsByMonth: state.debtsByMonth,
      debtPayments: state.debtPayments,
      savingsBucketsByMonth: state.savingsBucketsByMonth,
      idealMotoPlan: state.idealMotoPlan,
      closedSnapshots: state.closedSnapshots,
      needsOnboarding: state.needsOnboarding,
    };

    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: monthKey }
      : null;

    set({
      activeTab: 'summary',
      activeMonthKey: monthKey,
      availableMonths: [monthKey],
      concepts,
      entries,
      debtsByMonth: {
        [monthKey]: debts,
      },
      debtPayments,
      savingsBucketsByMonth: {
        [monthKey]: savingsBuckets,
      },
      idealMotoPlan: provisionPlan,
      closedSnapshots: {},
      isAccountHydrated: true,
      needsOnboarding: false,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.saveInitialAccountSetup(state.authUser.uid, payload);
      } catch (err) {
        if (isPermanentCloudError(err)) {
          set({
            ...previousState,
            syncMessage: 'No se pudo guardar la configuración inicial en la nube.',
          });
        } else {
          set({
            syncMessage: 'Configuración guardada localmente. Se sincronizará al conectar.',
          });
        }
      }
    }
  },

  resetFullAccount: async (newStartMonthKey) => {
    const state = get();
    const previousState = {
      activeTab: state.activeTab,
      activeMonthKey: state.activeMonthKey,
      availableMonths: state.availableMonths,
      concepts: state.concepts,
      entries: state.entries,
      debtsByMonth: state.debtsByMonth,
      debtPayments: state.debtPayments,
      savingsBucketsByMonth: state.savingsBucketsByMonth,
      idealMotoPlan: state.idealMotoPlan,
      closedSnapshots: state.closedSnapshots,
      needsOnboarding: state.needsOnboarding,
    };

    const startMonth =
      newStartMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(newStartMonthKey)
        ? newStartMonthKey
        : `${toAppMonthKey().slice(0, 4)}-01`;
    const emptyBuckets = ensureStandardSavingsBuckets([], 0, 0);
    const updatedUser = state.authUser
      ? { ...state.authUser, activeMonthKey: startMonth }
      : null;

    if (state.authUser?.uid) {
      clearPersistedAccount(state.authUser.uid);
      clearOfflineWriteQueue(state.authUser.uid);
    }

    set({
      activeTab: 'summary',
      activeMonthKey: startMonth,
      availableMonths: [startMonth],
      concepts: [],
      entries: [],
      debtsByMonth: {
        [startMonth]: [],
      },
      debtPayments: [],
      savingsBucketsByMonth: {
        [startMonth]: emptyBuckets,
      },
      idealMotoPlan: { ...EMPTY_PROVISION_PLAN, items: [] },
      closedSnapshots: {},
      isAccountHydrated: true,
      needsOnboarding: true,
      ...(updatedUser ? { authUser: updatedUser } : {}),
    });
    if (updatedUser && process.env.NODE_ENV !== 'test') {
      savePersistedSession(updatedUser);
    }
    triggerWidgetSync(get());
    if (state.authUser?.uid) {
      clearPersistedAccount(state.authUser.uid);
      clearOfflineWriteQueue(state.authUser.uid);
    }

    if (isRealAuthUser(state.authUser)) {
      try {
        const repo = new FirestoreBudgetRepository();
        await repo.resetFullAccountInCloud(state.authUser.uid, startMonth);
      } catch {
        set({
          ...previousState,
          syncMessage: 'El reseteo total de la cuenta requiere conexión a internet.',
        });
      }
    }
  },
  };
};
