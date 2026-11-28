/**
 * src/features/savings/components/SavingsForm.tsx
 *
 * Form of "+ Nuevo Ahorro" in the Savings tab (ADR 0034): a segmented control, like Gasto /
 * Ingreso in "Nuevo Movimiento", picks a savings fund (Fondo) or a savings bank account
 * (Cuenta de ahorros). It also edits an existing savings account, without the selector.
 * Each kind's fields own their state (R-17); the parent mounts the form with a new `key` each
 * time it opens.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  GlassSurface,
  hapticService,
  useBFlowTheme,
} from '../../../design-system';
import type { FinancialAccount } from '../../../domain';
import type {
  FinancialAccountInput,
  FinancialAccountUpdates,
} from '../../budget/store/useBudgetStore';
import { FinancialAccountFormFields } from '../../accounts/components/FinancialAccountFormFields';
import { SavingsBucketFields, SavingsFormHeader } from './SavingsBucketForms';

export type SavingsKind = 'fund' | 'account';

export interface SavingsFormProps {
  /** Savings account being edited; null registers a new fund or account. */
  account?: FinancialAccount | null;
  onCreateSavingsBucket?: (name: string, openingBalanceCop: number) => void;
  /** Without it the Cuenta de ahorros option is not offered. */
  onCreateAccount?: (input: FinancialAccountInput) => void;
  onUpdateAccount?: (accountId: string, updates: FinancialAccountUpdates) => void;
  onClose: () => void;
}

const SAVINGS_KIND_OPTIONS = [
  { kind: 'fund', label: 'Fondo' },
  { kind: 'account', label: 'Cuenta de ahorros' },
] as const;

const KIND_COPY: Record<SavingsKind, { create: string; edit: string; badge: string }> = {
  fund: { create: 'Nuevo Fondo de Ahorro', edit: 'Editar Fondo de Ahorro', badge: 'Ahorro' },
  account: {
    create: 'Nueva Cuenta de Ahorros',
    edit: 'Editar Cuenta de Ahorros',
    badge: 'Cuenta de ahorros',
  },
};

export const SavingsForm = React.memo(function SavingsForm({
  account = null,
  onCreateSavingsBucket,
  onCreateAccount,
  onUpdateAccount,
  onClose,
}: SavingsFormProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const isEditingAccount = account !== null;
  const [kind, setKind] = useState<SavingsKind>(() => (isEditingAccount ? 'account' : 'fund'));
  const canPickKind = !isEditingAccount && Boolean(onCreateAccount);

  const toneByKind: Record<SavingsKind, { color: string; soft: string }> = {
    fund: { color: colors.semantic.savings, soft: colors.semantic.savingsSoft },
    account: { color: colors.semantic.provisions, soft: colors.semantic.provisionsSoft },
  };
  const tone = toneByKind[kind];
  const copy = KIND_COPY[kind];

  const handleSubmitAccount = (input: FinancialAccountInput) => {
    if (account) {
      const { type: _type, ...updates } = input;
      onUpdateAccount?.(account.id, updates);
    } else {
      onCreateAccount?.(input);
    }
    onClose();
  };

  return (
    <GlassSurface
      elevated
      testID={isEditingAccount ? 'edit-savings-account-card' : 'add-savings-bucket-card'}
    >
      <View style={{ gap: spacing.md }}>
        <SavingsFormHeader
          title={isEditingAccount ? copy.edit : copy.create}
          badge={copy.badge}
          color={tone.color}
          softColor={tone.soft}
        />

        {canPickKind ? (
          <View
            testID="savings-kind-selector"
            style={{
              flexDirection: 'row',
              gap: spacing.xxs,
              padding: spacing.xxs,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              backgroundColor: colors.glass.surfaceTint,
              borderWidth: 1,
              borderColor: colors.glass.subtleBorder,
            }}
          >
            {SAVINGS_KIND_OPTIONS.map((opt) => {
              const isSelected = kind === opt.kind;
              const optTone = toneByKind[opt.kind];
              return (
                <AppPressable
                  key={opt.kind}
                  testID={`savings-kind-${opt.kind}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    hapticService.selection();
                    setKind(opt.kind);
                  }}
                  style={{
                    flex: 1,
                    minHeight: minTouchTarget,
                    paddingHorizontal: spacing.xxs,
                    borderRadius: radius.sm,
                    borderCurve: 'continuous',
                    backgroundColor: isSelected ? optTone.soft : 'transparent',
                    borderWidth: 1,
                    borderColor: isSelected ? optTone.color : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <AppText
                    variant="callout"
                    color={isSelected ? optTone.color : colors.text.secondary}
                  >
                    {opt.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
        ) : null}

        {kind === 'fund' ? (
          <SavingsBucketFields onCreateSavingsBucket={onCreateSavingsBucket} onClose={onClose} />
        ) : (
          <FinancialAccountFormFields
            accountType="debit"
            debitKind="savings"
            account={account}
            onSubmit={handleSubmitAccount}
          />
        )}
      </View>
    </GlassSurface>
  );
});
