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
import {
  level,
  drawWorld,
  addKillRestoration,
  restoration,
  updateRestoration,
  resetRestoration,
  triggerBossRestoration,
  setWipeViewport,
  restorationAmount,
} from './world.js';
import { updateJitter } from './render.js';
import { updateCombo, isArmed, resetCombo, combo, cooldowns } from './combo.js';
import {
  spawnEffect,
  spawnUltimateEffect,
  updateEffects,
  drawEffects,
  clearEffects,
  effects,
} from './effects.js';
import {
  enemies,
  spawnEnemies,
  updateEnemies,
  drawEnemies,
  resolveHits,
  enemyTouching,
} from './enemies.js';
import { addUltimateCharge, resetUltimate, fireUltimate, ultimate } from './ultimate.js';
import {
  boss,
  spawnBoss,
  updateBoss,
  drawBoss,
  resolveBossHits,
  bossTouching,
  bossActive,
} from './boss.js';
import {
  initAudio,
  sfxJump,
  sfxArm,
  sfxCancel,
  sfxCast,
  sfxHit,
  sfxResist,
  sfxHurt,
  sfxUltimate,
  sfxBossHit,
  sfxBossDefeat,
  toggleMute,
  setMusicIntensity,
  setMusicTheme,
  updateMusic,
} from './audio.js';
import { HIT_COLORS } from './palette.js';
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
  // The boss wipe is sized to the screen, so it must follow resizes.
  setWipeViewport(viewW, viewH);
}

addEventListener('resize', resize);
resize();
initAudio();

let elapsed = 0;

/** Previous frame's armed state, for detecting arm/cancel transitions. */
let wasArmed = false;

startLevel();

function startLevel() {
  revivePlayer();
  resetCombo();
  resetUltimate();
  resetRestoration();
  clearEffects();
  spawnEnemies();
  spawnBoss();
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

  // Arming and cancelling are audible so the combo window has a rhythm the
  // player can feel without watching the HUD.
  if (isArmed() && !wasArmed) sfxArm();
  else if (!isArmed() && wasArmed && !fired) sfxCancel();
  wasArmed = isArmed();

  updatePlayer(dt, intent);
  if (player.justJumped) sfxJump();

  updateEnemies(dt);
  updateBoss(dt, player.x);
  updateRestoration(dt);

  if (fired) onAbilityFired(fired);

  if (pressed.mute) toggleMute();

  // The ultimate sits outside the combo grammar entirely: its own key, its own
  // resource, and explicitly unaffected by the per-key cooldowns (Section 4.3).
  if (pressed.ult && fireUltimate()) {
    spawnUltimateEffect(player.x + player.w / 2, player.y + player.h / 2);
    sfxUltimate();
    addShake(16);
  }

  updateEffects(dt);
  resolveHits(onEnemyKilled, onEnemyStripped);
  if (resolveBossHits(onBossHit, onBossDefeated)) sfxResist();

  // Contact damage (Section 5). Enemies have no ranged attacks by design.
  const toucher = enemyTouching(player) || bossTouching(player);
  if (toucher && damagePlayer(toucher.x + toucher.w / 2)) {
    sfxHurt();
    addShake(7);
    if (player.hearts <= 0) onDeath();
  }

  // Falling into a pit costs a heart like any other hazard, rather than
  // restarting outright -- only running out of hearts does that.
  if (player.y > level.killY) {
    if (damagePlayer()) {
      sfxHurt();
      addShake(5);
    }
    if (player.hearts <= 0) onDeath();
    else resetPlayer();
  }

  updateCamera(dt, player, viewW, viewH);

  // Dynamic music (Section 8). Intensity is progress toward the boss arena, so
  // the score tightens as the player approaches and the change in intensity
  // itself communicates "danger ahead" -- no UI, no dialogue.
  const engaged = bossActive();
  setMusicTheme(engaged ? 'boss' : 'level');
  setMusicIntensity(engaged ? 1 : player.x / level.bossArenaX);
  updateMusic();
}

function onAbilityFired(ability) {
  spawnEffect(ability, player.x + player.w / 2, player.y + player.h / 2);
  sfxCast(HIT_COLORS.indexOf(ability.color), ability.archetype);

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
 * @param {boolean} viaUltimate whether the ultimate made the kill
 */
function onEnemyKilled(enemy, exact, viaUltimate) {
  if (__DEV__) {
    killLog.push({
      killedCore: enemy.core,
      spawnedAs: enemy.originalCore,
      exact,
      viaUltimate,
      byEffects: effects.map((e) => e.color + '/' + e.archetype),
    });
  }

  // Ultimate kills deliberately do NOT feed the bar. The GDD says every kill
  // charges it (Section 4.3) but does not consider this case; letting a
  // ten-enemy ultimate refill the bar it just spent would make it
  // self-sustaining and remove the resource decision entirely.
  if (!viaUltimate) addUltimateCharge(exact);
  // Per-kill colour restoration (Section 7, beat 1). Deliberately subtle: this
  // must stay ambient texture and never compete with the boss-defeat beat.
  addKillRestoration();
  // The ultimate has its own sound; a per-enemy hit on top of it would just be
  // noise when it clears a whole screen at once.
  if (!viaUltimate) sfxHit(HIT_COLORS.indexOf(enemy.core), true);
  addShake(exact ? 6 : 4);
}

function onEnemyStripped(enemy) {
  // The core has already shifted, so this pitches to the colour still NEEDED
  // rather than the one that just landed -- the sound tells the player what is
  // left to do, which is the more useful half of the information.
  sfxHit(HIT_COLORS.indexOf(enemy.core), false);
  addShake(2);
}

function onBossHit() {
  sfxBossHit();
  addShake(9);
}

/**
 * The boss is down. This is the game's biggest beat (Section 7): the dramatic
 * recolour fires from where the boss stood, so the colour visibly comes back
 * out of the thing that stole it.
 */
function onBossDefeated(defeated) {
  triggerBossRestoration(defeated.x + defeated.w / 2, defeated.y + defeated.h / 2);
  sfxBossDefeat();
  addShake(22);
}

/**
 * Out of hearts (Section 5).
 *
 * Dying inside the boss arena restarts the fight rather than the whole level.
 * Section 15 leaves this open; replaying the entire level after every boss
 * attempt would be miserable, and this is far cheaper than the general
 * checkpoint system Section 13 defers to P2.
 */
function onDeath() {
  if (bossActive()) restartBossFight();
  else startLevel();
}

function restartBossFight() {
  revivePlayer();
  resetCombo();
  clearEffects();
  spawnBoss();
  // Put the player back at the arena mouth, already engaged.
  player.x = level.bossArenaX - 60;
  player.y = level.bossSpawn.y - player.h;
}

function render() {
  ctx.save();
  applyCamera(ctx);

  const view = { x: camera.x, y: camera.y, w: viewW, h: viewH };
  drawWorld(ctx, view);
  drawEnemies(ctx, view);
  drawBoss(ctx, view, restorationAmount());
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
  window.rgbeat = {
    player,
    enemies,
    ultimate,
    combo,
    cooldowns,
    effects,
    restoration,
    held,
    killLog,
    boss,
    // The boss does not exist yet, so the dramatic restoration beat is
    // triggerable directly for now. Phase 5 hooks it to the boss's death.
    triggerBossRestoration,
  };
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
