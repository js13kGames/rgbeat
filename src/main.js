/**
 * RGBeat -- entry point.
 *
 * Owns the canvas, the fixed-timestep loop, and the order systems run in.
 * Gameplay lives in the modules it pulls together.
 */
import { held, pressed, endFrame } from './input.js';
import { player, updatePlayer, drawPlayer, resetPlayer } from './player.js';
import { camera, updateCamera, applyCamera } from './camera.js';
import { level, drawWorld } from './world.js';
import { updateJitter } from './render.js';

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
}

addEventListener('resize', resize);
resize();

let elapsed = 0;

function update(dt) {
  elapsed += dt;
  updateJitter(elapsed);

  // Movement intent. The combo system will suppress `move` while aiming
  // (GDD Section 3.1) -- that hook lands with the combo grammar in the next
  // phase; for now the arrows always drive movement.
  const intent = {
    move: (held.right ? 1 : 0) - (held.left ? 1 : 0),
    jumpHeld: held.up,
    jumpPressed: !!pressed.up,
  };

  updatePlayer(dt, intent);

  // Falling out of the level. Full health handling arrives with Section 5;
  // for now this just prevents an endless fall.
  if (player.y > level.killY) resetPlayer();

  updateCamera(dt, player, viewW, viewH);
}

function render() {
  ctx.save();
  applyCamera(ctx);

  const view = { x: camera.x, y: camera.y, w: viewW, h: viewH };
  drawWorld(ctx, view);
  drawPlayer(ctx);

  ctx.restore();
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
