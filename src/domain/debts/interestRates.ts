/**
 * src/domain/debts/interestRates.ts
 *
 * Conversion between the annual and the monthly interest rate of a debt, in percent (CC-02).
 * Simple (nominal) conversion, as the app has always stored it: monthly = annual / 12, rounded
 * to 4 decimals so both rates round-trip the same way in every form and slice.
 */

const RATE_DECIMALS = 4;

function roundRate(rate: number): number {
  return Number(rate.toFixed(RATE_DECIMALS));
}

export function annualToMonthlyRate(annualRate: number): number {
  return roundRate(annualRate / 12);
}

export function monthlyToAnnualRate(monthlyRate: number): number {
  return roundRate(monthlyRate * 12);
}
