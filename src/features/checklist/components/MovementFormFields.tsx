/**
 * src/features/checklist/components/MovementFormFields.tsx
 *
 * Pieces shared by the add form (`ChecklistAddMovementForm`) and the edit form
 * (`ChecklistEditEntryForm`) of the checklist (CC-03):
 * - `MovementAmountField`: the hero amount card, red for an expense and green for an income.
 * - `MovementFrequencyField`: "Cada mes" / "Solo este mes".
 * - `MovementOptionalFields`: "Más opciones" with the note, the card or account, and the debt
 *   and savings fund the expense feeds.
 *
 * They are controlled: each form keeps its own field state, so typing re-renders only the form
 * and never the checklist rows (ADR 0028, R-17). `MovementOptionalFields` only owns whether
 * its panel is open.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AdaptiveSelectField,
  animateNextLayout,
  AppPressable,
  AppText,
  AppTextInput,
  hapticService,
  HeroAmountField,
  useBFlowTheme,
} from '../../../design-system';
import type {
  AccountMovementRole,
  ConceptType,
  Debt,
  FinancialAccount,
  SavingsBucket,
} from '../../../domain';
import { AccountLinkFields, describeAccountLink } from './AccountLinkFields';

const NONE_OPTION_VALUE = '__none__';

export interface MovementAmountFieldProps {
  movementType: ConceptType;
  value: string;
  onChangeText: (text: string) => void;
  containerTestID: string;
  inputTestID: string;
}

export function MovementAmountField({
  movementType,
  value,
  onChangeText,
  containerTestID,
  inputTestID,
}: MovementAmountFieldProps): React.JSX.Element {
  const isIncome = movementType === 'income';
  return (
    <HeroAmountField
      containerTestID={containerTestID}
      inputTestID={inputTestID}
      label={isIncome ? 'Monto a recibir' : 'Monto a pagar'}
      tone={isIncome ? 'income' : 'expense'}
      value={value}
      onChangeText={onChangeText}
    />
  );
}

const FREQUENCY_OPTIONS = [
  { value: true, label: 'Cada mes', a11y: 'Se repite cada mes' },
  { value: false, label: 'Solo este mes', a11y: 'Solo este mes' },
] as const;

export interface MovementFrequencyFieldProps {
  persistMonthly: boolean;
  onChange: (persistMonthly: boolean) => void;
  /** `add-movement` or `edit-entry`: ids are `<prefix>-persist-monthly|once`. */
  testIDPrefix: string;
}

export function MovementFrequencyField({
  persistMonthly,
  onChange,
  testIDPrefix,
}: MovementFrequencyFieldProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption" color={colors.text.secondary}>
        Frecuencia
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {FREQUENCY_OPTIONS.map((opt) => {
          const active = persistMonthly === opt.value;
          return (
            <AppPressable
              key={String(opt.value)}
              testID={`${testIDPrefix}-persist-${opt.value ? 'monthly' : 'once'}`}
              accessibilityRole="button"
              accessibilityLabel={opt.a11y}
              accessibilityState={{ selected: active }}
              onPress={() => {
                hapticService.selection();
                onChange(opt.value);
              }}
              style={{
                flex: 1,
                minHeight: minTouchTarget,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: active ? colors.accent.container : colors.glass.surfaceTint,
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
  );
}

export interface MovementOptionalFieldsProps {
  /** `add-movement` or `edit-entry`. */
  testIDPrefix: string;
  /** testID of the note input (kept from before: `movement-note-input`, `edit-entry-note-input`). */
  noteTestID: string;
  movementType: ConceptType;
  note: string;
  onChangeNote: (note: string) => void;
  notePlaceholder: string;
  financialAccounts: readonly FinancialAccount[];
  accountId: string | null;
  accountRole: AccountMovementRole;
  onChangeAccount: (accountId: string | null) => void;
  onChangeRole: (role: AccountMovementRole) => void;
  debts: readonly Debt[];
  targetDebtId: string | null;
  onChangeTargetDebt: (debtId: string | null) => void;
  savingsBuckets: readonly SavingsBucket[];
  savingsBucketId: string | null;
  onChangeSavingsBucket: (bucketId: string | null) => void;
}

export function MovementOptionalFields({
  testIDPrefix,
  noteTestID,
  movementType,
  note,
  onChangeNote,
  notePlaceholder,
  financialAccounts,
  accountId,
  accountRole,
  onChangeAccount,
  onChangeRole,
  debts,
  targetDebtId,
  onChangeTargetDebt,
  savingsBuckets,
  savingsBucketId,
  onChangeSavingsBucket,
}: MovementOptionalFieldsProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const [expanded, setExpanded] = useState(false);
  const isExpense = movementType === 'expense';

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

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (note.trim()) parts.push('Nota');
    if (isExpense && targetDebtId) {
      const debtName = debts.find((d) => d.id === targetDebtId)?.name;
      if (debtName) parts.push(debtName);
    }
    if (isExpense && savingsBucketId) {
      const bucketName = savingsBuckets.find((b) => b.id === savingsBucketId)?.name;
      if (bucketName) parts.push(bucketName);
    }
    const accountLabel = describeAccountLink(financialAccounts, movementType, accountId, accountRole);
    if (accountLabel) parts.push(accountLabel);
    return parts.join(' · ');
  }, [
    accountId,
    accountRole,
    debts,
    financialAccounts,
    isExpense,
    movementType,
    note,
    savingsBucketId,
    savingsBuckets,
    targetDebtId,
  ]);

  const hint = isExpense
    ? financialAccounts.length > 0
      ? 'Nota, tarjeta o cuenta, deuda o fondo de ahorro'
      : 'Nota, vincular a deuda o fondo de ahorro'
    : financialAccounts.length > 0
      ? 'Nota o cuenta donde se recibió'
      : 'Agregar nota opcional';

  return (
    <View style={{ gap: spacing.xs }}>
      <AppPressable
        testID={`${testIDPrefix}-more-options-toggle`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => {
          hapticService.selection();
          animateNextLayout();
          setExpanded((prev) => !prev);
        }}
        style={{
          minHeight: minTouchTarget,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor: expanded || summary ? colors.glass.specularBorder : colors.glass.subtleBorder,
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
            color={summary ? colors.accent.text : colors.text.secondary}
            numberOfLines={1}
          >
            {summary || hint}
          </AppText>
        </View>
        <AppText variant="micro" color={colors.text.secondary}>
          {expanded ? 'Ocultar' : 'Mostrar'}
        </AppText>
      </AppPressable>

      {/* Rendered directly (without a nested RevealDown) to avoid frame-by-frame layout thrashing */}
      {expanded ? (
        <View
          testID={`${testIDPrefix}-more-options-panel`}
          style={{ gap: spacing.sm, paddingTop: spacing.xs }}
        >
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Nota opcional
            </AppText>
            <AppTextInput
              testID={noteTestID}
              value={note}
              onChangeText={onChangeNote}
              placeholder={notePlaceholder}
            />
          </View>

          {/* Card or bank account the movement went through (ADR 0034) */}
          <AccountLinkFields
            accounts={financialAccounts}
            movementType={movementType}
            accountId={accountId}
            accountRole={accountRole}
            onChangeAccount={onChangeAccount}
            onChangeRole={onChangeRole}
            testIDPrefix={testIDPrefix}
          />

          {isExpense && debts.length > 0 ? (
            <AdaptiveSelectField
              label="Vincular pago a una deuda (opcional)"
              title="Vincular a deuda"
              options={debtOptions}
              selectedValue={targetDebtId ?? NONE_OPTION_VALUE}
              onSelect={(value) => {
                hapticService.selection();
                onChangeTargetDebt(value === NONE_OPTION_VALUE ? null : value);
              }}
              triggerTestID={`${testIDPrefix}-debt-select`}
              valueTestID={`${testIDPrefix}-debt-value`}
              pickerTestID={`${testIDPrefix}-debt-picker`}
              accessibilityLabel="Vincular pago a una deuda"
            />
          ) : null}

          {isExpense && savingsBuckets.length > 0 ? (
            <AdaptiveSelectField
              label="Vincular gasto a un fondo de ahorro (opcional)"
              title="Vincular a fondo"
              options={bucketOptions}
              selectedValue={savingsBucketId ?? NONE_OPTION_VALUE}
              onSelect={(value) => {
                hapticService.selection();
                onChangeSavingsBucket(value === NONE_OPTION_VALUE ? null : value);
              }}
              triggerTestID={`${testIDPrefix}-bucket-select`}
              valueTestID={`${testIDPrefix}-bucket-value`}
              pickerTestID={`${testIDPrefix}-bucket-picker`}
              accessibilityLabel="Vincular gasto a un fondo de ahorro"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
