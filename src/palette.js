/**
 * The central palette (GDD Sections 9-10).
 *
 * This module is a FUNCTIONAL requirement, not a style preference. Every colour
 * the game draws must come from here, because the colourblind modes in Section
 * 10 work by swapping this object wholesale at runtime. Nothing anywhere else
 * may hardcode a colour -- if a draw call needs a colour, it reads it from
 * `palette`.
 *
 * There are six semantic hit-colour slots (3 primary + 3 secondary). Those are
 * what enemy cores are checked against, so the *names* are fixed even though
 * the hex values change per mode.
 */

/**
 * The six hit-colour slots, in a fixed order.
 * Primaries first, then the secondaries they mix into.
 */
export const RED = 'red';
export const GREEN = 'green';
export const BLUE = 'blue';
export const ORANGE = 'orange';
export const PURPLE = 'purple';
export const CYAN = 'cyan';

export const HIT_COLORS = [RED, GREEN, BLUE, ORANGE, PURPLE, CYAN];

/**
 * Which two primaries mix into each secondary (GDD Section 4).
 * Used by combo resolution and by the "strip one colour at a time" path on
 * secondary enemies (Section 6.2).
 */
export const MIX = {
  [ORANGE]: [RED, GREEN],
  [PURPLE]: [RED, BLUE],
  [CYAN]: [GREEN, BLUE],
};

/**
 * Colour modes. Each is the same set of semantic slots with different hex
 * values -- switching mode is a single object swap, no redraw logic changes.
 *
 * The alternative modes are based on the Okabe-Ito colourblind-safe palette
 * rather than invented values, per GDD Section 15. They are refined in the
 * accessibility phase; the mechanism is what matters here.
 */
const MODES = {
  // Saturated and punchy: these are the only colours in a grayscale world, so
  // they can afford to be loud.
  default: {
    red: '#ff2d55',
    green: '#2bff88',
    blue: '#2d8cff',
    orange: '#ff8c1a',
    purple: '#b44dff',
    cyan: '#1fe0e0',
  },
  // Protanopia: reds read as very dark, so the "red" slot moves to amber and
  // the warm pair is separated by lightness as much as by hue.
  protanopia: {
    red: '#e69f00',
    green: '#009e73',
    blue: '#0072b2',
    orange: '#f0e442',
    purple: '#cc79a7',
    cyan: '#56b4e9',
  },
  // Okabe-Ito derived: avoids the red/green confusion axis.
  deuteranopia: {
    red: '#d55e00',
    green: '#009e73',
    blue: '#0072b2',
    orange: '#e69f00',
    purple: '#cc79a7',
    cyan: '#56b4e9',
  },
  // Shifts the blue/yellow axis apart instead.
  tritanopia: {
    red: '#d55e00',
    green: '#009e73',
    blue: '#7a5bd8',
    orange: '#f0e442',
    purple: '#cc79a7',
    cyan: '#56b4e9',
  },
};

/**
 * Colours that are NOT hit-colours: the desaturated world, the ink linework,
 * and the player. These are mode-independent -- the grayscale world is the
 * point of the art direction, and the player must stay readable in every mode.
 */
const STATIC_COLORS = {
  // The world, in ink-wash grays. `ink` is the linework, `sky` the backdrop.
  sky: '#0a0a0c',
  fogFar: '#141419',
  fogNear: '#1e1e24',
  terrain: '#101014',
  ink: '#8a8a96',
  inkFaint: '#3a3a44',

  // The player: the one saturated thing on screen (GDD Section 2, pillar 1).
  playerBody: '#f4f2f8',
  playerShade: '#cfcbdb',

  // UI.
  hudDim: '#5a5a66',
  hudText: '#d8d6e0',
};

/**
 * The live palette. Read this everywhere; never copy values out of it at module
 * load time, or a runtime mode switch won't reach that code.
 */
export const palette = { ...STATIC_COLORS, ...MODES.default };

/** Currently active mode name. */
export let paletteMode = 'default';

export const PALETTE_MODES = Object.keys(MODES);

/**
 * Swap the palette wholesale. Mutates `palette` in place rather than replacing
 * the binding, so every module holding a reference sees the change immediately.
 */
export function setPaletteMode(mode) {
  if (!MODES[mode]) return;
  paletteMode = mode;
  Object.assign(palette, MODES[mode]);
}

/**
 * Namespaced per the competition's shared-origin "be neighbourly" rule
 * (Section 10). Other jam entries live on the same origin, so every key we
 * touch is prefixed -- and `localStorage.clear()` is never called anywhere.
 */
const STORAGE_KEY = 'rgbeat_colorblindMode';

/**
 * Restore the saved mode, if any.
 *
 * All storage access is wrapped: localStorage throws outright in some privacy
 * modes, and an unhandled failure here would both break startup and dirty a
 * console the jam requires clean. A missing preference is not an error.
 */
export function loadPaletteMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setPaletteMode(saved);
  } catch (e) {
    /* storage unavailable; the default palette is a fine fallback */
  }
}

/** Advance to the next mode and persist it. Returns the new mode's name. */
export function cyclePaletteMode() {
  const next = PALETTE_MODES[(PALETTE_MODES.indexOf(paletteMode) + 1) % PALETTE_MODES.length];
  setPaletteMode(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (e) {
    /* preference simply will not persist */
  }
  return next;
}

/**
 * A rainbow sweep, used for the HUD hearts and the ultimate bar.
 * Purely thematic -- GDD Section 5 is explicit that heart hue carries no
 * gameplay meaning, so this deliberately does NOT read from the hit-colours.
 * @param {number} t position along the rainbow, 0..1 (wraps)
 */
export function rainbow(t, lightness = 60) {
  return 'hsl(' + (((t % 1) + 1) % 1) * 360 + ',85%,' + lightness + '%)';
}
