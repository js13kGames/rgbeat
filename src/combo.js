/**
 * The combo grammar and the three ability cooldowns (GDD Sections 3.1, 4, 4.2).
 *
 * The grammar in one line: **the first key picks how the ability behaves, the
 * second key picks the colour it deals.** Nine combos, nine distinct abilities,
 * collapsing onto the six hit-colours that enemy cores are checked against.
 *
 *   first key -> archetype     second key -> colour
 *   Q = Guard   (nova/control)   Q = Blue
 *   W = Assault (dash/burst)     W = Red
 *   E = Flow    (arc/reach)      E = Green
 *
 * Same key twice yields that pure primary; two different keys mix into the
 * corresponding secondary.
 *
 * Cooldowns are per KEY, not per combo and not per colour -- exactly three
 * timers regardless of how many combos exist. A pure combo uses one key twice
 * but only starts that cooldown once; a mixed combo starts both, which is what
 * makes secondary colours naturally more expensive to chain (Section 4.2).
 */
import { AIM_WINDOW, COOLDOWN } from './config.js';
import { RED, GREEN, BLUE, ORANGE, PURPLE, CYAN } from './palette.js';

/** The three ability keys, in HUD order. */
export const KEYS = ['q', 'w', 'e'];

/** First key -> mechanic archetype. */
const ARCHETYPE = { q: 'guard', w: 'assault', e: 'flow' };

/** Second key -> the primary colour it contributes. */
const KEY_COLOR = { q: BLUE, w: RED, e: GREEN };

/** Which colour results from mixing two key-colours. */
const MIXES = {
  [BLUE + RED]: PURPLE,
  [RED + BLUE]: PURPLE,
  [BLUE + GREEN]: CYAN,
  [GREEN + BLUE]: CYAN,
  [RED + GREEN]: ORANGE,
  [GREEN + RED]: ORANGE,
};

/**
 * The nine ability names from GDD Section 4.1, kept as documentation rather
 * than as data:
 *
 *   Q>Q Aqua Pulse     Q>W Violet Ward     Q>E Frost Snare
 *   W>W Ember Strike   W>Q Amethyst Dash   W>E Blaze Burst
 *   E>E Vine Lash      E>Q Tidal Sweep     E>W Solar Lash
 *
 * They were shipped as a runtime table until it was noticed that nothing ever
 * displays them -- no HUD element, no toast, nothing. That cost 128 bytes of
 * zip for strings the player could never see. As a comment they cost nothing,
 * because Terser strips them, and they still document the design.
 *
 * If a future revision shows ability names in the HUD, this comes back as a
 * table; until then it stays here.
 */

/**
 * The full 9-combo table, derived rather than hand-written so the grammar can
 * never drift out of sync with itself.
 *
 * If bytes force the Section 13 P2 cut (collapsing to 6 abilities, one per
 * colour), this table is the only thing that changes -- everything downstream
 * consumes `{archetype, color}` and does not care how many entries exist.
 */
export const ABILITIES = {};

for (const first of KEYS) {
  for (const second of KEYS) {
    const a = KEY_COLOR[first];
    const b = KEY_COLOR[second];
    ABILITIES[first + second] = {
      archetype: ARCHETYPE[first],
      color: first === second ? a : MIXES[a + b],
      keys: first === second ? [first] : [first, second],
    };
  }
}

/** Remaining cooldown per key, in seconds. */
export const cooldowns = { q: 0, w: 0, e: 0 };

export function isReady(key) {
  return cooldowns[key] <= 0;
}

/** Cooldown progress 0..1, for the HUD radial fill. 1 means ready. */
export function cooldownProgress(key) {
  return 1 - cooldowns[key] / COOLDOWN[key];
}

/**
 * The armed-combo state. `key` is the first press; while it is set, the arrow
 * keys aim instead of moving.
 */
export const combo = {
  /** First key pressed, or null when idle. */
  key: null,
  /** Seconds remaining in the aim window. */
  timer: 0,
  /** Unit aim vector, resolved on fire. */
  aimX: 1,
  aimY: 0,
};

export function isArmed() {
  return combo.key !== null;
}

function disarm() {
  combo.key = null;
  combo.timer = 0;
}

/**
 * Resolve the aim direction from held arrows, falling back to the player's
 * facing so combos stay usable without aiming (Section 3.1, step 5).
 */
function resolveAim(held, facing) {
  let x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  let y = (held.down ? 1 : 0) - (held.up ? 1 : 0);

  if (x === 0 && y === 0) {
    x = facing;
  } else {
    const len = Math.hypot(x, y);
    x /= len;
    y /= len;
  }

  combo.aimX = x;
  combo.aimY = y;
}

/**
 * Advance cooldowns and the combo state machine.
 *
 * @param {number} dt
 * @param {object} pressed edge-triggered key presses this frame
 * @param {object} held held key state
 * @param {number} facing player's facing, -1 or 1
 * @returns {?object} the ability that fired this frame, or null
 */
export function updateCombo(dt, pressed, held, facing) {
  for (const key of KEYS) {
    if (cooldowns[key] > 0) cooldowns[key] = Math.max(0, cooldowns[key] - dt);
  }

  if (!isArmed()) {
    // Arming. A key on cooldown is ignored outright -- no aiming state begins,
    // so the player never gets stuck aiming an ability they cannot fire.
    for (const key of KEYS) {
      if (pressed[key] && isReady(key)) {
        combo.key = key;
        combo.timer = AIM_WINDOW;
        break;
      }
    }
    return null;
  }

  // Armed: keep the aim live so the indicator tracks the arrows.
  resolveAim(held, facing);

  combo.timer -= dt;
  if (combo.timer <= 0) {
    // Window expired. No punishment beyond the lost time (Section 3.1, step 4).
    disarm();
    return null;
  }

  for (const key of KEYS) {
    if (!pressed[key]) continue;

    // A second key on cooldown cancels the combo the same way an expired
    // window does -- deliberately identical, so the failure reads the same.
    if (!isReady(key)) {
      disarm();
      return null;
    }

    return fire(combo.key + key);
  }

  return null;
}

function fire(id) {
  const ability = ABILITIES[id];

  // Start the cooldown on every key involved. `keys` already collapses a pure
  // combo to a single entry, so pressing Q twice does not stack.
  for (const key of ability.keys) cooldowns[key] = COOLDOWN[key];

  const fired = { ...ability, aimX: combo.aimX, aimY: combo.aimY };
  disarm();
  return fired;
}

/** Clear all combo and cooldown state, e.g. on death or level restart. */
export function resetCombo() {
  disarm();
  for (const key of KEYS) cooldowns[key] = 0;
}
