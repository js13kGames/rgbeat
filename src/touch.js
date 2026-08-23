/**
 * Touch controls (GDD Section 3.2).
 *
 * This layer writes into the SAME `held` / `pressed` state the keyboard uses,
 * rather than adding a parallel path through the gameplay code. That is what
 * makes the combo grammar work identically on both: arming a combo already
 * repurposes the direction state as an aim stick (Section 3.1), so a drag in
 * the movement zone becomes aiming for free once a combo is armed, exactly as
 * Section 3.2 describes.
 *
 * Layout:
 *   left  -- a drag zone. Horizontal offset runs, upward flick jumps.
 *   right -- the three ability buttons, hit-tested against the same geometry
 *            the HUD draws, so the target can never drift from the graphic.
 */
import { held, pressed } from './input.js';
import { KEYS } from './combo.js';
import { abilityButtonPos, buttonRadius, ULT_BAR } from './hud.js';

/**
 * Whether to present touch controls at all.
 *
 * Keyed off a coarse pointer rather than screen size or user-agent sniffing:
 * a small window on a desktop still wants the keyboard, and a large tablet
 * still wants touch.
 */
let touchMode = false;

export function isTouch() {
  return touchMode;
}

/** Offset from the drag origin before movement engages, in px. */
const MOVE_DEADZONE = 14;

/** Upward drag distance that counts as a jump. */
const JUMP_THRESHOLD = 26;

/** The pointer currently driving movement, or null. */
let movePointer = null;
let moveStartX = 0;
let moveStartY = 0;
let jumpLatched = false;

/** Which ability key each active pointer is holding, by pointer id. */
const buttonPointers = new Map();

export function initTouch(canvas, getViewSize) {
  // Present touch controls when the primary input is coarse. Also flip on if a
  // real touch arrives, since some devices report inconsistently.
  touchMode = matchMedia('(pointer: coarse)').matches;

  const zoneSplit = () => getViewSize().w * 0.5;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    touchMode = true;
    canvas.setPointerCapture(e.pointerId);

    const view = getViewSize();

    // The ultimate has no button of its own and there is no R key on touch, so
    // its bar doubles as the control. Generous padding: it is a thin graphic.
    if (
      e.clientX > ULT_BAR.x - 16 &&
      e.clientX < ULT_BAR.x + ULT_BAR.w + 16 &&
      e.clientY > ULT_BAR.y - 20 &&
      e.clientY < ULT_BAR.y + ULT_BAR.h + 20
    ) {
      pressed.ult = true;
      return;
    }

    const key = hitButton(e.clientX, e.clientY, view.w, view.h);

    if (key) {
      // A tap on an ability button is exactly a key press: the combo state
      // machine cannot tell the difference, so both input methods share one
      // implementation of the grammar.
      buttonPointers.set(e.pointerId, key);
      held[key] = true;
      pressed[key] = true;
      return;
    }

    if (e.clientX < zoneSplit() && movePointer === null) {
      movePointer = e.pointerId;
      moveStartX = e.clientX;
      moveStartY = e.clientY;
      jumpLatched = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== movePointer) return;

    const dx = e.clientX - moveStartX;
    const dy = e.clientY - moveStartY;

    held.left = dx < -MOVE_DEADZONE;
    held.right = dx > MOVE_DEADZONE;
    // Down is only ever an aim direction, never movement.
    held.down = dy > JUMP_THRESHOLD;

    const wantsUp = dy < -JUMP_THRESHOLD;
    held.up = wantsUp;

    // Edge-trigger the jump once per upward flick, so holding the thumb high
    // does not re-trigger it every frame.
    if (wantsUp && !jumpLatched) {
      pressed.up = true;
      jumpLatched = true;
    } else if (!wantsUp) {
      jumpLatched = false;
    }
  });

  const release = (e) => {
    const key = buttonPointers.get(e.pointerId);
    if (key) {
      held[key] = false;
      buttonPointers.delete(e.pointerId);
      return;
    }
    if (e.pointerId === movePointer) {
      movePointer = null;
      held.left = held.right = held.up = held.down = false;
      jumpLatched = false;
    }
  };

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

/** Which ability button, if any, is under this point? */
function hitButton(x, y, viewW, viewH) {
  const r = buttonRadius();
  for (let i = 0; i < KEYS.length; i++) {
    const p = abilityButtonPos(i, viewW, viewH);
    // A slightly generous radius: fingers are imprecise and a missed ability
    // tap is far more costly than an over-eager one.
    if (Math.hypot(x - p.x, y - p.y) <= r * 1.25) return KEYS[i];
  }
  return null;
}
