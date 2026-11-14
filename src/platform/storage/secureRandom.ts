/**
 * src/platform/storage/secureRandom.ts
 *
 * Fuente de aleatoriedad criptográfica del cifrado local (ADR 0027).
 *
 * 1. WebCrypto (`globalThis.crypto.getRandomValues`): navegadores y Node.
 * 2. `expo-crypto`: iOS (`SecRandomCopyBytes`) y Android (`SecureRandom`). Hermes no trae
 *    WebCrypto, así que en nativo esta es la fuente real.
 *
 * Si no hay ninguna, no se genera nada: quien pide bytes recibe un error. Nunca se recurre a
 * `Math.random()` ni al reloj.
 */

export type SecureRandomFill = (target: Uint8Array) => void;

type RandomValuesFn = (target: Uint8Array) => unknown;

export class SecureRandomUnavailableError extends Error {
  constructor(reason = 'no WebCrypto or expo-crypto source is available in this runtime') {
    super(`Secure random generation failed: ${reason}.`);
    this.name = 'SecureRandomUnavailableError';
  }
}

function resolveWebCrypto(): RandomValuesFn | null {
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: RandomValuesFn } }).crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    return (target) => webCrypto.getRandomValues?.(target);
  }
  return null;
}

function resolveExpoCrypto(): RandomValuesFn | null {
  try {
    // Carga perezosa: `expo-crypto` exige su módulo nativo al evaluarse.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoCrypto = require('expo-crypto') as { getRandomValues?: RandomValuesFn };
    return typeof expoCrypto.getRandomValues === 'function' ? expoCrypto.getRandomValues : null;
  } catch {
    return null;
  }
}

/** Devuelve la fuente segura disponible, o `null` si el entorno no tiene ninguna. */
export function resolveSecureRandomFill(): SecureRandomFill | null {
  const getRandomValues = resolveWebCrypto() ?? resolveExpoCrypto();
  if (!getRandomValues) {
    return null;
  }
  return (target) => {
    getRandomValues(target);
  };
}
