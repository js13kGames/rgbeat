/**
 * RGBeat -- entry point.
 *
 * Owns the canvas, the fixed-timestep loop, and the order systems run in.
 * Gameplay lives in the modules it pulls together.
 */
import { held, pressed, endFrame } from './input.js';
import {
  player,
  updatePlayer,
  drawPlayer,
  resetPlayer,
  revivePlayer,
  damagePlayer,
} from './player.js';
import { camera, updateCamera, applyCamera, addShake } from './camera.js';
import { level, drawWorld, addKillRestoration, restoration } from './world.js';
import { updateJitter } from './render.js';
import { updateCombo, isArmed, resetCombo, combo, cooldowns } from './combo.js';
import { spawnEffect, updateEffects, drawEffects, clearEffects, effects } from './effects.js';
import {
  enemies,
  spawnEnemies,
  updateEnemies,
  drawEnemies,
  resolveHits,
  enemyTouching,
} from './enemies.js';
import { addUltimateCharge, resetUltimate, ultimate } from './ultimate.js';
import { drawHud, drawComboIndicator } from './hud.js';
import { DASH_IMPULSE } from './config.js';

/** Simulation step, in seconds. Fixed so physics stays deterministic. */
const STEP = 1 / 60;

/** Guard against the spiral of death after a tab has been backgrounded. */
const MAX_FRAME_TIME = 0.25;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

/** CSS-pixel viewport size, kept in sync with the window. */
let viewW = 0;
let viewH = 0;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  viewW = innerWidth;
  viewH = innerHeight;
  canvas.width = viewW * dpr;
  canvas.height = viewH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener('resize', resize);
resize();

let elapsed = 0;

startLevel();

function startLevel() {
  revivePlayer();
  resetCombo();
  resetUltimate();
  clearEffects();
  spawnEnemies();
}

function update(dt) {
  elapsed += dt;
  updateJitter(elapsed);

  // The combo system runs first, because arming a combo takes the arrow keys
  // away from movement for the rest of this frame (GDD Section 3.1, step 2).
  const fired = updateCombo(dt, pressed, held, player.facing);

  // While aiming, movement intent is suppressed entirely -- the arrows are the
  // aim stick, and that includes jump.
  const aiming = isArmed();
  const intent = {
    move: aiming ? 0 : (held.right ? 1 : 0) - (held.left ? 1 : 0),
    jumpHeld: !aiming && held.up,
    jumpPressed: !aiming && !!pressed.up,
  };

  updatePlayer(dt, intent);
  updateEnemies(dt);

  if (fired) onAbilityFired(fired);
  updateEffects(dt);
  resolveHits(onEnemyKilled, onEnemyStripped);

  // Contact damage (Section 5). Enemies have no ranged attacks by design.
  const toucher = enemyTouching(player);
  if (toucher && damagePlayer(toucher.x + toucher.w / 2)) {
    addShake(7);
    if (player.hearts <= 0) onDeath();
  }

  // Falling into a pit costs a heart like any other hazard, rather than
  // restarting outright -- only running out of hearts does that.
  if (player.y > level.killY) {
    if (damagePlayer()) addShake(5);
    if (player.hearts <= 0) onDeath();
    else resetPlayer();
  }

  updateCamera(dt, player, viewW, viewH);
}

function onAbilityFired(ability) {
  spawnEffect(ability, player.x + player.w / 2, player.y + player.h / 2);

  // Assault abilities move the player: the dash is the mechanic, not decoration.
  if (ability.archetype === 'assault') {
    player.vx = ability.aimX * DASH_IMPULSE;
    // A slight upward component keeps a grounded dash from ploughing into the
    // floor, and makes air dashes feel like they carry.
    if (ability.aimY < 0) player.vy = ability.aimY * DASH_IMPULSE * 0.5;
    player.facing = ability.aimX >= 0 ? 1 : -1;
  }

  addShake(ability.archetype === 'assault' ? 5 : 3);
}

/**
 * @param {object} enemy the enemy that died
 * @param {boolean} exact whether it was a clean exact-colour one-shot
 */
function onEnemyKilled(enemy, exact) {
  if (__DEV__) {
    killLog.push({
      killedCore: enemy.core,
      spawnedAs: enemy.originalCore,
      exact,
      byEffects: effects.map((e) => e.color + '/' + e.archetype),
    });
  }
  addUltimateCharge(exact);
  // Per-kill colour restoration (Section 7, beat 1). Deliberately subtle: this
  // must stay ambient texture and never compete with the boss-defeat beat.
  addKillRestoration();
  addShake(exact ? 6 : 4);
}

function onEnemyStripped() {
  addShake(2);
}

/** Out of hearts: restart the level (Section 5). */
function onDeath() {
  startLevel();
}

function render() {
  ctx.save();
  applyCamera(ctx);

  const view = { x: camera.x, y: camera.y, w: viewW, h: viewH };
  drawWorld(ctx, view);
  drawEnemies(ctx, view);
  drawEffects(ctx);
  drawPlayer(ctx);
  drawComboIndicator(ctx, player);

  ctx.restore();

  drawHud(ctx, viewW, viewH, elapsed);
}

// Dev-only: expose live state so behaviour can be inspected and asserted on
// from the browser instead of inferred from pixels. `__DEV__` is replaced at
// build time and this whole block is compiled out of production builds.
const killLog = [];

if (__DEV__) {
  window.rgbeat = { player, enemies, ultimate, combo, cooldowns, effects, restoration, held, killLog };
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);

  accumulator += Math.min((now - last) / 1000, MAX_FRAME_TIME);
  last = now;

  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
    endFrame();
  }

  render();
}

requestAnimationFrame(frame);
