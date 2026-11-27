/**
 * src/features/analytics/components/AccountsMonthPanel.tsx
 *
 * Month close panel of credit cards and debit accounts (ADR 0034): how much was spent with the
 * cards and how much was paid to them, the debit withdrawals and deposits, and one row per
 * account. Nothing is shown while no account is registered for the month.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AppText,
  CurrencyText,
  GlassSurface,
  ProgressFill,
  StatusBadge,
  useAmountPrivacy,
  useBFlowTheme,
  type CurrencyTone,
} from '../../../design-system';
import {
  financialAccountKindLabel,
  formatFinancialAccountLabel,
  formatMonthKeyLabelEs,
  type FinancialAccountMonthSummary,
  type FinancialAccountsSummary,
} from '../../../domain';

export interface AccountsMonthPanelProps {
  summary: FinancialAccountsSummary;
}

interface StatTileProps {
  label: string;
  amount: number;
  tone: CurrencyTone;
  caption?: string;
  testID?: string;
}

function StatTile({ label, amount, tone, caption, testID }: StatTileProps): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  return (
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
        {label}
      </AppText>
      <CurrencyText testID={testID} amount={amount} variant="headline" tone={tone} />
      {caption ? (
        <AppText variant="micro" color={colors.text.muted}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

interface FlowBarProps {
  fraction: number;
  color: string;
  testID?: string;
}

function FlowBar({ fraction, color, testID }: FlowBarProps): React.JSX.Element {
  const { colors, radius } = useBFlowTheme();
  return (
    <View
      style={{
        height: 6,
        borderRadius: radius.pill,
        borderCurve: 'continuous',
        backgroundColor: colors.glass.surfaceTint,
        overflow: 'hidden',
      }}
    >
      <ProgressFill testID={testID} fraction={fraction} color={color} />
    </View>
  );
}

function AccountFlowRow({
  account,
  maxFlow,
}: {
  account: FinancialAccountMonthSummary;
  maxFlow: number;
}): React.JSX.Element {
  const { colors, spacing } = useBFlowTheme();
  const { formatAmount } = useAmountPrivacy();
  const isCredit = account.type === 'credit';
  const spentFraction = maxFlow > 0 ? account.spentThisMonth / maxFlow : 0;
  const paidFraction = maxFlow > 0 ? account.paidThisMonth / maxFlow : 0;

  return (
    <View style={{ gap: spacing.xxs }} testID={`accounts-panel-row-${account.accountId}`}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing.xs,
        }}
      >
        <AppText variant="callout">{formatFinancialAccountLabel(account)}</AppText>
        <StatusBadge
          label={financialAccountKindLabel(account)}
          status={isCredit ? 'savings' : 'provisions'}
        />
      </View>
      <FlowBar
        fraction={spentFraction}
        color={colors.semantic.expense}
        testID={`accounts-panel-spent-${account.accountId}`}
      />
      <FlowBar
        fraction={paidFraction}
        color={colors.semantic.income}
        testID={`accounts-panel-paid-${account.accountId}`}
      />
      <AppText variant="micro" color={colors.text.secondary}>
        {isCredit
          ? `Gastado ${formatAmount(account.spentThisMonth)} · Pagado ${formatAmount(account.paidThisMonth)} · Pendiente ${formatAmount(account.closingBalance)}`
          : `Salidas ${formatAmount(account.spentThisMonth)} · Entradas ${formatAmount(account.paidThisMonth)} · Saldo ${formatAmount(account.closingBalance)}`}
      </AppText>
    </View>
  );
}

export const AccountsMonthPanel = React.memo(function AccountsMonthPanel({
  summary,
}: AccountsMonthPanelProps): React.JSX.Element | null {
  const { colors, spacing } = useBFlowTheme();
  const { formatAmount } = useAmountPrivacy();
  if (!summary.hasAccounts) return null;

  const hasCredit = summary.accounts.some((a) => a.type === 'credit');
  const hasDebit = summary.accounts.some((a) => a.type === 'debit');
  const creditNetChange = summary.credit.spentThisMonth - summary.credit.paidThisMonth;
  const maxFlow = Math.max(
    0,
    ...summary.accounts.flatMap((a) => [a.spentThisMonth, a.paidThisMonth])
  );

  const creditInsight =
    summary.credit.spentThisMonth === 0 && summary.credit.paidThisMonth === 0
      ? 'Sin compras ni pagos con tarjeta este mes.'
      : creditNetChange > 0
        ? `La deuda en tarjetas subió ${formatAmount(creditNetChange)} este mes.`
        : creditNetChange < 0
          ? `Pagaste más de lo que compraste: la deuda en tarjetas bajó ${formatAmount(-creditNetChange)}.`
          : 'Pagaste lo mismo que compraste con tarjeta este mes.';

  return (
    <GlassSurface elevated testID="accounts-month-panel">
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
          <AppText variant="title2">Tarjetas y Cuentas</AppText>
          <StatusBadge label={formatMonthKeyLabelEs(summary.monthKey)} status="info" />
        </View>

        {hasCredit ? (
          <View style={{ gap: spacing.xs }} testID="accounts-panel-credit">
            <AppText variant="caption" color={colors.text.secondary}>
              Tarjetas de crédito
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <StatTile
                label="GASTADO CON TARJETAS"
                amount={summary.credit.spentThisMonth}
                tone="expense"
                testID="accounts-panel-credit-spent"
              />
              <StatTile
                label="PAGADO A TARJETAS"
                amount={summary.credit.paidThisMonth}
                tone="income"
                testID="accounts-panel-credit-paid"
              />
              <StatTile
                label="PENDIENTE POR PAGAR"
                amount={summary.credit.closingBalance}
                tone="debt"
                caption={
                  summary.credit.creditLimit > 0
                    ? `Cupo disponible: ${formatAmount(summary.credit.availableCredit)}`
                    : undefined
                }
                testID="accounts-panel-credit-pending"
              />
            </View>
            <AppText
              testID="accounts-panel-credit-insight"
              variant="micro"
              color={creditNetChange > 0 ? colors.semantic.expense : colors.semantic.income}
            >
              {creditInsight}
            </AppText>
          </View>
        ) : null}

        {hasDebit ? (
          <View style={{ gap: spacing.xs }} testID="accounts-panel-debit">
            <AppText variant="caption" color={colors.text.secondary}>
              Cuentas débito y de ahorros
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <StatTile
                label="SALIDAS"
                amount={summary.debit.spentThisMonth}
                tone="expense"
                testID="accounts-panel-debit-spent"
              />
              <StatTile
                label="ENTRADAS"
                amount={summary.debit.paidThisMonth}
                tone="income"
                testID="accounts-panel-debit-paid"
              />
              <StatTile
                label="SALDO EN CUENTAS"
                amount={summary.debit.closingBalance}
                tone={summary.debit.closingBalance < 0 ? 'expense' : 'provisions'}
                testID="accounts-panel-debit-balance"
              />
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <LegendDot color={colors.semantic.expense} label="Gastado / salidas" />
            <LegendDot color={colors.semantic.income} label="Pagado / entradas" />
          </View>
          {summary.accounts.map((account) => (
            <AccountFlowRow key={account.accountId} account={account} maxFlow={maxFlow} />
          ))}
        </View>
      </View>
    </GlassSurface>
  );
});

function LegendDot({ color, label }: { color: string; label: string }): React.JSX.Element {
  const { colors, spacing, radius } = useBFlowTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
      <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color }} />
      <AppText variant="micro" color={colors.text.secondary}>
        {label}
      </AppText>
    </View>
  );
}
