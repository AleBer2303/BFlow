/**
 * src/features/checklist/components/ChecklistWorkspaceView.tsx
 *
 * Implements Screens `03-monthly-checklist` & `04-add-movement-modal`:
 * - iOS segmented filter (`Todos` | `Pendientes` | `Completados`)
 * - Full breakdown of Ingresos (Fijos / Variables) and Gastos (Fijos / Variables)
 * - Semantic badges (`→ Fondo Moto`, `→ Deuda FUNFAMI`, `Múltiple/mes`)
 * - Liquid Glass "Agregar / Completar Movimiento" sheet enforcing `getAvailableConcepts`
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
  type ConceptType,
  type MonthEntry,
  type MonthlyBudgetSummary,
  type RegisterOrCompleteMovementInput,
} from '../../../domain';

export type ChecklistFilterMode = 'all' | 'pending' | 'completed';

export interface ChecklistWorkspaceViewProps {
  monthKey: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  budget: MonthlyBudgetSummary;
  onToggleEntry: (entry: MonthEntry) => void;
  onAddOrCompleteMovement: (input: RegisterOrCompleteMovementInput) => void;
  onRemoveRepeatableEntry: (entryId: string) => void;
}

export function ChecklistWorkspaceView({
  monthKey,
  concepts,
  entries,
  budget,
  onToggleEntry,
  onAddOrCompleteMovement,
  onRemoveRepeatableEntry,
}: ChecklistWorkspaceViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const [filterMode, setFilterMode] = useState<ChecklistFilterMode>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ConceptType>('expense');
  const [selectedConceptId, setSelectedConceptId] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

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
    const avail = getAvailableConcepts(concepts, entries, monthKey, type);
    const first = avail[0];
    setSelectedConceptId(first?.id ?? '');
    setAmountInput(first && first.defaultAmount > 0 ? String(first.defaultAmount) : '');
    setNoteInput('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSelectConceptChip = (concept: Concept) => {
    setSelectedConceptId(concept.id);
    setAmountInput(concept.defaultAmount > 0 ? String(concept.defaultAmount) : '');
    setFormError(null);
  };

  const handleSubmitMovement = () => {
    if (!activeSelectedConcept) {
      setFormError('No hay conceptos disponibles en esta categoría para este mes.');
      return;
    }

    const digitsOnly = amountInput.replace(/[^0-9]/g, '');
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

        {isRepeatable ? (
          <Pressable
            testID={`delete-repeatable-${entry.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Eliminar ${entry.conceptName}`}
            onPress={() => onRemoveRepeatableEntry(entry.id)}
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
        ) : null}
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
              {`Conceptos disponibles en ${monthKey} (${availableConcepts.length} opciones · oculta completados únicos):`}
            </AppText>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {availableConcepts.map((concept) => {
                const isSelected = activeSelectedConcept?.id === concept.id;
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
            </View>

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
            <Pressable
              testID="quick-add-variable-income-button"
              accessibilityRole="button"
              onPress={() => handleOpenAddModal('income')}
              style={{
                width: '100%',
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.incomeSoft,
                borderWidth: 1,
                borderColor: colors.semantic.income,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.semantic.income}>
                + Agregar Ingreso Variable
              </AppText>
            </Pressable>
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
            <Pressable
              testID="quick-add-variable-expense-button"
              accessibilityRole="button"
              onPress={() => handleOpenAddModal('expense')}
              style={{
                width: '100%',
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.semantic.expenseSoft,
                borderWidth: 1,
                borderColor: colors.semantic.expense,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.semantic.expense}>
                + Agregar Gasto (Otro)
              </AppText>
            </Pressable>
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}
