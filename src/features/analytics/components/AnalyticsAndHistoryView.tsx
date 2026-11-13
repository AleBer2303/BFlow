/**
 * src/features/analytics/components/AnalyticsAndHistoryView.tsx
 *
 * Implements Screens `12-month-close` & `06-month-history`:
 * - Minimalist, polished Apple Liquid Glass design for month close & rollover.
 * - Clear, friendly financial summary (Flujo Neto, Deudas, Ahorros y Reservas).
 * - Checklist completion health indicator.
 * - History section with dedicated [Editar] and [Eliminar] action buttons directly
 *   under "Historial de Meses", followed by the complete history list.
 * - Tapping [Editar] or [Eliminar] reveals the direct action in the existing list.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  hapticService,
  MIN_TOUCH_TARGET_PT,
  PencilEditIcon,
  ResponsiveColumns,
  StatusBadge,
  TrashBinIcon,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  formatCurrency,
  formatMonthKeyLabelEs,
  type ChecklistProgress,
  type Concept,
  type DebtSummaryResult,
  type FunfamiDebtSummary,
  type MonthEntry,
  type MonthSnapshot,
  type MonthlyBudgetSummary,
  type MonthlySavingsSummary,
} from '../../../domain';

export type HistoryActionMode = 'edit' | 'delete' | null;

export interface AnalyticsAndHistoryViewProps {
  activeMonthKey: string;
  availableMonths: readonly string[];
  concepts?: readonly Concept[];
  entries?: readonly MonthEntry[];
  budget?: MonthlyBudgetSummary;
  checklist: ChecklistProgress;
  debtSummary: DebtSummaryResult | FunfamiDebtSummary;
  savingsSummary: MonthlySavingsSummary;
  closedSnapshots: Readonly<Record<string, MonthSnapshot>>;
  onSelectMonth: (monthKey: string) => void;
  onCloseCurrentMonth: () => void;
  onReopenClosedMonth?: (monthKey: string) => void;
  onDeleteOrRevertMonth?: (monthKey: string) => void;
  onResetOctoberSeed?: () => void;
}

interface HistoryMonthRowItemProps {
  mk: string;
  isSelected: boolean;
  isClosed: boolean;
  canDelete: boolean;
  actionMode: HistoryActionMode;
  colors: ReturnType<typeof useBFlowTheme>['colors'];
  spacing: ReturnType<typeof useBFlowTheme>['spacing'];
  radius: ReturnType<typeof useBFlowTheme>['radius'];
  onSelectMonth: (mk: string) => void;
  onReopenClosedMonth?: (mk: string) => void;
  onDeleteOrRevertMonth?: (mk: string) => void;
}

const HistoryMonthRowItem = React.memo(function HistoryMonthRowItem({
  mk,
  isSelected,
  isClosed,
  canDelete,
  actionMode,
  colors,
  spacing,
  radius,
  onSelectMonth,
  onReopenClosedMonth,
  onDeleteOrRevertMonth,
}: HistoryMonthRowItemProps) {
  // Show edit option ONLY if explicitly in edit mode (never simply because month is selected)
  const showEditAction = actionMode === 'edit' && isClosed && Boolean(onReopenClosedMonth);

  // Show delete option ONLY if explicitly in delete mode (never simply because month is selected)
  const showDeleteAction = actionMode === 'delete' && canDelete && Boolean(onDeleteOrRevertMonth);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: isSelected
          ? colors.glass.surfaceElevatedTint
          : colors.glass.surfaceTint,
        borderWidth: 1,
        borderColor: isSelected
          ? colors.glass.specularBorder
          : colors.glass.subtleBorder,
      }}
    >
      <AppPressable
        testID={`history-month-pill-${mk}`}
        accessibilityRole="button"
        accessibilityLabel={`${formatMonthKeyLabelEs(mk)}, ${isClosed ? 'Mes Cerrado' : 'Mes Abierto'}${isSelected ? ', Seleccionado' : ''}`}
        onPressIn={() => hapticService.light()}
        onPress={() => onSelectMonth(mk)}
        style={{
          flex: 1,
          minHeight: MIN_TOUCH_TARGET_PT,
          justifyContent: 'center',
          gap: spacing.xxs,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: isClosed
                ? colors.text.muted
                : colors.semantic.completed,
            }}
          />
          <AppText
            variant="headline"
            color={isSelected ? colors.text.primary : colors.text.secondary}
          >
            {formatMonthKeyLabelEs(mk)}
          </AppText>
          {isSelected ? (
            <StatusBadge label="Activo" status="completed" />
          ) : null}
        </View>

        <AppText variant="micro" color={colors.text.muted}>
          {isClosed
            ? 'Mes Cerrado · Saldo congelado en snapshot'
            : isSelected
              ? 'Mes en curso · Toca para ver movimientos'
              : 'Mes Abierto · Toca para cambiar a este mes'}
        </AppText>
      </AppPressable>

      {/* Direct Action Options in the Existing List */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
        {showEditAction ? (
          <AppPressable
            testID={`reopen-month-${mk}`}
            accessibilityRole="button"
            accessibilityLabel={`Editar y reabrir mes cerrado ${formatMonthKeyLabelEs(mk)}`}
            onPress={() => onReopenClosedMonth?.(mk)}
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
              gap: spacing.xs,
              justifyContent: 'center',
            }}
          >
            <PencilEditIcon size={14} color={colors.semantic.income} />
            <AppText variant="caption" color={colors.semantic.income}>
              Editar
            </AppText>
          </AppPressable>
        ) : null}

        {showDeleteAction ? (
          <AppPressable
            testID={`delete-month-${mk}`}
            accessibilityRole="button"
            accessibilityLabel={`Eliminar mes ${formatMonthKeyLabelEs(mk)}`}
            onPress={() => onDeleteOrRevertMonth?.(mk)}
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
              gap: spacing.xs,
              justifyContent: 'center',
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
  );
});

export function AnalyticsAndHistoryView({
  activeMonthKey,
  availableMonths,
  concepts: _concepts,
  entries: _entries,
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
  const primaryAction = usePrimaryActionLook();
  const [historyActionMode, setHistoryActionMode] = useState<HistoryActionMode>(null);

  const isCurrentMonthClosed = Boolean(closedSnapshots[activeMonthKey]);
  const hasPendingChecklist = checklist.pendingCount > 0;

  const toggleEditMode = () => {
    hapticService.selection();
    setHistoryActionMode((prev) => (prev === 'edit' ? null : 'edit'));
  };

  const toggleDeleteMode = () => {
    hapticService.selection();
    setHistoryActionMode((prev) => (prev === 'delete' ? null : 'delete'));
  };

  return (
    <View style={{ gap: spacing.md }} testID="analytics-and-history-view">
      <ResponsiveColumns testID="analytics-panels">
        {/* 1. Main Month Close Card */}
        <GlassSurface elevated testID="month-close-and-history-card">
          <View style={{ gap: spacing.md }}>
            {/* Header with Title and Month Status Badge */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: spacing.xs,
              }}
            >
              <View style={{ gap: spacing.xxs }}>
                <AppText variant="title2">Cierre de Mes</AppText>
              </View>

              <StatusBadge
                label={
                  isCurrentMonthClosed
                    ? 'Mes Cerrado · Snapshot'
                    : 'Mes Abierto'
                }
                status={isCurrentMonthClosed ? 'completed' : 'pending'}
              />
            </View>

            {/* Checklist Health Indicator */}
            <View
              style={{
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: hasPendingChecklist
                  ? colors.semantic.pendingSoft
                  : colors.semantic.completedSoft,
                borderWidth: 1,
                borderColor: hasPendingChecklist
                  ? colors.semantic.pending
                  : colors.semantic.completed,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <AppText
                variant="caption"
                color={
                  hasPendingChecklist
                    ? colors.semantic.pending
                    : colors.semantic.completed
                }
              >
                {hasPendingChecklist
                  ? `Aviso: Tienes ${checklist.pendingCount} ${checklist.pendingCount === 1 ? 'movimiento pendiente' : 'movimientos pendientes'} por completar.`
                  : '✨ Todos los movimientos del checklist están completados y al día.'}
              </AppText>
            </View>

            {/* Bento Financial Tiles */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {/* Tile 1: Flujo Neto */}
              <View
                style={{
                  flex: 1,
                  minWidth: 140,
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
                  FLUJO NETO HOY
                </AppText>
                <CurrencyText
                  amount={budget?.netCashFlow ?? 0}
                  variant="headline"
                  tone={(budget?.netCashFlow ?? 0) >= 0 ? 'income' : 'expense'}
                />
                <AppText variant="micro" color={colors.text.muted}>
                  {`Proyectado: ${formatCurrency(budget?.projectedNetFlow ?? 0)}`}
                </AppText>
              </View>

              {/* Tile 2: Deudas Pendientes */}
              <View
                style={{
                  flex: 1,
                  minWidth: 140,
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
                  DEUDAS TOTALES
                </AppText>
                <CurrencyText
                  amount={debtSummary.totalRemainingDebt}
                  variant="headline"
                  tone="debt"
                />
                <AppText variant="micro" color={colors.text.muted}>
                  Saldo al corte del mes
                </AppText>
              </View>

              {/* Tile 3: Total Ahorros */}
              <View
                style={{
                  flex: 1,
                  minWidth: 140,
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
                  TOTAL AHORROS
                </AppText>
                <CurrencyText
                  amount={savingsSummary.totalCurrentSavings}
                  variant="headline"
                  tone="reserve"
                />
                <AppText variant="micro" color={colors.text.muted}>
                  {`${savingsSummary.moto.name || 'Reserva'}: ${formatCurrency(savingsSummary.moto.currentBalance)} · Ahorro: ${formatCurrency(savingsSummary.savings.currentBalance)}`}
                </AppText>
              </View>
            </View>

            {/* Primary Month Close CTA */}
            <AppPressable
              testID="confirm-month-close-button"
              accessibilityRole="button"
              accessibilityLabel={`Confirmar cierre de ${formatMonthKeyLabelEs(activeMonthKey)} y avanzar al siguiente mes`}
              onPress={onCloseCurrentMonth}
              style={{
                width: '100%',
                minHeight: MIN_TOUCH_TARGET_PT,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                ...primaryAction.container,
                justifyContent: 'center',
                alignItems: 'center',
                gap: spacing.xxs,
              }}
            >
              <AppText variant="headline" color={primaryAction.labelColor ?? colors.semantic.income}>
                {`Confirmar ${formatMonthKeyLabelEs(activeMonthKey)} → Siguiente Mes`}
              </AppText>
            </AppPressable>
          </View>
        </GlassSurface>

        {/* 2. Month History Card */}
        <GlassSurface elevated testID="history-months-section">
          <View style={{ gap: spacing.md }}>
            {/* Section Header */}
            <View style={{ gap: spacing.xxs }}>
              <AppText variant="title2">Historial de Meses</AppText>
            </View>

            {/* Action Buttons: Editar y Eliminar (Directly under Historial de Meses) */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <AppPressable
                testID="history-action-edit-button"
                accessibilityRole="button"
                accessibilityLabel={
                  historyActionMode === 'edit' ? 'Cancelar edición de meses' : 'Editar mes en historial'
                }
                onPress={toggleEditMode}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor:
                    historyActionMode === 'edit'
                      ? colors.glass.surfaceElevatedTint
                      : colors.glass.surfaceTint,
                  borderWidth: 1.5,
                  borderColor:
                    historyActionMode === 'edit'
                      ? colors.semantic.income
                      : colors.glass.subtleBorder,
                  flexDirection: 'row',
                  gap: spacing.xs,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PencilEditIcon
                  size={16}
                  color={
                    historyActionMode === 'edit'
                      ? colors.semantic.income
                      : colors.text.secondary
                  }
                />
                <AppText
                  variant="caption"
                  color={
                    historyActionMode === 'edit'
                      ? colors.semantic.income
                      : colors.text.secondary
                  }
                >
                  {historyActionMode === 'edit' ? 'Cancelar Edición' : 'Editar Mes'}
                </AppText>
              </AppPressable>

              <AppPressable
                testID="history-action-delete-button"
                accessibilityRole="button"
                accessibilityLabel={
                  historyActionMode === 'delete' ? 'Cancelar eliminación de meses' : 'Eliminar mes en historial'
                }
                onPress={toggleDeleteMode}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET_PT,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor:
                    historyActionMode === 'delete'
                      ? colors.semantic.expenseSoft
                      : colors.glass.surfaceTint,
                  borderWidth: 1.5,
                  borderColor:
                    historyActionMode === 'delete'
                      ? colors.semantic.expense
                      : colors.glass.subtleBorder,
                  flexDirection: 'row',
                  gap: spacing.xs,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrashBinIcon
                  size={16}
                  color={
                    historyActionMode === 'delete'
                      ? colors.semantic.expense
                      : colors.text.secondary
                  }
                />
                <AppText
                  variant="caption"
                  color={
                    historyActionMode === 'delete'
                      ? colors.semantic.expense
                      : colors.text.secondary
                  }
                >
                  {historyActionMode === 'delete' ? 'Cancelar Eliminación' : 'Eliminar Mes'}
                </AppText>
              </AppPressable>
            </View>

            {/* Complete History List (Directly under the two action buttons) */}
            <View style={{ gap: spacing.xs }} testID="history-months-list">
              {availableMonths.map((mk) => (
                <HistoryMonthRowItem
                  key={mk}
                  mk={mk}
                  isSelected={mk === activeMonthKey}
                  isClosed={Boolean(closedSnapshots[mk])}
                  canDelete={availableMonths.length > 1 || Boolean(closedSnapshots[mk])}
                  actionMode={historyActionMode}
                  colors={colors}
                  spacing={spacing}
                  radius={radius}
                  onSelectMonth={onSelectMonth}
                  onReopenClosedMonth={onReopenClosedMonth}
                  onDeleteOrRevertMonth={onDeleteOrRevertMonth}
                />
              ))}
            </View>
          </View>
        </GlassSurface>
      </ResponsiveColumns>
    </View>
  );
}
