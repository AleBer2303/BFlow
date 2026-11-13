import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_CHARACTERS,
  describeUnmetPasswordRule,
  evaluatePasswordPolicy,
  isPasswordPolicyMet,
} from '../passwordPolicy';

function unmetRules(password: string): string[] {
  return evaluatePasswordPolicy(password)
    .filter((rule) => !rule.isMet)
    .map((rule) => rule.id);
}

describe('passwordPolicy', () => {
  it('accepts a password that meets every rule', () => {
    expect(isPasswordPolicyMet('Presupuesto2026!')).toBe(true);
    expect(unmetRules('Presupuesto2026!')).toEqual([]);
    expect(describeUnmetPasswordRule('Presupuesto2026!')).toBeNull();
  });

  it('lists the six rules in a fixed order, each with its label', () => {
    expect(evaluatePasswordPolicy('').map((rule) => rule.id)).toEqual([
      'length',
      'uppercase',
      'lowercase',
      'digit',
      'special',
      'edgeSpaces',
    ]);
    expect(evaluatePasswordPolicy('').every((rule) => rule.label.length > 0)).toBe(true);
    expect(unmetRules('')).toHaveLength(6);
  });

  it.each([
    ['Corta1!', 'length'],
    ['presupuesto2026!', 'uppercase'],
    ['PRESUPUESTO2026!', 'lowercase'],
    ['Presupuesto!', 'digit'],
    ['Presupuesto2026', 'special'],
    [' Presupuesto2026!', 'edgeSpaces'],
    ['Presupuesto2026! ', 'edgeSpaces'],
  ])('rejects %p for the %s rule only', (password, ruleId) => {
    expect(unmetRules(password)).toEqual([ruleId]);
    expect(isPasswordPolicyMet(password)).toBe(false);
  });

  it('holds the length between the minimum and the maximum', () => {
    const base = 'Aa1!';
    const atMinimum = base + 'x'.repeat(PASSWORD_MIN_LENGTH - base.length);
    const atMaximum = base + 'x'.repeat(PASSWORD_MAX_LENGTH - base.length);

    expect(isPasswordPolicyMet(atMinimum)).toBe(true);
    expect(isPasswordPolicyMet(atMinimum.slice(0, -1))).toBe(false);
    expect(isPasswordPolicyMet(atMaximum)).toBe(true);
    expect(unmetRules(`${atMaximum}x`)).toEqual(['length']);
  });

  it('accepts exactly the 28 characters Firebase counts as non-alphanumeric', () => {
    expect(PASSWORD_SPECIAL_CHARACTERS).toHaveLength(28);
    expect(new Set(PASSWORD_SPECIAL_CHARACTERS).size).toBe(28);
    for (const character of PASSWORD_SPECIAL_CHARACTERS) {
      expect(unmetRules(`Presupuesto2026${character}`)).toEqual([]);
    }
  });

  it.each(['+', '-', '=', '`'])(
    'does not count %p, which Firebase would reject as the only special character',
    (character) => {
      expect(unmetRules(`Presupuesto2026${character}`)).toEqual(['special']);
    }
  );

  it('does not count a space or an accented letter as a special character', () => {
    expect(unmetRules('Presupuesto 2026')).toEqual(['special']);
    expect(unmetRules('Presupuestó2026')).toEqual(['special']);
  });

  it('allows spaces inside the password', () => {
    expect(isPasswordPolicyMet('Mi Presupuesto 2026!')).toBe(true);
  });

  it('names the first rule the password breaks', () => {
    expect(describeUnmetPasswordRule('abc')).toBe(
      'La contraseña no cumple este requisito: mínimo 8 caracteres (máximo 128).'
    );
    expect(describeUnmetPasswordRule('presupuesto2026!')).toBe(
      'La contraseña no cumple este requisito: una letra mayúscula.'
    );
  });
});
