/**
 * src/features/checklist/components/ChecklistEditEntryForm.tsx
 *
 * Editor of an existing checklist entry. It owns its field state, so typing re-renders only
 * this form and never the checklist rows (PERFORMANCE_AUDIT_2026-11-09, R-17). The parent
 * mounts it with `key={entry.id}`, which loads the entry's values when it opens.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  GlassSurface,
  hapticService,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatGroupedIntegerInput,
  parseDigitsInput,
  type AccountMovementRole,
  type Concept,
  type Debt,
  type FinancialAccount,
  type MonthEntry,
  type SavingsBucket,
} from '../../../domain';
import type { EditEntryUpdates } from '../../budget/store/useBudgetStore';
import {
  MovementAmountField,
  MovementFrequencyField,
  MovementOptionalFields,
} from './MovementFormFields';

const NO_ACCOUNTS: readonly FinancialAccount[] = [];

export interface ChecklistEditEntryFormProps {
  /** Live entry being edited; null if it disappeared while the editor was open. */
  entry: MonthEntry | null;
  concept?: Concept;
  debts: readonly Debt[];
  savingsBuckets: readonly SavingsBucket[];
  /** Credit cards and debit accounts a movement can go through (ADR 0034). */
  financialAccounts?: readonly FinancialAccount[];
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
  financialAccounts = NO_ACCOUNTS,
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
  const [editAccountId, setEditAccountId] = useState<string | null>(() =>
    entry?.accountId && financialAccounts.some((a) => a.id === entry.accountId)
      ? entry.accountId
      : null
  );
  const [editAccountRole, setEditAccountRole] = useState<AccountMovementRole>(
    () => entry?.accountRole ?? 'purchase'
  );
  const [editError, setEditError] = useState<string | null>(null);

  const isEditingExpense = entry?.type !== 'income';
  const editMovementType = isEditingExpense ? 'expense' : 'income';

  const handleSaveEditEntry = () => {
    if (!entry) return;
    if (!editNameInput.trim()) {
      setEditError('El nombre del movimiento no puede estar vacío.');
      return;
    }
    const parsedAmount = parseDigitsInput(editAmountInput);
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
        // ADR 0034: null removes the link; without accounts the field is left as it was.
        ...(financialAccounts.length > 0
          ? { accountId: editAccountId, accountRole: editAccountRole }
          : {}),
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

        {/* Hero amount on the semantic red/green surface */}
        <MovementAmountField
          movementType={editMovementType}
          containerTestID="edit-entry-hero-amount"
          inputTestID="edit-entry-amount-input"
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

        <MovementFrequencyField
          persistMonthly={editPersistMonthly}
          onChange={setEditPersistMonthly}
          testIDPrefix="edit-entry"
        />

        {/* Progressive disclosure for optional note, card or account, debt and savings fund */}
        <MovementOptionalFields
          testIDPrefix="edit-entry"
          noteTestID="edit-entry-note-input"
          movementType={editMovementType}
          note={editNoteInput}
          onChangeNote={setEditNoteInput}
          notePlaceholder="Ej. Factura, referencia, detalle..."
          financialAccounts={financialAccounts}
          accountId={editAccountId}
          accountRole={editAccountRole}
          onChangeAccount={setEditAccountId}
          onChangeRole={setEditAccountRole}
          debts={debts}
          targetDebtId={editTargetDebtId}
          onChangeTargetDebt={setEditTargetDebtId}
          savingsBuckets={savingsBuckets}
          savingsBucketId={editSavingsBucketId}
          onChangeSavingsBucket={setEditSavingsBucketId}
        />

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
