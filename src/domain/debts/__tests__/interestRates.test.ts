import { annualToMonthlyRate, monthlyToAnnualRate } from '../interestRates';
import * as domain from '../../index';

describe('conversión de tasas de interés (CC-02)', () => {
  it.each([
    [24, 2],
    [25, 2.0833],
    [12.5, 1.0417],
    [0, 0],
    [200, 16.6667],
  ])('anual %s %% -> mensual %s %%', (annual, monthly) => {
    expect(annualToMonthlyRate(annual)).toBe(monthly);
  });

  it.each([
    [2, 24],
    [2.1, 25.2],
    [1.0417, 12.5004],
    [0, 0],
  ])('mensual %s %% -> anual %s %%', (monthly, annual) => {
    expect(monthlyToAnnualRate(monthly)).toBe(annual);
  });

  it('da lo mismo que la fórmula que repetían los slices y el formulario', () => {
    for (const rate of [0.5, 1.75, 3.3333, 18, 27.9, 99.99]) {
      expect(annualToMonthlyRate(rate)).toBe(Number((rate / 12).toFixed(4)));
      expect(monthlyToAnnualRate(rate)).toBe(Number((rate * 12).toFixed(4)));
    }
  });

  it('se exportan desde el dominio', () => {
    expect(domain.annualToMonthlyRate).toBe(annualToMonthlyRate);
    expect(domain.monthlyToAnnualRate).toBe(monthlyToAnnualRate);
  });
});
