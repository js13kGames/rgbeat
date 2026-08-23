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
import { palette, rainbow } from './palette.js';
import { KEYS, cooldowns, cooldownProgress, combo, isArmed } from './combo.js';
import { AIM_WINDOW, MAX_HEARTS, BOSS_MAX_HP } from './config.js';
import { player } from './player.js';
import { ultimate, isUltimateReady } from './ultimate.js';
import { boss, bossActive, windowProgress, isTelegraphing } from './boss.js';

/** Which colour each key shows on its HUD button (its base colour, Section 4). */
const KEY_COLOR = { q: 'blue', w: 'red', e: 'green' };

const BUTTON_RADIUS = 26;
const BUTTON_GAP = 78;
const BUTTON_BOTTOM_MARGIN = 58;

/**
 * Draw the screen-space HUD. Call after the camera transform is restored.
 */
export function drawHud(ctx, viewW, viewH, elapsed) {
  const cx = viewW / 2;
  const cy = viewH - BUTTON_BOTTOM_MARGIN;

  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    drawAbilityButton(ctx, cx + (i - 1) * BUTTON_GAP, cy, key);
  }

  drawHearts(ctx, 22, 24, elapsed);
  drawUltimateBar(ctx, 22, 52, elapsed);
  if (bossActive()) drawBossBar(ctx, viewW);
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
  const pips = BOSS_MAX_HP;
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
  drawDiamond(ctx, cx, y + 30, 10, palette[boss.weak], 1, 16);

  // Countdown ring around it, so the window's remaining time is visible.
  ctx.strokeStyle = palette[boss.weak];
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(cx, y + 30, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - windowProgress()));
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!isTelegraphing()) return;

  // Telegraphed next colour, to the right with an arrow.
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
  drawDiamond(ctx, cx + 54, y + 30, 8, palette[boss.next], pulse, 12 * pulse);
}

function drawDiamond(ctx, x, y, size, color, alpha, glow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * The heart row (GDD Sections 5 and 11).
 *
 * Hearts cycle through a rainbow purely as theme. Section 5 is explicit that a
 * heart's hue carries NO gameplay meaning and must not be confusable with the
 * six hit-colours -- so this reads from `rainbow()` rather than the palette's
 * colour slots, and the cycle is continuous rather than landing on named hues.
 */
function drawHearts(ctx, x, y, elapsed) {
  const size = 9;
  const gap = 24;

  for (let i = 0; i < MAX_HEARTS; i++) {
    const filled = i < player.hearts;
    const hx = x + i * gap;

    ctx.save();
    ctx.translate(hx, y);

    if (filled) {
      ctx.fillStyle = rainbow(elapsed * 0.12 + i / MAX_HEARTS, 62);
      ctx.shadowColor = rainbow(elapsed * 0.12 + i / MAX_HEARTS, 62);
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
function drawUltimateBar(ctx, x, y, elapsed) {
  const w = 150;
  const h = 9;
  const ready = isUltimateReady();

  // Track.
  ctx.strokeStyle = palette.hudDim;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  // Fill: a live rainbow gradient, so the bar visibly *is* the stolen colour
  // coming back rather than an abstract meter.
  const fill = Math.max(0, Math.min(1, ultimate.charge)) * w;
  if (fill > 0) {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    for (let i = 0; i <= 6; i++) {
      grad.addColorStop(i / 6, rainbow(i / 6 + elapsed * 0.08, 58));
    }
    ctx.fillStyle = grad;
    if (ready) {
      // Pulse when full, so "available" is noticeable in peripheral vision.
      ctx.shadowColor = rainbow(elapsed * 0.4, 65);
      ctx.shadowBlur = 10 + Math.sin(elapsed * 6) * 6;
    }
    ctx.fillRect(x, y, fill, h);
    ctx.shadowBlur = 0;
  }

  // Key hint. The ultimate is the one action with no on-screen button of its
  // own, so without this its binding is undiscoverable.
  ctx.fillStyle = ready ? palette.hudText : palette.hudDim;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', x + w + 9, y + h / 2);
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
