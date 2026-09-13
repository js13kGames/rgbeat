/**
 * Enemies (GDD Section 6).
 *
 * All enemies are grayscale human silhouettes with a coloured core in the
 * chest. The core says exactly what is needed to kill them, and it visibly
 * updates as colour is stripped from it -- that readability is the whole point
 * (Section 2, pillar 2: reading, not memorizing).
 *
 *   primary    core is one primary colour; the matching colour kills it
 *   secondary  core is a secondary colour, killable two ways:
 *              - one hit with the matching secondary (exact read, big reward)
 *              - the two component primaries in either order, the core
 *                visibly shifting to show what is still needed
 *
 * Volatile variants (Section 6.3) shift their core if left unstruck; the boss
 * lives in boss.js.
 * Enemies damage the player by contact only -- Section 5 is explicit that
 * ranged attacks must not creep in as an implementation afterthought.
 */
import {
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  ENEMY_SPEED,
  ENEMY_HURT_FLASH,
  VOLATILE_SHIFT_TIME,
  INK,
} from './config.js';
import { palette, MIX, HIT_COLORS, RED, GREEN, BLUE, ORANGE, PURPLE, CYAN } from './palette.js';
import { effects, effectOverlaps } from './effects.js';
import { inkRect, mixColor, drawGlyph } from './render.js';
import { restorationAmount, levelIndex } from './world.js';

/**
 * Level enemy placements.
 *
 * One array per level. Within each, ordered along the level to teach in the
 * order Section 12 asks for: primaries first, then secondaries once the player
 * can read a core, then volatile variants in the back half.
 *
 * Across levels the difficulty comes from density and from secondaries
 * arriving sooner -- not from new mechanics, which Section 12 rules out.
 * `surface` is what they stand on; the spawn converts it to a body position.
 */
const PLACEMENTS = [
  // --- Tutorial: one of each kind of answer ---------------------------------
  //
  // A pure combo, then another, then one secondary. Three enemies is enough to
  // show that the second key names a colour; a fourth would only repeat it.
  [
    { x: 430, surface: 640, core: RED, patrol: [380, 560] },
    { x: 1000, surface: 640, core: BLUE, patrol: [950, 1140] },
    { x: 1290, surface: 640, core: ORANGE, patrol: [1230, 1420] },
  ],

  // --- Level 1: teach the grammar ------------------------------------------
  [
    // A single primary first, with room to experiment.
    { x: 430, surface: 640, core: RED, patrol: [370, 560] },

    // Two more primaries, then the first secondary.
    { x: 820, surface: 640, core: BLUE, patrol: [760, 1000] },
    { x: 960, surface: 545, core: GREEN, patrol: [905, 1050] },
    { x: 1180, surface: 640, core: ORANGE, patrol: [1090, 1260] },

    // Secondaries become the norm.
    { x: 1660, surface: 545, core: BLUE, patrol: [1605, 1770] },
    { x: 1930, surface: 455, core: PURPLE, patrol: [1885, 2040] },
    { x: 2260, surface: 545, core: CYAN, patrol: [2205, 2380] },

    // Back half only: volatile cores that shift if left alone (Section 6.3),
    // used sparingly as a spike of tension rather than the default enemy.
    { x: 2520, surface: 455, core: ORANGE, patrol: [2475, 2630], volatile: 1 },
    { x: 2700, surface: 640, core: GREEN, patrol: [2620, 2780] },
    { x: 2860, surface: 540, core: PURPLE, patrol: [2805, 2970], volatile: 1 },
  ],

  // --- Level 2: denser, secondaries earlier, three volatile ----------------
  [
    { x: 380, surface: 640, core: GREEN, patrol: [320, 520] },
    { x: 200, surface: 545, core: RED, patrol: [165, 300] },

    { x: 900, surface: 640, core: ORANGE, patrol: [760, 1100] },
    { x: 900, surface: 545, core: BLUE, patrol: [865, 980] },

    { x: 1400, surface: 640, core: CYAN, patrol: [1300, 1560] },
    { x: 1600, surface: 455, core: PURPLE, patrol: [1565, 1690] },
    { x: 1800, surface: 640, core: RED, patrol: [1700, 1880] },

    { x: 2300, surface: 545, core: ORANGE, patrol: [2255, 2410], volatile: 1 },
    { x: 2560, surface: 455, core: CYAN, patrol: [2515, 2660], volatile: 1 },
    { x: 2870, surface: 545, core: PURPLE, patrol: [2825, 2990] },
    { x: 3130, surface: 455, core: GREEN, patrol: [3095, 3240], volatile: 1 },
  ],

  // --- Level 3: four pits, tight footing, mostly secondaries ---------------
  [
    { x: 350, surface: 640, core: PURPLE, patrol: [280, 500] },
    { x: 220, surface: 545, core: BLUE, patrol: [185, 320] },

    { x: 850, surface: 640, core: CYAN, patrol: [700, 1060] },
    { x: 855, surface: 545, core: RED, patrol: [825, 910] },

    { x: 1400, surface: 640, core: ORANGE, patrol: [1260, 1620] },
    { x: 1410, surface: 545, core: GREEN, patrol: [1385, 1470] },

    { x: 1990, surface: 545, core: PURPLE, patrol: [1945, 2090], volatile: 1 },
    { x: 2100, surface: 640, core: CYAN, patrol: [1800, 2240] },

    { x: 2650, surface: 545, core: ORANGE, patrol: [2605, 2760], volatile: 1 },
    { x: 2910, surface: 455, core: PURPLE, patrol: [2865, 3010], volatile: 1 },
    { x: 3200, surface: 545, core: CYAN, patrol: [3155, 3320] },
    { x: 3470, surface: 455, core: ORANGE, patrol: [3425, 3570], volatile: 1 },
  ],
];

/** Live enemies. */
export const enemies = [];

/**
 * Is this colour a secondary (i.e. a mix of two primaries)?
 * Derived from the palette's MIX table so there is one source of truth.
 */
function isSecondary(color) {
  return color in MIX;
}

export function spawnEnemies() {
  enemies.length = 0;

  for (const p of PLACEMENTS[levelIndex]) {
    enemies.push({
      x: p.x,
      y: p.surface - ENEMY_HEIGHT,
      w: ENEMY_WIDTH,
      h: ENEMY_HEIGHT,
      /** The colour currently required to hurt it. Shown as the chest core. */
      core: p.core,
      /** The colour it spawned with, for rendering and scoring decisions. */
      originalCore: p.core,
      /**
       * True once a secondary enemy has had one primary stripped from it.
       * Section 4.3: a kill finished this way charges the ultimate less than a
       * clean one-shot with the exact matching colour.
       */
      stripped: false,
      /** Section 6.3: does this core shift if it is not struck in time? */
      volatile: !!p.volatile,
      shiftTimer: VOLATILE_SHIFT_TIME,
      dir: 1,
      patrolMin: p.patrol[0],
      patrolMax: p.patrol[1] - ENEMY_WIDTH,
      flash: 0,
      /** Bob phase, so a row of enemies does not move in lockstep. */
      phase: p.x * 0.01,
    });
  }
}

export function updateEnemies(dt) {
  for (const e of enemies) {
    e.x += e.dir * ENEMY_SPEED * dt;
    if (e.x <= e.patrolMin) {
      e.x = e.patrolMin;
      e.dir = 1;
    } else if (e.x >= e.patrolMax) {
      e.x = e.patrolMax;
      e.dir = -1;
    }
    if (e.flash > 0) e.flash -= dt;
    e.phase += dt;

    if (e.volatile) {
      e.shiftTimer -= dt;
      if (e.shiftTimer <= 0) shiftCore(e);
    }
  }
}

/**
 * Move a volatile enemy's core to a different colour (Section 6.3).
 *
 * It shifts within its own class -- a primary becomes another primary, a
 * secondary another secondary -- so the enemy stays the same *kind* of problem
 * and only the answer changes. Shifting a secondary into a primary would
 * quietly make it easier, which is the opposite of the intent.
 */
function shiftCore(enemy) {
  const pool = HIT_COLORS.filter(
    (c) => c !== enemy.core && isSecondary(c) === isSecondary(enemy.core)
  );
  enemy.core = pool[(Math.random() * pool.length) | 0];
  // A shift resets the strip progress: the enemy is a different problem now.
  enemy.stripped = false;
  enemy.shiftTimer = VOLATILE_SHIFT_TIME;
  enemy.flash = ENEMY_HURT_FLASH;
}

/**
 * Resolve every live ability effect against every enemy.
 *
 * @param {(enemy: object, exact: boolean, viaUltimate: boolean) => void} onKill
 *   called when an enemy dies; `exact` distinguishes the one-shot exact-colour
 *   read from the slower strip-it-down path (Section 4.3), and `viaUltimate`
 *   marks kills the ultimate made, which do not feed the bar back.
 * @param {(enemy: object) => void} onStrip called when a hit removes a colour
 *   but leaves the enemy alive.
 */
export function resolveHits(onKill, onStrip) {
  for (const effect of effects) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];

      // One swing may only hit a given enemy once.
      if (effect.hit.has(enemy)) continue;
      if (!effectOverlaps(effect, enemy)) continue;

      effect.hit.add(enemy);
      applyHit(enemy, effect, i, onKill, onStrip);
    }
  }
}

/**
 * Apply one coloured hit to an enemy.
 *
 * The three outcomes, in the order Section 6.2 describes them:
 *   - the colour matches the core exactly     -> dies
 *   - the core is secondary and the colour is
 *     one of its two components               -> core shifts to the remainder
 *   - anything else                           -> no effect
 */
function applyHit(enemy, effect, index, onKill, onStrip) {
  // The ultimate carries every colour at once, so it bypasses the matching
  // rule entirely and kills regardless of the current core (Section 4.3).
  if (effect.ultimate) {
    enemies.splice(index, 1);
    onKill(enemy, false, true);
    return;
  }

  const color = effect.color;

  if (color === enemy.core) {
    enemies.splice(index, 1);
    // An "exact" kill means the killing blow matched the enemy's full
    // remaining requirement in one hit AND nothing had been stripped first.
    onKill(enemy, !enemy.stripped, false);
    return;
  }

  if (isSecondary(enemy.core)) {
    const parts = MIX[enemy.core];
    if (parts.includes(color)) {
      // Strip: the core visibly becomes the colour still needed.
      enemy.core = parts.find((p) => p !== color);
      enemy.stripped = true;
      enemy.flash = ENEMY_HURT_FLASH;
      // Landing a hit buys a fresh window: a volatile enemy should never shift
      // out from under a player who is actively solving it.
      enemy.shiftTimer = VOLATILE_SHIFT_TIME;
      onStrip(enemy);
      return;
    }
  }

  // Wrong colour: the enemy shrugs it off. Flash anyway so the player gets
  // feedback that the hit landed but was the wrong read.
  enemy.flash = ENEMY_HURT_FLASH * 0.6;
}

/** Does anything overlap the player's body? Used for contact damage. */
export function enemyTouching(rect) {
  for (const e of enemies) {
    if (
      rect.x < e.x + e.w &&
      rect.x + rect.w > e.x &&
      rect.y < e.y + e.h &&
      rect.y + rect.h > e.y
    ) {
      return e;
    }
  }
  return null;
}

// --- Rendering --------------------------------------------------------------

export function drawEnemies(ctx, view) {
  const t = restorationAmount();

  for (const e of enemies) {
    if (e.x + e.w < view.x - 60 || e.x > view.x + view.w + 60) continue;
    drawEnemy(ctx, e, t);
  }
}

/**
 * A human silhouette in ink, with the stolen colour burning in its chest.
 *
 * The body is deliberately flat and dark: Section 9 keeps the enemy itself
 * desaturated so the core is the only thing competing for attention.
 */
function drawEnemy(ctx, e, t) {
  const bob = Math.sin(e.phase * 4) * 1.5;
  const cx = e.x + e.w / 2;
  const top = e.y + bob;

  ctx.save();

  // Silhouette: head, torso, legs as simple blocks. Enough to read as human
  // at a glance without costing bytes on anatomy.
  ctx.fillStyle = mixColor('#0c0c10', '#2a2438', t * 0.5);

  // Head.
  ctx.beginPath();
  ctx.arc(cx, top + 9, 8, 0, Math.PI * 2);
  ctx.fill();

  // Torso, tapering to the waist.
  ctx.beginPath();
  ctx.moveTo(cx - 11, top + 18);
  ctx.lineTo(cx + 11, top + 18);
  ctx.lineTo(cx + 8, top + 36);
  ctx.lineTo(cx - 8, top + 36);
  ctx.closePath();
  ctx.fill();

  // Legs.
  const stride = Math.sin(e.phase * 6) * 3;
  ctx.fillRect(cx - 8, top + 36, 6, 16 + stride);
  ctx.fillRect(cx + 2, top + 36, 6, 16 - stride);

  // Arms, hanging.
  ctx.fillRect(cx - 14, top + 19, 4, 15);
  ctx.fillRect(cx + 10, top + 19, 4, 15);

  // Ink outline, so enemies read as drawings rather than shapes.
  ctx.strokeStyle = mixColor(palette.inkFaint, palette.ink, 0.4);
  ctx.lineWidth = INK.lineWidth * 0.7;
  inkRect(ctx, cx - 11, top + 18, 22, 18, e.x);
  ctx.stroke();

  drawCore(ctx, cx, top + 27, e);

  ctx.restore();
}

/**
 * The chest core: a diamond, taken from the reference art. Its colour is the
 * requirement, so it glows hard enough to be read across the screen.
 *
 * Colourblind shape redundancy (Section 10) attaches here -- a distinct glyph
 * per colour, so the requirement never depends on hue alone. That lands with
 * the accessibility phase.
 */
function drawCore(ctx, x, y, enemy) {
  const index = HIT_COLORS.indexOf(enemy.core);
  const color = palette[enemy.core];
  const hurt = enemy.flash > 0;
  const size = hurt ? 9.5 : 8;

  ctx.save();
  ctx.translate(x, y);

  ctx.shadowColor = color;
  ctx.shadowBlur = hurt ? 22 : 14;

  // The core's SHAPE is the requirement as much as its colour (Section 10):
  // a player who cannot separate two hues can still read which glyph this is.
  ctx.fillStyle = color;
  drawGlyph(ctx, index, size);
  ctx.fill();

  // Volatile enemies wear a draining ring, so the pressure is legible rather
  // than a surprise -- the shift should be a race the player can see losing.
  if (enemy.volatile) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      size + 5,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (enemy.shiftTimer / VOLATILE_SHIFT_TIME)
    );
    ctx.stroke();
  }

  // Inner highlight, which makes the core read as lit rather than painted.
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#fff';
  drawGlyph(ctx, index, size * 0.36);
  ctx.fill();

  ctx.restore();
}
