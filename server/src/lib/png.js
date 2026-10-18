import { inflateSync } from 'node:zlib';

/**
 * Minimal PNG decoder (8-bit and 16-bit grey, grey+alpha, RGB, RGBA, and 1-8 bit palette; not interlaced).
 * Used to read dominant colours without a native image library. Returns { width, height, data } with data as RGBA bytes,
 * or null when the file is something we do not decode (interlaced, corrupt). Callers fall back to another route.
 */
export function decodePng(buf) {
  try {
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    let o = 8;
    let ihdr = null;
    let plte = null;
    let trns = null;
    const idat = [];
    while (o + 8 <= buf.length) {
      const len = buf.readUInt32BE(o);
      const type = buf.toString('ascii', o + 4, o + 8);
      const body = buf.subarray(o + 8, o + 8 + len);
      if (type === 'IHDR') ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), depth: body[8], ctype: body[9], interlace: body[12] };
      else if (type === 'PLTE') plte = body;
      else if (type === 'tRNS') trns = body;
      else if (type === 'IDAT') idat.push(body);
      else if (type === 'IEND') break;
      o += 12 + len;
    }
    if (!ihdr || !idat.length || ihdr.interlace !== 0) return null;
    const { w, h, depth, ctype } = ihdr;
    if (w * h > 40_000_000) return null;
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
    if (!channels || ![1, 2, 4, 8, 16].includes(depth)) return null;
    if (ctype === 3 && !plte) return null;
    if (depth === 16 && ctype === 3) return null;

    const bitsPerPixel = channels * depth;
    const bpp = Math.max(1, bitsPerPixel >> 3);
    const stride = Math.ceil((w * bitsPerPixel) / 8);
    const raw = inflateSync(Buffer.concat(idat));
    if (raw.length < (stride + 1) * h) return null;

    const img = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
      const ft = raw[y * (stride + 1)];
      const src = y * (stride + 1) + 1;
      const dst = y * stride;
      for (let i = 0; i < stride; i++) {
        const x = raw[src + i];
        const a = i >= bpp ? img[dst + i - bpp] : 0;
        const b = y > 0 ? img[dst - stride + i] : 0;
        const c = i >= bpp && y > 0 ? img[dst - stride + i - bpp] : 0;
        let v;
        if (ft === 0) v = x;
        else if (ft === 1) v = x + a;
        else if (ft === 2) v = x + b;
        else if (ft === 3) v = x + ((a + b) >> 1);
        else if (ft === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        } else return null;
        img[dst + i] = v & 255;
      }
    }

    const out = Buffer.alloc(w * h * 4);
    const sample = (row, idx) => {
      // idx-th sample in a row, for any bit depth, scaled to 0-255 except for palette indices
      if (depth === 8) return img[row + idx];
      if (depth === 16) return img[row + idx * 2];
      const perByte = 8 / depth;
      const byte = img[row + Math.floor(idx / perByte)];
      const shift = 8 - depth * ((idx % perByte) + 1);
      return (byte >> shift) & ((1 << depth) - 1);
    };
    const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
    for (let y = 0; y < h; y++) {
      const row = y * stride;
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        if (ctype === 3) {
          const pi = sample(row, x);
          out[k] = plte[pi * 3]; out[k + 1] = plte[pi * 3 + 1]; out[k + 2] = plte[pi * 3 + 2];
          out[k + 3] = trns && pi < trns.length ? trns[pi] : 255;
        } else if (ctype === 0 || ctype === 4) {
          const g = Math.round(sample(row, x * channels) * scale);
          out[k] = out[k + 1] = out[k + 2] = g;
          out[k + 3] = ctype === 4 ? sample(row, x * channels + 1) : 255;
        } else {
          out[k] = sample(row, x * channels); out[k + 1] = sample(row, x * channels + 1); out[k + 2] = sample(row, x * channels + 2);
          out[k + 3] = ctype === 6 ? sample(row, x * channels + 3) : 255;
        }
      }
    }
    return { width: w, height: h, data: out };
  } catch {
    return null;
  }
}
