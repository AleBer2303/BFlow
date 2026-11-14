/**
 * src/domain/auth/passwordPolicy.ts
 *
 * Password policy for accounts created in BFlow. Pure and deterministic: the registration
 * form shows each rule as it is met and the auth adapter rejects a password that breaks one.
 * Signing in never applies it, so accounts created before the policy keep working.
 * The reset page hosted by Firebase enforces its own policy, set in the Firebase console
 * (docs/guides/firebase-auth-hardening-guide.md).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRuleId =
  | 'length'
  | 'uppercase'
  | 'lowercase'
  | 'digit'
  | 'special'
  | 'edgeSpaces';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  /** What the rule asks for, as shown in the form. */
  label: string;
  isMet: boolean;
}

/**
 * The characters Firebase Authentication counts as non-alphanumeric in its password policy
 * (firebase.google.com/docs/auth/web/password-auth). Keeping the same set means a password
 * the form accepts is never rejected by Firebase for this rule. `+`, `-` and `=` are not in it.
 */
export const PASSWORD_SPECIAL_CHARACTERS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~';

const SPECIAL_CHARACTER = new RegExp(
  `[${PASSWORD_SPECIAL_CHARACTERS.replace(/[\\\]^-]/g, '\\$&')}]`
);

const PASSWORD_RULES: ReadonlyArray<{
  id: PasswordRuleId;
  label: string;
  isMet: (password: string) => boolean;
}> = [
  {
    id: 'length',
    label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres (máximo ${PASSWORD_MAX_LENGTH})`,
    isMet: (password) =>
      password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
  },
  { id: 'uppercase', label: 'Una letra mayúscula', isMet: (password) => /[A-Z]/.test(password) },
  { id: 'lowercase', label: 'Una letra minúscula', isMet: (password) => /[a-z]/.test(password) },
  { id: 'digit', label: 'Un número', isMet: (password) => /[0-9]/.test(password) },
  {
    id: 'special',
    label: 'Un carácter especial, como ! @ # $ %',
    isMet: (password) => SPECIAL_CHARACTER.test(password),
  },
  {
    id: 'edgeSpaces',
    label: 'Sin espacios al inicio ni al final',
    isMet: (password) => password.length > 0 && password === password.trim(),
  },
];

/** Every rule of the policy, in the order the form lists them. */
export function evaluatePasswordPolicy(password: string): PasswordRuleResult[] {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    isMet: rule.isMet(password),
  }));
}

export function isPasswordPolicyMet(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.isMet(password));
}

/** The message for the first rule the password breaks, or null when it meets them all. */
export function describeUnmetPasswordRule(password: string): string | null {
  const unmet = PASSWORD_RULES.find((rule) => !rule.isMet(password));
  return unmet ? `La contraseña no cumple este requisito: ${unmet.label.toLowerCase()}.` : null;
}
