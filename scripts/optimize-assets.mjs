/**
 * scripts/optimize-assets.mjs
 *
 * Lossless PNG asset optimizer for BFlow.
 * Re-encodes 8-bit PNG scanlines using PNG adaptive filtering
 * (None, Sub, Up, Average, Paeth) and zlib maximum deflate compression.
 * Guarantees 100% bit-for-bit pixel parity while reducing file size.
 * The PNG reading and writing lives in `png-codec.mjs` (shared with `compress-icons.mjs`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePngFromFiltered, filterScanlinesAdaptive } from './png-codec.mjs';

/** Chunks that the encoder writes itself; every other chunk is kept as it was. */
const REWRITTEN_CHUNKS = new Set(['IHDR', 'IDAT', 'IEND']);

function optimizePngFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const initialSize = fileBuffer.length;

  let decoded;
  try {
    decoded = decodePng(fileBuffer);
  } catch (error) {
    console.info(`Skipping ${filePath}: ${error.message}`);
    return;
  }

  const { width, height, colorType, bpp, pixels, chunks } = decoded;
  const finalBuffer = encodePngFromFiltered({
    width,
    height,
    colorType,
    filtered: filterScanlinesAdaptive(pixels, width, height, bpp),
    ancillary: chunks.filter((chunk) => !REWRITTEN_CHUNKS.has(chunk.type)),
  });
  const finalSize = finalBuffer.length;

  if (finalSize < initialSize) {
    fs.writeFileSync(filePath, finalBuffer);
    const saved = initialSize - finalSize;
    const percent = ((saved / initialSize) * 100).toFixed(1);
    console.info(
      `Optimized ${filePath}: ${(initialSize / 1024).toFixed(1)} KB -> ${(finalSize / 1024).toFixed(1)} KB (Saved ${percent}%)`
    );
  } else {
    console.info(`Kept ${filePath}: already optimal (${(initialSize / 1024).toFixed(1)} KB)`);
  }
}

// Execute on assets directory
const assetsDir = path.resolve('assets');
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.png'));
  for (const file of files) {
    optimizePngFile(path.join(assetsDir, file));
  }
}
