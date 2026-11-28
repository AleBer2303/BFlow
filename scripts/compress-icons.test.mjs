/**
 * Tests de `compress-icons.mjs` y `png-codec.mjs` (AUD-07, plan consolidado Fase 5).
 *
 *   node --test scripts/compress-icons.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  compressPngBuffer,
  DEFAULT_ICON_FILES,
  isAlreadyCompressed,
  nearLosslessAverage,
} from './compress-icons.mjs';
import {
  decodePng,
  encodePngFromFiltered,
  filterScanlinesAdaptive,
  readChunks,
} from './png-codec.mjs';

const ICON_SIZE_BUDGET_BYTES = 250_000;

/** Degradado radial con ruido determinista, parecido al brillo del icono. */
function syntheticImage(width, height, bpp) {
  const pixels = Buffer.alloc(width * height * bpp);
  let seed = 42;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 7) - 3;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - width / 2, y - height / 2) / (width / 2);
      const glow = Math.max(0, 1 - distance);
      const o = (y * width + x) * bpp;
      pixels[o] = Math.min(255, Math.max(0, Math.round(20 + 80 * glow + noise())));
      pixels[o + 1] = Math.min(255, Math.max(0, Math.round(30 + 150 * glow + noise())));
      pixels[o + 2] = Math.min(255, Math.max(0, Math.round(60 + 190 * glow + noise())));
      if (bpp === 4) pixels[o + 3] = x < width / 4 ? 0 : Math.round(255 * glow);
    }
  }
  return pixels;
}

function losslessPng(width, height, colorType, pixels) {
  const bpp = colorType === 6 ? 4 : 3;
  return encodePngFromFiltered({
    width,
    height,
    colorType,
    filtered: filterScanlinesAdaptive(pixels, width, height, bpp),
    ancillary: [{ type: 'sRGB', data: Buffer.from([0]) }],
  });
}

function maxChannelError(a, b, bpp, { alphaOnly = false } = {}) {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const isAlpha = bpp === 4 && i % 4 === 3;
    if (alphaOnly !== isAlpha) continue;
    max = Math.max(max, Math.abs(a[i] - b[i]));
  }
  return max;
}

test('png-codec: filtrar y codificar es sin pérdida (base de optimize-assets)', () => {
  const pixels = syntheticImage(40, 30, 3);
  const decoded = decodePng(losslessPng(40, 30, 2, pixels));

  assert.equal(decoded.width, 40);
  assert.equal(decoded.height, 30);
  assert.equal(decoded.colorType, 2);
  assert.deepEqual(decoded.pixels, pixels);
});

test('RGB: conserva dimensiones y tipo, no se aleja más de delta y pesa menos', () => {
  const pixels = syntheticImage(96, 64, 3);
  const source = losslessPng(96, 64, 2, pixels);

  const result = compressPngBuffer(source, 3);
  const decoded = decodePng(result.output);

  assert.equal(result.skipped, false);
  assert.equal(decoded.width, 96);
  assert.equal(decoded.height, 64);
  assert.equal(decoded.colorType, 2);
  assert.deepEqual(decoded.pixels, result.reconstructed);
  assert.ok(maxChannelError(pixels, decoded.pixels, 3) <= 3);
  assert.equal(result.maxError, maxChannelError(pixels, decoded.pixels, 3));
  assert.ok(result.output.length < source.length, `${result.output.length} >= ${source.length}`);
  // Conserva los bloques de color y añade la marca.
  const types = readChunks(result.output).map((chunk) => chunk.type);
  assert.ok(types.includes('sRGB'));
  assert.ok(isAlreadyCompressed(readChunks(result.output)));
});

test('RGBA: la transparencia queda exacta', () => {
  const pixels = syntheticImage(64, 64, 4);
  const result = compressPngBuffer(losslessPng(64, 64, 6, pixels), 3);
  const decoded = decodePng(result.output);

  assert.equal(decoded.colorType, 6);
  assert.equal(maxChannelError(pixels, decoded.pixels, 4, { alphaOnly: true }), 0);
  assert.ok(maxChannelError(pixels, decoded.pixels, 4) <= 3);
});

test('no recomprime un archivo ya comprimido (el error se acumularía)', () => {
  const once = compressPngBuffer(losslessPng(32, 32, 2, syntheticImage(32, 32, 3)), 3);
  const twice = compressPngBuffer(once.output, 3);

  assert.equal(twice.skipped, true);
});

test('delta 0 es sin pérdida y un delta fuera de rango se rechaza', () => {
  const pixels = syntheticImage(32, 24, 3);
  const decoded = decodePng(losslessPng(32, 24, 2, pixels));

  assert.deepEqual(nearLosslessAverage(decoded, 0).reconstructed, pixels);
  assert.throws(() => nearLosslessAverage(decoded, -1), /delta/);
  assert.throws(() => nearLosslessAverage(decoded, 1.5), /delta/);
});

test('los iconos versionados están comprimidos, miden 1024 × 1024 y pesan menos de 250 KB', () => {
  for (const file of DEFAULT_ICON_FILES) {
    const buffer = fs.readFileSync(file);
    const chunks = readChunks(buffer);
    const ihdr = chunks.find((chunk) => chunk.type === 'IHDR');

    assert.ok(buffer.length < ICON_SIZE_BUDGET_BYTES, `${file}: ${buffer.length} bytes`);
    assert.equal(ihdr.data.readUInt32BE(0), 1024, file);
    assert.equal(ihdr.data.readUInt32BE(4), 1024, file);
    assert.ok(isAlreadyCompressed(chunks), `${file} sin la marca de compress-icons`);
  }
});
