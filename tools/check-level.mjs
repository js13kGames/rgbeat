/**
 * Level reachability check.
 *
 * An unreachable ledge is invisible when reading the level table -- it only
 * shows up when someone plays the level and cannot get up there. This script
 * derives the jump envelope from the real physics constants and verifies every
 * surface against it, so geometry and physics can never drift apart silently.
 *
 * Run via `npm run check:level`. Dev-only: it costs zero shipped bytes.
 */
import {
  GRAVITY,
  MOVE_SPEED,
  JUMP_VELOCITY,
  LEDGE_STEP_MAX,
  GAP_MAX,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from '../src/config.js';
import { level } from '../src/world.js';
import { player, updatePlayer } from '../src/player.js';

const maxHeight = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
const airtime = (2 * Math.abs(JUMP_VELOCITY)) / GRAVITY;
const maxDistance = MOVE_SPEED * airtime;

let failures = 0;

function fail(message) {
  failures++;
  console.log('  FAIL  ' + message);
}

console.log('\nJump envelope (derived from src/config.js)');
console.log('  max height   : ' + maxHeight.toFixed(1) + ' px');
console.log('  airtime      : ' + airtime.toFixed(3) + ' s');
console.log('  max distance : ' + maxDistance.toFixed(1) + ' px');
console.log('  authoring caps: rise <= ' + LEDGE_STEP_MAX + ' px, gap <= ' + GAP_MAX + ' px');

// --- The authoring caps must themselves sit safely inside the envelope ------
console.log('\nAuthoring caps vs envelope');
const heightUse = (LEDGE_STEP_MAX / maxHeight) * 100;
const distUse = (GAP_MAX / maxDistance) * 100;
console.log('  rise cap uses ' + heightUse.toFixed(0) + '% of max height');
console.log('  gap cap uses  ' + distUse.toFixed(0) + '% of max distance');
if (heightUse > 80) fail('rise cap needs ' + heightUse.toFixed(0) + '% of max height (>80%)');
if (distUse > 80) fail('gap cap needs ' + distUse.toFixed(0) + '% of max distance (>80%)');

// Ground segments are the solids that reach the bottom of the level.
const ground = level.solids
  .filter((s) => s.y + s.h >= level.height - 1)
  .sort((a, b) => a.x - b.x);

// --- Ledge reachability -----------------------------------------------------
/**
 * Reachability is PROVEN by simulation, not estimated: we run the real physics
 * integrator from src/player.js and search takeoff points along each candidate
 * surface for one that actually lands on the target ledge.
 *
 * An analytic approximation would miss what the integrator really does --
 * jump-cut, per-pixel collision stepping, air acceleration, ceilings clipping
 * an arc short. This cannot.
 */
const STEP = 1 / 60;

/**
 * Minimum band of takeoff positions that must clear a pit. Below this, the
 * crossing reads as pixel-perfect even though it is technically possible.
 */
const TAKEOFF_WINDOW_MIN = 70;

/** How far either side of a pit must stay clear of overhead geometry. */
const CLEARANCE_MARGIN = 150;

/** Put the player on top of `surface` at x, at rest. */
function placeOn(surface, x) {
  player.x = x;
  player.y = surface.y - PLAYER_HEIGHT;
  player.vy = 0;
  player.onGround = true;
  player.airTime = 0;
  player.jumpBuffered = 99;
}

/** Is the player standing on `ledge` right now? */
function restingOn(ledge) {
  return (
    player.onGround &&
    Math.abs(player.y + PLAYER_HEIGHT - ledge.y) < 2 &&
    player.x + PLAYER_WIDTH > ledge.x &&
    player.x < ledge.x + ledge.w
  );
}

/**
 * Try to jump from `from` to `ledge`. Returns true if any takeoff point along
 * `from`, running in either direction, lands on `ledge`.
 */
/**
 * Width in px of the band of takeoff positions that successfully cross to
 * `target`. This is the number that decides whether a jump *feels* fair.
 */
function takeoffWindow(from, target) {
  const lo = from.x;
  const hi = from.x + from.w - PLAYER_WIDTH;
  const samples = 200;
  let hits = 0;
  for (let i = 0; i <= samples; i++) {
    if (attempt(from, target, lo + ((hi - lo) * i) / samples, 1)) hits++;
  }
  return ((hi - lo) * hits) / samples;
}

/** One jump attempt from `x` at `speedFraction` of run speed. */
function attempt(from, target, x, speedFraction) {
  placeOn(from, x);
  player.vx = MOVE_SPEED * speedFraction;
  player.facing = 1;

  let jumped = false;
  for (let step = 0; step < 140; step++) {
    updatePlayer(STEP, { move: 1, jumpHeld: true, jumpPressed: !jumped });
    jumped = true;
    if (restingOn(target)) return true;
    if (player.y > target.y + 400) break;
  }
  return false;
}

function canJump(from, ledge) {
  for (const dir of [1, -1]) {
    // Sample takeoff positions across the whole source surface.
    for (let i = 0; i <= 24; i++) {
      const x = from.x + (from.w - PLAYER_WIDTH) * (i / 24);
      placeOn(from, x);
      // Assume a run-up: the player arrives at speed rather than standing still.
      player.vx = dir * MOVE_SPEED;
      player.facing = dir;

      let jumped = false;
      for (let step = 0; step < 140; step++) {
        const intent = { move: dir, jumpHeld: true, jumpPressed: !jumped };
        jumped = true;
        updatePlayer(STEP, intent);

        if (restingOn(ledge)) return true;
        // Fell below the target with no way back up.
        if (player.y > ledge.y + 400) break;
      }
    }
  }
  return false;
}

// Decorative obstacles are collidable but are not part of the route, so they
// are exempt from the "must be landable" requirement.
const ledges = level.solids.filter((s) => !ground.includes(s) && !s.decor);

console.log('\nLedge reachability (simulated with the real physics)');
for (const ledge of ledges) {
  let reachedFrom = null;

  for (const from of level.solids) {
    if (from === ledge) continue;
    // Only consider surfaces at or below the target: dropping down is trivial.
    if (from.y < ledge.y) continue;
    if (canJump(from, ledge)) {
      reachedFrom = from;
      break;
    }
  }

  const id = 'ledge x=' + String(ledge.x).padStart(4) + ' y=' + ledge.y;
  if (!reachedFrom) fail(id + ' is UNREACHABLE by simulation');
  else {
    const rise = reachedFrom.y - ledge.y;
    console.log('  ok    ' + id + '  reached from x=' + reachedFrom.x + ' (+' + rise + ' px rise)');
  }
}

// --- Ground gaps ------------------------------------------------------------
// Also proven by simulation: a gap inside the cap could still be unclearable
// if, say, a ledge overhang clipped the arc.
console.log('\nGround gaps (simulated crossing)');
for (let i = 1; i < ground.length; i++) {
  const prev = ground[i - 1];
  const next = ground[i];
  const gap = next.x - (prev.x + prev.w);
  if (gap <= 0) continue;

  const label = 'gap at x=' + (prev.x + prev.w) + ' is ' + gap + ' px';
  if (gap > GAP_MAX) fail(label + ' (exceeds cap ' + GAP_MAX + ')');
  else if (!canJump(prev, next)) fail(label + ' cannot be cleared');
  else {
    // Measure how forgiving the crossing is, not merely that it is possible.
    // A gap that only one takeoff point clears is the "must jump perfectly"
    // failure mode, and it passes a pass/fail reachability test just fine.
    const width = takeoffWindow(prev, next);
    const detail = label + ' (' + ((gap / maxDistance) * 100).toFixed(0) + '% of max, ';
    if (width < TAKEOFF_WINDOW_MIN) {
      fail(detail + 'only ' + width.toFixed(0) + ' px of takeoff room -- needs ' + TAKEOFF_WINDOW_MIN + ')');
    } else {
      console.log('  ok    ' + detail + width.toFixed(0) + ' px of takeoff room)');
    }
  }
}

// --- Overhead clearance -----------------------------------------------------
/**
 * A ledge above the approach to a pit is a ceiling: it clips the jump arc and
 * silently turns an ordinary gap into a pixel-perfect one. This was a real bug,
 * so it is now a check rather than a thing to remember.
 */
console.log('\nPit approach clearance');
for (let i = 1; i < ground.length; i++) {
  const prev = ground[i - 1];
  const next = ground[i];
  if (next.x - (prev.x + prev.w) <= 0) continue;

  const zoneStart = prev.x + prev.w - CLEARANCE_MARGIN;
  const zoneEnd = next.x + CLEARANCE_MARGIN;
  // Vertical band a jump from ground level passes through.
  const arcTop = prev.y - maxHeight - PLAYER_HEIGHT;

  const blockers = level.solids.filter(
    (s) =>
      !ground.includes(s) &&
      s.x < zoneEnd &&
      s.x + s.w > zoneStart &&
      s.y > arcTop &&
      s.y < prev.y
  );

  const label = 'approach x=' + zoneStart + '..' + zoneEnd;
  if (blockers.length) {
    fail(label + ' is blocked overhead by ' + blockers.map((b) => 'x=' + b.x).join(', '));
  } else {
    console.log('  ok    ' + label + ' is clear overhead');
  }
}

console.log('\n' + (failures ? failures + ' PROBLEM(S)' : 'level is reachable') + '\n');
process.exit(failures ? 1 : 0);
