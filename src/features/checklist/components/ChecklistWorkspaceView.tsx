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
import { Pressable, TextInput, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCop,
  getAvailableConcepts,
  toBogotaIsoDate,
  type Concept,
  type ConceptGroup,
  type ConceptType,
  type MonthEntry,
  type MonthlyBudgetSummary,
  type RegisterOrCompleteMovementInput,
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
  onToggleEntry: (entry: MonthEntry) => void;
  onAddOrCompleteMovement: (input: RegisterOrCompleteMovementInput) => void;
  onCreateCustomMovement?: (input: CreateCustomConceptInput) => void;
  onUpdateConcept?: (
    conceptId: string,
    updates: { name?: string; defaultAmount?: number; group?: ConceptGroup }
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
    setNoteInput('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSelectConceptChip = (concept: Concept) => {
    setIsCustomConceptMode(false);
    setSelectedConceptId(concept.id);
    setAmountInput(concept.defaultAmount > 0 ? String(concept.defaultAmount) : '');
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
          amountCop: parsedCustomAmount,
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
      setFormError('Ingresa un monto entero mayor a $ 0 en pesos colombianos.');
      return;
    }

    onAddOrCompleteMovement({
      monthKey,
      conceptId: activeSelectedConcept.id,
      actualAmount: parsedAmount,
      completedAt: toBogotaIsoDate(),
      ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
    });

    setIsAddModalOpen(false);
    setFormError(null);
  };

  const handleOpenEditModal = (entry: MonthEntry) => {
    setEditingEntryId(entry.id);
    setEditNameInput(entry.conceptName);
    setEditAmountInput(String(entry.actualAmount > 0 ? entry.actualAmount : entry.plannedAmount));
    setEditNoteInput(entry.note ?? '');
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

    if (onEditEntry) {
      onEditEntry(editingEntryId, {
        conceptName: editNameInput.trim(),
        actualAmount: parsedAmount,
        plannedAmount: parsedAmount,
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
          accessibilityLabel={`${entry.conceptName}, ${formatCop(entry.actualAmount)}`}
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
            backgroundColor: isCompleted
              ? colors.semantic.completedSoft
              : colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: isCompleted ? colors.semantic.completed : colors.glass.subtleBorder,
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
              <AppText variant="body">{`${isCompleted ? '✓ ' : '○ '}${entry.conceptName}`}</AppText>
              {concept?.savingsContribution?.bucketId === 'moto' ? (
                <StatusBadge label="→ Fondo Moto" status="moto" />
              ) : null}
              {concept?.linkedDebtGroup ? (
                <StatusBadge label="→ Deuda FUNFAMI" status="debt" />
              ) : null}
              {isRepeatable ? <StatusBadge label="Múltiple/mes" status="info" /> : null}
            </View>
            <AppText variant="micro" color={colors.text.secondary}>
              {isCompleted
                ? `${entry.type === 'income' ? 'Recibido' : 'Pagado'}${entry.completedAt ? ` · ${entry.completedAt}` : ''}${entry.note ? ` · ${entry.note}` : ''}`
                : `Pendiente · Previsto ${formatCop(entry.plannedAmount)}`}
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
          onPress={() => handleOpenEditModal(entry)}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption" color={colors.text.primary}>
            ✎
          </AppText>
        </Pressable>

        {/* Delete Entry Button */}
        <Pressable
          testID={`delete-entry-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${entry.conceptName}`}
          onPress={() => handleDeleteEntry(entry)}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            borderRadius: radius.md,
            backgroundColor: colors.semantic.expenseSoft,
            borderWidth: 1,
            borderColor: colors.semantic.expense,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption" color={colors.semantic.expense}>
            ✕
          </AppText>
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
              <AppText variant="micro" color={colors.text.secondary}>
                Ingresos y gastos operativos
              </AppText>
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
            onPress={() => handleOpenAddModal('expense')}
            style={{
              width: '100%',
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.semantic.incomeSoft,
              borderWidth: 1,
              borderColor: colors.semantic.income,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline" color={colors.semantic.income}>
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
                  onPress={() => setFilterMode(seg.id)}
                  style={{
                    flex: 1,
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.xxs,
                    borderRadius: radius.md,
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

            <TextInput
              testID="edit-entry-name-input"
              value={editNameInput}
              onChangeText={setEditNameInput}
              placeholder="Nombre del ingreso o gasto"
              placeholderTextColor={colors.text.muted}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />

            <TextInput
              testID="edit-entry-amount-input"
              value={editAmountInput}
              onChangeText={setEditAmountInput}
              keyboardType="numeric"
              placeholder="Monto en COP enteros"
              placeholderTextColor={colors.text.muted}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />

            <TextInput
              testID="edit-entry-note-input"
              value={editNoteInput}
              onChangeText={setEditNoteInput}
              placeholder="Nota opcional"
              placeholderTextColor={colors.text.muted}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />

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
                backgroundColor: colors.semantic.incomeSoft,
                borderWidth: 1,
                borderColor: colors.semantic.income,
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
                        ? colors.semantic.income
                        : colors.glass.subtleBorder,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="caption">
                      {`${concept.name}${concept.defaultAmount > 0 ? ` (${formatCop(concept.defaultAmount)})` : ' (Múltiple)'}`}
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
                    ? colors.semantic.motoSoft
                    : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: isCustomConceptMode
                    ? colors.semantic.moto
                    : colors.glass.subtleBorder,
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption">+ Crear nuevo ítem</AppText>
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
                            ? colors.semantic.income
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
                          {`Monto base: ${formatCop(activeSelectedConcept.defaultAmount)}`}
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
                        ? colors.semantic.income
                        : colors.glass.subtleBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText
                      variant="caption"
                      color={isEditingConcept ? colors.semantic.income : colors.text.primary}
                    >
                      {isEditingConcept ? '✕ Cancelar edición' : '✏️ Editar concepto'}
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
                          ? colors.semantic.expense
                          : colors.glass.subtleBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText
                      variant="caption"
                      color={
                        confirmDeleteConceptId === activeSelectedConcept.id
                          ? colors.semantic.expense
                          : colors.text.secondary
                      }
                    >
                      {confirmDeleteConceptId === activeSelectedConcept.id
                        ? '⚠️ ¿Confirmar eliminar?'
                        : '🗑️ Eliminar concepto'}
                    </AppText>
                  </Pressable>
                </View>

                {isEditingConcept ? (
                  <View style={{ gap: spacing.xs, paddingTop: spacing.xxs }}>
                    <TextInput
                      testID="edit-concept-name-input"
                      value={conceptEditName}
                      onChangeText={setConceptEditName}
                      placeholder="Nombre del concepto"
                      placeholderTextColor={colors.text.muted}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        color: colors.text.primary,
                      }}
                    />
                    <TextInput
                      testID="edit-concept-amount-input"
                      value={conceptEditAmount}
                      onChangeText={setConceptEditAmount}
                      keyboardType="numeric"
                      placeholder="Monto por defecto en COP (ej. 150000)"
                      placeholderTextColor={colors.text.muted}
                      style={{
                        minHeight: MIN_TOUCH_TARGET_PT,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: colors.glass.surfaceElevatedTint,
                        borderWidth: 1,
                        borderColor: colors.glass.subtleBorder,
                        color: colors.text.primary,
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
                        backgroundColor: colors.semantic.incomeSoft,
                        borderWidth: 1,
                        borderColor: colors.semantic.income,
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
                <TextInput
                  testID="custom-concept-name-input"
                  value={customConceptName}
                  onChangeText={setCustomConceptName}
                  placeholder="Nombre del nuevo ítem (ej. Bono extra o Parqueadero)"
                  placeholderTextColor={colors.text.muted}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: colors.glass.subtleBorder,
                    color: colors.text.primary,
                  }}
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

            <TextInput
              testID="movement-amount-input"
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="numeric"
              placeholder="Monto en COP enteros (ej. 130000)"
              placeholderTextColor={colors.text.muted}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />

            <TextInput
              testID="movement-note-input"
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Nota opcional (ej. Pago PSE o gasto variable)"
              placeholderTextColor={colors.text.muted}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                color: colors.text.primary,
              }}
            />

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
                backgroundColor: colors.semantic.incomeSoft,
                borderWidth: 1,
                borderColor: colors.semantic.income,
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
              {`Recibido ${formatCop(budget.receivedIncome)} / Previsto ${formatCop(budget.plannedIncome)}`}
            </AppText>
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Ingresos Fijos · Pendiente: ${formatCop(budget.incomeByGroup.fixed.pending)}`}
          </AppText>
          {fixedIncomes.map(renderEntryRow)}

          <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              {`Ingresos Variables · Recibido: ${formatCop(budget.incomeByGroup.variable.paid)}`}
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
              {`Pagado ${formatCop(budget.paidExpenses)} / Previsto ${formatCop(budget.plannedExpenses)}`}
            </AppText>
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Gastos Fijos (${formatCop(budget.expensesByGroup.fixed.paid)} pagados · ${formatCop(budget.expensesByGroup.fixed.pending)} pendientes)`}
          </AppText>
          {fixedExpenses.map(renderEntryRow)}

          <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              {`Gastos Variables (${formatCop(budget.expensesByGroup.variable.paid)} pagados · ${formatCop(budget.expensesByGroup.variable.pending)} pendientes)`}
            </AppText>
            {variableExpenses.map(renderEntryRow)}
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}
