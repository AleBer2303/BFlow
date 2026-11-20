/**
 * src/features/debts/components/DebtsFunfamiView.tsx
 *
 * Implements Screen `07-debt-funfami` (Control de Deudas):
 * - Hero Card Total Deudas & Deuda FUNFAMI (memoized so form toggles never re-render it)
 * - Milestone payoff banner with dismiss capability and automatic disappearance in subsequent months
 * - Complete CRUD for debts: Create, Edit, and Delete debts with monthly/annual interest rate calculation
 * - 100% pure integers, >= minTouchTarget touch targets, smooth native layout transitions
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  animateNextLayout,
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  PencilEditIcon,
  ProgressFill,
  ResponsiveColumns,
  RevealDown,
  ScrollDepthHero,
  ScrollRevealSection,
  StatusBadge,
  TrashBinIcon,
  useAmountPrivacy,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import { confirmDestructive } from '../../../platform/dialogs/confirmDestructive';
import {
  formatMonthKeyLabelEs,
  type DebtSummaryResult,
  type FunfamiDebtSummary,
  type MonthEntry,
} from '../../../domain';
import { DebtForm, type CreateDebtInput, type DebtFormDebt, type UpdateDebtInput } from './DebtForm';

export type { CreateDebtInput, UpdateDebtInput } from './DebtForm';

type DebtActionMode = 'edit' | 'delete' | null;

export interface DebtsFunfamiViewProps {
  debtSummary: FunfamiDebtSummary | DebtSummaryResult;
  funfamiEntry?: MonthEntry;
  installmentEntry?: MonthEntry;
  onToggleFunfamiInstallment?: (entry: MonthEntry) => void;
  onToggleInstallment?: (entry: MonthEntry) => void;
  onUpdateFunfamiInstallmentAmount?: (newAmountCop: number) => void;
  onUpdateInstallmentAmount?: (newAmount: number) => void;
  onCreateDebt?: (input: CreateDebtInput) => void;
  onUpdateDebt?: (debtId: string, updates: UpdateDebtInput) => void;
  onDeleteDebt?: (debtId: string) => void;
}

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
            {debtActionMode === 'edit' ? (
              <AppPressable
                testID={`debt-edit-${debt.debtId}`}
                accessibilityRole="button"
                accessibilityLabel={`Editar deuda ${debt.name}`}
                onPress={() => onEdit(debt)}
                style={{
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.xs,
                }}
              >
                <PencilEditIcon size={14} color={colors.semantic.income} />
                <AppText variant="caption" color={colors.semantic.income}>
                  Editar
                </AppText>
              </AppPressable>
            ) : debtActionMode === 'delete' ? (
              <AppPressable
                testID={`debt-delete-${debt.debtId}`}
                accessibilityRole="button"
                accessibilityLabel={`Eliminar deuda ${debt.name}`}
                onPress={() => onDelete(debt.debtId, debt.name)}
                style={{
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: colors.semantic.expenseSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.expense,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.xs,
                }}
              >
                <TrashBinIcon size={14} color={colors.semantic.expense} />
                <AppText variant="caption" color={colors.semantic.expense}>
                  Eliminar
                </AppText>
              </AppPressable>
            ) : null}
          </View>
        </View>
      </GlassSurface>
    </ScrollRevealSection>
  );
});

export function DebtsFunfamiView({
  debtSummary,
  onCreateDebt,
  onUpdateDebt,
  onDeleteDebt,
}: DebtsFunfamiViewProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  const [dismissedBannerMonth, setDismissedBannerMonth] = useState<string | null>(null);

  // The form owns its field state (R-17); the view only knows whether it is open and for
  // which debt. A new key remounts it, so it loads that debt's values (or starts empty).
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [debtActionMode, setDebtActionMode] = useState<DebtActionMode>(null);
  const [editingDebt, setEditingDebt] = useState<DebtFormDebt | null>(null);

  const paidOffDebt = useMemo(
    () =>
      debtSummary.debts.find((d) => d.openingBalance > 0 && d.remainingBalance === 0) ??
      debtSummary.debts.find((d) => d.debtId === 'debt_cb300f_moto'),
    [debtSummary.debts]
  );

  // Milestone banner: Only show banner if a debt had a balance > 0 in this month AND reached 0,
  // and user has not dismissed it. In subsequent months (where openingBalance is 0), it never appears!
  const isMotoDebtPaidOff = Boolean(
    paidOffDebt &&
    paidOffDebt.openingBalance > 0 &&
    paidOffDebt.remainingBalance === 0 &&
    dismissedBannerMonth !== debtSummary.monthKey
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
        setIsFormOpen(false);
        setEditingDebt(null);
      }
      return next;
    });
  }, []);

  const openForm = useCallback((debt: DebtFormDebt | null) => {
    hapticService.light();
    setDebtActionMode(null);
    setEditingDebt(debt);
    setFormKey((key) => key + 1);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => setIsFormOpen(false), []);

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
              setIsFormOpen(false);
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
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          {(
            [
              {
                mode: 'edit' as const,
                testID: 'debt-action-edit-button',
                label: 'Editar',
                cancelLabel: 'Cancelar Edición',
                a11yLabel: 'Editar obligaciones activas',
                cancelA11yLabel: 'Cancelar edición de obligaciones',
                activeColor: colors.semantic.income,
                activeBg: colors.glass.surfaceElevatedTint,
                Icon: PencilEditIcon,
              },
              {
                mode: 'delete' as const,
                testID: 'debt-action-delete-button',
                label: 'Eliminar',
                cancelLabel: 'Cancelar Eliminación',
                a11yLabel: 'Eliminar obligaciones activas',
                cancelA11yLabel: 'Cancelar eliminación de obligaciones',
                activeColor: colors.semantic.expense,
                activeBg: colors.semantic.expenseSoft,
                Icon: TrashBinIcon,
              },
            ] as const
          ).map((btn) => {
            const isActive = debtActionMode === btn.mode;
            const fgColor = isActive ? btn.activeColor : colors.text.secondary;
            return (
              <AppPressable
                key={btn.mode}
                testID={btn.testID}
                accessibilityRole="button"
                accessibilityLabel={isActive ? btn.cancelA11yLabel : btn.a11yLabel}
                onPress={() => toggleDebtActionMode(btn.mode)}
                style={{
                  flex: 1,
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: isActive ? btn.activeBg : colors.glass.surfaceTint,
                  borderWidth: 1.5,
                  borderColor: isActive ? btn.activeColor : colors.glass.subtleBorder,
                  flexDirection: 'row',
                  gap: spacing.xs,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <btn.Icon size={16} color={fgColor} />
                <AppText variant="caption" color={fgColor}>
                  {isActive ? btn.cancelLabel : btn.label}
                </AppText>
              </AppPressable>
            );
          })}
        </View>
      </View>

      {/* Form Drawer / Card for Creating or Editing a Debt */}
      <RevealDown visible={isFormOpen}>
        <DebtForm
          key={formKey}
          debt={editingDebt}
          onCreateDebt={onCreateDebt}
          onUpdateDebt={onUpdateDebt}
          onClose={handleCloseForm}
        />
      </RevealDown>

      {/* Banner when a debt is 100% paid off (Dismissible, only in month of completion) */}
      <RevealDown visible={isMotoDebtPaidOff}>
        <GlassSurface testID="moto-debt-completed-banner">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="headline" color={colors.semantic.completed}>
                {`✨ ¡Deuda "${paidOffDebt?.name ?? 'Obligación'}" liquidada al 100%!`}
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

      <ResponsiveColumns testID="debt-cards-grid">
        {/* Individual Active Obligations Breakdown */}
        {activeObligations.map((debt) => (
          <DebtObligationCard
            key={debt.debtId}
            debt={debt}
            monthKey={debtSummary.monthKey}
            debtActionMode={debtActionMode}
            onEdit={openForm}
            onDelete={handleDeleteDebtConfirm}
          />
        ))}
      </ResponsiveColumns>
    </View>
  );
}

export const DebtsWorkspaceView = DebtsFunfamiView;
