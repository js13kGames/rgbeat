/**
 * Ability effects: the visible, damaging expression of a fired combo.
 *
 * Each mechanic archetype (GDD Section 4) has its own shape, which is both what
 * you see and what actually tests against enemies:
 *
 *   guard    a nova centred on the player      -> circle
 *   assault  a forward dash-strike             -> oriented box
 *   flow     a wide sweeping arc               -> cone
 *
 * The output colour is carried on the effect and comes from the palette by
 * name, never as a literal, so colourblind swaps reach ability VFX too.
 *
 * Shape/glyph redundancy for colourblind play (Section 10) attaches here, on
 * `drawEffect` -- that lands with the accessibility phase.
 */
import { ABILITY_RANGE, EFFECT_LIFETIME, ULTIMATE_RADIUS, ULTIMATE_LIFETIME } from './config.js';
import { palette, rainbow, HIT_COLORS } from './palette.js';
import { drawGlyph } from './render.js';

/** Live effects. Short-lived; the array stays tiny. */
export const effects = [];

/** Half-width of an assault dash-strike, in px. */
const ASSAULT_HALF_WIDTH = 22;

/** Half-angle of a flow arc, in radians. */
const FLOW_HALF_ANGLE = 0.85;

/**
 * Spawn an effect for a fired ability.
 * @param {object} ability the object returned by updateCombo
 * @param {number} x player centre x
 * @param {number} y player centre y
 */
export function spawnEffect(ability, x, y) {
  effects.push({
    archetype: ability.archetype,
    color: ability.color,
    name: ability.name,
    x,
    y,
    aimX: ability.aimX,
    aimY: ability.aimY,
    age: 0,
    life: EFFECT_LIFETIME,
    /** Enemies already hit by this effect, so one swing cannot hit twice. */
    hit: new Set(),
  });
}

/**
 * Spawn the ultimate: a full-spectrum explosion that hits every enemy on screen
 * at once, with all colours simultaneously (GDD Section 4.3).
 *
 * `ultimate` marks it as ignoring the colour-matching rule entirely -- it deals
 * heavy damage regardless of an enemy's current core, which is what makes it a
 * panic button rather than a bigger version of a normal ability.
 */
export function spawnUltimateEffect(x, y) {
  effects.push({
    archetype: 'ultimate',
    ultimate: true,
    color: null,
    name: 'Spectrum Break',
    x,
    y,
    aimX: 1,
    aimY: 0,
    age: 0,
    life: ULTIMATE_LIFETIME,
    hit: new Set(),
  });
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].age += dt;
    if (effects[i].age >= effects[i].life) effects.splice(i, 1);
  }
}

export function clearEffects() {
  effects.length = 0;
}

// --- Hit testing ------------------------------------------------------------

/**
 * Does `effect` overlap the given axis-aligned rect? Used by the combat phase
 * to resolve hits against enemy bodies.
 *
 * Tests against the rect's centre plus a radius approximation rather than doing
 * exact polygon intersection: enemies are small relative to every ability, so
 * the difference is imperceptible and the cheap version keeps bytes down.
 */
export function effectOverlaps(effect, rect) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.max(rect.w, rect.h) / 2;

  const dx = cx - effect.x;
  const dy = cy - effect.y;
  const dist = Math.hypot(dx, dy);

  if (effect.ultimate) {
    // Everything on screen, and it grows into that radius rather than applying
    // instantly, so the explosion visibly reaches each enemy before killing it.
    return dist <= ULTIMATE_RADIUS * (effect.age / effect.life) + r;
  }

  if (effect.archetype === 'guard') {
    return dist <= ABILITY_RANGE.guard + r;
  }

  if (effect.archetype === 'assault') {
    // Project onto the aim axis; must be within length ahead and within the
    // strike's half-width to the side.
    const along = dx * effect.aimX + dy * effect.aimY;
    const across = Math.abs(dx * -effect.aimY + dy * effect.aimX);
    return along >= -r && along <= ABILITY_RANGE.assault + r && across <= ASSAULT_HALF_WIDTH + r;
  }

  // flow: inside the radius and within the arc's angle.
  if (dist > ABILITY_RANGE.flow + r) return false;
  if (dist < 1) return true;
  const cos = (dx * effect.aimX + dy * effect.aimY) / dist;
  return cos >= Math.cos(FLOW_HALF_ANGLE);
}

// --- Rendering --------------------------------------------------------------

export function drawEffects(ctx) {
  for (const effect of effects) drawEffect(ctx, effect);
}

function drawEffect(ctx, effect) {
  const t = effect.age / effect.life;
  const fade = 1 - t;
  const color = palette[effect.color];

  ctx.save();
  ctx.translate(effect.x, effect.y);
  ctx.globalAlpha = fade;
  // Ability light is additive: it should look like colour being forced back
  // into a world that lost it, not like paint sitting on top.
  ctx.globalCompositeOperation = 'lighter';

  if (effect.ultimate) {
    drawUltimate(ctx, t);
  } else if (effect.archetype === 'guard') {
    drawGuard(ctx, t, color);
    drawEffectGlyph(ctx, effect, t, color);
  } else if (effect.archetype === 'assault') {
    drawAssault(ctx, t, color, effect);
    drawEffectGlyph(ctx, effect, t, color);
  } else {
    drawFlow(ctx, t, color, effect);
    drawEffectGlyph(ctx, effect, t, color);
  }

  ctx.restore();
}

/**
 * The output colour's glyph, riding along the effect (GDD Section 10).
 *
 * Ability effects need the same hue-independent readback as enemy cores: the
 * player has to be able to confirm which colour they actually just fired,
 * especially while learning that the second key -- not the first -- picks it.
 */
function drawEffectGlyph(ctx, effect, t, color) {
  const index = HIT_COLORS.indexOf(effect.color);
  if (index < 0) return;

  // Rides outward along the aim, so it sits on the strike rather than on the
  // player, and grows as the effect expands.
  const reach = ABILITY_RANGE[effect.archetype] * 0.45 * (0.4 + t);
  ctx.save();
  ctx.translate(effect.aimX * reach, effect.aimY * reach);
  ctx.globalAlpha = (1 - t) * 0.9;
  ctx.fillStyle = color;
  drawGlyph(ctx, index, 7 + t * 3);
  ctx.fill();
  ctx.restore();
}

/**
 * The ultimate: every colour at once, which is the whole point -- the player
 * briefly stops being "the only colour" and becomes all of it.
 */
function drawUltimate(ctx, t) {
  const r = ULTIMATE_RADIUS * t;

  // Spokes in all six hit-colours, so the full spectrum is literally present
  // rather than implied by a rainbow gradient.
  ctx.lineWidth = 6 * (1 - t) + 1;
  for (let i = 0; i < HIT_COLORS.length; i++) {
    const a = (i / HIT_COLORS.length) * Math.PI * 2 + t * 1.6;
    ctx.strokeStyle = palette[HIT_COLORS[i]];
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }

  // Expanding rainbow shockwave.
  const grad = ctx.createLinearGradient(-r, 0, r, 0);
  for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, rainbow(i / 6 + t));
  ctx.strokeStyle = grad;
  ctx.lineWidth = 10 * (1 - t) + 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Core flash, brightest at the start.
  const flash = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
  flash.addColorStop(0, 'rgba(255,255,255,' + (1 - t) * 0.9 + ')');
  flash.addColorStop(1, 'transparent');
  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Guard: a defensive nova expanding from the player. */
function drawGuard(ctx, t, color) {
  const r = ABILITY_RANGE.guard * (0.35 + t * 0.75);

  const grad = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.75, color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * (1 - t) + 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Assault: a hard forward streak with a bright leading edge. */
function drawAssault(ctx, t, color, effect) {
  ctx.rotate(Math.atan2(effect.aimY, effect.aimX));

  const len = ABILITY_RANGE.assault * (0.55 + t * 0.6);
  const halfW = ASSAULT_HALF_WIDTH * (1 - t * 0.55);

  const grad = ctx.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;

  // A lens shape: wide at the middle, tapering to a point at both ends.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -halfW, len, 0);
  ctx.quadraticCurveTo(len * 0.5, halfW, 0, 0);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(len, 0, halfW * 0.5 * (1 - t), 0, Math.PI * 2);
  ctx.stroke();
}

/** Flow: a wide arc sweeping through the aim direction. */
function drawFlow(ctx, t, color, effect) {
  ctx.rotate(Math.atan2(effect.aimY, effect.aimX));

  const r = ABILITY_RANGE.flow * (0.5 + t * 0.6);
  // The arc sweeps across its angle as it plays, reading as a whip crack
  // rather than a static wedge appearing.
  const sweep = -FLOW_HALF_ANGLE + t * FLOW_HALF_ANGLE * 2;

  const grad = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, sweep - 0.45, sweep + 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, sweep - 0.45, sweep + 0.45);
  ctx.stroke();
}
