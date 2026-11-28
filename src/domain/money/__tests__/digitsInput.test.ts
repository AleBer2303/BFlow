import { extractDigits, parseDigitsInput } from '../money';
import * as domain from '../../index';

describe('lectura de montos escritos en formularios (CC-02)', () => {
  it('extractDigits deja solo los dígitos', () => {
    expect(extractDigits('$ 1.500.000')).toBe('1500000');
    expect(extractDigits('12/3 ab')).toBe('123');
    expect(extractDigits('-45')).toBe('45');
    expect(extractDigits('')).toBe('');
    expect(extractDigits('sin números')).toBe('');
  });

  it('parseDigitsInput convierte el monto y usa el valor para el vacío', () => {
    expect(parseDigitsInput('$ 1.500.000')).toBe(1_500_000);
    expect(parseDigitsInput('0')).toBe(0);
    expect(parseDigitsInput('')).toBe(0);
    expect(parseDigitsInput('   ', 1)).toBe(1);
    expect(parseDigitsInput('6 meses', 1)).toBe(6);
  });

  it('no lanza con montos enormes: el formulario los rechaza con Number.isSafeInteger', () => {
    const huge = parseDigitsInput('9'.repeat(20));
    expect(Number.isSafeInteger(huge)).toBe(false);
  });

  it('da lo mismo que el patrón que repetían los formularios', () => {
    for (const text of ['1.234', '$ 99', '', 'x', '007']) {
      const digits = text.replace(/[^0-9]/g, '');
      expect(parseDigitsInput(text)).toBe(digits ? Number(digits) : 0);
    }
  });

  it('se exportan desde el dominio', () => {
    expect(domain.extractDigits).toBe(extractDigits);
    expect(domain.parseDigitsInput).toBe(parseDigitsInput);
  });
});
