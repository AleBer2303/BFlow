/**
 * src/platform/storage/storageCipher.ts
 *
 * Synchronous Authenticated Encryption (AES-256-CTR + HMAC-SHA256, Encrypt-then-MAC)
 * for BFlow local persistence across iOS, Android, and Web (ADR 0016).
 *
 * Key derivation (HKDF-SHA256) combines:
 *   1. Application passphrase/pepper (`EXPO_PUBLIC_LOCAL_CIPHER_PEPPER` or built-in vault pepper)
 *   2. A 256-bit generated device/session secret token (`deviceSecretToken` stored in
 *      `expo-secure-store` on iOS Keychain / Android Keystore, or isolated web token store).
 *
 * Ciphertext envelope format:
 *   `enc:v1:<ivHex(32)>:<cipherHex>:<hmacSha256Hex(64)>`
 */

export const ENCRYPTED_PAYLOAD_PREFIX = 'enc:v1:';

const DEFAULT_APPLICATION_PEPPER =
  'BFlow-Sovereign-Vault-Pepper-2026#AES256-HMAC-SHA256';

// ============================================================================
// UTF-8 & Hex Encoding Helpers
// ============================================================================

const HEX_TABLE: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0')
);

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += HEX_TABLE[bytes[i] ?? 0] ?? '00';
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const hi = parseHexNibble(hex.charCodeAt(i));
    const lo = parseHexNibble(hex.charCodeAt(i + 1));
    if (hi < 0 || lo < 0) {
      return null;
    }
    out[i >> 1] = (hi << 4) | lo;
  }
  return out;
}

function parseHexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  if (code >= 65 && code <= 70) return code - 55; // A-F
  return -1;
}

export function utf8ToBytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const encoded = unescape(encodeURIComponent(str));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    out[i] = encoded.charCodeAt(i);
  }
  return out;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let ascii = '';
  for (let i = 0; i < bytes.length; i += 1) {
    ascii += String.fromCharCode(bytes[i] ?? 0);
  }
  return decodeURIComponent(escape(ascii));
}

// ============================================================================
// Random Bytes & 256-bit Secret Token Generation
// ============================================================================

let fallbackCounter = 1;

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const cryptoObj = (
    globalThis as unknown as {
      crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
    }
  ).crypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(out);
    return out;
  }

  // Fallback PRNG mixed with SHA-256 state when WebCrypto is unavailable in Hermes/test
  let offset = 0;
  while (offset < length) {
    fallbackCounter = (fallbackCounter + 1) >>> 0;
    const entropy = `${Date.now()}:${Math.random()}:${Math.random()}:${fallbackCounter}`;
    const digest = sha256(utf8ToBytes(entropy));
    const copyLen = Math.min(digest.length, length - offset);
    out.set(digest.subarray(0, copyLen), offset);
    offset += copyLen;
  }
  return out;
}

export function generateSecretToken256(): string {
  return bytesToHex(randomBytes(32));
}

// ============================================================================
// NIST FIPS 180-4 SHA-256 & FIPS 198-1 HMAC-SHA256
// ============================================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256(message: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const msgLen = message.length;
  const bitLenHi = Math.floor((msgLen * 8) / 0x100000000);
  const bitLenLo = (msgLen * 8) >>> 0;
  const paddedLen = ((msgLen + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(message);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const w16 = w[i - 16] ?? 0;
      const w7 = w[i - 7] ?? 0;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const ki = SHA256_K[i] ?? 0;
      const wi = w[i] ?? 0;
      const temp1 = (h + S1 + ch + ki + wi) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 64;
  const normalizedKey = new Uint8Array(blockSize);
  if (key.length > blockSize) {
    normalizedKey.set(sha256(key));
  } else {
    normalizedKey.set(key);
  }

  const ipad = new Uint8Array(blockSize + data.length);
  const opad = new Uint8Array(blockSize + 32);
  for (let i = 0; i < blockSize; i += 1) {
    const kByte = normalizedKey[i] ?? 0;
    ipad[i] = kByte ^ 0x36;
    opad[i] = kByte ^ 0x5c;
  }
  ipad.set(data, blockSize);
  const innerHash = sha256(ipad);
  opad.set(innerHash, blockSize);
  return sha256(opad);
}

// ============================================================================
// NIST FIPS 197 AES-256 (Block Encryption & CTR Stream Cipher)
// ============================================================================

const AES_SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

const AES_RCON = new Uint8Array([
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40,
]);

function sbox(idx: number): number {
  return AES_SBOX[idx & 0xff] ?? 0;
}

function expandAes256Key(key: Uint8Array): Uint8Array {
  const roundKeys = new Uint8Array(240); // 15 * 16 bytes for AES-256 (14 rounds)
  roundKeys.set(key.subarray(0, 32));

  const temp = new Uint8Array(4);
  let bytesGenerated = 32;
  let rconIdx = 1;

  while (bytesGenerated < 240) {
    for (let i = 0; i < 4; i += 1) {
      temp[i] = roundKeys[bytesGenerated - 4 + i] ?? 0;
    }

    if (bytesGenerated % 32 === 0) {
      const t0 = temp[0] ?? 0;
      const t1 = temp[1] ?? 0;
      const t2 = temp[2] ?? 0;
      const t3 = temp[3] ?? 0;
      temp[0] = sbox(t1) ^ (AES_RCON[rconIdx] ?? 0);
      temp[1] = sbox(t2);
      temp[2] = sbox(t3);
      temp[3] = sbox(t0);
      rconIdx += 1;
    } else if (bytesGenerated % 32 === 16) {
      for (let i = 0; i < 4; i += 1) {
        temp[i] = sbox(temp[i] ?? 0);
      }
    }

    for (let i = 0; i < 4; i += 1) {
      roundKeys[bytesGenerated] = (roundKeys[bytesGenerated - 32] ?? 0) ^ (temp[i] ?? 0);
      bytesGenerated += 1;
    }
  }

  return roundKeys;
}

function gmul2(a: number): number {
  return ((a << 1) ^ ((a & 0x80) !== 0 ? 0x1b : 0x00)) & 0xff;
}

function aes256EncryptBlock(
  inputBlock: Uint8Array,
  roundKeys: Uint8Array,
  outputBlock: Uint8Array
): void {
  const state = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    state[i] = (inputBlock[i] ?? 0) ^ (roundKeys[i] ?? 0);
  }

  for (let round = 1; round <= 14; round += 1) {
    // SubBytes
    for (let i = 0; i < 16; i += 1) {
      state[i] = sbox(state[i] ?? 0);
    }

    // ShiftRows
    const t1 = state[1] ?? 0;
    state[1] = state[5] ?? 0;
    state[5] = state[9] ?? 0;
    state[9] = state[13] ?? 0;
    state[13] = t1;

    const t2 = state[2] ?? 0;
    const t6 = state[6] ?? 0;
    state[2] = state[10] ?? 0;
    state[6] = state[14] ?? 0;
    state[10] = t2;
    state[14] = t6;

    const t3 = state[15] ?? 0;
    state[15] = state[11] ?? 0;
    state[11] = state[7] ?? 0;
    state[7] = state[3] ?? 0;
    state[3] = t3;

    // MixColumns (rounds 1..13)
    if (round < 14) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = state[c] ?? 0;
        const a1 = state[c + 1] ?? 0;
        const a2 = state[c + 2] ?? 0;
        const a3 = state[c + 3] ?? 0;
        const h = a0 ^ a1 ^ a2 ^ a3;

        state[c] = a0 ^ h ^ gmul2(a0 ^ a1);
        state[c + 1] = a1 ^ h ^ gmul2(a1 ^ a2);
        state[c + 2] = a2 ^ h ^ gmul2(a2 ^ a3);
        state[c + 3] = a3 ^ h ^ gmul2(a3 ^ a0);
      }
    }

    // AddRoundKey
    const rkOffset = round * 16;
    for (let i = 0; i < 16; i += 1) {
      state[i] = (state[i] ?? 0) ^ (roundKeys[rkOffset + i] ?? 0);
    }
  }

  outputBlock.set(state);
}

export function aes256CtrTransform(
  input: Uint8Array,
  roundKeys: Uint8Array,
  iv16: Uint8Array
): Uint8Array {
  const output = new Uint8Array(input.length);
  const counterBlock = new Uint8Array(16);
  counterBlock.set(iv16.subarray(0, 16));
  const keystreamBlock = new Uint8Array(16);

  for (let offset = 0; offset < input.length; offset += 16) {
    aes256EncryptBlock(counterBlock, roundKeys, keystreamBlock);
    const chunkLen = Math.min(16, input.length - offset);
    for (let i = 0; i < chunkLen; i += 1) {
      output[offset + i] = (input[offset + i] ?? 0) ^ (keystreamBlock[i] ?? 0);
    }
    // Increment 128-bit big-endian counter
    for (let c = 15; c >= 0; c -= 1) {
      const nextVal = ((counterBlock[c] ?? 0) + 1) & 0xff;
      counterBlock[c] = nextVal;
      if (nextVal !== 0) {
        break;
      }
    }
  }

  return output;
}

// ============================================================================
// HKDF-SHA256 Key Derivation (Passphrase/Pepper + Generated Secret Token)
// ============================================================================

interface DerivedKeyPair {
  cacheId: string;
  roundKeys: Uint8Array;
  macKey: Uint8Array;
}

let cachedKeyPair: DerivedKeyPair | null = null;

export function resolveApplicationPepper(customPepper?: string): string {
  if (customPepper && customPepper.trim().length > 0) {
    return customPepper.trim();
  }
  const envPepper =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_LOCAL_CIPHER_PEPPER
      ? process.env.EXPO_PUBLIC_LOCAL_CIPHER_PEPPER.trim()
      : '';
  return envPepper || DEFAULT_APPLICATION_PEPPER;
}

function getDerivedKeyPair(secretToken: string, customPepper?: string): DerivedKeyPair {
  const pepper = resolveApplicationPepper(customPepper);
  const cacheId = `${pepper}::${secretToken}`;
  if (cachedKeyPair && cachedKeyPair.cacheId === cacheId) {
    return cachedKeyPair;
  }

  const prk = hmacSha256(utf8ToBytes(pepper), utf8ToBytes(secretToken));
  const encKey = hmacSha256(prk, utf8ToBytes('bflow-aes256-enc-v1'));
  const macKey = hmacSha256(prk, utf8ToBytes('bflow-hmac-sha256-v1'));

  cachedKeyPair = {
    cacheId,
    roundKeys: expandAes256Key(encKey),
    macKey,
  };
  return cachedKeyPair;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================================
// Public Encrypt / Decrypt Envelope API
// ============================================================================

export function isEncryptedStoragePayload(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PAYLOAD_PREFIX);
}

export function encryptStorageValue(
  plainText: string,
  secretToken: string,
  customPepper?: string
): string {
  const { roundKeys, macKey } = getDerivedKeyPair(secretToken, customPepper);
  const iv = randomBytes(16);
  const plainBytes = utf8ToBytes(plainText);
  const cipherBytes = aes256CtrTransform(plainBytes, roundKeys, iv);

  const ivHex = bytesToHex(iv);
  const cipherHex = bytesToHex(cipherBytes);
  const authenticatedPayload = `${ENCRYPTED_PAYLOAD_PREFIX}${ivHex}:${cipherHex}`;
  const macHex = bytesToHex(hmacSha256(macKey, utf8ToBytes(authenticatedPayload)));

  return `${authenticatedPayload}:${macHex}`;
}

export function decryptStorageValue(
  storedValue: string,
  secretToken: string,
  customPepper?: string
): string | null {
  if (!isEncryptedStoragePayload(storedValue)) {
    return null;
  }

  const body = storedValue.slice(ENCRYPTED_PAYLOAD_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const ivHex = parts[0] ?? '';
  const cipherHex = parts[1] ?? '';
  const macHex = parts[2] ?? '';
  if (ivHex.length !== 32 || macHex.length !== 64) {
    return null;
  }

  const { roundKeys, macKey } = getDerivedKeyPair(secretToken, customPepper);
  const authenticatedPayload = `${ENCRYPTED_PAYLOAD_PREFIX}${ivHex}:${cipherHex}`;
  const expectedMacHex = bytesToHex(hmacSha256(macKey, utf8ToBytes(authenticatedPayload)));

  if (!timingSafeEqualHex(macHex.toLowerCase(), expectedMacHex)) {
    return null;
  }

  const iv = hexToBytes(ivHex);
  const cipherBytes = hexToBytes(cipherHex);
  if (!iv || !cipherBytes) {
    return null;
  }

  try {
    const plainBytes = aes256CtrTransform(cipherBytes, roundKeys, iv);
    return bytesToUtf8(plainBytes);
  } catch {
    return null;
  }
}
