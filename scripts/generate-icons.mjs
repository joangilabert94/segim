// Genera los iconos PNG de la PWA sin dependencias (zlib viene de Node).
// Uso: node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

// ---- Codificación PNG ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filtro: ninguno
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Dibujo ----

const BG = [13, 17, 14, 255];
const ACCENT = [198, 242, 78, 255];
const BAR = [233, 240, 235, 255];

function renderIcon(size, { rounded, contentScale = 1 }) {
  const buf = Buffer.alloc(size * size * 4);
  const k = (size / 512) * contentScale;
  const cx = size / 2;
  const cy = size / 2;

  const setPixel = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };

  // Fondo
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) setPixel(x, y, BG);
  }

  // Rectángulo en coordenadas de un lienzo de 512 centrado
  const rect = (x, y, w, h, color) => {
    const x0 = Math.round(cx + (x - 256) * k);
    const y0 = Math.round(cy + (y - 256) * k);
    const x1 = Math.round(cx + (x + w - 256) * k);
    const y1 = Math.round(cy + (y + h - 256) * k);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) setPixel(xx, yy, color);
    }
  };

  // Mancuerna: barra central + 4 discos simétricos
  rect(144, 236, 224, 40, BAR);
  rect(160, 192, 48, 128, ACCENT);
  rect(304, 192, 48, 128, ACCENT);
  rect(96, 152, 48, 208, ACCENT);
  rect(368, 152, 48, 208, ACCENT);

  if (rounded) {
    const r = Math.round(size * 0.2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x < r ? r - x : x > size - 1 - r ? x - (size - 1 - r) : 0;
        const dy = y < r ? r - y : y > size - 1 - r ? y - (size - 1 - r) : 0;
        if (dx > 0 && dy > 0 && Math.sqrt(dx * dx + dy * dy) > r) {
          buf[(y * size + x) * 4 + 3] = 0;
        }
      }
    }
  }

  return buf;
}

// ---- Generación ----

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', renderIcon(192, { rounded: true })],
  ['icon-512.png', renderIcon(512, { rounded: true })],
  ['icon-maskable-512.png', renderIcon(512, { rounded: false, contentScale: 0.72 })],
];

for (const [name, rgba] of targets) {
  const size = name.includes('192') ? 192 : 512;
  writeFileSync(join(OUT_DIR, name), encodePNG(size, size, rgba));
  console.log(`✓ public/icons/${name}`);
}
