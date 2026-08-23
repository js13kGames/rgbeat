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
//
// These three values define the JUMP ENVELOPE that all level geometry must be
// authored against:
//
//   max height   = JUMP_VELOCITY^2 / (2 * GRAVITY)      = 144 px
//   airtime      = 2 * |JUMP_VELOCITY| / GRAVITY        = 0.82 s
//   max distance = MOVE_SPEED * airtime                 = 231 px
//
// Both figures are theoretical maxima: they assume a perfect apex landing and
// full run speed at takeoff. Level geometry therefore targets a fraction of
// them, not the numbers themselves -- see LEDGE_STEP_MAX / GAP_MAX below.
// `npm run check:level` enforces this, because an unreachable ledge is not
// visible from reading the level table.
export const GRAVITY = 1700; // px/s^2
export const MOVE_SPEED = 280; // px/s, horizontal run speed
export const ACCEL = 2600; // px/s^2, ground acceleration
export const AIR_ACCEL = 1400; // px/s^2, reduced air control
export const FRICTION = 2400; // px/s^2, ground deceleration when not steering
export const JUMP_VELOCITY = -700; // px/s, initial jump impulse
export const MAX_FALL_SPEED = 1100; // px/s, terminal velocity

/**
 * Authoring limits for level geometry, as a fraction of the envelope above.
 * A jump that needs more than ~70% of the theoretical maximum reads as
 * "pixel-perfect" to a player, which is not the feel we want outside of
 * deliberate challenge sections.
 */
export const LEDGE_STEP_MAX = 105; // px of vertical rise between surfaces (73%)
export const GAP_MAX = 150; // px of horizontal gap to clear (65%)

/**
 * Forgiveness windows. Both are standard platformer feel aids and cheap in
 * bytes: they matter here because the combo system takes the arrow keys away
 * mid-platforming (Section 3.1), so movement must feel generous.
 */
export const COYOTE_TIME = 0.11; // s of grace to still jump after leaving ground
export const JUMP_BUFFER = 0.14; // s of grace to queue a jump before landing
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

/**
 * Reach of each mechanic archetype, in px.
 *
 * Assault must stay longer than the distance the dash itself carries the
 * player (DASH_IMPULSE * EFFECT_LIFETIME, roughly 150px). At 130 the strike
 * ended behind the player's own landing spot, so enemies they dashed *into*
 * fell outside the hitbox and the ability felt far shorter than it looked.
 */
export const ABILITY_RANGE = {
  guard: 95, // nova radius, centred on the player
  assault: 210, // dash-strike length, clearing the dash's own travel
  flow: 150, // arc sweep radius
};

/** How long an ability's visual effect lives, in seconds. */
export const EFFECT_LIFETIME = 0.32;

/** Forward impulse applied to the player by Assault (dash) abilities. */
export const DASH_IMPULSE = 460;

// --- Player health (GDD Section 5) ------------------------------------------
/** Starting hearts. Section 15 recommends 4. */
export const MAX_HEARTS = 4;

/** Invulnerability after taking a hit, in seconds. */
export const IFRAME_TIME = 1.1;

/** Knockback applied on damage, so a hit is readable and cannot chain. */
export const HURT_KNOCKBACK_X = 260;
export const HURT_KNOCKBACK_Y = -320;

/** How long the player is unable to steer after a hit. */
export const HURT_STUN = 0.22;

// --- Enemies (GDD Section 6) ------------------------------------------------
export const ENEMY_WIDTH = 30;
export const ENEMY_HEIGHT = 52;

/** Patrol speed for enemies that walk their platform. */
export const ENEMY_SPEED = 46;

/** Seconds an enemy flashes after surviving a hit that stripped a colour. */
export const ENEMY_HURT_FLASH = 0.25;

// --- Ultimate (GDD Section 4.3) ---------------------------------------------
/**
 * Ultimate charge per kill, 0..1 of a full bar. Reading an enemy correctly and
 * one-shotting it with the exact matching colour is rewarded roughly twice as
 * well as stripping it down one primary at a time -- a clear incentive for
 * skilled play that keeps the slower path viable.
 */
export const ULTIMATE_CHARGE_EXACT = 0.2;
export const ULTIMATE_CHARGE_STRIPPED = 0.1;

// --- Ultimate ability (GDD Section 4.3) -------------------------------------
/**
 * Reach of the full-spectrum explosion. Section 4.3 says it hits "every enemy
 * on screen", so this is sized to a screen rather than tuned as a range.
 */
export const ULTIMATE_RADIUS = 700;

/** The explosion is slower and heavier than a normal ability. */
export const ULTIMATE_LIFETIME = 0.85;

// --- Colour restoration (GDD Section 7) -------------------------------------
/**
 * Duration of the boss-defeat recolour wipe.
 *
 * Section 7 calls this the single biggest "wow" beat in the game and asks for
 * disproportionate polish relative to its cost. It is deliberately slow enough
 * to read as an event rather than a state change -- a player glancing at the
 * screen must catch it.
 */
export const BOSS_WIPE_DURATION = 1.8;


// --- Boss (GDD Section 6.4) -------------------------------------------------
export const BOSS_WIDTH = 76;
export const BOSS_HEIGHT = 120;
export const BOSS_SPEED = 74;

/**
 * Hits needed to kill the boss. One per colour in a full rotation, so beating
 * it requires the entire combo vocabulary rather than one favourite ability.
 */
export const BOSS_MAX_HP = 6;

/**
 * How long each weak-colour window lasts.
 *
 * Section 4.2 makes this a HARD constraint rather than a feel preference: the
 * player must reliably land a valid hit inside EVERY window at the chosen
 * cooldown. The worst case is a secondary colour needing two keys that both
 * just went on cooldown, so this must comfortably exceed COOLDOWN plus the
 * time to execute a two-key combo. `npm run check:balance` proves it.
 */
export const BOSS_WEAK_WINDOW = 3.6;

/**
 * How long before a switch the next colour is shown. Section 6.4 wants this to
 * read as a reaction check, not a memorisation test, so the upcoming colour is
 * always telegraphed.
 */
export const BOSS_TELEGRAPH = 1.2;

/** Seconds the boss is stunned and flashing after taking a hit. */
export const BOSS_HIT_STUN = 0.4;

// --- Volatile enemies (GDD Section 6.3) -------------------------------------
/**
 * How long a volatile enemy holds a colour before shifting to another.
 *
 * Subject to the same constraint as the boss's weak window (Section 4.2): if
 * the player cannot land a valid hit inside it at the current cooldown, the
 * enemy is not a tension spike, it is a wall. `npm run check:balance` verifies
 * this alongside the boss timing.
 */
export const VOLATILE_SHIFT_TIME = 3.2;
