/**
 * Camera: follows the player with a little lead in their facing direction, and
 * stays clamped inside the level bounds.
 */
import { CAMERA_STIFFNESS, CAMERA_Y_OFFSET, CAMERA_LOOKAHEAD } from './config.js';
import { level } from './world.js';

export const camera = { x: 0, y: 0, w: 0, h: 0 };

/** Screen shake, driven by impacts. Decays on its own. */
let shake = 0;

export function addShake(amount) {
  shake = Math.min(shake + amount, 24);
}

export function updateCamera(dt, target, viewWidth, viewHeight) {
  camera.w = viewWidth;
  camera.h = viewHeight;

  const wantX = target.x + target.w / 2 + target.facing * CAMERA_LOOKAHEAD - viewWidth / 2;
  const wantY = target.y + target.h / 2 - viewHeight / 2 - CAMERA_Y_OFFSET;

  // Exponential smoothing, framerate-independent.
  const k = 1 - Math.exp(-CAMERA_STIFFNESS * dt);
  camera.x += (wantX - camera.x) * k;
  camera.y += (wantY - camera.y) * k;

  // Clamp to the level. If the view is wider than the level, centre it.
  camera.x = Math.max(0, Math.min(level.width - viewWidth, camera.x));
  if (level.width < viewWidth) camera.x = (level.width - viewWidth) / 2;
  camera.y = Math.min(camera.y, level.height - viewHeight);

  shake *= Math.exp(-8 * dt);
  if (shake < 0.1) shake = 0;
}

/** Apply the camera transform. Caller is responsible for save/restore. */
export function applyCamera(ctx) {
  const ox = shake ? (Math.random() * 2 - 1) * shake : 0;
  const oy = shake ? (Math.random() * 2 - 1) * shake : 0;
  ctx.translate(-camera.x + ox, -camera.y + oy);
}
