/**
 * src/features/accounts/components/FinancialAccountFormFields.tsx
 *
 * Fields of a credit card or debit account (ADR 0034). Deudas opens it for credit cards and
 * checking accounts ("+ Nueva Deuda"), Ahorros for savings accounts ("+ Nuevo Ahorro"): the
 * caller fixes the kind, the user never picks it here. It owns its field state (R-17), so
 * typing re-renders only this form; the parent remounts it (new `key`) when the kind changes.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppPressable,
  AppText,
  AppTextInput,
  FormMessage,
  HeroAmountField,
  useAmountPrivacy,
  useBFlowTheme,
  usePrimaryActionLook,
} from '../../../design-system';
import {
  extractDigits,
  formatGroupedIntegerInput,
  isValidAccountDay,
  parseDigitsInput,
  type DebitAccountKind,
  type FinancialAccount,
  type FinancialAccountType,
} from '../../../domain';
import type { FinancialAccountInput } from '../../budget/store/useBudgetStore';

export interface FinancialAccountFormFieldsProps {
  accountType: FinancialAccountType;
  /**
   * Kind of a debit account: `checking` (Deudas) or `savings` (Ahorros). Ignored for credit
   * cards. Defaults to the edited account's kind, or `checking`.
   */
  debitKind?: DebitAccountKind;
  /** Account being edited; null registers a new one. */
  account: FinancialAccount | null;
  onSubmit: (input: FinancialAccountInput) => void;
}

function parseAmount(text: string): number {
  return parseDigitsInput(text);
}

function parseDay(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const day = Number(trimmed);
  return isValidAccountDay(day) ? day : null;
}

function amountText(value: number | undefined): string {
  return value !== undefined && value > 0 ? formatGroupedIntegerInput(value) : '';
}

export const FinancialAccountFormFields = React.memo(function FinancialAccountFormFields({
  accountType,
  debitKind,
  account,
  onSubmit,
}: FinancialAccountFormFieldsProps): React.JSX.Element {
  const { colors, spacing, radius, minTouchTarget } = useBFlowTheme();
  const primaryAction = usePrimaryActionLook();
  const { formatAmount } = useAmountPrivacy();
  const isCredit = accountType === 'credit';
  const resolvedDebitKind: DebitAccountKind = debitKind ?? account?.debitKind ?? 'checking';
  const isSavings = !isCredit && resolvedDebitKind === 'savings';
  const toneColor = isCredit ? colors.semantic.savings : colors.semantic.provisions;

  const [name, setName] = useState(() => account?.name ?? '');
  const [institution, setInstitution] = useState(() => account?.institution ?? '');
  const [lastFour, setLastFour] = useState(() => account?.lastFourDigits ?? '');
  const [balance, setBalance] = useState(() => amountText(account?.openingBalance));
  const [creditLimit, setCreditLimit] = useState(() => amountText(account?.creditLimit));
  const [statementDay, setStatementDay] = useState(() =>
    account?.statementDay ? String(account.statementDay) : ''
  );
  const [paymentDueDay, setPaymentDueDay] = useState(() =>
    account?.paymentDueDay ? String(account.paymentDueDay) : ''
  );
  const [interestRate, setInterestRate] = useState(() =>
    account?.monthlyInterestRate ? String(account.monthlyInterestRate) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    if (error) setError(null);
  };

  const creditPreview = useMemo(() => {
    if (!isCredit) return null;
    const limit = parseAmount(creditLimit);
    if (!Number.isSafeInteger(limit) || limit <= 0) return null;
    const owed = parseAmount(balance);
    const available = Math.max(0, limit - owed);
    const usedPercent = Math.min(100, Math.round((owed / limit) * 1000) / 10);
    return { available, usedPercent };
  }, [balance, creditLimit, isCredit]);

  const handleSave = () => {
    if (!name.trim()) {
      setError(isCredit ? 'Escribe el nombre de la tarjeta.' : 'Escribe el nombre de la cuenta.');
      return;
    }
    if (!institution.trim()) {
      setError('Escribe el banco o la entidad.');
      return;
    }
    const digits = extractDigits(lastFour);
    if (digits.length > 0 && digits.length !== 4) {
      setError('Los últimos dígitos deben ser exactamente 4 números.');
      return;
    }
    const parsedBalance = parseAmount(balance);
    if (!Number.isSafeInteger(parsedBalance)) {
      setError(isCredit ? 'Ingresa un valor pendiente válido.' : 'Ingresa un saldo válido.');
      return;
    }

    const base = {
      name: name.trim(),
      institution: institution.trim(),
      openingBalance: parsedBalance,
      ...(digits.length === 4 ? { lastFourDigits: digits } : {}),
    };

    if (!isCredit) {
      setError(null);
      onSubmit({ type: 'debit', ...base, debitKind: resolvedDebitKind });
      return;
    }

    const parsedLimit = parseAmount(creditLimit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit <= 0) {
      setError('Ingresa el cupo total de la tarjeta.');
      return;
    }
    const parsedStatementDay = parseDay(statementDay);
    const parsedDueDay = parseDay(paymentDueDay);
    if (parsedStatementDay === null || parsedDueDay === null) {
      setError('Los días de corte y de pago deben estar entre 1 y 31.');
      return;
    }
    const cleanRate = interestRate.replace(',', '.').trim();
    const parsedRate = cleanRate ? parseFloat(cleanRate) : 0;
    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      setError('La tasa de interés mensual debe ser entre 0% y 100%.');
      return;
    }

    setError(null);
    onSubmit({
      type: 'credit',
      ...base,
      creditLimit: parsedLimit,
      ...(parsedStatementDay !== undefined ? { statementDay: parsedStatementDay } : {}),
      ...(parsedDueDay !== undefined ? { paymentDueDay: parsedDueDay } : {}),
      ...(parsedRate > 0 ? { monthlyInterestRate: parsedRate } : {}),
    });
  };

  return (
    <View
      style={{ gap: spacing.md }}
      testID={`account-form-${isCredit ? 'credit' : isSavings ? 'savings' : 'debit'}`}
    >
      <HeroAmountField
        containerTestID="account-form-hero-amount"
        inputTestID="account-form-balance-input"
        label={isCredit ? 'Valor pendiente de pago' : 'Saldo actual'}
        tone={isCredit ? 'savings' : 'provisions'}
        value={balance}
        onChangeText={(text) => {
          setBalance(text);
          clearError();
        }}
      />

      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.text.secondary}>
          {isCredit ? 'Nombre de la tarjeta' : 'Nombre de la cuenta'}
        </AppText>
        <AppTextInput
          testID="account-form-name-input"
          value={name}
          onChangeText={(text) => {
            setName(text);
            clearError();
          }}
          placeholder={
            isCredit
              ? 'Ej. Visa Oro, Mastercard'
              : isSavings
                ? 'Ej. Cuenta de ahorros, Bolsillo'
                : 'Ej. Cuenta nómina, Cuenta corriente'
          }
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flex: 2, minWidth: 160, gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Banco o entidad
          </AppText>
          <AppTextInput
            testID="account-form-institution-input"
            value={institution}
            onChangeText={(text) => {
              setInstitution(text);
              clearError();
            }}
            placeholder="Ej. Banco, Cooperativa"
          />
        </View>
        <View style={{ flex: 1, minWidth: 110, gap: spacing.xs }}>
          <AppText variant="caption" color={colors.text.secondary}>
            Últimos 4
          </AppText>
          <AppTextInput
            testID="account-form-last-four-input"
            value={lastFour}
            onChangeText={(text) => {
              setLastFour(extractDigits(text).slice(0, 4));
              clearError();
            }}
            keyboardType="number-pad"
            formatThousands={false}
            maxLength={4}
            placeholder="Opcional"
          />
        </View>
      </View>

      {isCredit ? (
        <>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Cupo total
            </AppText>
            <AppTextInput
              testID="account-form-credit-limit-input"
              value={creditLimit}
              onChangeText={(text) => {
                setCreditLimit(text);
                clearError();
              }}
              keyboardType="number-pad"
              placeholder="Ej. 3.000.000"
            />
            {creditPreview ? (
              <AppText testID="account-form-credit-preview" variant="micro" color={toneColor}>
                {`Cupo disponible: ${formatAmount(creditPreview.available)} · Uso ${creditPreview.usedPercent}%`}
              </AppText>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 130, gap: spacing.xs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Día de corte
              </AppText>
              <AppTextInput
                testID="account-form-statement-day-input"
                value={statementDay}
                onChangeText={(text) => {
                  setStatementDay(extractDigits(text).slice(0, 2));
                  clearError();
                }}
                keyboardType="number-pad"
                formatThousands={false}
                maxLength={2}
                placeholder="Ej. 15"
              />
            </View>
            <View style={{ flex: 1, minWidth: 130, gap: spacing.xs }}>
              <AppText variant="caption" color={colors.text.secondary}>
                Día límite de pago
              </AppText>
              <AppTextInput
                testID="account-form-due-day-input"
                value={paymentDueDay}
                onChangeText={(text) => {
                  setPaymentDueDay(extractDigits(text).slice(0, 2));
                  clearError();
                }}
                keyboardType="number-pad"
                formatThousands={false}
                maxLength={2}
                placeholder="Ej. 30"
              />
            </View>
          </View>

          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" color={colors.text.secondary}>
              Tasa de interés mensual (opcional)
            </AppText>
            <AppTextInput
              testID="account-form-interest-rate-input"
              value={interestRate}
              onChangeText={(text) => {
                setInterestRate(text);
                clearError();
              }}
              keyboardType="decimal-pad"
              placeholder="Ej. 2.1 (vacío = sin dato)"
            />
          </View>
        </>
      ) : (
        <AppText variant="micro" color={colors.text.muted}>
          {isSavings
            ? 'Vincula ingresos (depósitos) y gastos (retiros) del Checklist a esta cuenta para seguir su saldo.'
            : 'Vincula ingresos y gastos del Checklist a esta cuenta para seguir su saldo.'}
        </AppText>
      )}

      <FormMessage message={error} />

      <AppPressable
        testID="account-form-submit-button"
        accessibilityRole="button"
        onPress={handleSave}
        style={{
          width: '100%',
          minHeight: minTouchTarget,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          ...primaryAction.container,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <AppText variant="headline" color={primaryAction.labelColor ?? toneColor}>
          {isCredit ? 'Guardar Tarjeta' : isSavings ? 'Guardar Cuenta de Ahorros' : 'Guardar Cuenta'}
        </AppText>
      </AppPressable>
    </View>
  );
});
