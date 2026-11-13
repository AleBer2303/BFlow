/**
 * src/features/debts/components/DebtsFunfamiView.tsx
 *
 * Implements Screen `07-debt-funfami` (Control de Deudas):
 * - Hero Card Total Deudas & Deuda FUNFAMI
 * - Editable monthly installment amount (`funfami-installment-amount-input` + `funfami-apply-installment-button`)
 * - Milestone payoff banner for CB300F - MOTO with dismiss capability and automatic disappearance in subsequent months
 * - Complete CRUD for debts: Create, Edit, and Delete debts with monthly interest rate calculation (e.g. 0.9%, 2.0%)
 * - 100% pure COP integers, >= 44pt touch targets, Apple Liquid Glass aesthetics
 */

import React, { useState } from 'react';
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
  PencilEditIcon,
  ProgressFill,
  ResponsiveColumns,
  RevealDown,
  StatusBadge,
  TrashBinIcon,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import { confirmDestructive } from '../../../platform/dialogs/confirmDestructive';
import {
  formatCurrency,
  formatMonthKeyLabelEs,
  type DebtInterestRateType,
  type DebtSummaryResult,
  type FunfamiDebtSummary,
  type MonthEntry,
} from '../../../domain';

type DebtActionMode = 'edit' | 'delete' | null;

export interface CreateDebtInput {
  name: string;
  lender: string;
  openingBalance: number;
  monthlyInterestRate?: number;
  annualInterestRate?: number;
  interestRateType?: DebtInterestRateType;
  monthlyInstallment?: number;
}

export interface UpdateDebtInput {
  name?: string;
  lender?: string;
  openingBalance?: number;
  monthlyInterestRate?: number;
  annualInterestRate?: number;
  interestRateType?: DebtInterestRateType;
  monthlyInstallment?: number;
}

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

export function DebtsFunfamiView({
  debtSummary,
  onCreateDebt,
  onUpdateDebt,
  onDeleteDebt,
}: DebtsFunfamiViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();

  const [dismissedBannerMonth, setDismissedBannerMonth] = useState<string | null>(null);

  // Form modal/drawer state for adding or editing a debt
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [debtActionMode, setDebtActionMode] = useState<DebtActionMode>(null);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formLender, setFormLender] = useState('');
  const [formOpeningBalance, setFormOpeningBalance] = useState('');
  const [formInterestRate, setFormInterestRate] = useState('');
  const [formInterestRateType, setFormInterestRateType] =
    useState<DebtInterestRateType>('monthly');
  const [formMonthlyInstallment, setFormMonthlyInstallment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const paydownRatio =
    debtSummary.openingTotalDebt > 0
      ? debtSummary.appliedInstallmentThisMonth / debtSummary.openingTotalDebt
      : 0;
  const paydownPercent = Math.round(paydownRatio * 1000) / 10;
  const estimatedRemainingMonths = debtSummary.projection.remainingMonths;
  const payoffLabel = debtSummary.projection.estimatedPayoffMonthKey
    ? formatMonthKeyLabelEs(debtSummary.projection.estimatedPayoffMonthKey)
    : 'Sin cuota activa';

  const paidOffDebt =
    debtSummary.debts.find(
      (d) => d.openingBalance > 0 && d.remainingBalance === 0
    ) ?? debtSummary.debts.find((d) => d.debtId === 'debt_cb300f_moto');

  // Milestone banner: Only show banner if a debt had a balance > 0 in this month AND reached 0,
  // and user has not dismissed it. In subsequent months (where openingBalance is 0), it never appears!
  const isMotoDebtPaidOff = Boolean(
    paidOffDebt &&
    paidOffDebt.openingBalance > 0 &&
    paidOffDebt.remainingBalance === 0 &&
    dismissedBannerMonth !== debtSummary.monthKey
  );

  // When a debt is 100% paid off (remainingBalance === 0), remove it from active obligations
  const activeObligations = debtSummary.debts.filter((d) => d.remainingBalance > 0);

  const toggleDebtActionMode = (mode: Exclude<DebtActionMode, null>) => {
    hapticService.selection();
    setDebtActionMode((prev) => {
      const next = prev === mode ? null : mode;
      if (next) {
        setIsFormOpen(false);
        setEditingDebtId(null);
        setFormError(null);
      }
      return next;
    });
  };

  const openCreateForm = () => {
    setDebtActionMode(null);
    setEditingDebtId(null);
    setFormName('');
    setFormLender('');
    setFormOpeningBalance('');
    setFormInterestRate('0');
    setFormInterestRateType('monthly');
    setFormMonthlyInstallment('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (debt: (typeof debtSummary.debts)[number]) => {
    const rateType: DebtInterestRateType = debt.interestRateType ?? 'monthly';
    setDebtActionMode(null);
    setEditingDebtId(debt.debtId);
    setFormName(debt.name);
    setFormLender(debt.lender);
    setFormOpeningBalance(String(debt.openingBalance));
    setFormInterestRateType(rateType);
    setFormInterestRate(
      rateType === 'annual' && debt.annualInterestRate !== undefined
        ? String(debt.annualInterestRate)
        : debt.monthlyInterestRate !== undefined
          ? String(debt.monthlyInterestRate)
          : '0'
    );
    setFormMonthlyInstallment(
      debt.monthlyInstallment !== undefined && debt.monthlyInstallment > 0
        ? String(debt.monthlyInstallment)
        : ''
    );
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveDebtForm = () => {
    if (!formName.trim()) {
      setFormError('Escribe el nombre de la deuda.');
      return;
    }
    if (!formLender.trim()) {
      setFormError('Escribe la entidad o persona acreedora.');
      return;
    }
    const cleanBalance = formOpeningBalance.replace(/[^0-9]/g, '');
    const parsedBalance = cleanBalance ? Number(cleanBalance) : 0;
    if (!Number.isSafeInteger(parsedBalance) || parsedBalance <= 0) {
      setFormError('Ingresa un saldo inicial válido.');
      return;
    }

    const cleanRate = formInterestRate.replace(',', '.').trim();
    const parsedRate = cleanRate ? parseFloat(cleanRate) : 0;
    const maxAllowedRate = formInterestRateType === 'annual' ? 200 : 100;
    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > maxAllowedRate) {
      setFormError(`La tasa de interés debe ser entre 0% y ${maxAllowedRate}%.`);
      return;
    }

    const cleanInstallment = formMonthlyInstallment.replace(/[^0-9]/g, '');
    const parsedInstallment = cleanInstallment ? Number(cleanInstallment) : 0;

    const monthlyRate =
      formInterestRateType === 'annual'
        ? Number((parsedRate / 12).toFixed(4))
        : parsedRate;
    const annualRate =
      formInterestRateType === 'annual'
        ? parsedRate
        : Number((parsedRate * 12).toFixed(4));

    setFormError(null);
    if (editingDebtId) {
      if (onUpdateDebt) {
        onUpdateDebt(editingDebtId, {
          name: formName.trim(),
          lender: formLender.trim(),
          openingBalance: parsedBalance,
          monthlyInterestRate: monthlyRate,
          annualInterestRate: annualRate,
          interestRateType: formInterestRateType,
          monthlyInstallment: parsedInstallment,
        });
      }
    } else {
      if (onCreateDebt) {
        onCreateDebt({
          name: formName.trim(),
          lender: formLender.trim(),
          openingBalance: parsedBalance,
          monthlyInterestRate: monthlyRate,
          annualInterestRate: annualRate,
          interestRateType: formInterestRateType,
          monthlyInstallment: parsedInstallment,
        });
      }
    }
    setIsFormOpen(false);
  };

  const handleDeleteDebtConfirm = (debtId: string, name: string) => {
    confirmDestructive({
      title: 'Eliminar deuda',
      message: `¿Deseas eliminar permanentemente la obligación "${name}"?`,
      confirmLabel: 'Eliminar',
      onConfirm: () => onDeleteDebt?.(debtId),
    });
  };

  return (
    <View style={{ gap: spacing.md }} testID="debts-funfami-view">
      {/* Hero Card: Total Deudas */}
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
                  ? `Abonado este mes: ${formatCurrency(debtSummary.appliedInstallmentThisMonth)}`
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
            {`Apertura mes: ${formatCurrency(debtSummary.openingTotalDebt)} · Abono a capital: - ${formatCurrency(debtSummary.appliedInstallmentThisMonth)}`}
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

      {/* Action Bar: "+ Nueva Deuda" + Global Edit & Delete Mode Buttons */}
      <View style={{ gap: spacing.sm }}>
        <AppPressable
          testID="debts-add-new-debt-button"
          accessibilityRole="button"
          onPress={() => {
            if (isFormOpen) {
              setIsFormOpen(false);
            } else {
              openCreateForm();
            }
          }}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="callout" color={colors.text.primary}>
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
                  minHeight: MIN_TOUCH_TARGET_PT,
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
        <GlassSurface elevated testID="debt-form-modal">
          <View style={{ gap: spacing.sm }}>
            <AppText variant="title2">
              {editingDebtId ? 'Editar Deuda' : 'Registrar Nueva Deuda'}
            </AppText>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nombre de la deuda
              </AppText>
              <AppTextInput
                testID="debt-form-name-input"
                value={formName}
                onChangeText={setFormName}
                placeholder="Ej. Tarjeta de crédito, Préstamo personal"
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Acreedor / Entidad
              </AppText>
              <AppTextInput
                testID="debt-form-lender-input"
                value={formLender}
                onChangeText={setFormLender}
                placeholder="Ej. Banco, Entidad financiera, Familiar"
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Saldo inicial
              </AppText>
              <AppTextInput
                testID="debt-form-amount-input"
                value={formOpeningBalance}
                onChangeText={setFormOpeningBalance}
                keyboardType="numeric"
                placeholder="Ej. 2500000"
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Tipo y porcentaje de interés:
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {(
                  [
                    { id: 'monthly', label: 'Interés Mensual (%)' },
                    { id: 'annual', label: 'Interés Anual (%)' },
                  ] as const
                ).map((opt) => {
                  const active = formInterestRateType === opt.id;
                  return (
                    <AppPressable
                      key={opt.id}
                      testID={`debt-form-rate-type-${opt.id}`}
                      accessibilityRole="button"
                      onPress={() => setFormInterestRateType(opt.id)}
                      style={{
                        flex: 1,
                        minHeight: 38,
                        borderRadius: radius.md,
                        backgroundColor: active
                          ? colors.semantic.debtSoft
                          : colors.glass.surfaceTint,
                        borderWidth: 1,
                        borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <AppText
                        variant="micro"
                        color={active ? colors.semantic.debt : colors.text.secondary}
                      >
                        {opt.label}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </View>
              <AppTextInput
                testID="debt-form-interest-rate-input"
                value={formInterestRate}
                onChangeText={setFormInterestRate}
                keyboardType="decimal-pad"
                placeholder={
                  formInterestRateType === 'annual'
                    ? 'Ej. 12.0 o 24.0 anual (0 si no cobra interés)'
                    : 'Ej. 0.9 o 2.0 mensual (0 si no cobra interés)'
                }
              />
              <AppText variant="micro" color={colors.text.muted}>
                Se conserva mes a mes y entre sesiones a menos que lo edites directamente.
              </AppText>
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Cuota mensual pactada que aportas a esta deuda (opcional)
              </AppText>
              <AppTextInput
                testID="debt-form-installment-input"
                value={formMonthlyInstallment}
                onChangeText={setFormMonthlyInstallment}
                keyboardType="numeric"
                placeholder="Ej. 500000"
              />
            </View>

            <FormMessage message={formError} />

            <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end', paddingTop: spacing.xs }}>
              <AppPressable
                testID="debt-form-submit-button"
                accessibilityRole="button"
                onPress={handleSaveDebtForm}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  ...primaryAction.container,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.income}>
                  Guardar Deuda
                </AppText>
              </AppPressable>
            </View>
          </View>
        </GlassSurface>
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
                  minHeight: MIN_TOUCH_TARGET_PT,
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
          <GlassSurface key={debt.debtId} testID={`debt-card-${debt.debtId}`}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <AppText variant="title2">{debt.name}</AppText>
                  {debt.interestRateType === 'annual' &&
                    debt.annualInterestRate !== undefined &&
                    debt.annualInterestRate > 0 ? (
                    <StatusBadge
                      label={`${debt.annualInterestRate}% anual (${debt.monthlyInterestRate ?? 0}% mes)`}
                      status="reserve"
                    />
                  ) : debt.monthlyInterestRate !== undefined && debt.monthlyInterestRate > 0 ? (
                    <StatusBadge
                      label={`${debt.monthlyInterestRate}% mes`}
                      status="reserve"
                    />
                  ) : (
                    <StatusBadge label="0% int." status="info" />
                  )}
                </View>

                <StatusBadge
                  label={
                    debt.appliedPrincipalThisMonth > 0
                      ? `Abono - ${formatCurrency(debt.appliedPrincipalThisMonth)}`
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
                  {`Interés generado este mes (${debt.monthlyInterestRate}%): + ${formatCurrency(debt.accruedInterestThisMonth)}`}
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
                    {`Saldo apertura (${debtSummary.monthKey}): ${formatCurrency(debt.openingBalance)}`}
                  </AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {`Acreedor: ${debt.lender}${debt.monthlyInstallment && debt.monthlyInstallment > 0 ? ` · Cuota: ${formatCurrency(debt.monthlyInstallment)}/mes` : ''}`}
                  </AppText>
                </View>

                {/* Contextual Edit or Delete Action Button on Existing Debt Card */}
                {debtActionMode === 'edit' ? (
                  <AppPressable
                    testID={`debt-edit-${debt.debtId}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar deuda ${debt.name}`}
                    onPress={() => openEditForm(debt)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
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
                    onPress={() => handleDeleteDebtConfirm(debt.debtId, debt.name)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
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
        ))}
      </ResponsiveColumns>
    </View>
  );
}

export const DebtsWorkspaceView = DebtsFunfamiView;
