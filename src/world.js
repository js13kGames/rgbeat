/**
 * The world: level geometry, collision, and the grayscale ink-wash renderer
 * (GDD Sections 7 and 9).
 *
 * Colour restoration is two deliberately different things, exactly as Section 7
 * requires -- they must never blend into one effect:
 *
 *   `ambient`  a scalar that creeps up a little per enemy kill. Subtle by
 *              design, and capped well below full colour so the level still
 *              looks stolen when the boss dies.
 *   `boss`     an animated spatial wipe sweeping out from where the boss died,
 *              repainting the world as it passes.
 *
 * They are not two settings of one dial: the ambient drip changes how the world
 * is tinted, while the boss beat draws the world twice and clips the coloured
 * pass to an advancing front. Collapsing them would cost the payoff.
 */
import { palette, rainbow } from './palette.js';
import { INK, BOSS_WIPE_DURATION } from './config.js';
import { inkRect, inkSpatter, mixColor, roundRect } from './render.js';

/**
 * The levels.
 *
 * Every surface is authored against the jump envelope in config.js: no rise
 * exceeds LEDGE_STEP_MAX and no gap exceeds GAP_MAX, both well under the
 * theoretical maximum so jumps never feel pixel-perfect. Critically, NO ledge
 * sits above the run-up to a pit -- a ledge there becomes a ceiling that clips
 * the jump arc, which is what silently turns an ordinary gap into a
 * frame-perfect one.
 *
 * `npm run check:level` proves all of this for EVERY level by simulating the
 * real physics. Do not add geometry by eye; add it and run the check.
 *
 * Difficulty rises through density, pit count and tighter ledges, not through
 * new mechanics -- GDD Section 12 is explicit that each level should not
 * introduce another system.
 *
 * The stretch from `bossArenaX` to `width` is the boss arena, and it is sized
 * to be WIDER than a typical viewport on purpose. At 420-520 units it was
 * narrower than the window, so the camera could not frame it: it stayed clamped
 * to the end of the level and spent half the screen showing the platforms the
 * player had already crossed, while the fight itself happened in a corner.
 *
 * `bossArenaX` is where the fight starts; dying inside it restarts the fight
 * rather than the level (Section 15 leaves that open, and replaying a whole
 * level after each boss attempt would be miserable in a jam game).
 */
const LEVELS = [
  // --- 1. Teaching ground: two pits, generous ledges ------------------------
  {
    width: 4300,
    height: 900,
    killY: 1100,
    spawn: { x: 120, y: 500 },
    bossArenaX: 3280,
    bossSpawn: { x: 3560, y: 640 },
    solids: [
      { x: 0, y: 640, w: 600, h: 260 },
      { x: 730, y: 640, w: 550, h: 260 },
      { x: 1420, y: 640, w: 2880, h: 260 },

      { x: 200, y: 548, w: 160, h: 24 },
      { x: 900, y: 545, w: 160, h: 24 },
      { x: 980, y: 455, w: 140, h: 24 },
      { x: 1600, y: 545, w: 180, h: 24 },
      { x: 1880, y: 455, w: 170, h: 24 },
      { x: 2200, y: 545, w: 190, h: 24 },
      { x: 2470, y: 455, w: 170, h: 24 },
      { x: 2800, y: 540, w: 180, h: 24 },

      // `decor` marks an obstacle that is not part of the route, so the
      // reachability check does not demand the player be able to land on it.
      { x: 3040, y: 545, w: 40, h: 95, decor: 1 },

      // Arena footing. The fight used to happen on a bare floor, which made it
      // a pure timing exercise: the boss paces, the player waits. Ledges give
      // the shockwaves something to be dodged ONTO rather than only jumped
      // over, and give the player a reason to keep moving between windows.
      // Kept clear of bossSpawn so nothing spawns underneath the boss.
      { x: 3400, y: 545, w: 170, h: 24 },
      { x: 3760, y: 470, w: 150, h: 24 },
      { x: 4080, y: 545, w: 170, h: 24 },
    ],
  },

  // --- 2. Three pits, and the climbs get narrower ---------------------------
  {
    width: 4300,
    height: 900,
    killY: 1100,
    spawn: { x: 110, y: 500 },
    bossArenaX: 3380,
    bossSpawn: { x: 3620, y: 640 },
    solids: [
      { x: 0, y: 640, w: 560, h: 260 },
      { x: 700, y: 640, w: 450, h: 260 },
      { x: 1290, y: 640, w: 610, h: 260 },
      { x: 2050, y: 640, w: 2250, h: 260 },

      { x: 160, y: 545, w: 150, h: 24 },
      { x: 860, y: 545, w: 130, h: 24 },
      { x: 1480, y: 545, w: 160, h: 24 },
      { x: 1560, y: 455, w: 140, h: 24 },
      { x: 2250, y: 545, w: 170, h: 24 },
      { x: 2510, y: 455, w: 160, h: 24 },
      { x: 2820, y: 545, w: 180, h: 24 },
      { x: 3090, y: 455, w: 160, h: 24 },

      { x: 3300, y: 545, w: 40, h: 95, decor: 1 },

      // Arena footing, tighter than level 1's.
      { x: 3470, y: 545, w: 150, h: 24 },
      { x: 3820, y: 470, w: 140, h: 24 },
      { x: 4120, y: 545, w: 150, h: 24 },
    ],
  },

  // --- 3. Four pits and the tightest footing -------------------------------
  {
    width: 4600,
    height: 900,
    killY: 1100,
    spawn: { x: 100, y: 500 },
    bossArenaX: 3650,
    bossSpawn: { x: 3880, y: 640 },
    solids: [
      { x: 0, y: 640, w: 520, h: 260 },
      { x: 660, y: 640, w: 420, h: 260 },
      { x: 1225, y: 640, w: 415, h: 260 },
      { x: 1785, y: 640, w: 475, h: 260 },
      { x: 2400, y: 640, w: 2200, h: 260 },

      { x: 180, y: 545, w: 150, h: 24 },
      { x: 820, y: 545, w: 100, h: 24 },
      { x: 1380, y: 545, w: 100, h: 24 },
      { x: 1940, y: 545, w: 160, h: 24 },
      { x: 2600, y: 545, w: 170, h: 24 },
      { x: 2860, y: 455, w: 160, h: 24 },
      { x: 3150, y: 545, w: 180, h: 24 },
      { x: 3420, y: 455, w: 160, h: 24 },

      // Arena footing, tightest of the three.
      { x: 3740, y: 545, w: 140, h: 24 },
      { x: 4080, y: 470, w: 130, h: 24 },
      { x: 4380, y: 545, w: 140, h: 24 },
    ],
  },
];

export const LEVEL_COUNT = LEVELS.length;

/** Index of the level currently loaded. */
export let levelIndex = 0;

/**
 * The live level.
 *
 * Deliberately a single object that `loadLevel` fills in, rather than a
 * per-level object handed around: every module that needs geometry imports
 * `level` once and keeps working across level changes, with no plumbing.
 */
export const level = {};

export function loadLevel(index) {
  levelIndex = index;
  Object.assign(level, LEVELS[index]);
}

loadLevel(0);

/**
 * Background silhouettes: the stolen-colour city, drawn as flat shapes behind
 * a parallax offset. Each carries a latent hue that only appears once colour is
 * restored -- this is what makes the boss-defeat recolour land (Section 7).
 *
 * NOTE ON AUTHORING RANGE: because of parallax, these x values are not level
 * positions. A layer at `depth` only ever shows x values in
 * [0, cameraMax * depth + viewWidth] -- roughly 0..1800 here. Entries beyond
 * that are never on screen no matter where the player stands, so the skyline is
 * authored densely across that band rather than stretched along the level.
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
];

/** Latent hue of the terrain itself, revealed by restoration. */
const TERRAIN_HUE = '#2f5a3a';


/**
 * Colour restoration state. See the module comment.
 *
 * The two beats are kept structurally separate on purpose. The ambient channel
 * is a scalar that creeps up; the boss beat is an animated spatial wipe. They
 * are not two settings of one effect, and they must never be collapsed into
 * one -- Section 7 is explicit that muddling them loses the payoff.
 */
export const restoration = {
  /** Slow per-kill accumulation, 0..AMBIENT_CAP. */
  ambient: 0,

  /** Boss wipe progress, 0..1. */
  boss: 0,
  /** Whether the wipe is currently sweeping. */
  wipeActive: false,
  /** Origin of the colour front, in world space. */
  wipeX: 0,
  wipeY: 0,
  /** Current radius of the advancing front. */
  wipeRadius: 0,
};

/**
 * Ceiling on the ambient channel. Section 7 calls for restraint until the
 * payoff, so per-kill restoration is not allowed to approach full colour.
 */
const AMBIENT_CAP = 0.35;

/**
 * How far the front must travel, in px.
 *
 * Scaled to the VIEWPORT, not the level. Sizing it to the level made the front
 * cross the visible screen in about a tenth of a second -- technically a wipe,
 * but far too fast to read as one. What the player must see is the front
 * sweeping across their screen; the rest of the level is covered by latching
 * `ambient` to 1 when the animation completes.
 */
let wipeTargetRadius = 1200;

export function setWipeViewport(viewW, viewH) {
  wipeTargetRadius = Math.hypot(viewW, viewH) * 1.15;
}

/** How much colour is currently showing, 0..1. */
export function restorationAmount() {
  return restoration.boss >= 1 ? 1 : restoration.ambient;
}

/**
 * Boss-defeat restoration (Section 7, beat 2).
 *
 * Deliberately nothing like the per-kill drip: it is an animated front that
 * sweeps out from where the boss died, repainting the world as it passes.
 * @param {number} x origin in world space
 * @param {number} y origin in world space
 */
export function triggerBossRestoration(x, y) {
  restoration.wipeActive = true;
  restoration.wipeX = x;
  restoration.wipeY = y;
  restoration.wipeRadius = 0;
  restoration.boss = 0;
}

export function updateRestoration(dt) {
  if (!restoration.wipeActive) return;

  restoration.boss = Math.min(1, restoration.boss + dt / BOSS_WIPE_DURATION);
  // A mild ease-out: quick enough to feel like a burst, slow enough that the
  // front takes most of a second to cross the screen. A stronger curve here
  // front-loads the motion so heavily that the sweep is over before it reads.
  const eased = Math.pow(restoration.boss, 0.75);
  restoration.wipeRadius = eased * wipeTargetRadius;

  if (restoration.boss >= 1) {
    // The world is fully repainted; the wipe stops being a live effect and
    // becomes the new resting state.
    restoration.wipeActive = false;
    restoration.ambient = 1;
  }
}

export function resetRestoration() {
  restoration.ambient = 0;
  restoration.boss = 0;
  restoration.wipeActive = false;
  restoration.wipeRadius = 0;
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
  for (const s of level.solids) {
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
  // The world as it currently stands: grayscale, plus whatever the slow
  // per-kill drip has returned.
  drawLayers(ctx, view, restorationAmount());

  if (!restoration.wipeActive) return;

  // The boss beat: the SAME world drawn in full colour, clipped to the
  // advancing front. Drawing it twice is what makes this read as colour being
  // pushed back into the world, rather than a value being turned up.
  ctx.save();
  ctx.beginPath();
  ctx.arc(restoration.wipeX, restoration.wipeY, restoration.wipeRadius, 0, Math.PI * 2);
  ctx.clip();
  drawLayers(ctx, view, 1);
  ctx.restore();

  drawWipeFront(ctx);
}

/** The world at a given restoration amount. */
function drawLayers(ctx, view, t) {
  drawSky(ctx, view, t);
  drawBackdrop(ctx, view, t);
  drawTerrain(ctx, view, t);
}

/**
 * The leading edge of the colour front: a bright rainbow rim. This is the part
 * that makes the moment unmissable, so it is the one place in the world allowed
 * to be loudly saturated.
 */
function drawWipeFront(ctx) {
  const r = restoration.wipeRadius;
  if (r <= 0) return;

  // Fades as the front expands, so the effect resolves rather than lingering.
  const strength = 1 - restoration.boss;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.lineWidth = 5 + strength * 14;

  const grad = ctx.createLinearGradient(
    restoration.wipeX - r,
    restoration.wipeY,
    restoration.wipeX + r,
    restoration.wipeY
  );
  for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, rainbow(i / 6));
  ctx.strokeStyle = grad;

  ctx.beginPath();
  ctx.arc(restoration.wipeX, restoration.wipeY, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
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

    // Parallax. These are drawn inside the camera transform, which has already
    // translated by -view.x, so the offset must ADD back the part of the camera
    // motion the layer should not follow:
    //
    //   on-screen position = px - view.x = x - view.x * depth
    //
    // Subtracting view.x * depth here instead made backdrops move at 1.35x the
    // camera -- faster than the foreground, which is inverted parallax, and it
    // ran the backdrop off the end of the level before the boss arena.
    const px = x + view.x * (1 - depth);

    // Cull offscreen columns, in screen space.
    const screenX = px - view.x;
    if (screenX + w < -200 || screenX > view.w + 200) continue;

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

  for (let i = 0; i < level.solids.length; i++) {
    const s = level.solids[i];
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
