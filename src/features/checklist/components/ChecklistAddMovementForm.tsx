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
  AdaptiveSelectField,
  animateNextLayout,
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  GlassSurface,
  hapticService,
  HeroAmountField,
  useAmountPrivacy,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatGroupedIntegerInput,
  toAppIsoDate,
  type Concept,
  type ConceptGroup,
  type AccountMovementRole,
  type ConceptType,
  type Debt,
  type FinancialAccount,
  type MonthEntry,
  type SavingsBucket,
} from '../../../domain';
import { AccountLinkFields, describeAccountLink } from './AccountLinkFields';
import type { ChecklistWorkspaceViewProps } from './ChecklistWorkspaceView';

export interface ChecklistAddMovementFormProps {
  monthKey: string;
  /** Entries of the active month. */
  monthEntries: readonly MonthEntry[];
  concepts: readonly Concept[];
  debts: readonly Debt[];
  savingsBuckets: readonly SavingsBucket[];
  /** Credit cards and debit accounts a movement can go through (ADR 0034). */
  financialAccounts?: readonly FinancialAccount[];
  onAddOrCompleteMovement: ChecklistWorkspaceViewProps['onAddOrCompleteMovement'];
  onCreateCustomMovement?: ChecklistWorkspaceViewProps['onCreateCustomMovement'];
  /** Called after a valid submit so the parent closes the form. */
  onSubmitted: () => void;
}

const NONE_OPTION_VALUE = '__none__';
const NO_ACCOUNTS: readonly FinancialAccount[] = [];

function resolveConceptDebtId(concept: Concept | undefined, debts: readonly Debt[]): string | null {
  if (concept?.defaultTargetDebtId) return concept.defaultTargetDebtId;
  if (!concept?.linkedDebtGroup) return null;
  return debts.find((d) => d.groupKey === concept.linkedDebtGroup)?.id ?? debts[0]?.id ?? null;
}

export const ChecklistAddMovementForm = React.memo(function ChecklistAddMovementForm({
  monthKey,
  monthEntries,
  concepts,
  debts,
  savingsBuckets,
  financialAccounts = NO_ACCOUNTS,
  onAddOrCompleteMovement,
  onCreateCustomMovement,
  onSubmitted,
}: ChecklistAddMovementFormProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const { formatAmount } = useAmountPrivacy();

  const [movementType, setMovementType] = useState<ConceptType>('expense');
  const [conceptNameInput, setConceptNameInput] = useState('');
  const [conceptGroup, setConceptGroup] = useState<ConceptGroup>('variable');
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [targetDebtId, setTargetDebtId] = useState<string | null>(null);
  const [savingsBucketId, setSavingsBucketId] = useState<string | null>(null);
  const [linkageModified, setLinkageModified] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<AccountMovementRole>('purchase');
  const [persistMonthly, setPersistMonthly] = useState<boolean>(true);
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const trimmedName = conceptNameInput.trim();
  const normalizedQuery = trimmedName.toLowerCase();

  const exactPendingMatch = useMemo(() => {
    if (!normalizedQuery) return null;
    return (
      monthEntries.find(
        (e) =>
          e.conceptName.trim().toLowerCase() === normalizedQuery &&
          e.type === movementType &&
          e.status === 'pending'
      ) ?? null
    );
  }, [monthEntries, movementType, normalizedQuery]);

  // Only offer inline completion suggestions once the user starts typing (never an idle list).
  const pendingSuggestions = useMemo(() => {
    if (normalizedQuery.length < 2 || exactPendingMatch) return [];
    return monthEntries
      .filter(
        (e) =>
          e.status === 'pending' &&
          e.type === movementType &&
          e.conceptName.toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 3);
  }, [exactPendingMatch, monthEntries, movementType, normalizedQuery]);

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
    if (noteInput.trim()) parts.push('Nota');
    if (movementType === 'expense' && targetDebtId) {
      const debtName = debts.find((d) => d.id === targetDebtId)?.name;
      if (debtName) parts.push(debtName);
    }
    if (movementType === 'expense' && savingsBucketId) {
      const bucketName = savingsBuckets.find((b) => b.id === savingsBucketId)?.name;
      if (bucketName) parts.push(bucketName);
    }
    const accountLabel = describeAccountLink(
      financialAccounts,
      movementType,
      accountId,
      accountRole
    );
    if (accountLabel) parts.push(accountLabel);
    return parts.join(' · ');
  }, [
    accountId,
    accountRole,
    debts,
    financialAccounts,
    movementType,
    noteInput,
    savingsBucketId,
    savingsBuckets,
    targetDebtId,
  ]);

  const handleSelectSuggestion = (entry: MonthEntry) => {
    hapticService.selection();
    setConceptNameInput(entry.conceptName);
    setConceptGroup(entry.group);
    const digitsOnly = amountInput.replace(/[^0-9]/g, '');
    if ((!digitsOnly || Number(digitsOnly) === 0) && entry.plannedAmount > 0) {
      setAmountInput(formatGroupedIntegerInput(entry.plannedAmount));
    }
    const concept = concepts.find((c) => c.id === entry.conceptId);
    if (concept) {
      setTargetDebtId(resolveConceptDebtId(concept, debts));
      setSavingsBucketId(concept.savingsContribution?.bucketId ?? null);
      setPersistMonthly(concept.recurrence.kind === 'monthly');
    }
    setLinkageModified(false);
    setFormError(null);
  };

  const handleSubmitMovement = () => {
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

    const existingPendingEntry = exactPendingMatch;
    const linkagePayload = linkageModified
      ? {
          targetDebtId: movementType === 'expense' ? targetDebtId : null,
          savingsBucketId: movementType === 'expense' ? savingsBucketId : null,
        }
      : {};
    // ADR 0034: only sent when chosen, so completing a pending movement keeps its link.
    const accountPayload = accountId ? { accountId, accountRole } : {};

    if (existingPendingEntry) {
      onAddOrCompleteMovement({
        monthKey,
        conceptId: existingPendingEntry.conceptId,
        actualAmount: parsedAmount,
        completedAt: toAppIsoDate(),
        ...linkagePayload,
        ...accountPayload,
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
        ...accountPayload,
        ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
      });
    } else {
      const existingConcept = concepts.find(
        (c) =>
          c.name.trim().toLowerCase() === normalizedQuery &&
          c.type === movementType
      );
      if (existingConcept) {
        onAddOrCompleteMovement({
          monthKey,
          conceptId: existingConcept.id,
          actualAmount: parsedAmount,
          completedAt: toAppIsoDate(),
          ...linkagePayload,
          ...accountPayload,
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
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xxs,
            padding: spacing.xxs,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceTint,
            borderWidth: 1,
            borderColor: colors.glass.subtleBorder,
          }}
        >
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
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  hapticService.selection();
                  setMovementType(tab.type);
                }}
                style={{
                  flex: 1,
                  minHeight: minTouchTarget,
                  borderRadius: radius.sm,
                  borderCurve: 'continuous',
                  backgroundColor: isSelected
                    ? isExpense
                      ? colors.semantic.expenseSoft
                      : colors.semantic.incomeSoft
                    : 'transparent',
                  borderWidth: 1,
                  borderColor: isSelected
                    ? isExpense
                      ? colors.semantic.expense
                      : colors.semantic.income
                    : 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText
                  variant="callout"
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

        {/* Single Interactive Hero Amount Input directly on the semantic red/green surface */}
        <HeroAmountField
          containerTestID="add-movement-hero-amount"
          inputTestID="movement-amount-input"
          label={movementType === 'income' ? 'Monto a recibir' : 'Monto a pagar'}
          tone={movementType === 'income' ? 'income' : 'expense'}
          value={amountInput}
          onChangeText={(text) => {
            setAmountInput(text);
            if (formError) setFormError(null);
          }}
        />

        {/* Concept Name Input + contextual pending autocomplete */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Nombre del movimiento
          </AppText>
          <AppTextInput
            testID="custom-concept-name-input"
            value={conceptNameInput}
            onChangeText={(text) => {
              setConceptNameInput(text);
              if (formError) setFormError(null);
            }}
            placeholder={
              movementType === 'income'
                ? 'Ej. Salario, Rendimientos, Bono...'
                : 'Ej. Supermercado, Alquiler, Gasolina...'
            }
          />

          {exactPendingMatch ? (
            <AppText
              testID="add-movement-pending-match-hint"
              variant="micro"
              color={colors.semantic.completed}
            >
              {`Se completará el pendiente "${exactPendingMatch.conceptName}" (${formatAmount(exactPendingMatch.plannedAmount)})`}
            </AppText>
          ) : null}

          {pendingSuggestions.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="micro" color={colors.text.secondary}>
                ¿Completar un pendiente del mes?
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {pendingSuggestions.map((entry) => (
                  <AppPressable
                    key={entry.id}
                    testID={`add-movement-suggestion-${entry.id}`}
                    accessibilityRole="button"
                    onPress={() => handleSelectSuggestion(entry)}
                    style={{
                      minHeight: minTouchTarget,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xs,
                      borderRadius: radius.pill,
                      borderCurve: 'continuous',
                      backgroundColor: colors.accent.container,
                      borderWidth: 1,
                      borderColor: colors.accent.primary,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="micro" color={colors.accent.onContainer}>
                      {`${entry.conceptName} · ${formatAmount(entry.plannedAmount)}`}
                    </AppText>
                  </AppPressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* Concept Group: Fijo vs Variable */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Clasificación
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {(
              [
                { id: 'fixed', label: 'Fijo' },
                { id: 'variable', label: 'Variable' },
              ] as const
            ).map((g) => {
              const active = conceptGroup === g.id;
              return (
                <AppPressable
                  key={g.id}
                  testID={`custom-group-${g.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticService.selection();
                    setConceptGroup(g.id);
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
                    borderColor: active
                      ? colors.accent.primary
                      : colors.glass.subtleBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="caption"
                    color={active ? colors.accent.onContainer : colors.text.secondary}
                  >
                    {g.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
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
              const active = persistMonthly === opt.value;
              return (
                <AppPressable
                  key={String(opt.value)}
                  testID={`add-movement-persist-${opt.value ? 'monthly' : 'once'}`}
                  accessibilityRole="button"
                  accessibilityLabel={opt.a11y}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticService.selection();
                    setPersistMonthly(opt.value);
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
                    borderColor: active
                      ? colors.accent.primary
                      : colors.glass.subtleBorder,
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
            testID="add-movement-more-options-toggle"
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
                  (movementType === 'expense'
                    ? financialAccounts.length > 0
                      ? 'Nota, tarjeta o cuenta, deuda o fondo de ahorro'
                      : 'Nota, vincular a deuda o fondo de ahorro'
                    : financialAccounts.length > 0
                      ? 'Nota o cuenta donde se recibió'
                      : 'Agregar nota opcional')}
              </AppText>
            </View>
            <AppText variant="micro" color={colors.text.secondary}>
              {showMoreOptions ? 'Ocultar' : 'Mostrar'}
            </AppText>
          </AppPressable>

          {/* Rendered directly (without nested RevealDown) to avoid frame-by-frame parent layout thrashing */}
          {showMoreOptions ? (
            <View
              testID="add-movement-more-options-panel"
              style={{ gap: spacing.sm, paddingTop: spacing.xs }}
            >
              {/* Note Input */}
              <View style={{ gap: spacing.xxs }}>
                <AppText variant="caption" color={colors.text.secondary}>
                  Nota opcional
                </AppText>
                <AppTextInput
                  testID="movement-note-input"
                  value={noteInput}
                  onChangeText={setNoteInput}
                  placeholder="Ej. Factura No. 45, PSE, compra quincenal..."
                />
              </View>

              {/* Card or bank account the movement went through (ADR 0034) */}
              <AccountLinkFields
                accounts={financialAccounts}
                movementType={movementType}
                accountId={accountId}
                accountRole={accountRole}
                onChangeAccount={setAccountId}
                onChangeRole={setAccountRole}
                testIDPrefix="add-movement"
              />

              {/* Modern Adaptive Selectors for Debt & Savings Fund Linkage */}
              {movementType === 'expense' && debts.length > 0 ? (
                <AdaptiveSelectField
                  label="Vincular pago a una deuda (opcional)"
                  title="Vincular a deuda"
                  options={debtOptions}
                  selectedValue={targetDebtId ?? NONE_OPTION_VALUE}
                  onSelect={(value) => {
                    hapticService.selection();
                    setTargetDebtId(value === NONE_OPTION_VALUE ? null : value);
                    setLinkageModified(true);
                  }}
                  triggerTestID="add-movement-debt-select"
                  valueTestID="add-movement-debt-value"
                  pickerTestID="add-movement-debt-picker"
                  accessibilityLabel="Vincular pago a una deuda"
                />
              ) : null}

              {movementType === 'expense' && savingsBuckets.length > 0 ? (
                <AdaptiveSelectField
                  label="Vincular gasto a un fondo de ahorro (opcional)"
                  title="Vincular a fondo"
                  options={bucketOptions}
                  selectedValue={savingsBucketId ?? NONE_OPTION_VALUE}
                  onSelect={(value) => {
                    hapticService.selection();
                    setSavingsBucketId(value === NONE_OPTION_VALUE ? null : value);
                    setLinkageModified(true);
                  }}
                  triggerTestID="add-movement-bucket-select"
                  valueTestID="add-movement-bucket-value"
                  pickerTestID="add-movement-bucket-picker"
                  accessibilityLabel="Vincular gasto a un fondo de ahorro"
                />
              ) : null}
            </View>
          ) : null}
        </View>

        <FormMessage message={formError} />

        {/* Submit Button */}
        <AppPressable
          testID="submit-movement-button"
          accessibilityRole="button"
          onPress={handleSubmitMovement}
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
