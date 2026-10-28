import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import octoberFixture from '../../fixtures/october-2026.json';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  StatusBadge,
  useBFlowTheme,
} from '../design-system';
import {
  calculateChecklistProgress,
  calculateFunfamiDebtSummary,
  calculateMonthlyBudgetSummary,
  calculateMonthlySavingsSummary,
  calculateMotoIdealSummary,
  Concept,
  Debt,
  formatCop,
  formatMonthKeyLabelEs,
  getAvailableConcepts,
  IdealMotoPlan,
  MonthEntry,
  registerMovement,
  SavingsBucket,
  uncompleteMovement,
} from '../domain';
import { resolveRuntimeCapabilities } from '../platform/mode/runtimeMode';

const INITIAL_CONCEPTS = octoberFixture.concepts as unknown as Concept[];
const INITIAL_ENTRIES = octoberFixture.monthEntries as unknown as MonthEntry[];
const INITIAL_DEBTS = octoberFixture.debts as unknown as Debt[];
const INITIAL_SAVINGS_BUCKETS = octoberFixture.savingsBuckets as unknown as SavingsBucket[];
const INITIAL_IDEAL_MOTO_PLAN = octoberFixture.idealMotoPlan as unknown as IdealMotoPlan;
const ACTIVE_MONTH_KEY = '2026-10';

export default function PhaseOneHomeScreen(): React.JSX.Element {
  const { colors, spacing, radius, mode, toggleTheme } = useBFlowTheme();
  const [entries, setEntries] = useState<MonthEntry[]>(INITIAL_ENTRIES);
  const [pulseCount, setPulseCount] = useState(0);
  const runtime = resolveRuntimeCapabilities();
  const activeMonthLabel = formatMonthKeyLabelEs(ACTIVE_MONTH_KEY);

  const budget = useMemo(
    () => calculateMonthlyBudgetSummary(entries, ACTIVE_MONTH_KEY),
    [entries]
  );
  const checklist = useMemo(
    () => calculateChecklistProgress(INITIAL_CONCEPTS, entries, ACTIVE_MONTH_KEY),
    [entries]
  );
  const debtSummary = useMemo(
    () => calculateFunfamiDebtSummary(INITIAL_DEBTS, entries, ACTIVE_MONTH_KEY),
    [entries]
  );
  const savingsSummary = useMemo(
    () =>
      calculateMonthlySavingsSummary(
        INITIAL_SAVINGS_BUCKETS,
        INITIAL_CONCEPTS,
        entries,
        budget,
        ACTIVE_MONTH_KEY
      ),
    [budget, entries]
  );
  const motoIdealSummary = useMemo(
    () =>
      calculateMotoIdealSummary(
        INITIAL_IDEAL_MOTO_PLAN,
        entries,
        savingsSummary.moto.paidContributionsThisMonth,
        ACTIVE_MONTH_KEY
      ),
    [entries, savingsSummary.moto.paidContributionsThisMonth]
  );
  const availableExpenseConcepts = useMemo(
    () => getAvailableConcepts(INITIAL_CONCEPTS, entries, ACTIVE_MONTH_KEY, 'expense'),
    [entries]
  );

  const trackableEntries = useMemo(
    () =>
      entries.filter((e) => {
        const c = INITIAL_CONCEPTS.find((concept) => concept.id === e.conceptId);
        return e.monthKey === ACTIVE_MONTH_KEY && !c?.allowMultiplePerMonth;
      }),
    [entries]
  );

  const triggerHaptic = async (type: 'success' | 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (type === 'success') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Ignore haptics errors on unsupported devices
    }
  };

  const handleToggleEntry = async (entry: MonthEntry) => {
    if (entry.status === 'completed') {
      setEntries((prev) => uncompleteMovement(prev, entry.id));
      await triggerHaptic('light');
    } else {
      setEntries((prev) =>
        registerMovement(prev, INITIAL_CONCEPTS, {
          monthKey: ACTIVE_MONTH_KEY,
          conceptId: entry.conceptId,
          actualAmount: entry.plannedAmount,
          completedAt: '2026-10-28',
        })
      );
      await triggerHaptic('success');
    }
  };

  const handleTestHaptic = async () => {
    setPulseCount((prev) => prev + 1);
    await triggerHaptic('success');
  };

  const cb300fDebt = debtSummary.debts.find((d) => d.debtId === 'debt_cb300f_moto');
  const espIaDebt = debtSummary.debts.find((d) => d.debtId === 'debt_esp_ia');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background.primary }}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xxxl,
        paddingBottom: spacing.xxl,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <StatusBadge testID="runtime-mode-badge" label={runtime.label} status="info" />
          <AppText variant="title1">{`BFlow · ${activeMonthLabel}`}</AppText>
        </View>

        <Pressable
          testID="theme-toggle-button"
          accessibilityRole="button"
          accessibilityLabel="Cambiar tema claro u oscuro"
          onPress={toggleTheme}
          style={{
            minHeight: MIN_TOUCH_TARGET_PT,
            minWidth: MIN_TOUCH_TARGET_PT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: colors.glass.surfaceElevatedTint,
            borderWidth: 1,
            borderColor: colors.glass.specularBorder,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AppText variant="caption">{mode === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</AppText>
        </Pressable>
      </View>

      <GlassSurface elevated testID="net-flow-hero-card">
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="caption" color={colors.text.secondary}>
              Flujo Neto (En caja hoy · B6)
            </AppText>
            <StatusBadge
              testID="checklist-progress-badge"
              label={
                checklist.isMonthComplete
                  ? '✨ Mes completo (12 de 12)'
                  : `Checklist ${checklist.completedCount} de ${checklist.totalTrackableCount}`
              }
              status={checklist.isMonthComplete ? 'completed' : 'pending'}
            />
          </View>
          <CurrencyText
            testID="golden-net-flow"
            amount={budget.netCashFlow}
            variant="heroCurrency"
            tone="income"
          />
          <AppText variant="caption" color={colors.text.secondary}>
            {`Flujo proyectado del mes: ${formatCop(budget.projectedNetFlow)}`}
          </AppText>
        </View>
      </GlassSurface>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <GlassSurface style={{ flex: 1 }} testID="income-summary-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Ingresos Recibidos (B2)
            </AppText>
            <CurrencyText amount={budget.receivedIncome} variant="title2" tone="income" />
            <AppText variant="micro" color={colors.text.muted}>
              {`Previstos: ${formatCop(budget.plannedIncome)}`}
            </AppText>
          </View>
        </GlassSurface>

        <GlassSurface style={{ flex: 1 }} testID="expense-summary-card">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Gastos Pagados (B4)
            </AppText>
            <CurrencyText amount={budget.paidExpenses} variant="title2" tone="expense" />
            <AppText variant="micro" color={colors.semantic.pending}>
              {`Pendientes (B5): ${formatCop(budget.pendingExpenses)}`}
            </AppText>
          </View>
        </GlassSurface>
      </View>

      <GlassSurface testID="debt-summary-card">
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline">Control Deuda FUNFAMI (H6)</AppText>
            <StatusBadge
              label={
                debtSummary.isInstallmentPaid
                  ? 'Cuota $ 1.800.000 Pagada'
                  : 'Cuota $ 1.800.000 Pendiente'
              }
              status={debtSummary.isInstallmentPaid ? 'debt' : 'pending'}
            />
          </View>
          <CurrencyText
            testID="total-debt-amount"
            amount={debtSummary.totalRemainingDebt}
            variant="title2"
            tone="debt"
          />
          <AppText variant="caption" color={colors.text.secondary}>
            {`CB300F - MOTO: ${formatCop(cb300fDebt?.remainingBalance ?? 0)} · ESP. IA: ${formatCop(espIaDebt?.remainingBalance ?? 0)}`}
          </AppText>
        </View>
      </GlassSurface>

      <GlassSurface testID="savings-summary-card">
        <View style={{ gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline">Control Ahorros y Moto (K6)</AppText>
            <StatusBadge
              label={`IDEAL Moto: ${formatCop(motoIdealSummary.excelRecurringMonthlyTotalCop)}/mes`}
              status="moto"
            />
          </View>
          <CurrencyText
            testID="total-savings-amount"
            amount={savingsSummary.totalCurrentSavings}
            variant="title2"
            tone="moto"
          />
          <AppText variant="caption" color={colors.text.secondary}>
            {`Moto Ahora: ${formatCop(savingsSummary.moto.currentBalance)} · Ahorros Ahora: ${formatCop(savingsSummary.savings.currentBalance)} (Tras pendientes: ${formatCop(savingsSummary.savings.projectedAfterPendingExpenses)})`}
          </AppText>
        </View>
      </GlassSurface>

      <GlassSurface testID="interactive-checklist-card">
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline">Checklist Mensual (Toca para marcar)</AppText>
            <AppText variant="micro" color={colors.text.muted}>
              {`Disponibles en Gasto: ${availableExpenseConcepts.length}`}
            </AppText>
          </View>

          {trackableEntries.map((entry) => {
            const isDone = entry.status === 'completed';
            return (
              <Pressable
                key={entry.id}
                testID={`checklist-item-${entry.conceptId}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isDone }}
                accessibilityLabel={`${entry.conceptName}, ${formatCop(entry.actualAmount)}`}
                onPress={() => handleToggleEntry(entry)}
                style={{
                  minHeight: MIN_TOUCH_TARGET_PT,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: isDone
                    ? colors.semantic.completedSoft
                    : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: isDone
                    ? colors.semantic.completed
                    : colors.glass.subtleBorder,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <AppText variant="body">{`${isDone ? '✓ ' : '○ '}${entry.conceptName}`}</AppText>
                  <AppText variant="micro" color={colors.text.secondary}>
                    {isDone
                      ? `${entry.type === 'income' ? 'Recibido' : 'Pagado'}${entry.completedAt ? ` · ${entry.completedAt}` : ''}`
                      : 'Pendiente · Toca para completar'}
                  </AppText>
                </View>
                <CurrencyText
                  amount={entry.actualAmount}
                  variant="body"
                  tone={entry.type === 'income' ? 'income' : 'expense'}
                />
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>

      <Pressable
        testID="haptic-verification-button"
        accessibilityRole="button"
        accessibilityLabel="Verificar respuesta táctil y tubería Fase 1"
        onPress={handleTestHaptic}
        style={{
          minHeight: MIN_TOUCH_TARGET_PT,
          borderRadius: radius.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.semantic.incomeSoft,
          borderWidth: 1,
          borderColor: colors.semantic.income,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText variant="headline" color={colors.semantic.income}>
          {pulseCount === 0
            ? 'Probar Haptics & Liquid Glass (Fase 1)'
            : `Tubería Verificada (${pulseCount} ${pulseCount === 1 ? 'toque' : 'toques'})`}
        </AppText>
      </Pressable>
    </ScrollView>
  );
}
