/**
 * scripts/optimize-assets.mjs
 *
 * Lossless PNG asset optimizer for BFlow.
 * Re-encodes 24/32-bit PNG scanlines using PNG adaptive filtering
 * (None, Sub, Up, Average, Paeth) and zlib maximum deflate compression.
 * Guarantees 100% bit-for-bit pixel parity while reducing file size.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Precomputed CRC32 table for fast PNG chunk checksum calculation
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function calculateCrc(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function optimizePngFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const initialSize = fileBuffer.length;

  // Validate PNG signature
  const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!fileBuffer.subarray(0, 8).equals(PNG_HEADER)) {
    throw new Error(`File ${filePath} is not a valid PNG`);
  }

  // Parse chunks
  let pos = 8;
  const chunks = [];
  const idatChunks = [];
  let ihdrChunk = null;

  while (pos < fileBuffer.length) {
    const length = fileBuffer.readUInt32BE(pos);
    const type = fileBuffer.toString('ascii', pos + 4, pos + 8);
    const data = fileBuffer.subarray(pos + 8, pos + 8 + length);
    const crc = fileBuffer.readUInt32BE(pos + 8 + length);

    if (type === 'IHDR') {
      ihdrChunk = { length, type, data, crc };
      chunks.push(ihdrChunk);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else {
      chunks.push({ length, type, data, crc });
    }
    pos += 12 + length;
  }

  if (!ihdrChunk || idatChunks.length === 0) {
    throw new Error(`Invalid PNG structure in ${filePath}`);
  }

  const width = ihdrChunk.data.readUInt32BE(0);
  const height = ihdrChunk.data.readUInt32BE(4);
  const bitDepth = ihdrChunk.data[8];
  const colorType = ihdrChunk.data[9];

  let bpp = 3;
  if (colorType === 6) bpp = 4; // RGBA
  else if (colorType === 2) bpp = 3; // RGB
  else if (colorType === 0) bpp = 1; // Grayscale
  else if (colorType === 4) bpp = 2; // Grayscale + Alpha
  else {
    console.info(`Skipping ${filePath}: unsupported color type ${colorType}`);
    return;
  }

  const stride = width * bpp;
  const rawIdat = Buffer.concat(idatChunks);
  const inflated = zlib.inflateSync(rawIdat);

  if (inflated.length !== height * (stride + 1)) {
    console.info(`Skipping ${filePath}: scanlines size mismatch`);
    return;
  }

  // Defilter to extract raw uncompressed pixels
  const rawPixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const lineFilter = inflated[y * (stride + 1)];
    const srcRow = y * (stride + 1) + 1;
    const prevDstRow = (y - 1) * stride;
    const dstRow = y * stride;

    for (let x = 0; x < stride; x++) {
      const cur = inflated[srcRow + x];
      const a = x >= bpp ? rawPixels[dstRow + x - bpp] : 0;
      const b = y > 0 ? rawPixels[prevDstRow + x] : 0;
      const c = y > 0 && x >= bpp ? rawPixels[prevDstRow + x - bpp] : 0;

      let val = cur;
      if (lineFilter === 1) val = (cur + a) & 0xff;
      else if (lineFilter === 2) val = (cur + b) & 0xff;
      else if (lineFilter === 3) val = (cur + Math.floor((a + b) / 2)) & 0xff;
      else if (lineFilter === 4) val = (cur + paethPredictor(a, b, c)) & 0xff;

      rawPixels[dstRow + x] = val;
    }
  }

  // Refilter using optimal adaptive heuristic (minimum absolute sum of differences)
  const refiltered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const dstRow = y * stride;
    const prevDstRow = (y - 1) * stride;

    let bestFilter = 0;
    let bestScore = Infinity;
    let bestLine = Buffer.alloc(stride);

    for (let f = 0; f < 5; f++) {
      const candidate = Buffer.alloc(stride);
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const cur = rawPixels[dstRow + x];
        const a = x >= bpp ? rawPixels[dstRow + x - bpp] : 0;
        const b = y > 0 ? rawPixels[prevDstRow + x] : 0;
        const c = y > 0 && x >= bpp ? rawPixels[prevDstRow + x - bpp] : 0;

        let diff = 0;
        if (f === 0) diff = cur;
        else if (f === 1) diff = (cur - a) & 0xff;
        else if (f === 2) diff = (cur - b) & 0xff;
        else if (f === 3) diff = (cur - Math.floor((a + b) / 2)) & 0xff;
        else if (f === 4) diff = (cur - paethPredictor(a, b, c)) & 0xff;

        candidate[x] = diff;
        score += diff < 128 ? diff : 256 - diff;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = f;
        bestLine = candidate;
      }
    }

    const refilteredOffset = y * (stride + 1);
    refiltered[refilteredOffset] = bestFilter;
    bestLine.copy(refiltered, refilteredOffset + 1);
  }

  const optimizedIdat = zlib.deflateSync(refiltered, { level: 9 });

  // Rebuild PNG buffer
  const outParts = [PNG_HEADER];
  // Write IHDR
  const ihdrHeader = Buffer.alloc(8);
  ihdrHeader.writeUInt32BE(ihdrChunk.length, 0);
  ihdrHeader.write('IHDR', 4, 4, 'ascii');
  const ihdrCrcBuf = Buffer.alloc(4);
  ihdrCrcBuf.writeUInt32BE(ihdrChunk.crc, 0);
  outParts.push(ihdrHeader, ihdrChunk.data, ihdrCrcBuf);

  // Write other metadata chunks before IDAT
  for (const c of chunks) {
    if (c.type !== 'IHDR' && c.type !== 'IEND') {
      const header = Buffer.alloc(8);
      header.writeUInt32BE(c.length, 0);
      header.write(c.type, 4, 4, 'ascii');
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(c.crc, 0);
      outParts.push(header, c.data, crcBuf);
    }
  }

  // Write optimized IDAT
  const idatHeader = Buffer.alloc(8);
  idatHeader.writeUInt32BE(optimizedIdat.length, 0);
  idatHeader.write('IDAT', 4, 4, 'ascii');
  const idatCrcBuf = Buffer.alloc(4);
  const idatTypeAndData = Buffer.concat([Buffer.from('IDAT', 'ascii'), optimizedIdat]);
  idatCrcBuf.writeUInt32BE(calculateCrc(idatTypeAndData), 0);
  outParts.push(idatHeader, optimizedIdat, idatCrcBuf);

  // Write IEND
  const iendData = Buffer.from('IEND', 'ascii');
  const iendHeader = Buffer.alloc(8);
  iendHeader.writeUInt32BE(0, 0);
  iendHeader.write('IEND', 4, 4, 'ascii');
  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(calculateCrc(iendData), 0);
  outParts.push(iendHeader, iendCrcBuf);

  const finalBuffer = Buffer.concat(outParts);
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
