/**
 * The world: level geometry, collision, and the grayscale ink-wash renderer
 * (GDD Sections 7 and 9).
 *
 * Colour restoration is modelled here as two independent channels, exactly as
 * Section 7 requires -- they must never blend into one effect:
 *
 *   `ambient`  slow, accumulates a little per enemy kill, deliberately subtle
 *   `boss`     fast, driven by the boss-defeat animation, overrides toward full
 *
 * The rendered amount is max(ambient, boss), so the dramatic beat always wins
 * and the ambient drip can never pre-empt it.
 */
import { palette } from './palette.js';
import { INK } from './config.js';
import { inkRect, inkSpatter, mixColor, roundRect } from './render.js';

/**
 * Level geometry. Solid rectangles the player collides with.
 *
 * Kept as a plain array while the game is being built; it compresses fine in
 * the zip and stays readable. If bytes get tight this becomes a packed string
 * (that is a Phase 8 optimisation, not a design decision).
 */
const LEVEL = {
  width: 3200,
  height: 900,
  /** Y of the death plane; falling past this counts as a hazard (Section 5). */
  killY: 1100,
  spawn: { x: 120, y: 500 },
  /**
   * Every surface here is authored against the jump envelope in config.js:
   * no rise exceeds LEDGE_STEP_MAX and no gap exceeds GAP_MAX, both of which
   * sit well under the theoretical maximum so jumps never feel pixel-perfect.
   * `npm run check:level` verifies this; do not add geometry by eye.
   */
  solids: [
    // Ground, broken by two gaps the player must jump (130 px and 140 px).
    { x: 0, y: 640, w: 600, h: 260 },
    { x: 730, y: 640, w: 550, h: 260 },
    { x: 1420, y: 640, w: 1780, h: 260 },

    // Ledges. Each rises at most ~100 px from the surface below it.
    //
    // Critically, NONE of them sits above the run-up to a pit. A ledge over a
    // gap approach becomes a ceiling that clips the jump arc, which is what
    // turns an ordinary gap into a pixel-perfect one -- the clearance is
    // enforced by `npm run check:level`, not left to judgement.
    { x: 200, y: 548, w: 160, h: 24 }, // +92 from ground

    { x: 900, y: 545, w: 160, h: 24 }, // +95 from ground
    { x: 980, y: 455, w: 140, h: 24 }, // +90

    { x: 1600, y: 545, w: 180, h: 24 }, // +95 from ground
    { x: 1880, y: 455, w: 170, h: 24 }, // +90
    { x: 2200, y: 545, w: 190, h: 24 }, // +95 from ground
    { x: 2470, y: 455, w: 170, h: 24 }, // +90
    { x: 2800, y: 540, w: 180, h: 24 }, // +100 from ground

    // A low wall to break up the silhouette near the level's end. `decor` marks
    // it as an obstacle rather than part of the route, so the reachability
    // check does not demand that the player be able to land on top of it.
    { x: 3040, y: 545, w: 40, h: 95, decor: 1 },
  ],
};

/**
 * Background silhouettes: the stolen-colour city, drawn as flat shapes at two
 * parallax depths. Each carries a latent hue that only appears once colour is
 * restored -- this is what makes the boss-defeat recolour land (Section 7).
 */
const BACKDROP = [
  // [x, y, w, h, depth(0..1), latent hue]
  [80, 300, 90, 340, 0.35, '#4a6ea8'],
  [230, 220, 70, 420, 0.35, '#5b4a8a'],
  [420, 340, 110, 300, 0.35, '#3f7a6a'],
  [640, 180, 80, 460, 0.35, '#8a5a4a'],
  [820, 300, 130, 340, 0.35, '#4a6ea8'],
  [1050, 240, 75, 400, 0.35, '#6a4a8a'],
  [1260, 330, 120, 310, 0.35, '#3f7a6a'],
  [1500, 200, 85, 440, 0.35, '#8a7a4a'],
  [1720, 310, 105, 330, 0.35, '#4a6ea8'],
  [1960, 250, 90, 390, 0.35, '#5b4a8a'],
  [2200, 340, 125, 300, 0.35, '#3f7a6a'],
  [2450, 210, 80, 430, 0.35, '#8a5a4a'],
  [2700, 300, 115, 340, 0.35, '#4a6ea8'],
  [2950, 260, 95, 380, 0.35, '#6a4a8a'],
];

/** Latent hue of the terrain itself, revealed by restoration. */
const TERRAIN_HUE = '#2f5a3a';

export const level = LEVEL;

/** Colour restoration channels. See the module comment. */
export const restoration = {
  ambient: 0,
  boss: 0,
};

/**
 * Ceiling on the ambient channel. Section 7 calls for restraint until the
 * payoff, so per-kill restoration is not allowed to approach full colour.
 */
const AMBIENT_CAP = 0.35;

/** How much colour is currently showing, 0..1. */
export function restorationAmount() {
  return Math.max(restoration.ambient, restoration.boss);
}

/**
 * Per-kill restoration (Section 7, beat 1). Deliberately tiny: this must read
 * as ambient texture accumulating quietly, never as a reward animation.
 */
export function addKillRestoration(amount = 0.012) {
  // Capped well below full: the level must still look stolen when the boss
  // dies, or the dramatic beat has nothing left to reveal.
  restoration.ambient = Math.min(restoration.ambient + amount, AMBIENT_CAP);
}

// --- Collision --------------------------------------------------------------

/** Does this rect overlap any solid? */
export function overlapsSolid(x, y, w, h) {
  for (const s of LEVEL.solids) {
    if (x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y) return true;
  }
  return false;
}

// --- Rendering --------------------------------------------------------------

/**
 * Draw the world.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} view camera rect in world space
 */
export function drawWorld(ctx, view) {
  const t = restorationAmount();

  drawSky(ctx, view, t);
  drawBackdrop(ctx, view, t);
  drawTerrain(ctx, view, t);
}

function drawSky(ctx, view, t) {
  // A vertical wash. Even the sky holds a latent warmth that only returns with
  // colour, so restoration reads across the whole frame and not just on props.
  const grad = ctx.createLinearGradient(0, view.y, 0, view.y + view.h);
  grad.addColorStop(0, mixColor(palette.sky, '#1b2a4a', t));
  grad.addColorStop(1, mixColor(palette.fogNear, '#4a3a5a', t));
  ctx.fillStyle = grad;
  ctx.fillRect(view.x, view.y, view.w, view.h);
}

function drawBackdrop(ctx, view, t) {
  ctx.lineWidth = INK.lineWidth;

  for (let i = 0; i < BACKDROP.length; i++) {
    const [x, y, w, h, depth, hue] = BACKDROP[i];
    // Parallax: distant shapes move less than the camera.
    const px = x - view.x * depth;

    // Cull offscreen columns.
    if (px + w < view.x - 200 || px > view.x + view.w + 200) continue;

    ctx.fillStyle = mixColor(palette.fogFar, hue, t * 0.7);
    ctx.fillRect(px, y, w, h);

    // A suggestion of windows, as ink flecks rather than drawn detail.
    ctx.fillStyle = mixColor(palette.inkFaint, hue, t);
    inkSpatter(ctx, px + 8, y + 40, w - 16, i * 5.5);
    inkSpatter(ctx, px + 8, y + 140, w - 16, i * 9.1);
  }
}

function drawTerrain(ctx, view, t) {
  ctx.lineWidth = INK.lineWidth;
  ctx.lineJoin = 'round';

  for (let i = 0; i < LEVEL.solids.length; i++) {
    const s = LEVEL.solids[i];
    if (s.x + s.w < view.x - 100 || s.x > view.x + view.w + 100) continue;

    // Body: near-black, barely lifted from the sky.
    ctx.fillStyle = mixColor(palette.terrain, TERRAIN_HUE, t * 0.55);
    roundRect(ctx, s.x, s.y, s.w, s.h, 4);
    ctx.fill();

    // Linework: the drawing that survived the theft.
    ctx.strokeStyle = mixColor(palette.ink, '#cfe8d8', t * 0.5);
    inkRect(ctx, s.x, s.y, s.w, s.h, i);
    ctx.stroke();

    // Spatter along the top edge, where light would catch.
    ctx.fillStyle = mixColor(palette.inkFaint, TERRAIN_HUE, t);
    inkSpatter(ctx, s.x, s.y, s.w, i * 3.7);
  }
}
