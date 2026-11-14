/**
 * src/features/savings/components/SavingsAndMotoIdealView.tsx
 *
 * Implements Screen `08-savings` (Fondos de Ahorro & Provisiones Programadas):
 * - Hero Card Total Ahorros Acumulados
 * - Standard buckets (Fondo Moto, Fondo Ahorros) + user-created custom savings funds
 * - Adjust opening/previous-month balances for all savings funds
 * - Full CRUD (Create, Edit, Update, Delete) for user-configurable Provisions & Target Goals
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  MIN_TOUCH_TARGET_PT,
  PencilEditIcon,
  ResponsiveColumns,
  RevealDown,
  StatusBadge,
  TrashBinIcon,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCurrency,
  type IdealMotoPlan,
  type MonthlySavingsSummary,
  type MotoIdealComparisonSummary,
  type ProvisionPlan,
  type ProvisionPlanComparisonSummary,
} from '../../../domain';
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
function ActionModeToggleRow({
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
  const { colors, spacing, radius } = useBFlowTheme();
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
            minHeight: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            borderCurve: 'continuous',
            backgroundColor: isEditActive
              ? colors.glass.surfaceElevatedTint
              : colors.glass.surfaceTint,
            borderWidth: 1.5,
            borderColor: isEditActive
              ? colors.semantic.income
              : colors.glass.subtleBorder,
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
            minHeight: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            borderCurve: 'continuous',
            backgroundColor: isDeleteActive
              ? colors.semantic.expenseSoft
              : colors.glass.surfaceTint,
            borderWidth: 1.5,
            borderColor: isDeleteActive
              ? colors.semantic.expense
              : colors.glass.subtleBorder,
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
}

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
  const { colors, spacing, radius } = useBFlowTheme();

  if (mode === 'edit' && onEdit) {
    return (
      <AppPressable
        testID={editTestID}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${itemName}`}
        onPress={onEdit}
        style={{
          minHeight: MIN_TOUCH_TARGET_PT,
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
          minHeight: MIN_TOUCH_TARGET_PT,
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
  const { colors, spacing, radius } = useBFlowTheme();

  // The forms own their field state (R-17); the view only knows which one is open and for
  // which item. A new key remounts a form, so it loads that item's values (or starts empty).
  const [bucketActionMode, setBucketActionMode] = useState<ListActionMode>(null);
  const [editingBucket, setEditingBucket] = useState<EditableSavingsBucket | null>(null);
  const [isAddingBucket, setIsAddingBucket] = useState(false);
  const [bucketFormKey, setBucketFormKey] = useState(0);

  const [isProvisionFormOpen, setIsProvisionFormOpen] = useState(false);
  const [provisionActionMode, setProvisionActionMode] = useState<ListActionMode>(null);
  const [editingProvision, setEditingProvision] = useState<EditableProvisionItem | null>(null);
  const [provisionFormKey, setProvisionFormKey] = useState(0);

  const hasProvisionItems =
    motoIdealSummary.recurringItems.length > 0 || motoIdealSummary.targetGoals.length > 0;
  const canManageProvisions = Boolean(onSaveProvisionItem || onDeleteProvisionItem);

  const toggleBucketActionMode = (mode: Exclude<ListActionMode, null>) => {
    setBucketActionMode((prev) => {
      const next = prev === mode ? null : mode;
      if (mode === 'delete') {
        hapticService.trigger(prev === 'delete' ? 'light' : 'warning');
      } else {
        hapticService.selection();
      }
      if (next) {
        setIsAddingBucket(false);
        setEditingBucket(null);
      }
      return next;
    });
  };

  const toggleProvisionActionMode = (mode: Exclude<ListActionMode, null>) => {
    hapticService.selection();
    setProvisionActionMode((prev) => {
      const next = prev === mode ? null : mode;
      if (next) {
        setIsProvisionFormOpen(false);
        setEditingProvision(null);
      }
      return next;
    });
  };

  const customBuckets = savingsSummary.customBuckets ?? [];
  const hasMotoBucket = savingsSummary.hasMotoBucket !== false;
  const hasSavingsBucket = savingsSummary.hasSavingsBucket !== false;
  const activeBucketsCount =
    (hasMotoBucket ? 1 : 0) + (hasSavingsBucket ? 1 : 0) + customBuckets.length;

  useEffect(() => {
    setBucketActionMode(null);
    setEditingBucket(null);
    setIsAddingBucket(false);
  }, [savingsSummary.monthKey]);

  const handleToggleAddBucket = () => {
    setIsAddingBucket((prev) => {
      const next = !prev;
      if (next) {
        setBucketActionMode(null);
        setEditingBucket(null);
        setBucketFormKey((key) => key + 1);
      }
      return next;
    });
  };
  const handleCloseAddBucket = useCallback(() => setIsAddingBucket(false), []);

  const handleOpenEditBucket = (bucketId: string, name: string, openingBalance: number) => {
    setBucketActionMode(null);
    setIsAddingBucket(false);
    setBucketFormKey((key) => key + 1);
    setEditingBucket({ id: bucketId, name, openingBalance });
  };
  const handleCloseEditBucket = useCallback(() => setEditingBucket(null), []);

  const handleDeleteBucket = (bucketId: string) => {
    onDeleteSavingsBucket?.(bucketId);
    if (editingBucket?.id === bucketId) {
      setEditingBucket(null);
    }
  };

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
      onEdit={
        onUpdateOpeningBalance
          ? () => handleOpenEditBucket(bucketId, name, openingBalance)
          : undefined
      }
      onDelete={onDeleteSavingsBucket ? () => handleDeleteBucket(bucketId) : undefined}
    />
  );

  const openProvisionForm = (item: EditableProvisionItem | null) => {
    setProvisionActionMode(null);
    setEditingProvision(item);
    setProvisionFormKey((key) => key + 1);
    setIsProvisionFormOpen(true);
  };
  const handleCloseProvisionForm = useCallback(() => {
    setIsProvisionFormOpen(false);
    setEditingProvision(null);
  }, []);

  const renderProvisionRowAction = (item: EditableProvisionItem): React.JSX.Element | null => (
    <InlineItemActionPill
      mode={provisionActionMode}
      itemName={item.name}
      editTestID={`edit-provision-${item.id}`}
      deleteTestID={`delete-provision-${item.id}`}
      onEdit={onSaveProvisionItem ? () => openProvisionForm(item) : undefined}
      onDelete={onDeleteProvisionItem ? () => onDeleteProvisionItem(item.id) : undefined}
    />
  );


  return (
    <View style={{ gap: spacing.md }} testID="savings-and-moto-ideal-view">
      {/* Wide windows: funds on the left, provisions on the right. Phones stack them. */}
      <ResponsiveColumns testID="savings-panels">
        <View style={{ gap: spacing.md }}>
          {/* Screen 08: Hero Card Total Ahorros */}
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
                <StatusBadge
                  label={` Fondos activos (${activeBucketsCount})`}
                  status="savings"
                />
              </View>

              <CurrencyText
                testID="savings-hero-total"
                amount={savingsSummary.totalCurrentSavings}
                variant="heroCurrency"
                tone="reserve"
              />

              <AppText variant="caption" color={colors.text.secondary}>
                {`Total proyectado tras pagar pendientes: ${formatCurrency(savingsSummary.totalProjectedAfterPendingExpenses)}`}
              </AppText>
            </View>
          </GlassSurface>

          {/* Add New Fund Button (directly below Total Ahorros Acumulados, above the funds list) */}
          <AppPressable
            testID="open-add-savings-bucket-button"
            accessibilityRole="button"
            accessibilityLabel={isAddingBucket ? 'Cerrar formulario de nuevo fondo' : 'Nuevo fondo de ahorro'}
            onPress={handleToggleAddBucket}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.specularBorder,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="caption" color={colors.text.primary}>
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
            onToggleEdit={() => toggleBucketActionMode('edit')}
            onToggleDelete={() => toggleBucketActionMode('delete')}
          />

          {/* Add New Custom Savings Fund Sheet */}
          <RevealDown visible={isAddingBucket}>
            <NewSavingsBucketForm
              key={bucketFormKey}
              onCreateSavingsBucket={onCreateSavingsBucket}
              onClose={handleCloseAddBucket}
            />
          </RevealDown>

          {/* Individual Savings Fund Edit Sheet */}
          <RevealDown visible={editingBucket !== null}>
            {editingBucket ? (
              <EditSavingsBucketForm
                key={bucketFormKey}
                bucket={editingBucket}
                onUpdateOpeningBalance={onUpdateOpeningBalance}
                onClose={handleCloseEditBucket}
              />
            ) : null}
          </RevealDown>

          {/* Primary Bucket Cards: Fondo Moto & Fondo Ahorros (rendered only when present in the user's account) */}
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
                      {`Saldo mes anterior: ${formatCurrency(savingsSummary.moto.openingBalance)}`}
                    </AppText>
                    <AppText variant="micro" color={colors.semantic.income}>
                      {`+ Aportes pagados: ${formatCurrency(savingsSummary.moto.paidContributionsThisMonth)}`}
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
                      {`Saldo mes anterior: ${formatCurrency(savingsSummary.savings.openingBalance)} + Flujo Neto ${formatCurrency(savingsSummary.savings.netCashFlowContribution)}`}
                    </AppText>
                    <AppText variant="micro" color={colors.semantic.pending}>
                      {`Tras pendientes: ${formatCurrency(savingsSummary.savings.projectedAfterPendingExpenses)}`}
                    </AppText>
                  </View>
                </GlassSurface>
              ) : null}
            </View>
          ) : null}

          {/* Custom User-Created Savings Funds */}
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
                    {`Saldo anterior: ${formatCurrency(cb.openingBalance)} · + Aportes pagados: ${formatCurrency(cb.paidContributionsThisMonth)}`}
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

        </View>

        {/* Provisions & Target Goals Card (User-Configurable CRUD) */}
        <GlassSurface elevated testID="moto-ideal-card">
          <View style={{ gap: spacing.sm }}>
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
                <AppText variant="title2">Provisiones y Metas Programadas</AppText>
              </View>
              <StatusBadge
                label={`Cuota ideal: ${formatCurrency(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
                status="provisions"
              />
            </View>

            <AppText variant="caption" color={colors.text.secondary}>
              {`Total con metas: ${formatCurrency(motoIdealSummary.totalWithTargetGoalsCop)} · Aporte real este mes: ${formatCurrency(motoIdealSummary.actualMotoContributionCop)} (Brecha operativa: ${formatCurrency(motoIdealSummary.monthlyGapAgainstIdealCop)})`}
            </AppText>

            <AppPressable
              testID="open-add-provision-button"
              accessibilityRole="button"
              onPress={() => {
                if (isProvisionFormOpen) {
                  setIsProvisionFormOpen(false);
                } else {
                  openProvisionForm(null);
                }
              }}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceElevatedTint,
                borderWidth: 1,
                borderColor: colors.glass.specularBorder,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.text.primary}>
                {isProvisionFormOpen ? 'Cerrar' : '+ Agregar Provisión o Meta'}
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
                onToggleEdit={() => toggleProvisionActionMode('edit')}
                onToggleDelete={() => toggleProvisionActionMode('delete')}
              />
            ) : null}

            <RevealDown visible={isProvisionFormOpen}>
              <ProvisionItemForm
                key={provisionFormKey}
                item={editingProvision}
                onSaveProvisionItem={onSaveProvisionItem}
                onClose={handleCloseProvisionForm}
              />
            </RevealDown>

            {!hasProvisionItems ? (
              <AppText variant="caption" color={colors.text.muted}>
                No tienes provisiones ni metas configuradas aún. Usa el botón superior para agregar las tuyas.
              </AppText>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              {motoIdealSummary.recurringItems.map((item) => {
                const rawPlanItem = provisionPlan?.items.find((p) => p.id === item.id);
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
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 140, gap: spacing.xxs }}>
                      <AppText variant="body">{item.displayName}</AppText>
                      <AppText variant="micro" color={colors.text.secondary}>
                        {item.periodMonths > 1
                          ? `Ciclo: ${formatCurrency(item.cycleCostCop)} / ${item.periodMonths} meses`
                          : item.actualBudgetedAmountCop !== undefined
                            ? `Vinculado en presupuesto · Real: ${formatCurrency(item.actualBudgetedAmountCop)}`
                            : 'Provisión mensual directa'}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                        <CurrencyText amount={item.excelMonthlyAmountCop} variant="body" tone="provisions" />
                      </View>
                      {actionButton}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Target Goals */}
            {motoIdealSummary.targetGoals.map((goal) => {
              const rawPlanItem = provisionPlan?.items.find((p) => p.id === goal.id);
              const actionButton = renderProvisionRowAction({
                id: goal.id,
                name: rawPlanItem?.displayName ?? goal.displayName,
                amount: goal.targetAmountCop,
                periodMonths: rawPlanItem?.periodMonths ?? 1,
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
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <AppText variant="headline">{`🎯 ${goal.displayName}`}</AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
                      <StatusBadge label={`Meta: ${goal.targetMonthKey}`} status="provisions" />
                      {actionButton}
                    </View>
                  </View>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {`Objetivo total: ${formatCurrency(goal.targetAmountCop)} · Cuota sugerida (${goal.monthsUntilTarget} meses): ${formatCurrency(goal.suggestedMonthlySavingCop)}/mes`}
                  </AppText>
                </View>
              );
            })}
          </View>
        </GlassSurface>
      </ResponsiveColumns>
    </View>
  );
}

export const SavingsAndProvisionsView = SavingsAndMotoIdealView;