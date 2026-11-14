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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import {
  AppPressable,
  AppText,
  CheckIndicator,
  CurrencyText,
  estimateTextWidth,
  GlassSurface,
  hapticService,
  IS_MOTION_STATIC,
  MIN_TOUCH_TARGET_PT,
  PencilEditIcon,
  resolvePresenceSpec,
  ResponsiveColumns,
  RevealDown,
  StatusBadge,
  toEasing,
  TrashBinIcon,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatCurrency,
  type Concept,
  type ConceptGroup,
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
import { ChecklistAddMovementForm } from './ChecklistAddMovementForm';
import { ChecklistEditEntryForm } from './ChecklistEditEntryForm';

const NO_DEBTS: readonly Debt[] = [];
const NO_SAVINGS_BUCKETS: readonly SavingsBucket[] = [];

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

/**
 * Soft reveal for the per-row edit / delete buttons: the slot grows from zero width
 * while the button fades and glides in from the right, so the row never "jumps".
 * Fades back out before unmounting. Timing and travel come from the `control` motion spec.
 * Animation is skipped under Jest.
 */
export function ActionRevealSlot({
  visible,
  gap,
  children,
}: {
  visible: boolean;
  gap: number;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const skipMotion = IS_MOTION_STATIC;
  const { skin, reducedMotion } = useBFlowTheme();
  const { open, close } = resolvePresenceSpec({ skin, reducedMotion }, 'control');
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  // Only animate out after the slot has actually been opened; mounting with `visible={false}`
  // must stay completely inert so opening Checklist never triggers 24-40 JS animations at once.
  const hasBeenVisibleRef = useRef(visible);

  useEffect(() => {
    if (skipMotion) return undefined;
    if (visible) {
      hasBeenVisibleRef.current = true;
      setMounted(true);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: open.durationMs,
        easing: toEasing(open.easing),
        useNativeDriver: false,
      });
      anim.start();
      return () => anim.stop();
    }
    if (!hasBeenVisibleRef.current) {
      return undefined;
    }
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: close.durationMs,
      easing: toEasing(close.easing),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) {
        hasBeenVisibleRef.current = false;
        setMounted(false);
      }
    });
    return () => anim.stop();
    // The spec only changes with the skin or the Reduce Motion setting, never mid-reveal.
  }, [visible, skipMotion, progress]); // eslint-disable-line react-hooks/exhaustive-deps

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
                outputRange: [open.distance, 0],
              }),
            },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [open.scale, 1] }) },
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
        <CheckIndicator checked={isCompleted} />
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
              {entry.conceptName}
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
          onPress={() => onDelete(entry)}
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
  debts = NO_DEBTS,
  savingsBuckets = NO_SAVINGS_BUCKETS,
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

  // The add and edit forms own their field state (R-17); the view only knows which is open.
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormKey, setAddFormKey] = useState(0);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const conceptById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept] as const)),
    [concepts]
  );

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

  const handleOpenAddModal = () => {
    // A new key remounts the form, so every field starts empty.
    setAddFormKey((key) => key + 1);
    setIsAddModalOpen(true);
  };
  const handleCloseAddForm = useCallback(() => setIsAddModalOpen(false), []);

  const activeEditingEntry = useMemo(
    () => (editingEntryId ? monthEntries.find((e) => e.id === editingEntryId) ?? null : null),
    [editingEntryId, monthEntries]
  );
  const handleCloseEditor = useCallback(() => setEditingEntryId(null), []);

  // Stable row handlers so the memoized rows skip re-rendering (R-16).
  const handleOpenEditModal = useCallback((entry: MonthEntry) => {
    setEditingEntryId(entry.id);
  }, []);

  const handleDeleteEntry = useCallback(
    (entry: MonthEntry) => {
      if (onDeleteEntry) {
        onDeleteEntry(entry.id);
      } else {
        onRemoveRepeatableEntry(entry.id);
      }
    },
    [onDeleteEntry, onRemoveRepeatableEntry]
  );

  const renderEntryRow = (entry: MonthEntry, isEditMode: boolean, isDeleteMode: boolean) => {
    const concept = conceptById.get(entry.conceptId);
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
              pulseOnChange
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
                handleOpenAddModal();
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
      <RevealDown visible={Boolean(editingEntryId)}>
        <ChecklistEditEntryForm
          key={editingEntryId}
          entry={activeEditingEntry}
          concept={activeEditingEntry ? conceptById.get(activeEditingEntry.conceptId) : undefined}
          debts={debts}
          savingsBuckets={savingsBuckets}
          onEditEntry={onEditEntry}
          onClose={handleCloseEditor}
        />
      </RevealDown>

      {/* Screen 04: Liquid Glass Add Movement Form (Clean & Direct, NO repeated items list) */}
      <RevealDown visible={isAddModalOpen}>
        <ChecklistAddMovementForm
          key={addFormKey}
          monthKey={monthKey}
          monthEntries={monthEntries}
          concepts={concepts}
          debts={debts}
          savingsBuckets={savingsBuckets}
          onAddOrCompleteMovement={onAddOrCompleteMovement}
          onCreateCustomMovement={onCreateCustomMovement}
          onSubmitted={handleCloseAddForm}
        />
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
                    // Entering the delete mode warns; leaving it is a plain tap.
                    hapticService.trigger(incomesDeleteMode ? 'light' : 'warning');
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
                    hapticService.trigger(expensesDeleteMode ? 'light' : 'warning');
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
