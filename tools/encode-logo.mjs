/**
 * Encode the title wordmark from the reference poster into a compact text
 * sprite.
 *
 * WHY THIS EXISTS
 *
 * GDD Section 9 forbids bitmap assets, for a byte-budget reason rather than a
 * stylistic one: a PNG is already compressed, so it cannot be squeezed further
 * by the zip and it costs its full size. Everything in the game is therefore
 * drawn procedurally.
 *
 * The wordmark is the one exception, because it is hand-made lettering that no
 * amount of Canvas code reproduces. It is stored as TEXT -- one character per
 * pixel, each indexing a tiny palette. That grid is highly repetitive, which is
 * exactly what deflate is good at, so it costs a fraction of the equivalent
 * PNG. Measured: ~610 B in the zip, against 3,197 B as a PNG (4,263 B if
 * base64-inlined, and unable to deflate further).
 *
 * WHAT MAKES IT CHEAP
 *
 * Three things, in order of impact:
 *
 *  1. The black paint splash behind the letters is dropped. It was 37% of the
 *     image -- more than the transparent area -- and its ragged edges are high
 *     entropy, so it was the single most expensive element. On the dark title
 *     screen it is very nearly invisible anyway. Removing it took transparency
 *     from 29% to 63% and cut roughly 220 B.
 *  2. A FIXED four-colour palette, taken from the poster's own letter colours,
 *     instead of k-means. Fewer distinct symbols compress better, and it is
 *     also more faithful: k-means kept spending clusters on gradient
 *     in-betweens and, at low colour counts, merged the green G away entirely.
 *  3. Auto-cropping to the ink. The hand-picked crop carried empty margin that
 *     cost bytes and bought nothing.
 *
 * Run via `npm run encode:logo`. The OUTPUT (src/logo.js) ships; this does not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SOURCE = 'docs/reference/Portada.png';
const OUTPUT = 'src/logo.js';

/**
 * Region containing the wordmark, as fractions of the image so the numbers
 * survive the source being re-exported at another size. Generous on purpose --
 * the auto-crop below tightens it to the actual ink.
 */
const CROP = { x: 0.18, y: 0.06, w: 0.66, h: 0.19 };

/**
 * Target width in characters, before auto-cropping.
 *
 * The logo renders around 660px wide, so this is heavily upscaled and reads as
 * deliberate pixel art. 110 also works and saves ~130 B if the budget ever
 * needs it; 132 keeps the letterforms noticeably cleaner.
 */
const TARGET_W = 132;

/**
 * The wordmark's four colours, taken from the poster rather than derived.
 * Index 0 is transparent, so these occupy indices 1-4.
 */
const PALETTE = ['#e8622a', '#3ea34b', '#1a86e8', '#f2f3f7'];

/** Anything darker than this is the paint splash, not lettering. */
const SPLASH_MAX = 70;

const png = PNG.sync.read(readFileSync(SOURCE));

const cropX = Math.round(CROP.x * png.width);
const cropY = Math.round(CROP.y * png.height);
const cropW = Math.round(CROP.w * png.width);
const cropH = Math.round(CROP.h * png.height);

let width = TARGET_W;
let height = Math.round((TARGET_W * cropH) / cropW);

/** Average the source pixels covered by each target cell (a box downscale). */
function sample(tx, ty) {
  const x0 = cropX + Math.floor((tx * cropW) / width);
  const x1 = cropX + Math.floor(((tx + 1) * cropW) / width);
  const y0 = cropY + Math.floor((ty * cropH) / height);
  const y1 = cropY + Math.floor(((ty + 1) * cropH) / height);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
    for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
      const i = (png.width * y + x) << 2;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n++;
    }
  }

  return [r / n, g / n, b / n];
}

let pixels = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) pixels.push(sample(x, y));
}

/**
 * Is this pixel background rather than lettering?
 *
 * Two kinds. The poster has no alpha channel, so the grey painted smoke has to
 * be keyed out by colour; and the black splash is dropped as described above.
 * The rule deliberately keeps the white "eat", which is desaturated like the
 * smoke but far brighter than any of it.
 */
function isBackground([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max ? (max - min) / max : 0;
  if (saturation < 0.18 && max > 55 && max < 225) return true;
  return max < SPLASH_MAX;
}

let transparent = pixels.map(isBackground);

// --- Auto-crop to the ink ---------------------------------------------------
let minX = width;
let maxX = -1;
let minY = height;
let maxY = -1;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (transparent[y * width + x]) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

const croppedPixels = [];
const croppedTransparent = [];
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    croppedPixels.push(pixels[y * width + x]);
    croppedTransparent.push(transparent[y * width + x]);
  }
}
pixels = croppedPixels;
transparent = croppedTransparent;
width = maxX - minX + 1;
height = maxY - minY + 1;

// --- Map to the fixed palette -----------------------------------------------
const rgb = PALETTE.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

function nearest(p) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < rgb.length; i++) {
    const d = (p[0] - rgb[i][0]) ** 2 + (p[1] - rgb[i][1]) ** 2 + (p[2] - rgb[i][2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best + 1; // index 0 is transparent
}

let encoded = '';
for (let i = 0; i < pixels.length; i++) {
  encoded += transparent[i] ? '0' : String(nearest(pixels[i]));
}

// --- Emit -------------------------------------------------------------------
writeFileSync(
  OUTPUT,
  `/**
 * The RGBeat title wordmark, stored as text rather than as an image.
 *
 * GENERATED FILE -- do not edit by hand. Regenerate with \`npm run encode:logo\`
 * after changing docs/reference/Portada.png or the settings in
 * tools/encode-logo.mjs, which also explains why this exception to the
 * "everything is procedural" rule exists and what it costs.
 *
 * One character per pixel indexing PALETTE below; '0' is transparent.
 */

export const W = ${width};
export const H = ${height};

/** Index 0 is transparent, so this list starts at index 1. */
export const PALETTE = ${JSON.stringify(PALETTE)};

export const PIXELS =
  '${encoded}';
`
);

const opaque = encoded.length - encoded.split('').filter((c) => c === '0').length;

console.log('');
console.log('  source      ' + png.width + 'x' + png.height);
console.log('  encoded     ' + width + 'x' + height + ' = ' + encoded.length + ' chars');
console.log('  palette     ' + PALETTE.length + ' colours + transparent');
console.log('  ink         ' + ((opaque / encoded.length) * 100).toFixed(0) + '% of the grid');
console.log('  wrote       ' + OUTPUT);
console.log('');
