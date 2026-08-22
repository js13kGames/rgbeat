/**
 * RGBeat -- entry point.
 *
 * Phase 0 scaffold: canvas setup, a fixed-timestep game loop, and a placeholder
 * frame so the whole pipeline (bundle -> minify -> inline -> zip -> size check)
 * can be verified before any gameplay exists. Phase 1 replaces the placeholder
 * with the real world renderer.
 */

/** Simulation step, in seconds. Fixed so physics stays deterministic. */
const STEP = 1 / 60;

/** Guard against the spiral of death after a tab has been backgrounded. */
const MAX_FRAME_TIME = 0.25;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

/** Device-pixel-aware sizing, recomputed on resize. */
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener('resize', resize);
resize();

let elapsed = 0;

function update(dt) {
  elapsed += dt;
}

function render() {
  const w = innerWidth;
  const h = innerHeight;

  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, w, h);

  // Placeholder: the one saturated thing on screen, pulsing. Stands in for the
  // player until Phase 1 -- present purely to prove the loop and build work.
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2);
  ctx.fillStyle = 'hsl(' + ((elapsed * 60) % 360) + ',90%,60%)';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 20 + pulse * 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#666';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RGBeat -- phase 0 scaffold', w / 2, h / 2 + 60);
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
  }

  render();
}

requestAnimationFrame(frame);
