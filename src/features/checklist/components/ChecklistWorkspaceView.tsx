/**
 * src/features/checklist/components/ChecklistWorkspaceView.tsx
 *
 * Implements Screens `03-monthly-checklist` & `04-add-movement-modal`:
 * - iOS segmented filter (`Todos` | `Pendientes` | `Completados`)
 * - Single primary `+ Nuevo Movimiento` button (supports existing catalog concepts & custom items)
 * - Full breakdown of Ingresos (Fijos / Variables) and Gastos (Fijos / Variables)
 * - Edit (`✎`) and Delete (`✕`) actions on every existing or newly created item
 */

import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  AppTextInput,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  PencilEditIcon,
  StatusBadge,
  TrashBinIcon,
  hapticService,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCurrency,
  getAvailableConcepts,
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
  onUpdateConcept,
  onDeleteConcept,
  onEditEntry,
  onDeleteEntry,
  onRemoveRepeatableEntry,
}: ChecklistWorkspaceViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const [filterMode, setFilterMode] = useState<ChecklistFilterMode>('all');

  // Add Movement Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ConceptType>('expense');
  const [isCustomConceptMode, setIsCustomConceptMode] = useState(false);
  const [customConceptName, setCustomConceptName] = useState('');
  const [customConceptGroup, setCustomConceptGroup] = useState<ConceptGroup>('variable');
  const [selectedConceptId, setSelectedConceptId] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [selectedTargetDebtId, setSelectedTargetDebtId] = useState<string | null>(null);
  const [selectedSavingsBucketId, setSelectedSavingsBucketId] = useState<string | null>(null);
  const [persistMonthly, setPersistMonthly] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Concept Edit / Delete state
  const [isEditingConcept, setIsEditingConcept] = useState(false);
  const [conceptEditName, setConceptEditName] = useState('');
  const [conceptEditAmount, setConceptEditAmount] = useState('');
  const [conceptEditGroup, setConceptEditGroup] = useState<ConceptGroup>('variable');
  const [confirmDeleteConceptId, setConfirmDeleteConceptId] = useState<string | null>(null);

  // Edit Existing Item Modal state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState<string>('');
  const [editAmountInput, setEditAmountInput] = useState<string>('');
  const [editNoteInput, setEditNoteInput] = useState<string>('');
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

  const availableConcepts = useMemo(
    () => getAvailableConcepts(concepts, entries, monthKey, selectedType),
    [concepts, entries, monthKey, selectedType]
  );

  const activeSelectedConcept = useMemo(
    () =>
      availableConcepts.find((c) => c.id === selectedConceptId) ?? availableConcepts[0] ?? null,
    [availableConcepts, selectedConceptId]
  );

  const pendingTotalCount = useMemo(
    () => monthEntries.filter((e) => e.status === 'pending').length,
    [monthEntries]
  );
  const completedTotalCount = useMemo(
    () => monthEntries.filter((e) => e.status === 'completed').length,
    [monthEntries]
  );

  const handleOpenAddModal = (type: ConceptType) => {
    setSelectedType(type);
    setIsCustomConceptMode(false);
    setCustomConceptName('');
    setIsEditingConcept(false);
    setConfirmDeleteConceptId(null);
    const avail = getAvailableConcepts(concepts, entries, monthKey, type);
    const first = avail[0];
    setSelectedConceptId(first?.id ?? '');
    setAmountInput(first && first.defaultAmount > 0 ? String(first.defaultAmount) : '');
    setSelectedTargetDebtId(first?.defaultTargetDebtId ?? null);
    setSelectedSavingsBucketId(first?.savingsContribution?.bucketId ?? null);
    setPersistMonthly(first ? first.recurrence.kind === 'monthly' : true);
    setNoteInput('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSelectConceptChip = (concept: Concept) => {
    setIsCustomConceptMode(false);
    setSelectedConceptId(concept.id);
    setAmountInput(concept.defaultAmount > 0 ? String(concept.defaultAmount) : '');
    setSelectedTargetDebtId(concept.defaultTargetDebtId ?? null);
    setSelectedSavingsBucketId(concept.savingsContribution?.bucketId ?? null);
    setPersistMonthly(concept.recurrence.kind === 'monthly');
    setIsEditingConcept(false);
    setConfirmDeleteConceptId(null);
    setFormError(null);
  };

  const handleSaveConceptChanges = () => {
    if (!activeSelectedConcept) return;
    if (!conceptEditName.trim()) {
      setFormError('El nombre del concepto no puede estar vacío.');
      return;
    }
    const digitsOnly = conceptEditAmount.replace(/[^0-9]/g, '');
    const parsedAmount = digitsOnly ? Number(digitsOnly) : 0;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount < 0) {
      setFormError('Ingresa un monto entero válido mayor o igual a $ 0.');
      return;
    }

    if (onUpdateConcept) {
      onUpdateConcept(activeSelectedConcept.id, {
        name: conceptEditName.trim(),
        defaultAmount: parsedAmount,
        group: conceptEditGroup,
        targetDebtId: selectedType === 'expense' ? selectedTargetDebtId : null,
        savingsBucketId: selectedType === 'expense' ? selectedSavingsBucketId : null,
        persistMonthly,
      });
    }
    setIsEditingConcept(false);
    setFormError(null);
  };

  const handleSubmitMovement = () => {
    const digitsOnly = amountInput.replace(/[^0-9]/g, '');

    if (isCustomConceptMode) {
      if (!customConceptName.trim()) {
        setFormError('Ingresa el nombre del nuevo ítem.');
        return;
      }
      const parsedCustomAmount = digitsOnly ? Number(digitsOnly) : 0;
      if (!Number.isSafeInteger(parsedCustomAmount) || parsedCustomAmount <= 0) {
        setFormError('Ingresa un monto entero mayor a $ 0 en pesos colombianos.');
        return;
      }
      if (onCreateCustomMovement) {
        onCreateCustomMovement({
          monthKey,
          name: customConceptName.trim(),
          type: selectedType,
          group: customConceptGroup,
          amount: parsedCustomAmount,
          amountCop: parsedCustomAmount,
          targetDebtId: selectedType === 'expense' ? selectedTargetDebtId : null,
          savingsBucketId: selectedType === 'expense' ? selectedSavingsBucketId : null,
          persistMonthly,
          ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
        });
      }
      setIsAddModalOpen(false);
      setFormError(null);
      return;
    }

    if (!activeSelectedConcept) {
      setFormError('No hay conceptos disponibles en esta categoría para este mes.');
      return;
    }

    const parsedAmount = digitsOnly ? Number(digitsOnly) : activeSelectedConcept.defaultAmount;

    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setFormError('Ingresa un monto entero válido mayor a 0.');
      return;
    }

    onAddOrCompleteMovement({
      monthKey,
      conceptId: activeSelectedConcept.id,
      actualAmount: parsedAmount,
      completedAt: toAppIsoDate(),
      targetDebtId: selectedType === 'expense' ? selectedTargetDebtId : null,
      savingsBucketId: selectedType === 'expense' ? selectedSavingsBucketId : null,
      ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
    });

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

  const renderEntryRow = (entry: MonthEntry) => {
    const concept = concepts.find((c) => c.id === entry.conceptId);
    const isCompleted = entry.status === 'completed';
    const isRepeatable = Boolean(concept?.allowMultiplePerMonth);
    const linkedDebt = concept?.defaultTargetDebtId
      ? debts.find((d) => d.id === concept.defaultTargetDebtId)
      : concept?.linkedDebtGroup
        ? debts.find((d) => d.groupKey === concept.linkedDebtGroup)
        : undefined;
    const linkedBucket = concept?.savingsContribution?.bucketId
      ? savingsBuckets.find((b) => b.id === concept.savingsContribution?.bucketId)
      : undefined;

    return (
      <View
        key={entry.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        }}
      >
        <Pressable
          testID={`checklist-workspace-item-${entry.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isCompleted }}
          accessibilityLabel={`${entry.conceptName}, ${formatCurrency(entry.actualAmount)}`}
          onPressIn={() => hapticService.trigger(isCompleted ? 'light' : 'success')}
          onPress={() => onToggleEntry(entry)}
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
            backgroundColor: isCompleted
              ? colors.semantic.completedSoft
              : colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: isCompleted
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
              <AppText variant="body">{`${isCompleted ? '✓ ' : ''}${entry.conceptName}`}</AppText>
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
            <AppText variant="micro" color={colors.text.secondary}>
              {isCompleted
                ? `${entry.type === 'income' ? 'Recibido' : 'Pagado'}${entry.completedAt ? ` · ${entry.completedAt}` : ''}${entry.note ? ` · ${entry.note}` : ''}`
                : `Pendiente · Previsto ${formatCurrency(entry.plannedAmount)}`}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <CurrencyText
              amount={entry.actualAmount}
              variant="body"
              tone={entry.type === 'income' ? 'income' : 'expense'}
            />
          </View>
        </Pressable>

        {/* Edit Entry Button */}
        <Pressable
          testID={`edit-entry-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${entry.conceptName}`}
          onPressIn={() => hapticService.light()}
          onPress={() => handleOpenEditModal(entry)}
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
          <PencilEditIcon size={16} color={colors.text.secondary} />
        </Pressable>

        {/* Delete Entry Button */}
        <Pressable
          testID={`delete-entry-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${entry.conceptName}`}
          onPressIn={() => hapticService.warning()}
          onPress={() => handleDeleteEntry(entry)}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.semantic.expenseSoft,
            borderWidth: 1,
            borderColor: colors.glass.subtleBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TrashBinIcon size={16} color={colors.semantic.expense} />
        </Pressable>
      </View>
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

          <Pressable
            testID="open-add-movement-modal-button"
            accessibilityRole="button"
            accessibilityLabel="Agregar o completar movimiento"
            onPressIn={() => hapticService.light()}
            onPress={() => handleOpenAddModal('expense')}
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
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline" color={colors.text.primary}>
              + Nuevo Movimiento
            </AppText>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {(
              [
                { id: 'all', label: `Todos (${monthEntries.length})` },
                { id: 'pending', label: `Pendientes (${pendingTotalCount})` },
                { id: 'completed', label: `Completados (${completedTotalCount})` },
              ] as const
            ).map((seg) => {
              const active = filterMode === seg.id;
              return (
                <Pressable
                  key={seg.id}
                  testID={`checklist-filter-${seg.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPressIn={() => hapticService.selection()}
                  onPress={() => setFilterMode(seg.id)}
                  style={{
                    flex: 1,
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
                </Pressable>
              );
            })}
          </View>
        </View>
      </GlassSurface>

      {/* Edit Existing Item Sheet */}
      {editingEntryId ? (
        <GlassSurface elevated testID="edit-entry-modal-card">
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="title2">Editar Movimiento</AppText>
              </View>
              <Pressable
                testID="close-edit-entry-modal-button"
                accessibilityRole="button"
                onPress={() => setEditingEntryId(null)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
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
                  Cancelar
                </AppText>
              </Pressable>
            </View>

            <AppTextInput
              testID="edit-entry-name-input"
              value={editNameInput}
              onChangeText={setEditNameInput}
              placeholder="Nombre del ingreso o gasto"
            />

            <AppTextInput
              testID="edit-entry-amount-input"
              value={editAmountInput}
              onChangeText={setEditAmountInput}
              keyboardType="numeric"
              placeholder="Monto en números enteros"
            />

            <AppTextInput
              testID="edit-entry-note-input"
              value={editNoteInput}
              onChangeText={setEditNoteInput}
              placeholder="Nota opcional"
            />

            {/* Adjustable Debt & Savings Linkage when editing an expense */}
            {monthEntries.find((e) => e.id === editingEntryId)?.type !== 'income' ? (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="micro" color={colors.text.secondary}>
                  Vincular pago a una deuda (actualiza Deudas automáticamente al pagar):
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <Pressable
                    testID="edit-entry-debt-none"
                    accessibilityRole="button"
                    onPress={() => setEditTargetDebtId(null)}
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
                  </Pressable>
                  {debts.map((debt) => {
                    const isLinked = editTargetDebtId === debt.id;
                    return (
                      <Pressable
                        key={debt.id}
                        testID={`edit-entry-debt-${debt.id}`}
                        accessibilityRole="button"
                        onPress={() => setEditTargetDebtId(debt.id)}
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
                      </Pressable>
                    );
                  })}
                </View>

                {savingsBuckets.length > 0 ? (
                  <>
                    <AppText variant="micro" color={colors.text.secondary}>
                      Vincular gasto a un fondo de ahorro:
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      <Pressable
                        testID="edit-entry-bucket-none"
                        accessibilityRole="button"
                        onPress={() => setEditSavingsBucketId(null)}
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
                      </Pressable>
                      {savingsBuckets.map((bucket) => {
                        const isLinked = editSavingsBucketId === bucket.id;
                        return (
                          <Pressable
                            key={bucket.id}
                            testID={`edit-entry-bucket-${bucket.id}`}
                            accessibilityRole="button"
                            onPress={() => setEditSavingsBucketId(bucket.id)}
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
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Month-to-month persistence toggle */}
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(
                [
                  { value: true, label: 'Persiste cada mes' },
                  { value: false, label: 'Solo este mes' },
                ] as const
              ).map((opt) => {
                const active = editPersistMonthly === opt.value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    testID={`edit-entry-persist-${opt.value ? 'monthly' : 'once'}`}
                    accessibilityRole="button"
                    onPress={() => setEditPersistMonthly(opt.value)}
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
                  </Pressable>
                );
              })}
            </View>

            {editError ? (
              <AppText variant="caption" color={colors.semantic.expense}>
                {editError}
              </AppText>
            ) : null}

            <Pressable
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
            </Pressable>
          </View>
        </GlassSurface>
      ) : null}

      {/* Screen 04: Liquid Glass Add / Complete Movement Sheet */}
      {isAddModalOpen ? (
        <GlassSurface elevated testID="add-movement-modal-card">
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="title2">Registrar Movimiento</AppText>
              </View>
              <Pressable
                testID="close-add-movement-modal-button"
                accessibilityRole="button"
                onPress={() => setIsAddModalOpen(false)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
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
                  Cerrar
                </AppText>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(
                [
                  { type: 'expense', label: 'Gasto' },
                  { type: 'income', label: 'Ingreso' },
                ] as const
              ).map((tab) => {
                const isSelected = selectedType === tab.type;
                return (
                  <Pressable
                    key={tab.type}
                    testID={`modal-type-${tab.type}`}
                    accessibilityRole="button"
                    onPress={() => handleOpenAddModal(tab.type)}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      borderRadius: radius.md,
                      backgroundColor: isSelected
                        ? colors.glass.surfaceElevatedTint
                        : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: isSelected
                        ? colors.glass.specularBorder
                        : colors.glass.subtleBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="caption">{tab.label}</AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText variant="caption" color={colors.text.secondary}>
              {`Conceptos disponibles en ${monthKey} (${availableConcepts.length} opciones):`}
            </AppText>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {availableConcepts.map((concept) => {
                const isSelected =
                  !isCustomConceptMode && activeSelectedConcept?.id === concept.id;
                return (
                  <Pressable
                    key={concept.id}
                    testID={`available-concept-chip-${concept.id}`}
                    accessibilityRole="button"
                    onPress={() => handleSelectConceptChip(concept)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.pill,
                      backgroundColor: isSelected
                        ? colors.semantic.incomeSoft
                        : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: isSelected
                        ? colors.glass.specularBorder
                        : colors.glass.subtleBorder,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText
                      variant="caption"
                      color={isSelected ? colors.semantic.income : colors.text.primary}
                    >
                      {`${concept.name}${concept.defaultAmount > 0 ? ` (${formatCurrency(concept.defaultAmount)})` : ' (Múltiple)'}`}
                    </AppText>
                  </Pressable>
                );
              })}

              <Pressable
                testID="available-concept-chip-custom"
                accessibilityRole="button"
                onPress={() => {
                  setIsCustomConceptMode(true);
                  setAmountInput('');
                  setFormError(null);
                }}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  backgroundColor: isCustomConceptMode
                    ? colors.semantic.reserveSoft
                    : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: isCustomConceptMode
                    ? colors.glass.specularBorder
                    : colors.glass.subtleBorder,
                  justifyContent: 'center',
                }}
              >
                <AppText
                  variant="caption"
                  color={isCustomConceptMode ? colors.semantic.reserve : colors.text.secondary}
                >
                  + Crear nuevo ítem
                </AppText>
              </Pressable>
            </View>

            {/* Concept Management Actions (Edit / Delete available concepts) */}
            {!isCustomConceptMode && activeSelectedConcept ? (
              <View
                style={{
                  padding: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  gap: spacing.sm,
                }}
              >
                {/* Generous Full-width Concept Information Block */}
                <View style={{ gap: spacing.xxs }}>
                  <AppText variant="micro" color={colors.text.muted}>
                    Concepto del catálogo seleccionado
                  </AppText>

                  <AppText
                    variant="title2"
                    color={colors.text.primary}
                    style={{ flexWrap: 'wrap' }}
                  >
                    {activeSelectedConcept.name}
                  </AppText>

                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: spacing.xs,
                      marginTop: spacing.xxs,
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: spacing.xxs,
                        borderRadius: radius.pill,
                        backgroundColor:
                          activeSelectedConcept.group === 'fixed'
                            ? colors.semantic.incomeSoft
                            : colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor:
                          activeSelectedConcept.group === 'fixed'
                            ? colors.glass.specularBorder
                            : colors.glass.subtleBorder,
                      }}
                    >
                      <AppText
                        variant="micro"
                        color={
                          activeSelectedConcept.group === 'fixed'
                            ? colors.semantic.income
                            : colors.text.secondary
                        }
                      >
                        {activeSelectedConcept.group === 'fixed' ? 'Gasto Fijo' : 'Gasto Variable'}
                      </AppText>
                    </View>

                    {activeSelectedConcept.defaultAmount > 0 ? (
                      <View
                        style={{
                          paddingHorizontal: spacing.sm,
                          paddingVertical: spacing.xxs,
                          borderRadius: radius.pill,
                          backgroundColor: colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: colors.glass.subtleBorder,
                        }}
                      >
                        <AppText variant="micro" color={colors.text.secondary}>
                          {`Monto base: ${formatCurrency(activeSelectedConcept.defaultAmount)}`}
                        </AppText>
                      </View>
                    ) : (
                      <View
                        style={{
                          paddingHorizontal: spacing.sm,
                          paddingVertical: spacing.xxs,
                          borderRadius: radius.pill,
                          backgroundColor: colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: colors.glass.subtleBorder,
                        }}
                      >
                        <AppText variant="micro" color={colors.text.secondary}>
                          Monto variable por registro
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>

                {/* Dedicated Action Buttons Row (Touch target >= 44pt, 50/50 distribution) */}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xxs }}>
                  <Pressable
                    testID={`edit-concept-trigger-${activeSelectedConcept.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar concepto ${activeSelectedConcept.name}`}
                    onPress={() => {
                      setIsEditingConcept(!isEditingConcept);
                      setConceptEditName(activeSelectedConcept.name);
                      setConceptEditAmount(
                        activeSelectedConcept.defaultAmount > 0
                          ? String(activeSelectedConcept.defaultAmount)
                          : ''
                      );
                      setConceptEditGroup(activeSelectedConcept.group);
                      setConfirmDeleteConceptId(null);
                    }}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: isEditingConcept
                        ? colors.semantic.incomeSoft
                        : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: isEditingConcept
                        ? colors.glass.specularBorder
                        : colors.glass.subtleBorder,
                      flexDirection: 'row',
                      gap: spacing.xxs,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <PencilEditIcon
                      size={14}
                      color={isEditingConcept ? colors.semantic.income : colors.text.secondary}
                    />
                    <AppText
                      variant="caption"
                      color={isEditingConcept ? colors.semantic.income : colors.text.primary}
                    >
                      {isEditingConcept ? 'Cancelar edición' : 'Editar concepto'}
                    </AppText>
                  </Pressable>

                  <Pressable
                    testID={`delete-concept-trigger-${activeSelectedConcept.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar concepto ${activeSelectedConcept.name}`}
                    onPress={() => {
                      if (confirmDeleteConceptId === activeSelectedConcept.id) {
                        if (onDeleteConcept) {
                          onDeleteConcept(activeSelectedConcept.id);
                        }
                        setConfirmDeleteConceptId(null);
                        setIsEditingConcept(false);
                      } else {
                        setConfirmDeleteConceptId(activeSelectedConcept.id);
                      }
                    }}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor:
                        confirmDeleteConceptId === activeSelectedConcept.id
                          ? colors.semantic.expenseSoft
                          : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor:
                        confirmDeleteConceptId === activeSelectedConcept.id
                          ? colors.glass.specularBorder
                          : colors.glass.subtleBorder,
                      flexDirection: 'row',
                      gap: spacing.xxs,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <TrashBinIcon
                      size={14}
                      color={
                        confirmDeleteConceptId === activeSelectedConcept.id
                          ? colors.semantic.expense
                          : colors.text.secondary
                      }
                    />
                    <AppText
                      variant="caption"
                      color={
                        confirmDeleteConceptId === activeSelectedConcept.id
                          ? colors.semantic.expense
                          : colors.text.secondary
                      }
                    >
                      {confirmDeleteConceptId === activeSelectedConcept.id
                        ? 'Confirmar eliminar'
                        : 'Eliminar concepto'}
                    </AppText>
                  </Pressable>
                </View>

                {isEditingConcept ? (
                  <View style={{ gap: spacing.xs, paddingTop: spacing.xxs }}>
                    <AppTextInput
                      testID="edit-concept-name-input"
                      value={conceptEditName}
                      onChangeText={setConceptEditName}
                      placeholder="Nombre del concepto"
                      style={{
                        backgroundColor: colors.glass.surfaceElevatedTint,
                      }}
                    />
                    <AppTextInput
                      testID="edit-concept-amount-input"
                      value={conceptEditAmount}
                      onChangeText={setConceptEditAmount}
                      keyboardType="numeric"
                      placeholder="Monto por defecto (ej. 150000)"
                      style={{
                        backgroundColor: colors.glass.surfaceElevatedTint,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                      {(
                        [
                          { id: 'fixed', label: 'Fijo' },
                          { id: 'variable', label: 'Variable' },
                        ] as const
                      ).map((g) => {
                        const active = conceptEditGroup === g.id;
                        return (
                          <Pressable
                            key={g.id}
                            testID={`edit-concept-group-${g.id}`}
                            accessibilityRole="button"
                            onPress={() => setConceptEditGroup(g.id)}
                            style={{
                              flex: 1,
                              minHeight: 36,
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
                            <AppText variant="caption">{g.label}</AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      testID="save-concept-changes-button"
                      accessibilityRole="button"
                      onPress={handleSaveConceptChanges}
                      style={{
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
                      <AppText variant="caption" color={colors.semantic.income}>
                        Guardar cambios del concepto
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            {isCustomConceptMode ? (
              <View style={{ gap: spacing.xs }}>
                <AppTextInput
                  testID="custom-concept-name-input"
                  value={customConceptName}
                  onChangeText={setCustomConceptName}
                  placeholder="Nombre del nuevo ítem (ej. Bono extra o Suscripción)"
                />
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  {(
                    [
                      { id: 'fixed', label: 'Fijo' },
                      { id: 'variable', label: 'Variable' },
                    ] as const
                  ).map((g) => {
                    const active = customConceptGroup === g.id;
                    return (
                      <Pressable
                        key={g.id}
                        testID={`custom-group-${g.id}`}
                        accessibilityRole="button"
                        onPress={() => setCustomConceptGroup(g.id)}
                        style={{
                          flex: 1,
                          minHeight: MIN_TOUCH_TARGET_PT,
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
                        <AppText variant="caption">{g.label}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <AppTextInput
              testID="movement-amount-input"
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="numeric"
              placeholder="Monto en números enteros (ej. 130000)"
            />

            <AppTextInput
              testID="movement-note-input"
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Nota opcional (ej. Pago PSE o gasto variable)"
            />

            {/* Adjustable Debt & Savings Fund Linkage for Expense Movements */}
            {selectedType === 'expense' ? (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="micro" color={colors.text.secondary}>
                  Vincular pago a una deuda (actualiza Deudas al marcar pagado):
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  <Pressable
                    testID="add-movement-debt-none"
                    accessibilityRole="button"
                    onPress={() => setSelectedTargetDebtId(null)}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.pill,
                      backgroundColor:
                        selectedTargetDebtId === null
                          ? colors.glass.surfaceElevatedTint
                          : colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor:
                        selectedTargetDebtId === null
                          ? colors.glass.specularBorder
                          : colors.glass.subtleBorder,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="micro">Ninguna deuda</AppText>
                  </Pressable>
                  {debts.map((debt) => {
                    const isLinked = selectedTargetDebtId === debt.id;
                    return (
                      <Pressable
                        key={debt.id}
                        testID={`add-movement-debt-${debt.id}`}
                        accessibilityRole="button"
                        onPress={() => setSelectedTargetDebtId(debt.id)}
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
                      </Pressable>
                    );
                  })}
                </View>

                {savingsBuckets.length > 0 ? (
                  <>
                    <AppText variant="micro" color={colors.text.secondary}>
                      Vincular gasto a un fondo de ahorro:
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      <Pressable
                        testID="add-movement-bucket-none"
                        accessibilityRole="button"
                        onPress={() => setSelectedSavingsBucketId(null)}
                        style={{
                          minHeight: 36,
                          paddingHorizontal: spacing.sm,
                          borderRadius: radius.pill,
                          backgroundColor:
                            selectedSavingsBucketId === null
                              ? colors.glass.surfaceElevatedTint
                              : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor:
                            selectedSavingsBucketId === null
                              ? colors.glass.specularBorder
                              : colors.glass.subtleBorder,
                          justifyContent: 'center',
                        }}
                      >
                        <AppText variant="micro">Ningún fondo</AppText>
                      </Pressable>
                      {savingsBuckets.map((bucket) => {
                        const isLinked = selectedSavingsBucketId === bucket.id;
                        return (
                          <Pressable
                            key={bucket.id}
                            testID={`add-movement-bucket-${bucket.id}`}
                            accessibilityRole="button"
                            onPress={() => setSelectedSavingsBucketId(bucket.id)}
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
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Month-to-month persistence toggle */}
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(
                [
                  { value: true, label: 'Persiste cada mes' },
                  { value: false, label: 'Solo este mes' },
                ] as const
              ).map((opt) => {
                const active = persistMonthly === opt.value;
                return (
                  <Pressable
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
                  </Pressable>
                );
              })}
            </View>

            {formError ? (
              <AppText variant="caption" color={colors.semantic.expense}>
                {formError}
              </AppText>
            ) : null}

            <Pressable
              testID="submit-movement-button"
              accessibilityRole="button"
              onPress={handleSubmitMovement}
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
                {selectedType === 'income' ? 'Marcar como Recibido' : 'Marcar como Pagado'}
              </AppText>
            </Pressable>
          </View>
        </GlassSurface>
      ) : null}

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
            <AppText variant="title2">Ingresos</AppText>
            <AppText variant="caption" color={colors.semantic.income}>
              {`Recibido ${formatCurrency(budget.receivedIncome)} / Previsto ${formatCurrency(budget.plannedIncome)}`}
            </AppText>
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Ingresos Fijos · Pendiente: ${formatCurrency(budget.incomeByGroup.fixed.pending)}`}
          </AppText>
          {fixedIncomes.map(renderEntryRow)}

          <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              {`Ingresos Variables · Recibido: ${formatCurrency(budget.incomeByGroup.variable.paid)}`}
            </AppText>
            {variableIncomes.map(renderEntryRow)}
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
            <AppText variant="title2">Gastos</AppText>
            <AppText variant="caption" color={colors.semantic.expense}>
              {`Pagado ${formatCurrency(budget.paidExpenses)} / Previsto ${formatCurrency(budget.plannedExpenses)}`}
            </AppText>
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Gastos Fijos (${formatCurrency(budget.expensesByGroup.fixed.paid)} pagados · ${formatCurrency(budget.expensesByGroup.fixed.pending)} pendientes)`}
          </AppText>
          {fixedExpenses.map(renderEntryRow)}

          <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              {`Gastos Variables (${formatCurrency(budget.expensesByGroup.variable.paid)} pagados · ${formatCurrency(budget.expensesByGroup.variable.pending)} pendientes)`}
            </AppText>
            {variableExpenses.map(renderEntryRow)}
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}
