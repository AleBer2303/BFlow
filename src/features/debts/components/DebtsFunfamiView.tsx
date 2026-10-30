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

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../../../design-system';
import {
  formatCop,
  formatMonthKeyLabelEs,
  type FunfamiDebtSummary,
  type MonthEntry,
} from '../../../domain';

export interface CreateDebtInput {
  name: string;
  lender: string;
  openingBalance: number;
  monthlyInterestRate?: number;
}

export interface UpdateDebtInput {
  name?: string;
  lender?: string;
  openingBalance?: number;
  monthlyInterestRate?: number;
}

export interface DebtsFunfamiViewProps {
  debtSummary: FunfamiDebtSummary;
  funfamiEntry?: MonthEntry;
  onToggleFunfamiInstallment?: (entry: MonthEntry) => void;
  onUpdateFunfamiInstallmentAmount?: (newAmountCop: number) => void;
  onCreateDebt?: (input: CreateDebtInput) => void;
  onUpdateDebt?: (debtId: string, updates: UpdateDebtInput) => void;
  onDeleteDebt?: (debtId: string) => void;
}

export function DebtsFunfamiView({
  debtSummary,
  funfamiEntry,
  onToggleFunfamiInstallment,
  onUpdateFunfamiInstallmentAmount,
  onCreateDebt,
  onUpdateDebt,
  onDeleteDebt,
}: DebtsFunfamiViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  const installmentAmount =
    funfamiEntry?.actualAmount ||
    funfamiEntry?.plannedAmount ||
    debtSummary.appliedInstallmentThisMonth ||
    1_800_000;

  const [installmentInput, setInstallmentInput] = useState<string>(String(installmentAmount));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dismissedBannerMonth, setDismissedBannerMonth] = useState<string | null>(null);

  // Form modal/drawer state for adding or editing a debt
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formLender, setFormLender] = useState('');
  const [formOpeningBalance, setFormOpeningBalance] = useState('');
  const [formInterestRate, setFormInterestRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setInstallmentInput(String(installmentAmount));
  }, [installmentAmount]);

  const paydownRatio =
    debtSummary.openingTotalDebt > 0
      ? debtSummary.appliedInstallmentThisMonth / debtSummary.openingTotalDebt
      : 0;
  const paydownPercent = Math.round(paydownRatio * 1000) / 10;
  const estimatedRemainingMonths = debtSummary.projection.remainingMonths;
  const monthShortLabel =
    formatMonthKeyLabelEs(debtSummary.monthKey).split(' ')[0]?.slice(0, 3) ?? 'Mes';
  const payoffLabel = debtSummary.projection.estimatedPayoffMonthKey
    ? formatMonthKeyLabelEs(debtSummary.projection.estimatedPayoffMonthKey)
    : 'Sin cuota activa';

  const handleApplyInstallmentAmount = () => {
    const digitsOnly = installmentInput.replace(/[^0-9]/g, '');
    const parsed = digitsOnly ? Number(digitsOnly) : 0;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      setAmountError('Ingresa una cuota entera mayor a $ 0 en pesos colombianos.');
      return;
    }
    setAmountError(null);
    if (onUpdateFunfamiInstallmentAmount) {
      onUpdateFunfamiInstallmentAmount(parsed);
    }
  };

  const motoDebtItem = debtSummary.debts.find((d) => d.debtId === 'debt_cb300f_moto');

  // Requirement 1: Only show banner if CB300F - MOTO had a balance > 0 in this month AND reached 0,
  // and user has not dismissed it. In subsequent months (where openingBalance is 0), it never appears!
  const isMotoDebtPaidOff = Boolean(
    motoDebtItem &&
      motoDebtItem.openingBalance > 0 &&
      motoDebtItem.remainingBalance === 0 &&
      dismissedBannerMonth !== debtSummary.monthKey
  );

  // When CB300F - MOTO is 100% paid off (remainingBalance === 0), remove it from active obligations
  const activeObligations = debtSummary.debts.filter((d) => d.remainingBalance > 0);

  const openCreateForm = () => {
    setEditingDebtId(null);
    setFormName('');
    setFormLender('');
    setFormOpeningBalance('');
    setFormInterestRate('0');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (debt: (typeof debtSummary.debts)[number]) => {
    setEditingDebtId(debt.debtId);
    setFormName(debt.name);
    setFormLender(debt.lender);
    setFormOpeningBalance(String(debt.openingBalance));
    setFormInterestRate(
      debt.monthlyInterestRate !== undefined ? String(debt.monthlyInterestRate) : '0'
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
      setFormError('Ingresa un saldo inicial válido en pesos colombianos.');
      return;
    }

    const cleanRate = formInterestRate.replace(',', '.').trim();
    const parsedRate = cleanRate ? parseFloat(cleanRate) : 0;
    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      setFormError('La tasa de interés mensual debe ser entre 0% y 100%.');
      return;
    }

    setFormError(null);
    if (editingDebtId) {
      if (onUpdateDebt) {
        onUpdateDebt(editingDebtId, {
          name: formName.trim(),
          lender: formLender.trim(),
          openingBalance: parsedBalance,
          monthlyInterestRate: parsedRate,
        });
      }
    } else {
      if (onCreateDebt) {
        onCreateDebt({
          name: formName.trim(),
          lender: formLender.trim(),
          openingBalance: parsedBalance,
          monthlyInterestRate: parsedRate,
        });
      }
    }
    setIsFormOpen(false);
  };

  const handleDeleteDebtConfirm = (debtId: string, name: string) => {
    Alert.alert(
      'Eliminar deuda',
      `¿Deseas eliminar permanentemente la obligación "${name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            if (onDeleteDebt) {
              onDeleteDebt(debtId);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ gap: spacing.md }} testID="debts-funfami-view">
      {/* Hero Card: Total Deuda FUNFAMI */}
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
              Total Deuda FUNFAMI
            </AppText>
            <StatusBadge
              label={
                debtSummary.isInstallmentPaid
                  ? `Cuota ${monthShortLabel} Pagada (${formatCop(installmentAmount)})`
                  : `Cuota ${monthShortLabel} Pendiente`
              }
              status={debtSummary.isInstallmentPaid ? 'completed' : 'pending'}
            />
          </View>

          <CurrencyText
            testID="funfami-hero-remaining"
            amount={debtSummary.totalRemainingDebt}
            variant="heroCurrency"
            tone="debt"
          />

          <AppText variant="caption" color={colors.text.secondary}>
            {`Apertura mes: ${formatCop(debtSummary.openingTotalDebt)} · Abono a capital (100%): - ${formatCop(debtSummary.appliedInstallmentThisMonth)}`}
          </AppText>

          {/* Progress Bar */}
          <View
            style={{
              height: 10,
              borderRadius: radius.pill,
              backgroundColor: colors.glass.surfaceTint,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
            }}
          >
            <View
              style={{
                width: `${Math.min(100, Math.max(4, paydownPercent))}%`,
                height: '100%',
                backgroundColor: colors.semantic.debt,
              }}
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

          {/* Modify Monthly Installment Amount */}
          <View style={{ gap: spacing.xs, paddingTop: spacing.xxs }}>
            <AppText variant="micro" color={colors.text.secondary}>
              Modificar monto a pagar este mes (COP):
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
              <TextInput
                testID="funfami-installment-amount-input"
                value={installmentInput}
                onChangeText={setInstallmentInput}
                keyboardType="numeric"
                placeholder="Ej. 1800000"
                placeholderTextColor={colors.text.muted}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <Pressable
                testID="funfami-apply-installment-button"
                accessibilityRole="button"
                onPress={handleApplyInstallmentAmount}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption">Actualizar cuota</AppText>
              </Pressable>
            </View>
            {amountError ? (
              <AppText variant="micro" color={colors.semantic.expense}>
                {amountError}
              </AppText>
            ) : null}
          </View>

          {funfamiEntry && onToggleFunfamiInstallment ? (
            <Pressable
              testID="debts-view-toggle-installment"
              accessibilityRole="button"
              onPress={() => onToggleFunfamiInstallment(funfamiEntry)}
              style={{
                width: '100%',
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: debtSummary.isInstallmentPaid
                  ? colors.semantic.completedSoft
                  : colors.semantic.debtSoft,
                borderWidth: 1,
                borderColor: debtSummary.isInstallmentPaid
                  ? colors.semantic.completed
                  : colors.semantic.debt,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText
                variant="caption"
                color={
                  debtSummary.isInstallmentPaid
                    ? colors.semantic.completed
                    : colors.semantic.debt
                }
              >
                {debtSummary.isInstallmentPaid
                  ? `✓ Cuota FUNFAMI Pagada (${formatCop(installmentAmount)}) · Toca para marcar pendiente`
                  : `○ Marcar Cuota FUNFAMI (${formatCop(installmentAmount)}) como Pagada`}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>

      {/* Action Bar: "+ Nueva Deuda" */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <AppText variant="title2">Obligaciones Activas</AppText>
        <Pressable
          testID="debts-add-new-debt-button"
          accessibilityRole="button"
          onPress={openCreateForm}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radius.md,
            backgroundColor: colors.semantic.incomeSoft,
            borderWidth: 1,
            borderColor: colors.semantic.income,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption" color={colors.semantic.income}>
            + Nueva Deuda
          </AppText>
        </Pressable>
      </View>

      {/* Form Drawer / Card for Creating or Editing a Debt */}
      {isFormOpen ? (
        <GlassSurface elevated testID="debt-form-modal">
          <View style={{ gap: spacing.sm }}>
            <AppText variant="title2">
              {editingDebtId ? 'Editar Deuda' : 'Registrar Nueva Deuda'}
            </AppText>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Nombre de la deuda
              </AppText>
              <TextInput
                testID="debt-form-name-input"
                value={formName}
                onChangeText={setFormName}
                placeholder="Ej. Tarjeta Bancolombia, Libre Inversión"
                placeholderTextColor={colors.text.muted}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Acreedor / Entidad
              </AppText>
              <TextInput
                testID="debt-form-lender-input"
                value={formLender}
                onChangeText={setFormLender}
                placeholder="Ej. Bancolombia, Davivienda, Familiar"
                placeholderTextColor={colors.text.muted}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Saldo inicial (COP enteros)
              </AppText>
              <TextInput
                testID="debt-form-amount-input"
                value={formOpeningBalance}
                onChangeText={setFormOpeningBalance}
                keyboardType="numeric"
                placeholder="Ej. 2500000"
                placeholderTextColor={colors.text.muted}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Tasa de interés mensual (%):
              </AppText>
              <TextInput
                testID="debt-form-interest-rate-input"
                value={formInterestRate}
                onChangeText={setFormInterestRate}
                keyboardType="decimal-pad"
                placeholder="Ej. 0.9 o 2.0 (0 si no cobra interés)"
                placeholderTextColor={colors.text.muted}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  color: colors.text.primary,
                }}
              />
              <AppText variant="micro" color={colors.text.muted}>
                Ej. 0,9% o 2% mensual. Al pasar de mes los intereses se calculan y suman al saldo automáticamente.
              </AppText>
            </View>

            {formError ? (
              <AppText variant="micro" color={colors.semantic.expense}>
                {formError}
              </AppText>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end', paddingTop: spacing.xs }}>
              <Pressable
                testID="debt-form-cancel-button"
                accessibilityRole="button"
                onPress={() => setIsFormOpen(false)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.text.secondary}>
                  Cancelar
                </AppText>
              </Pressable>

              <Pressable
                testID="debt-form-submit-button"
                accessibilityRole="button"
                onPress={handleSaveDebtForm}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  backgroundColor: colors.semantic.incomeSoft,
                  borderWidth: 1,
                  borderColor: colors.semantic.income,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption" color={colors.semantic.income}>
                  Guardar Deuda
                </AppText>
              </Pressable>
            </View>
          </View>
        </GlassSurface>
      ) : null}

      {/* Banner when CB300F - MOTO is 100% paid off (Dismissible, only in month of completion) */}
      {isMotoDebtPaidOff ? (
        <GlassSurface testID="moto-debt-completed-banner">
          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="headline" color={colors.semantic.completed}>
                ✨ Deuda CB300F - MOTO completada y eliminada
              </AppText>
              <Pressable
                testID="moto-debt-banner-dismiss-button"
                accessibilityRole="button"
                accessibilityLabel="Descartar aviso de deuda completada"
                onPress={() => setDismissedBannerMonth(debtSummary.monthKey)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs,
                  borderRadius: radius.sm,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText variant="micro" color={colors.text.secondary}>
                  ✕ Descartar
                </AppText>
              </Pressable>
            </View>
            <AppText variant="caption" color={colors.text.secondary}>
              El saldo de la moto llegó a $ 0. A partir de este momento los pagos se descuentan automáticamente de la deuda ESP. IA.
            </AppText>
          </View>
        </GlassSurface>
      ) : null}

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <AppText variant="title2">{debt.name}</AppText>
                {debt.monthlyInterestRate !== undefined && debt.monthlyInterestRate > 0 ? (
                  <StatusBadge
                    label={`${debt.monthlyInterestRate}% mes`}
                    status="moto"
                  />
                ) : (
                  <StatusBadge label="0% int." status="info" />
                )}
              </View>

              <StatusBadge
                label={
                  debt.appliedPrincipalThisMonth > 0
                    ? `Abono - ${formatCop(debt.appliedPrincipalThisMonth)}`
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
                {`Interés generado este mes (${debt.monthlyInterestRate}%): + ${formatCop(debt.accruedInterestThisMonth)}`}
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
                  {`Saldo apertura (${debtSummary.monthKey}): ${formatCop(debt.openingBalance)}`}
                </AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  {`Acreedor: ${debt.lender}`}
                </AppText>
              </View>

              {/* Edit & Delete Action Buttons */}
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Pressable
                  testID={`debt-edit-${debt.debtId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar deuda ${debt.name}`}
                  onPress={() => openEditForm(debt)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radius.sm,
                    backgroundColor: colors.glass.surfaceElevatedTint,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="micro">✏️ Editar</AppText>
                </Pressable>

                <Pressable
                  testID={`debt-delete-${debt.debtId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar deuda ${debt.name}`}
                  onPress={() => handleDeleteDebtConfirm(debt.debtId, debt.name)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radius.sm,
                    backgroundColor: colors.semantic.expenseSoft,
                    borderWidth: 1,
                    borderColor: colors.semantic.expense,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="micro" color={colors.semantic.expense}>
                    🗑️
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </GlassSurface>
      ))}
    </View>
  );
}
