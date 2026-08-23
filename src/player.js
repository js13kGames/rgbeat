/**
 * The player unicorn: platformer physics and procedural rendering.
 *
 * The unicorn is the only saturated thing on screen (GDD Section 2, pillar 1),
 * so it is drawn as a pale silhouette with a rainbow mane -- the mane is the
 * colour, the body stays near-white so it reads against both the grayscale
 * world and a fully restored one.
 *
 * It also owns the health state from Section 5 -- hearts, i-frames, knockback
 * and the hurt flicker -- because all of it acts on the same body.
 */
import {
  GRAVITY,
  MOVE_SPEED,
  ACCEL,
  AIR_ACCEL,
  FRICTION,
  JUMP_VELOCITY,
  JUMP_CUT_MULTIPLIER,
  MAX_FALL_SPEED,
  COYOTE_TIME,
  JUMP_BUFFER,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  MAX_HEARTS,
  IFRAME_TIME,
  HURT_KNOCKBACK_X,
  HURT_KNOCKBACK_Y,
  HURT_STUN,
} from './config.js';
import { palette, rainbow } from './palette.js';
import { level, overlapsSolid } from './world.js';
import { wobble } from './render.js';

export const player = {
  x: level.spawn.x,
  y: level.spawn.y,
  vx: 0,
  vy: 0,
  w: PLAYER_WIDTH,
  h: PLAYER_HEIGHT,
  /** -1 or 1. Combos default to this when no aim is given (Section 3.1). */
  facing: 1,
  onGround: false,
  /** Seconds since last on ground, for coyote time. */
  airTime: 0,
  /** Seconds since jump was requested, for input buffering. */
  jumpBuffered: 99,
  /** Drives the gallop cycle and mane sway. */
  animTime: 0,

  // --- Health (GDD Section 5) ---
  hearts: MAX_HEARTS,
  /** Seconds of invulnerability remaining. Also drives the hurt flicker. */
  invuln: 0,
  /** Seconds the player cannot steer, so a hit reads as a real interruption. */
  stun: 0,
};

/** Move the player back to the spawn point without touching their health. */
export function resetPlayer() {
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.stun = 0;
}

/** Full reset: position and health. Used when a life is lost entirely. */
export function revivePlayer() {
  resetPlayer();
  player.hearts = MAX_HEARTS;
  player.invuln = 0;
}


/**
 * Take one heart of damage.
 *
 * Grants i-frames plus knockback away from the source, both so the hit is
 * readable and so a single contact cannot chain into several lost hearts
 * (Section 5). Returns true if the damage was actually applied.
 *
 * @param {number} fromX x position of whatever dealt the damage, for knockback
 *   direction. Omit for hazards with no meaningful direction (e.g. a pit).
 */
export function damagePlayer(fromX) {
  if (player.invuln > 0) return false;

  player.hearts--;
  player.invuln = IFRAME_TIME;
  player.stun = HURT_STUN;

  if (fromX !== undefined) {
    const away = player.x + player.w / 2 < fromX ? -1 : 1;
    player.vx = away * HURT_KNOCKBACK_X;
    player.vy = HURT_KNOCKBACK_Y;
    player.onGround = false;
  }

  return true;
}

/**
 * Advance the player.
 * @param {number} dt
 * @param {{move:number, jumpHeld:boolean, jumpPressed:boolean}} intent
 *   Movement intent, already resolved by the caller. Passed in rather than read
 *   from the keyboard directly because the combo system takes the arrow keys
 *   away while aiming (Section 3.1) -- during that time `move` is simply 0.
 */
export function updatePlayer(dt, intent) {
  if (player.invuln > 0) player.invuln -= dt;

  // While stunned the player keeps their knockback momentum but cannot steer,
  // which is what makes a hit feel like an interruption rather than a nudge.
  if (player.stun > 0) {
    player.stun -= dt;
    intent = { move: 0, jumpHeld: false, jumpPressed: false };
  }

  // --- Horizontal ---
  const accel = player.onGround ? ACCEL : AIR_ACCEL;
  if (intent.move !== 0) {
    player.vx += intent.move * accel * dt;
    player.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.vx));
    player.facing = intent.move > 0 ? 1 : -1;
  } else if (player.onGround) {
    // Friction only on the ground; air movement keeps its momentum.
    const drop = FRICTION * dt;
    player.vx = Math.abs(player.vx) <= drop ? 0 : player.vx - Math.sign(player.vx) * drop;
  }

  // --- Jump ---
  player.jumpBuffered = intent.jumpPressed ? 0 : player.jumpBuffered + dt;
  const canJump = player.onGround || player.airTime < COYOTE_TIME;

  // Set each frame so the caller can react to a jump without polling state.
  player.justJumped = false;

  if (player.jumpBuffered < JUMP_BUFFER && canJump) {
    player.vy = JUMP_VELOCITY;
    player.jumpBuffered = 99;
    player.airTime = COYOTE_TIME; // consume the coyote window
    player.onGround = false;
    player.justJumped = true;
  }

  // Variable jump height: releasing early cuts the rise short.
  if (!intent.jumpHeld && player.vy < 0) {
    player.vy *= 1 - (1 - JUMP_CUT_MULTIPLIER) * Math.min(1, dt * 60);
  }

  // --- Gravity ---
  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL_SPEED);

  // --- Integrate, resolving each axis separately so collisions stay clean ---
  moveAxis(dt * player.vx, 0);
  const wasFalling = player.vy > 0;
  player.onGround = false;
  moveAxis(0, dt * player.vy);

  player.airTime = player.onGround ? 0 : player.airTime + dt;
  if (player.onGround && wasFalling) player.vy = 0;

  // Keep the player inside the level horizontally.
  player.x = Math.max(0, Math.min(level.width - player.w, player.x));

  player.animTime += dt;
}

/**
 * Move one axis and stop against solids. Steps in whole pixels so a fast fall
 * can never tunnel through a thin ledge.
 */
function moveAxis(dx, dy) {
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
  if (steps === 0) return;

  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 0; i < steps; i++) {
    const nx = player.x + stepX;
    const ny = player.y + stepY;

    if (overlapsSolid(nx, ny, player.w, player.h)) {
      if (dy > 0) player.onGround = true;
      if (dy !== 0) player.vy = 0;
      else player.vx = 0;
      return;
    }

    player.x = nx;
    player.y = ny;
  }
}

// --- Rendering --------------------------------------------------------------

/**
 * Draw the unicorn.
 *
 * Built from simple shapes rather than a sprite: a body capsule, four legs on a
 * gallop cycle, a head wedge, the horn, and a mane of rainbow strands. Shape
 * proportions are the tunable part -- keep them here rather than scattering
 * magic numbers, so the silhouette can be refined against the concept art.
 */
export function drawPlayer(ctx) {
  const { x, y, w, h, facing, animTime, onGround, vx } = player;

  ctx.save();

  // Hurt flicker. Blinking the one saturated thing on screen is unusually
  // legible here, precisely because nothing else is coloured.
  if (player.invuln > 0 && Math.floor(player.invuln * 18) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  // Draw in a local space with the origin at the player's feet, mirrored by
  // facing, so all the shape maths below can assume "facing right".
  ctx.translate(x + w / 2, y + h);
  ctx.scale(facing, 1);

  const speed = Math.abs(vx) / MOVE_SPEED;
  // Gallop cycle only advances while actually running on the ground.
  const gait = onGround ? animTime * 11 : 0;
  const bob = onGround ? Math.sin(gait * 2) * 1.4 * speed : 0;

  drawLegs(ctx, gait, speed, onGround, h);
  drawBody(ctx, bob, h, w);
  drawMane(ctx, animTime, bob, h, speed);
  drawHead(ctx, bob, h, w);

  ctx.restore();
}

function drawLegs(ctx, gait, speed, onGround, h) {
  ctx.strokeStyle = palette.playerShade;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  // Four legs, paired diagonally as a horse actually moves.
  const legs = [
    [-9, 0],
    [-6, Math.PI],
    [8, Math.PI * 0.5],
    [11, Math.PI * 1.5],
  ];

  for (const [lx, phase] of legs) {
    // Airborne, the legs tuck instead of cycling.
    const swing = onGround ? Math.sin(gait + phase) * 0.5 * speed : -0.35;
    const lift = onGround ? Math.max(0, Math.cos(gait + phase)) * 5 * speed : 6;
    ctx.beginPath();
    ctx.moveTo(lx, -h * 0.42);
    ctx.lineTo(lx + swing * 9, -lift);
    ctx.stroke();
  }
}

function drawBody(ctx, bob, h, w) {
  ctx.fillStyle = palette.playerBody;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.55 + bob, w * 0.42, h * 0.24, -0.06, 0, Math.PI * 2);
  ctx.fill();
}

function drawHead(ctx, bob, h, w) {
  const hx = w * 0.36;
  const hy = -h * 0.78 + bob;

  ctx.fillStyle = palette.playerBody;

  // Neck: a wedge from the shoulder up to the head.
  ctx.beginPath();
  ctx.moveTo(w * 0.1, -h * 0.52 + bob);
  ctx.lineTo(hx - 3, hy + 8);
  ctx.lineTo(hx + 5, hy + 9);
  ctx.lineTo(w * 0.22, -h * 0.45 + bob);
  ctx.closePath();
  ctx.fill();

  // Muzzle.
  ctx.beginPath();
  ctx.ellipse(hx + 2, hy, 8, 5.5, 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Ear.
  ctx.beginPath();
  ctx.moveTo(hx - 3, hy - 4);
  ctx.lineTo(hx - 1, hy - 10);
  ctx.lineTo(hx + 2, hy - 4);
  ctx.closePath();
  ctx.fill();

  // Horn: the one place the player's own colour concentrates, so it stays
  // legible as the source of every ability.
  const horn = ctx.createLinearGradient(hx + 3, hy - 6, hx + 12, hy - 20);
  horn.addColorStop(0, rainbow(0.08, 70));
  horn.addColorStop(0.5, rainbow(0.45, 65));
  horn.addColorStop(1, rainbow(0.75, 75));
  ctx.fillStyle = horn;
  ctx.beginPath();
  ctx.moveTo(hx + 1, hy - 5);
  ctx.lineTo(hx + 13, hy - 21);
  ctx.lineTo(hx + 6, hy - 4);
  ctx.closePath();
  ctx.fill();

  // Eye.
  ctx.fillStyle = '#2a2333';
  ctx.beginPath();
  ctx.arc(hx - 1, hy - 1, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The mane and tail: the rainbow that gives the game its theme. Drawn as
 * layered strands whose hue steps through the spectrum, swaying with motion.
 */
function drawMane(ctx, time, bob, h, speed) {
  ctx.lineCap = 'round';

  const strands = 7;
  for (let i = 0; i < strands; i++) {
    const t = i / strands;
    const sway = Math.sin(time * 6 - i * 0.5) * (2 + speed * 5);

    ctx.strokeStyle = rainbow(t, 62);
    ctx.lineWidth = 3.2;

    // Mane, running down the neck.
    ctx.beginPath();
    ctx.moveTo(10 - i * 1.5, -h * 0.74 + bob + i * 1.2);
    ctx.quadraticCurveTo(
      2 - i * 2.5,
      -h * 0.66 + bob + i * 2,
      -6 - i * 2 - sway * 0.5,
      -h * 0.5 + bob + i * 2.6 + wobble(i)
    );
    ctx.stroke();

    // Tail, streaming behind.
    ctx.beginPath();
    ctx.moveTo(-14, -h * 0.6 + bob + i * 0.8);
    ctx.quadraticCurveTo(
      -22 - sway,
      -h * 0.55 + bob + i * 1.6,
      -30 - sway * 1.6,
      -h * 0.3 + bob + i * 2.4 + wobble(i + 9)
    );
    ctx.stroke();
  }
}
