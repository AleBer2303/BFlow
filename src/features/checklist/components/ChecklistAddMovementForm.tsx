/**
 * src/features/checklist/components/ChecklistAddMovementForm.tsx
 *
 * "Nuevo Movimiento" form of the checklist. It owns its field state, so typing re-renders
 * only this form and never the checklist rows (PERFORMANCE_AUDIT_2026-11-09, R-17). The
 * parent remounts it (new `key`) each time it opens, which starts every field empty.
 */

import React, { useMemo, useState } from 'react';
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
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  toAppIsoDate,
  type Concept,
  type ConceptGroup,
  type ConceptType,
  type Debt,
  type MonthEntry,
  type SavingsBucket,
} from '../../../domain';
import type { ChecklistWorkspaceViewProps } from './ChecklistWorkspaceView';

export interface ChecklistAddMovementFormProps {
  monthKey: string;
  /** Entries of the active month. */
  monthEntries: readonly MonthEntry[];
  concepts: readonly Concept[];
  debts: readonly Debt[];
  savingsBuckets: readonly SavingsBucket[];
  onAddOrCompleteMovement: ChecklistWorkspaceViewProps['onAddOrCompleteMovement'];
  onCreateCustomMovement?: ChecklistWorkspaceViewProps['onCreateCustomMovement'];
  /** Called after a valid submit so the parent closes the form. */
  onSubmitted: () => void;
}

export const ChecklistAddMovementForm = React.memo(function ChecklistAddMovementForm({
  monthKey,
  monthEntries,
  concepts,
  debts,
  savingsBuckets,
  onAddOrCompleteMovement,
  onCreateCustomMovement,
  onSubmitted,
}: ChecklistAddMovementFormProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [movementType, setMovementType] = useState<ConceptType>('expense');
  const [conceptNameInput, setConceptNameInput] = useState('');
  const [conceptGroup, setConceptGroup] = useState<ConceptGroup>('variable');
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [targetDebtId, setTargetDebtId] = useState<string | null>(null);
  const [savingsBucketId, setSavingsBucketId] = useState<string | null>(null);
  const [persistMonthly, setPersistMonthly] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  const parsedAmountPreview = useMemo(() => {
    const digits = amountInput.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }, [amountInput]);

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

    setFormError(null);
    onSubmitted();
  };

  return (
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
            keyboardType="number-pad"
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

        <FormMessage message={formError} />

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
  );
});
