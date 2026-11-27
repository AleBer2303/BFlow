/**
 * src/features/checklist/components/AccountLinkFields.tsx
 *
 * "More options" fields of the movement forms that link a movement to a credit card or debit
 * account (ADR 0034). For an expense on a credit card it also asks whether it was a purchase
 * with the card or a payment to it.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import {
  AdaptiveSelectField,
  AppPressable,
  AppText,
  hapticService,
  useBFlowTheme,
} from '../../../design-system';
import {
  financialAccountKindLabel,
  formatFinancialAccountLabel,
  type AccountMovementRole,
  type ConceptType,
  type FinancialAccount,
} from '../../../domain';

const NONE_OPTION_VALUE = '__none__';

const ROLE_OPTIONS = [
  { role: 'purchase', label: 'Compra con la tarjeta' },
  { role: 'payment', label: 'Pago a la tarjeta' },
] as const;

export interface AccountLinkFieldsProps {
  accounts: readonly FinancialAccount[];
  movementType: ConceptType;
  accountId: string | null;
  accountRole: AccountMovementRole;
  onChangeAccount: (accountId: string | null) => void;
  onChangeRole: (role: AccountMovementRole) => void;
  /** Prefix of the testIDs, e.g. `add-movement` or `edit-entry`. */
  testIDPrefix: string;
}

/** Text of the "more options" summary for the linked account, or null when there is none. */
export function describeAccountLink(
  accounts: readonly FinancialAccount[],
  movementType: ConceptType,
  accountId: string | null,
  accountRole: AccountMovementRole
): string | null {
  const account = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  if (!account) return null;
  const label = formatFinancialAccountLabel(account);
  if (account.type === 'credit' && movementType === 'expense' && accountRole === 'payment') {
    return `Pago a ${label}`;
  }
  return label;
}

export function AccountLinkFields({
  accounts,
  movementType,
  accountId,
  accountRole,
  onChangeAccount,
  onChangeRole,
  testIDPrefix,
}: AccountLinkFieldsProps): React.JSX.Element | null {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();

  const options = useMemo(
    () => [
      { value: NONE_OPTION_VALUE, label: 'Sin tarjeta ni cuenta' },
      ...accounts.map((account) => ({
        value: account.id,
        label: `${formatFinancialAccountLabel(account)} · ${financialAccountKindLabel(account)}`,
      })),
    ],
    [accounts]
  );

  if (accounts.length === 0) return null;

  const selected = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const showRole = selected?.type === 'credit' && movementType === 'expense';
  const isExpense = movementType === 'expense';

  return (
    <View style={{ gap: spacing.xs }}>
      <AdaptiveSelectField
        label={
          isExpense
            ? '¿Con qué tarjeta o cuenta? (opcional)'
            : '¿A qué tarjeta o cuenta llegó? (opcional)'
        }
        title={isExpense ? 'Pagado con' : 'Recibido en'}
        options={options}
        selectedValue={selected ? selected.id : NONE_OPTION_VALUE}
        onSelect={(value) => {
          hapticService.selection();
          onChangeAccount(value === NONE_OPTION_VALUE ? null : value);
        }}
        triggerTestID={`${testIDPrefix}-account-select`}
        valueTestID={`${testIDPrefix}-account-value`}
        pickerTestID={`${testIDPrefix}-account-picker`}
        accessibilityLabel={
          isExpense ? 'Tarjeta o cuenta con la que se pagó' : 'Tarjeta o cuenta donde se recibió'
        }
      />

      {showRole ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {ROLE_OPTIONS.map((opt) => {
            const active = accountRole === opt.role;
            return (
              <AppPressable
                key={opt.role}
                testID={`${testIDPrefix}-account-role-${opt.role}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  hapticService.selection();
                  onChangeRole(opt.role);
                }}
                style={{
                  flex: 1,
                  minHeight: minTouchTarget,
                  paddingHorizontal: spacing.xs,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  backgroundColor: active ? colors.semantic.savingsSoft : colors.glass.surfaceTint,
                  borderWidth: 1,
                  borderColor: active ? colors.semantic.savings : colors.glass.subtleBorder,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <AppText
                  variant="caption"
                  color={active ? colors.semantic.savings : colors.text.secondary}
                >
                  {opt.label}
                </AppText>
              </AppPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
