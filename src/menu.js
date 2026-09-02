/**
 * Title screen.
 *
 * Two decisions the player makes before starting: play, and which colour
 * palette to play with. GDD Section 10 asks for the colourblind mode to be
 * "a simple settings toggle/menu, selectable independent of any other
 * setting" -- putting it on the title screen satisfies that far better than the
 * in-game C key alone, because it is offered before the player has met a single
 * colour they need to read.
 *
 * The wordmark is the game's one non-procedural asset (see src/logo.js and
 * tools/encode-logo.mjs for why that exception exists and what it costs).
 * Everything else here is drawn, reusing the same ink-wash vocabulary as the
 * world so the title screen looks like the game rather than like a poster
 * bolted on the front.
 */
import { W as LOGO_W, H as LOGO_H, PALETTE as LOGO_PALETTE, PIXELS } from './logo.js';
import { palette, rainbow, PALETTE_MODES, paletteMode, setPaletteMode, savePaletteMode } from './palette.js';
import { isTouch } from './touch.js';
import { mixColor } from './render.js';

/** Which row is highlighted. */
let selected = 0;

/** Rows, in order. */
const ROW_PLAY = 0;
const ROW_PALETTE = 1;
const ROW_COUNT = 2;

/** Human-readable names for the palette modes. */
const MODE_LABEL = {
  default: 'Default',
  protanopia: 'Protanopia',
  deuteranopia: 'Deuteranopia',
  tritanopia: 'Tritanopia',
};

/**
 * The decoded wordmark, painted once into an offscreen canvas and then treated
 * as an ordinary image. Rebuilding it per frame would be wasteful; the string
 * only has to become pixels once.
 */
let logoCanvas = null;

function buildLogo() {
  const c = document.createElement('canvas');
  c.width = LOGO_W;
  c.height = LOGO_H;
  const g = c.getContext('2d');
  const image = g.createImageData(LOGO_W, LOGO_H);

  // Pre-parse the palette to RGB triples so the pixel loop stays cheap.
  const rgb = LOGO_PALETTE.map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

  for (let i = 0; i < PIXELS.length; i++) {
    const index = parseInt(PIXELS[i], 36);
    const o = i * 4;
    if (!index) continue; // 0 is transparent; the buffer starts zeroed
    const [r, g2, b] = rgb[index - 1];
    image.data[o] = r;
    image.data[o + 1] = g2;
    image.data[o + 2] = b;
    image.data[o + 3] = 255;
  }

  g.putImageData(image, 0, 0);
  return c;
}

// --- Input ------------------------------------------------------------------

/**
 * Advance the menu.
 * @returns {boolean} true when the player has chosen to start
 */
export function updateMenu(pressed) {
  if (pressed.up) selected = (selected + ROW_COUNT - 1) % ROW_COUNT;
  if (pressed.down) selected = (selected + 1) % ROW_COUNT;

  // Left/right cycles the palette from either row, so a player who never moves
  // the cursor can still find it.
  const step = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0);
  if (step) cyclePalette(step);

  if (pressed.confirm) {
    if (selected === ROW_PALETTE) {
      cyclePalette(1);
      return false;
    }
    return true;
  }

  return false;
}

function cyclePalette(step) {
  const i = PALETTE_MODES.indexOf(paletteMode);
  setPaletteMode(PALETTE_MODES[(i + step + PALETTE_MODES.length) % PALETTE_MODES.length]);
  savePaletteMode();
}

/**
 * Handle a tap. Rows are generous targets, and tapping the palette row cycles
 * it rather than starting the game -- on touch there is no cursor to move.
 * @returns {boolean} true when the tap starts the game
 */
export function tapMenu(x, y, viewW, viewH) {
  const rows = rowPositions(viewH);
  for (let i = 0; i < ROW_COUNT; i++) {
    if (Math.abs(y - rows[i]) < 26 && Math.abs(x - viewW / 2) < 240) {
      selected = i;
      if (i === ROW_PALETTE) {
        cyclePalette(1);
        return false;
      }
      return true;
    }
  }
  return false;
}

function rowPositions(viewH) {
  const base = viewH * 0.62;
  return [base, base + 52];
}

// --- Rendering --------------------------------------------------------------

export function drawMenu(ctx, viewW, viewH, elapsed) {
  if (!logoCanvas) logoCanvas = buildLogo();

  drawBackdrop(ctx, viewW, viewH, elapsed);
  drawLogo(ctx, viewW, viewH, elapsed);
  drawRows(ctx, viewW, viewH, elapsed);
  drawHint(ctx, viewW, viewH);
}

/**
 * The stolen-colour city, in the same flat ink silhouettes the world uses, with
 * the one rainbow the poster leads on cutting across it.
 */
function drawBackdrop(ctx, viewW, viewH, elapsed) {
  const grad = ctx.createLinearGradient(0, 0, 0, viewH);
  grad.addColorStop(0, palette.sky);
  grad.addColorStop(1, palette.fogNear);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);

  // Towers. Deterministic from the index so the skyline never flickers.
  // Lifted slightly off the sky so the city reads as a silhouette rather than
  // disappearing into the background entirely.
  ctx.fillStyle = mixColor(palette.fogFar, palette.ink, 0.12);
  for (let i = 0; i < 14; i++) {
    const n = Math.sin(i * 12.9898) * 43758.5453;
    const f = n - Math.floor(n);
    const w = 40 + f * 60;
    const h = viewH * (0.18 + f * 0.34);
    ctx.fillRect((i / 14) * (viewW + 120) - 60, viewH - h, w, h);
  }

  // The rainbow the poster leads on: a diagonal streak entering from the lower
  // left, kept low and faint so it frames the menu instead of cutting through
  // it. This is the only saturated thing on the screen besides the wordmark.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const o = i * 7;
    ctx.strokeStyle = rainbow(i / 7 + elapsed * 0.03, 58);
    ctx.beginPath();
    ctx.moveTo(-30, viewH + 30 - o);
    ctx.quadraticCurveTo(viewW * 0.42, viewH * 0.96 - o, viewW + 30, viewH * 0.66 - o);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLogo(ctx, viewW, viewH, elapsed) {
  // Fit to the viewport with a cap, so it never dominates a small window.
  const scale = Math.min((viewW * 0.82) / LOGO_W, 5.2);
  const w = LOGO_W * scale;
  const h = LOGO_H * scale;
  const x = (viewW - w) / 2;
  const y = viewH * 0.16 + Math.sin(elapsed * 1.4) * 4;

  // Nearest-neighbour: this is pixel art now, and smoothing would turn the
  // letterforms to mush.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(logoCanvas, x, y, w, h);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = palette.hudText;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.75;
  ctx.fillText('DEVUELVE LOS COLORES.', viewW / 2, y + h + 14);
  ctx.globalAlpha = 1;
}

function drawRows(ctx, viewW, viewH, elapsed) {
  const rows = rowPositions(viewH);
  const cx = viewW / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Row 0: start.
  drawRow(ctx, cx, rows[ROW_PLAY], 'PLAY', selected === ROW_PLAY, elapsed);

  // Row 1: palette, with its value inline so the current choice is readable
  // without entering anything.
  drawRow(
    ctx,
    cx,
    rows[ROW_PALETTE],
    'PALETTE:  ' + MODE_LABEL[paletteMode],
    selected === ROW_PALETTE,
    elapsed
  );

  // Swatches under the palette row: the actual six hit-colours in the chosen
  // mode, so the player can compare them before committing to a run.
  const swatchY = rows[ROW_PALETTE] + 26;
  const names = ['red', 'green', 'blue', 'orange', 'purple', 'cyan'];
  for (let i = 0; i < names.length; i++) {
    ctx.fillStyle = palette[names[i]];
    ctx.fillRect(cx - 96 + i * 32, swatchY, 22, 8);
  }
}

function drawRow(ctx, cx, y, label, active, elapsed) {
  ctx.font = 'bold 20px monospace';

  if (active) {
    // The selected row is the one place the menu spends colour.
    ctx.fillStyle = rainbow(elapsed * 0.25, 66);
    ctx.fillText(label, cx, y);
    const w = ctx.measureText(label).width;
    ctx.fillText('▸', cx - w / 2 - 22, y);
    ctx.fillText('◂', cx + w / 2 + 22, y);
  } else {
    ctx.fillStyle = palette.hudDim;
    ctx.fillText(label, cx, y);
  }
}

function drawHint(ctx, viewW, viewH) {
  ctx.fillStyle = palette.hudDim;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    isTouch() ? 'tap a row to choose' : 'arrows to choose    enter to start',
    viewW / 2,
    viewH - 24
  );
}
