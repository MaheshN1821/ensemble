/**
 * Reads format and display dimensions from a JPEG or PNG buffer without decoding it.
 * We trust file contents, not the client's MIME type. JPEG EXIF orientation 5-8 swaps width and height,
 * because phones often store portrait photos rotated.
 * Returns null when the buffer is not a JPEG or PNG we can read.
 */
export function readImageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return readPng(buf);
  if (buf[0] === 0xff && buf[1] === 0xd8) return readJpeg(buf);
  return null;
}

function readPng(buf) {
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { format: 'png', contentType: 'image/png', width, height };
}

function exifOrientation(buf, start, end) {
  // start points at "Exif\0\0"
  if (buf.toString('ascii', start, start + 4) !== 'Exif') return 1;
  const t = start + 6;
  const le = buf.toString('ascii', t, t + 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (t + 8 > end) return 1;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return 1;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return 1;
}

function readJpeg(buf) {
  let o = 2;
  let orientation = 1;
  while (o + 4 <= buf.length) {
    if (buf[o] !== 0xff) { o++; continue; }
    const marker = buf[o + 1];
    if (marker === 0xff) { o++; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
    const len = buf.readUInt16BE(o + 2);
    if (len < 2) return null;
    if (marker === 0xe1 && o + 4 + 6 <= buf.length) {
      try { orientation = exifOrientation(buf, o + 4, Math.min(o + 2 + len, buf.length)); } catch { /* ignore bad EXIF */ }
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (o + 9 > buf.length) return null;
      let height = buf.readUInt16BE(o + 5);
      let width = buf.readUInt16BE(o + 7);
      if (!width || !height) return null;
      if (orientation >= 5 && orientation <= 8) [width, height] = [height, width];
      return { format: 'jpeg', contentType: 'image/jpeg', width, height };
    }
    o += 2 + len;
  }
  return null;
}
