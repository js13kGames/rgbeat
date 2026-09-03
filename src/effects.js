/**
 * Ability effects: the visible, damaging expression of a fired combo.
 *
 * Each mechanic archetype (GDD Section 4) has its own shape, which is both what
 * you see and what actually tests against enemies:
 *
 *   dash     a fast strike along the dash path -> long oriented box
 *   assault  a forward strike                  -> oriented box
 *   flow     a wide sweeping arc               -> cone
 *
 * The output colour is carried on the effect and comes from the palette by
 * name, never as a literal, so colourblind swaps reach ability VFX too.
 *
 * Each effect also carries its output colour's glyph (Section 10), so the
 * player can confirm which colour they fired without relying on hue.
 */
import { ABILITY_RANGE, EFFECT_LIFETIME, ULTIMATE_RADIUS, ULTIMATE_LIFETIME } from './config.js';

/** Half-height of the dash trail. Matches the player's own silhouette. */
const DASH_HALF_WIDTH = 18;
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

  if (effect.archetype === 'dash' || effect.archetype === 'assault') {
    // Both project onto the aim axis; the dash simply reaches much further,
    // because its range is the distance the player actually travels.
    const reach = ABILITY_RANGE[effect.archetype];
    const along = dx * effect.aimX + dy * effect.aimY;
    const across = Math.abs(dx * -effect.aimY + dy * effect.aimX);
    return along >= -r && along <= reach + r && across <= ASSAULT_HALF_WIDTH + r;
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
  } else if (effect.archetype === 'dash') {
    drawDash(ctx, t, color, effect);
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
/**
 * Dash: a trail down the ground the player just crossed.
 *
 * Drawn as a streak rather than a nova because that is what the ability now
 * does -- it covers distance, and the strike is everything the player passed
 * through. A circle centred on the player would show none of that.
 */
function drawDash(ctx, t, color, effect) {
  ctx.rotate(Math.atan2(effect.aimY, effect.aimX));

  const len = ABILITY_RANGE.dash * Math.min(1, t * 1.6);

  // The trail: brightest at the leading edge, thinning back to the start.
  const grad = ctx.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -DASH_HALF_WIDTH * 0.35);
  ctx.lineTo(len, -DASH_HALF_WIDTH * (1 - t));
  ctx.lineTo(len, DASH_HALF_WIDTH * (1 - t));
  ctx.lineTo(0, DASH_HALF_WIDTH * 0.35);
  ctx.closePath();
  ctx.fill();

  // Afterimages: a few fading copies of the player's silhouette along the
  // path, which is the cheapest way to read "you were invulnerable here".
  ctx.globalAlpha = (1 - t) * 0.7;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    const x = (len * i) / 5;
    const h = DASH_HALF_WIDTH * 1.4 * (1 - t);
    ctx.strokeRect(x - 5, -h, 10, h * 2);
  }
  ctx.globalAlpha = 1;
}


/** Assault: a hard forward streak with a bright leading edge. */
function drawAssault(ctx, t, color, effect) {
  ctx.rotate(Math.atan2(effect.aimY, effect.aimX));

  const len = ABILITY_RANGE.assault * (0.55 + t * 0.6);
  const halfW = ASSAULT_HALF_WIDTH * (1 - t * 0.55);

  // Speed lines trailing the strike. Assault is the archetype that MOVES the
  // player, and the old lens shape read as static; these sell the lunge that
  // the mechanic is actually doing.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = (1 - t) * 0.55;
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * halfW * 0.55;
    const back = len * (0.15 + i * 0.08);
    ctx.beginPath();
    ctx.moveTo(-back * 0.8, off);
    ctx.lineTo(len * (0.45 + t * 0.3), off * 0.35);
    ctx.stroke();
  }
  ctx.globalAlpha = 1 - t;

  const grad = ctx.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;

  // A spearhead rather than a symmetrical lens: the leading edge is sharp and
  // the tail drags, so the direction of the lunge reads instantly.
  ctx.beginPath();
  ctx.moveTo(-len * 0.18, 0);
  ctx.quadraticCurveTo(len * 0.45, -halfW, len, 0);
  ctx.quadraticCurveTo(len * 0.45, halfW, -len * 0.18, 0);
  ctx.fill();

  // Impact sparks at the tip, thrown back along the strike.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * 3;
    const r = halfW * (0.6 + t * 2.4);
    ctx.beginPath();
    ctx.moveTo(len + Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
    ctx.lineTo(len + Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }

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
