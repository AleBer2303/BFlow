/**
 * src/domain/accounts/financialAccounts.ts
 *
 * Credit cards and debit accounts (ADR 0034). Pure functions: no balance is stored, every
 * figure is derived from the account's opening balance and the completed movements linked to
 * it (`MonthEntry.accountId`), the same way debt balances are derived from their payments.
 *
 * - Debit: an income linked to it adds to the balance; an expense takes from it.
 * - Credit: an expense is a purchase (adds to what is owed) unless its `accountRole` is
 *   `payment`; an income (refund, cashback) and an expense marked `payment` lower what is owed.
 */

import { assertValidMonthKey } from '../date/monthKey';
import { assertSafeMoneyInteger, sumMoneyIntegers } from '../money/money';
import type {
  AccountMovementRole,
  DebitAccountKind,
  FinancialAccount,
  FinancialAccountType,
  MonthEntry,
} from '../models/types';

/** How a movement moves an account: `spent` (purchase / withdrawal) or `paid` (payment / deposit). */
export type AccountMovementEffect = 'spent' | 'paid';

export interface FinancialAccountMonthSummary {
  accountId: string;
  type: FinancialAccountType;
  name: string;
  institution: string;
  lastFourDigits?: string;
  debitKind?: DebitAccountKind;
  monthKey: string;
  /**
   * Debit: balance at the start of the month. Credit: amount owed at the start of the month
   * (negative = balance in favour).
   */
  openingBalance: number;
  /** Credit: purchases. Debit: withdrawals (expenses). */
  spentThisMonth: number;
  /** Credit: payments and refunds. Debit: deposits (incomes). */
  paidThisMonth: number;
  /** Balance (debit) or amount owed (credit) at the end of the month. */
  closingBalance: number;
  movementCount: number;
  /** False when `monthKey` is before the month the account was registered in. */
  isActiveInMonth: boolean;
  creditLimit?: number;
  /** Credit: `creditLimit - closingBalance`, never below 0. */
  availableCredit?: number;
  /** Credit: share of the credit line in use, 0..1 (capped). */
  utilizationRatio?: number;
  statementDay?: number;
  paymentDueDay?: number;
  monthlyInterestRate?: number;
  /** Credit: next statement closing date (YYYY-MM-DD) from the reference date. */
  nextStatementDate?: string;
  /** Credit: next payment due date (YYYY-MM-DD) from the reference date. */
  nextPaymentDueDate?: string;
}

export interface FinancialAccountsTotals {
  spentThisMonth: number;
  paidThisMonth: number;
  closingBalance: number;
}

export interface FinancialAccountsSummary {
  monthKey: string;
  accounts: FinancialAccountMonthSummary[];
  credit: FinancialAccountsTotals & { creditLimit: number; availableCredit: number };
  debit: FinancialAccountsTotals;
  /** True when at least one account is active in the month. */
  hasAccounts: boolean;
}

export const ACCOUNT_DAY_MIN = 1;
export const ACCOUNT_DAY_MAX = 31;

export function isValidAccountDay(day: number | undefined): day is number {
  return (
    typeof day === 'number' &&
    Number.isInteger(day) &&
    day >= ACCOUNT_DAY_MIN &&
    day <= ACCOUNT_DAY_MAX
  );
}

/** Keeps the last four digits only when they are exactly four digits. */
export function normalizeLastFourDigits(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/[^0-9]/g, '');
  return digits.length === 4 ? digits : undefined;
}

/**
 * How `entry` moves `account`, or null when it does not touch it (other account, pending,
 * zero amount).
 */
export function resolveAccountMovementEffect(
  entry: MonthEntry,
  account: FinancialAccount
): AccountMovementEffect | null {
  if (entry.accountId !== account.id) return null;
  if (entry.status !== 'completed' || entry.actualAmount <= 0) return null;
  if (account.type === 'debit') {
    return entry.type === 'income' ? 'paid' : 'spent';
  }
  if (entry.type === 'income') return 'paid';
  return entry.accountRole === 'payment' ? 'paid' : 'spent';
}

/** Signed change of the stored balance (debit) or the amount owed (credit) for an effect. */
function signedBalanceDelta(
  type: FinancialAccountType,
  effect: AccountMovementEffect,
  amount: number
): number {
  if (type === 'debit') return effect === 'paid' ? amount : -amount;
  return effect === 'spent' ? amount : -amount;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Next date (including `referenceIsoDate` itself) whose day of the month is `day`. Days past
 * the end of a month fall on its last day (31 → 30 Nov, 28/29 Feb).
 */
export function resolveNextMonthlyDate(referenceIsoDate: string, day: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceIsoDate)) {
    throw new RangeError(`Invalid ISO date "${referenceIsoDate}" (expected YYYY-MM-DD)`);
  }
  if (!isValidAccountDay(day)) {
    throw new RangeError(`Invalid day of month ${day} (expected 1..31)`);
  }
  const year = Number(referenceIsoDate.slice(0, 4));
  const month = Number(referenceIsoDate.slice(5, 7));
  const today = Number(referenceIsoDate.slice(8, 10));
  const dayThisMonth = Math.min(day, lastDayOfMonth(year, month));
  if (today <= dayThisMonth) {
    return toIsoDate(year, month, dayThisMonth);
  }
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return toIsoDate(nextYear, nextMonth, Math.min(day, lastDayOfMonth(nextYear, nextMonth)));
}

/**
 * Summary of one account for `monthKey`: its balance at the start and end of the month and
 * what was spent and paid in it. Movements before `openingMonthKey` are ignored (the opening
 * balance already includes them).
 */
export function calculateFinancialAccountMonthSummary(
  account: FinancialAccount,
  entries: readonly MonthEntry[],
  monthKey: string,
  referenceIsoDate?: string
): FinancialAccountMonthSummary {
  assertValidMonthKey(monthKey);
  assertValidMonthKey(account.openingMonthKey);
  const openingAmount = assertSafeMoneyInteger(account.openingBalance, 'account openingBalance');
  const isActiveInMonth = monthKey >= account.openingMonthKey;

  const priorDeltas: number[] = [];
  const spent: number[] = [];
  const paid: number[] = [];
  let movementCount = 0;

  for (const entry of entries) {
    if (entry.monthKey < account.openingMonthKey || entry.monthKey > monthKey) continue;
    const effect = resolveAccountMovementEffect(entry, account);
    if (!effect) continue;
    const amount = assertSafeMoneyInteger(entry.actualAmount, 'linked movement amount');
    if (entry.monthKey < monthKey) {
      priorDeltas.push(signedBalanceDelta(account.type, effect, amount));
      continue;
    }
    movementCount += 1;
    (effect === 'spent' ? spent : paid).push(amount);
  }

  const openingBalance = isActiveInMonth ? openingAmount + sumMoneyIntegers(priorDeltas) : 0;
  const spentThisMonth = sumMoneyIntegers(spent);
  const paidThisMonth = sumMoneyIntegers(paid);
  const closingBalance =
    account.type === 'debit'
      ? openingBalance - spentThisMonth + paidThisMonth
      : openingBalance + spentThisMonth - paidThisMonth;

  const summary: FinancialAccountMonthSummary = {
    accountId: account.id,
    type: account.type,
    name: account.name,
    institution: account.institution,
    ...(account.lastFourDigits ? { lastFourDigits: account.lastFourDigits } : {}),
    monthKey,
    openingBalance,
    spentThisMonth,
    paidThisMonth,
    closingBalance,
    movementCount,
    isActiveInMonth,
  };

  if (account.type === 'debit') {
    if (account.debitKind) summary.debitKind = account.debitKind;
    return summary;
  }

  if (account.creditLimit !== undefined && account.creditLimit > 0) {
    summary.creditLimit = account.creditLimit;
    summary.availableCredit = Math.max(0, account.creditLimit - closingBalance);
    summary.utilizationRatio = Math.min(1, Math.max(0, closingBalance) / account.creditLimit);
  }
  if (account.monthlyInterestRate !== undefined && account.monthlyInterestRate > 0) {
    summary.monthlyInterestRate = account.monthlyInterestRate;
  }
  if (isValidAccountDay(account.statementDay)) {
    summary.statementDay = account.statementDay;
    if (referenceIsoDate) {
      summary.nextStatementDate = resolveNextMonthlyDate(referenceIsoDate, account.statementDay);
    }
  }
  if (isValidAccountDay(account.paymentDueDay)) {
    summary.paymentDueDay = account.paymentDueDay;
    if (referenceIsoDate) {
      summary.nextPaymentDueDate = resolveNextMonthlyDate(referenceIsoDate, account.paymentDueDay);
    }
  }
  return summary;
}

/**
 * Summary of every account for `monthKey`, plus the credit and debit totals the month close
 * shows. Accounts registered after `monthKey` are left out.
 */
export function calculateFinancialAccountsSummary(
  accounts: readonly FinancialAccount[],
  entries: readonly MonthEntry[],
  monthKey: string,
  referenceIsoDate?: string
): FinancialAccountsSummary {
  assertValidMonthKey(monthKey);
  const summaries = accounts
    .map((account) =>
      calculateFinancialAccountMonthSummary(account, entries, monthKey, referenceIsoDate)
    )
    .filter((summary) => summary.isActiveInMonth);

  const credit = summaries.filter((s) => s.type === 'credit');
  const debit = summaries.filter((s) => s.type === 'debit');
  const creditLimit = sumMoneyIntegers(credit.map((s) => s.creditLimit ?? 0));
  const creditClosing = sumMoneyIntegers(credit.map((s) => s.closingBalance));

  return {
    monthKey,
    accounts: summaries,
    credit: {
      spentThisMonth: sumMoneyIntegers(credit.map((s) => s.spentThisMonth)),
      paidThisMonth: sumMoneyIntegers(credit.map((s) => s.paidThisMonth)),
      closingBalance: creditClosing,
      creditLimit,
      availableCredit: sumMoneyIntegers(credit.map((s) => s.availableCredit ?? 0)),
    },
    debit: {
      spentThisMonth: sumMoneyIntegers(debit.map((s) => s.spentThisMonth)),
      paidThisMonth: sumMoneyIntegers(debit.map((s) => s.paidThisMonth)),
      closingBalance: sumMoneyIntegers(debit.map((s) => s.closingBalance)),
    },
    hasAccounts: summaries.length > 0,
  };
}

export interface EntryAccountLinkUpdate {
  /** null or '' removes the link; undefined leaves it is. */
  accountId?: string | null;
  accountRole?: AccountMovementRole | null;
}

/**
 * Returns `entry` with its account link set or removed. The role is kept only for an expense
 * linked to a credit card, and an unknown account removes the link.
 */
export function applyEntryAccountLink(
  entry: MonthEntry,
  update: EntryAccountLinkUpdate,
  accounts: readonly FinancialAccount[]
): MonthEntry {
  if (update.accountId === undefined && update.accountRole === undefined) return entry;

  const nextAccountId = update.accountId === undefined ? entry.accountId : update.accountId;
  const { accountId: _previousId, accountRole: _previousRole, ...rest } = entry;
  const account = nextAccountId ? accounts.find((a) => a.id === nextAccountId) : undefined;
  if (!account) return rest;

  const linked: MonthEntry = { ...rest, accountId: account.id };
  if (account.type === 'credit' && entry.type === 'expense') {
    const role =
      update.accountRole === undefined ? entry.accountRole : (update.accountRole ?? undefined);
    linked.accountRole = role === 'payment' ? 'payment' : 'purchase';
  }
  return linked;
}

/**
 * Where an account is managed: `debts` (credit cards and checking accounts, in Deudas) or
 * `savings` (savings accounts, in Ahorros). `all` keeps every account (Cierre, movements).
 */
export type FinancialAccountScope = 'all' | 'debts' | 'savings';

/** A debit account marked as savings. A debit account without a kind counts as checking. */
export function isSavingsAccount(account: Pick<FinancialAccount, 'type' | 'debitKind'>): boolean {
  return account.type === 'debit' && account.debitKind === 'savings';
}

export function filterFinancialAccountsByScope(
  accounts: readonly FinancialAccount[],
  scope: FinancialAccountScope
): FinancialAccount[] {
  if (scope === 'all') return [...accounts];
  return accounts.filter((account) => isSavingsAccount(account) === (scope === 'savings'));
}

/** "Crédito", "Débito" (checking) or "Ahorros" (savings account). */
export function financialAccountKindLabel(
  account: Pick<FinancialAccount, 'type' | 'debitKind'>
): string {
  if (account.type === 'credit') return 'Crédito';
  return isSavingsAccount(account) ? 'Ahorros' : 'Débito';
}

/** Short label of an account for selectors and chips ("Visa Oro ·· 1234"). */
export function formatFinancialAccountLabel(
  account: Pick<FinancialAccount, 'name' | 'lastFourDigits'>
): string {
  return account.lastFourDigits ? `${account.name} ·· ${account.lastFourDigits}` : account.name;
}
