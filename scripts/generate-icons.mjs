import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

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
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color: RGBA
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

const CANVAS = 512;
const CENTER = CANVAS / 2;
const TILT = -34;
const SS = 4; // supermuestreo por eje (4 × 4 muestras por píxel)

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const ramp = (from, to) => {
  const a = hex(from);
  const b = hex(to);
  return (t) => {
    const k = Math.min(1, Math.max(0, t));
    return [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
  };
};

const BG = ramp('#18211c', '#080b09');
const GLOW = '#c6f24e';
const BAR = ramp('#f6faf5', '#c3d1c6');
const PLATE = ramp('#dcff80', '#a3d92c');
const PLATE_EDGE = ramp('#b7e847', '#84b41f');

const DUMBBELL = [
  { x: 0, y: 0, w: 300, h: 30, r: 15, fill: BAR },
  { x: -80, y: 0, w: 40, h: 136, r: 17, fill: PLATE },
  { x: 80, y: 0, w: 40, h: 136, r: 17, fill: PLATE },
  { x: -134, y: 0, w: 54, h: 202, r: 22, fill: PLATE },
  { x: 134, y: 0, w: 54, h: 202, r: 22, fill: PLATE },
];

function roundRectDistance(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function blurAlpha(mask, width, height, radius, passes = 3) {
  if (radius < 1) return mask;
  let src = mask;
  let dst = new Float32Array(mask.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))];
      const norm = 1 / (radius * 2 + 1);
      for (let x = 0; x < width; x++) {
        dst[row + x] = sum * norm;
        sum -= src[row + Math.min(width - 1, Math.max(0, x - radius))];
        sum += src[row + Math.min(width - 1, Math.max(0, x + radius + 1))];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += dst[Math.min(height - 1, Math.max(0, y)) * width + x];
      const norm = 1 / (radius * 2 + 1);
      for (let y = 0; y < height; y++) {
        src[y * width + x] = sum * norm;
        sum -= dst[Math.min(height - 1, Math.max(0, y - radius)) * width + x];
        sum += dst[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x];
      }
    }
  }
  return src;
}

function rotate(px, py, degrees) {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [px * cos - py * sin, px * sin + py * cos];
}

const gradientT = (localY, height) => (localY + height / 2) / height;

function renderIcon(size, { rounded, contentScale = 1 }) {
  const scale = (size * SS) / CANVAS;
  const hi = size * SS;
  const hiBuf = new Float32Array(hi * hi * 4);
  const cornerRadius = rounded ? 112 : 0;
  const extent = contentScale;

  const shadowMask = new Float32Array(hi * hi);
  for (let y = 0; y < hi; y++) {
    const py = (y + 0.5) / scale;
    for (let x = 0; x < hi; x++) {
      const px = (x + 0.5) / scale;
      const [lx, ly] = rotate((px - CENTER) / extent, (py - CENTER) / extent, -TILT);
      for (const shape of DUMBBELL) {
        if (
          roundRectDistance(lx, ly, shape.x, shape.y, shape.w / 2, shape.h / 2, shape.r) <= 0
        ) {
          shadowMask[y * hi + x] = 1;
          break;
        }
      }
    }
  }
  const shadow = blurAlpha(shadowMask, hi, hi, Math.round(9 * scale));
  const shadowDX = Math.round(7 * scale);
  const shadowDY = Math.round(16 * scale);

  for (let y = 0; y < hi; y++) {
    const py = (y + 0.5) / scale;
    for (let x = 0; x < hi; x++) {
      const px = (x + 0.5) / scale;
      const i = (y * hi + x) * 4;

      const bgDist = roundRectDistance(
        px,
        py,
        CENTER,
        CENTER,
        CENTER,
        CENTER,
        cornerRadius,
      );
      if (bgDist > 0) continue;
      const bgT = Math.min(1, Math.max(0, (py / CANVAS) * 0.75 + (px / CANVAS) * 0.25 + 0.08));
      const [br, bg, bb] = BG(bgT);

      const gx = (px - CENTER) / (CANVAS * 0.62);
      const gy = (py - CENTER * 0.92) / (CANVAS * 0.62);
      const glow = Math.max(0, 1 - (gx * gx + gy * gy));
      const glowK = 0.13 * glow * glow;
      const [lr, lg, lb] = hex(GLOW);
      let r = br + (lr - br) * glowK;
      let g = bg + (lg - bg) * glowK;
      let b = bb + (lb - bb) * glowK;

      if (cornerRadius > 0 && bgDist > -2.5) {
        r += (lr - r) * 0.09;
        g += (lg - g) * 0.09;
        b += (lb - b) * 0.09;
      }

      const sxp = x - shadowDX;
      const syp = y - shadowDY;
      if (sxp >= 0 && syp >= 0 && sxp < hi && syp < hi) {
        const sa = shadow[syp * hi + sxp] * 0.5;
        if (sa > 0) {
          r += (6 - r) * sa;
          g += (10 - g) * sa;
          b += (8 - b) * sa;
        }
      }

      const [lx, ly] = rotate(
        (px - CENTER) / extent,
        (py - CENTER) / extent,
        -TILT,
      );
      for (const shape of DUMBBELL) {
        const d = roundRectDistance(
          lx,
          ly,
          shape.x,
          shape.y,
          shape.w / 2,
          shape.h / 2,
          shape.r,
        );
        if (d > 0) continue;
        const [sr, sg, sb] = shape.fill(gradientT(ly - shape.y, shape.h));
        r = sr;
        g = sg;
        b = sb;

        if (shape.fill !== BAR && d > -5) {
          const [er, eg, eb] = PLATE_EDGE(gradientT(ly - shape.y, shape.h));
          const k = ((d + 5) / 5) * 0.5;
          r += (er - r) * k;
          g += (eg - g) * k;
          b += (eb - b) * k;
        }
      }

      hiBuf[i] = r;
      hiBuf[i + 1] = g;
      hiBuf[i + 2] = b;
      hiBuf[i + 3] = 255;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const samples = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * hi + (x * SS + sx)) * 4;
          r += hiBuf[i];
          g += hiBuf[i + 1];
          b += hiBuf[i + 2];
          a += hiBuf[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / samples);
      out[o + 1] = Math.round(g / samples);
      out[o + 2] = Math.round(b / samples);
      out[o + 3] = Math.round(a / samples);
    }
  }

  return out;
}

function renderSVG() {
  const rect = (s) =>
    `<rect x="${s.x - s.w / 2}" y="${s.y - s.h / 2}" width="${s.w}" height="${s.h}" rx="${s.r}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#18211c"/>
      <stop offset="1" stop-color="#080b09"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#c6f24e" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#c6f24e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6faf5"/>
      <stop offset="1" stop-color="#c3d1c6"/>
    </linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dcff80"/>
      <stop offset="1" stop-color="#a3d92c"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect width="512" height="512" rx="112" fill="url(#glow)"/>
  <g transform="rotate(${TILT} 256 256)">
    <g transform="translate(256 256)">
      <g fill="url(#bar)">${rect(DUMBBELL[0])}</g>
      <g fill="url(#plate)">${DUMBBELL.slice(1).map(rect).join('')}</g>
    </g>
  </g>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  ['icon-maskable-512.png', 512, { rounded: false, contentScale: 0.8 }],
];

for (const [name, size, options] of targets) {
  const rgba = renderIcon(size, options);
  writeFileSync(join(OUT_DIR, name), encodePNG(size, size, rgba));
  console.log(`✓ public/icons/${name}`);
}

writeFileSync(join(OUT_DIR, 'icon.svg'), renderSVG());
console.log('✓ public/icons/icon.svg');
