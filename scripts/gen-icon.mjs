// Generate build/icon.png (1024×1024) — a jade shuriken on a dark rounded tile,
// KubeNinja's shinobi mark. Pure Node (zlib), no image deps. electron-builder
// converts this PNG to .icns / .ico per platform at build time.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const S = 1024;
const CX = S / 2, CY = S / 2;

// palette
const BG = [12, 17, 16];       // #0c1110 dark tile
const BG2 = [8, 11, 10];       // vignette edge
const JADE = [45, 212, 167];   // #2dd4a7
const JADE_D = [20, 120, 95];  // darker jade edge

// rounded-tile mask
const RAD = 200, PAD = 40;
function inTile(x, y) {
  const l = PAD, r = S - PAD, t = PAD, b = S - PAD;
  if (x < l || x > r || y < t || y > b) return false;
  const cx = x < l + RAD ? l + RAD : x > r - RAD ? r - RAD : x;
  const cy = y < t + RAD ? t + RAD : y > b - RAD ? b - RAD : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= RAD ** 2;
}

// 4-point shuriken: 8 vertices alternating outer/inner radius, plus a square hole
const OUTER = 430, INNER = 165;
const pts = [];
for (let k = 0; k < 8; k++) {
  const a = -Math.PI / 2 + k * Math.PI / 4;
  const rr = k % 2 === 0 ? OUTER : INNER;
  pts.push([CX + rr * Math.cos(a), CY + rr * Math.sin(a)]);
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// square hole (rotated 45°) in the centre
function inHole(x, y) { return Math.abs(x - CX) + Math.abs(y - CY) < 95; }

const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4;
    if (!inTile(x, y)) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; continue; }
    // vignette background
    const d = Math.hypot(x - CX, y - CY) / (S / 2);
    let col = BG.map((c, i) => Math.round(c + (BG2[i] - c) * Math.min(1, d)));
    if (inPoly(x, y, pts) && !inHole(x, y)) {
      // jade with a slight radial shade for depth
      const s = Math.min(1, Math.hypot(x - CX, y - CY) / OUTER);
      col = JADE.map((c, i) => Math.round(c + (JADE_D[i] - c) * s * 0.55));
    }
    px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
  }
}

// PNG encode (RGBA, filter 0 per scanline)
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync('build', { recursive: true });
writeFileSync(join('build', 'icon.png'), png);
console.log(`wrote build/icon.png (${S}×${S}, ${(png.length / 1024).toFixed(0)} KB)`);
