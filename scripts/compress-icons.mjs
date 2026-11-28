/**
 * scripts/compress-icons.mjs
 *
 * Compresión casi sin pérdida de los iconos de la app (AUD-07, plan consolidado Fase 5), sin
 * dependencias. Es la técnica *near-lossless* de JPEG-LS llevada a PNG:
 *
 *   - Cada byte se predice con el filtro *Average* de PNG a partir de los píxeles ya reconstruidos.
 *   - El residuo se redondea a un múltiplo de 2δ + 1, así que ningún canal se aleja más de δ
 *     (por defecto 3/255) del original. El alfa nunca se toca: la transparencia queda exacta.
 *   - Los residuos repetidos comprimen mucho mejor en DEFLATE y, a diferencia de una paleta de
 *     256 colores, los degradados no se parten en escalones.
 *
 * Conserva dimensiones, tipo de color y los bloques sRGB/gAMA/pHYs/cHRM/iCCP, y marca la salida
 * con un `tEXt` para no recomprimir un archivo ya comprimido (el error se acumularía).
 *
 * Uso:
 *   node scripts/compress-icons.mjs                       # assets/icon.png y assets/adaptive-icon.png
 *   node scripts/compress-icons.mjs --dry-run             # solo mide
 *   node scripts/compress-icons.mjs --compare <carpeta>   # además, recortes antes | después (×2)
 *   node scripts/compress-icons.mjs otro.png --delta 2
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  decodePng,
  encodePngFromFiltered,
  filterScanlinesAdaptive,
} from './png-codec.mjs';

export const DEFAULT_ICON_FILES = ['assets/icon.png', 'assets/adaptive-icon.png'];
export const DEFAULT_MAX_CHANNEL_ERROR = 3;
export const COMPRESSED_MARKER = { keyword: 'bflow-compress', text: 'near-lossless-avg' };
const AVERAGE_FILTER = 3;
const KEPT_ANCILLARY = new Set(['sRGB', 'gAMA', 'cHRM', 'iCCP', 'pHYs']);

function markerChunk(delta) {
  return {
    type: 'tEXt',
    data: Buffer.from(`${COMPRESSED_MARKER.keyword}\0${COMPRESSED_MARKER.text};delta=${delta}`, 'latin1'),
  };
}

export function isAlreadyCompressed(chunks) {
  return chunks.some(
    (chunk) =>
      chunk.type === 'tEXt' &&
      chunk.data.toString('latin1').startsWith(`${COMPRESSED_MARKER.keyword}\0`)
  );
}

/** ¿El byte `x` de la línea es alfa? (tipos 4 y 6 llevan el alfa al final de cada píxel). */
function isAlphaByte(colorType, bpp, x) {
  return (colorType === 4 || colorType === 6) && x % bpp === bpp - 1;
}

/**
 * Reconstruye la imagen con error acotado y devuelve las líneas filtradas con *Average*.
 * @returns {{ filtered: Buffer, reconstructed: Buffer, maxError: number, psnr: number }}
 */
export function nearLosslessAverage({ width, height, colorType, bpp, pixels }, delta) {
  if (!Number.isInteger(delta) || delta < 0 || delta > 10) {
    throw new Error(`delta fuera de rango: ${delta}`);
  }
  const step = 2 * delta + 1;
  const stride = width * bpp;
  const reconstructed = Buffer.alloc(height * stride);
  const filtered = Buffer.alloc(height * (stride + 1));
  let maxError = 0;
  let squared = 0;

  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = AVERAGE_FILTER;
    for (let x = 0; x < stride; x += 1) {
      const i = y * stride + x;
      const current = pixels[i];
      const left = x >= bpp ? reconstructed[i - bpp] : 0;
      const up = y > 0 ? reconstructed[i - stride] : 0;
      const predicted = Math.floor((left + up) / 2);

      let value = current;
      if (!isAlphaByte(colorType, bpp, x)) {
        value = predicted + Math.round((current - predicted) / step) * step;
        // Fuera de 0..255 o más lejos que delta (solo pasa al recortar): se guarda exacto.
        if (value < 0 || value > 255 || Math.abs(current - value) > delta) value = current;
      }

      reconstructed[i] = value;
      filtered[y * (stride + 1) + 1 + x] = (value - predicted) & 0xff;
      const error = Math.abs(current - value);
      if (error > maxError) maxError = error;
      squared += error * error;
    }
  }
  const mse = squared / (height * stride);
  return {
    filtered,
    reconstructed,
    maxError,
    psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse),
  };
}

export function compressPngBuffer(fileBuffer, delta = DEFAULT_MAX_CHANNEL_ERROR) {
  const decoded = decodePng(fileBuffer);
  if (isAlreadyCompressed(decoded.chunks)) {
    return { skipped: true, decoded };
  }
  const result = nearLosslessAverage(decoded, delta);
  const ancillary = [
    ...decoded.chunks.filter((chunk) => KEPT_ANCILLARY.has(chunk.type)),
    markerChunk(delta),
  ];
  const output = encodePngFromFiltered({
    width: decoded.width,
    height: decoded.height,
    colorType: decoded.colorType,
    filtered: result.filtered,
    ancillary,
  });
  return { skipped: false, decoded, output, ...result };
}

/** Recortes ampliados ×2, original a la izquierda y comprimido a la derecha. */
function writeComparison(decoded, reconstructed, outDir, baseName) {
  const { width, height, bpp, colorType } = decoded;
  const size = Math.min(200, width, height);
  const regions = {
    centro: [Math.floor((width - size) / 2), Math.floor((height - size) / 2)],
    esquina: [0, height - size],
    brillo: [Math.floor(width * 0.6), Math.floor(height * 0.55)],
  };
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, [rawX, rawY]] of Object.entries(regions)) {
    const x0 = Math.min(rawX, width - size);
    const y0 = Math.min(rawY, height - size);
    const scale = 2;
    const gap = 8;
    const outWidth = size * scale * 2 + gap;
    const outHeight = size * scale;
    const raw = Buffer.alloc(outWidth * outHeight * bpp, 255);
    for (let y = 0; y < outHeight; y += 1) {
      for (let x = 0; x < outWidth; x += 1) {
        const rightStart = size * scale + gap;
        const source = x < size * scale ? decoded.pixels : x >= rightStart ? reconstructed : null;
        if (!source) continue;
        const sx = x0 + Math.floor((x < size * scale ? x : x - rightStart) / scale);
        const sy = y0 + Math.floor(y / scale);
        source.copy(raw, (y * outWidth + x) * bpp, (sy * width + sx) * bpp, (sy * width + sx + 1) * bpp);
      }
    }
    const png = encodePngFromFiltered({
      width: outWidth,
      height: outHeight,
      colorType,
      filtered: filterScanlinesAdaptive(raw, outWidth, outHeight, bpp),
    });
    fs.writeFileSync(path.join(outDir, `${baseName}-${name}.png`), png);
  }
}

function parseArgs(argv) {
  const options = { dryRun: false, compareDir: null, delta: DEFAULT_MAX_CHANNEL_ERROR, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--compare') options.compareDir = argv[++i];
    else if (arg === '--delta') options.delta = Number(argv[++i]);
    else options.files.push(arg);
  }
  if (options.files.length === 0) options.files = DEFAULT_ICON_FILES;
  return options;
}

function main(argv) {
  const { dryRun, compareDir, delta, files } = parseArgs(argv);
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(file));
    const result = compressPngBuffer(source, delta);
    if (result.skipped) {
      console.info(`${file}: ya comprimido con este script, se deja como está (${source.length} bytes).`);
      continue;
    }
    const { width, height } = result.decoded;
    console.info(
      `${file}: ${width}×${height}, ${source.length} → ${result.output.length} bytes ` +
        `(${((1 - result.output.length / source.length) * 100).toFixed(1)} % menos), ` +
        `error máximo ${result.maxError}/255, PSNR ${result.psnr.toFixed(2)} dB` +
        (dryRun ? ' [sin escribir]' : '')
    );
    if (compareDir) {
      writeComparison(result.decoded, result.reconstructed, compareDir, path.parse(file).name);
    }
    if (!dryRun) fs.writeFileSync(path.resolve(file), result.output);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
