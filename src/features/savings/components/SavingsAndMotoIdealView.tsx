/**
 * src/features/savings/components/SavingsAndMotoIdealView.tsx
 *
 * Implements Screen `08-savings` (Fondos de Ahorro & Metas/Provisiones Programadas):
 * - Memoized Hero Card Total Ahorros Acumulados
 * - Standard buckets (Fondo de Reserva, Fondo Ahorros) + user-created custom savings funds
 * - Adjust opening/previous-month balances for all savings funds
 * - Full CRUD (Create, Edit, Update, Delete) for user-configurable Provisions & Target Goals
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  animateNextLayout,
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  PencilEditIcon,
  ResponsiveColumns,
  RevealDown,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  TrashBinIcon,
  useAmountPrivacy,
  useBFlowTheme,
  useIsTabActive,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  type IdealMotoPlan,
  type MonthlySavingsSummary,
  type MotoIdealComparisonSummary,
  type ProvisionPlan,
  type ProvisionPlanComparisonSummary,
} from '../../../domain';

type ProvisionPlanItem = ProvisionPlan['items'][number];
import type { SaveProvisionItemInput } from '../../budget/store/useBudgetStore';
import { ProvisionItemForm, type EditableProvisionItem } from './ProvisionItemForm';
import {
  EditSavingsBucketForm,
  NewSavingsBucketForm,
  type EditableSavingsBucket,
} from './SavingsBucketForms';

type ListActionMode = 'edit' | 'delete' | null;

interface ActionModeToggleRowProps {
  activeMode: ListActionMode;
  showEdit: boolean;
  showDelete: boolean;
  editLabel: string;
  deleteLabel: string;
  editTestID: string;
  deleteTestID: string;
  editAccessibilityLabel: string;
  deleteAccessibilityLabel: string;
  onToggleEdit: () => void;
  onToggleDelete: () => void;
}

/** Renders a two-button Editar / Eliminar mode toggle row for a list section. */
const ActionModeToggleRow = React.memo(function ActionModeToggleRow({
  activeMode,
  showEdit,
  showDelete,
  editLabel,
  deleteLabel,
  editTestID,
  deleteTestID,
  editAccessibilityLabel,
  deleteAccessibilityLabel,
  onToggleEdit,
  onToggleDelete,
}: ActionModeToggleRowProps): React.JSX.Element | null {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  if (!showEdit && !showDelete) return null;

  const isEditActive = activeMode === 'edit';
  const isDeleteActive = activeMode === 'delete';

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
      {showEdit ? (
        <AppPressable
          testID={editTestID}
          accessibilityRole="button"
          accessibilityLabel={editAccessibilityLabel}
          onPress={onToggleEdit}
          style={{
            flex: 1,
            minHeight: minTouchTarget,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            borderCurve: 'continuous',
            backgroundColor: isEditActive
              ? colors.glass.surfaceElevatedTint
              : colors.glass.surfaceTint,
            borderWidth: 1.5,
            borderColor: isEditActive ? colors.semantic.income : colors.glass.subtleBorder,
            flexDirection: 'row',
            gap: spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PencilEditIcon
            size={16}
            color={isEditActive ? colors.semantic.income : colors.text.secondary}
          />
          <AppText
            variant="caption"
            color={isEditActive ? colors.semantic.income : colors.text.secondary}
          >
            {isEditActive ? 'Cancelar Edición' : editLabel}
          </AppText>
        </AppPressable>
      ) : null}

      {showDelete ? (
        <AppPressable
          testID={deleteTestID}
          accessibilityRole="button"
          accessibilityLabel={deleteAccessibilityLabel}
          onPress={onToggleDelete}
          style={{
            flex: 1,
            minHeight: minTouchTarget,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            borderCurve: 'continuous',
            backgroundColor: isDeleteActive
              ? colors.semantic.expenseSoft
              : colors.glass.surfaceTint,
            borderWidth: 1.5,
            borderColor: isDeleteActive ? colors.semantic.expense : colors.glass.subtleBorder,
            flexDirection: 'row',
            gap: spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TrashBinIcon
            size={16}
            color={isDeleteActive ? colors.semantic.expense : colors.text.secondary}
          />
          <AppText
            variant="caption"
            color={isDeleteActive ? colors.semantic.expense : colors.text.secondary}
          >
            {isDeleteActive ? 'Cancelar Eliminación' : deleteLabel}
          </AppText>
        </AppPressable>
      ) : null}
    </View>
  );
});

interface InlineItemActionPillProps {
  mode: ListActionMode;
  itemName: string;
  editTestID: string;
  deleteTestID: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Renders the per-item Editar or Eliminar pill when the section action mode is active. */
function InlineItemActionPill({
  mode,
  itemName,
  editTestID,
  deleteTestID,
  onEdit,
  onDelete,
}: InlineItemActionPillProps): React.JSX.Element | null {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();

  if (mode === 'edit' && onEdit) {
    return (
      <AppPressable
        testID={editTestID}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${itemName}`}
        onPress={onEdit}
        style={{
          minHeight: minTouchTarget,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderCurve: 'continuous',
          backgroundColor: colors.glass.surfaceElevatedTint,
          borderWidth: 1,
          borderColor: colors.glass.specularBorder,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          justifyContent: 'center',
        }}
      >
        <PencilEditIcon size={14} color={colors.semantic.income} />
        <AppText variant="caption" color={colors.semantic.income}>
          Editar
        </AppText>
      </AppPressable>
    );
  }

  if (mode === 'delete' && onDelete) {
    return (
      <AppPressable
        testID={deleteTestID}
        accessibilityRole="button"
        accessibilityLabel={`Eliminar ${itemName}`}
        onPress={onDelete}
        style={{
          minHeight: minTouchTarget,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderCurve: 'continuous',
          backgroundColor: colors.semantic.expenseSoft,
          borderWidth: 1,
          borderColor: colors.semantic.expense,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          justifyContent: 'center',
        }}
      >
        <TrashBinIcon size={14} color={colors.semantic.expense} />
        <AppText variant="caption" color={colors.semantic.expense}>
          Eliminar
        </AppText>
      </AppPressable>
    );
  }

  return null;
}

const SavingsHeroCard = React.memo(function SavingsHeroCard({
  activeBucketsCount,
  totalCurrentSavings,
  totalProjectedAfterPendingExpenses,
}: {
  activeBucketsCount: number;
  totalCurrentSavings: number;
  totalProjectedAfterPendingExpenses: number;
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
        </View>
      </GlassSurface>
    </ScrollDepthHero>
  );
});

interface SavingsBucketsListProps {
  savingsSummary: MonthlySavingsSummary;
  bucketActionMode: ListActionMode;
  canEditBucket: boolean;
  canDeleteBucket: boolean;
  onEditBucket: (bucketId: string, name: string, openingBalance: number) => void;
  onDeleteBucket: (bucketId: string) => void;
}

const SavingsBucketsList = React.memo(function SavingsBucketsList({
  savingsSummary,
  bucketActionMode,
  canEditBucket,
  canDeleteBucket,
  onEditBucket,
  onDeleteBucket,
}: SavingsBucketsListProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing } = useBFlowTheme();

  const customBuckets = savingsSummary.customBuckets ?? [];
  const hasMotoBucket = savingsSummary.hasMotoBucket !== false;
  const hasSavingsBucket = savingsSummary.hasSavingsBucket !== false;
  const activeBucketsCount =
    (hasMotoBucket ? 1 : 0) + (hasSavingsBucket ? 1 : 0) + customBuckets.length;

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
      {hasMotoBucket || hasSavingsBucket ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {hasMotoBucket ? (
            <GlassSurface style={{ flex: 1, minWidth: 200 }} testID="bucket-moto-card">
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
                    {savingsSummary.moto.name || 'Fondo de Reserva'}
                  </AppText>
                  {renderBucketRowAction(
                    'moto',
                    savingsSummary.moto.name || 'Fondo de Reserva',
                    savingsSummary.moto.openingBalance
                  )}
                </View>
                <CurrencyText
                  testID="bucket-moto-current"
                  amount={savingsSummary.moto.currentBalance}
                  variant="title2"
                  tone="reserve"
                />
                <AppText variant="micro" color={colors.text.secondary}>
                  {`Saldo mes anterior: ${formatAmount(savingsSummary.moto.openingBalance)}`}
                </AppText>
                <AppText variant="micro" color={colors.semantic.income}>
                  {`+ Aportes pagados: ${formatAmount(savingsSummary.moto.paidContributionsThisMonth)}`}
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

      {activeBucketsCount === 0 ? (
        <GlassSurface testID="empty-savings-buckets-card">
          <AppText variant="caption" color={colors.text.secondary}>
            No tienes fondos de ahorro creados aún. Usa &quot;+ Nuevo Fondo&quot; para agregar tus
            propios fondos y vincularles movimientos.
          </AppText>
        </GlassSurface>
      ) : null}
    </>
  );
});

const ProvisionsCardHeader = React.memo(function ProvisionsCardHeader({
  motoIdealSummary,
}: {
  motoIdealSummary: MotoIdealComparisonSummary | ProvisionPlanComparisonSummary;
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
        label={`Cuota ideal: ${formatAmount(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
        status="provisions"
      />
    </View>
  );
});

interface ProvisionsItemsListProps {
  motoIdealSummary: MotoIdealComparisonSummary | ProvisionPlanComparisonSummary;
  planItemById: ReadonlyMap<string, ProvisionPlanItem>;
  provisionActionMode: ListActionMode;
  canEditProvision: boolean;
  canDeleteProvision: boolean;
  onEditProvision: (item: EditableProvisionItem) => void;
  onDeleteProvision: (itemId: string) => void;
}

const ProvisionsItemsList = React.memo(function ProvisionsItemsList({
  motoIdealSummary,
  planItemById,
  provisionActionMode,
  canEditProvision,
  canDeleteProvision,
  onEditProvision,
  onDeleteProvision,
}: ProvisionsItemsListProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius } = useBFlowTheme();

  const hasRecurring = motoIdealSummary.recurringItems.length > 0;
  const hasGoals = motoIdealSummary.targetGoals.length > 0;
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
          {motoIdealSummary.targetGoals.map((goal) => {
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
                testID={`moto-target-goal-${goal.id}`}
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
            {motoIdealSummary.recurringItems.map((item, index) => {
              const rawPlanItem = planItemById.get(item.id);
              const isLast = index === motoIdealSummary.recurringItems.length - 1;
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
                  testID={`moto-ideal-item-${item.id}`}
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
                        amount={item.excelMonthlyAmountCop}
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

export interface SavingsAndMotoIdealViewProps {
  savingsSummary: MonthlySavingsSummary;
  motoIdealSummary: MotoIdealComparisonSummary | ProvisionPlanComparisonSummary;
  provisionPlan?: IdealMotoPlan | ProvisionPlan;
  onUpdateOpeningBalance?: (
    bucketId: string,
    newBalanceCop: number,
    bucketName?: string
  ) => void;
  onCreateSavingsBucket?: (name: string, openingBalanceCop: number) => void;
  onDeleteSavingsBucket?: (bucketId: string) => void;
  onSaveProvisionItem?: (input: SaveProvisionItemInput) => void;
  onDeleteProvisionItem?: (itemId: string) => void;
}

type ActiveSavingsForm =
  | { kind: 'add-bucket'; key: number }
  | { kind: 'edit-bucket'; bucket: EditableSavingsBucket; key: number }
  | { kind: 'provision'; item: EditableProvisionItem | null; key: number }
  | null;

export function SavingsAndMotoIdealView({
  savingsSummary,
  motoIdealSummary,
  provisionPlan,
  onUpdateOpeningBalance,
  onCreateSavingsBucket,
  onDeleteSavingsBucket,
  onSaveProvisionItem,
  onDeleteProvisionItem,
}: SavingsAndMotoIdealViewProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const isTabActive = useIsTabActive();

  // Single active form slot across both panels (R-17): at most one form is open at a time,
  // and each open remounts clean with a fresh key while memoized lists stay untouched.
  const [activeForm, setActiveForm] = useState<ActiveSavingsForm>(null);
  const [bucketActionMode, setBucketActionMode] = useState<ListActionMode>(null);
  const [provisionActionMode, setProvisionActionMode] = useState<ListActionMode>(null);
  const formKeyRef = useRef(0);

  const isAddingBucket = activeForm?.kind === 'add-bucket';
  const editingBucket = activeForm?.kind === 'edit-bucket' ? activeForm.bucket : null;
  const isProvisionFormOpen = activeForm?.kind === 'provision';
  const editingProvision = activeForm?.kind === 'provision' ? activeForm.item : null;

  const canManageProvisions = Boolean(onSaveProvisionItem || onDeleteProvisionItem);

  const planItemById = useMemo(
    () => new Map((provisionPlan?.items ?? []).map((item) => [item.id, item] as const)),
    [provisionPlan?.items]
  );

  const activeBucketsCount = useMemo(() => {
    const customCount = savingsSummary.customBuckets?.length ?? 0;
    const motoCount = savingsSummary.hasMotoBucket !== false ? 1 : 0;
    const savingsCount = savingsSummary.hasSavingsBucket !== false ? 1 : 0;
    return motoCount + savingsCount + customCount;
  }, [savingsSummary.customBuckets, savingsSummary.hasMotoBucket, savingsSummary.hasSavingsBucket]);

  useEffect(() => {
    setActiveForm(null);
    setBucketActionMode(null);
    setProvisionActionMode(null);
  }, [savingsSummary.monthKey]);

  useEffect(() => {
    if (!isTabActive) {
      setActiveForm(null);
      setBucketActionMode(null);
      setProvisionActionMode(null);
    }
  }, [isTabActive]);

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
    <View style={{ gap: spacing.md }} testID="savings-and-moto-ideal-view">
      {/* Wide windows: funds on the left, provisions on the right. Phones stack them. */}
      <ResponsiveColumns testID="savings-panels">
        <View style={{ gap: spacing.md }}>
          {/* Screen 08: Hero Card Total Ahorros */}
          <SavingsHeroCard
            activeBucketsCount={activeBucketsCount}
            totalCurrentSavings={savingsSummary.totalCurrentSavings}
            totalProjectedAfterPendingExpenses={savingsSummary.totalProjectedAfterPendingExpenses}
          />

          {/* Add New Fund Button (directly below Total Ahorros Acumulados, above the funds list) */}
          <AppPressable
            testID="open-add-savings-bucket-button"
            accessibilityRole="button"
            accessibilityLabel={
              isAddingBucket ? 'Cerrar formulario de nuevo fondo' : 'Nuevo fondo de ahorro'
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
              {isAddingBucket ? 'Cerrar' : '+ Nuevo Fondo'}
            </AppText>
          </AppPressable>

          {/* Separate global Editar & Eliminar mode buttons below "+ Nuevo Fondo" */}
          <ActionModeToggleRow
            activeMode={bucketActionMode}
            showEdit
            showDelete
            editLabel="Editar Fondo"
            deleteLabel="Eliminar Fondo"
            editTestID="bucket-action-edit-button"
            deleteTestID="bucket-action-delete-button"
            editAccessibilityLabel={
              bucketActionMode === 'edit' ? 'Cancelar edición de fondos' : 'Editar fondo'
            }
            deleteAccessibilityLabel={
              bucketActionMode === 'delete' ? 'Cancelar eliminación de fondos' : 'Eliminar fondo'
            }
            onToggleEdit={handleToggleEditBuckets}
            onToggleDelete={handleToggleDeleteBuckets}
          />

          {/* Add New Custom Savings Fund Sheet */}
          <RevealDown visible={isAddingBucket}>
            <NewSavingsBucketForm
              key={activeForm?.kind === 'add-bucket' ? activeForm.key : 'add-bucket-idle'}
              onCreateSavingsBucket={onCreateSavingsBucket}
              onClose={handleCloseActiveForm}
            />
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
            bucketActionMode={bucketActionMode}
            canEditBucket={Boolean(onUpdateOpeningBalance)}
            canDeleteBucket={Boolean(onDeleteSavingsBucket)}
            onEditBucket={handleOpenEditBucket}
            onDeleteBucket={handleDeleteBucket}
          />
        </View>

        {/* Provisions & Target Goals Card (User-Configurable CRUD) */}
        <ScrollRevealSection>
          <GlassSurface elevated testID="moto-ideal-card">
            <View style={{ gap: spacing.sm }}>
              <ProvisionsCardHeader motoIdealSummary={motoIdealSummary} />

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
                motoIdealSummary={motoIdealSummary}
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

export const SavingsAndProvisionsView = SavingsAndMotoIdealView;
