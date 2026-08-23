/**
 * The boss (GDD Section 6.4).
 *
 * The boss carries ALL colours at once and requires the full combo vocabulary
 * to defeat. Only one colour is exposed at a time, and it cycles, so the player
 * must keep re-reading the boss and switching combos mid-fight instead of
 * executing a rotation from memory.
 *
 * Two design points from Section 6.4 that are easy to get wrong:
 *
 *  - The switch is TELEGRAPHED. The upcoming colour is shown a beat before it
 *    becomes active, which is what makes this a reaction check rather than a
 *    memorisation test.
 *  - The cycle is timer-based, per the Section 15 recommendation. It draws from
 *    a shuffled bag of all six colours rather than a fixed order, so it stays
 *    unpredictable while still guaranteeing every colour comes up once per
 *    rotation -- which is what actually forces the full vocabulary.
 *
 * The window length is constrained by Section 4.2, not chosen by feel: the
 * player must reliably land a hit inside every window at the current cooldown.
 * `npm run check:balance` proves that; do not change BOSS_WEAK_WINDOW or
 * COOLDOWN without re-running it.
 */
import {
  BOSS_WIDTH,
  BOSS_HEIGHT,
  BOSS_SPEED,
  BOSS_MAX_HP,
  BOSS_WEAK_WINDOW,
  BOSS_TELEGRAPH,
  BOSS_HIT_STUN,
  INK,
} from './config.js';
import { palette, HIT_COLORS } from './palette.js';
import { level } from './world.js';
import { effects, effectOverlaps } from './effects.js';
import { inkRect, mixColor, drawGlyph } from './render.js';

export const boss = {
  x: 0,
  y: 0,
  w: BOSS_WIDTH,
  h: BOSS_HEIGHT,
  hp: BOSS_MAX_HP,
  /** Colour currently exposed; only this one damages the boss. */
  weak: HIT_COLORS[0],
  /** Colour it will switch to, shown during the telegraph. */
  next: HIT_COLORS[1],
  /** Seconds left in the current window. */
  timer: BOSS_WEAK_WINDOW,
  dir: -1,
  flash: 0,
  phase: 0,
  alive: false,
  /** True once the player has entered the arena and the fight has begun. */
  engaged: false,
};

/** Shuffled bag of colours, refilled when empty. */
let bag = [];

function drawFromBag() {
  if (!bag.length) {
    bag = HIT_COLORS.slice();
    // Fisher-Yates.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Never let a reshuffle repeat the colour that is already showing: a
    // doubled window would read as the telegraph having lied.
    if (bag[0] === boss.weak && bag.length > 1) [bag[0], bag[1]] = [bag[1], bag[0]];
  }
  return bag.pop();
}

export function spawnBoss() {
  bag = [];
  boss.x = level.bossSpawn.x;
  boss.y = level.bossSpawn.y - BOSS_HEIGHT;
  boss.hp = BOSS_MAX_HP;
  boss.weak = drawFromBag();
  boss.next = drawFromBag();
  boss.timer = BOSS_WEAK_WINDOW;
  boss.flash = 0;
  boss.dir = -1;
  boss.alive = true;
  boss.engaged = false;
}

/** Is the fight on? Used for music intensity and death handling. */
export function bossActive() {
  return boss.alive && boss.engaged;
}

/** How far through the current window we are, 0..1. */
export function windowProgress() {
  return 1 - boss.timer / BOSS_WEAK_WINDOW;
}

/** Is the next colour being telegraphed right now? */
export function isTelegraphing() {
  return boss.timer <= BOSS_TELEGRAPH;
}

export function updateBoss(dt, playerX) {
  if (!boss.alive) return;

  // The fight begins when the player commits to the arena.
  if (!boss.engaged && playerX >= level.bossArenaX) boss.engaged = true;
  if (!boss.engaged) return;

  boss.phase += dt;
  if (boss.flash > 0) boss.flash -= dt;

  // Pace the arena, turning at its edges and at the level bound.
  boss.x += boss.dir * BOSS_SPEED * dt;
  if (boss.x <= level.bossArenaX + 20) {
    boss.x = level.bossArenaX + 20;
    boss.dir = 1;
  } else if (boss.x >= level.width - boss.w - 20) {
    boss.x = level.width - boss.w - 20;
    boss.dir = -1;
  }

  boss.timer -= dt;
  if (boss.timer <= 0) {
    boss.weak = boss.next;
    boss.next = drawFromBag();
    boss.timer = BOSS_WEAK_WINDOW;
  }
}

/**
 * Resolve ability effects against the boss.
 *
 * @param {(boss: object) => void} onHit
 * @param {(boss: object) => void} onDefeat
 * @returns {boolean} whether a wrong-colour hit landed, for feedback
 */
export function resolveBossHits(onHit, onDefeat) {
  if (!bossActive()) return false;

  let wrong = false;

  for (const effect of effects) {
    if (effect.hit.has(boss)) continue;
    if (!effectOverlaps(effect, boss)) continue;
    effect.hit.add(boss);

    // The ultimate hits with every colour at once, so it always connects.
    const matches = effect.ultimate || effect.color === boss.weak;

    if (!matches) {
      boss.flash = BOSS_HIT_STUN * 0.5;
      wrong = true;
      continue;
    }

    boss.hp--;
    boss.flash = BOSS_HIT_STUN;
    onHit(boss);

    if (boss.hp <= 0) {
      boss.alive = false;
      onDefeat(boss);
      return wrong;
    }

    // A landed hit also advances the cycle, so the player cannot park on one
    // colour and burst the boss down with a single ability.
    boss.weak = boss.next;
    boss.next = drawFromBag();
    boss.timer = BOSS_WEAK_WINDOW;
  }

  return wrong;
}

/** Does the boss overlap this rect? Contact damage, like any other enemy. */
export function bossTouching(rect) {
  if (!bossActive()) return null;
  return rect.x < boss.x + boss.w &&
    rect.x + rect.w > boss.x &&
    rect.y < boss.y + boss.h &&
    rect.y + rect.h > boss.y
    ? boss
    : null;
}

// --- Rendering --------------------------------------------------------------

export function drawBoss(ctx, view, t) {
  if (!boss.alive) return;
  if (boss.x + boss.w < view.x - 100 || boss.x > view.x + view.w + 100) return;

  const cx = boss.x + boss.w / 2;
  const bob = Math.sin(boss.phase * 2) * 3;
  const top = boss.y + bob;

  ctx.save();

  // A heavier, broader version of the human silhouette -- same visual family as
  // the ordinary enemies, scaled up so it reads as their source.
  ctx.fillStyle = mixColor('#08080c', '#2a2438', t * 0.5);

  ctx.beginPath();
  ctx.arc(cx, top + 20, 17, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - 27, top + 38);
  ctx.lineTo(cx + 27, top + 38);
  ctx.lineTo(cx + 19, top + 84);
  ctx.lineTo(cx - 19, top + 84);
  ctx.closePath();
  ctx.fill();

  const stride = Math.sin(boss.phase * 3) * 5;
  ctx.fillRect(cx - 18, top + 84, 13, 36 + stride);
  ctx.fillRect(cx + 5, top + 84, 13, 36 - stride);
  ctx.fillRect(cx - 36, top + 40, 9, 34);
  ctx.fillRect(cx + 27, top + 40, 9, 34);

  ctx.strokeStyle = mixColor(palette.inkFaint, palette.ink, 0.5);
  ctx.lineWidth = INK.lineWidth;
  inkRect(ctx, cx - 27, top + 38, 54, 46, boss.x * 0.1);
  ctx.stroke();

  drawColorRing(ctx, cx, top + 58);
  drawWeakCore(ctx, cx, top + 58);

  ctx.restore();
}

/**
 * The ring of all six colours around the boss's chest -- the literal statement
 * that it carries every stolen colour. The active one burns; the telegraphed
 * one pulses; the rest sit dormant.
 */
function drawColorRing(ctx, cx, cy) {
  const radius = 40;

  for (let i = 0; i < HIT_COLORS.length; i++) {
    const color = HIT_COLORS[i];
    const angle = (i / HIT_COLORS.length) * Math.PI * 2 + boss.phase * 0.35;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.72;

    const isWeak = color === boss.weak;
    const isNext = color === boss.next && isTelegraphing();

    ctx.save();
    ctx.translate(x, y);

    if (isWeak) {
      ctx.fillStyle = palette[color];
      ctx.shadowColor = palette[color];
      ctx.shadowBlur = 16;
    } else if (isNext) {
      // Telegraph: the incoming colour pulses awake before it takes over.
      const pulse = 0.5 + 0.5 * Math.sin(boss.phase * 14);
      ctx.globalAlpha = 0.35 + pulse * 0.65;
      ctx.fillStyle = palette[color];
      ctx.shadowColor = palette[color];
      ctx.shadowBlur = 10 * pulse;
    } else {
      // Dormant: present but drained, so all six are always visible.
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = palette[color];
    }

    // Glyph rather than a shared diamond: the ring has to be readable as six
    // distinct colours without relying on hue at all (Section 10).
    drawGlyph(ctx, i, isWeak ? 7 : 5.5);
    ctx.fill();
    ctx.restore();
  }
}

/** The main chest core, showing the currently exposed colour. */
function drawWeakCore(ctx, cx, cy) {
  const color = palette[boss.weak];
  const hurt = boss.flash > 0;
  const size = hurt ? 17 : 14;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = color;
  ctx.shadowBlur = hurt ? 30 : 20;

  const index = HIT_COLORS.indexOf(boss.weak);

  ctx.fillStyle = color;
  drawGlyph(ctx, index, size);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#fff';
  drawGlyph(ctx, index, size * 0.34);
  ctx.fill();

  ctx.restore();
}
