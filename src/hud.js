/**
 * HUD (GDD Section 11).
 *
 * The heart row, the ultimate bar, the three ability-key cooldown indicators,
 * the boss readout and the on-player combo/aim indicator.
 *
 * Section 11 is explicit about what does NOT belong here: there is no
 * combo-streak counter, no score multiplier, and no "suggested next sequence"
 * hint. The reference concept art shows all three; they were reviewed and
 * deliberately rejected. Do not add them.
 *
 * The visual language (ring, core glyph, key cap below) is taken from
 * docs/reference/UI.png, translated into flat procedural shapes. Every colour
 * marker uses that colour's glyph rather than a shared diamond, so the HUD is
 * readable without hue (Section 10).
 */
import { palette, rainbow, HIT_COLORS } from './palette.js';
import { KEYS, cooldowns, cooldownProgress, combo, isArmed } from './combo.js';
import { AIM_WINDOW, MAX_HEARTS } from './config.js';
import { player } from './player.js';
import { ultimate, isUltimateReady } from './ultimate.js';
import { boss, bossActive, windowProgress } from './boss.js';
import { levelIndex, LEVEL_COUNT } from './world.js';
import { drawGlyph } from './render.js';
import { isTouch } from './touch.js';

/** Which colour each key shows on its HUD button (its base colour, Section 4). */
const KEY_COLOR = { q: 'blue', w: 'red', e: 'green' };

const BUTTON_RADIUS = 26;
const BUTTON_GAP = 78;
const BUTTON_BOTTOM_MARGIN = 58;

/** Touch buttons are bigger: a 26px radius is below a comfortable tap target. */
const TOUCH_BUTTON_RADIUS = 34;

/**
 * The ultimate bar's rectangle. Exported so touch can use it as a tap target:
 * the ultimate is the one action with no button of its own, and on touch there
 * is no R key to fall back on.
 */
/**
 * Screen position of the ultimate button.
 *
 * Exported for the same reason as abilityButtonPos: touch hit-tests against it,
 * so the drawn button and its tap target cannot drift apart.
 *
 * On desktop it sits at the end of the ability row but behind a wider gap than
 * separates Q/W/E from each other. That gap is the point: the ultimate is
 * explicitly OUTSIDE the combo grammar (Section 4.3) -- its own key, its own
 * resource, unaffected by the per-key cooldowns -- and grouping it flush with
 * the three would say the opposite.
 */
export function ultimateButtonPos(viewW, viewH) {
  const r = buttonRadius();
  if (isTouch()) {
    return { x: viewW - r - 26 - r * 2.1, y: viewH - r - 26 - r * 2.9 };
  }
  return { x: viewW / 2 + 2 * BUTTON_GAP + 30, y: viewH - BUTTON_BOTTOM_MARGIN };
}

export function buttonRadius() {
  return isTouch() ? TOUCH_BUTTON_RADIUS : BUTTON_RADIUS;
}

/**
 * Screen position of ability button `i`.
 *
 * Shared by drawing and by touch hit-testing, so the visible button and its
 * tap target can never drift apart.
 *
 * On touch the three buttons move to the lower right and stack into an arc,
 * per Section 3.2 -- thumb-reachable, and clear of the left-hand movement zone.
 */
export function abilityButtonPos(i, viewW, viewH) {
  if (isTouch()) {
    const r = TOUCH_BUTTON_RADIUS;
    return {
      x: viewW - r - 26 - (i === 1 ? r * 2.1 : 0),
      y: viewH - r - 26 - (i === 0 ? 0 : i === 1 ? r * 0.5 : r * 2.1),
    };
  }
  return { x: viewW / 2 + (i - 1) * BUTTON_GAP, y: viewH - BUTTON_BOTTOM_MARGIN };
}

/**
 * Draw the screen-space HUD. Call after the camera transform is restored.
 */
export function drawHud(ctx, viewW, viewH, elapsed) {
  for (let i = 0; i < KEYS.length; i++) {
    const p = abilityButtonPos(i, viewW, viewH);
    drawAbilityButton(ctx, p.x, p.y, KEYS[i]);
  }

  if (isTouch()) drawMoveZone(ctx, viewH);

  drawHearts(ctx, 26, 30);
  drawLevelBadge(ctx, viewW);
  const up = ultimateButtonPos(viewW, viewH);
  drawUltimateButton(ctx, up.x, up.y, elapsed);
  if (bossActive()) drawBossBar(ctx, viewW);
  drawToast(ctx, viewW, viewH, elapsed);
}

/**
 * Boss readout (GDD Section 6.4): remaining hits, the colour currently exposed,
 * and the colour coming next once it is being telegraphed.
 *
 * The telegraph is shown here as well as on the boss itself, because during a
 * fight the player's eyes are on their own position as often as on the boss.
 */
function drawBossBar(ctx, viewW) {
  const w = 260;
  const x = (viewW - w) / 2;
  const y = 26;

  // Remaining hits, as discrete pips rather than a continuous bar: the boss
  // takes a fixed number of correct reads, and pips say that plainly.
  //
  // Sized to THIS boss, not to the global maximum. The tutorial's boss has
  // three hit points, and drawing ten slots with three filled said it was
  // already most of the way dead before the fight began.
  const pips = boss.maxHp;
  const pipW = w / pips - 4;
  for (let i = 0; i < pips; i++) {
    const px = x + i * (pipW + 4);
    if (i < boss.hp) {
      ctx.fillStyle = palette.hudText;
      ctx.fillRect(px, y, pipW, 6);
    } else {
      ctx.strokeStyle = palette.hudDim;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, y + 0.5, pipW - 1, 5);
    }
  }

  // Currently exposed colour.
  const cx = viewW / 2;
  drawMarker(ctx, cx, y + 30, 10, boss.weak, 1, 16);

  // Countdown ring around it, so the window's remaining time is visible.
  ctx.strokeStyle = palette[boss.weak];
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(cx, y + 30, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - windowProgress()));
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Telegraphed next colour, to the right with an arrow.
  //
  // Shown for the whole window rather than only its last beat, matching the
  // ring on the boss itself. Two indicators of the same thing appearing at
  // different moments read as two different signals.
  ctx.strokeStyle = palette.hudDim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + 26, y + 30);
  ctx.lineTo(cx + 40, y + 30);
  ctx.moveTo(cx + 35, y + 25);
  ctx.lineTo(cx + 40, y + 30);
  ctx.lineTo(cx + 35, y + 35);
  ctx.stroke();

  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 70);
  drawMarker(ctx, cx + 54, y + 30, 8, boss.next, pulse, 12 * pulse);
}

/** One colour marker, drawn with that colour's glyph (Section 10). */
function drawMarker(ctx, x, y, size, colorName, alpha, glow) {
  const color = palette[colorName];
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  drawGlyph(ctx, HIT_COLORS.indexOf(colorName), size);
  ctx.fill();
  ctx.restore();
}

/** Which level this is, so progress through the game is legible at a glance. */
function drawLevelBadge(ctx, viewW) {
  ctx.fillStyle = palette.hudDim;
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(levelIndex + 1 + ' / ' + LEVEL_COUNT, viewW - 22, 18);
}

/**
 * The heart row (GDD Sections 5 and 11).
 *
 * Hearts cycle through a rainbow purely as theme. Section 5 is explicit that a
 * heart's hue carries NO gameplay meaning and must not be confusable with the
 * six hit-colours -- so this reads from `rainbow()` rather than the palette's
 * colour slots, and the cycle is continuous rather than landing on named hues.
 */
function drawHearts(ctx, x, y) {
  // Red, not a rainbow. Health is the one readout that must never be mistaken
  // for a colour REQUIREMENT: every other coloured thing on screen names a
  // combo the player has to answer with, and hearts that cycled through the
  // same six hues were speaking the game's own vocabulary without meaning it.
  const size = 13;
  const gap = 32;

  for (let i = 0; i < MAX_HEARTS; i++) {
    const filled = i < player.hearts;
    const hx = x + i * gap;

    ctx.save();
    ctx.translate(hx, y);

    if (filled) {
      ctx.fillStyle = palette.red;
      ctx.shadowColor = palette.red;
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = palette.hudDim;
      ctx.lineWidth = 1.5;
    }

    // A heart from two arcs and a point.
    ctx.beginPath();
    ctx.moveTo(0, size * 0.75);
    ctx.bezierCurveTo(-size * 1.4, -size * 0.2, -size * 0.5, -size * 1.1, 0, -size * 0.35);
    ctx.bezierCurveTo(size * 0.5, -size * 1.1, size * 1.4, -size * 0.2, 0, size * 0.75);
    ctx.closePath();

    if (filled) ctx.fill();
    else ctx.stroke();

    ctx.restore();
  }
}

/**
 * The ultimate bar (Section 11): the one UI element allowed to show full
 * colour, filling with the spectrum as it charges.
 */
/**
 * The ultimate, as a button in the ability row rather than a bar in the corner.
 *
 * It was a meter at the top left, diagonally opposite the buttons the player
 * actually watches, so charge state lived in the one corner nobody looks at
 * mid-fight. As a ring around a button it is read in the same glance as the
 * three cooldowns, and the ring encodes progress the same way they do, so
 * there is one visual grammar for "how ready is this" instead of two.
 */
function drawUltimateButton(ctx, x, y, elapsed) {
  const r = buttonRadius();
  const charge = Math.max(0, Math.min(1, ultimate.charge));
  const ready = isUltimateReady();

  ctx.save();
  ctx.translate(x, y);

  // Track: the dim ring the charge fills around.
  ctx.strokeStyle = palette.hudDim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  if (ready) {
    // Full: a live rainbow ring, so the bar visibly IS the stolen colour coming
    // back rather than an abstract meter -- the one thing worth keeping from
    // the gradient bar this replaces.
    ctx.shadowColor = rainbow(elapsed * 0.4, 65);
    ctx.shadowBlur = 10 + Math.sin(elapsed * 6) * 6;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = rainbow(i / 6 + elapsed * 0.08, 58);
      ctx.beginPath();
      ctx.arc(0, 0, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else if (charge > 0) {
    // Charging: sweeps from the top, exactly like a cooldown, so the two
    // rings mean the same thing.
    ctx.strokeStyle = rainbow(elapsed * 0.08, 58);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Star: filled when ready, hollow while charging. Same shape-not-colour rule
  // as the ability glyphs (Section 10), so readiness never depends on hue.
  star(ctx, r * 0.5);

  if (ready) {
    ctx.fillStyle = rainbow(elapsed * 0.25, 70);
    ctx.fill();
  } else {
    ctx.strokeStyle = palette.hudDim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Key cap.
  if (!isTouch()) {
    ctx.fillStyle = ready ? palette.hudText : palette.hudDim;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', 0, r + 16);
  }

  ctx.restore();
}

/** Five-pointed star path, centred on the origin. */
function star(ctx, radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    // Alternate outer and inner points. 0.42 is the ratio that reads as a
    // star rather than as a cog at HUD size.
    const rad = i % 2 ? radius * 0.42 : radius;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
}

function drawAbilityButton(ctx, x, y, key) {
  const r = buttonRadius();
  const color = palette[KEY_COLOR[key]];
  const progress = cooldownProgress(key);
  const ready = cooldowns[key] <= 0;
  const armed = combo.key === key;

  ctx.save();
  ctx.translate(x, y);

  // Track: the dim ring the cooldown fills back around.
  ctx.strokeStyle = palette.hudDim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cooldown fill, sweeping from the top.
  if (!ready) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    // Ready: full bright ring, plus a glow so "ready" is unambiguous at a
    // glance rather than something the player has to read.
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = armed ? 18 : 10;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // What the key DOES, not what colour it is.
  //
  // These used to be the key's colour glyph, which taught the second half of
  // the grammar (Q means blue) and said nothing about the first (Q means
  // dash). The colour glyphs are still everywhere they carry weight -- enemy
  // cores, the boss ring, the effect itself -- so the button is free to teach
  // the mechanic instead, which is the half a new player cannot guess.
  //
  // Section 10's rule survives: the three icons are distinct SHAPES, so which
  // key is which never depends on telling three hues apart.
  ctx.strokeStyle = ready ? color : palette.hudDim;
  ctx.fillStyle = ready ? color : palette.hudDim;
  ctx.globalAlpha = ready ? 1 : 0.55;
  ctx.lineWidth = ready ? 3 : 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  archetypeIcon(ctx, key, r * 0.5);
  ctx.globalAlpha = 1;

  // Key cap.
  if (!isTouch()) {
    ctx.fillStyle = ready ? palette.hudText : palette.hudDim;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key.toUpperCase(), 0, r + 16);
  }

  // There used to be a numeric countdown here. At the old 1.8s cooldown it was
  // useful; at 0.35s it is an unreadable flicker, so the radial sweep carries
  // the state on its own.

  ctx.restore();
}

/**
 * The icon for what a key's archetype does.
 *
 * Drawn rather than stored: three shapes at this size cost less as code than
 * as any encoded form, and they have to recolour per palette mode anyway.
 *
 *   q  dash        chevrons, stacked into an arrow of travel
 *   w  projectile  a head with a tail, mid-flight
 *   e  wave        concentric arcs spreading outward
 */
function archetypeIcon(ctx, key, s) {
  if (key === 'q') {
    // Two chevrons: one alone reads as "next", two read as speed.
    for (const off of [-s * 0.55, s * 0.25]) {
      ctx.beginPath();
      ctx.moveTo(off, -s * 0.75);
      ctx.lineTo(off + s * 0.7, 0);
      ctx.lineTo(off, s * 0.75);
      ctx.stroke();
    }
    return;
  }

  if (key === 'w') {
    // Tail first, so the head sits at the leading edge like the effect does.
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(s * 0.1, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.6);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.1, s * 0.6);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // e: arcs opening to the right, growing outward.
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(-s * 0.55, 0, (s * 0.55 * i) / 1.5, -0.9, 0.9);
    ctx.stroke();
  }
}

/**
 * The on-player combo indicator: shown while a combo is armed, in world space.
 * Communicates two things the player needs mid-combo -- which archetype is
 * pending, and where it will go.
 */
export function drawComboIndicator(ctx, player) {
  if (!isArmed()) return;

  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  const color = palette[KEY_COLOR[combo.key]];
  const remaining = combo.timer / AIM_WINDOW;

  ctx.save();
  ctx.translate(cx, cy);

  // Aim arrow.
  const angle = Math.atan2(combo.aimY, combo.aimX);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(58, 0);
  ctx.moveTo(50, -6);
  ctx.lineTo(58, 0);
  ctx.lineTo(50, 6);
  ctx.stroke();
  ctx.rotate(-angle);

  // Aim-window ring: drains as the window closes, so the player can feel the
  // deadline instead of guessing at it.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining);
  ctx.stroke();

  ctx.restore();
}

// --- Toast ------------------------------------------------------------------
/**
 * A short-lived line of text, used for settings feedback and the opening key
 * hint. Section 10 asks for the colourblind mode to be a selectable setting;
 * with no menu in the byte budget, the cycle key plus a confirmation of what it
 * landed on is the honest minimum.
 */
let toastText = '';
let toastUntil = 0;

export function showToast(text, elapsed, seconds = 2.6) {
  toastText = text;
  toastUntil = elapsed + seconds;
}

function drawToast(ctx, viewW, viewH, elapsed) {
  if (elapsed > toastUntil) return;

  // Fade out over the last half second rather than vanishing.
  const remaining = toastUntil - elapsed;
  ctx.save();
  ctx.globalAlpha = Math.min(1, remaining * 2);
  ctx.fillStyle = palette.hudText;
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(toastText, viewW / 2, viewH - (isTouch() ? 210 : 96));
  ctx.restore();
}

/**
 * The left-hand movement zone (GDD Section 3.2).
 *
 * Drawn faintly rather than as a hard d-pad: it is a drag zone, so what matters
 * is communicating *where* to put a thumb, not which of four buttons to press.
 */
function drawMoveZone(ctx, viewH) {
  const cx = 84;
  const cy = viewH - 84;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = palette.hudText;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.stroke();

  // Arrows: drag horizontally to run, upward to jump.
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 14, cy);
  ctx.moveTo(cx - 22, cy - 5);
  ctx.lineTo(cx - 27, cy);
  ctx.lineTo(cx - 22, cy + 5);
  ctx.moveTo(cx + 26, cy);
  ctx.lineTo(cx + 14, cy);
  ctx.moveTo(cx + 22, cy - 5);
  ctx.lineTo(cx + 27, cy);
  ctx.lineTo(cx + 22, cy + 5);
  ctx.moveTo(cx, cy - 26);
  ctx.lineTo(cx, cy - 14);
  ctx.moveTo(cx - 5, cy - 22);
  ctx.lineTo(cx, cy - 27);
  ctx.lineTo(cx + 5, cy - 22);
  ctx.stroke();

  ctx.restore();
}
