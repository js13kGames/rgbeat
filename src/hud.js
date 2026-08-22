/**
 * HUD (GDD Section 11).
 *
 * Currently: the three ability-key indicators with their cooldown state, and
 * the on-player combo/aim indicator. Hearts and the ultimate bar join them in
 * later phases.
 *
 * Section 11 is explicit about what does NOT belong here: there is no
 * combo-streak counter, no score multiplier, and no "suggested next sequence"
 * hint. The reference concept art shows all three; they were reviewed and
 * deliberately rejected. Do not add them.
 *
 * The visual language (ring, diamond core glyph, key cap below) is taken from
 * docs/reference/UI.png, translated into flat procedural shapes.
 */
import { palette } from './palette.js';
import { KEYS, cooldowns, cooldownProgress, combo, isArmed } from './combo.js';
import { AIM_WINDOW } from './config.js';

/** Which colour each key shows on its HUD button (its base colour, Section 4). */
const KEY_COLOR = { q: 'blue', w: 'red', e: 'green' };

const BUTTON_RADIUS = 26;
const BUTTON_GAP = 78;
const BUTTON_BOTTOM_MARGIN = 58;

/**
 * Draw the screen-space HUD. Call after the camera transform is restored.
 */
export function drawHud(ctx, viewW, viewH) {
  const cx = viewW / 2;
  const cy = viewH - BUTTON_BOTTOM_MARGIN;

  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    drawAbilityButton(ctx, cx + (i - 1) * BUTTON_GAP, cy, key);
  }
}

function drawAbilityButton(ctx, x, y, key) {
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
  ctx.arc(0, 0, BUTTON_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Cooldown fill, sweeping from the top.
  if (!ready) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, BUTTON_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    // Ready: full bright ring, plus a glow so "ready" is unambiguous at a
    // glance rather than something the player has to read.
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = armed ? 18 : 10;
    ctx.beginPath();
    ctx.arc(0, 0, BUTTON_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Core glyph: the diamond from the reference art. Filled when ready, hollow
  // while recharging -- a shape difference, so the state does not rely on
  // colour alone.
  const size = BUTTON_RADIUS * 0.44;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size, 0);
  ctx.closePath();

  if (ready) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = palette.hudDim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Key cap.
  ctx.fillStyle = ready ? palette.hudText : palette.hudDim;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(key.toUpperCase(), 0, BUTTON_RADIUS + 16);

  // Remaining seconds, so the cooldown is a readout and not just a gauge.
  if (!ready) {
    ctx.fillStyle = palette.hudDim;
    ctx.font = '10px monospace';
    ctx.fillText(cooldowns[key].toFixed(1), 0, 0);
  }

  ctx.restore();
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
