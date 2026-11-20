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
  AdaptiveSelectField,
  animateNextLayout,
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  GlassSurface,
  hapticService,
  HeroAmountField,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatGroupedIntegerInput,
  type Concept,
  type Debt,
  type MonthEntry,
  type SavingsBucket,
} from '../../../domain';
import type { EditEntryUpdates } from '../../budget/store/useBudgetStore';

const NONE_OPTION_VALUE = '__none__';

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
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  const [editNameInput, setEditNameInput] = useState(() => entry?.conceptName ?? '');
  const [editAmountInput, setEditAmountInput] = useState(() =>
    entry
      ? formatGroupedIntegerInput(entry.actualAmount > 0 ? entry.actualAmount : entry.plannedAmount)
      : ''
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
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isEditingExpense = entry?.type !== 'income';

  const debtOptions = useMemo(
    () => [
      { value: NONE_OPTION_VALUE, label: 'Sin deuda vinculada' },
      ...debts.map((debt) => ({ value: debt.id, label: debt.name })),
    ],
    [debts]
  );

  const bucketOptions = useMemo(
    () => [
      { value: NONE_OPTION_VALUE, label: 'Sin fondo vinculado' },
      ...savingsBuckets.map((bucket) => ({ value: bucket.id, label: bucket.name })),
    ],
    [savingsBuckets]
  );

  const optionalSummary = useMemo(() => {
    const parts: string[] = [];
    if (editNoteInput.trim()) parts.push('Nota');
    if (isEditingExpense && editTargetDebtId) {
      const debtName = debts.find((d) => d.id === editTargetDebtId)?.name;
      if (debtName) parts.push(debtName);
    }
    if (isEditingExpense && editSavingsBucketId) {
      const bucketName = savingsBuckets.find((b) => b.id === editSavingsBucketId)?.name;
      if (bucketName) parts.push(bucketName);
    }
    return parts.join(' · ');
  }, [debts, editNoteInput, editSavingsBucketId, editTargetDebtId, isEditingExpense, savingsBuckets]);

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
            gap: spacing.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
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
            onPress={() => {
              hapticService.light();
              onClose();
            }}
            style={{
              minHeight: minTouchTarget,
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

        {/* Single Interactive Hero Amount Input directly on the semantic red/green surface */}
        <HeroAmountField
          containerTestID="edit-entry-hero-amount"
          inputTestID="edit-entry-amount-input"
          label={isEditingExpense ? 'Monto a pagar' : 'Monto a recibir'}
          tone={isEditingExpense ? 'expense' : 'income'}
          value={editAmountInput}
          onChangeText={(text) => {
            setEditAmountInput(text);
            if (editError) setEditError(null);
          }}
        />

        {/* Concept Name Input */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Nombre del movimiento
          </AppText>
          <AppTextInput
            testID="edit-entry-name-input"
            value={editNameInput}
            onChangeText={(text) => {
              setEditNameInput(text);
              if (editError) setEditError(null);
            }}
            placeholder={
              isEditingExpense
                ? 'Ej. Supermercado, Alquiler, Gasolina...'
                : 'Ej. Salario, Rendimientos, Bono...'
            }
          />
        </View>

        {/* Month-to-month persistence toggle */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Frecuencia
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {(
              [
                { value: true, label: 'Cada mes', a11y: 'Se repite cada mes' },
                { value: false, label: 'Solo este mes', a11y: 'Solo este mes' },
              ] as const
            ).map((opt) => {
              const active = editPersistMonthly === opt.value;
              return (
                <AppPressable
                  key={String(opt.value)}
                  testID={`edit-entry-persist-${opt.value ? 'monthly' : 'once'}`}
                  accessibilityRole="button"
                  accessibilityLabel={opt.a11y}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticService.selection();
                    setEditPersistMonthly(opt.value);
                  }}
                  style={{
                    flex: 1,
                    minHeight: minTouchTarget,
                    borderRadius: radius.md,
                    borderCurve: 'continuous',
                    backgroundColor: active
                      ? colors.accent.container
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: active ? colors.accent.primary : colors.glass.subtleBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="caption"
                    color={active ? colors.accent.onContainer : colors.text.secondary}
                  >
                    {opt.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
        </View>

        {/* Progressive disclosure for optional note, debt and savings linkage */}
        <View style={{ gap: spacing.xs }}>
          <AppPressable
            testID="edit-entry-more-options-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: showMoreOptions }}
            onPress={() => {
              hapticService.selection();
              animateNextLayout();
              setShowMoreOptions((prev) => !prev);
            }}
            style={{
              minHeight: minTouchTarget,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor:
                showMoreOptions || optionalSummary
                  ? colors.glass.specularBorder
                  : colors.glass.subtleBorder,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.primary}>
                Más opciones
              </AppText>
              <AppText
                variant="micro"
                color={optionalSummary ? colors.accent.text : colors.text.secondary}
                numberOfLines={1}
              >
                {optionalSummary ||
                  (isEditingExpense
                    ? 'Nota, vincular a deuda o fondo de ahorro'
                    : 'Agregar nota opcional')}
              </AppText>
            </View>
            <AppText variant="micro" color={colors.text.secondary}>
              {showMoreOptions ? 'Ocultar' : 'Mostrar'}
            </AppText>
          </AppPressable>

          {/* Rendered directly (without nested RevealDown) to keep opening/closing instant */}
          {showMoreOptions ? (
            <View
              testID="edit-entry-more-options-panel"
              style={{ gap: spacing.sm, paddingTop: spacing.xs }}
            >
              {/* Note Input */}
              <View style={{ gap: spacing.xxs }}>
                <AppText variant="caption" color={colors.text.secondary}>
                  Nota opcional
                </AppText>
                <AppTextInput
                  testID="edit-entry-note-input"
                  value={editNoteInput}
                  onChangeText={setEditNoteInput}
                  placeholder="Ej. Factura, referencia, detalle..."
                />
              </View>

              {/* Modern Adaptive Selectors for Debt & Savings Fund Linkage */}
              {isEditingExpense && debts.length > 0 ? (
                <AdaptiveSelectField
                  label="Vincular pago a una deuda (opcional)"
                  title="Vincular a deuda"
                  options={debtOptions}
                  selectedValue={editTargetDebtId ?? NONE_OPTION_VALUE}
                  onSelect={(value) => {
                    hapticService.selection();
                    setEditTargetDebtId(value === NONE_OPTION_VALUE ? null : value);
                  }}
                  triggerTestID="edit-entry-debt-select"
                  valueTestID="edit-entry-debt-value"
                  pickerTestID="edit-entry-debt-picker"
                  accessibilityLabel="Vincular pago a una deuda"
                />
              ) : null}

              {isEditingExpense && savingsBuckets.length > 0 ? (
                <AdaptiveSelectField
                  label="Vincular gasto a un fondo de ahorro (opcional)"
                  title="Vincular a fondo"
                  options={bucketOptions}
                  selectedValue={editSavingsBucketId ?? NONE_OPTION_VALUE}
                  onSelect={(value) => {
                    hapticService.selection();
                    setEditSavingsBucketId(value === NONE_OPTION_VALUE ? null : value);
                  }}
                  triggerTestID="edit-entry-bucket-select"
                  valueTestID="edit-entry-bucket-value"
                  pickerTestID="edit-entry-bucket-picker"
                  accessibilityLabel="Vincular gasto a un fondo de ahorro"
                />
              ) : null}
            </View>
          ) : null}
        </View>

        <FormMessage message={editError} />

        <AppPressable
          testID="save-edit-entry-button"
          accessibilityRole="button"
          onPress={handleSaveEditEntry}
          style={{
            width: '100%',
            minHeight: minTouchTarget,
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
              (isEditingExpense ? colors.semantic.expense : colors.semantic.income)
            }
          >
            Guardar Cambios
          </AppText>
        </AppPressable>
      </View>
    </GlassSurface>
  );
});
