/**
 * Shared drawing helpers for the ink-wash look (GDD Section 9).
 *
 * All visuals are procedural Canvas 2D -- there are no bitmap assets, which is
 * a byte-budget requirement, not just a style choice. The concept art in
 * docs/reference/ is painterly and deliberately NOT replicated here; what we
 * take from it is mood, line weight and palette.
 *
 * Shape and line parameters live in config.js (INK) so the look can be tuned
 * centrally as more reference is folded in.
 */
import { INK } from './config.js';

// --- Colour utilities -------------------------------------------------------

/** Parse '#rrggbb' into [r, g, b]. */
export function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb(r, g, b) {
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}

/**
 * Blend two hex colours. `t` of 0 gives `a`, 1 gives `b`.
 * This is how colour restoration works (GDD Section 7): world elements are
 * drawn as a blend between their gray and their latent hue, driven by how much
 * colour has been returned.
 */
export function mixColor(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return rgb(
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t
  );
}

// --- Hand-drawn line quality ------------------------------------------------

/**
 * Deterministic pseudo-random in [-1, 1], seeded by an integer.
 * Deterministic so a given edge wobbles consistently within a jitter tick
 * instead of shimmering every frame.
 */
function noise(seed) {
  const n = Math.sin(seed * 127.1) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Current jitter tick. Advanced by the clock so outlines resettle a few times a
 * second, which reads as a restless ink line rather than static vector art.
 */
let jitterTick = 0;

export function updateJitter(elapsed) {
  jitterTick = Math.floor(elapsed / INK.jitterRate);
}

/** Wobble offset for a point identified by `seed`. */
export function wobble(seed) {
  return noise(seed + jitterTick * 31.7) * INK.jitter;
}

/**
 * Stroke a rectangle with a hand-drawn feel: each corner is nudged
 * independently, so edges bow slightly and corners never quite meet.
 */
export function inkRect(ctx, x, y, w, h, seed) {
  const s = seed * 7;
  ctx.beginPath();
  ctx.moveTo(x + wobble(s), y + wobble(s + 1));
  ctx.lineTo(x + w + wobble(s + 2), y + wobble(s + 3));
  ctx.lineTo(x + w + wobble(s + 4), y + h + wobble(s + 5));
  ctx.lineTo(x + wobble(s + 6), y + h + wobble(s + 7));
  ctx.closePath();
}

/**
 * Ink spatter along a horizontal edge -- the flecks that sell the wash look.
 * Cheap: a handful of dots of varying size, positioned deterministically.
 */
export function inkSpatter(ctx, x, y, w, seed) {
  for (let i = 0; i < INK.spatter; i++) {
    const t = (i + 1) / (INK.spatter + 1);
    const px = x + w * t + noise(seed + i * 3.3) * w * 0.3;
    const py = y + noise(seed + i * 7.1) * 6;
    const r = 0.8 + Math.abs(noise(seed + i * 11.9)) * 1.8;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Rounded-rect path, used for terrain bodies and HUD panels. */
export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// --- Colour glyphs (GDD Section 10) -----------------------------------------
/**
 * A distinct shape per hit-colour, drawn on every core and every ability
 * effect.
 *
 * This is the half of the accessibility story that palettes cannot cover: a
 * player who cannot distinguish two hues, or who has disabled colour
 * distinction entirely, still needs to read a core. Shape is independent of
 * hue, so it works in every palette mode and in edge cases none of them fit.
 *
 * The six shapes are chosen to stay distinguishable at small size, which rules
 * out a family of regular polygons -- a pentagon, hexagon and octagon are one
 * blurry circle at 8px. Opposed pairs (triangle up/down, plus/cross) read far
 * more reliably.
 *
 * Index order matches HIT_COLORS: red, green, blue, orange, purple, cyan.
 */
export function drawGlyph(ctx, index, size) {
  ctx.beginPath();

  switch (index) {
    case 0: // red -- triangle, pointing up
      polygon(ctx, 3, size, -Math.PI / 2);
      break;
    case 1: // green -- square
      polygon(ctx, 4, size, Math.PI / 4);
      break;
    case 2: // blue -- circle
      ctx.arc(0, 0, size * 0.82, 0, Math.PI * 2);
      break;
    case 3: // orange -- triangle, pointing down
      polygon(ctx, 3, size, Math.PI / 2);
      break;
    case 4: // purple -- plus
      bar(ctx, size, size * 0.36);
      break;
    default: // cyan -- diagonal cross
      ctx.save();
      ctx.rotate(Math.PI / 4);
      bar(ctx, size, size * 0.36);
      ctx.restore();
      break;
  }
}

/** Regular polygon path centred on the origin. */
function polygon(ctx, sides, radius, rotation) {
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Two crossed bars, forming a plus. Rotated 45 degrees it becomes an X. */
function bar(ctx, size, thickness) {
  ctx.rect(-size, -thickness, size * 2, thickness * 2);
  ctx.rect(-thickness, -size, thickness * 2, size * 2);
}
