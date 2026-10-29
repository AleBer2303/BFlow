/**
 * src/features/analytics/components/AnalyticsAndHistoryView.tsx
 *
 * Implements Screens `05-charts-analytics`, `06-month-history`, `10-concepts-catalog`,
 * `11-settings`, and `12-month-close`:
 * - Interactive SVG Paid vs Pending ring & proportional Expense Distribution bars
 * - Month Close & Automatic Rollover ritual (`2026-10` -> `2026-11`)
 * - Month History selector (`Octubre 2026`, `Noviembre 2026`, etc.)
 * - Concepts Catalog viewer (14 concepts with recurrence and links)
 * - Native Mode A / Mode B & iloader 7-day signature diagnostics
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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
  type ChecklistProgress,
  type Concept,
  type FunfamiDebtSummary,
  type MonthEntry,
  type MonthSnapshot,
  type MonthlyBudgetSummary,
  type MonthlySavingsSummary,
} from '../../../domain';
import { resolveRuntimeCapabilities } from '../../../platform/mode/runtimeMode';

export interface AnalyticsAndHistoryViewProps {
  activeMonthKey: string;
  availableMonths: readonly string[];
  concepts: readonly Concept[];
  entries: readonly MonthEntry[];
  budget: MonthlyBudgetSummary;
  checklist: ChecklistProgress;
  debtSummary: FunfamiDebtSummary;
  savingsSummary: MonthlySavingsSummary;
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  onSelectMonth: (monthKey: string) => void;
  onCloseCurrentMonth: () => void;
  onResetOctoberSeed: () => void;
}

export function AnalyticsAndHistoryView({
  activeMonthKey,
  availableMonths,
  concepts,
  entries,
  budget,
  checklist,
  debtSummary,
  savingsSummary,
  closedSnapshots,
  onSelectMonth,
  onCloseCurrentMonth,
  onResetOctoberSeed,
}: AnalyticsAndHistoryViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  const runtime = resolveRuntimeCapabilities();

  const paidExpenseRatio =
    budget.plannedExpenses > 0 ? budget.paidExpenses / budget.plannedExpenses : 0;
  const paidExpensePercent = Math.round(paidExpenseRatio * 1000) / 10;
  const pendingExpensePercent = Math.round((100 - paidExpensePercent) * 10) / 10;

  const expenseEntries = entries
    .filter((e) => e.monthKey === activeMonthKey && e.type === 'expense')
    .sort((a, b) => b.plannedAmount - a.plannedAmount);

  const radiusCircle = 42;
  const circumference = 2 * Math.PI * radiusCircle;
  const strokeDashoffset = circumference * (1 - Math.min(1, Math.max(0, paidExpenseRatio)));

  return (
    <View style={{ gap: spacing.md }} testID="analytics-and-history-view">
      {/* Screen 05: Charts & Visual Analytics */}
      <GlassSurface elevated testID="charts-analytics-card">
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="title2">Analítica Visual del Mes</AppText>
            <StatusBadge
              label={`Pagado ${paidExpensePercent}% · Pendiente ${pendingExpensePercent}%`}
              status="info"
            />
          </View>

          {/* SVG Ring + Cash Flow Bars */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <View style={{ width: 104, height: 104, justifyContent: 'center', alignItems: 'center' }}>
              <Svg width={104} height={104} viewBox="0 0 104 104">
                <Circle
                  cx={52}
                  cy={52}
                  r={radiusCircle}
                  stroke={colors.glass.subtleBorder}
                  strokeWidth={10}
                  fill="none"
                />
                <Circle
                  cx={52}
                  cy={52}
                  r={radiusCircle}
                  stroke={colors.semantic.completed}
                  strokeWidth={10}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
            </View>

            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="caption" color={colors.semantic.income}>
                {`Ingresos Recibidos: ${formatCop(budget.receivedIncome)}`}
              </AppText>
              <AppText variant="caption" color={colors.semantic.expense}>
                {`Gastos Pagados: ${formatCop(budget.paidExpenses)} (${paidExpensePercent}%)`}
              </AppText>
              <AppText variant="caption" color={colors.semantic.pending}>
                {`Gastos Pendientes: ${formatCop(budget.pendingExpenses)} (${pendingExpensePercent}%)`}
              </AppText>
              <AppText variant="caption" color={colors.semantic.moto}>
                {`Flujo Neto Hoy: ${formatCop(budget.netCashFlow)}`}
              </AppText>
            </View>
          </View>

          {/* Expense Distribution by Concept */}
          <AppText variant="headline">Distribución de Gastos por Concepto</AppText>
          <View style={{ gap: spacing.xs }}>
            {expenseEntries.map((item) => {
              const share =
                budget.plannedExpenses > 0
                  ? Math.round((item.plannedAmount / budget.plannedExpenses) * 1000) / 10
                  : 0;
              return (
                <View key={item.id} style={{ gap: spacing.xxs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="caption">
                      {`${item.conceptName} (${share}%)`}
                    </AppText>
                    <CurrencyText amount={item.plannedAmount} variant="caption" tone="expense" />
                  </View>
                  <View
                    style={{
                      height: 6,
                      borderRadius: radius.pill,
                      backgroundColor: colors.glass.surfaceTint,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.min(100, Math.max(3, share))}%`,
                        height: '100%',
                        backgroundColor:
                          item.status === 'completed'
                            ? colors.semantic.completed
                            : colors.semantic.pending,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </GlassSurface>

      {/* Screen 12 & Screen 06: Month Close & Month History */}
      <GlassSurface elevated testID="month-close-and-history-card">
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="title2">Cierre de Mes e Historial</AppText>
            <StatusBadge
              label={
                closedSnapshots[activeMonthKey] ? 'Mes Cerrado (Snapshot)' : 'Mes Abierto'
              }
              status={closedSnapshots[activeMonthKey] ? 'completed' : 'pending'}
            />
          </View>

          {checklist.pendingCount > 0 ? (
            <AppText variant="caption" color={colors.semantic.pending}>
              {`Aviso: Tienes ${checklist.pendingCount} movimientos pendientes (${formatCop(budget.pendingExpenses)} en gastos y ${formatCop(budget.pendingIncome)} en ingresos).`}
            </AppText>
          ) : (
            <AppText variant="caption" color={colors.semantic.completed}>
              ✨ Todos los movimientos del checklist están completados.
            </AppText>
          )}

          <View
            style={{
              padding: spacing.sm,
              borderRadius: radius.md,
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
              gap: spacing.xxs,
            }}
          >
            <AppText variant="headline">Resumen de Arrastre Automático al Siguiente Mes:</AppText>
            <AppText variant="caption" color={colors.text.secondary}>
              {`• Deuda FUNFAMI apertura: ${formatCop(debtSummary.totalRemainingDebt)}`}
            </AppText>
            <AppText variant="caption" color={colors.text.secondary}>
              {`• Fondo Moto apertura: ${formatCop(savingsSummary.moto.currentBalance)}`}
            </AppText>
            <AppText variant="caption" color={colors.text.secondary}>
              {`• Fondo Ahorros apertura: ${formatCop(savingsSummary.savings.currentBalance)}`}
            </AppText>
            <AppText variant="caption" color={colors.text.secondary}>
              {`• Total Ahorros apertura: ${formatCop(savingsSummary.totalCurrentSavings)}`}
            </AppText>
          </View>

          <Pressable
            testID="confirm-month-close-button"
            accessibilityRole="button"
            onPress={onCloseCurrentMonth}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              borderRadius: radius.md,
              backgroundColor: colors.semantic.incomeSoft,
              borderWidth: 1,
              borderColor: colors.semantic.income,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AppText variant="headline" color={colors.semantic.income}>
              {`Confirmar Cierre de ${formatMonthKeyLabelEs(activeMonthKey)} y Abrir Siguiente Mes`}
            </AppText>
          </Pressable>

          {/* Month History Pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {availableMonths.map((mk) => {
              const isSelected = mk === activeMonthKey;
              return (
                <Pressable
                  key={mk}
                  testID={`history-month-pill-${mk}`}
                  accessibilityRole="button"
                  onPress={() => onSelectMonth(mk)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET_PT,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    backgroundColor: isSelected
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? colors.glass.specularBorder
                      : colors.glass.subtleBorder,
                    justifyContent: 'center',
                  }}
                >
                  <AppText variant="caption">{formatMonthKeyLabelEs(mk)}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </GlassSurface>

      {/* Screen 10: Catálogo de Conceptos */}
      <GlassSurface testID="concepts-catalog-card">
        <View style={{ gap: spacing.xs }}>
          <AppText variant="title2">{`Catálogo de Conceptos (${concepts.length})`}</AppText>
          {concepts.map((c) => (
            <View
              key={c.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: spacing.xs,
                borderBottomWidth: 1,
                borderBottomColor: colors.glass.subtleBorder,
              }}
            >
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <AppText variant="body">{c.name}</AppText>
                <AppText variant="micro" color={colors.text.secondary}>
                  {`${c.type === 'income' ? 'Ingreso' : 'Gasto'} ${c.group === 'fixed' ? 'Fijo' : 'Variable'} · ${c.recurrence.kind === 'monthly' ? 'Mensual' : `Meses [${c.recurrence.months.join(', ')}]`} · ${c.allowMultiplePerMonth ? 'Múltiple/mes' : 'Único/mes'}`}
                </AppText>
              </View>
              <CurrencyText
                amount={c.defaultAmount}
                variant="caption"
                tone={c.type === 'income' ? 'income' : 'expense'}
              />
            </View>
          ))}
        </View>
      </GlassSurface>

      {/* Screen 11: Ajustes y Diagnóstico Nativo */}
      <GlassSurface testID="settings-diagnostics-card">
        <View style={{ gap: spacing.xs }}>
          <AppText variant="title2">Ajustes y Diagnóstico Nativo (iOS 26 / iloader)</AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            {`Modo de Ejecución: ${runtime.label} · Zona Horaria: America/Bogota (UTC-05:00)`}
          </AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            Estado Firma 7 días (iloader): Activa · Máximo 2 App IDs (com.bflow.app + widgets)
          </AppText>
          <Pressable
            testID="reset-october-seed-button"
            accessibilityRole="button"
            onPress={onResetOctoberSeed}
            style={{
              minHeight: MIN_TOUCH_TARGET_PT,
              borderRadius: radius.md,
              backgroundColor: colors.glass.surfaceElevatedTint,
              borderWidth: 1,
              borderColor: colors.glass.specularBorder,
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: spacing.xs,
            }}
          >
            <AppText variant="caption">Restaurar Semilla Dorada Octubre 2026 (Idempotente)</AppText>
          </Pressable>
        </View>
      </GlassSurface>
    </View>
  );
}
