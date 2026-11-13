/**
 * src/features/savings/components/SavingsAndMotoIdealView.tsx
 *
 * Implements Screen `08-savings` (Fondos de Ahorro & Provisiones Programadas):
 * - Hero Card Total Ahorros Acumulados
 * - Standard buckets (Fondo Moto, Fondo Ahorros) + user-created custom savings funds
 * - Adjust opening/previous-month balances for all savings funds
 * - Full CRUD (Create, Edit, Update, Delete) for user-configurable Provisions & Target Goals
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  FormMessage,
  AppTextInput,
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
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatCurrency,
  formatGroupedIntegerInput,
  type IdealMotoPlan,
  type MonthlySavingsSummary,
  type MotoIdealComparisonSummary,
  type ProvisionPlan,
  type ProvisionPlanComparisonSummary,
} from '../../../domain';
import type { SaveProvisionItemInput } from '../../budget/store/useBudgetStore';

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
  const primaryAction = usePrimaryActionLook();

  // Savings bucket add / individual edit / individual delete state
  const [bucketActionMode, setBucketActionMode] = useState<ListActionMode>(null);
  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [editingBucketLabel, setEditingBucketLabel] = useState('');
  const [editBucketNameInput, setEditBucketNameInput] = useState('');
  const [editBucketBalanceInput, setEditBucketBalanceInput] = useState('');
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // New Custom Savings Bucket form state
  const [isAddingBucket, setIsAddingBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketBalance, setNewBucketBalance] = useState('');
  const [newBucketError, setNewBucketError] = useState<string | null>(null);

  // Provision / Target Goal CRUD form state
  const [isProvisionFormOpen, setIsProvisionFormOpen] = useState(false);
  const [provisionActionMode, setProvisionActionMode] = useState<ListActionMode>(null);
  const [editingProvisionId, setEditingProvisionId] = useState<string | null>(null);
  const [provisionName, setProvisionName] = useState('');
  const [provisionAmount, setProvisionAmount] = useState('');
  const [provisionMonths, setProvisionMonths] = useState('1');
  const [provisionKind, setProvisionKind] = useState<'recurring' | 'target_goal'>('recurring');
  const [provisionNotes, setProvisionNotes] = useState('');
  const [provisionError, setProvisionError] = useState<string | null>(null);

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
        setEditingBucketId(null);
        setNewBucketError(null);
        setBalanceError(null);
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
        setEditingProvisionId(null);
        setProvisionError(null);
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
    setEditingBucketId(null);
    setIsAddingBucket(false);
    setBalanceError(null);
    setNewBucketError(null);
  }, [savingsSummary.monthKey]);

  const handleToggleAddBucket = () => {
    setIsAddingBucket((prev) => {
      const next = !prev;
      if (next) {
        setBucketActionMode(null);
        setEditingBucketId(null);
        setBalanceError(null);
      }
      setNewBucketError(null);
      return next;
    });
  };

  const handleOpenEditBucket = (bucketId: string, name: string, openingBalance: number) => {
    setBucketActionMode(null);
    setIsAddingBucket(false);
    setEditingBucketId(bucketId);
    setEditingBucketLabel(name);
    setEditBucketNameInput(name);
    setEditBucketBalanceInput(formatGroupedIntegerInput(openingBalance));
    setBalanceError(null);
  };

  const handleCancelEditBucket = () => {
    setEditingBucketId(null);
    setBalanceError(null);
  };

  const handleSaveEditedBucket = () => {
    if (!editingBucketId) return;
    const trimmedName = editBucketNameInput.trim();
    if (!trimmedName) {
      setBalanceError('Escribe el nombre del fondo de ahorro.');
      return;
    }
    const digits = editBucketBalanceInput.replace(/[^0-9]/g, '');
    const parsed = digits ? Number(digits) : 0;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      setBalanceError('Ingresa un saldo entero válido para el fondo.');
      return;
    }

    onUpdateOpeningBalance?.(editingBucketId, parsed, trimmedName);
    setEditingBucketId(null);
    setBalanceError(null);
  };

  const handleDeleteBucket = (bucketId: string) => {
    onDeleteSavingsBucket?.(bucketId);
    if (editingBucketId === bucketId) {
      setEditingBucketId(null);
      setBalanceError(null);
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

  const handleCreateBucket = () => {
    if (!newBucketName.trim()) {
      setNewBucketError('Escribe el nombre del nuevo fondo de ahorro.');
      return;
    }
    const digits = newBucketBalance.replace(/[^0-9]/g, '');
    const parsed = digits ? Number(digits) : 0;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      setNewBucketError('Ingresa un saldo inicial entero válido.');
      return;
    }
    if (onCreateSavingsBucket) {
      onCreateSavingsBucket(newBucketName.trim(), parsed);
    }
    setNewBucketName('');
    setNewBucketBalance('');
    setNewBucketError(null);
    setIsAddingBucket(false);
  };

  const handleOpenCreateProvision = () => {
    setProvisionActionMode(null);
    setEditingProvisionId(null);
    setProvisionName('');
    setProvisionAmount('');
    setProvisionMonths('1');
    setProvisionKind('recurring');
    setProvisionNotes('');
    setProvisionError(null);
    setIsProvisionFormOpen(true);
  };

  const handleOpenEditProvision = (item: {
    id: string;
    name: string;
    amount: number;
    periodMonths: number;
    kind: 'recurring' | 'target_goal';
    notes?: string;
  }) => {
    setProvisionActionMode(null);
    setEditingProvisionId(item.id);
    setProvisionName(item.name);
    setProvisionAmount(formatGroupedIntegerInput(item.amount));
    setProvisionMonths(formatGroupedIntegerInput(item.periodMonths));
    setProvisionKind(item.kind);
    setProvisionNotes(item.notes ?? '');
    setProvisionError(null);
    setIsProvisionFormOpen(true);
  };

  const renderProvisionRowAction = (item: {
    id: string;
    name: string;
    amount: number;
    periodMonths: number;
    kind: 'recurring' | 'target_goal';
    notes?: string;
  }): React.JSX.Element | null => (
    <InlineItemActionPill
      mode={provisionActionMode}
      itemName={item.name}
      editTestID={`edit-provision-${item.id}`}
      deleteTestID={`delete-provision-${item.id}`}
      onEdit={onSaveProvisionItem ? () => handleOpenEditProvision(item) : undefined}
      onDelete={onDeleteProvisionItem ? () => onDeleteProvisionItem(item.id) : undefined}
    />
  );

  const handleSubmitProvision = () => {
    if (!provisionName.trim()) {
      setProvisionError('Escribe el nombre de la provisión o meta.');
      return;
    }
    const amountDigits = provisionAmount.replace(/[^0-9]/g, '');
    const parsedAmount = amountDigits ? Number(amountDigits) : 0;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setProvisionError('Ingresa un monto entero válido mayor a 0.');
      return;
    }
    const monthsDigits = provisionMonths.replace(/[^0-9]/g, '');
    const parsedMonths = monthsDigits ? Number(monthsDigits) : 1;
    if (!Number.isSafeInteger(parsedMonths) || parsedMonths < 1) {
      setProvisionError('El periodo en meses debe ser un entero mayor o igual a 1.');
      return;
    }

    if (onSaveProvisionItem) {
      onSaveProvisionItem({
        ...(editingProvisionId ? { id: editingProvisionId } : {}),
        name: provisionName.trim(),
        amount: parsedAmount,
        periodMonths: parsedMonths,
        priority: '1. Alta',
        kind: provisionKind,
        ...(provisionNotes.trim() ? { notes: provisionNotes.trim() } : {}),
      });
    }
    setIsProvisionFormOpen(false);
    setEditingProvisionId(null);
    setProvisionError(null);
  };

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
            <GlassSurface elevated testID="add-savings-bucket-card">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="headline">Crear Nuevo Fondo de Ahorro</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  Podrás vincular cualquier gasto de tu Checklist a este fondo para que sume automáticamente al marcarlo como pagado.
                </AppText>

                <AppTextInput
                  testID="new-bucket-name-input"
                  value={newBucketName}
                  onChangeText={setNewBucketName}
                  placeholder="Nombre del fondo (ej. Fondo Viaje, Emergencias)"
                />

                <AppTextInput
                  testID="new-bucket-balance-input"
                  value={newBucketBalance}
                  onChangeText={setNewBucketBalance}
                  keyboardType="number-pad"
                  placeholder="Saldo actual o del mes anterior (ej. 500.000)"
                />

                <FormMessage message={newBucketError} />

                <AppPressable
                  testID="submit-new-bucket-button"
                  accessibilityRole="button"
                  onPress={handleCreateBucket}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    borderRadius: radius.md,
                    borderCurve: 'continuous',
                    ...primaryAction.container,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="body" color={primaryAction.labelColor ?? colors.semantic.income}>
                    Guardar Fondo de Ahorro
                  </AppText>
                </AppPressable>
              </View>
            </GlassSurface>
          </RevealDown>

          {/* Individual Savings Fund Edit Sheet */}
          <RevealDown visible={Boolean(editingBucketId)}>
            <GlassSurface elevated testID="edit-savings-bucket-card">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="headline">
                  {editingBucketLabel ? `Editar ${editingBucketLabel}` : 'Editar Fondo de Ahorro'}
                </AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  Edita el nombre o el saldo actual/del mes anterior con el que inicia este fondo.
                </AppText>

                <AppTextInput
                  testID="edit-bucket-name-input"
                  value={editBucketNameInput}
                  onChangeText={setEditBucketNameInput}
                  placeholder="Nombre del fondo"
                />

                <AppTextInput
                  testID="edit-bucket-balance-input"
                  value={editBucketBalanceInput}
                  onChangeText={setEditBucketBalanceInput}
                  keyboardType="number-pad"
                  placeholder="0"
                />

                <FormMessage message={balanceError} />

                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <AppPressable
                    testID="cancel-edit-bucket-button"
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar edición de fondo"
                    onPress={handleCancelEditBucket}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      borderRadius: radius.md,
                      borderCurve: 'continuous',
                      backgroundColor: colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="body" color={colors.text.secondary}>
                      Cancelar
                    </AppText>
                  </AppPressable>

                  <AppPressable
                    testID="save-edit-bucket-button"
                    accessibilityRole="button"
                    accessibilityLabel="Guardar Saldos"
                    onPress={handleSaveEditedBucket}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      borderRadius: radius.md,
                      borderCurve: 'continuous',
                      backgroundColor: colors.glass.surfaceElevatedTint,
                      borderWidth: 1,
                      borderColor: colors.glass.specularBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="body" color={colors.semantic.income}>
                      Guardar Saldo
                    </AppText>
                  </AppPressable>
                </View>
              </View>
            </GlassSurface>
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
                  handleOpenCreateProvision();
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
              <View
                testID="provision-form-card"
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  gap: spacing.xs,
                }}
              >
                <AppText variant="headline">
                  {editingProvisionId ? 'Editar Provisión o Meta' : 'Nueva Provisión o Meta'}
                </AppText>

                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  {(
                    [
                      { id: 'recurring', label: 'Provisión Recurrente' },
                      { id: 'target_goal', label: 'Meta Objetivo' },
                    ] as const
                  ).map((opt) => {
                    const active = provisionKind === opt.id;
                    return (
                      <AppPressable
                        key={opt.id}
                        testID={`provision-kind-${opt.id}`}
                        accessibilityRole="button"
                        onPress={() => setProvisionKind(opt.id)}
                        style={{
                          flex: 1,
                          minHeight: 38,
                          borderRadius: radius.md,
                          backgroundColor: active
                            ? colors.semantic.provisionsSoft
                            : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <AppText
                          variant="micro"
                          color={active ? colors.semantic.provisions : colors.text.secondary}
                        >
                          {opt.label}
                        </AppText>
                      </AppPressable>
                    );
                  })}
                </View>

                <AppTextInput
                  testID="provision-name-input"
                  value={provisionName}
                  onChangeText={setProvisionName}
                  placeholder="Nombre (ej. Seguro, Mantenimiento, Póliza)"
                />

                <AppTextInput
                  testID="provision-amount-input"
                  value={provisionAmount}
                  onChangeText={setProvisionAmount}
                  keyboardType="number-pad"
                  placeholder="Costo total del ciclo (ej. 690.000)"
                />

                <AppTextInput
                  testID="provision-months-input"
                  value={provisionMonths}
                  onChangeText={setProvisionMonths}
                  keyboardType="number-pad"
                  placeholder="Periodo en meses (ej. 1 mensual, 12 anual)"
                />

                <AppTextInput
                  testID="provision-notes-input"
                  value={provisionNotes}
                  onChangeText={setProvisionNotes}
                  placeholder="Nota o fecha objetivo opcional"
                />

                <FormMessage message={provisionError} />

                <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end' }}>
                  <AppPressable
                    testID="submit-provision-button"
                    accessibilityRole="button"
                    onPress={handleSubmitProvision}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      borderCurve: 'continuous',
                      ...primaryAction.container,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="caption" color={primaryAction.labelColor ?? colors.semantic.income}>
                      Guardar Provisión
                    </AppText>
                  </AppPressable>
                </View>
              </View>
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
