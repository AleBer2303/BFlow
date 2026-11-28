/**
 * src/features/onboarding/components/OnboardingAccountsList.tsx
 *
 * Credit cards and debit accounts configured in the onboarding (ADR 0034). The Deudas step
 * lists credit cards and checking accounts; the Ahorros step, savings accounts. Each row shows
 * the balance at the start of the month and the card's terms, with its remove button.
 */

import React from 'react';
import { View } from 'react-native';
import { AppText, CurrencyText, useAmountPrivacy, useBFlowTheme } from '../../../design-system';
import { formatFinancialAccountLabel, isSavingsAccount } from '../../../domain';
import type { OnboardingFinancialAccountInput } from '../../budget/store/useBudgetStore';
import { OnboardingItemRow } from './onboardingStepParts';

export interface OnboardingAccountsListProps {
  /** Heading above the rows, shown only when there are accounts. */
  title: string;
  accounts: readonly OnboardingFinancialAccountInput[];
  onRemoveAccount: (key: string) => void;
}

function accountKindLabel(account: OnboardingFinancialAccountInput): string {
  if (account.type === 'credit') return 'Tarjeta de crédito';
  return isSavingsAccount(account) ? 'Cuenta de ahorros' : 'Cuenta corriente';
}

export const OnboardingAccountsList = React.memo(function OnboardingAccountsList({
  title,
  accounts,
  onRemoveAccount,
}: OnboardingAccountsListProps): React.JSX.Element | null {
  const { colors, spacing } = useBFlowTheme();
  const { formatAmount } = useAmountPrivacy();

  if (accounts.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="micro" color={colors.text.secondary}>
        {title}
      </AppText>
      {accounts.map((account) => {
        const isCredit = account.type === 'credit';
        const details = [
          accountKindLabel(account),
          isCredit ? 'Pendiente al iniciar' : 'Saldo al iniciar',
          isCredit && account.creditLimit ? `Cupo: ${formatAmount(account.creditLimit)}` : null,
          isCredit && account.statementDay ? `Corte: día ${account.statementDay}` : null,
          isCredit && account.paymentDueDay ? `Pago: día ${account.paymentDueDay}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <OnboardingItemRow
            key={account.key}
            testID={`onboarding-account-item-${account.key}`}
            removeTestID={`onboarding-remove-account-${account.key}`}
            itemName={account.name}
            onRemove={() => onRemoveAccount(account.key)}
          >
            <AppText variant="body">
              {`${formatFinancialAccountLabel(account)} (${account.institution})`}
            </AppText>
            <CurrencyText
              amount={account.openingBalance}
              variant="callout"
              tone={isCredit ? 'debt' : 'income'}
            />
            <AppText variant="micro" color={colors.text.secondary}>
              {details}
            </AppText>
          </OnboardingItemRow>
        );
      })}
    </View>
  );
});
