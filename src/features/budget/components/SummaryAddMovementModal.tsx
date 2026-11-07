/**
 * src/features/budget/components/SummaryAddMovementModal.tsx
 *
 * Isolated modal component for registering movements in the Summary tab.
 * Encapsulates input state to prevent keystroke re-renders in PhaseOneHomeScreen (Point 26).
 */

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  AppTextInput,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
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
  type MonthEntry,
} from '../../../domain';

export interface SummaryAddMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  activeMonthKey: string;
  initialType?: ConceptType;
  onSubmitMovement: (input: {
    monthKey: string;
    conceptId: string;
    actualAmount: number;
    completedAt: string;
    note?: string;
  }) => Promise<void>;
  onSubmitCustomMovement: (input: {
    monthKey: string;
    name: string;
    type: ConceptType;
    group: ConceptGroup;
    amount?: number;
    amountCop?: number;
    note?: string;
  }) => Promise<void>;
}

export const SummaryAddMovementModal = React.memo(function SummaryAddMovementModal({
  isOpen,
  onClose,
  concepts,
  entries,
  activeMonthKey,
  initialType = 'expense',
  onSubmitMovement,
  onSubmitCustomMovement,
}: SummaryAddMovementModalProps): React.JSX.Element | null {
  const { colors, spacing, radius } = useBFlowTheme();

  const [movementType, setMovementType] = useState<ConceptType>(initialType);
  const [selectedConceptId, setSelectedConceptId] = useState<string>(() => {
    const avail = getAvailableConcepts(concepts, entries, activeMonthKey, initialType);
    return avail[0]?.id ?? '';
  });
  const [amountInput, setAmountInput] = useState<string>(() => {
    const avail = getAvailableConcepts(concepts, entries, activeMonthKey, initialType);
    const first = avail[0];
    return first && first.defaultAmount > 0 ? String(first.defaultAmount) : '';
  });
  const [noteInput, setNoteInput] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [customGroup, setCustomGroup] = useState<ConceptGroup>('variable');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTypeChange = (type: ConceptType) => {
    hapticService.trigger('light');
    setMovementType(type);
    setIsCustomMode(false);
    setCustomName('');
    const avail = getAvailableConcepts(concepts, entries, activeMonthKey, type);
    const first = avail[0];
    setSelectedConceptId(first?.id ?? '');
    setAmountInput(first && first.defaultAmount > 0 ? String(first.defaultAmount) : '');
    setNoteInput('');
    setFormError(null);
  };

  const handleSubmit = async () => {
    const digitsOnly = amountInput.replace(/[^0-9]/g, '');

    if (isCustomMode) {
      if (!customName.trim()) {
        setFormError('Ingresa el nombre del nuevo ítem.');
        return;
      }
      const parsedAmount = digitsOnly ? Number(digitsOnly) : 0;
      if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
        setFormError('Ingresa un monto entero válido mayor a 0.');
        return;
      }
      hapticService.trigger('success');
      await onSubmitCustomMovement({
        monthKey: activeMonthKey,
        name: customName.trim(),
        type: movementType,
        group: customGroup,
        amount: parsedAmount,
        amountCop: parsedAmount,
        ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
      });
      onClose();
      setFormError(null);
      return;
    }

    const available = getAvailableConcepts(concepts, entries, activeMonthKey, movementType);
    const activeConcept =
      available.find((c) => c.id === selectedConceptId) ?? available[0];
    if (!activeConcept) {
      setFormError('No hay conceptos disponibles en esta categoría.');
      return;
    }

    const parsedAmount = digitsOnly ? Number(digitsOnly) : activeConcept.defaultAmount;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setFormError('Ingresa un monto entero válido mayor a 0.');
      return;
    }

    hapticService.trigger('success');
    await onSubmitMovement({
      monthKey: activeMonthKey,
      conceptId: activeConcept.id,
      actualAmount: parsedAmount,
      completedAt: toAppIsoDate(),
      ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
    });

    onClose();
    setFormError(null);
  };

  const availableConcepts = getAvailableConcepts(concepts, entries, activeMonthKey, movementType);

  return (
    <GlassSurface elevated testID="summary-add-movement-modal-card">
      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <AppText variant="title2">Registrar Movimiento</AppText>
          <Pressable
            accessibilityRole="button"
            onPressIn={() => hapticService.trigger('light')}
            onPress={onClose}
            style={{
              paddingVertical: 4,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
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
            const isSelected = movementType === tab.type;
            return (
              <Pressable
                key={tab.type}
                accessibilityRole="button"
                onPressIn={() => hapticService.trigger('light')}
                onPress={() => handleTypeChange(tab.type)}
                style={{
                  flex: 1,
                  minHeight: 36,
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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {availableConcepts.map((concept) => {
            const isSelected = !isCustomMode && selectedConceptId === concept.id;
            return (
              <Pressable
                key={concept.id}
                testID={`summary-concept-chip-${concept.id}`}
                accessibilityRole="button"
                onPressIn={() => hapticService.trigger('selection')}
                onPress={() => {
                  setIsCustomMode(false);
                  setSelectedConceptId(concept.id);
                  setAmountInput(
                    concept.defaultAmount > 0 ? String(concept.defaultAmount) : ''
                  );
                  setFormError(null);
                }}
                style={{
                  minHeight: 36,
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
            accessibilityRole="button"
            onPressIn={() => hapticService.trigger('light')}
            onPress={() => {
              setIsCustomMode(true);
              setAmountInput('');
              setFormError(null);
            }}
            style={{
              minHeight: 36,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: isCustomMode
                ? colors.semantic.reserveSoft
                : colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: isCustomMode
                ? colors.glass.specularBorder
                : colors.glass.subtleBorder,
              justifyContent: 'center',
            }}
          >
            <AppText
              variant="caption"
              color={isCustomMode ? colors.semantic.reserve : colors.text.secondary}
            >
              + Crear nuevo ítem
            </AppText>
          </Pressable>
        </View>

        {isCustomMode ? (
          <View style={{ gap: spacing.xs }}>
            <AppTextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="Nombre del nuevo ítem"
            />
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {(
                [
                  { id: 'fixed', label: 'Fijo' },
                  { id: 'variable', label: 'Variable' },
                ] as const
              ).map((g) => {
                const active = customGroup === g.id;
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="button"
                    onPressIn={() => hapticService.trigger('selection')}
                    onPress={() => setCustomGroup(g.id)}
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
          </View>
        ) : null}

        <AppTextInput
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="numeric"
          placeholder="Monto en números enteros"
        />

        <AppTextInput
          value={noteInput}
          onChangeText={setNoteInput}
          placeholder="Nota opcional"
        />

        {formError ? (
          <AppText variant="caption" color={colors.semantic.expense}>
            {formError}
          </AppText>
        ) : null}

        <Pressable
          testID="summary-submit-movement-button"
          accessibilityRole="button"
          onPressIn={() => hapticService.trigger('medium')}
          onPress={handleSubmit}
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
          <AppText variant="headline" color={colors.semantic.income}>
            Guardar Movimiento
          </AppText>
        </Pressable>
      </View>
    </GlassSurface>
  );
});
