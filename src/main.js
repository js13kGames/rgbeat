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
  loadLevel,
  levelIndex,
  LEVEL_COUNT,
  overlapsSolid,
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
  drawBossAttack,
  shockwaveHitting,
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
import { HIT_COLORS, loadPaletteMode, cyclePaletteMode } from './palette.js';
import { drawHud, drawComboIndicator, showToast } from './hud.js';
import { updateMenu, drawMenu, tapMenu } from './menu.js';
import { initTouch, onTap } from './touch.js';
import { DASH_IMPULSE, BOSS_WIPE_DURATION } from './config.js';

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
loadPaletteMode();
initTouch(canvas, () => ({ w: viewW, h: viewH }));

let elapsed = 0;

/** Previous frame's armed state, for detecting arm/cancel transitions. */
let wasArmed = false;

/**
 * Which screen is live. The title screen owns its own input and rendering, so
 * the game loop simply routes to one or the other rather than the world having
 * to know it is paused.
 */
let inMenu = true;

/**
 * Seconds until the next level loads, or 0 when not transitioning.
 *
 * The boss's death starts the restoration wipe, and the level must NOT change
 * until that has played out -- it is the biggest beat in the game (Section 7)
 * and cutting away from it would throw the payoff away. So the transition is a
 * timer rather than an immediate swap.
 */
let levelTransition = 0;

// On touch there are no arrow keys to drive the menu, so taps go to it first.
onTap((x, y, w, h) => {
  if (!inMenu) return false;
  if (tapMenu(x, y, w, h)) beginGame();
  return true;
});

function beginGame() {
  inMenu = false;
  loadLevel(0);
  startLevel();
  // The title screen already offered the palette, so this only has to cover
  // what it did not: the in-run shortcuts.
  showToast('M: sound    C: palette', elapsed, 5);
}

function startLevel() {
  levelTransition = 0;
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

  if (inMenu) {
    if (updateMenu(pressed)) beginGame();
    // The title screen has its own calm bed: the same engine at zero intensity,
    // so starting the game is a rise rather than the music beginning.
    setMusicTheme('level');
    setMusicIntensity(0);
    updateMusic();
    return;
  }

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

  if (levelTransition > 0) {
    levelTransition -= dt;
    if (levelTransition <= 0) advanceLevel();
  }

  if (fired) onAbilityFired(fired);

  if (pressed.mute) showToast(toggleMute() ? 'sound on' : 'sound off', elapsed);
  if (pressed.palette) showToast('palette: ' + cyclePaletteMode(), elapsed);

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
  const toucher = enemyTouching(player) || bossTouching(player) || shockwaveHitting(player);
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

  // Let the recolour finish and breathe before the level changes.
  levelTransition = BOSS_WIPE_DURATION + 1.4;
}

/** The wipe has played out; move on, or end the game if that was the last boss. */
function advanceLevel() {
  const next = levelIndex + 1;

  if (next >= LEVEL_COUNT) {
    // Every level restored. Back to the title screen, which is where the
    // wordmark and the full-colour palette live -- a fitting place to land.
    inMenu = true;
    showToast('all colour restored  --  thank you for playing', elapsed, 7);
    return;
  }

  loadLevel(next);
  startLevel();
  showToast('level ' + (next + 1) + ' of ' + LEVEL_COUNT, elapsed, 3);
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
  // Put the player back at the arena mouth, just short of re-engaging.
  player.y = level.bossSpawn.y - player.h;
  player.x = clearRespawnX(level.bossArenaX - 60, player.y);
}

/**
 * Find a spot at or left of `x` that the player can actually stand in.
 *
 * The arena mouth used to be a fixed `bossArenaX - 60`, and on level 2 that
 * landed exactly inside a pillar: the player respawned embedded in terrain and
 * could not move in any direction, which reads as the entire game freezing
 * rather than as a bad respawn.
 *
 * Nudging that one pillar would have fixed the symptom and left the next level
 * edit free to reintroduce it, so the respawn searches instead -- stepping back
 * toward the way the player came until the body is clear of terrain and has
 * ground beneath it. `npm run check:level` proves such a spot exists on every
 * level, so the fallback at the end is unreachable in shipped content.
 */
function clearRespawnX(x, y) {
  for (let back = 0; back <= 400; back += 10) {
    const candidate = x - back;
    const clear = !overlapsSolid(candidate, y, player.w, player.h);
    const grounded = overlapsSolid(candidate, y + 1, player.w, player.h);
    if (clear && grounded) return candidate;
  }
  return x;
}

function render() {
  if (inMenu) {
    drawMenu(ctx, viewW, viewH, elapsed);
    return;
  }

  ctx.save();
  applyCamera(ctx);

  const view = { x: camera.x, y: camera.y, w: viewW, h: viewH };
  drawWorld(ctx, view);
  drawEnemies(ctx, view);
  drawBoss(ctx, view, restorationAmount());
  drawBossAttack(ctx);
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
    triggerBossRestoration,

    /**
     * Advance the simulation by hand.
     *
     * Browsers throttle requestAnimationFrame to nothing when a tab is not
     * compositing, which makes the game untestable from an automated harness --
     * the loop simply stops. This drives update() directly so a test can
     * reproduce a bug deterministically regardless of what the tab is doing.
     */
    step: (dt) => update(dt),

    /** Draw one frame by hand. Paired with step(), this is the whole loop. */
    draw: () => render(),

    /** Jump straight to a level, to test its geometry without playing to it. */
    goToLevel: (i) => {
      inMenu = false;
      loadLevel(i);
      startLevel();
    },

    // Getters, not values: these change over a run, and a plain property would
    // freeze whatever they happened to be when this object was built.
    get levelIndex() {
      return levelIndex;
    },
    get inMenu() {
      return inMenu;
    },
    get levelTransition() {
      return levelTransition;
    },
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
