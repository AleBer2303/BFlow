/**
 * src/features/checklist/components/ChecklistWorkspaceView.tsx
 *
 * Implements Screens `03-monthly-checklist` & `04-add-movement-modal`:
 * - iOS segmented filter (`Todos` | `Pendientes` | `Completados`)
 * - Single primary `+ Nuevo Movimiento` button opening a clean, distraction-free Liquid Glass form
 *   without repeating pre-existing items or catalog chips.
 * - Section-level Edit and Delete action controls for Ingresos and Gastos.
 * - In-situ row styling:
 *   - Normal: clean row without cluttering per-item action buttons.
 *   - Delete mode: row highlighted in soft red with a red trash button.
 *   - Edit mode: row displays pencil edit icon at right edge to open item editor.
 * - Full breakdown of Ingresos (Fijos / Variables) and Gastos (Fijos / Variables).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import {
  ActionModeToggleRow,
  animateNextLayout,
  AppPressable,
  AppText,
  CheckIndicator,
  CurrencyText,
  estimateTextWidth,
  GlassSurface,
  hapticService,
  InlineItemActionPill,
  IS_MOTION_STATIC,
  MIN_TOUCH_TARGET_PT,
  resolvePresenceSpec,
  ResponsiveColumns,
  RevealDown,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  TabLeaveResetter,
  toEasing,
  USE_NATIVE_DRIVER,
  useAmountPrivacy,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatFinancialAccountLabel,
  type AccountMovementRole,
  type Concept,
  type ConceptGroup,
  type Debt,
  type FinancialAccount,
  type MonthEntry,
  type MonthlyBudgetSummary,
  type RegisterOrCompleteMovementInput,
  type SavingsBucket,
  DEFAULT_DEBT_GROUP_KEY,
} from '../../../domain';
import type {
  CreateCustomConceptInput,
  EditEntryUpdates,
} from '../../budget/store/useBudgetStore';
import { ChecklistAddMovementForm } from './ChecklistAddMovementForm';
import { ChecklistEditEntryForm } from './ChecklistEditEntryForm';

const NO_DEBTS: readonly Debt[] = [];
const NO_SAVINGS_BUCKETS: readonly SavingsBucket[] = [];
const NO_ACCOUNTS: readonly FinancialAccount[] = [];

export type ChecklistFilterMode = 'all' | 'pending' | 'completed';

export interface ChecklistWorkspaceViewProps {
  monthKey: string;
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  budget: MonthlyBudgetSummary;
  debts?: readonly Debt[];
  savingsBuckets?: readonly SavingsBucket[];
  /** Credit cards and debit accounts (ADR 0034). */
  financialAccounts?: readonly FinancialAccount[];
  onToggleEntry: (entry: MonthEntry) => void;
  onAddOrCompleteMovement: (
    input: RegisterOrCompleteMovementInput & {
      targetDebtId?: string | null;
      savingsBucketId?: string | null;
      accountId?: string | null;
      accountRole?: AccountMovementRole | null;
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

interface ChecklistRowItemProps {
  entry: MonthEntry;
  concept?: Concept;
  linkedDebt?: Debt;
  linkedBucket?: SavingsBucket;
  linkedAccount?: FinancialAccount;
  isEditMode: boolean;
  isDeleteMode: boolean;
  colors: ReturnType<typeof useBFlowTheme>['colors'];
  spacing: ReturnType<typeof useBFlowTheme>['spacing'];
  radius: ReturnType<typeof useBFlowTheme>['radius'];
  onToggle: (entry: MonthEntry) => void;
  onEdit: (entry: MonthEntry) => void;
  onDelete: (entry: MonthEntry) => void;
}

/**
 * Soft reveal for the per-row edit / delete buttons: uses `USE_NATIVE_DRIVER` for opacity,
 * slide, and scale while the parent triggers `animateNextLayout()` once per mode toggle,
 * avoiding 24-40 concurrent JS-thread width animations.
 * Animation is skipped under Jest.
 */
export function ActionRevealSlot({
  visible,
  gap: _gap,
  children,
}: {
  visible: boolean;
  gap: number;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const skipMotion = IS_MOTION_STATIC;
  const { skin, reducedMotion, minTouchTarget } = useBFlowTheme();
  const { open, close } = resolvePresenceSpec({ skin, reducedMotion }, 'control');
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  // Only animate out after the slot has actually been opened; mounting with `visible={false}`
  // must stay completely inert so opening Checklist never triggers animations at once.
  const hasBeenVisibleRef = useRef(visible);

  useEffect(() => {
    if (skipMotion) return undefined;
    if (visible) {
      hasBeenVisibleRef.current = true;
      setMounted(true);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: open.durationMs,
        easing: toEasing(open.easing),
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      anim.start();
      return () => anim.stop();
    }
    if (!hasBeenVisibleRef.current) {
      return undefined;
    }
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: close.durationMs,
      easing: toEasing(close.easing),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start(({ finished }) => {
      if (finished) {
        hasBeenVisibleRef.current = false;
        setMounted(false);
      }
    });
    return () => anim.stop();
    // The spec only changes with the skin or the Reduce Motion setting, never mid-reveal.
  }, [visible, skipMotion, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  if (skipMotion) return visible ? <>{children}</> : null;
  if (!mounted) return null;

  return (
    <Animated.View
      style={{
        width: minTouchTarget,
        opacity: progress,
        justifyContent: 'center',
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [open.distance, 0],
            }),
          },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [open.scale, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const ChecklistRowItem = React.memo(function ChecklistRowItem({
  entry,
  concept,
  linkedDebt,
  linkedBucket,
  linkedAccount,
  isEditMode,
  isDeleteMode,
  colors,
  spacing,
  radius,
  onToggle,
  onEdit,
  onDelete,
}: ChecklistRowItemProps) {
  const { formatAmount } = useAmountPrivacy();
  const isCompleted = entry.status === 'completed';
  const isRepeatable = Boolean(concept?.allowMultiplePerMonth);

  const handleRowPress = () => {
    if (isDeleteMode) {
      // Deleting requires an explicit tap on the trash button; the row itself is inert
      // so a stray tap while scrolling can never remove an entry.
      return;
    }
    if (isEditMode) {
      hapticService.light();
      onEdit(entry);
    } else {
      hapticService.trigger(isCompleted ? 'light' : 'success');
      onToggle(entry);
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      <AppPressable
        testID={`checklist-workspace-item-${entry.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={`${entry.conceptName}, ${formatAmount(entry.actualAmount)}`}
        onPress={handleRowPress}
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
          backgroundColor: isDeleteMode
            ? colors.semantic.expenseSoft
            : isCompleted
              ? colors.semantic.completedSoft
              : colors.glass.surfaceTint,
          borderWidth: 1,
          borderColor: isDeleteMode
            ? colors.semantic.expense
            : isCompleted
              ? colors.glass.specularBorder
              : colors.glass.subtleBorder,
        }}
      >
        <CheckIndicator checked={isCompleted} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              flexWrap: 'wrap',
            }}
          >
            <AppText
              variant="body"
              color={isDeleteMode ? colors.semantic.expense : colors.text.primary}
            >
              {entry.conceptName}
            </AppText>
            {linkedBucket ? (
              <StatusBadge label={`→ ${linkedBucket.name}`} status="reserve" />
            ) : concept?.savingsContribution?.bucketId ? (
              <StatusBadge
                label={`→ ${concept.savingsContribution.bucketId === 'reserve' ? 'Fondo de Reserva' : concept.savingsContribution.bucketId}`}
                status="reserve"
              />
            ) : null}
            {linkedDebt ? (
              <StatusBadge label={`→ ${linkedDebt.name}`} status="debt" />
            ) : concept?.linkedDebtGroup ? (
              <StatusBadge
                label={`→ Deuda ${concept.linkedDebtGroup !== DEFAULT_DEBT_GROUP_KEY ? `(${concept.linkedDebtGroup})` : ''}`.trim()}
                status="debt"
              />
            ) : null}
            {linkedAccount ? (
              <StatusBadge
                label={
                  linkedAccount.type === 'credit' &&
                  entry.type === 'expense' &&
                  entry.accountRole === 'payment'
                    ? `Pago a ${formatFinancialAccountLabel(linkedAccount)}`
                    : formatFinancialAccountLabel(linkedAccount)
                }
                status={linkedAccount.type === 'credit' ? 'savings' : 'provisions'}
              />
            ) : null}
            {concept?.recurrence.kind === 'specific_months' ? (
              <StatusBadge label="Solo este mes" status="info" />
            ) : null}
            {isRepeatable ? <StatusBadge label="Múltiple/mes" status="info" /> : null}
          </View>
          <AppText
            variant="micro"
            color={isDeleteMode ? colors.semantic.expense : colors.text.secondary}
          >
            {isCompleted
              ? `${entry.type === 'income' ? 'Recibido' : 'Pagado'}${entry.completedAt ? ` · ${entry.completedAt}` : ''}${entry.note ? ` · ${entry.note}` : ''}`
              : `Pendiente · Previsto ${formatAmount(entry.plannedAmount)}`}
          </AppText>
        </View>

        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <CurrencyText
            amount={entry.actualAmount}
            variant="body"
            tone={isDeleteMode ? 'expense' : entry.type === 'income' ? 'income' : 'expense'}
          />
        </View>
      </AppPressable>

      {/* In-situ Edit Action Button (only visible in edit mode) */}
      <ActionRevealSlot visible={isEditMode} gap={spacing.xs}>
        <InlineItemActionPill
          iconOnly
          mode="edit"
          itemName={entry.conceptName}
          editTestID={`edit-entry-${entry.id}`}
          deleteTestID={`delete-entry-${entry.id}`}
          onEdit={() => {
            hapticService.light();
            onEdit(entry);
          }}
        />
      </ActionRevealSlot>

      {/* In-situ Delete Action Button (only visible in delete mode) */}
      <ActionRevealSlot visible={isDeleteMode} gap={spacing.xs}>
        <InlineItemActionPill
          iconOnly
          mode="delete"
          itemName={entry.conceptName}
          editTestID={`edit-entry-${entry.id}`}
          deleteTestID={`delete-entry-${entry.id}`}
          onDelete={() => onDelete(entry)}
        />
      </ActionRevealSlot>
    </View>
  );
});

interface ChecklistSectionCardProps {
  entries: readonly MonthEntry[];
  conceptById: ReadonlyMap<string, Concept>;
  debtById: ReadonlyMap<string, Debt>;
  debtByGroupKey: ReadonlyMap<string, Debt>;
  bucketById: ReadonlyMap<string, SavingsBucket>;
  accountById: ReadonlyMap<string, FinancialAccount>;
  budget: MonthlyBudgetSummary;
  isEditMode: boolean;
  isDeleteMode: boolean;
  onToggleEdit: () => void;
  onToggleDelete: () => void;
  onToggleEntry: (entry: MonthEntry) => void;
  onOpenEditModal: (entry: MonthEntry) => void;
  onDeleteEntry: (entry: MonthEntry) => void;
}

const ChecklistIncomesCard = React.memo(function ChecklistIncomesCard({
  entries,
  conceptById,
  debtById,
  debtByGroupKey,
  bucketById,
  accountById,
  budget,
  isEditMode,
  isDeleteMode,
  onToggleEdit,
  onToggleDelete,
  onToggleEntry,
  onOpenEditModal,
  onDeleteEntry,
}: ChecklistSectionCardProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius } = useBFlowTheme();

  const fixedIncomes = useMemo(() => entries.filter((e) => e.group === 'fixed'), [entries]);
  const variableIncomes = useMemo(() => entries.filter((e) => e.group === 'variable'), [entries]);

  const renderEntryRow = (entry: MonthEntry) => {
    const concept = conceptById.get(entry.conceptId);
    const linkedDebt = concept?.defaultTargetDebtId
      ? debtById.get(concept.defaultTargetDebtId)
      : concept?.linkedDebtGroup
        ? debtByGroupKey.get(concept.linkedDebtGroup)
        : undefined;
    const linkedBucket = concept?.savingsContribution?.bucketId
      ? bucketById.get(concept.savingsContribution.bucketId)
      : undefined;

    return (
      <ChecklistRowItem
        key={entry.id}
        entry={entry}
        concept={concept}
        linkedDebt={linkedDebt}
        linkedBucket={linkedBucket}
        linkedAccount={entry.accountId ? accountById.get(entry.accountId) : undefined}
        isEditMode={isEditMode}
        isDeleteMode={isDeleteMode}
        colors={colors}
        spacing={spacing}
        radius={radius}
        onToggle={onToggleEntry}
        onEdit={onOpenEditModal}
        onDelete={onDeleteEntry}
      />
    );
  };

  return (
    <ScrollRevealSection>
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
            <View style={{ gap: spacing.xxs, flexShrink: 1, minWidth: 0 }}>
              <AppText variant="title2">Ingresos</AppText>
              <AppText variant="caption" color={colors.semantic.income}>
                {`Recibido ${formatAmount(budget.receivedIncome)} / Previsto ${formatAmount(budget.plannedIncome)}`}
              </AppText>
            </View>

            {/* Incomes Section Action Controls: Editar & Eliminar */}
            <ActionModeToggleRow
              compact
              activeMode={isEditMode ? 'edit' : isDeleteMode ? 'delete' : null}
              editLabel="Editar"
              deleteLabel="Eliminar"
              activeEditLabel="Listo"
              activeDeleteLabel="Listo"
              editTestID="incomes-edit-action-button"
              deleteTestID="incomes-delete-action-button"
              editAccessibilityLabel="Editar ingresos"
              deleteAccessibilityLabel="Eliminar ingresos"
              onToggleEdit={onToggleEdit}
              onToggleDelete={onToggleDelete}
            />
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Ingresos Fijos · Pendiente: ${formatAmount(budget.incomeByGroup.fixed.pending)}`}
          </AppText>
          {fixedIncomes.map(renderEntryRow)}

          <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              {`Ingresos Variables · Recibido: ${formatAmount(budget.incomeByGroup.variable.paid)}`}
            </AppText>
            {variableIncomes.map(renderEntryRow)}
          </View>
        </View>
      </GlassSurface>
    </ScrollRevealSection>
  );
});

const ChecklistExpensesCard = React.memo(function ChecklistExpensesCard({
  entries,
  conceptById,
  debtById,
  debtByGroupKey,
  bucketById,
  accountById,
  budget,
  isEditMode,
  isDeleteMode,
  onToggleEdit,
  onToggleDelete,
  onToggleEntry,
  onOpenEditModal,
  onDeleteEntry,
}: ChecklistSectionCardProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius } = useBFlowTheme();

  const fixedExpenses = useMemo(() => entries.filter((e) => e.group === 'fixed'), [entries]);
  const variableExpenses = useMemo(() => entries.filter((e) => e.group === 'variable'), [entries]);

  const renderEntryRow = (entry: MonthEntry) => {
    const concept = conceptById.get(entry.conceptId);
    const linkedDebt = concept?.defaultTargetDebtId
      ? debtById.get(concept.defaultTargetDebtId)
      : concept?.linkedDebtGroup
        ? debtByGroupKey.get(concept.linkedDebtGroup)
        : undefined;
    const linkedBucket = concept?.savingsContribution?.bucketId
      ? bucketById.get(concept.savingsContribution.bucketId)
      : undefined;

    return (
      <ChecklistRowItem
        key={entry.id}
        entry={entry}
        concept={concept}
        linkedDebt={linkedDebt}
        linkedBucket={linkedBucket}
        linkedAccount={entry.accountId ? accountById.get(entry.accountId) : undefined}
        isEditMode={isEditMode}
        isDeleteMode={isDeleteMode}
        colors={colors}
        spacing={spacing}
        radius={radius}
        onToggle={onToggleEntry}
        onEdit={onOpenEditModal}
        onDelete={onDeleteEntry}
      />
    );
  };

  return (
    <ScrollRevealSection>
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
            <View style={{ gap: spacing.xxs, flexShrink: 1, minWidth: 0 }}>
              <AppText variant="title2">Gastos</AppText>
              <AppText variant="caption" color={colors.semantic.expense}>
                {`Pagado ${formatAmount(budget.paidExpenses)} / Previsto ${formatAmount(budget.plannedExpenses)}`}
              </AppText>
            </View>

            {/* Expenses Section Action Controls: Editar & Eliminar */}
            <ActionModeToggleRow
              compact
              activeMode={isEditMode ? 'edit' : isDeleteMode ? 'delete' : null}
              editLabel="Editar"
              deleteLabel="Eliminar"
              activeEditLabel="Listo"
              activeDeleteLabel="Listo"
              editTestID="expenses-edit-action-button"
              deleteTestID="expenses-delete-action-button"
              editAccessibilityLabel="Editar gastos"
              deleteAccessibilityLabel="Eliminar gastos"
              onToggleEdit={onToggleEdit}
              onToggleDelete={onToggleDelete}
            />
          </View>

          <AppText variant="caption" color={colors.text.secondary}>
            {`Gastos Fijos (${formatAmount(budget.expensesByGroup.fixed.paid)} pagados · ${formatAmount(budget.expensesByGroup.fixed.pending)} pendientes)`}
          </AppText>
          {fixedExpenses.map(renderEntryRow)}

          <View style={{ paddingTop: spacing.xs, gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              {`Gastos Variables (${formatAmount(budget.expensesByGroup.variable.paid)} pagados · ${formatAmount(budget.expensesByGroup.variable.pending)} pendientes)`}
            </AppText>
            {variableExpenses.map(renderEntryRow)}
          </View>
        </View>
      </GlassSurface>
    </ScrollRevealSection>
  );
});

interface ChecklistSectionsGridProps {
  filteredEntries: readonly MonthEntry[];
  conceptById: ReadonlyMap<string, Concept>;
  debts: readonly Debt[];
  savingsBuckets: readonly SavingsBucket[];
  financialAccounts: readonly FinancialAccount[];
  budget: MonthlyBudgetSummary;
  incomesEditMode: boolean;
  incomesDeleteMode: boolean;
  expensesEditMode: boolean;
  expensesDeleteMode: boolean;
  onToggleIncomesEdit: () => void;
  onToggleIncomesDelete: () => void;
  onToggleExpensesEdit: () => void;
  onToggleExpensesDelete: () => void;
  onToggleEntry: (entry: MonthEntry) => void;
  onOpenEditModal: (entry: MonthEntry) => void;
  onDeleteEntry: (entry: MonthEntry) => void;
}

const ChecklistSectionsGrid = React.memo(function ChecklistSectionsGrid({
  filteredEntries,
  conceptById,
  debts,
  savingsBuckets,
  financialAccounts,
  budget,
  incomesEditMode,
  incomesDeleteMode,
  expensesEditMode,
  expensesDeleteMode,
  onToggleIncomesEdit,
  onToggleIncomesDelete,
  onToggleExpensesEdit,
  onToggleExpensesDelete,
  onToggleEntry,
  onOpenEditModal,
  onDeleteEntry,
}: ChecklistSectionsGridProps): React.JSX.Element {
  const debtById = useMemo(
    () => new Map(debts.map((debt) => [debt.id, debt] as const)),
    [debts]
  );
  const debtByGroupKey = useMemo(() => {
    const map = new Map<string, Debt>();
    for (const debt of debts) {
      if (!map.has(debt.groupKey)) {
        map.set(debt.groupKey, debt);
      }
    }
    return map;
  }, [debts]);
  const bucketById = useMemo(
    () => new Map(savingsBuckets.map((bucket) => [bucket.id, bucket] as const)),
    [savingsBuckets]
  );
  const accountById = useMemo(
    () => new Map(financialAccounts.map((account) => [account.id, account] as const)),
    [financialAccounts]
  );

  const incomeEntries = useMemo(
    () => filteredEntries.filter((e) => e.type === 'income'),
    [filteredEntries]
  );
  const expenseEntries = useMemo(
    () => filteredEntries.filter((e) => e.type === 'expense'),
    [filteredEntries]
  );

  return (
    <ResponsiveColumns testID="checklist-sections">
      <ChecklistIncomesCard
        entries={incomeEntries}
        conceptById={conceptById}
        debtById={debtById}
        debtByGroupKey={debtByGroupKey}
        bucketById={bucketById}
        accountById={accountById}
        budget={budget}
        isEditMode={incomesEditMode}
        isDeleteMode={incomesDeleteMode}
        onToggleEdit={onToggleIncomesEdit}
        onToggleDelete={onToggleIncomesDelete}
        onToggleEntry={onToggleEntry}
        onOpenEditModal={onOpenEditModal}
        onDeleteEntry={onDeleteEntry}
      />
      <ChecklistExpensesCard
        entries={expenseEntries}
        conceptById={conceptById}
        debtById={debtById}
        debtByGroupKey={debtByGroupKey}
        bucketById={bucketById}
        accountById={accountById}
        budget={budget}
        isEditMode={expensesEditMode}
        isDeleteMode={expensesDeleteMode}
        onToggleEdit={onToggleExpensesEdit}
        onToggleDelete={onToggleExpensesDelete}
        onToggleEntry={onToggleEntry}
        onOpenEditModal={onOpenEditModal}
        onDeleteEntry={onDeleteEntry}
      />
    </ResponsiveColumns>
  );
});

type ActiveChecklistForm =
  | { kind: 'add'; key: number }
  | { kind: 'edit'; entryId: string; key: number }
  | null;

type ChecklistSectionMode =
  | 'incomes-edit'
  | 'incomes-delete'
  | 'expenses-edit'
  | 'expenses-delete'
  | null;

export function ChecklistWorkspaceView({
  monthKey,
  concepts,
  entries,
  budget,
  debts = NO_DEBTS,
  savingsBuckets = NO_SAVINGS_BUCKETS,
  financialAccounts = NO_ACCOUNTS,
  onToggleEntry,
  onAddOrCompleteMovement,
  onCreateCustomMovement,
  onEditEntry,
  onDeleteEntry,
  onRemoveRepeatableEntry,
}: ChecklistWorkspaceViewProps): React.JSX.Element {
  const { colors, spacing, radius, typography } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [filterMode, setFilterMode] = useState<ChecklistFilterMode>('all');

  // Single mutually-exclusive section mode across Ingresos and Gastos (at most one active).
  const [sectionMode, setSectionMode] = useState<ChecklistSectionMode>(null);
  const incomesEditMode = sectionMode === 'incomes-edit';
  const incomesDeleteMode = sectionMode === 'incomes-delete';
  const expensesEditMode = sectionMode === 'expenses-edit';
  const expensesDeleteMode = sectionMode === 'expenses-delete';

  // Single active form slot (R-17): guarantees at most one form is open and remounts clean.
  const [activeForm, setActiveForm] = useState<ActiveChecklistForm>(null);
  const formKeyRef = useRef(0);

  const isAddModalOpen = activeForm?.kind === 'add';
  const editingEntryId = activeForm?.kind === 'edit' ? activeForm.entryId : null;

  const handleResetTransientState = useCallback(() => {
    setActiveForm(null);
    setSectionMode(null);
  }, []);

  useEffect(() => {
    handleResetTransientState();
  }, [monthKey, handleResetTransientState]);

  const conceptById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept] as const)),
    [concepts]
  );

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

  const pendingTotalCount = useMemo(
    () => monthEntries.filter((e) => e.status === 'pending').length,
    [monthEntries]
  );
  const completedTotalCount = useMemo(
    () => monthEntries.filter((e) => e.status === 'completed').length,
    [monthEntries]
  );

  const handleToggleAddModal = useCallback(() => {
    hapticService.light();
    setActiveForm((prev) => {
      if (prev?.kind === 'add') return null;
      setSectionMode(null);
      formKeyRef.current += 1;
      return { kind: 'add', key: formKeyRef.current };
    });
  }, []);
  const handleCloseActiveForm = useCallback(() => setActiveForm(null), []);

  const activeEditingEntry = useMemo(
    () => (editingEntryId ? monthEntries.find((e) => e.id === editingEntryId) ?? null : null),
    [editingEntryId, monthEntries]
  );

  // Stable row handlers so the memoized rows skip re-rendering (R-16).
  const handleOpenEditModal = useCallback((entry: MonthEntry) => {
    formKeyRef.current += 1;
    setActiveForm({ kind: 'edit', entryId: entry.id, key: formKeyRef.current });
  }, []);

  const handleDeleteEntry = useCallback(
    (entry: MonthEntry) => {
      if (onDeleteEntry) {
        onDeleteEntry(entry.id);
      } else {
        onRemoveRepeatableEntry(entry.id);
      }
      setActiveForm((prev) =>
        prev?.kind === 'edit' && prev.entryId === entry.id ? null : prev
      );
    },
    [onDeleteEntry, onRemoveRepeatableEntry]
  );

  const toggleSectionMode = useCallback(
    (mode: Exclude<ChecklistSectionMode, null>, isDestructive: boolean) => {
      animateNextLayout();
      setSectionMode((prev) => {
        const next = prev === mode ? null : mode;
        if (isDestructive) {
          hapticService.trigger(prev === mode ? 'light' : 'warning');
        } else {
          hapticService.light();
        }
        if (next) setActiveForm(null);
        return next;
      });
    },
    []
  );

  const handleToggleIncomesEdit = useCallback(
    () => toggleSectionMode('incomes-edit', false),
    [toggleSectionMode]
  );
  const handleToggleIncomesDelete = useCallback(
    () => toggleSectionMode('incomes-delete', true),
    [toggleSectionMode]
  );
  const handleToggleExpensesEdit = useCallback(
    () => toggleSectionMode('expenses-edit', false),
    [toggleSectionMode]
  );
  const handleToggleExpensesDelete = useCallback(
    () => toggleSectionMode('expenses-delete', true),
    [toggleSectionMode]
  );

  return (
    <View style={{ gap: spacing.md }} testID="checklist-workspace-view">
      {activeForm !== null || sectionMode !== null ? (
        <TabLeaveResetter onLeave={handleResetTransientState} />
      ) : null}
      {/* Top Action Bar: Header + Full-Width Add Movement CTA + Segmented Filter */}
      <ScrollDepthHero>
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
              pulseOnChange
            />
          </View>

          <AppPressable
            testID="open-add-movement-modal-button"
            accessibilityRole="button"
            accessibilityLabel="Agregar o completar movimiento"
            onPress={handleToggleAddModal}
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
              // Closed: the view's main action. Open: a quiet "Cerrar" toggle.
              ...(isAddModalOpen ? null : primaryAction.container),
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText
              variant="headline"
              color={
                isAddModalOpen
                  ? colors.text.primary
                  : (primaryAction.labelColor ?? colors.text.primary)
              }
            >
              {isAddModalOpen ? 'Cerrar' : '+ Nuevo Movimiento'}
            </AppText>
          </AppPressable>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(
              [
                { id: 'all', label: `Todos (${monthEntries.length})` },
                { id: 'pending', label: `Pendientes (${pendingTotalCount})` },
                { id: 'completed', label: `Completados (${completedTotalCount})` },
              ] as const
            ).map((seg) => {
              const active = filterMode === seg.id;
              return (
                <AppPressable
                  key={seg.id}
                  testID={`checklist-filter-${seg.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticService.selection();
                    setFilterMode(seg.id);
                  }}
                  style={{
                    // Equal thirds while every label fits on one line; a chip that would
                    // truncate (narrow phone, larger web type) wraps to its own row instead.
                    flex: 1,
                    minWidth:
                      estimateTextWidth(
                        seg.label,
                        typography.micro.fontSize,
                        typography.micro.letterSpacing
                      ) +
                      spacing.sm * 2,
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
                </AppPressable>
              );
            })}
          </View>
        </View>
        </GlassSurface>
      </ScrollDepthHero>

      {/* Edit Existing Item Sheet */}
      <RevealDown visible={Boolean(editingEntryId)}>
        <ChecklistEditEntryForm
          key={activeForm?.kind === 'edit' ? activeForm.key : 'edit-idle'}
          entry={activeEditingEntry}
          concept={activeEditingEntry ? conceptById.get(activeEditingEntry.conceptId) : undefined}
          debts={debts}
          savingsBuckets={savingsBuckets}
          financialAccounts={financialAccounts}
          onEditEntry={onEditEntry}
          onClose={handleCloseActiveForm}
        />
      </RevealDown>

      {/* Screen 04: Liquid Glass Add Movement Form (Clean & Direct, NO repeated items list) */}
      <RevealDown visible={isAddModalOpen}>
        <ChecklistAddMovementForm
          key={activeForm?.kind === 'add' ? activeForm.key : 'add-idle'}
          monthKey={monthKey}
          monthEntries={monthEntries}
          concepts={concepts}
          debts={debts}
          savingsBuckets={savingsBuckets}
          financialAccounts={financialAccounts}
          onAddOrCompleteMovement={onAddOrCompleteMovement}
          onCreateCustomMovement={onCreateCustomMovement}
          onSubmitted={handleCloseActiveForm}
        />
      </RevealDown>

      {/* Wide windows place income and expenses side by side; phones stack them. */}
      <ChecklistSectionsGrid
        filteredEntries={filteredEntries}
        conceptById={conceptById}
        debts={debts}
        savingsBuckets={savingsBuckets}
        financialAccounts={financialAccounts}
        budget={budget}
        incomesEditMode={incomesEditMode}
        incomesDeleteMode={incomesDeleteMode}
        expensesEditMode={expensesEditMode}
        expensesDeleteMode={expensesDeleteMode}
        onToggleIncomesEdit={handleToggleIncomesEdit}
        onToggleIncomesDelete={handleToggleIncomesDelete}
        onToggleExpensesEdit={handleToggleExpensesEdit}
        onToggleExpensesDelete={handleToggleExpensesDelete}
        onToggleEntry={onToggleEntry}
        onOpenEditModal={handleOpenEditModal}
        onDeleteEntry={handleDeleteEntry}
      />
    </View>
  );
}
