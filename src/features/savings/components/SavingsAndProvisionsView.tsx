/**
 * src/features/savings/components/SavingsAndProvisionsView.tsx
 *
 * Implements Screen `08-savings` (Fondos de Ahorro & Metas/Provisiones Programadas):
 * - Memoized Hero Card Total Ahorros Acumulados
 * - Standard buckets (Fondo de Reserva, Fondo Ahorros) + user-created custom savings funds
 * - Savings bank accounts (ADR 0034): "+ Nuevo Ahorro" registers a fund or a savings account,
 *   listed under "Cuentas de ahorro" and edited or deleted with the same Editar / Eliminar modes
 * - Adjust opening/previous-month balances for all savings funds
 * - Full CRUD (Create, Edit, Update, Delete) for user-configurable Provisions & Target Goals
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  ActionModeToggleRow,
  animateNextLayout,
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  InlineItemActionPill,
  ResponsiveColumns,
  RevealDown,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  TabLeaveResetter,
  useAmountPrivacy,
  useBFlowTheme,
  usePrimaryActionLook,
  type ListActionMode,
} from '../../../design-system';
import { confirmDestructive } from '../../../platform/dialogs/confirmDestructive';
import {
  type FinancialAccount,
  type FinancialAccountsSummary,
  type ProvisionPlan,
  type MonthlySavingsSummary,
  type ProvisionPlanComparisonSummary,
} from '../../../domain';

type ProvisionPlanItem = ProvisionPlan['items'][number];
import type {
  FinancialAccountInput,
  FinancialAccountUpdates,
  SaveProvisionItemInput,
} from '../../budget/store/useBudgetStore';
import { FinancialAccountCard } from '../../accounts/components/FinancialAccountCard';
import { ProvisionItemForm, type EditableProvisionItem } from './ProvisionItemForm';
import { EditSavingsBucketForm, type EditableSavingsBucket } from './SavingsBucketForms';
import { SavingsForm } from './SavingsForm';

const SavingsHeroCard = React.memo(function SavingsHeroCard({
  activeBucketsCount,
  totalCurrentSavings,
  totalProjectedAfterPendingExpenses,
  savingsAccountsBalance,
}: {
  activeBucketsCount: number;
  totalCurrentSavings: number;
  totalProjectedAfterPendingExpenses: number;
  /** Balance of the savings bank accounts, shown apart from the funds (ADR 0034). */
  savingsAccountsBalance?: number;
}): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing } = useBFlowTheme();

  return (
    <ScrollDepthHero>
      <GlassSurface elevated testID="savings-hero-card">
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            <AppText variant="caption" color={colors.text.secondary}>
              Total Ahorros Acumulados
            </AppText>
            <StatusBadge label={` Fondos activos (${activeBucketsCount})`} status="savings" />
          </View>

          <CurrencyText
            testID="savings-hero-total"
            amount={totalCurrentSavings}
            variant="heroCurrency"
            tone="reserve"
          />

          <AppText variant="caption" color={colors.text.secondary}>
            {`Total proyectado tras pagar pendientes: ${formatAmount(totalProjectedAfterPendingExpenses)}`}
          </AppText>
          {savingsAccountsBalance !== undefined ? (
            <AppText
              testID="savings-hero-accounts-balance"
              variant="caption"
              color={colors.semantic.provisions}
            >
              {`En cuentas de ahorro: ${formatAmount(savingsAccountsBalance)}`}
            </AppText>
          ) : null}
        </View>
      </GlassSurface>
    </ScrollDepthHero>
  );
});

interface SavingsBucketsListProps {
  savingsSummary: MonthlySavingsSummary;
  hasSavingsAccounts: boolean;
  bucketActionMode: ListActionMode;
  canEditBucket: boolean;
  canDeleteBucket: boolean;
  onEditBucket: (bucketId: string, name: string, openingBalance: number) => void;
  onDeleteBucket: (bucketId: string) => void;
}

const SavingsBucketsList = React.memo(function SavingsBucketsList({
  savingsSummary,
  hasSavingsAccounts,
  bucketActionMode,
  canEditBucket,
  canDeleteBucket,
  onEditBucket,
  onDeleteBucket,
}: SavingsBucketsListProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing } = useBFlowTheme();

  const customBuckets = savingsSummary.customBuckets ?? [];
  const hasReserveBucket = savingsSummary.hasReserveBucket !== false;
  const hasSavingsBucket = savingsSummary.hasSavingsBucket !== false;
  const activeBucketsCount =
    (hasReserveBucket ? 1 : 0) + (hasSavingsBucket ? 1 : 0) + customBuckets.length;

  const renderBucketRowAction = (
    bucketId: string,
    name: string,
    openingBalance: number
  ): React.JSX.Element | null => (
    <InlineItemActionPill
      mode={bucketActionMode}
      itemName={name}
      editTestID={`edit-savings-bucket-${bucketId}`}
      deleteTestID={`delete-savings-bucket-${bucketId}`}
      onEdit={canEditBucket ? () => onEditBucket(bucketId, name, openingBalance) : undefined}
      onDelete={canDeleteBucket ? () => onDeleteBucket(bucketId) : undefined}
    />
  );

  return (
    <>
      {hasReserveBucket || hasSavingsBucket ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {hasReserveBucket ? (
            <GlassSurface style={{ flex: 1, minWidth: 200 }} testID="bucket-reserve-card">
              <View style={{ gap: spacing.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: spacing.xs,
                  }}
                >
                  <AppText variant="headline" style={{ flex: 1, minWidth: 120 }}>
                    {savingsSummary.reserve.name || 'Fondo de Reserva'}
                  </AppText>
                  {renderBucketRowAction(
                    savingsSummary.reserve.bucketId,
                    savingsSummary.reserve.name || 'Fondo de Reserva',
                    savingsSummary.reserve.openingBalance
                  )}
                </View>
                <CurrencyText
                  testID="bucket-reserve-current"
                  amount={savingsSummary.reserve.currentBalance}
                  variant="title2"
                  tone="reserve"
                />
                <AppText variant="micro" color={colors.text.secondary}>
                  {`Saldo mes anterior: ${formatAmount(savingsSummary.reserve.openingBalance)}`}
                </AppText>
                <AppText variant="micro" color={colors.semantic.income}>
                  {`+ Aportes pagados: ${formatAmount(savingsSummary.reserve.paidContributionsThisMonth)}`}
                </AppText>
              </View>
            </GlassSurface>
          ) : null}

          {hasSavingsBucket ? (
            <GlassSurface style={{ flex: 1, minWidth: 200 }} testID="bucket-savings-card">
              <View style={{ gap: spacing.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: spacing.xs,
                  }}
                >
                  <AppText variant="headline" style={{ flex: 1, minWidth: 120 }}>
                    {savingsSummary.savings.name || 'Fondo Ahorros'}
                  </AppText>
                  {renderBucketRowAction(
                    'savings',
                    savingsSummary.savings.name || 'Fondo Ahorros',
                    savingsSummary.savings.openingBalance
                  )}
                </View>
                <CurrencyText
                  testID="bucket-savings-current"
                  amount={savingsSummary.savings.currentBalance}
                  variant="title2"
                  tone="income"
                />
                <AppText variant="micro" color={colors.text.secondary}>
                  {`Saldo mes anterior: ${formatAmount(savingsSummary.savings.openingBalance)} + Flujo Neto ${formatAmount(savingsSummary.savings.netCashFlowContribution)}`}
                </AppText>
                <AppText variant="micro" color={colors.semantic.pending}>
                  {`Tras pendientes: ${formatAmount(savingsSummary.savings.projectedAfterPendingExpenses)}`}
                </AppText>
              </View>
            </GlassSurface>
          ) : null}
        </View>
      ) : null}

      {customBuckets.map((cb) => (
        <GlassSurface key={cb.id} testID={`bucket-custom-card-${cb.id}`}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.sm,
            }}
          >
            <View style={{ flex: 1, minWidth: 140, gap: spacing.xxs }}>
              <AppText variant="headline">{cb.name}</AppText>
              <CurrencyText amount={cb.currentBalance} variant="title2" tone="savings" />
              <AppText variant="micro" color={colors.text.secondary}>
                {`Saldo anterior: ${formatAmount(cb.openingBalance)} · + Aportes pagados: ${formatAmount(cb.paidContributionsThisMonth)}`}
              </AppText>
            </View>
            {renderBucketRowAction(cb.id, cb.name, cb.openingBalance)}
          </View>
        </GlassSurface>
      ))}

      {activeBucketsCount === 0 && !hasSavingsAccounts ? (
        <GlassSurface testID="empty-savings-buckets-card">
          <AppText variant="caption" color={colors.text.secondary}>
            No tienes ahorros creados aún. Usa &quot;+ Nuevo Ahorro&quot; para agregar un fondo o
            una cuenta de ahorros y vincularles movimientos.
          </AppText>
        </GlassSurface>
      ) : null}
    </>
  );
});

interface SavingsAccountsSectionProps {
  summary: FinancialAccountsSummary;
  actionMode: ListActionMode;
  onEdit: (accountId: string) => void;
  onDelete: (accountId: string, name: string) => void;
}

/** "Cuentas de ahorro": one card per savings bank account active in the month (ADR 0034). */
const SavingsAccountsSection = React.memo(function SavingsAccountsSection({
  summary,
  actionMode,
  onEdit,
  onDelete,
}: SavingsAccountsSectionProps): React.JSX.Element | null {
  const { colors, spacing } = useBFlowTheme();
  const { formatAmount } = useAmountPrivacy();
  if (!summary.hasAccounts) return null;

  return (
    <View style={{ gap: spacing.sm }} testID="savings-accounts-section">
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="headline">Cuentas de ahorro</AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {`Saldo total: ${formatAmount(summary.debit.closingBalance)} · Depósitos del mes: ${formatAmount(summary.debit.paidThisMonth)}`}
        </AppText>
      </View>
      {summary.accounts.map((account) => (
        <FinancialAccountCard
          key={account.accountId}
          summary={account}
          actionMode={actionMode}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
});

const ProvisionsCardHeader = React.memo(function ProvisionsCardHeader({
  provisionPlanSummary,
}: {
  provisionPlanSummary: ProvisionPlanComparisonSummary;
}): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { spacing } = useBFlowTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="title2">Provisiones y Metas</AppText>
      </View>
      <StatusBadge
        label={`Cuota mensual: ${formatAmount(provisionPlanSummary.recurringMonthlyTotalCop)}/mes`}
        status="provisions"
      />
    </View>
  );
});

interface ProvisionsItemsListProps {
  provisionPlanSummary: ProvisionPlanComparisonSummary;
  planItemById: ReadonlyMap<string, ProvisionPlanItem>;
  provisionActionMode: ListActionMode;
  canEditProvision: boolean;
  canDeleteProvision: boolean;
  onEditProvision: (item: EditableProvisionItem) => void;
  onDeleteProvision: (itemId: string) => void;
}

const ProvisionsItemsList = React.memo(function ProvisionsItemsList({
  provisionPlanSummary,
  planItemById,
  provisionActionMode,
  canEditProvision,
  canDeleteProvision,
  onEditProvision,
  onDeleteProvision,
}: ProvisionsItemsListProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius } = useBFlowTheme();

  const hasRecurring = provisionPlanSummary.recurringItems.length > 0;
  const hasGoals = provisionPlanSummary.targetGoals.length > 0;
  const hasProvisionItems = hasRecurring || hasGoals;

  const renderProvisionRowAction = (item: EditableProvisionItem): React.JSX.Element | null => (
    <InlineItemActionPill
      mode={provisionActionMode}
      itemName={item.name}
      editTestID={`edit-provision-${item.id}`}
      deleteTestID={`delete-provision-${item.id}`}
      onEdit={canEditProvision ? () => onEditProvision(item) : undefined}
      onDelete={canDeleteProvision ? () => onDeleteProvision(item.id) : undefined}
    />
  );

  return (
    <View style={{ gap: spacing.md }}>
      {!hasProvisionItems ? (
        <AppText variant="caption" color={colors.text.muted}>
          No tienes provisiones ni metas configuradas aún. Usa &quot;+ Agregar Metas&quot; para
          agregar las tuyas.
        </AppText>
      ) : null}

      {/* Target Goals */}
      {hasGoals ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="micro" color={colors.text.secondary}>
            Metas
          </AppText>
          {provisionPlanSummary.targetGoals.map((goal) => {
            const rawPlanItem = planItemById.get(goal.id);
            const actionButton = renderProvisionRowAction({
              id: goal.id,
              name: rawPlanItem?.displayName ?? goal.displayName,
              amount: goal.targetAmountCop,
              periodMonths: rawPlanItem?.periodMonths ?? goal.monthsUntilTarget ?? 1,
              kind: 'target_goal',
              notes: rawPlanItem?.notes ?? goal.notes,
            });
            return (
              <View
                key={goal.id}
                testID={`provision-target-goal-${goal.id}`}
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  backgroundColor: colors.semantic.provisionsSoft,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  gap: spacing.xs,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: spacing.xs,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <AppText variant="headline">{goal.displayName}</AppText>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: spacing.xs,
                    }}
                  >
                    <StatusBadge label={`Meta: ${goal.targetMonthKey}`} status="provisions" />
                    {actionButton}
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: spacing.xs,
                  }}
                >
                  <AppText variant="caption" color={colors.text.secondary}>
                    {`Objetivo: ${formatAmount(goal.targetAmountCop)} · ${goal.monthsUntilTarget} ${goal.monthsUntilTarget === 1 ? 'mes' : 'meses'}`}
                  </AppText>
                  <AppText variant="callout" tabularNums color={colors.semantic.provisions}>
                    {`${formatAmount(goal.suggestedMonthlySavingCop)}/mes`}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Recurring Provisions: single grouped container with hairline dividers */}
      {hasRecurring ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="micro" color={colors.text.secondary}>
            Provisiones mensuales
          </AppText>
          <View
            style={{
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
              overflow: 'hidden',
            }}
          >
            {provisionPlanSummary.recurringItems.map((item, index) => {
              const rawPlanItem = planItemById.get(item.id);
              const isLast = index === provisionPlanSummary.recurringItems.length - 1;
              const actionButton = renderProvisionRowAction({
                id: item.id,
                name: rawPlanItem?.displayName ?? item.displayName,
                amount: rawPlanItem?.cycleCostCop ?? item.cycleCostCop,
                periodMonths: item.periodMonths,
                kind: 'recurring',
                notes: rawPlanItem?.notes ?? item.notes,
              });
              return (
                <View
                  key={item.id}
                  testID={`provision-plan-item-${item.id}`}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: spacing.sm,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    ...(isLast
                      ? null
                      : {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.glass.subtleBorder,
                        }),
                  }}
                >
                  <View style={{ flex: 1, minWidth: 140, gap: spacing.xxs }}>
                    <AppText variant="body">{item.displayName}</AppText>
                    <AppText variant="micro" color={colors.text.secondary}>
                      {item.periodMonths > 1
                        ? `${formatAmount(item.cycleCostCop)} cada ${item.periodMonths} meses`
                        : item.actualBudgetedAmountCop !== undefined
                          ? `Presupuesto: ${formatAmount(item.actualBudgetedAmountCop)}`
                          : 'Mensual'}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <CurrencyText
                        amount={item.monthlyAmountCop}
                        variant="callout"
                        tone="provisions"
                      />
                    </View>
                    {actionButton}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
});

export interface SavingsAndProvisionsViewProps {
  savingsSummary: MonthlySavingsSummary;
  provisionPlanSummary: ProvisionPlanComparisonSummary;
  provisionPlan?: ProvisionPlan | ProvisionPlan;
  onUpdateOpeningBalance?: (
    bucketId: string,
    newBalanceCop: number,
    bucketName?: string
  ) => void;
  onCreateSavingsBucket?: (name: string, openingBalanceCop: number) => void;
  onDeleteSavingsBucket?: (bucketId: string) => void;
  onSaveProvisionItem?: (input: SaveProvisionItemInput) => void;
  onDeleteProvisionItem?: (itemId: string) => void;
  /** Savings bank accounts (ADR 0034). */
  savingsAccounts?: readonly FinancialAccount[];
  savingsAccountsSummary?: FinancialAccountsSummary;
  onCreateAccount?: (input: FinancialAccountInput) => void;
  onUpdateAccount?: (accountId: string, updates: FinancialAccountUpdates) => void;
  onDeleteAccount?: (accountId: string) => void;
}

const NO_ACCOUNTS: readonly FinancialAccount[] = [];

type ActiveSavingsForm =
  | { kind: 'add-bucket'; key: number }
  | { kind: 'edit-bucket'; bucket: EditableSavingsBucket; key: number }
  | { kind: 'edit-account'; account: FinancialAccount; key: number }
  | { kind: 'provision'; item: EditableProvisionItem | null; key: number }
  | null;

export function SavingsAndProvisionsView({
  savingsSummary,
  provisionPlanSummary,
  provisionPlan,
  onUpdateOpeningBalance,
  onCreateSavingsBucket,
  onDeleteSavingsBucket,
  onSaveProvisionItem,
  onDeleteProvisionItem,
  savingsAccounts = NO_ACCOUNTS,
  savingsAccountsSummary,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
}: SavingsAndProvisionsViewProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  // Single active form slot across both panels (R-17): at most one form is open at a time,
  // and each open remounts clean with a fresh key while memoized lists stay untouched.
  const [activeForm, setActiveForm] = useState<ActiveSavingsForm>(null);
  const [bucketActionMode, setBucketActionMode] = useState<ListActionMode>(null);
  const [provisionActionMode, setProvisionActionMode] = useState<ListActionMode>(null);
  const formKeyRef = useRef(0);

  const isAddingBucket = activeForm?.kind === 'add-bucket';
  const editingBucket = activeForm?.kind === 'edit-bucket' ? activeForm.bucket : null;
  const editingAccount = activeForm?.kind === 'edit-account' ? activeForm.account : null;
  const hasSavingsAccounts = Boolean(savingsAccountsSummary?.hasAccounts);
  const isProvisionFormOpen = activeForm?.kind === 'provision';
  const editingProvision = activeForm?.kind === 'provision' ? activeForm.item : null;

  const canManageProvisions = Boolean(onSaveProvisionItem || onDeleteProvisionItem);

  const planItemById = useMemo(
    () => new Map((provisionPlan?.items ?? []).map((item) => [item.id, item] as const)),
    [provisionPlan?.items]
  );

  const activeBucketsCount = useMemo(() => {
    const customCount = savingsSummary.customBuckets?.length ?? 0;
    const reserveCount = savingsSummary.hasReserveBucket !== false ? 1 : 0;
    const savingsCount = savingsSummary.hasSavingsBucket !== false ? 1 : 0;
    return reserveCount + savingsCount + customCount;
  }, [savingsSummary.customBuckets, savingsSummary.hasReserveBucket, savingsSummary.hasSavingsBucket]);

  const handleResetTransientState = useCallback(() => {
    setActiveForm(null);
    setBucketActionMode(null);
    setProvisionActionMode(null);
  }, []);

  useEffect(() => {
    handleResetTransientState();
  }, [savingsSummary.monthKey, handleResetTransientState]);

  const toggleBucketActionMode = useCallback((mode: Exclude<ListActionMode, null>) => {
    animateNextLayout();
    setBucketActionMode((prev) => {
      const next = prev === mode ? null : mode;
      if (mode === 'delete') {
        hapticService.trigger(prev === 'delete' ? 'light' : 'warning');
      } else {
        hapticService.selection();
      }
      if (next) {
        setActiveForm(null);
        setProvisionActionMode(null);
      }
      return next;
    });
  }, []);

  const toggleProvisionActionMode = useCallback((mode: Exclude<ListActionMode, null>) => {
    hapticService.selection();
    animateNextLayout();
    setProvisionActionMode((prev) => {
      const next = prev === mode ? null : mode;
      if (next) {
        setActiveForm(null);
        setBucketActionMode(null);
      }
      return next;
    });
  }, []);

  const handleToggleAddBucket = useCallback(() => {
    hapticService.light();
    setActiveForm((prev) => {
      if (prev?.kind === 'add-bucket') return null;
      setBucketActionMode(null);
      setProvisionActionMode(null);
      formKeyRef.current += 1;
      return { kind: 'add-bucket', key: formKeyRef.current };
    });
  }, []);

  const handleCloseActiveForm = useCallback(() => setActiveForm(null), []);

  const handleOpenEditBucket = useCallback(
    (bucketId: string, name: string, openingBalance: number) => {
      hapticService.light();
      setBucketActionMode(null);
      setProvisionActionMode(null);
      formKeyRef.current += 1;
      setActiveForm({
        kind: 'edit-bucket',
        bucket: { id: bucketId, name, openingBalance },
        key: formKeyRef.current,
      });
    },
    []
  );

  const handleDeleteBucket = useCallback(
    (bucketId: string) => {
      hapticService.trigger('warning');
      onDeleteSavingsBucket?.(bucketId);
      setActiveForm((prev) =>
        prev?.kind === 'edit-bucket' && prev.bucket.id === bucketId ? null : prev
      );
    },
    [onDeleteSavingsBucket]
  );

  const handleOpenEditAccount = useCallback(
    (accountId: string) => {
      const account = savingsAccounts.find((a) => a.id === accountId);
      if (!account) return;
      hapticService.light();
      setBucketActionMode(null);
      setProvisionActionMode(null);
      formKeyRef.current += 1;
      setActiveForm({ kind: 'edit-account', account, key: formKeyRef.current });
    },
    [savingsAccounts]
  );

  const handleDeleteAccount = useCallback(
    (accountId: string, name: string) => {
      confirmDestructive({
        title: 'Eliminar cuenta de ahorros',
        message: `¿Deseas eliminar "${name}"? Los movimientos vinculados se conservan, pero dejarán de sumar a esta cuenta.`,
        confirmLabel: 'Eliminar',
        onConfirm: () => {
          onDeleteAccount?.(accountId);
          setActiveForm((prev) =>
            prev?.kind === 'edit-account' && prev.account.id === accountId ? null : prev
          );
        },
      });
    },
    [onDeleteAccount]
  );

  const openProvisionForm = useCallback((item: EditableProvisionItem | null) => {
    hapticService.light();
    setBucketActionMode(null);
    setProvisionActionMode(null);
    formKeyRef.current += 1;
    setActiveForm({ kind: 'provision', item, key: formKeyRef.current });
  }, []);

  const handleToggleProvisionForm = useCallback(() => {
    hapticService.light();
    setActiveForm((prev) => {
      if (prev?.kind === 'provision') return null;
      setBucketActionMode(null);
      setProvisionActionMode(null);
      formKeyRef.current += 1;
      return { kind: 'provision', item: null, key: formKeyRef.current };
    });
  }, []);

  const handleDeleteProvision = useCallback(
    (itemId: string) => {
      hapticService.trigger('warning');
      onDeleteProvisionItem?.(itemId);
      setActiveForm((prev) =>
        prev?.kind === 'provision' && prev.item?.id === itemId ? null : prev
      );
    },
    [onDeleteProvisionItem]
  );

  const handleToggleEditBuckets = useCallback(
    () => toggleBucketActionMode('edit'),
    [toggleBucketActionMode]
  );
  const handleToggleDeleteBuckets = useCallback(
    () => toggleBucketActionMode('delete'),
    [toggleBucketActionMode]
  );
  const handleToggleEditProvisions = useCallback(
    () => toggleProvisionActionMode('edit'),
    [toggleProvisionActionMode]
  );
  const handleToggleDeleteProvisions = useCallback(
    () => toggleProvisionActionMode('delete'),
    [toggleProvisionActionMode]
  );

  return (
    <View style={{ gap: spacing.md }} testID="savings-and-provisions-view">
      {activeForm !== null || bucketActionMode !== null || provisionActionMode !== null ? (
        <TabLeaveResetter onLeave={handleResetTransientState} />
      ) : null}
      {/* Wide windows: funds on the left, provisions on the right. Phones stack them. */}
      <ResponsiveColumns testID="savings-panels">
        <View style={{ gap: spacing.md }}>
          {/* Screen 08: Hero Card Total Ahorros */}
          <SavingsHeroCard
            activeBucketsCount={activeBucketsCount}
            totalCurrentSavings={savingsSummary.totalCurrentSavings}
            totalProjectedAfterPendingExpenses={savingsSummary.totalProjectedAfterPendingExpenses}
            savingsAccountsBalance={
              hasSavingsAccounts ? savingsAccountsSummary?.debit.closingBalance : undefined
            }
          />

          {/* Add New Fund Button (directly below Total Ahorros Acumulados, above the funds list) */}
          <AppPressable
            testID="open-add-savings-bucket-button"
            accessibilityRole="button"
            accessibilityLabel={
              isAddingBucket ? 'Cerrar formulario de nuevo ahorro' : 'Nuevo ahorro'
            }
            onPress={handleToggleAddBucket}
            style={{
              minHeight: minTouchTarget,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.specularBorder,
              ...(isAddingBucket ? null : primaryAction.container),
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText
              variant="headline"
              color={
                isAddingBucket
                  ? colors.text.primary
                  : (primaryAction.labelColor ?? colors.text.primary)
              }
            >
              {isAddingBucket ? 'Cerrar' : '+ Nuevo Ahorro'}
            </AppText>
          </AppPressable>

          {/* Separate global Editar & Eliminar mode buttons below "+ Nuevo Ahorro" */}
          <ActionModeToggleRow
            activeMode={bucketActionMode}
            showEdit
            showDelete
            editLabel="Editar Ahorro"
            deleteLabel="Eliminar Ahorro"
            editTestID="bucket-action-edit-button"
            deleteTestID="bucket-action-delete-button"
            editAccessibilityLabel={
              bucketActionMode === 'edit' ? 'Cancelar edición de ahorros' : 'Editar ahorro'
            }
            deleteAccessibilityLabel={
              bucketActionMode === 'delete' ? 'Cancelar eliminación de ahorros' : 'Eliminar ahorro'
            }
            onToggleEdit={handleToggleEditBuckets}
            onToggleDelete={handleToggleDeleteBuckets}
          />

          {/* "+ Nuevo Ahorro": a savings fund or a savings account */}
          <RevealDown visible={isAddingBucket}>
            <SavingsForm
              key={activeForm?.kind === 'add-bucket' ? activeForm.key : 'add-bucket-idle'}
              onCreateSavingsBucket={onCreateSavingsBucket}
              onCreateAccount={onCreateAccount}
              onClose={handleCloseActiveForm}
            />
          </RevealDown>

          {/* Savings account edit sheet */}
          <RevealDown visible={editingAccount !== null}>
            {editingAccount ? (
              <SavingsForm
                key={activeForm?.kind === 'edit-account' ? activeForm.key : 'edit-account-idle'}
                account={editingAccount}
                onUpdateAccount={onUpdateAccount}
                onClose={handleCloseActiveForm}
              />
            ) : null}
          </RevealDown>

          {/* Individual Savings Fund Edit Sheet */}
          <RevealDown visible={editingBucket !== null}>
            {editingBucket ? (
              <EditSavingsBucketForm
                key={activeForm?.kind === 'edit-bucket' ? activeForm.key : 'edit-bucket-idle'}
                bucket={editingBucket}
                onUpdateOpeningBalance={onUpdateOpeningBalance}
                onClose={handleCloseActiveForm}
              />
            ) : null}
          </RevealDown>

          {/* Savings Fund Cards */}
          <SavingsBucketsList
            savingsSummary={savingsSummary}
            hasSavingsAccounts={hasSavingsAccounts}
            bucketActionMode={bucketActionMode}
            canEditBucket={Boolean(onUpdateOpeningBalance)}
            canDeleteBucket={Boolean(onDeleteSavingsBucket)}
            onEditBucket={handleOpenEditBucket}
            onDeleteBucket={handleDeleteBucket}
          />

          {savingsAccountsSummary ? (
            <SavingsAccountsSection
              summary={savingsAccountsSummary}
              actionMode={bucketActionMode}
              onEdit={handleOpenEditAccount}
              onDelete={handleDeleteAccount}
            />
          ) : null}
        </View>

        {/* Provisions & Target Goals Card (User-Configurable CRUD) */}
        <ScrollRevealSection>
          <GlassSurface elevated testID="provision-plan-card">
            <View style={{ gap: spacing.sm }}>
              <ProvisionsCardHeader provisionPlanSummary={provisionPlanSummary} />

              <AppPressable
                testID="open-add-provision-button"
                accessibilityRole="button"
                accessibilityLabel={
                  isProvisionFormOpen ? 'Cerrar formulario de metas' : 'Agregar metas'
                }
                onPress={handleToggleProvisionForm}
                style={{
                  minHeight: minTouchTarget,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  ...(isProvisionFormOpen ? null : primaryAction.container),
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText
                  variant="headline"
                  color={
                    isProvisionFormOpen
                      ? colors.text.primary
                      : (primaryAction.labelColor ?? colors.text.primary)
                  }
                >
                  {isProvisionFormOpen ? 'Cerrar' : '+ Agregar Metas'}
                </AppText>
              </AppPressable>

              {canManageProvisions ? (
                <ActionModeToggleRow
                  activeMode={provisionActionMode}
                  showEdit={Boolean(onSaveProvisionItem)}
                  showDelete={Boolean(onDeleteProvisionItem)}
                  editLabel="Editar"
                  deleteLabel="Eliminar"
                  editTestID="provision-action-edit-button"
                  deleteTestID="provision-action-delete-button"
                  editAccessibilityLabel={
                    provisionActionMode === 'edit'
                      ? 'Cancelar edición de provisiones y metas'
                      : 'Editar provisiones y metas'
                  }
                  deleteAccessibilityLabel={
                    provisionActionMode === 'delete'
                      ? 'Cancelar eliminación de provisiones y metas'
                      : 'Eliminar provisiones y metas'
                  }
                  onToggleEdit={handleToggleEditProvisions}
                  onToggleDelete={handleToggleDeleteProvisions}
                />
              ) : null}

              <RevealDown visible={isProvisionFormOpen}>
                <ProvisionItemForm
                  key={activeForm?.kind === 'provision' ? activeForm.key : 'provision-idle'}
                  item={editingProvision}
                  onSaveProvisionItem={onSaveProvisionItem}
                  onClose={handleCloseActiveForm}
                />
              </RevealDown>

              <ProvisionsItemsList
                provisionPlanSummary={provisionPlanSummary}
                planItemById={planItemById}
                provisionActionMode={provisionActionMode}
                canEditProvision={Boolean(onSaveProvisionItem)}
                canDeleteProvision={Boolean(onDeleteProvisionItem)}
                onEditProvision={openProvisionForm}
                onDeleteProvision={handleDeleteProvision}
              />
            </View>
          </GlassSurface>
        </ScrollRevealSection>
      </ResponsiveColumns>
    </View>
  );
}

