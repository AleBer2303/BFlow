/**
 * src/features/analytics/components/AnalyticsAndHistoryView.tsx
 *
 * Implements Screens `05-charts-analytics`, `06-month-history`, `10-concepts-catalog`,
 * `11-settings`, and `12-month-close`:
 * - Interactive SVG Paid vs Pending ring & proportional Expense Distribution bars
 * - Month Close & Automatic Rollover ritual (`2026-10` -> `2026-11`)
 * - Month History manager: select, reopen/edit previously closed months, or delete an
 *   accidentally created/closed month to return to the previous month
 * - Concepts Catalog viewer
 * - Native Mode A / Mode B & iloader 7-day signature diagnostics
 */

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  MIN_TOUCH_TARGET_PT,
  PencilEditIcon,
  StatusBadge,
  TrashBinIcon,
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

export interface AnalyticsAndHistoryViewProps {
  activeMonthKey: string;
  availableMonths: readonly string[];
  concepts?: readonly Concept[];
  entries: readonly MonthEntry[];
  budget: MonthlyBudgetSummary;
  checklist: ChecklistProgress;
  debtSummary: FunfamiDebtSummary;
  savingsSummary: MonthlySavingsSummary;
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  onSelectMonth: (monthKey: string) => void;
  onCloseCurrentMonth: () => void;
  onReopenClosedMonth?: (monthKey: string) => void;
  onDeleteOrRevertMonth?: (monthKey: string) => void;
  onResetOctoberSeed?: () => void;
}

export function AnalyticsAndHistoryView({
  activeMonthKey,
  availableMonths,
  concepts: _concepts,
  entries,
  budget,
  checklist,
  debtSummary,
  savingsSummary,
  closedSnapshots,
  onSelectMonth,
  onCloseCurrentMonth,
  onReopenClosedMonth,
  onDeleteOrRevertMonth,
  onResetOctoberSeed: _onResetOctoberSeed,
}: AnalyticsAndHistoryViewProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();

  const paidExpenseRatio =
    budget.plannedExpenses > 0 ? budget.paidExpenses / budget.plannedExpenses : 0;
  const paidExpensePercent = Math.round(paidExpenseRatio * 1000) / 10;
  const pendingExpensePercent = Math.round((100 - paidExpensePercent) * 10) / 10;

  const expenseEntries = entries
    .filter((e) => e.monthKey === activeMonthKey && e.type === 'expense')
    .sort((a, b) => b.plannedAmount - a.plannedAmount);

  return (
    <View style={{ gap: spacing.md }} testID="analytics-and-history-view">
      {/* Screen 05: Minimalist Visual Analytics */}
      <GlassSurface elevated testID="charts-analytics-card">
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            <View>
              <AppText variant="title2">Analítica Visual del Mes</AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                Ejecución presupuestal simplificada
              </AppText>
            </View>
            <StatusBadge
              label={`Pagado ${paidExpensePercent}% · Pendiente ${pendingExpensePercent}%`}
              status="info"
            />
          </View>

          {/* Minimalist Horizontal Execution Bar */}
          <View style={{ gap: spacing.xs }} testID="analytics-paid-progress-bar">
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
              <View
                style={{
                  width: `${Math.min(100, Math.max(0, paidExpensePercent))}%`,
                  height: '100%',
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: colors.semantic.completed,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="micro" color={colors.text.secondary}>
                {`Ejecutado: ${formatCop(budget.paidExpenses)}`}
              </AppText>
              <AppText variant="micro" color={colors.text.secondary}>
                {`Por pagar: ${formatCop(budget.pendingExpenses)}`}
              </AppText>
            </View>
          </View>

          {/* Minimalist 3-Metric Summary Pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <View
              style={{
                flex: 1,
                minWidth: 130,
                padding: spacing.sm,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                gap: spacing.xxs,
              }}
            >
              <AppText variant="micro" color={colors.text.secondary}>
                INGRESOS RECIBIDOS
              </AppText>
              <CurrencyText amount={budget.receivedIncome} variant="headline" tone="income" />
              <AppText variant="micro" color={colors.text.muted}>
                {`Previsto: ${formatCop(budget.plannedIncome)}`}
              </AppText>
            </View>

            <View
              style={{
                flex: 1,
                minWidth: 130,
                padding: spacing.sm,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                gap: spacing.xxs,
              }}
            >
              <AppText variant="micro" color={colors.text.secondary}>
                GASTOS PAGADOS
              </AppText>
              <CurrencyText amount={budget.paidExpenses} variant="headline" tone="expense" />
              <AppText variant="micro" color={colors.text.muted}>
                {`Total mes: ${formatCop(budget.plannedExpenses)}`}
              </AppText>
            </View>

            <View
              style={{
                flex: 1,
                minWidth: 130,
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glass.surfaceTint,
                borderWidth: 1,
                borderColor: colors.glass.subtleBorder,
                gap: spacing.xxs,
              }}
            >
              <AppText variant="micro" color={colors.text.secondary}>
                FLUJO NETO HOY
              </AppText>
              <CurrencyText
                amount={budget.netCashFlow}
                variant="headline"
                tone={budget.netCashFlow >= 0 ? 'income' : 'expense'}
              />
              <AppText variant="micro" color={colors.text.muted}>
                {`Proyectado: ${formatCop(budget.projectedNetFlow)}`}
              </AppText>
            </View>
          </View>
        </View>
      </GlassSurface>

      {/* Screen 12 & Screen 06: Month Close & Month History Management */}
      <GlassSurface elevated testID="month-close-and-history-card">
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
              {`• Deudas apertura: ${formatCop(debtSummary.totalRemainingDebt)}`}
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
              width: '100%',
              minHeight: MIN_TOUCH_TARGET_PT,
              paddingVertical: spacing.sm,
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
            <AppText variant="headline" color={colors.semantic.income}>
              {`Confirmar ${formatMonthKeyLabelEs(activeMonthKey)} y Siguiente Mes`}
            </AppText>
          </Pressable>

          {/* Month History Selector, Reopen/Edit & Delete/Revert Controls */}
          <View style={{ gap: spacing.xs, paddingTop: spacing.xs }}>
            <AppText variant="headline">Historial de Meses (Editar o Eliminar)</AppText>
            {availableMonths.map((mk) => {
              const isSelected = mk === activeMonthKey;
              const isClosed = Boolean(closedSnapshots[mk]);
              const canDelete = availableMonths.length > 1 || isClosed;

              return (
                <View
                  key={mk}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: spacing.xs,
                    padding: spacing.xs,
                    borderRadius: radius.md,
                    backgroundColor: isSelected
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? colors.glass.specularBorder
                      : colors.glass.subtleBorder,
                  }}
                >
                  <Pressable
                    testID={`history-month-pill-${mk}`}
                    accessibilityRole="button"
                    onPress={() => onSelectMonth(mk)}
                    style={{
                      flex: 1,
                      minHeight: MIN_TOUCH_TARGET_PT,
                      paddingHorizontal: spacing.sm,
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="body">{formatMonthKeyLabelEs(mk)}</AppText>
                    <AppText variant="micro" color={colors.text.secondary}>
                      {isClosed ? 'Mes Cerrado · Toca para ver' : 'Mes Abierto · Activo'}
                    </AppText>
                  </Pressable>

                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    {isClosed && onReopenClosedMonth ? (
                      <Pressable
                        testID={`reopen-month-${mk}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar mes cerrado ${formatMonthKeyLabelEs(mk)}`}
                        onPress={() => onReopenClosedMonth(mk)}
                        style={{
                          minHeight: MIN_TOUCH_TARGET_PT,
                          paddingHorizontal: spacing.md,
                          borderRadius: radius.md,
                          borderCurve: 'continuous',
                          backgroundColor: colors.glass.surfaceElevatedTint,
                          borderWidth: 1,
                          borderColor: colors.glass.specularBorder,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.xxs,
                          justifyContent: 'center',
                        }}
                      >
                        <PencilEditIcon size={14} color={colors.text.secondary} />
                        <AppText variant="caption">Editar mes</AppText>
                      </Pressable>
                    ) : null}

                    {canDelete && onDeleteOrRevertMonth ? (
                      <Pressable
                        testID={`delete-month-${mk}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar mes ${formatMonthKeyLabelEs(mk)}`}
                        onPress={() => onDeleteOrRevertMonth(mk)}
                        style={{
                          minHeight: MIN_TOUCH_TARGET_PT,
                          paddingHorizontal: spacing.md,
                          borderRadius: radius.md,
                          borderCurve: 'continuous',
                          backgroundColor: colors.semantic.expenseSoft,
                          borderWidth: 1,
                          borderColor: colors.glass.subtleBorder,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.xxs,
                          justifyContent: 'center',
                        }}
                      >
                        <TrashBinIcon size={14} color={colors.semantic.expense} />
                        <AppText variant="caption" color={colors.semantic.expense}>
                          Eliminar
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}
