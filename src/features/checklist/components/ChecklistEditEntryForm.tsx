/**
 * src/features/checklist/components/ChecklistEditEntryForm.tsx
 *
 * Editor of an existing checklist entry. It owns its field state, so typing re-renders only
 * this form and never the checklist rows (PERFORMANCE_AUDIT_2026-11-09, R-17). The parent
 * mounts it with `key={entry.id}`, which loads the entry's values when it opens.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  CurrencyText,
  GlassSurface,
  hapticService,
  MIN_TOUCH_TARGET_PT,
  useBFlowTheme,
} from '../../../design-system';
import type { Concept, Debt, MonthEntry, SavingsBucket } from '../../../domain';
import type { EditEntryUpdates } from '../../budget/store/useBudgetStore';

export interface ChecklistEditEntryFormProps {
  /** Live entry being edited; null if it disappeared while the editor was open. */
  entry: MonthEntry | null;
  concept?: Concept;
  debts: readonly Debt[];
  savingsBuckets: readonly SavingsBucket[];
  onEditEntry?: (entryId: string, updates: EditEntryUpdates) => void;
  onClose: () => void;
}

function initialTargetDebtId(concept: Concept | undefined, debts: readonly Debt[]): string | null {
  if (concept?.defaultTargetDebtId) return concept.defaultTargetDebtId;
  if (!concept?.linkedDebtGroup) return null;
  return debts.find((d) => d.groupKey === concept.linkedDebtGroup)?.id ?? debts[0]?.id ?? null;
}

export const ChecklistEditEntryForm = React.memo(function ChecklistEditEntryForm({
  entry,
  concept,
  debts,
  savingsBuckets,
  onEditEntry,
  onClose,
}: ChecklistEditEntryFormProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const [editNameInput, setEditNameInput] = useState(() => entry?.conceptName ?? '');
  const [editAmountInput, setEditAmountInput] = useState(() =>
    entry ? String(entry.actualAmount > 0 ? entry.actualAmount : entry.plannedAmount) : ''
  );
  const [editNoteInput, setEditNoteInput] = useState(() => entry?.note ?? '');
  const [editTargetDebtId, setEditTargetDebtId] = useState<string | null>(() =>
    initialTargetDebtId(concept, debts)
  );
  const [editSavingsBucketId, setEditSavingsBucketId] = useState<string | null>(
    () => concept?.savingsContribution?.bucketId ?? null
  );
  const [editPersistMonthly, setEditPersistMonthly] = useState<boolean>(() =>
    concept ? concept.recurrence.kind === 'monthly' : true
  );
  const [editError, setEditError] = useState<string | null>(null);

  const parsedEditHeroAmount = useMemo(() => {
    const digits = editAmountInput.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }, [editAmountInput]);

  const isEditingExpense = entry?.type !== 'income';

  const handleSaveEditEntry = () => {
    if (!entry) return;
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
      onEditEntry(entry.id, {
        conceptName: editNameInput.trim(),
        actualAmount: parsedAmount,
        plannedAmount: parsedAmount,
        targetDebtId: isEditingExpense ? editTargetDebtId : null,
        savingsBucketId: isEditingExpense ? editSavingsBucketId : null,
        persistMonthly: editPersistMonthly,
        ...(editNoteInput.trim() ? { note: editNoteInput.trim() } : {}),
      });
    }
    onClose();
  };

  return (
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
            onPress={onClose}
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
  );
});
