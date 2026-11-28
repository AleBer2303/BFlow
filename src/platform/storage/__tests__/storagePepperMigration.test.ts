/**
 * AUD-04 (plan consolidado, Fase 5; ADR 0027 §2.6): el pepper del cifrado local no es un secreto
 * (Babel incrusta `EXPO_PUBLIC_LOCAL_CIPHER_PEPPER` en el bundle) y ningún build lo ha definido.
 *
 * - El pepper por defecto queda fijado: un sobre cifrado con él por la versión anterior tiene que
 *   seguir descifrándose.
 * - Si un build futuro define otro pepper, lo guardado con el de por defecto se sigue leyendo, lo
 *   nuevo se cifra con el activo y un pepper explícito nunca cae al de por defecto.
 */

import {
  DEFAULT_APPLICATION_PEPPER,
  decryptStorageValue,
  encryptStorageValue,
  resolveApplicationPepper,
} from '../storageCipher';

const TOKEN = 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';
const PLAINTEXT = '{"schemaVersion":2,"monto":45000,"nota":"cifrado con el pepper por defecto"}';
/** Cifrado con el pepper por defecto; descifrado también con el `storageCipher.ts` anterior al cambio. */
const DEFAULT_PEPPER_ENVELOPE =
  'enc:v1:a4e37a2bcf04db553d732c66dd8beb6f:b4d86e168dbca51adeb7ebf624dc5e167068b682cab7b60c9d808fe6f8fafd64126633ce9b35ce49b25b3b162c2584bd06924525dd307cdad848c4e35b2f86a6d0f722e85c366e7760f3335e:8be5878141c1d8d5e25993fe71738e578e22cf9d771dfa9dadc4e27f08c598c3';

const ORIGINAL_PEPPER_ENV = process.env.EXPO_PUBLIC_LOCAL_CIPHER_PEPPER;

function setPepperEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.EXPO_PUBLIC_LOCAL_CIPHER_PEPPER;
  } else {
    process.env.EXPO_PUBLIC_LOCAL_CIPHER_PEPPER = value;
  }
}

afterEach(() => {
  setPepperEnv(ORIGINAL_PEPPER_ENV);
});

describe('pepper por defecto (AUD-04)', () => {
  it('sin variable usa el pepper por defecto y descifra lo guardado con él', () => {
    setPepperEnv(undefined);

    expect(resolveApplicationPepper()).toBe(DEFAULT_APPLICATION_PEPPER);
    expect(decryptStorageValue(DEFAULT_PEPPER_ENVELOPE, TOKEN)).toBe(PLAINTEXT);
  });

  it('una variable vacía o con espacios equivale a no definirla', () => {
    setPepperEnv('   ');

    expect(resolveApplicationPepper()).toBe(DEFAULT_APPLICATION_PEPPER);
  });

  it('el token del dispositivo sigue siendo imprescindible: con el pepper correcto y otro token no descifra', () => {
    setPepperEnv(undefined);

    expect(decryptStorageValue(DEFAULT_PEPPER_ENVELOPE, '0'.repeat(64))).toBeNull();
  });
});

describe('migración a un pepper nuevo (AUD-04)', () => {
  it('un build con otro pepper sigue leyendo lo cifrado con el de por defecto', () => {
    setPepperEnv('pepper-de-un-build-futuro');

    expect(resolveApplicationPepper()).toBe('pepper-de-un-build-futuro');
    expect(decryptStorageValue(DEFAULT_PEPPER_ENVELOPE, TOKEN)).toBe(PLAINTEXT);
  });

  it('lo nuevo se cifra con el pepper activo, no con el de por defecto', () => {
    setPepperEnv('pepper-de-un-build-futuro');

    const rewritten = encryptStorageValue(PLAINTEXT, TOKEN);

    expect(decryptStorageValue(rewritten, TOKEN)).toBe(PLAINTEXT);
    expect(decryptStorageValue(rewritten, TOKEN, DEFAULT_APPLICATION_PEPPER)).toBeNull();
    // Volver al pepper por defecto no da acceso a lo cifrado con el nuevo.
    setPepperEnv(undefined);
    expect(decryptStorageValue(rewritten, TOKEN)).toBeNull();
  });

  it('un pepper explícito nunca cae al de por defecto', () => {
    setPepperEnv(undefined);

    expect(decryptStorageValue(DEFAULT_PEPPER_ENVELOPE, TOKEN, 'otro-pepper')).toBeNull();
  });

  it('un sobre alterado se rechaza con los dos peppers', () => {
    setPepperEnv('pepper-de-un-build-futuro');
    const lastChar = DEFAULT_PEPPER_ENVELOPE.slice(-1);
    const tampered = DEFAULT_PEPPER_ENVELOPE.slice(0, -1) + (lastChar === '0' ? '1' : '0');

    expect(decryptStorageValue(tampered, TOKEN)).toBeNull();
  });

  it('alternar entre los dos peppers no desordena la caché de llaves', () => {
    setPepperEnv('pepper-de-un-build-futuro');
    const rewritten = encryptStorageValue(PLAINTEXT, TOKEN);

    for (let i = 0; i < 3; i += 1) {
      expect(decryptStorageValue(DEFAULT_PEPPER_ENVELOPE, TOKEN)).toBe(PLAINTEXT);
      expect(decryptStorageValue(rewritten, TOKEN)).toBe(PLAINTEXT);
    }
  });
});
