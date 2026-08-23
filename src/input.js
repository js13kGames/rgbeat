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
  ult: false,
  mute: false,
  palette: false,
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
  // The GDD does not assign the ultimate a key (Section 4.3 describes only the
  // ability). R sits directly beside the Q/W/E ability row, so the whole combat
  // vocabulary stays under one hand.
  KeyR: 'ult',
  // Music now plays from the first bar, so a way to silence it is not optional.
  KeyM: 'mute',
  // Section 10 asks for the colourblind mode to be selectable independently of
  // any other setting; with no menu in the byte budget, C cycles it directly.
  KeyC: 'palette',
};

/**
 * Should the browser's own handling be suppressed?
 *
 * Arrow keys scroll the page, so the game must claim them. Every mapped key is
 * claimed for consistency -- but only when no modifier is held, otherwise
 * binding KeyR would swallow Ctrl+R and break reloading the page.
 */
function shouldPreventDefault(event) {
  return event.code in KEY_MAP && !hasModifier(event);
}

function hasModifier(event) {
  return event.ctrlKey || event.metaKey || event.altKey;
}

addEventListener('keydown', (event) => {
  const name = KEY_MAP[event.code];
  if (!name) return;
  // A modified press is a browser shortcut, not gameplay input.
  if (hasModifier(event)) return;
  if (shouldPreventDefault(event)) event.preventDefault();
  // Ignore auto-repeat: a held key must not re-trigger a combo press.
  if (event.repeat) return;
  held[name] = true;
  pressed[name] = true;
});

addEventListener('keyup', (event) => {
  const name = KEY_MAP[event.code];
  if (!name) return;
  if (shouldPreventDefault(event)) event.preventDefault();
  // Always release, even if a modifier is now held: the key really is up, and
  // skipping this would leave it stuck down.
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
