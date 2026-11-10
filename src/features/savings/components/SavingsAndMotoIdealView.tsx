/**
 * src/features/savings/components/SavingsAndMotoIdealView.tsx
 *
 * Implements Screen `08-savings` (Fondos de Ahorro & Provisiones Programadas):
 * - Hero Card Total Ahorros Acumulados
 * - Standard buckets (Fondo Moto, Fondo Ahorros) + user-created custom savings funds
 * - Adjust opening/previous-month balances for all savings funds
 * - Full CRUD (Create, Edit, Update, Delete) for user-configurable Provisions & Target Goals
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  CurrencyText,
  GlassSurface,
  PencilEditIcon,
  ResponsiveColumns,
  RevealDown,
  StatusBadge,
  TrashBinIcon,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatCurrency,
  type IdealMotoPlan,
  type MonthlySavingsSummary,
  type MotoIdealComparisonSummary,
  type ProvisionPlan,
  type ProvisionPlanComparisonSummary,
} from '../../../domain';
import type { SaveProvisionItemInput } from '../../budget/store/useBudgetStore';

const MIN_TOUCH_TARGET_PT = 44;

export interface SavingsAndMotoIdealViewProps {
  savingsSummary: MonthlySavingsSummary;
  motoIdealSummary: MotoIdealComparisonSummary | ProvisionPlanComparisonSummary;
  provisionPlan?: IdealMotoPlan | ProvisionPlan;
  onUpdateOpeningBalance?: (
    bucketId: string,
    newBalanceCop: number,
    bucketName?: string
  ) => void;
  onCreateSavingsBucket?: (name: string, openingBalanceCop: number) => void;
  onDeleteSavingsBucket?: (bucketId: string) => void;
  onSaveProvisionItem?: (input: SaveProvisionItemInput) => void;
  onDeleteProvisionItem?: (itemId: string) => void;
}

export function SavingsAndMotoIdealView({
  savingsSummary,
  motoIdealSummary,
  provisionPlan,
  onUpdateOpeningBalance,
  onCreateSavingsBucket,
  onDeleteSavingsBucket,
  onSaveProvisionItem,
  onDeleteProvisionItem,
}: SavingsAndMotoIdealViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const [isEditingBalances, setIsEditingBalances] = useState(false);
  const [motoNameInput, setMotoNameInput] = useState(
    savingsSummary.moto.name || 'Fondo de Reserva'
  );
  const [motoBalanceInput, setMotoBalanceInput] = useState(
    String(savingsSummary.moto.openingBalance)
  );
  const [savingsNameInput, setSavingsNameInput] = useState(
    savingsSummary.savings.name || 'Fondo Ahorros'
  );
  const [savingsBalanceInput, setSavingsBalanceInput] = useState(
    String(savingsSummary.savings.openingBalance)
  );
  const [customNameInputs, setCustomNameInputs] = useState<Record<string, string>>({});
  const [customBalanceInputs, setCustomBalanceInputs] = useState<Record<string, string>>({});
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // New Custom Savings Bucket form state
  const [isAddingBucket, setIsAddingBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketBalance, setNewBucketBalance] = useState('');
  const [newBucketError, setNewBucketError] = useState<string | null>(null);

  // Provision / Target Goal CRUD form state
  const [isProvisionFormOpen, setIsProvisionFormOpen] = useState(false);
  const [editingProvisionId, setEditingProvisionId] = useState<string | null>(null);
  const [provisionName, setProvisionName] = useState('');
  const [provisionAmount, setProvisionAmount] = useState('');
  const [provisionMonths, setProvisionMonths] = useState('1');
  const [provisionKind, setProvisionKind] = useState<'recurring' | 'target_goal'>('recurring');
  const [provisionNotes, setProvisionNotes] = useState('');
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const customBuckets = savingsSummary.customBuckets ?? [];
  const hasMotoBucket = savingsSummary.hasMotoBucket !== false;
  const hasSavingsBucket = savingsSummary.hasSavingsBucket !== false;
  const activeBucketsCount =
    (hasMotoBucket ? 1 : 0) + (hasSavingsBucket ? 1 : 0) + customBuckets.length;

  const openEditFundsSheet = () => {
    setMotoNameInput(savingsSummary.moto.name || 'Fondo Moto');
    setMotoBalanceInput(String(savingsSummary.moto.openingBalance));
    setSavingsNameInput(savingsSummary.savings.name || 'Fondo Ahorros');
    setSavingsBalanceInput(String(savingsSummary.savings.openingBalance));
    const nextCustomNames: Record<string, string> = {};
    const nextCustomInputs: Record<string, string> = {};
    for (const cb of customBuckets) {
      nextCustomNames[cb.id] = cb.name;
      nextCustomInputs[cb.id] = String(cb.openingBalance);
    }
    setCustomNameInputs(nextCustomNames);
    setCustomBalanceInputs(nextCustomInputs);
    setBalanceError(null);
    setIsEditingBalances(true);
  };

  useEffect(() => {
    if (!isEditingBalances) {
      setMotoNameInput(savingsSummary.moto.name || 'Fondo Moto');
      setMotoBalanceInput(String(savingsSummary.moto.openingBalance));
      setSavingsNameInput(savingsSummary.savings.name || 'Fondo Ahorros');
      setSavingsBalanceInput(String(savingsSummary.savings.openingBalance));
    }
  }, [
    isEditingBalances,
    savingsSummary.moto.name,
    savingsSummary.moto.openingBalance,
    savingsSummary.savings.name,
    savingsSummary.savings.openingBalance,
  ]);

  const handleSaveBalances = () => {
    const motoDigits = motoBalanceInput.replace(/[^0-9]/g, '');
    const savingsDigits = savingsBalanceInput.replace(/[^0-9]/g, '');
    const motoNum = motoDigits ? Number(motoDigits) : 0;
    const savingsNum = savingsDigits ? Number(savingsDigits) : 0;

    if (hasMotoBucket && (!Number.isSafeInteger(motoNum) || motoNum < 0)) {
      setBalanceError('Ingresa un valor entero válido para el fondo principal.');
      return;
    }
    if (hasSavingsBucket && (!Number.isSafeInteger(savingsNum) || savingsNum < 0)) {
      setBalanceError('Ingresa un valor entero válido para el Fondo Ahorros.');
      return;
    }

    if (onUpdateOpeningBalance) {
      if (hasMotoBucket) {
        onUpdateOpeningBalance('moto', motoNum, motoNameInput.trim() || 'Fondo de Reserva');
      }
      if (hasSavingsBucket) {
        onUpdateOpeningBalance('savings', savingsNum, savingsNameInput.trim() || 'Fondo Ahorros');
      }
      for (const cb of customBuckets) {
        const raw = customBalanceInputs[cb.id] ?? String(cb.openingBalance);
        const updatedName = customNameInputs[cb.id]?.trim() || cb.name;
        const digits = raw.replace(/[^0-9]/g, '');
        const parsed = digits ? Number(digits) : 0;
        if (Number.isSafeInteger(parsed) && parsed >= 0) {
          onUpdateOpeningBalance(cb.id, parsed, updatedName);
        }
      }
    }
    setIsEditingBalances(false);
    setBalanceError(null);
  };

  const handleCreateBucket = () => {
    if (!newBucketName.trim()) {
      setNewBucketError('Escribe el nombre del nuevo fondo de ahorro.');
      return;
    }
    const digits = newBucketBalance.replace(/[^0-9]/g, '');
    const parsed = digits ? Number(digits) : 0;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      setNewBucketError('Ingresa un saldo inicial entero válido.');
      return;
    }
    if (onCreateSavingsBucket) {
      onCreateSavingsBucket(newBucketName.trim(), parsed);
    }
    setNewBucketName('');
    setNewBucketBalance('');
    setNewBucketError(null);
    setIsAddingBucket(false);
  };

  const handleOpenCreateProvision = () => {
    setEditingProvisionId(null);
    setProvisionName('');
    setProvisionAmount('');
    setProvisionMonths('1');
    setProvisionKind('recurring');
    setProvisionNotes('');
    setProvisionError(null);
    setIsProvisionFormOpen(true);
  };

  const handleOpenEditProvision = (item: {
    id: string;
    name: string;
    amount: number;
    periodMonths: number;
    kind: 'recurring' | 'target_goal';
    notes?: string;
  }) => {
    setEditingProvisionId(item.id);
    setProvisionName(item.name);
    setProvisionAmount(String(item.amount));
    setProvisionMonths(String(item.periodMonths));
    setProvisionKind(item.kind);
    setProvisionNotes(item.notes ?? '');
    setProvisionError(null);
    setIsProvisionFormOpen(true);
  };

  const handleSubmitProvision = () => {
    if (!provisionName.trim()) {
      setProvisionError('Escribe el nombre de la provisión o meta.');
      return;
    }
    const amountDigits = provisionAmount.replace(/[^0-9]/g, '');
    const parsedAmount = amountDigits ? Number(amountDigits) : 0;
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setProvisionError('Ingresa un monto entero válido mayor a 0.');
      return;
    }
    const monthsDigits = provisionMonths.replace(/[^0-9]/g, '');
    const parsedMonths = monthsDigits ? Number(monthsDigits) : 1;
    if (!Number.isSafeInteger(parsedMonths) || parsedMonths < 1) {
      setProvisionError('El periodo en meses debe ser un entero mayor o igual a 1.');
      return;
    }

    if (onSaveProvisionItem) {
      onSaveProvisionItem({
        ...(editingProvisionId ? { id: editingProvisionId } : {}),
        name: provisionName.trim(),
        amount: parsedAmount,
        periodMonths: parsedMonths,
        priority: '1. Alta',
        kind: provisionKind,
        ...(provisionNotes.trim() ? { notes: provisionNotes.trim() } : {}),
      });
    }
    setIsProvisionFormOpen(false);
    setEditingProvisionId(null);
    setProvisionError(null);
  };

  return (
    <View style={{ gap: spacing.md }} testID="savings-and-moto-ideal-view">
      {/* Wide windows: funds on the left, provisions on the right. Phones stack them. */}
      <ResponsiveColumns testID="savings-panels">
        <View style={{ gap: spacing.md }}>
          {/* Screen 08: Hero Card Total Ahorros */}
          <GlassSurface elevated testID="savings-hero-card">
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
                <AppText variant="caption" color={colors.text.secondary}>
                  Total Ahorros Acumulados
                </AppText>
                <StatusBadge
                  label={` Fondos activos (${activeBucketsCount})`}
                  status="savings"
                />
              </View>

              <CurrencyText
                testID="savings-hero-total"
                amount={savingsSummary.totalCurrentSavings}
                variant="heroCurrency"
                tone="reserve"
              />

              <AppText variant="caption" color={colors.text.secondary}>
                {`Total proyectado tras pagar pendientes: ${formatCurrency(savingsSummary.totalProjectedAfterPendingExpenses)}`}
              </AppText>
            </View>
          </GlassSurface>

          {/* Primary Bucket Cards: Fondo Moto & Fondo Ahorros (rendered only when present in the user's account) */}
          {hasMotoBucket || hasSavingsBucket ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {hasMotoBucket ? (
                <GlassSurface style={{ flex: 1, minWidth: 200 }} testID="bucket-moto-card">
                  <View style={{ gap: spacing.xs }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: spacing.xs,
                      }}
                    >
                      <AppText variant="headline" style={{ flex: 1 }}>
                        {savingsSummary.moto.name || 'Fondo de Reserva'}
                      </AppText>
                      {onDeleteSavingsBucket ? (
                        <AppPressable
                          testID="delete-savings-bucket-moto"
                          accessibilityRole="button"
                          accessibilityLabel="Eliminar Fondo de Reserva"
                          onPress={() => onDeleteSavingsBucket('moto')}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            minWidth: MIN_TOUCH_TARGET_PT,
                            borderRadius: radius.md,
                            borderCurve: 'continuous',
                            backgroundColor: colors.semantic.expenseSoft,
                            borderWidth: 1,
                            borderColor: colors.glass.subtleBorder,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <TrashBinIcon size={16} color={colors.semantic.expense} />
                        </AppPressable>
                      ) : null}
                    </View>
                    <CurrencyText
                      testID="bucket-moto-current"
                      amount={savingsSummary.moto.currentBalance}
                      variant="title2"
                      tone="reserve"
                    />
                    <AppText variant="micro" color={colors.text.secondary}>
                      {`Saldo mes anterior: ${formatCurrency(savingsSummary.moto.openingBalance)}`}
                    </AppText>
                    <AppText variant="micro" color={colors.semantic.income}>
                      {`+ Aportes pagados: ${formatCurrency(savingsSummary.moto.paidContributionsThisMonth)}`}
                    </AppText>
                  </View>
                </GlassSurface>
              ) : null}

              {hasSavingsBucket ? (
                <GlassSurface style={{ flex: 1, minWidth: 200 }} testID="bucket-savings-card">
                  <View style={{ gap: spacing.xs }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: spacing.xs,
                      }}
                    >
                      <AppText variant="headline" style={{ flex: 1 }}>
                        {savingsSummary.savings.name || 'Fondo Ahorros'}
                      </AppText>
                      {onDeleteSavingsBucket ? (
                        <AppPressable
                          testID="delete-savings-bucket-savings"
                          accessibilityRole="button"
                          accessibilityLabel="Eliminar Fondo Ahorros"
                          onPress={() => onDeleteSavingsBucket('savings')}
                          style={{
                            minHeight: MIN_TOUCH_TARGET_PT,
                            minWidth: MIN_TOUCH_TARGET_PT,
                            borderRadius: radius.md,
                            borderCurve: 'continuous',
                            backgroundColor: colors.semantic.expenseSoft,
                            borderWidth: 1,
                            borderColor: colors.glass.subtleBorder,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <TrashBinIcon size={16} color={colors.semantic.expense} />
                        </AppPressable>
                      ) : null}
                    </View>
                    <CurrencyText
                      testID="bucket-savings-current"
                      amount={savingsSummary.savings.currentBalance}
                      variant="title2"
                      tone="income"
                    />
                    <AppText variant="micro" color={colors.text.secondary}>
                      {`Saldo mes anterior: ${formatCurrency(savingsSummary.savings.openingBalance)} + Flujo Neto ${formatCurrency(savingsSummary.savings.netCashFlowContribution)}`}
                    </AppText>
                    <AppText variant="micro" color={colors.semantic.pending}>
                      {`Tras pendientes: ${formatCurrency(savingsSummary.savings.projectedAfterPendingExpenses)}`}
                    </AppText>
                  </View>
                </GlassSurface>
              ) : null}
            </View>
          ) : null}

          {/* Custom User-Created Savings Funds */}
          {customBuckets.map((cb) => (
            <GlassSurface key={cb.id} testID={`bucket-custom-card-${cb.id}`}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <AppText variant="headline">{cb.name}</AppText>
                  <CurrencyText amount={cb.currentBalance} variant="title2" tone="savings" />
                  <AppText variant="micro" color={colors.text.secondary}>
                    {`Saldo anterior: ${formatCurrency(cb.openingBalance)} · + Aportes pagados: ${formatCurrency(cb.paidContributionsThisMonth)}`}
                  </AppText>
                </View>
                {onDeleteSavingsBucket ? (
                  <AppPressable
                    testID={`delete-savings-bucket-${cb.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar fondo ${cb.name}`}
                    onPress={() => onDeleteSavingsBucket(cb.id)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
                      minWidth: MIN_TOUCH_TARGET_PT,
                      borderRadius: radius.md,
                      borderCurve: 'continuous',
                      backgroundColor: colors.semantic.expenseSoft,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <TrashBinIcon size={16} color={colors.semantic.expense} />
                  </AppPressable>
                ) : null}
              </View>
            </GlassSurface>
          ))}

          {activeBucketsCount === 0 ? (
            <GlassSurface testID="empty-savings-buckets-card">
              <AppText variant="caption" color={colors.text.secondary}>
                No tienes fondos de ahorro creados aún. Usa &quot;+ Nuevo Fondo&quot; para agregar tus
                propios fondos y vincularles movimientos.
              </AppText>
            </GlassSurface>
          ) : null}

          {/* Action Row: Adjust Opening Balances & Create New Savings Fund */}
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <AppPressable
              testID="open-edit-opening-balance-button"
              accessibilityRole="button"
              accessibilityLabel="Editar Fondos/Ahorros"
              onPress={() => {
                if (isEditingBalances) {
                  setIsEditingBalances(false);
                } else {
                  openEditFundsSheet();
                }
              }}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: isEditingBalances
                  ? colors.glass.surfaceElevatedTint
                  : colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: isEditingBalances
                  ? colors.glass.specularBorder
                  : colors.glass.subtleBorder,
                flexDirection: 'row',
                gap: spacing.xxs,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <PencilEditIcon
                size={14}
                color={isEditingBalances ? colors.text.primary : colors.text.secondary}
              />
              <AppText
                variant="caption"
                color={isEditingBalances ? colors.text.primary : colors.text.secondary}
              >
                {isEditingBalances ? 'Cancelar edición' : 'Editar Fondos/Ahorros'}
              </AppText>
            </AppPressable>

            <AppPressable
              testID="open-add-savings-bucket-button"
              accessibilityRole="button"
              accessibilityLabel="Nuevo fondo de ahorro"
              onPress={() => {
                setIsAddingBucket(!isAddingBucket);
                setNewBucketError(null);
              }}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceElevatedTint,
                borderWidth: 1,
                borderColor: colors.glass.specularBorder,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.text.primary}>
                {isAddingBucket ? 'Cerrar' : '+ Nuevo Fondo'}
              </AppText>
            </AppPressable>
          </View>

          {/* Add New Custom Savings Fund Sheet */}
          <RevealDown visible={isAddingBucket}>
            <GlassSurface elevated testID="add-savings-bucket-card">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="headline">Crear Nuevo Fondo de Ahorro</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  Podrás vincular cualquier gasto de tu Checklist a este fondo para que sume automáticamente al marcarlo como pagado.
                </AppText>

                <AppTextInput
                  testID="new-bucket-name-input"
                  value={newBucketName}
                  onChangeText={setNewBucketName}
                  placeholder="Nombre del fondo (ej. Fondo Viaje, Emergencias)"
                />

                <AppTextInput
                  testID="new-bucket-balance-input"
                  value={newBucketBalance}
                  onChangeText={setNewBucketBalance}
                  keyboardType="numeric"
                  placeholder="Saldo actual o del mes anterior (ej. 500000)"
                />

                {newBucketError ? (
                  <AppText variant="caption" color={colors.semantic.expense}>
                    {newBucketError}
                  </AppText>
                ) : null}

                <AppPressable
                  testID="submit-new-bucket-button"
                  accessibilityRole="button"
                  onPress={handleCreateBucket}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    borderRadius: radius.md,
                    borderCurve: 'continuous',
                    ...primaryAction.container,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="body" color={primaryAction.labelColor ?? colors.semantic.income}>
                    Guardar Fondo de Ahorro
                  </AppText>
                </AppPressable>
              </View>
            </GlassSurface>
          </RevealDown>

          {/* Edit Opening Balances & Fund Names Sheet */}
          {isEditingBalances ? (
            <GlassSurface elevated testID="edit-opening-balances-card">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="headline">Editar Fondos y Saldos del Mes Anterior</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  Edita el nombre o el saldo actual/del mes anterior con el que inicia cada fondo de
                  ahorro.
                </AppText>

                {hasMotoBucket ? (
                  <View style={{ gap: spacing.xs }}>
                    <AppText variant="caption">Nombre y saldo mes anterior Fondo de Reserva</AppText>
                    <AppTextInput
                      testID="moto-bucket-name-input"
                      value={motoNameInput}
                      onChangeText={setMotoNameInput}
                      placeholder="Nombre del fondo"
                    />
                    <AppTextInput
                      testID="moto-opening-balance-input"
                      value={motoBalanceInput}
                      onChangeText={setMotoBalanceInput}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                ) : null}

                {hasSavingsBucket ? (
                  <View style={{ gap: spacing.xs }}>
                    <AppText variant="caption">Nombre y saldo mes anterior Fondo Ahorros</AppText>
                    <AppTextInput
                      testID="savings-bucket-name-input"
                      value={savingsNameInput}
                      onChangeText={setSavingsNameInput}
                      placeholder="Nombre del fondo"
                    />
                    <AppTextInput
                      testID="savings-opening-balance-input"
                      value={savingsBalanceInput}
                      onChangeText={setSavingsBalanceInput}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                ) : null}

                {customBuckets.map((cb) => (
                  <View key={cb.id} style={{ gap: spacing.xs }}>
                    <AppText variant="caption">{`Nombre y saldo mes anterior ${cb.name}`}</AppText>
                    <AppTextInput
                      testID={`custom-bucket-name-input-${cb.id}`}
                      value={customNameInputs[cb.id] ?? cb.name}
                      onChangeText={(text) =>
                        setCustomNameInputs((prev) => ({ ...prev, [cb.id]: text }))
                      }
                      placeholder="Nombre del fondo"
                    />
                    <AppTextInput
                      testID={`custom-opening-balance-input-${cb.id}`}
                      value={customBalanceInputs[cb.id] ?? String(cb.openingBalance)}
                      onChangeText={(text) =>
                        setCustomBalanceInputs((prev) => ({ ...prev, [cb.id]: text }))
                      }
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                ))}

                {balanceError ? (
                  <AppText variant="caption" color={colors.semantic.expense}>
                    {balanceError}
                  </AppText>
                ) : null}

                <AppPressable
                  testID="save-opening-balances-button"
                  accessibilityRole="button"
                  accessibilityLabel="Guardar Saldos"
                  onPress={handleSaveBalances}
                  style={{
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
                  <AppText variant="body" color={colors.semantic.income}>
                    Guardar Saldos
                  </AppText>
                </AppPressable>
              </View>
            </GlassSurface>
          ) : null}

        </View>

        {/* Provisions & Target Goals Card (User-Configurable CRUD) */}
        <GlassSurface elevated testID="moto-ideal-card">
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
                <AppText variant="title2">Provisiones y Metas Programadas</AppText>
              </View>
              <StatusBadge
                label={`Cuota ideal: ${formatCurrency(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
                status="provisions"
              />
            </View>

            <AppText variant="caption" color={colors.text.secondary}>
              {`Total con metas: ${formatCurrency(motoIdealSummary.totalWithTargetGoalsCop)} · Aporte real este mes: ${formatCurrency(motoIdealSummary.actualMotoContributionCop)} (Brecha operativa: ${formatCurrency(motoIdealSummary.monthlyGapAgainstIdealCop)})`}
            </AppText>

            <AppPressable
              testID="open-add-provision-button"
              accessibilityRole="button"
              onPress={() => {
                if (isProvisionFormOpen) {
                  setIsProvisionFormOpen(false);
                } else {
                  handleOpenCreateProvision();
                }
              }}
              style={{
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceElevatedTint,
                borderWidth: 1,
                borderColor: colors.glass.specularBorder,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" color={colors.text.primary}>
                {isProvisionFormOpen ? 'Cerrar' : '+ Agregar Provisión o Meta'}
              </AppText>
            </AppPressable>

            <RevealDown visible={isProvisionFormOpen}>
              <View
                testID="provision-form-card"
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.glass.surfaceElevatedTint,
                  borderWidth: 1,
                  borderColor: colors.glass.specularBorder,
                  gap: spacing.xs,
                }}
              >
                <AppText variant="headline">
                  {editingProvisionId ? 'Editar Provisión o Meta' : 'Nueva Provisión o Meta'}
                </AppText>

                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  {(
                    [
                      { id: 'recurring', label: 'Provisión Recurrente' },
                      { id: 'target_goal', label: 'Meta Objetivo' },
                    ] as const
                  ).map((opt) => {
                    const active = provisionKind === opt.id;
                    return (
                      <AppPressable
                        key={opt.id}
                        testID={`provision-kind-${opt.id}`}
                        accessibilityRole="button"
                        onPress={() => setProvisionKind(opt.id)}
                        style={{
                          flex: 1,
                          minHeight: 38,
                          borderRadius: radius.md,
                          backgroundColor: active
                            ? colors.semantic.provisionsSoft
                            : colors.glass.surfaceTint,
                          borderWidth: 1,
                          borderColor: active ? colors.glass.specularBorder : colors.glass.subtleBorder,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <AppText
                          variant="micro"
                          color={active ? colors.semantic.provisions : colors.text.secondary}
                        >
                          {opt.label}
                        </AppText>
                      </AppPressable>
                    );
                  })}
                </View>

                <AppTextInput
                  testID="provision-name-input"
                  value={provisionName}
                  onChangeText={setProvisionName}
                  placeholder="Nombre (ej. Seguro, Mantenimiento, Póliza)"
                />

                <AppTextInput
                  testID="provision-amount-input"
                  value={provisionAmount}
                  onChangeText={setProvisionAmount}
                  keyboardType="numeric"
                  placeholder="Costo total del ciclo (ej. 690000)"
                />

                <AppTextInput
                  testID="provision-months-input"
                  value={provisionMonths}
                  onChangeText={setProvisionMonths}
                  keyboardType="numeric"
                  placeholder="Periodo en meses (ej. 1 mensual, 12 anual)"
                />

                <AppTextInput
                  testID="provision-notes-input"
                  value={provisionNotes}
                  onChangeText={setProvisionNotes}
                  placeholder="Nota o fecha objetivo opcional"
                />

                {provisionError ? (
                  <AppText variant="micro" color={colors.semantic.expense}>
                    {provisionError}
                  </AppText>
                ) : null}

                <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end' }}>
                  <AppPressable
                    testID="submit-provision-button"
                    accessibilityRole="button"
                    onPress={handleSubmitProvision}
                    style={{
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.md,
                      borderCurve: 'continuous',
                      ...primaryAction.container,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="caption" color={primaryAction.labelColor ?? colors.semantic.income}>
                      Guardar Provisión
                    </AppText>
                  </AppPressable>
                </View>
              </View>
            </RevealDown>

            {motoIdealSummary.recurringItems.length === 0 &&
            motoIdealSummary.targetGoals.length === 0 ? (
              <AppText variant="caption" color={colors.text.muted}>
                No tienes provisiones ni metas configuradas aún. Usa el botón superior para agregar las tuyas.
              </AppText>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              {motoIdealSummary.recurringItems.map((item) => {
                const rawPlanItem = provisionPlan?.items.find((p) => p.id === item.id);
                return (
                  <View
                    key={item.id}
                    testID={`moto-ideal-item-${item.id}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: spacing.sm,
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: colors.glass.surfaceTint,
                      borderWidth: 1,
                      borderColor: colors.glass.subtleBorder,
                    }}
                  >
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      <AppText variant="body">{item.displayName}</AppText>
                      <AppText variant="micro" color={colors.text.secondary}>
                        {item.periodMonths > 1
                          ? `Ciclo: ${formatCurrency(item.cycleCostCop)} / ${item.periodMonths} meses`
                          : item.actualBudgetedAmountCop !== undefined
                            ? `Vinculado en presupuesto · Real: ${formatCurrency(item.actualBudgetedAmountCop)}`
                            : 'Provisión mensual directa'}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <CurrencyText amount={item.excelMonthlyAmountCop} variant="body" tone="provisions" />
                    </View>
                    {onSaveProvisionItem || onDeleteProvisionItem ? (
                      <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
                        {onSaveProvisionItem ? (
                          <AppPressable
                            testID={`edit-provision-${item.id}`}
                            accessibilityRole="button"
                            onPress={() =>
                              handleOpenEditProvision({
                                id: item.id,
                                name: rawPlanItem?.displayName ?? item.displayName,
                                amount: rawPlanItem?.cycleCostCop ?? item.cycleCostCop,
                                periodMonths: item.periodMonths,
                                kind: 'recurring',
                                notes: rawPlanItem?.notes ?? item.notes,
                              })
                            }
                            style={{
                              minHeight: 36,
                              minWidth: 36,
                              borderRadius: radius.md,
                              borderCurve: 'continuous',
                              backgroundColor: colors.glass.surfaceElevatedTint,
                              borderWidth: 1,
                              borderColor: colors.glass.specularBorder,
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <PencilEditIcon size={14} color={colors.text.secondary} />
                          </AppPressable>
                        ) : null}
                        {onDeleteProvisionItem ? (
                          <AppPressable
                            testID={`delete-provision-${item.id}`}
                            accessibilityRole="button"
                            onPress={() => onDeleteProvisionItem(item.id)}
                            style={{
                              minHeight: 36,
                              minWidth: 36,
                              borderRadius: radius.md,
                              borderCurve: 'continuous',
                              backgroundColor: colors.semantic.expenseSoft,
                              borderWidth: 1,
                              borderColor: colors.glass.subtleBorder,
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <TrashBinIcon size={14} color={colors.semantic.expense} />
                          </AppPressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Target Goals */}
            {motoIdealSummary.targetGoals.map((goal) => {
              const rawPlanItem = provisionPlan?.items.find((p) => p.id === goal.id);
              return (
                <View
                  key={goal.id}
                  testID={`moto-target-goal-${goal.id}`}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.semantic.provisionsSoft,
                    borderWidth: 1,
                    borderColor: colors.glass.specularBorder,
                    gap: spacing.xs,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: spacing.xs,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <AppText variant="headline">{`🎯 ${goal.displayName}`}</AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <StatusBadge label={`Meta: ${goal.targetMonthKey}`} status="provisions" />
                      {onSaveProvisionItem ? (
                        <AppPressable
                          testID={`edit-provision-${goal.id}`}
                          accessibilityRole="button"
                          onPress={() =>
                            handleOpenEditProvision({
                              id: goal.id,
                              name: rawPlanItem?.displayName ?? goal.displayName,
                              amount: goal.targetAmountCop,
                              periodMonths: rawPlanItem?.periodMonths ?? 1,
                              kind: 'target_goal',
                              notes: rawPlanItem?.notes ?? goal.notes,
                            })
                          }
                          style={{
                            minHeight: 34,
                            minWidth: 34,
                            borderRadius: radius.md,
                            borderCurve: 'continuous',
                            backgroundColor: colors.glass.surfaceElevatedTint,
                            borderWidth: 1,
                            borderColor: colors.glass.specularBorder,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <PencilEditIcon size={14} color={colors.text.secondary} />
                        </AppPressable>
                      ) : null}
                      {onDeleteProvisionItem ? (
                        <AppPressable
                          testID={`delete-provision-${goal.id}`}
                          accessibilityRole="button"
                          onPress={() => onDeleteProvisionItem(goal.id)}
                          style={{
                            minHeight: 34,
                            minWidth: 34,
                            borderRadius: radius.md,
                            borderCurve: 'continuous',
                            backgroundColor: colors.semantic.expenseSoft,
                            borderWidth: 1,
                            borderColor: colors.glass.subtleBorder,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <TrashBinIcon size={14} color={colors.semantic.expense} />
                        </AppPressable>
                      ) : null}
                    </View>
                  </View>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {`Objetivo total: ${formatCurrency(goal.targetAmountCop)} · Cuota sugerida (${goal.monthsUntilTarget} meses): ${formatCurrency(goal.suggestedMonthlySavingCop)}/mes`}
                  </AppText>
                </View>
              );
            })}
          </View>
        </GlassSurface>
      </ResponsiveColumns>
    </View>
  );
}

export const SavingsAndProvisionsView = SavingsAndMotoIdealView;
