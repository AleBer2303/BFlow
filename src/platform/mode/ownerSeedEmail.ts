/**
 * src/platform/mode/ownerSeedEmail.ts
 *
 * Qué cuentas reciben la semilla de octubre de 2026 (ADR 0027).
 *
 * El correo del propietario ya no está escrito en el código: llega por la variable opcional
 * `EXPO_PUBLIC_OWNER_SEED_EMAIL`. Sin ella, ninguna cuenta real es "owner" y todas arrancan
 * con el espacio vacío. Los tests y el modo vitrina usan además una dirección ficticia.
 */

import { isDemoModeEnabled } from './demoMode';

/** Dirección del propietario de vitrina. `.example` es un dominio reservado (RFC 2606). */
export const DEMO_OWNER_SEED_EMAIL = 'demo.owner@bflow.example';

export interface OwnerSeedEmailRuntime {
  configuredEmail?: string;
  isTestRuntime?: boolean;
  isDemoMode?: boolean;
}

/**
 * Correos, en minúsculas, que cuentan como propietario de la semilla.
 * `process.env.EXPO_PUBLIC_*` se lee con acceso estático: es la única forma que Metro sustituye.
 */
export function resolveOwnerSeedEmails(runtime: OwnerSeedEmailRuntime = {}): ReadonlySet<string> {
  const {
    configuredEmail = process.env.EXPO_PUBLIC_OWNER_SEED_EMAIL,
    isTestRuntime = process.env.NODE_ENV === 'test',
    isDemoMode = isDemoModeEnabled(),
  } = runtime;

  const emails = new Set<string>();
  const normalizedEmail = configuredEmail?.trim().toLowerCase() ?? '';
  if (normalizedEmail.includes('@')) {
    emails.add(normalizedEmail);
    // Variante sin arroba que la lista anterior ya aceptaba.
    emails.add(normalizedEmail.replace('@', ''));
  }
  if (isTestRuntime || isDemoMode) {
    emails.add(DEMO_OWNER_SEED_EMAIL);
  }
  return emails;
}
