/**
 * The Section 4.2 balance constraint, as an automated check.
 *
 * The GDD states it as a hard requirement, not a preference:
 *
 *   "the boss's cycling weak-colour window must always be beatable within the
 *    cooldown rhythm ... verify the player can reliably land at least one valid
 *    hit inside every boss weak-window at the chosen cooldown value -- this is
 *    a hard playtesting check, not a nice-to-have."
 *
 * Eyeballing that is unreliable, because the worst case is not obvious: it is a
 * SECONDARY colour whose two keys both went on cooldown moments earlier. This
 * script derives the real numbers from the actual combo table and config, and
 * fails if any window is unwinnable or uncomfortably tight.
 *
 * Run via `npm run check:balance`. Dev-only: zero shipped bytes.
 */
import {
  COOLDOWN,
  BOSS_WEAK_WINDOW,
  BOSS_TELEGRAPH,
  BOSS_HIT_STUN,
  AIM_WINDOW,
  VOLATILE_SHIFT_TIME,
} from '../src/config.js';
import { ABILITIES } from '../src/combo.js';
import { HIT_COLORS } from '../src/palette.js';

let failures = 0;
const fail = (m) => {
  failures++;
  console.log('  FAIL  ' + m);
};

/**
 * Time to physically execute a two-key combo: press, aim, press. Generous --
 * a real player does not input both keys instantly.
 */
const EXECUTION_TIME = 0.25;

/** A window with less than this much slack is too tight to call reliable. */
const MIN_SLACK = 0.6;

/**
 * The cheapest key set that produces each hit-colour.
 * Derived from the real combo table so it cannot drift from the grammar.
 */
const keysFor = {};
for (const ability of Object.values(ABILITIES)) {
  const current = keysFor[ability.color];
  if (!current || ability.keys.length < current.length) {
    keysFor[ability.color] = ability.keys;
  }
}

console.log('\nInputs (from src/config.js and the real combo table)');
console.log('  per-key cooldown : ' + COOLDOWN.q + 's / ' + COOLDOWN.w + 's / ' + COOLDOWN.e + 's');
console.log('  weak window      : ' + BOSS_WEAK_WINDOW + 's');
console.log('  telegraph        : ' + BOSS_TELEGRAPH + 's');
console.log('  aim window       : ' + AIM_WINDOW + 's');

console.log('\nKeys required per hit-colour');
for (const color of HIT_COLORS) {
  console.log('  ' + color.padEnd(7) + ' -> ' + keysFor[color].join('+'));
}

// --- Worst case per colour --------------------------------------------------
/**
 * The worst realistic case: the window opens at the exact moment every key the
 * colour needs has just been spent, so the player must wait out a full cooldown
 * before they can even begin the combo.
 */
console.log('\nWorst case: every required key spent the instant the window opens');
for (const color of HIT_COLORS) {
  const keys = keysFor[color];
  const wait = Math.max(...keys.map((k) => COOLDOWN[k]));
  const total = wait + EXECUTION_TIME;
  const slack = BOSS_WEAK_WINDOW - BOSS_HIT_STUN - total;

  const label =
    color.padEnd(7) +
    ' needs ' +
    keys.join('+').padEnd(4) +
    ' wait ' +
    wait.toFixed(2) +
    's + exec ' +
    EXECUTION_TIME.toFixed(2) +
    's = ' +
    total.toFixed(2) +
    's';

  if (slack < 0) fail(label + '  EXCEEDS the usable window');
  else if (slack < MIN_SLACK) fail(label + '  only ' + slack.toFixed(2) + 's slack (min ' + MIN_SLACK + ')');
  else console.log('  ok    ' + label + '  slack ' + slack.toFixed(2) + 's');
}

// --- A full fight, simulated ------------------------------------------------
/**
 * The per-colour check above assumes each window is independent. It is not:
 * spending keys in one window leaves them cold for the next, and a landed hit
 * immediately rotates the colour. This simulates a whole fight to confirm the
 * cooldowns never compound into an unwinnable window.
 *
 * The simulated player is deliberately naive -- they always fire the moment
 * their keys are ready, which is the behaviour that stresses cooldowns hardest.
 */
function simulateFight(sequence) {
  const cd = { q: 0, w: 0, e: 0 };
  let time = 0;
  const results = [];

  for (const color of sequence) {
    const keys = keysFor[color];
    // A landed hit staggers the boss, so the window that follows one is
    // shorter than the full BOSS_WEAK_WINDOW by that much.
    const windowStart = time + (results.length ? BOSS_HIT_STUN : 0);
    const windowEnd = time + BOSS_WEAK_WINDOW;

    // Earliest moment every required key is ready.
    let ready = windowStart;
    for (const k of keys) ready = Math.max(ready, cd[k]);

    const hitAt = ready + EXECUTION_TIME;
    const landed = hitAt <= windowEnd;

    results.push({
      color,
      keys: keys.join('+'),
      waited: +(ready - windowStart).toFixed(2),
      hitAt: +(hitAt - windowStart).toFixed(2),
      landed,
    });

    if (landed) {
      // Spend the keys, and the hit rotates the boss to a fresh window.
      for (const k of keys) cd[k] = hitAt + COOLDOWN[k];
      time = hitAt;
    } else {
      // Missed: the window expires on its own.
      time = windowEnd;
    }
  }

  return results;
}

// Worst plausible ordering: back-to-back secondaries, which need two keys each
// and therefore contend for cooldowns far more than primaries do.
const secondaries = HIT_COLORS.filter((c) => keysFor[c].length === 2);
const stressSequence = [];
for (let i = 0; i < 3; i++) stressSequence.push(...secondaries);

console.log('\nSimulated fight: back-to-back secondaries (the hardest ordering)');
for (const r of simulateFight(stressSequence)) {
  const label =
    r.color.padEnd(7) +
    ' (' +
    r.keys.padEnd(3) +
    ')  waited ' +
    r.waited.toFixed(2) +
    's, hit at ' +
    r.hitAt.toFixed(2) +
    's of ' +
    BOSS_WEAK_WINDOW +
    's';
  if (!r.landed) fail(label + '  MISSED');
  else console.log('  ok    ' + label);
}

// A full rotation in random order, repeated, to catch orderings the stress
// case does not cover.
const shuffled = [];
for (let i = 0; i < 4; i++) {
  const bag = HIT_COLORS.slice();
  for (let j = bag.length - 1; j > 0; j--) {
    const k = (Math.random() * (j + 1)) | 0;
    [bag[j], bag[k]] = [bag[k], bag[j]];
  }
  shuffled.push(...bag);
}

console.log('\nSimulated fight: shuffled rotations (as the boss actually cycles)');
const shuffledResults = simulateFight(shuffled);
const missed = shuffledResults.filter((r) => !r.landed);
const worst = shuffledResults.reduce((a, b) => (b.hitAt > a.hitAt ? b : a));
if (missed.length) fail(missed.length + ' of ' + shuffled.length + ' windows missed');
else console.log('  ok    all ' + shuffled.length + ' windows landed');
console.log(
  '  worst window: ' +
    worst.color +
    ' hit at ' +
    worst.hitAt.toFixed(2) +
    's of ' +
    BOSS_WEAK_WINDOW +
    's (' +
    (BOSS_WEAK_WINDOW - worst.hitAt).toFixed(2) +
    's to spare)'
);

// --- Volatile enemies (Section 6.3) -----------------------------------------
/**
 * A volatile core shifting before the player can possibly answer it would make
 * the enemy a wall rather than a tension spike, so it faces the same test as a
 * boss window.
 */
console.log('\nVolatile shift window');
for (const color of HIT_COLORS) {
  const keys = keysFor[color];
  const total = Math.max(...keys.map((k) => COOLDOWN[k])) + EXECUTION_TIME;
  const slack = VOLATILE_SHIFT_TIME - total;
  const label = color.padEnd(7) + ' worst case ' + total.toFixed(2) + 's of ' + VOLATILE_SHIFT_TIME + 's';
  if (slack < 0) fail(label + '  IMPOSSIBLE');
  else if (slack < 0.4) fail(label + '  only ' + slack.toFixed(2) + 's slack');
  else console.log('  ok    ' + label + '  slack ' + slack.toFixed(2) + 's');
}

// --- Telegraph sanity -------------------------------------------------------
console.log('\nTelegraph');
if (BOSS_TELEGRAPH >= BOSS_WEAK_WINDOW) {
  fail('telegraph is as long as the window; the next colour would always show');
} else if (BOSS_TELEGRAPH < AIM_WINDOW) {
  fail('telegraph (' + BOSS_TELEGRAPH + 's) is shorter than the aim window; too late to react');
} else {
  console.log('  ok    ' + BOSS_TELEGRAPH + 's of warning, longer than the ' + AIM_WINDOW + 's aim window');
}

console.log('\n' + (failures ? failures + ' PROBLEM(S)' : 'boss timing is beatable') + '\n');
process.exit(failures ? 1 : 0);
