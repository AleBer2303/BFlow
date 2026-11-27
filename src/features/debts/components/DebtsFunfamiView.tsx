/**
 * src/features/debts/components/DebtsFunfamiView.tsx
 *
 * Implements Screen `07-debt-funfami` (Control de Deudas):
 * - Hero Card Total Deudas & Deuda FUNFAMI (memoized so form toggles never re-render it)
 * - Milestone payoff banner with dismiss capability and automatic disappearance in subsequent months
 * - Complete CRUD for debts: Create, Edit, and Delete debts with monthly/annual interest rate calculation
 * - Credit cards and debit accounts (ADR 0034): registered from the same form, listed under
 *   "Tarjetas y cuentas", and edited or deleted with the same Editar / Eliminar modes
 * - 100% pure integers, >= minTouchTarget touch targets, smooth native layout transitions
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  ActionModeToggleRow,
  animateNextLayout,
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  InlineItemActionPill,
  ProgressFill,
  ResponsiveColumns,
  RevealDown,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  TabLeaveResetter,
  useAmountPrivacy,
  useBFlowTheme,
  usePrimaryActionLook,
  type ListActionMode,
} from '../../../design-system';
import { confirmDestructive } from '../../../platform/dialogs/confirmDestructive';
import {
  formatMonthKeyLabelEs,
  type DebtSummaryResult,
  type FinancialAccount,
  type FinancialAccountsSummary,
  type FunfamiDebtSummary,
} from '../../../domain';
import type {
  FinancialAccountInput,
  FinancialAccountUpdates,
} from '../../budget/store/useBudgetStore';
import { DebtForm, type CreateDebtInput, type DebtFormDebt, type UpdateDebtInput } from './DebtForm';
import { FinancialAccountCard } from '../../accounts/components/FinancialAccountCard';

export type { CreateDebtInput, UpdateDebtInput } from './DebtForm';

type DebtActionMode = ListActionMode;

export interface DebtsFunfamiViewProps {
  debtSummary: FunfamiDebtSummary | DebtSummaryResult;
  onCreateDebt?: (input: CreateDebtInput) => void;
  onUpdateDebt?: (debtId: string, updates: UpdateDebtInput) => void;
  onDeleteDebt?: (debtId: string) => void;
  /** Credit cards and debit accounts (ADR 0034). */
  financialAccounts?: readonly FinancialAccount[];
  accountsSummary?: FinancialAccountsSummary;
  onCreateAccount?: (input: FinancialAccountInput) => void;
  onUpdateAccount?: (accountId: string, updates: FinancialAccountUpdates) => void;
  onDeleteAccount?: (accountId: string) => void;
}

const NO_ACCOUNTS: readonly FinancialAccount[] = [];

const DebtHeroCard = React.memo(function DebtHeroCard({
  debtSummary,
}: {
  debtSummary: FunfamiDebtSummary | DebtSummaryResult;
}): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius } = useBFlowTheme();

  const paydownRatio =
    debtSummary.openingTotalDebt > 0
      ? debtSummary.appliedInstallmentThisMonth / debtSummary.openingTotalDebt
      : 0;
  const paydownPercent = Math.round(paydownRatio * 1000) / 10;
  const estimatedRemainingMonths = debtSummary.projection.remainingMonths;
  const payoffLabel = debtSummary.projection.estimatedPayoffMonthKey
    ? formatMonthKeyLabelEs(debtSummary.projection.estimatedPayoffMonthKey)
    : 'Sin cuota activa';

  return (
    <ScrollDepthHero>
      <GlassSurface elevated testID="funfami-hero-card">
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
            <AppText variant="caption" color={colors.text.secondary}>
              Total Deudas
            </AppText>
            <StatusBadge
              label={
                debtSummary.appliedInstallmentThisMonth > 0
                  ? `Abonado este mes: ${formatAmount(debtSummary.appliedInstallmentThisMonth)}`
                  : 'Sin abonos este mes'
              }
              status={debtSummary.appliedInstallmentThisMonth > 0 ? 'completed' : 'pending'}
            />
          </View>

          <CurrencyText
            testID="funfami-hero-remaining"
            amount={debtSummary.totalRemainingDebt}
            variant="heroCurrency"
            tone="debt"
          />

          <AppText variant="caption" color={colors.text.secondary}>
            {`Apertura mes: ${formatAmount(debtSummary.openingTotalDebt)} · Abono a capital: - ${formatAmount(debtSummary.appliedInstallmentThisMonth)}`}
          </AppText>

          {/* Progress Bar */}
          <View
            style={{
              height: 10,
              borderRadius: radius.pill,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
            }}
          >
            <ProgressFill
              testID="debt-paydown-progress"
              fraction={Math.max(4, paydownPercent) / 100}
              color={colors.semantic.debt}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            <AppText variant="micro" color={colors.semantic.debt}>
              {`${paydownPercent}% reducido este mes`}
            </AppText>
            <AppText variant="micro" color={colors.text.secondary}>
              {`Proyección libertad financiera: ~${estimatedRemainingMonths} cuotas (${payoffLabel})`}
            </AppText>
          </View>
        </View>
      </GlassSurface>
    </ScrollDepthHero>
  );
});

interface DebtObligationCardProps {
  debt: DebtFormDebt;
  monthKey: string;
  debtActionMode: DebtActionMode;
  onEdit: (debt: DebtFormDebt) => void;
  onDelete: (debtId: string, name: string) => void;
}

const DebtObligationCard = React.memo(function DebtObligationCard({
  debt,
  monthKey,
  debtActionMode,
  onEdit,
  onDelete,
}: DebtObligationCardProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();

  return (
    <ScrollRevealSection>
      <GlassSurface testID={`debt-card-${debt.debtId}`}>
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                flexWrap: 'wrap',
              }}
            >
              <AppText variant="title2">{debt.name}</AppText>
              {debt.interestRateType === 'annual' &&
              debt.annualInterestRate !== undefined &&
              debt.annualInterestRate > 0 ? (
                <StatusBadge
                  label={`${debt.annualInterestRate}% anual (${debt.monthlyInterestRate ?? 0}% mes)`}
                  status="reserve"
                />
              ) : debt.monthlyInterestRate !== undefined && debt.monthlyInterestRate > 0 ? (
                <StatusBadge label={`${debt.monthlyInterestRate}% mes`} status="reserve" />
              ) : (
                <StatusBadge label="0% int." status="info" />
              )}
            </View>

            <StatusBadge
              label={
                debt.appliedPrincipalThisMonth > 0
                  ? `Abono - ${formatAmount(debt.appliedPrincipalThisMonth)}`
                  : 'Sin abono este mes'
              }
              status={debt.appliedPrincipalThisMonth > 0 ? 'completed' : 'info'}
            />
          </View>

          <CurrencyText
            testID={`debt-remaining-${debt.debtId}`}
            amount={debt.remainingBalance}
            variant="title1"
            tone="debt"
          />

          {/* Interest calculation feedback if rate > 0 */}
          {debt.monthlyInterestRate !== undefined && debt.monthlyInterestRate > 0 ? (
            <AppText variant="micro" color={colors.semantic.debt}>
              {`Interés generado este mes (${debt.monthlyInterestRate}%): + ${formatAmount(debt.accruedInterestThisMonth)}`}
            </AppText>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
              paddingTop: spacing.xxs,
            }}
          >
            <View>
              <AppText variant="caption" color={colors.text.secondary}>
                {`Saldo apertura (${monthKey}): ${formatAmount(debt.openingBalance)}`}
              </AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {`Acreedor: ${debt.lender}${debt.monthlyInstallment && debt.monthlyInstallment > 0 ? ` · Cuota: ${formatAmount(debt.monthlyInstallment)}/mes` : ''}`}
              </AppText>
            </View>

            {/* Contextual Edit or Delete Action Button on Existing Debt Card */}
            <InlineItemActionPill
              mode={debtActionMode}
              itemName={`deuda ${debt.name}`}
              editTestID={`debt-edit-${debt.debtId}`}
              deleteTestID={`debt-delete-${debt.debtId}`}
              onEdit={() => onEdit(debt)}
              onDelete={() => onDelete(debt.debtId, debt.name)}
            />
          </View>
        </View>
      </GlassSurface>
    </ScrollRevealSection>
  );
});

type ActiveDebtForm =
  | { kind: 'create'; key: number }
  | { kind: 'edit'; debt: DebtFormDebt; key: number }
  | { kind: 'edit-account'; account: FinancialAccount; key: number }
  | null;

interface FinancialAccountsSectionProps {
  summary: FinancialAccountsSummary;
  actionMode: DebtActionMode;
  onEdit: (accountId: string) => void;
  onDelete: (accountId: string, name: string) => void;
}

/** "Tarjetas y cuentas" below the debts: one card per account active in the month. */
const FinancialAccountsSection = React.memo(function FinancialAccountsSection({
  summary,
  actionMode,
  onEdit,
  onDelete,
}: FinancialAccountsSectionProps): React.JSX.Element | null {
  const { colors, spacing } = useBFlowTheme();
  const { formatAmountCompact } = useAmountPrivacy();
  if (!summary.hasAccounts) return null;

  const creditCount = summary.accounts.filter((a) => a.type === 'credit').length;
  const parts: string[] = [];
  if (creditCount > 0) {
    parts.push(
      `Pendiente en tarjetas: ${formatAmountCompact(summary.credit.closingBalance)}`
    );
  }
  if (summary.accounts.length > creditCount) {
    parts.push(
      `Saldo en cuentas: ${formatAmountCompact(summary.debit.closingBalance)}`
    );
  }

  return (
    <View style={{ gap: spacing.sm }} testID="financial-accounts-section">
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="headline">Tarjetas y cuentas</AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {parts.join(' · ')}
        </AppText>
      </View>
      <ResponsiveColumns testID="financial-account-cards-grid">
        {summary.accounts.map((account) => (
          <FinancialAccountCard
            key={account.accountId}
            summary={account}
            actionMode={actionMode}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ResponsiveColumns>
    </View>
  );
});

interface DebtObligationsGridProps {
  obligations: readonly DebtFormDebt[];
  monthKey: string;
  debtActionMode: DebtActionMode;
  onEdit: (debt: DebtFormDebt) => void;
  onDelete: (debtId: string, name: string) => void;
}

const DebtObligationsGrid = React.memo(function DebtObligationsGrid({
  obligations,
  monthKey,
  debtActionMode,
  onEdit,
  onDelete,
}: DebtObligationsGridProps): React.JSX.Element {
  return (
    <ResponsiveColumns testID="debt-cards-grid">
      {obligations.map((debt) => (
        <DebtObligationCard
          key={debt.debtId}
          debt={debt}
          monthKey={monthKey}
          debtActionMode={debtActionMode}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ResponsiveColumns>
  );
});

export function DebtsFunfamiView({
  debtSummary,
  onCreateDebt,
  onUpdateDebt,
  onDeleteDebt,
  financialAccounts = NO_ACCOUNTS,
  accountsSummary,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
}: DebtsFunfamiViewProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  const [dismissedBannerMonth, setDismissedBannerMonth] = useState<string | null>(null);

  // Single active form slot (R-17): guarantees at most one form is open and remounts clean.
  const [activeForm, setActiveForm] = useState<ActiveDebtForm>(null);
  const [debtActionMode, setDebtActionMode] = useState<DebtActionMode>(null);
  const formKeyRef = useRef(0);

  const isFormOpen = activeForm !== null;
  const editingDebt = activeForm?.kind === 'edit' ? activeForm.debt : null;
  const editingAccount = activeForm?.kind === 'edit-account' ? activeForm.account : null;

  const handleResetTransientState = useCallback(() => {
    setActiveForm(null);
    setDebtActionMode(null);
  }, []);

  useEffect(() => {
    handleResetTransientState();
  }, [debtSummary.monthKey, handleResetTransientState]);

  // Milestone banner: the first debt that had a balance > 0 this month and reached 0, until the
  // user dismisses it. In later months its openingBalance is 0, so it never appears again.
  const paidOffDebt = useMemo(
    () => debtSummary.debts.find((d) => d.openingBalance > 0 && d.remainingBalance === 0),
    [debtSummary.debts]
  );
  const isPaidOffBannerVisible = Boolean(
    paidOffDebt && dismissedBannerMonth !== debtSummary.monthKey
  );

  // When a debt is 100% paid off (remainingBalance === 0), remove it from active obligations
  const activeObligations = useMemo(
    () => debtSummary.debts.filter((d) => d.remainingBalance > 0),
    [debtSummary.debts]
  );

  const toggleDebtActionMode = useCallback((mode: Exclude<DebtActionMode, null>) => {
    hapticService.selection();
    animateNextLayout();
    setDebtActionMode((prev) => {
      const next = prev === mode ? null : mode;
      if (next) {
        setActiveForm(null);
      }
      return next;
    });
  }, []);
  const handleToggleEditMode = useCallback(
    () => toggleDebtActionMode('edit'),
    [toggleDebtActionMode]
  );
  const handleToggleDeleteMode = useCallback(
    () => toggleDebtActionMode('delete'),
    [toggleDebtActionMode]
  );

  const openForm = useCallback((debt: DebtFormDebt | null) => {
    hapticService.light();
    setDebtActionMode(null);
    formKeyRef.current += 1;
    setActiveForm(
      debt
        ? { kind: 'edit', debt, key: formKeyRef.current }
        : { kind: 'create', key: formKeyRef.current }
    );
  }, []);

  const handleCloseForm = useCallback(() => setActiveForm(null), []);

  const openAccountForm = useCallback(
    (accountId: string) => {
      const account = financialAccounts.find((a) => a.id === accountId);
      if (!account) return;
      hapticService.light();
      setDebtActionMode(null);
      formKeyRef.current += 1;
      setActiveForm({ kind: 'edit-account', account, key: formKeyRef.current });
    },
    [financialAccounts]
  );

  const handleDeleteAccountConfirm = useCallback(
    (accountId: string, name: string) => {
      confirmDestructive({
        title: 'Eliminar tarjeta o cuenta',
        message: `¿Deseas eliminar "${name}"? Los movimientos vinculados se conservan, pero dejarán de sumar a esta cuenta.`,
        confirmLabel: 'Eliminar',
        onConfirm: () => onDeleteAccount?.(accountId),
      });
    },
    [onDeleteAccount]
  );

  const handleDeleteDebtConfirm = useCallback(
    (debtId: string, name: string) => {
      confirmDestructive({
        title: 'Eliminar deuda',
        message: `¿Deseas eliminar permanentemente la obligación "${name}"?`,
        confirmLabel: 'Eliminar',
        onConfirm: () => onDeleteDebt?.(debtId),
      });
    },
    [onDeleteDebt]
  );

  return (
    <View style={{ gap: spacing.md }} testID="debts-funfami-view">
      {activeForm !== null || debtActionMode !== null ? (
        <TabLeaveResetter onLeave={handleResetTransientState} />
      ) : null}
      {/* Hero Card: Total Deudas */}
      <DebtHeroCard debtSummary={debtSummary} />

      {/* Action Bar: "+ Nueva Deuda" + Global Edit & Delete Mode Buttons */}
      <View style={{ gap: spacing.sm }}>
        <AppPressable
          testID="debts-add-new-debt-button"
          accessibilityRole="button"
          onPress={() => {
            if (isFormOpen) {
              hapticService.light();
              handleCloseForm();
            } else {
              openForm(null);
            }
          }}
          style={{
            minHeight: minTouchTarget,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            ...(isFormOpen ? null : primaryAction.container),
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText
            variant="headline"
            color={
              isFormOpen
                ? colors.text.primary
                : (primaryAction.labelColor ?? colors.text.primary)
            }
          >
            {isFormOpen ? 'Cerrar' : '+ Nueva Deuda'}
          </AppText>
        </AppPressable>

        {/* Global Edit & Delete Mode Buttons */}
        <ActionModeToggleRow
          activeMode={debtActionMode}
          editLabel="Editar"
          deleteLabel="Eliminar"
          editTestID="debt-action-edit-button"
          deleteTestID="debt-action-delete-button"
          editAccessibilityLabel="Editar obligaciones activas"
          deleteAccessibilityLabel="Eliminar obligaciones activas"
          activeEditAccessibilityLabel="Cancelar edición de obligaciones"
          activeDeleteAccessibilityLabel="Cancelar eliminación de obligaciones"
          onToggleEdit={handleToggleEditMode}
          onToggleDelete={handleToggleDeleteMode}
        />
      </View>

      {/* Form Drawer / Card for Creating or Editing a Debt */}
      <RevealDown visible={isFormOpen}>
        <DebtForm
          key={activeForm ? activeForm.key : 'debt-idle'}
          debt={editingDebt}
          account={editingAccount}
          onCreateDebt={onCreateDebt}
          onUpdateDebt={onUpdateDebt}
          onCreateAccount={onCreateAccount}
          onUpdateAccount={onUpdateAccount}
          onClose={handleCloseForm}
        />
      </RevealDown>

      {/* Banner when a debt is 100% paid off (Dismissible, only in month of completion) */}
      <RevealDown visible={isPaidOffBannerVisible}>
        <GlassSurface testID="moto-debt-completed-banner">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="headline" color={colors.semantic.completed}>
                {`¡Deuda "${paidOffDebt?.name ?? 'Obligación'}" liquidada al 100%!`}
              </AppText>
              <AppPressable
                testID="moto-debt-banner-dismiss-button"
                accessibilityRole="button"
                accessibilityLabel="Descartar aviso de deuda completada"
                onPress={() => setDismissedBannerMonth(debtSummary.monthKey)}
                style={{
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="micro" color={colors.text.secondary}>
                  Descartar
                </AppText>
              </AppPressable>
            </View>
            <AppText variant="caption" color={colors.text.secondary}>
              El saldo llegó a $ 0. A partir de este momento los abonos de cuota se aplicarán automáticamente a tus siguientes obligaciones para acelerar tu libertad financiera.
            </AppText>
          </View>
        </GlassSurface>
      </RevealDown>

      <DebtObligationsGrid
        obligations={activeObligations}
        monthKey={debtSummary.monthKey}
        debtActionMode={debtActionMode}
        onEdit={openForm}
        onDelete={handleDeleteDebtConfirm}
      />

      {accountsSummary ? (
        <FinancialAccountsSection
          summary={accountsSummary}
          actionMode={debtActionMode}
          onEdit={openAccountForm}
          onDelete={handleDeleteAccountConfirm}
        />
      ) : null}
    </View>
  );
}

export const DebtsWorkspaceView = DebtsFunfamiView;
