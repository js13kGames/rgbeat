/**
 * Central tuning values.
 *
 * Everything a playtest might want to change lives here rather than scattered
 * through the gameplay code, so balancing is a single-file job. Values the GDD
 * calls out as "tune during playtesting" cite their section.
 */

// --- Movement (GDD Section 3.1) ---------------------------------------------
// Chosen to feel responsive at platformer speed, since combat is meant to be a
// puzzle played *at speed* (Section 2, pillar 2) rather than from a standstill.
export const GRAVITY = 1800; // px/s^2
export const MOVE_SPEED = 260; // px/s, horizontal run speed
export const ACCEL = 2600; // px/s^2, ground acceleration
export const AIR_ACCEL = 1400; // px/s^2, reduced air control
export const FRICTION = 2400; // px/s^2, ground deceleration when not steering
export const JUMP_VELOCITY = -620; // px/s, initial jump impulse
export const MAX_FALL_SPEED = 1100; // px/s, terminal velocity

/**
 * Forgiveness windows. Both are standard platformer feel aids and cheap in
 * bytes: they matter here because the combo system takes the arrow keys away
 * mid-platforming (Section 3.1), so movement must feel generous.
 */
export const COYOTE_TIME = 0.09; // s of grace to still jump after leaving ground
export const JUMP_BUFFER = 0.12; // s of grace to queue a jump before landing
/** Releasing jump early cuts upward velocity, giving variable jump height. */
export const JUMP_CUT_MULTIPLIER = 0.45;

// --- Player body ------------------------------------------------------------
export const PLAYER_WIDTH = 34;
export const PLAYER_HEIGHT = 40;

// --- Camera -----------------------------------------------------------------
/** How quickly the camera converges on its target. Higher = tighter. */
export const CAMERA_STIFFNESS = 6;
/** Player is kept this far above screen centre, to show more ground ahead. */
export const CAMERA_Y_OFFSET = 40;
/** Camera leads the player in their facing direction by this many px. */
export const CAMERA_LOOKAHEAD = 90;

// --- Rendering (GDD Section 9) ----------------------------------------------
/**
 * The ink-wash look. Kept as parameters rather than magic numbers inside the
 * renderer so the concept art in docs/reference/ can keep being folded in by
 * tweaking these, not by rewriting draw calls.
 */
export const INK = {
  /** Outline width for terrain and silhouettes. */
  lineWidth: 2,
  /** Per-frame stroke wobble, in px. Gives the hand-drawn feel cheaply. */
  jitter: 1.2,
  /** How often the jitter reseeds, in seconds. Lower = more restless. */
  jitterRate: 0.08,
  /** Ink spatter dots per terrain edge segment. */
  spatter: 3,
};

// --- Combo grammar (GDD Sections 3.1 and 4.2) -------------------------------
/**
 * How long the player has to press the second key after arming a combo.
 * Section 15 recommends starting at 700ms and tuning by feel.
 */
export const AIM_WINDOW = 0.7;

/**
 * Per-key cooldown. Uniform across Q/W/E for now, per the Section 15
 * recommendation; the table shape allows diverging them if balance needs it.
 *
 * Section 4.2 sets a hard constraint on this value: the player must reliably
 * land at least one valid hit inside every boss weak-colour window. That check
 * happens when the boss lands, and this number is expected to move then.
 */
export const COOLDOWN = { q: 1.8, w: 1.8, e: 1.8 };

/** Reach of each mechanic archetype, in px. */
export const ABILITY_RANGE = {
  guard: 95, // nova radius, centred on the player
  assault: 130, // dash-strike length
  flow: 150, // arc sweep radius
};

/** How long an ability's visual effect lives, in seconds. */
export const EFFECT_LIFETIME = 0.32;

/** Forward impulse applied to the player by Assault (dash) abilities. */
export const DASH_IMPULSE = 460;
