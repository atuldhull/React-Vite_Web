/* global Buffer, console */
/**
 * Generate valid PWA icon PNGs.
 *
 * The shipped icons in frontend/public/icons/ were 70-byte stubs,
 * triggering a "Download error or resource isn't a valid image"
 * warning in the browser console on every page load.
 *
 * This script produces real, standards-compliant PNGs using only
 * the zlib + crypto Node built-ins — no image library dep.
 *
 * Output:
 *   frontend/public/icons/icon-192.png  (192×192)
 *   frontend/public/icons/icon-512.png  (512×512)
 *   public/app/icons/icon-192.png       (mirrored for the built SPA)
 *   public/app/icons/icon-512.png
 *
 * Design: the theme purple (#7c3aed) as a solid fill with a
 * Math-Collective-style "Σ" glyph rasterised from a 7×9 pixel
 * block font, centered and scaled to ~60% of the canvas.
 *
 * Run:  node scripts/generate-pwa-icons.mjs
 */

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Theme colours — primary purple for the fill, soft white for the glyph.
const BG = [0x7c, 0x3a, 0xed]; // #7c3aed
const FG = [0xff, 0xff, 0xff];

// Bitmap font for "Σ" — 7 columns × 9 rows.
// 1 = foreground pixel, 0 = background. Chosen for visual balance at
// tiny sizes; easy to read as a sigma at 24px+.
const SIGMA_BITMAP = [
  "1111111",
  "1000001",
  "0100000",
  "0010000",
  "0001000",
  "0010000",
  "0100000",
  "1000001",
  "1111111",
];

// ────────────────────────────────────────────────────────────
// Minimal PNG encoder — IHDR + IDAT + IEND
// ────────────────────────────────────────────────────────────

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;

  // Scale bitmap to ~60% of canvas, centered.
  const glyphPx = Math.floor(size * 0.6);
  const cellW = glyphPx / 7;
  const cellH = glyphPx / 9;
  const glyphW = cellW * 7;
  const glyphH = cellH * 9;
  const glyphX0 = (size - glyphW) / 2;
  const glyphY0 = (size - glyphH) / 2;

  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter type — None
    for (let x = 0; x < size; x++) {
      let rgb = BG;
      const relX = x - glyphX0;
      const relY = y - glyphY0;
      if (relX >= 0 && relX < glyphW && relY >= 0 && relY < glyphH) {
        const col = Math.min(6, Math.floor(relX / cellW));
        const row = Math.min(8, Math.floor(relY / cellH));
        if (SIGMA_BITMAP[row][col] === "1") rgb = FG;
      }
      raw[o++] = rgb[0];
      raw[o++] = rgb[1];
      raw[o++] = rgb[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type — RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);

  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ────────────────────────────────────────────────────────────
// Write to all four locations
// ────────────────────────────────────────────────────────────

function write(p, buf) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
  console.log(`  ✓ ${p.replace(ROOT + "\\", "").replace(ROOT + "/", "")}  (${buf.length} bytes)`);
}

console.log("Generating PWA icons…");
const p192 = makePng(192);
const p512 = makePng(512);

write(resolve(ROOT, "frontend/public/icons/icon-192.png"), p192);
write(resolve(ROOT, "frontend/public/icons/icon-512.png"), p512);
write(resolve(ROOT, "public/app/icons/icon-192.png"), p192);
write(resolve(ROOT, "public/app/icons/icon-512.png"), p512);

console.log("Done.");
