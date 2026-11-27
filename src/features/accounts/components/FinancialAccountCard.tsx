/**
 * src/features/accounts/components/FinancialAccountCard.tsx
 *
 * Card of a credit card or debit account (ADR 0034): Deudas shows the cards and checking
 * accounts, Ahorros the savings accounts. Credit: amount owed, credit line in use, next
 * statement and payment dates. Debit: balance. Both: what went in and out this month.
 * Amounts go through `useAmountPrivacy` (the eye hides them).
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  CurrencyText,
  GlassSurface,
  PencilEditIcon,
  ProgressFill,
  ScrollRevealSection,
  StatusBadge,
  TrashBinIcon,
  useAmountPrivacy,
  useBFlowTheme,
} from '../../../design-system';
import { isSavingsAccount, type FinancialAccountMonthSummary } from '../../../domain';

export type AccountCardActionMode = 'edit' | 'delete' | null;

export interface FinancialAccountCardProps {
  summary: FinancialAccountMonthSummary;
  actionMode: AccountCardActionMode;
  onEdit: (accountId: string) => void;
  onDelete: (accountId: string, name: string) => void;
}

const MONTH_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** "2026-11-15" → "15 nov". */
export function formatShortDayLabelEs(isoDate: string): string {
  const month = MONTH_SHORT_ES[Number(isoDate.slice(5, 7)) - 1] ?? '';
  return `${Number(isoDate.slice(8, 10))} ${month}`.trim();
}

export const FinancialAccountCard = React.memo(function FinancialAccountCard({
  summary,
  actionMode,
  onEdit,
  onDelete,
}: FinancialAccountCardProps): React.JSX.Element {
  const { formatAmount } = useAmountPrivacy();
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const isCredit = summary.type === 'credit';
  const toneColor = isCredit ? colors.semantic.savings : colors.semantic.provisions;
  const isSavings = isSavingsAccount(summary);
  const typeLabel = isCredit ? 'Crédito' : isSavings ? 'Cuenta de ahorros' : 'Débito · Corriente';
  const isOverdrawn = !isCredit && summary.closingBalance < 0;
  const hasBalanceInFavor = isCredit && summary.closingBalance < 0;
  const utilizationPercent = Math.round((summary.utilizationRatio ?? 0) * 1000) / 10;

  const dateParts: string[] = [];
  if (summary.nextStatementDate) {
    dateParts.push(`Corte: ${formatShortDayLabelEs(summary.nextStatementDate)}`);
  }
  if (summary.nextPaymentDueDate) {
    dateParts.push(`Pago: ${formatShortDayLabelEs(summary.nextPaymentDueDate)}`);
  }

  return (
    <ScrollRevealSection>
      <GlassSurface testID={`account-card-${summary.accountId}`}>
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
            <View style={{ flexShrink: 1, gap: spacing.xxs }}>
              <AppText variant="title2">{summary.name}</AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {summary.lastFourDigits
                  ? `${summary.institution} ·· ${summary.lastFourDigits}`
                  : summary.institution}
              </AppText>
            </View>
            <StatusBadge label={typeLabel} status={isCredit ? 'savings' : 'provisions'} />
          </View>

          <AppText variant="micro" color={colors.text.secondary}>
            {isCredit
              ? hasBalanceInFavor
                ? 'Saldo a favor'
                : 'Valor pendiente de pago'
              : isOverdrawn
                ? 'Saldo en sobregiro'
                : 'Saldo disponible'}
          </AppText>
          <CurrencyText
            testID={`account-balance-${summary.accountId}`}
            amount={hasBalanceInFavor ? -summary.closingBalance : summary.closingBalance}
            variant="title1"
            tone={isCredit ? 'debt' : isOverdrawn ? 'expense' : 'income'}
          />

          {isCredit && summary.creditLimit !== undefined ? (
            <View style={{ gap: spacing.xxs }}>
              <View
                style={{
                  height: 8,
                  borderRadius: radius.pill,
                  borderCurve: 'continuous',
                  backgroundColor: colors.glass.surfaceTint,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.glass.subtleBorder,
                }}
              >
                <ProgressFill
                  testID={`account-utilization-${summary.accountId}`}
                  fraction={summary.utilizationRatio ?? 0}
                  color={toneColor}
                />
              </View>
              <AppText variant="micro" color={colors.text.secondary}>
                {`Disponible ${formatAmount(summary.availableCredit ?? 0)} de ${formatAmount(summary.creditLimit)} · Uso ${utilizationPercent}%`}
              </AppText>
            </View>
          ) : null}

          {dateParts.length > 0 ? (
            <AppText variant="caption" color={toneColor}>
              {dateParts.join(' · ')}
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
            <View style={{ flexShrink: 1 }}>
              <AppText variant="caption" color={colors.text.secondary}>
                {isCredit
                  ? `Este mes: compras ${formatAmount(summary.spentThisMonth)} · pagos ${formatAmount(summary.paidThisMonth)}`
                  : isSavings
                    ? `Este mes: depósitos ${formatAmount(summary.paidThisMonth)} · retiros ${formatAmount(summary.spentThisMonth)}`
                    : `Este mes: salidas ${formatAmount(summary.spentThisMonth)} · entradas ${formatAmount(summary.paidThisMonth)}`}
              </AppText>
              {summary.monthlyInterestRate !== undefined ? (
                <AppText variant="micro" color={colors.text.muted}>
                  {`Tasa: ${summary.monthlyInterestRate}% mensual`}
                </AppText>
              ) : null}
            </View>

            {actionMode === 'edit' ? (
              <AppPressable
                testID={`account-edit-${summary.accountId}`}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${summary.name}`}
                onPress={() => onEdit(summary.accountId)}
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
            ) : actionMode === 'delete' ? (
              <AppPressable
                testID={`account-delete-${summary.accountId}`}
                accessibilityRole="button"
                accessibilityLabel={`Eliminar ${summary.name}`}
                onPress={() => onDelete(summary.accountId, summary.name)}
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
