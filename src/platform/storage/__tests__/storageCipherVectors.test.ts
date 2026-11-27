/**
 * OPT-05 / AUD-07 (plan consolidado, Fase 2): `aes256CtrTransform` reutiliza un único `state`
 * de 16 bytes en vez de crear uno por bloque. La salida tiene que ser idéntica byte a byte:
 * - vectores de NIST SP 800-38A, F.5.5 (CTR-AES256.Encrypt);
 * - un texto largo con un contador que desborda los 128 bits, cifrado antes del cambio;
 * - un sobre `enc:v1` generado antes del cambio, que debe seguir descifrándose.
 *
 * Con BFLOW_RENDER_REPORT=1 imprime el tiempo de cifrar 256 KB (PERF_BASELINE.md §20).
 */

import {
  aes256CtrTransform,
  bytesToHex,
  decryptStorageValue,
  encryptStorageValue,
  expandAes256Key,
  hexToBytes,
  sha256,
  utf8ToBytes,
} from '../storageCipher';

const NIST_KEY = '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4';
const NIST_COUNTER = 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';
const NIST_PLAINTEXT =
  '6bc1bee22e409f96e93d7e117393172a' +
  'ae2d8a571e03ac9c9eb76fac45af8e51' +
  '30c81c46a35ce411e5fbc1191a0a52ef' +
  'f69f2445df4f9b17ad2b417be66c3710';
const NIST_CIPHERTEXT =
  '601ec313775789a5b7a7f504bbf3d228' +
  'f443e3ca4d62b59aca84e990cacaf5c5' +
  '2b0930daa23de94ce87017ba2d84988d' +
  'dfc9c58db67aada613c2dd08457941a6';

/** Generated with the implementation before OPT-05 (one `state` per block). */
const LEGACY_LONG_CIPHERTEXT_SHA256 =
  '8460eb8698bef29536fbce163e9dc0e4e4170a3479b01d7ff6070ee4785b5945';
const LEGACY_ENVELOPE =
  'enc:v1:26d2977d5ac0591098bbd03f43b89a8c:28c13621be6e41010713542c3e3acbf59c36ceea36aeb047d23da965e49ea4ee8304861dbd5a30dd36eacd8fd95e83:c579d9f370fe1677bf860a714b835154ec5c7710b9337cb811ddb84f264683b9';
const LEGACY_ENVELOPE_PLAINTEXT = '{"cuenta":"Mercado","monto":120000,"nota":"ñ"}';
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const PEPPER = 'pepper-fixture';

function hex(value: string): Uint8Array {
  const bytes = hexToBytes(value);
  if (!bytes) throw new Error(`invalid hex ${value}`);
  return bytes;
}

describe('aes256CtrTransform (OPT-05)', () => {
  const roundKeys = expandAes256Key(hex(NIST_KEY));

  it('cumple los vectores de NIST SP 800-38A F.5.5', () => {
    const out = aes256CtrTransform(hex(NIST_PLAINTEXT), roundKeys, hex(NIST_COUNTER));
    expect(bytesToHex(out)).toBe(NIST_CIPHERTEXT);
    // CTR is symmetric: the same call decrypts.
    expect(bytesToHex(aes256CtrTransform(out, roundKeys, hex(NIST_COUNTER)))).toBe(NIST_PLAINTEXT);
  });

  it('produce los mismos bytes que antes con un texto largo y un contador que desborda', () => {
    const long = utf8ToBytes('BFlow ñandú 🚀 '.repeat(73) + 'fin');
    expect(long.length).toBe(1390);
    const out = aes256CtrTransform(long, roundKeys, hex('ffffffffffffffffffffffffffffffc0'));
    expect(bytesToHex(sha256(out))).toBe(LEGACY_LONG_CIPHERTEXT_SHA256);
  });

  it('descifra un sobre enc:v1 generado antes del cambio y cifra de forma reversible', () => {
    expect(decryptStorageValue(LEGACY_ENVELOPE, TOKEN, PEPPER)).toBe(LEGACY_ENVELOPE_PLAINTEXT);
    const fresh = encryptStorageValue(LEGACY_ENVELOPE_PLAINTEXT, TOKEN, PEPPER);
    expect(decryptStorageValue(fresh, TOKEN, PEPPER)).toBe(LEGACY_ENVELOPE_PLAINTEXT);
  });

  it('no altera la entrada ni el contador inicial', () => {
    const input = hex(NIST_PLAINTEXT);
    const iv = hex(NIST_COUNTER);
    aes256CtrTransform(input, roundKeys, iv);
    expect(bytesToHex(input)).toBe(NIST_PLAINTEXT);
    expect(bytesToHex(iv)).toBe(NIST_COUNTER);
  });

  it('mide el cifrado de 256 KB', () => {
    const input = new Uint8Array(256 * 1024).map((_, i) => i & 0xff);
    const iv = hex(NIST_COUNTER);
    aes256CtrTransform(input, roundKeys, iv); // warm-up
    const runs = 5;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) aes256CtrTransform(input, roundKeys, iv);
    const avgMs = (performance.now() - start) / runs;
    if (process.env.BFLOW_RENDER_REPORT === '1') {
      process.stdout.write(`\nCIPHER_REPORT_256KB_ms=${avgMs.toFixed(1)}\n`);
    }
    expect(avgMs).toBeGreaterThan(0);
  });
});
