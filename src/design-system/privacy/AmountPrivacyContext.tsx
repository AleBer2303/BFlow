/**
 * src/design-system/privacy/AmountPrivacyContext.tsx
 *
 * Privacy mode for money: one switch (the eye next to the net flow, in Summary) hides every
 * amount the app shows, on every tab, until it is switched back.
 *
 * Every amount on screen is written through `formatAmount` (or `CurrencyText`, which uses it),
 * never through `formatCurrency` directly, so nothing escapes the switch. A hidden amount is
 * one fixed mask: its length says nothing about the figure, and neither does its sign.
 * Accessibility labels use the same formatter, so a screen reader does not read it out either.
 *
 * The choice is remembered on this device (`persistentStorage`). Outside a provider (unit tests,
 * isolated previews) amounts are visible and the switch does nothing.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatSignedCurrency,
} from '../../domain/money/money';
import { persistentStorage } from '../../platform/storage/persistentStorageAdapter';

/** What every hidden amount shows, whatever its size or sign. */
export const HIDDEN_AMOUNT_TEXT = '$ ••••••';
/** Hidden amount in a tight spot (chart axis ticks). */
export const HIDDEN_AMOUNT_COMPACT_TEXT = '•••';

export const AMOUNTS_HIDDEN_STORAGE_KEY = 'bflow.preferences.amounts_hidden.v1';

export interface AmountPrivacyContextValue {
  amountsHidden: boolean;
  setAmountsHidden: (hidden: boolean) => void;
  toggleAmountsHidden: () => void;
  /** `formatCurrency`, or the mask while amounts are hidden. */
  formatAmount: (amount: number) => string;
  /** `formatCurrencyCompact`, or the short mask while amounts are hidden. */
  formatAmountCompact: (amount: number) => string;
  /** `formatSignedCurrency` ("+ $ 1.000"), or the mask, without its sign, while hidden. */
  formatSignedAmount: (amount: number) => string;
}

const VISIBLE_AMOUNTS: AmountPrivacyContextValue = {
  amountsHidden: false,
  setAmountsHidden: () => undefined,
  toggleAmountsHidden: () => undefined,
  formatAmount: formatCurrency,
  formatAmountCompact: formatCurrencyCompact,
  formatSignedAmount: formatSignedCurrency,
};

const AmountPrivacyContext = createContext<AmountPrivacyContextValue>(VISIBLE_AMOUNTS);

function readStoredPreference(): boolean {
  try {
    return persistentStorage.getItem<boolean>(AMOUNTS_HIDDEN_STORAGE_KEY) === true;
  } catch {
    return false;
  }
}

function storePreference(hidden: boolean): void {
  try {
    persistentStorage.setItem(AMOUNTS_HIDDEN_STORAGE_KEY, hidden);
  } catch {
    // Not remembered on this device; the switch still works for the session.
  }
}

export interface AmountPrivacyProviderProps {
  children: React.ReactNode;
  /** Starting state; by default, what this device remembered. */
  initialHidden?: boolean;
}

export function AmountPrivacyProvider({
  children,
  initialHidden,
}: AmountPrivacyProviderProps): React.JSX.Element {
  const [amountsHidden, setHiddenState] = useState<boolean>(
    () => initialHidden ?? readStoredPreference()
  );

  const setAmountsHidden = useCallback((hidden: boolean) => {
    setHiddenState(hidden);
    storePreference(hidden);
  }, []);

  const toggleAmountsHidden = useCallback(() => {
    setHiddenState((previous) => {
      const next = !previous;
      storePreference(next);
      return next;
    });
  }, []);

  const value = useMemo<AmountPrivacyContextValue>(
    () => ({
      amountsHidden,
      setAmountsHidden,
      toggleAmountsHidden,
      formatAmount: amountsHidden ? () => HIDDEN_AMOUNT_TEXT : formatCurrency,
      formatAmountCompact: amountsHidden ? () => HIDDEN_AMOUNT_COMPACT_TEXT : formatCurrencyCompact,
      formatSignedAmount: amountsHidden ? () => HIDDEN_AMOUNT_TEXT : formatSignedCurrency,
    }),
    [amountsHidden, setAmountsHidden, toggleAmountsHidden]
  );

  return <AmountPrivacyContext.Provider value={value}>{children}</AmountPrivacyContext.Provider>;
}

export function useAmountPrivacy(): AmountPrivacyContextValue {
  return useContext(AmountPrivacyContext);
}
