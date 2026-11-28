/**
 * scripts/png-codec.mjs
 *
 * Lectura y escritura mínima de PNG de 8 bits sin entrelazado, sin dependencias (solo `zlib`).
 * La usan `optimize-assets.mjs` (recompresión sin pérdida) y `compress-icons.mjs` (casi sin pérdida).
 *
 * Tipos de color admitidos al leer: 0 (gris), 2 (RGB), 4 (gris + alfa) y 6 (RGBA).
 */

import zlib from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Bytes por píxel según el tipo de color (solo los admitidos). */
export const BYTES_PER_PIXEL = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Lista de bloques `{ type, data }` de un PNG, validando la firma. */
export function readChunks(fileBuffer) {
  if (!fileBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('No es un PNG válido');
  }
  const chunks = [];
  let pos = 8;
  while (pos < fileBuffer.length) {
    const length = fileBuffer.readUInt32BE(pos);
    const type = fileBuffer.toString('ascii', pos + 4, pos + 8);
    chunks.push({ type, data: fileBuffer.subarray(pos + 8, pos + 8 + length) });
    pos += 12 + length;
  }
  return chunks;
}

export function encodeChunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([header, data, crc]);
}

/** Deshace los filtros de las líneas (devuelve los bytes de píxel sin el byte de filtro). */
export function unfilterScanlines(inflated, width, height, bpp) {
  const stride = width * bpp;
  if (inflated.length !== height * (stride + 1)) {
    throw new Error('El tamaño de las líneas no cuadra con la cabecera');
  }
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const cur = inflated[src + x];
      const a = x >= bpp ? pixels[dst + x - bpp] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[prev + x - bpp] : 0;
      let value = cur;
      if (filter === 1) value = cur + a;
      else if (filter === 2) value = cur + b;
      else if (filter === 3) value = cur + Math.floor((a + b) / 2);
      else if (filter === 4) value = cur + paethPredictor(a, b, c);
      pixels[dst + x] = value & 0xff;
    }
  }
  return pixels;
}

/**
 * Decodifica un PNG admitido.
 * @returns {{ width: number, height: number, colorType: number, bpp: number, pixels: Buffer, chunks: Array<{type: string, data: Buffer}> }}
 */
export function decodePng(fileBuffer) {
  const chunks = readChunks(fileBuffer);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR');
  if (!ihdr) throw new Error('PNG sin IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  const bpp = BYTES_PER_PIXEL[colorType];
  if (bitDepth !== 8 || interlace !== 0 || bpp === undefined) {
    throw new Error(
      `PNG no admitido (profundidad ${bitDepth}, tipo de color ${colorType}, entrelazado ${interlace})`
    );
  }
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const pixels = unfilterScanlines(zlib.inflateSync(idat), width, height, bpp);
  return { width, height, colorType, bpp, pixels, chunks };
}

/** Filtra cada línea con el que deja la menor suma absoluta (heurística de libpng). */
export function filterScanlinesAdaptive(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * (stride + 1));
  const candidate = Buffer.alloc(stride);
  const best = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    const prev = (y - 1) * stride;
    let bestFilter = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f += 1) {
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const cur = raw[row + x];
        const a = x >= bpp ? raw[row + x - bpp] : 0;
        const b = y > 0 ? raw[prev + x] : 0;
        const c = y > 0 && x >= bpp ? raw[prev + x - bpp] : 0;
        let diff = cur;
        if (f === 1) diff = cur - a;
        else if (f === 2) diff = cur - b;
        else if (f === 3) diff = cur - Math.floor((a + b) / 2);
        else if (f === 4) diff = cur - paethPredictor(a, b, c);
        diff &= 0xff;
        candidate[x] = diff;
        score += diff < 128 ? diff : 256 - diff;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = f;
        candidate.copy(best);
      }
    }
    const offset = y * (stride + 1);
    out[offset] = bestFilter;
    best.copy(out, offset + 1);
  }
  return out;
}

/**
 * Arma un PNG a partir de líneas ya filtradas. `ancillary` son los bloques que se conservan
 * entre IHDR e IDAT (sRGB, gAMA, pHYs, tEXt…), en ese orden.
 */
export function encodePngFromFiltered({ width, height, colorType, filtered, ancillary = [] }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = colorType;
  ihdr[10] = 0; // compresión
  ihdr[11] = 0; // método de filtro
  ihdr[12] = 0; // sin entrelazado
  const idat = zlib.deflateSync(filtered, { level: 9, memLevel: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    encodeChunk('IHDR', ihdr),
    ...ancillary.map((chunk) => encodeChunk(chunk.type, chunk.data)),
    encodeChunk('IDAT', idat),
    encodeChunk('IEND', Buffer.alloc(0)),
  ]);
}
