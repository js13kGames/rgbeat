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
 * The wordmark's four colours AS THEY APPEAR IN THE POSTER.
 *
 * These are only used to decide which of the four each downscaled pixel
 * belongs to. They are not what gets drawn -- see PALETTE below.
 * Index 0 is transparent, so these occupy indices 1-4.
 */
const SOURCE_COLORS = ['#e8622a', '#3ea34b', '#1a86e8', '#f2f3f7'];

/**
 * The colours actually drawn, in the same order.
 *
 * The poster letters the R in orange, but the title is the game's own colour
 * grammar spelled out: R, G and B are the three primaries the entire combo
 * system is built on. So they take the exact red, green and blue that
 * HIT_COLORS uses in default mode -- the same three swatches shown under the
 * menu -- and only 'eat' keeps the poster's off-white.
 */
const PALETTE = ['#ff2d55', '#2bff88', '#2d8cff', '#f2f3f7'];

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
const rgb = SOURCE_COLORS.map((hex) => [
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

let indices = pixels.map((p, i) => (transparent[i] ? 0 : nearest(p)));

// --- Drop the decorative waveform ------------------------------------------
/**
 * The poster draws a soundwave squiggle trailing off the wordmark. It is not
 * part of the lettering and it is the most expensive thing left in the grid:
 * a wide scatter of isolated pixels in all three letter colours, which is
 * exactly the high-entropy shape deflate cannot do anything with.
 *
 * It is also cleanly separable. Every letter is a compact blob, while the
 * waveform is one long connected streak -- so any component more than three
 * times wider than it is tall is the waveform, not a letter. The rule is a
 * ratio rather than a pixel region so it survives the poster being
 * re-exported at a different size.
 */
function components() {
  const seen = new Uint8Array(width * height);
  const found = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!indices[start] || seen[start]) continue;

      const stack = [[x, y]];
      const pixelsIn = [];
      seen[start] = 1;
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;

      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixelsIn.push(cy * width + cx);
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;

        // 8-connected: the lettering is diagonal in places and would
        // otherwise split into pieces.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (seen[ni] || !indices[ni]) continue;
            seen[ni] = 1;
            stack.push([nx, ny]);
          }
        }
      }

      found.push({ pixels: pixelsIn, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
  }

  return found;
}

let waveformPixels = 0;
for (const c of components()) {
  if (c.w <= c.h * 3) continue;
  for (const i of c.pixels) indices[i] = 0;
  waveformPixels += c.pixels.length;
}

// --- Snap letter edges onto one colour --------------------------------------
/**
 * The box downscale averages source pixels, so a pixel straddling the edge of
 * a letter averages that letter with whatever is behind it and can land
 * nearest to the WRONG entry in the palette. The result is a speckle of green
 * along the R and of blue along the G -- invisible at poster size, obvious
 * when each pixel is drawn ~6x.
 *
 * A majority vote over each pixel's 5x5 neighbourhood puts every speckle back
 * on the letter that surrounds it, without touching a boundary where two
 * letters genuinely meet. Two passes settle it; a third changes nothing.
 */
for (let pass = 0; pass < 2; pass++) {
  const before = indices.slice();
  const sample = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : before[y * width + x];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!before[i]) continue;

      const votes = [0, 0, 0, 0, 0];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) votes[sample(x + dx, y + dy)]++;
      }

      // Transparent neighbours do not get a vote: they would erode thin
      // strokes rather than recolour them.
      let best = before[i];
      for (let c = 1; c <= PALETTE.length; c++) if (votes[c] > votes[best]) best = c;
      indices[i] = best;
    }
  }
}

const encoded = indices.join('');

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
console.log('  waveform    ' + waveformPixels + ' px dropped');
console.log('  wrote       ' + OUTPUT);
console.log('');
