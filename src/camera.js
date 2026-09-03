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

/**
 * @param {number} minX Left edge the view is not allowed to pass. 0 normally;
 *   during a boss fight it is the arena mouth, so the fight is never framed
 *   with half the screen showing platforms the player already crossed.
 */
export function updateCamera(dt, target, viewWidth, viewHeight, minX) {
  camera.w = viewWidth;
  camera.h = viewHeight;

  const maxX = level.width - viewWidth;

  let wantX = target.x + target.w / 2 + target.facing * CAMERA_LOOKAHEAD - viewWidth / 2;

  if (minX > maxX) {
    // The window is wider than the region we are being asked to stay inside,
    // so there is no framing that satisfies both edges. Centre the region and
    // accept the overspill rather than snapping to one side of it.
    wantX = (minX + level.width - viewWidth) / 2;
  } else {
    wantX = Math.max(minX, Math.min(maxX, wantX));
  }

  const wantY = target.y + target.h / 2 - viewHeight / 2 - CAMERA_Y_OFFSET;

  // Exponential smoothing, framerate-independent.
  //
  // The clamp above is applied to the TARGET, not to the camera afterwards.
  // That distinction is what makes entering the arena a glide instead of a
  // jump: the camera is roughly 300 px left of the arena mouth at the moment
  // the fight begins, and clamping the camera itself would teleport it there.
  const k = 1 - Math.exp(-CAMERA_STIFFNESS * dt);
  camera.x += (wantX - camera.x) * k;
  camera.y += (wantY - camera.y) * k;

  // Final clamp to the level, which the smoothing above can still overshoot.
  camera.x = Math.max(0, Math.min(maxX, camera.x));
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
