/**
 * Encode a region of a reference image into a compact text sprite.
 *
 * WHY THIS EXISTS
 *
 * GDD Section 9 forbids bitmap assets, for a byte-budget reason rather than a
 * stylistic one: a PNG is already compressed, so it cannot be squeezed further
 * by the zip and it costs its full size. Everything in the game is therefore
 * drawn procedurally.
 *
 * The title wordmark is the one thing that cannot be: it is hand-made
 * lettering with a specific rainbow treatment, and no amount of Canvas code
 * reproduces it. So it is stored as TEXT instead of as an image -- a grid of
 * one character per pixel, each character indexing a small palette. Text of
 * that shape is enormously repetitive (long runs of the same character), which
 * is exactly what deflate is good at, so it compresses to a fraction of what
 * the equivalent PNG would cost.
 *
 * Only the wordmark is encoded. The rest of the poster -- the unicorn, the
 * grayscale city, the rainbow, the enemy silhouettes -- is composed
 * procedurally in menu.js from renderers the game already has, at nearly no
 * marginal cost. A painterly poster quantised to a handful of colours would
 * also simply look bad; flat lettering survives it.
 *
 * Run via `npm run encode:logo`. Dev-only: the OUTPUT (src/logo.js) ships, but
 * this script does not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SOURCE = 'docs/reference/Portada.png';
const OUTPUT = 'src/logo.js';

/**
 * Region of the source containing the wordmark, as fractions of the image so
 * the numbers survive the source being re-exported at another size.
 */
const CROP = { x: 0.18, y: 0.06, w: 0.66, h: 0.19 };

/** Target width in characters. Height follows the crop's aspect ratio. */
const TARGET_W = 132;

/**
 * Palette size, index 0 reserved for transparent.
 *
 * Six was chosen by measuring, not by taste. The wordmark is flat per letter,
 * so extra clusters buy almost no fidelity but cost real bytes: at this width,
 * 12 colours deflate to 1349 B against 834 B for 6, and the two are hard to
 * tell apart on screen. Spending those ~500 bytes on resolution instead gives
 * visibly cleaner letterforms.
 */
const COLORS = 6;

/** Characters used for pixel indices: 0-9 then a-z. */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

const png = PNG.sync.read(readFileSync(SOURCE));

const cropX = Math.round(CROP.x * png.width);
const cropY = Math.round(CROP.y * png.height);
const cropW = Math.round(CROP.w * png.width);
const cropH = Math.round(CROP.h * png.height);

const targetH = Math.round((TARGET_W * cropH) / cropW);

/** Average the source pixels covered by each target cell (a box downscale). */
function sample(tx, ty) {
  const x0 = cropX + Math.floor((tx * cropW) / TARGET_W);
  const x1 = cropX + Math.floor(((tx + 1) * cropW) / TARGET_W);
  const y0 = cropY + Math.floor((ty * cropH) / targetH);
  const y1 = cropY + Math.floor(((ty + 1) * cropH) / targetH);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let n = 0;

  for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
    for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
      const i = (png.width * y + x) << 2;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      a += png.data[i + 3];
      n++;
    }
  }

  return [r / n, g / n, b / n, a / n];
}

// --- Downscale --------------------------------------------------------------
const pixels = [];
for (let y = 0; y < targetH; y++) {
  for (let x = 0; x < TARGET_W; x++) pixels.push(sample(x, y));
}

// --- Quantise ---------------------------------------------------------------
/**
 * K-means over the opaque pixels. Simple, deterministic enough for a build
 * step, and better than a fixed palette because the wordmark's rainbow needs
 * its clusters spent on hues that actually appear.
 */
function quantise(samples, k) {
  // Seed centroids spread across the sample set rather than at random, so the
  // build is reproducible.
  let centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push(samples[Math.floor((i * samples.length) / k)].slice(0, 3));
  }

  for (let iter = 0; iter < 12; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (const p of samples) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d =
          (p[0] - centroids[c][0]) ** 2 +
          (p[1] - centroids[c][1]) ** 2 +
          (p[2] - centroids[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3]++;
    }
    centroids = centroids.map((c, i) =>
      sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c
    );
  }

  return centroids;
}

/** Below this alpha a pixel is treated as transparent and costs index 0. */
const ALPHA_CUTOFF = 128;

/**
 * Is this pixel part of the poster's grey cloud backdrop rather than the
 * wordmark?
 *
 * The source has no alpha channel -- the logo sits on painted smoke -- so the
 * background has to be keyed out by colour. The rule keeps two things the
 * naive "drop everything grey" test would destroy: the near-black paint splash
 * behind the letters, which IS part of the mark, and the white "eat", which is
 * desaturated but much brighter than any cloud.
 */
function isBackdrop([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max ? (max - min) / max : 0;
  return saturation < 0.18 && max > 55 && max < 225;
}

const transparent = pixels.map((p) => p[3] < ALPHA_CUTOFF || isBackdrop(p));
const opaque = pixels.filter((p, i) => !transparent[i]);
const centroids = quantise(opaque, COLORS - 1);

function nearest(p) {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const d =
      (p[0] - centroids[c][0]) ** 2 +
      (p[1] - centroids[c][1]) ** 2 +
      (p[2] - centroids[c][2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best + 1; // index 0 is transparent
}

let encoded = '';
for (let i = 0; i < pixels.length; i++) {
  encoded += transparent[i] ? DIGITS[0] : DIGITS[nearest(pixels[i])];
}

const hex = centroids.map(
  (c) =>
    '#' +
    c
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')
);

// --- Emit -------------------------------------------------------------------
const out = `/**
 * The RGBeat title wordmark, stored as text rather than as an image.
 *
 * GENERATED FILE -- do not edit by hand. Regenerate with \`npm run encode:logo\`
 * after changing docs/reference/Portada.png or the crop in tools/encode-logo.mjs.
 *
 * One character per pixel, each indexing PALETTE below; '0' is transparent.
 * Stored this way because a PNG is already compressed and would cost its full
 * size in the zip, whereas this grid is highly repetitive and deflates well.
 * See tools/encode-logo.mjs for the full reasoning.
 */

export const W = ${TARGET_W};
export const H = ${targetH};

/** Index 0 is transparent, so this list starts at index 1. */
export const PALETTE = ${JSON.stringify(hex)};

export const PIXELS =
  '${encoded}';
`;

writeFileSync(OUTPUT, out);

console.log('');
console.log('  source     ' + png.width + 'x' + png.height);
console.log('  crop       ' + cropW + 'x' + cropH + ' at ' + cropX + ',' + cropY);
console.log('  encoded    ' + TARGET_W + 'x' + targetH + ' = ' + encoded.length + ' chars');
console.log('  palette    ' + COLORS + ' (1 transparent + ' + centroids.length + ')');
console.log('  wrote      ' + OUTPUT);
console.log('');
