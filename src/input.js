/**
 * Keyboard input (GDD Section 3.1).
 *
 * Exposes edge-triggered presses as well as held state, because the combo
 * grammar cares about the *moment* an ability key goes down while movement
 * cares about whether a direction is held.
 *
 * Note the arrow keys serve double duty: normally movement, but they become the
 * aim stick while a combo is armed. That switch is owned by the combo system,
 * not here -- this module only reports raw state.
 */

/** Held state, keyed by our own semantic names. */
export const held = {
  left: false,
  right: false,
  up: false,
  down: false,
  q: false,
  w: false,
  e: false,
};

/** Keys that went down this frame. Cleared by `endFrame()`. */
export const pressed = {};

const KEY_MAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyQ: 'q',
  KeyW: 'w',
  KeyE: 'e',
};

/** Arrow keys scroll the page by default; the game needs them. */
function shouldPreventDefault(code) {
  return code in KEY_MAP;
}

addEventListener('keydown', (event) => {
  const name = KEY_MAP[event.code];
  if (!name) return;
  if (shouldPreventDefault(event.code)) event.preventDefault();
  // Ignore auto-repeat: a held key must not re-trigger a combo press.
  if (event.repeat) return;
  held[name] = true;
  pressed[name] = true;
});

addEventListener('keyup', (event) => {
  const name = KEY_MAP[event.code];
  if (!name) return;
  if (shouldPreventDefault(event.code)) event.preventDefault();
  held[name] = false;
});

// Losing focus mid-key would otherwise leave that key stuck down forever.
addEventListener('blur', () => {
  for (const name in held) held[name] = false;
});

/** Call once at the end of each frame, after all systems have read input. */
export function endFrame() {
  for (const name in pressed) delete pressed[name];
}
