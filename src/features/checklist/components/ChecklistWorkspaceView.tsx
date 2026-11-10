/**
 * src/features/checklist/components/ChecklistWorkspaceView.tsx
 *
 * Implements Screens `03-monthly-checklist` & `04-add-movement-modal`:
 * - iOS segmented filter (`Todos` | `Pendientes` | `Completados`)
 * - Single primary `+ Nuevo Movimiento` button opening a clean, distraction-free Liquid Glass form
 *   without repeating pre-existing items or catalog chips.
 * - Section-level Edit and Delete action controls for Ingresos and Gastos.
 * - In-situ row styling:
 *   - Normal: clean row without cluttering per-item action buttons.
 *   - Delete mode: row highlighted in soft red with a red trash button.
 *   - Edit mode: row displays pencil edit icon at right edge to open item editor.
 * - Full breakdown of Ingresos (Fijos / Variables) and Gastos (Fijos / Variables).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  CurrencyText,
  estimateTextWidth,
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
  toAppIsoDate,
  type Concept,
  type ConceptGroup,
  type ConceptType,
  type Debt,
  type MonthEntry,
  type MonthlyBudgetSummary,
  type RegisterOrCompleteMovementInput,
  type SavingsBucket,
} from '../../../domain';
import type {
  CreateCustomConceptInput,
  EditEntryUpdates,
} from '../../budget/store/useBudgetStore';

export type ChecklistFilterMode = 'all' | 'pending' | 'completed';

export interface ChecklistWorkspaceViewProps {
  monthKey: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  budget: MonthlyBudgetSummary;
  debts?: readonly Debt[];
  savingsBuckets?: readonly SavingsBucket[];
  onToggleEntry: (entry: MonthEntry) => void;
  onAddOrCompleteMovement: (
    input: RegisterOrCompleteMovementInput & {
      targetDebtId?: string | null;
      savingsBucketId?: string | null;
    }
  ) => void;
  onCreateCustomMovement?: (input: CreateCustomConceptInput) => void;
  onUpdateConcept?: (
    conceptId: string,
    updates: {
      name?: string;
      defaultAmount?: number;
      group?: ConceptGroup;
      targetDebtId?: string | null;
      savingsBucketId?: string | null;
      persistMonthly?: boolean;
    }
  ) => void;
  onDeleteConcept?: (conceptId: string) => void;
  onEditEntry?: (entryId: string, updates: EditEntryUpdates) => void;
  onDeleteEntry?: (entryId: string) => void;
  onRemoveRepeatableEntry: (entryId: string) => void;
}

interface ChecklistRowItemProps {
  entry: MonthEntry;
  concept?: Concept;
  linkedDebt?: Debt;
  linkedBucket?: SavingsBucket;
  isEditMode: boolean;
  isDeleteMode: boolean;
  colors: ReturnType<typeof useBFlowTheme>['colors'];
  spacing: ReturnType<typeof useBFlowTheme>['spacing'];
  radius: ReturnType<typeof useBFlowTheme>['radius'];
  onToggle: (entry: MonthEntry) => void;
  onEdit: (entry: MonthEntry) => void;
  onDelete: (entry: MonthEntry) => void;
}

const ACTION_REVEAL_IN_MS = 320;
const ACTION_REVEAL_OUT_MS = 200;
const ACTION_SLIDE_DISTANCE = 10;

/**
 * Soft reveal for the per-row edit / delete buttons: the slot grows from zero width
 * while the button fades and glides in from the right, so the row never "jumps".
 * Fades back out before unmounting. Animation is skipped under Jest.
 */
function ActionRevealSlot({
  visible,
  gap,
  children,
}: {
  visible: boolean;
  gap: number;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const skipMotion = process.env.NODE_ENV === 'test';
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (skipMotion) return;
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: ACTION_REVEAL_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: ACTION_REVEAL_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, skipMotion, progress]);

  if (skipMotion) return visible ? <>{children}</> : null;
  if (!mounted) return null;

  return (
    <Animated.View
      style={{
        width: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, MIN_TOUCH_TARGET_PT],
        }),
        marginLeft: progress.interpolate({ inputRange: [0, 1], outputRange: [-gap, 0] }),
        overflow: 'hidden',
        opacity: progress,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: MIN_TOUCH_TARGET_PT,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [ACTION_SLIDE_DISTANCE, 0],
              }),
            },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          ],
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const ChecklistRowItem = React.memo(function ChecklistRowItem({
  entry,
  concept,
  linkedDebt,
  linkedBucket,
  isEditMode,
  isDeleteMode,
  colors,
  spacing,
  radius,
  onToggle,
  onEdit,
  onDelete,
}: ChecklistRowItemProps) {
  const isCompleted = entry.status === 'completed';
  const isRepeatable = Boolean(concept?.allowMultiplePerMonth);

  const handleRowPress = () => {
    if (isDeleteMode) {
      // Deleting requires an explicit tap on the trash button; the row itself is inert
      // so a stray tap while scrolling can never remove an entry.
      return;
    }
    if (isEditMode) {
      hapticService.light();
      onEdit(entry);
    } else {
      hapticService.trigger(isCompleted ? 'light' : 'success');
      onToggle(entry);
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      <AppPressable
        testID={`checklist-workspace-item-${entry.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={`${entry.conceptName}, ${formatCurrency(entry.actualAmount)}`}
        onPress={handleRowPress}
        style={{
          flex: 1,
          minHeight: MIN_TOUCH_TARGET_PT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: isDeleteMode
            ? colors.semantic.expenseSoft
            : isCompleted
              ? colors.semantic.completedSoft
              : colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor: isDeleteMode
            ? colors.semantic.expense
            : isCompleted
              ? colors.glass.specularBorder
              : colors.glass.subtleBorder,
        }}
      >
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              flexWrap: 'wrap',
            }}
          >
            <AppText
              variant="body"
              color={isDeleteMode ? colors.semantic.expense : colors.text.primary}
            >
              {`${isCompleted ? '✓ ' : ''}${entry.conceptName}`}
            </AppText>
            {linkedBucket ? (
              <StatusBadge label={`→ ${linkedBucket.name}`} status="reserve" />
            ) : concept?.savingsContribution?.bucketId ? (
              <StatusBadge
                label={`→ ${concept.savingsContribution.bucketId === 'moto' ? 'Fondo de Reserva' : concept.savingsContribution.bucketId}`}
                status="reserve"
              />
            ) : null}
            {linkedDebt ? (
              <StatusBadge label={`→ ${linkedDebt.name}`} status="debt" />
            ) : concept?.linkedDebtGroup ? (
              <StatusBadge
                label={`→ Deuda ${concept.linkedDebtGroup !== 'FUNFAMI' ? `(${concept.linkedDebtGroup})` : ''}`.trim()}
                status="debt"
              />
            ) : null}
            {concept?.recurrence.kind === 'specific_months' ? (
              <StatusBadge label="Solo este mes" status="info" />
            ) : null}
            {isRepeatable ? <StatusBadge label="Múltiple/mes" status="info" /> : null}
          </View>
          <AppText
            variant="micro"
            color={isDeleteMode ? colors.semantic.expense : colors.text.secondary}
          >
            {isCompleted
              ? `${entry.type === 'income' ? 'Recibido' : 'Pagado'}${entry.completedAt ? ` · ${entry.completedAt}` : ''}${entry.note ? ` · ${entry.note}` : ''}`
              : `Pendiente · Previsto ${formatCurrency(entry.plannedAmount)}`}
          </AppText>
        </View>

        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <CurrencyText
            amount={entry.actualAmount}
            variant="body"
            tone={isDeleteMode ? 'expense' : entry.type === 'income' ? 'income' : 'expense'}
          />
        </View>
      </AppPressable>

      {/* In-situ Edit Action Button (only visible in edit mode) */}
      <ActionRevealSlot visible={isEditMode} gap={spacing.xs}>
        <AppPressable
          testID={`edit-entry-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${entry.conceptName}`}
          onPress={() => {
            hapticService.light();
            onEdit(entry);
          }}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <PencilEditIcon size={16} color={colors.semantic.income} />
        </AppPressable>
      </ActionRevealSlot>

      {/* In-situ Delete Action Button (only visible in delete mode) */}
      <ActionRevealSlot visible={isDeleteMode} gap={spacing.xs}>
        <AppPressable
          testID={`delete-entry-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${entry.conceptName}`}
          onPress={() => {
            hapticService.warning();
            onDelete(entry);
          }}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.semantic.expense,
            borderWidth: 1,
            borderColor: colors.semantic.expense,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TrashBinIcon size={16} color={colors.text.inverse} />
        </AppPressable>
      </ActionRevealSlot>
    </View>
  );
});

export function ChecklistWorkspaceView({
  monthKey,
  concepts,
  entries,
  budget,
  debts = [],
  savingsBuckets = [],
  onToggleEntry,
  onAddOrCompleteMovement,
  onCreateCustomMovement,
  onEditEntry,
  onDeleteEntry,
  onRemoveRepeatableEntry,
}: ChecklistWorkspaceViewProps): React.JSX.Element {
  const { colors, spacing, radius, typography } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [filterMode, setFilterMode] = useState<ChecklistFilterMode>('all');

  // In-situ section modes
  const [incomesEditMode, setIncomesEditMode] = useState(false);
  const [incomesDeleteMode, setIncomesDeleteMode] = useState(false);
  const [expensesEditMode, setExpensesEditMode] = useState(false);
  const [expensesDeleteMode, setExpensesDeleteMode] = useState(false);

  // Add Movement Modal state (Clean form without pre-existing items list)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<ConceptType>('expense');
  const [conceptNameInput, setConceptNameInput] = useState('');
  const [conceptGroup, setConceptGroup] = useState<ConceptGroup>('variable');
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [targetDebtId, setTargetDebtId] = useState<string | null>(null);
  const [savingsBucketId, setSavingsBucketId] = useState<string | null>(null);
  const [persistMonthly, setPersistMonthly] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Existing Item Modal state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [editAmountInput, setEditAmountInput] = useState('');
  const [editNoteInput, setEditNoteInput] = useState('');
  const [editTargetDebtId, setEditTargetDebtId] = useState<string | null>(null);
  const [editSavingsBucketId, setEditSavingsBucketId] = useState<string | null>(null);
  const [editPersistMonthly, setEditPersistMonthly] = useState<boolean>(true);
  const [editError, setEditError] = useState<string | null>(null);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.monthKey === monthKey),
    [entries, monthKey]
  );

  const filteredEntries = useMemo(() => {
    if (filterMode === 'pending') {
      return monthEntries.filter((e) => e.status === 'pending');
    }
    if (filterMode === 'completed') {
      return monthEntries.filter((e) => e.status === 'completed');
    }
    return monthEntries;
  }, [filterMode, monthEntries]);

  const pendingTotalCount = useMemo(
    () => monthEntries.filter((e) => e.status === 'pending').length,
    [monthEntries]
  );
  const completedTotalCount = useMemo(
    () => monthEntries.filter((e) => e.status === 'completed').length,
    [monthEntries]
  );

  const handleOpenAddModal = (type: ConceptType = 'expense') => {
    setMovementType(type);
    setConceptNameInput('');
    setConceptGroup('variable');
    setAmountInput('');
    setNoteInput('');
    setTargetDebtId(null);
    setSavingsBucketId(null);
    setPersistMonthly(true);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const parsedAmountPreview = useMemo(() => {
    const digits = amountInput.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }, [amountInput]);

  const parsedEditHeroAmount = useMemo(() => {
    const digits = editAmountInput.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }, [editAmountInput]);

  const activeEditingEntry = useMemo(
    () => (editingEntryId ? monthEntries.find((e) => e.id === editingEntryId) ?? null : null),
    [editingEntryId, monthEntries]
  );
  const isEditingExpense = activeEditingEntry?.type !== 'income';

  const handleSubmitMovement = () => {
    const trimmedName = conceptNameInput.trim();
    if (!trimmedName) {
      setFormError('Ingresa el nombre del movimiento.');
      return;
    }

    const digitsOnly = amountInput.replace(/[^0-9]/g, '');
    const parsedAmount = digitsOnly ? Number(digitsOnly) : 0;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setFormError('Ingresa un monto entero válido mayor a $ 0.');
      return;
    }

    // Check if entry exists in pending items to complete directly
    const existingPendingEntry = monthEntries.find(
      (e) =>
        e.conceptName.trim().toLowerCase() === trimmedName.toLowerCase() &&
        e.type === movementType &&
        e.status === 'pending'
    );

    if (existingPendingEntry) {
      onAddOrCompleteMovement({
        monthKey,
        conceptId: existingPendingEntry.conceptId,
        actualAmount: parsedAmount,
        completedAt: toAppIsoDate(),
        targetDebtId: movementType === 'expense' ? targetDebtId : null,
        savingsBucketId: movementType === 'expense' ? savingsBucketId : null,
        ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
      });
    } else if (onCreateCustomMovement) {
      onCreateCustomMovement({
        monthKey,
        name: trimmedName,
        type: movementType,
        group: conceptGroup,
        amount: parsedAmount,
        amountCop: parsedAmount,
        targetDebtId: movementType === 'expense' ? targetDebtId : null,
        savingsBucketId: movementType === 'expense' ? savingsBucketId : null,
        persistMonthly,
        ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
      });
    } else {
      const existingConcept = concepts.find(
        (c) =>
          c.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
          c.type === movementType
      );
      if (existingConcept) {
        onAddOrCompleteMovement({
          monthKey,
          conceptId: existingConcept.id,
          actualAmount: parsedAmount,
          completedAt: toAppIsoDate(),
          targetDebtId: movementType === 'expense' ? targetDebtId : null,
          savingsBucketId: movementType === 'expense' ? savingsBucketId : null,
          ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
        });
      }
    }

    setIsAddModalOpen(false);
    setFormError(null);
  };

  const handleOpenEditModal = (entry: MonthEntry) => {
    const concept = concepts.find((c) => c.id === entry.conceptId);
    setEditingEntryId(entry.id);
    setEditNameInput(entry.conceptName);
    setEditAmountInput(String(entry.actualAmount > 0 ? entry.actualAmount : entry.plannedAmount));
    setEditNoteInput(entry.note ?? '');
    setEditTargetDebtId(
      concept?.defaultTargetDebtId ??
        (concept?.linkedDebtGroup
          ? debts.find((d) => d.groupKey === concept.linkedDebtGroup)?.id ?? debts[0]?.id ?? null
          : null)
    );
    setEditSavingsBucketId(concept?.savingsContribution?.bucketId ?? null);
    setEditPersistMonthly(concept ? concept.recurrence.kind === 'monthly' : true);
    setEditError(null);
  };

  const handleSaveEditEntry = () => {
    if (!editingEntryId) return;
    if (!editNameInput.trim()) {
      setEditError('El nombre del movimiento no puede estar vacío.');
      return;
    }
    const digitsOnly = editAmountInput.replace(/[^0-9]/g, '');
    const parsedAmount = digitsOnly ? Number(digitsOnly) : 0;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setEditError('Ingresa un monto entero válido mayor a $ 0.');
      return;
    }

    const editingEntry = monthEntries.find((e) => e.id === editingEntryId);
    const isExpenseEntry = editingEntry?.type !== 'income';

    if (onEditEntry) {
      onEditEntry(editingEntryId, {
        conceptName: editNameInput.trim(),
        actualAmount: parsedAmount,
        plannedAmount: parsedAmount,
        targetDebtId: isExpenseEntry ? editTargetDebtId : null,
        savingsBucketId: isExpenseEntry ? editSavingsBucketId : null,
        persistMonthly: editPersistMonthly,
        ...(editNoteInput.trim() ? { note: editNoteInput.trim() } : {}),
      });
    }
    setEditingEntryId(null);
    setEditError(null);
  };

  const handleDeleteEntry = (entry: MonthEntry) => {
    if (onDeleteEntry) {
      onDeleteEntry(entry.id);
    } else {
      onRemoveRepeatableEntry(entry.id);
    }
  };

  const renderEntryRow = (entry: MonthEntry, isEditMode: boolean, isDeleteMode: boolean) => {
    const concept = concepts.find((c) => c.id === entry.conceptId);
    const linkedDebt = concept?.defaultTargetDebtId
      ? debts.find((d) => d.id === concept.defaultTargetDebtId)
      : concept?.linkedDebtGroup
        ? debts.find((d) => d.groupKey === concept.linkedDebtGroup)
        : undefined;
    const linkedBucket = concept?.savingsContribution?.bucketId
      ? savingsBuckets.find((b) => b.id === concept.savingsContribution?.bucketId)
      : undefined;

    return (
      <ChecklistRowItem
        key={entry.id}
        entry={entry}
        concept={concept}
        linkedDebt={linkedDebt}
        linkedBucket={linkedBucket}
        isEditMode={isEditMode}
        isDeleteMode={isDeleteMode}
        colors={colors}
        spacing={spacing}
        radius={radius}
        onToggle={onToggleEntry}
        onEdit={handleOpenEditModal}
        onDelete={handleDeleteEntry}
      />
    );
  };

  const fixedIncomes = filteredEntries.filter((e) => e.type === 'income' && e.group === 'fixed');
  const variableIncomes = filteredEntries.filter(
    (e) => e.type === 'income' && e.group === 'variable'
  );
  const fixedExpenses = filteredEntries.filter((e) => e.type === 'expense' && e.group === 'fixed');
  const variableExpenses = filteredEntries.filter(
    (e) => e.type === 'expense' && e.group === 'variable'
  );

  return (
    <View style={{ gap: spacing.md }} testID="checklist-workspace-view">
      {/* Top Action Bar: Header + Full-Width Add Movement CTA + Segmented Filter */}
      <GlassSurface elevated>
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
              <AppText variant="headline">Checklist del Mes</AppText>
            </View>
            <StatusBadge
              label={`${completedTotalCount}/${monthEntries.length} completados`}
              status={pendingTotalCount === 0 ? 'completed' : 'pending'}
            />
          </View>

          <AppPressable
            testID="open-add-movement-modal-button"
            accessibilityRole="button"
            accessibilityLabel="Agregar o completar movimiento"
            onPress={() => {
              hapticService.light();
              if (isAddModalOpen) {
                setIsAddModalOpen(false);
              } else {
                handleOpenAddModal('expense');
              }
            }}
            style={{
              width: '100%',
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.specularBorder,
              // Closed: the view's main action. Open: a quiet "Cerrar" toggle.
              ...(isAddModalOpen ? null : primaryAction.container),
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText
              variant="headline"
              color={
                isAddModalOpen
                  ? colors.text.primary
                  : (primaryAction.labelColor ?? colors.text.primary)
              }
            >
              {isAddModalOpen ? 'Cerrar' : '+ Nuevo Movimiento'}
            </AppText>
          </AppPressable>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(
              [
                { id: 'all', label: `Todos (${monthEntries.length})` },
                { id: 'pending', label: `Pendientes (${pendingTotalCount})` },
                { id: 'completed', label: `Completados (${completedTotalCount})` },
              ] as const
            ).map((seg) => {
              const active = filterMode === seg.id;
              return (
                <AppPressable
                  key={seg.id}
                  testID={`checklist-filter-${seg.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticService.selection();
                    setFilterMode(seg.id);
                  }}
                  style={{
                    // Equal thirds while every label fits on one line; a chip that would
                    // truncate (narrow phone, larger web type) wraps to its own row instead.
                    flex: 1,
                    minWidth:
                      estimateTextWidth(
                        seg.label,
                        typography.micro.fontSize,
                        typography.micro.letterSpacing
                      ) +
                      spacing.sm * 2,
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.xxs,
                    borderRadius: radius.md,
                    borderCurve: 'continuous',
                    backgroundColor: active
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="micro"
                    numberOfLines={1}
                    color={active ? colors.text.primary : colors.text.secondary}
                  >
                    {seg.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
        </View>
      </GlassSurface>

      {/* Edit Existing Item Sheet */}
      {editingEntryId ? (
        <GlassSurface elevated testID="edit-entry-modal-card">
          <View style={{ gap: spacing.md }}>
            {/* Header: Title + Close Button */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <AppText variant="title2">
                  {isEditingExpense ? 'Editar Gasto' : 'Editar Ingreso'}
                </AppText>
                <View
                  style={{
                    paddingHorizontal: spacing.xs,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                    backgroundColor: isEditingExpense
                      ? colors.semantic.expenseSoft
                      : colors.semantic.incomeSoft,
                  }}
                >
                  <AppText
                    variant="micro"
                    color={
                      isEditingExpense ? colors.semantic.expense : colors.semantic.income
                    }
                  >
                    {isEditingExpense ? 'Gasto' : 'Ingreso'}
                  </AppText>
                </View>
              </View>

              <AppPressable
                testID="close-edit-entry-modal-button"
                accessibilityRole="button"
                accessibilityLabel="Cerrar modal de edición"
                onPress={() => setEditingEntryId(null)}
                style={{
                  minHeight: 36,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.text.secondary}>
                  ✕ Cerrar
                </AppText>
              </AppPressable>
            </View>

            {/* Hero Amount Input Card with Live Formatted Preview */}
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.glass.surfaceElevatedTint,
                borderWidth: 1,
                borderColor: colors.glass.specularBorder,
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <AppText variant="caption" color={colors.text.secondary}>
                {isEditingExpense ? 'Monto a pagar' : 'Monto a recibir'}
              </AppText>
              <CurrencyText
                amount={parsedEditHeroAmount}
                variant="heroCurrency"
                tone={isEditingExpense ? 'expense' : 'income'}
              />
              <AppTextInput
                testID="edit-entry-amount-input"
                value={editAmountInput}
                onChangeText={setEditAmountInput}
                keyboardType="numeric"
                placeholder="0"
                style={{
                  textAlign: 'center',
                  fontSize: 20,
                  width: '100%',
                  marginTop: spacing.xxs,
                }}
              />
            </View>

            {/* Concept Name Input */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nombre del ítem o movimiento:
              </AppText>
              <AppTextInput
                testID="edit-entry-name-input"
                value={editNameInput}
                onChangeText={setEditNameInput}
                placeholder={
                  isEditingExpense
                    ? 'Ej. Supermercado, Alquiler, Gasolina...'
                    : 'Ej. Salario, Rendimientos, Bono...'
                }
              />
            </View>

            {/* Note Input */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nota opcional:
              </AppText>
              <AppTextInput
                testID="edit-entry-note-input"
                value={editNoteInput}
                onChangeText={setEditNoteInput}
                placeholder="Ej. Factura, referencia, detalle..."
              />
            </View>

            {/* Adjustable Debt & Savings Linkage when editing an expense */}
            {isEditingExpense ? (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="micro" color={colors.text.secondary}>
                  Vincular pago a una deuda (opcional):
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <AppPressable
                    testID="edit-entry-debt-none"
                    accessibilityRole="button"
                    onPress={() => {
                      hapticService.selection();
                      setEditTargetDebtId(null);
                    }}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.pill,
                      backgroundColor:
                        editTargetDebtId === null
                          ? colors.glass.surfaceElevatedTint
                          : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor:
                        editTargetDebtId === null
                          ? colors.glass.specularBorder
                          : colors.glass.subtleBorder,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="micro">Ninguna deuda</AppText>
                  </AppPressable>
                  {debts.map((debt) => {
                    const isLinked = editTargetDebtId === debt.id;
                    return (
                      <AppPressable
                        key={debt.id}
                        testID={`edit-entry-debt-${debt.id}`}
                        accessibilityRole="button"
                        onPress={() => {
                          hapticService.selection();
                          setEditTargetDebtId(debt.id);
                        }}
                        style={{
                          minHeight: 36,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.pill,
                          backgroundColor: isLinked
                            ? colors.semantic.debtSoft
                            : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: isLinked
                            ? colors.glass.specularBorder
                            : colors.glass.subtleBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <AppText
                          variant="micro"
                          color={isLinked ? colors.semantic.debt : colors.text.primary}
                        >
                          {`→ ${debt.name}`}
                        </AppText>
                      </AppPressable>
                    );
                  })}
                </View>

                {savingsBuckets.length > 0 ? (
                  <>
                    <AppText variant="micro" color={colors.text.secondary}>
                      Vincular gasto a un fondo de ahorro (opcional):
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      <AppPressable
                        testID="edit-entry-bucket-none"
                        accessibilityRole="button"
                        onPress={() => {
                          hapticService.selection();
                          setEditSavingsBucketId(null);
                        }}
                        style={{
                          minHeight: 36,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.pill,
                          backgroundColor:
                            editSavingsBucketId === null
                              ? colors.glass.surfaceElevatedTint
                              : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor:
                            editSavingsBucketId === null
                              ? colors.glass.specularBorder
                              : colors.glass.subtleBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <AppText variant="micro">Ningún fondo</AppText>
                      </AppPressable>
                      {savingsBuckets.map((bucket) => {
                        const isLinked = editSavingsBucketId === bucket.id;
                        return (
                          <AppPressable
                            key={bucket.id}
                            testID={`edit-entry-bucket-${bucket.id}`}
                            accessibilityRole="button"
                            onPress={() => {
                              hapticService.selection();
                              setEditSavingsBucketId(bucket.id);
                            }}
                            style={{
                              minHeight: 36,
                              paddingHorizontal: spacing.sm,
                              borderRadius: radius.pill,
                              backgroundColor: isLinked
                                ? colors.semantic.savingsSoft
                                : colors.glass.surfaceTint,
                              borderWidth: 1,
                              borderColor: isLinked
                                ? colors.glass.specularBorder
                                : colors.glass.subtleBorder,
                              justifyContent: 'center',
                            }}
                          >
                            <AppText
                              variant="micro"
                              color={isLinked ? colors.semantic.savings : colors.text.primary}
                            >
                              {`→ ${bucket.name}`}
                            </AppText>
                          </AppPressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Month-to-month persistence toggle */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Frecuencia:
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {(
                  [
                    { value: true, label: 'Persiste cada mes' },
                    { value: false, label: 'Solo este mes' },
                  ] as const
                ).map((opt) => {
                  const active = editPersistMonthly === opt.value;
                  return (
                    <AppPressable
                      key={String(opt.value)}
                      testID={`edit-entry-persist-${opt.value ? 'monthly' : 'once'}`}
                      accessibilityRole="button"
                      onPress={() => {
                        hapticService.selection();
                        setEditPersistMonthly(opt.value);
                      }}
                      style={{
                        flex: 1,
                        minHeight: 38,
                        borderRadius: radius.md,
                        backgroundColor: active
                          ? colors.semantic.incomeSoft
                          : colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText
                        variant="micro"
                        color={active ? colors.semantic.income : colors.text.secondary}
                      >
                        {opt.label}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </View>
            </View>

            {editError ? (
              <View
                style={{
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.semantic.expenseSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.expense,
                }}
              >
                <AppText variant="caption" color={colors.semantic.expense}>
                  {editError}
                </AppText>
              </View>
            ) : null}

            <AppPressable
              testID="save-edit-entry-button"
              accessibilityRole="button"
              onPress={handleSaveEditEntry}
              style={{
                width: '100%',
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
              <AppText variant="headline" color={colors.semantic.income}>
                Guardar Cambios
              </AppText>
            </AppPressable>
          </View>
        </GlassSurface>
      ) : null}

      {/* Screen 04: Liquid Glass Add Movement Form (Clean & Direct, NO repeated items list) */}
      <RevealDown visible={isAddModalOpen}>
        <GlassSurface elevated testID="add-movement-modal-card">
          <View style={{ gap: spacing.md }}>
            {/* Header: Title (closing is done from the toggle button above) */}
            <AppText variant="title2">Nuevo Movimiento</AppText>

            {/* Segmented Type: Gasto vs Ingreso */}
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(
                [
                  { type: 'expense', label: 'Gasto' },
                  { type: 'income', label: 'Ingreso' },
                ] as const
              ).map((tab) => {
                const isSelected = movementType === tab.type;
                const isExpense = tab.type === 'expense';
                return (
                  <AppPressable
                    key={tab.type}
                    testID={`modal-type-${tab.type}`}
                    accessibilityRole="button"
                    onPress={() => {
                      hapticService.selection();
                      setMovementType(tab.type);
                    }}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      borderRadius: radius.md,
                      backgroundColor: isSelected
                        ? isExpense
                          ? colors.semantic.expenseSoft
                          : colors.semantic.incomeSoft
                        : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: isSelected
                        ? isExpense
                          ? colors.semantic.expense
                          : colors.semantic.income
                        : colors.glass.subtleBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText
                      variant="caption"
                      color={
                        isSelected
                          ? isExpense
                            ? colors.semantic.expense
                            : colors.semantic.income
                          : colors.text.secondary
                      }
                    >
                      {tab.label}
                    </AppText>
                  </AppPressable>
                );
              })}
            </View>

            {/* Hero Amount Input Card with Live Formatted Preview */}
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.glass.surfaceElevatedTint,
                borderWidth: 1,
                borderColor: colors.glass.specularBorder,
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <AppText variant="caption" color={colors.text.secondary}>
                {movementType === 'income' ? 'Monto a recibir' : 'Monto a pagar'}
              </AppText>
              <CurrencyText
                amount={parsedAmountPreview}
                variant="heroCurrency"
                tone={movementType === 'income' ? 'income' : 'expense'}
              />
              <AppTextInput
                testID="movement-amount-input"
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="numeric"
                placeholder="0"
                style={{
                  textAlign: 'center',
                  fontSize: 20,
                  width: '100%',
                  marginTop: spacing.xxs,
                }}
              />
            </View>

            {/* Concept Name Input */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nombre del ítem o movimiento:
              </AppText>
              <AppTextInput
                testID="custom-concept-name-input"
                value={conceptNameInput}
                onChangeText={setConceptNameInput}
                placeholder={
                  movementType === 'income'
                    ? 'Ej. Salario, Rendimientos, Bono...'
                    : 'Ej. Supermercado, Alquiler, Gasolina...'
                }
              />
            </View>

            {/* Concept Group: Fijo vs Variable */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Clasificación:
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {(
                  [
                    { id: 'fixed', label: movementType === 'income' ? 'Ingreso Fijo' : 'Gasto Fijo' },
                    { id: 'variable', label: movementType === 'income' ? 'Ingreso Variable' : 'Gasto Variable' },
                  ] as const
                ).map((g) => {
                  const active = conceptGroup === g.id;
                  return (
                    <AppPressable
                      key={g.id}
                      testID={`custom-group-${g.id}`}
                      accessibilityRole="button"
                      onPress={() => {
                        hapticService.selection();
                        setConceptGroup(g.id);
                      }}
                      style={{
                        flex: 1,
                        minHeight: 38,
                        borderRadius: radius.md,
                        backgroundColor: active
                          ? colors.glass.surfaceElevatedTint
                          : colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: active
                          ? colors.glass.specularBorder
                          : colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText
                        variant="caption"
                        color={active ? colors.text.primary : colors.text.secondary}
                      >
                        {g.label}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </View>
            </View>

            {/* Note Input */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nota opcional:
              </AppText>
              <AppTextInput
                testID="movement-note-input"
                value={noteInput}
                onChangeText={setNoteInput}
                placeholder="Ej. Factura No. 45, PSE, compra quincenal..."
              />
            </View>

            {/* Adjustable Debt & Savings Fund Linkage for Expense Movements */}
            {movementType === 'expense' ? (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="micro" color={colors.text.secondary}>
                  Vincular pago a una deuda (opcional):
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <AppPressable
                    testID="add-movement-debt-none"
                    accessibilityRole="button"
                    onPress={() => setTargetDebtId(null)}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.pill,
                      backgroundColor:
                        targetDebtId === null
                          ? colors.glass.surfaceElevatedTint
                          : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor:
                        targetDebtId === null
                          ? colors.glass.specularBorder
                          : colors.glass.subtleBorder,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="micro">Ninguna deuda</AppText>
                  </AppPressable>
                  {debts.map((debt) => {
                    const isLinked = targetDebtId === debt.id;
                    return (
                      <AppPressable
                        key={debt.id}
                        testID={`add-movement-debt-${debt.id}`}
                        accessibilityRole="button"
                        onPress={() => setTargetDebtId(debt.id)}
                        style={{
                          minHeight: 36,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.pill,
                          backgroundColor: isLinked
                            ? colors.semantic.debtSoft
                            : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: isLinked
                            ? colors.glass.specularBorder
                            : colors.glass.subtleBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <AppText
                          variant="micro"
                          color={isLinked ? colors.semantic.debt : colors.text.primary}
                        >
                          {`→ ${debt.name}`}
                        </AppText>
                      </AppPressable>
                    );
                  })}
                </View>

                {savingsBuckets.length > 0 ? (
                  <>
                    <AppText variant="micro" color={colors.text.secondary}>
                      Vincular gasto a un fondo de ahorro (opcional):
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      <AppPressable
                        testID="add-movement-bucket-none"
                        accessibilityRole="button"
                        onPress={() => setSavingsBucketId(null)}
                        style={{
                          minHeight: 36,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.pill,
                          backgroundColor:
                            savingsBucketId === null
                              ? colors.glass.surfaceElevatedTint
                              : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor:
                            savingsBucketId === null
                              ? colors.glass.specularBorder
                              : colors.glass.subtleBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <AppText variant="micro">Ningún fondo</AppText>
                      </AppPressable>
                      {savingsBuckets.map((bucket) => {
                        const isLinked = savingsBucketId === bucket.id;
                        return (
                          <AppPressable
                            key={bucket.id}
                            testID={`add-movement-bucket-${bucket.id}`}
                            accessibilityRole="button"
                            onPress={() => setSavingsBucketId(bucket.id)}
                            style={{
                              minHeight: 36,
                              paddingHorizontal: spacing.sm,
                              borderRadius: radius.pill,
                              backgroundColor: isLinked
                                ? colors.semantic.savingsSoft
                                : colors.glass.surfaceTint,
                              borderWidth: 1,
                              borderColor: isLinked
                                ? colors.glass.specularBorder
                                : colors.glass.subtleBorder,
                              justifyContent: 'center',
                            }}
                          >
                            <AppText
                              variant="micro"
                              color={isLinked ? colors.semantic.savings : colors.text.primary}
                            >
                              {`→ ${bucket.name}`}
                            </AppText>
                          </AppPressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Month-to-month persistence toggle */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Frecuencia:
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {(
                  [
                    { value: true, label: 'Persiste cada mes' },
                    { value: false, label: 'Solo este mes' },
                  ] as const
                ).map((opt) => {
                  const active = persistMonthly === opt.value;
                  return (
                    <AppPressable
                      key={String(opt.value)}
                      testID={`add-movement-persist-${opt.value ? 'monthly' : 'once'}`}
                      accessibilityRole="button"
                      onPress={() => setPersistMonthly(opt.value)}
                      style={{
                        flex: 1,
                        minHeight: 38,
                        borderRadius: radius.md,
                        backgroundColor: active
                          ? colors.semantic.incomeSoft
                          : colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: active
                          ? colors.glass.specularBorder
                          : colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText
                        variant="micro"
                        color={active ? colors.semantic.income : colors.text.secondary}
                      >
                        {opt.label}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </View>
            </View>

            {formError ? (
              <AppText variant="caption" color={colors.semantic.expense}>
                {formError}
              </AppText>
            ) : null}

            {/* Submit Button */}
            <AppPressable
              testID="submit-movement-button"
              accessibilityRole="button"
              onPress={handleSubmitMovement}
              style={{
                width: '100%',
                minHeight: MIN_TOUCH_TARGET_PT,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                ...primaryAction.container,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText
                variant="headline"
                color={
                  primaryAction.labelColor ??
                  (movementType === 'income' ? colors.semantic.income : colors.semantic.expense)
                }
              >
                {movementType === 'income' ? 'Registrar Ingreso' : 'Registrar Gasto'}
              </AppText>
            </AppPressable>
          </View>
        </GlassSurface>
      </RevealDown>

      {/* Wide windows place income and expenses side by side; phones stack them. */}
      <ResponsiveColumns testID="checklist-sections">
        {/* Section 1: INGRESOS */}
        <GlassSurface testID="checklist-incomes-section">
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
              <View style={{ gap: spacing.xxs, flexShrink: 1, minWidth: 0 }}>
                <AppText variant="title2">Ingresos</AppText>
                <AppText variant="caption" color={colors.semantic.income}>
                  {`Recibido ${formatCurrency(budget.receivedIncome)} / Previsto ${formatCurrency(budget.plannedIncome)}`}
                </AppText>
              </View>

              {/* Incomes Section Action Controls: Editar & Eliminar */}
              <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                <AppPressable
                  testID="incomes-edit-action-button"
                  accessibilityRole="button"
                  accessibilityLabel="Editar ingresos"
                  onPress={() => {
                    hapticService.light();
                    setIncomesEditMode((prev) => !prev);
                    setIncomesDeleteMode(false);
                  }}
                  style={{
                    minHeight: 34,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radius.pill,
                    backgroundColor: incomesEditMode
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: incomesEditMode
                      ? colors.glass.specularBorder
                      : colors.glass.subtleBorder,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xxs,
                  }}
                >
                  <PencilEditIcon
                    size={14}
                    color={incomesEditMode ? colors.semantic.income : colors.text.secondary}
                  />
                  <AppText
                    variant="micro"
                    color={incomesEditMode ? colors.semantic.income : colors.text.secondary}
                  >
                    {incomesEditMode ? 'Listo' : 'Editar'}
                  </AppText>
                </AppPressable>

                <AppPressable
                  testID="incomes-delete-action-button"
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar ingresos"
                  onPress={() => {
                    hapticService.warning();
                    setIncomesDeleteMode((prev) => !prev);
                    setIncomesEditMode(false);
                  }}
                  style={{
                    minHeight: 34,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radius.pill,
                    backgroundColor: incomesDeleteMode
                      ? colors.semantic.expense
                      : colors.semantic.expenseSoft,
                    borderWidth: 1,
                    borderColor: colors.semantic.expense,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xxs,
                  }}
                >
                  <TrashBinIcon
                    size={14}
                    color={incomesDeleteMode ? colors.text.inverse : colors.semantic.expense}
                  />
                  <AppText
                    variant="micro"
                    color={incomesDeleteMode ? colors.text.inverse : colors.semantic.expense}
                  >
                    {incomesDeleteMode ? 'Listo' : 'Eliminar'}
                  </AppText>
                </AppPressable>
              </View>
            </View>

            <AppText variant="caption" color={colors.text.secondary}>
              {`Ingresos Fijos · Pendiente: ${formatCurrency(budget.incomeByGroup.fixed.pending)}`}
            </AppText>
            {fixedIncomes.map((entry) => renderEntryRow(entry, incomesEditMode, incomesDeleteMode))}

            <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                {`Ingresos Variables · Recibido: ${formatCurrency(budget.incomeByGroup.variable.paid)}`}
              </AppText>
              {variableIncomes.map((entry) =>
                renderEntryRow(entry, incomesEditMode, incomesDeleteMode)
              )}
            </View>
          </View>
        </GlassSurface>

        {/* Section 2: GASTOS */}
        <GlassSurface testID="checklist-expenses-section">
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
              <View style={{ gap: spacing.xxs, flexShrink: 1, minWidth: 0 }}>
                <AppText variant="title2">Gastos</AppText>
                <AppText variant="caption" color={colors.semantic.expense}>
                  {`Pagado ${formatCurrency(budget.paidExpenses)} / Previsto ${formatCurrency(budget.plannedExpenses)}`}
                </AppText>
              </View>

              {/* Expenses Section Action Controls: Editar & Eliminar */}
              <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                <AppPressable
                  testID="expenses-edit-action-button"
                  accessibilityRole="button"
                  accessibilityLabel="Editar gastos"
                  onPress={() => {
                    hapticService.light();
                    setExpensesEditMode((prev) => !prev);
                    setExpensesDeleteMode(false);
                  }}
                  style={{
                    minHeight: 34,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radius.pill,
                    backgroundColor: expensesEditMode
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: expensesEditMode
                      ? colors.glass.specularBorder
                      : colors.glass.subtleBorder,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xxs,
                  }}
                >
                  <PencilEditIcon
                    size={14}
                    color={expensesEditMode ? colors.semantic.income : colors.text.secondary}
                  />
                  <AppText
                    variant="micro"
                    color={expensesEditMode ? colors.semantic.income : colors.text.secondary}
                  >
                    {expensesEditMode ? 'Listo' : 'Editar'}
                  </AppText>
                </AppPressable>

                <AppPressable
                  testID="expenses-delete-action-button"
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar gastos"
                  onPress={() => {
                    hapticService.warning();
                    setExpensesDeleteMode((prev) => !prev);
                    setExpensesEditMode(false);
                  }}
                  style={{
                    minHeight: 34,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radius.pill,
                    backgroundColor: expensesDeleteMode
                      ? colors.semantic.expense
                      : colors.semantic.expenseSoft,
                    borderWidth: 1,
                    borderColor: colors.semantic.expense,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xxs,
                  }}
                >
                  <TrashBinIcon
                    size={14}
                    color={expensesDeleteMode ? colors.text.inverse : colors.semantic.expense}
                  />
                  <AppText
                    variant="micro"
                    color={expensesDeleteMode ? colors.text.inverse : colors.semantic.expense}
                  >
                    {expensesDeleteMode ? 'Listo' : 'Eliminar'}
                  </AppText>
                </AppPressable>
              </View>
            </View>

            <AppText variant="caption" color={colors.text.secondary}>
              {`Gastos Fijos (${formatCurrency(budget.expensesByGroup.fixed.paid)} pagados · ${formatCurrency(budget.expensesByGroup.fixed.pending)} pendientes)`}
            </AppText>
            {fixedExpenses.map((entry) => renderEntryRow(entry, expensesEditMode, expensesDeleteMode))}

            <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                {`Gastos Variables (${formatCurrency(budget.expensesByGroup.variable.paid)} pagados · ${formatCurrency(budget.expensesByGroup.variable.pending)} pendientes)`}
              </AppText>
              {variableExpenses.map((entry) =>
                renderEntryRow(entry, expensesEditMode, expensesDeleteMode)
              )}
            </View>
          </View>
        </GlassSurface>
      </ResponsiveColumns>
    </View>
  );
}
