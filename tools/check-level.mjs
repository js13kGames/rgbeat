/**
 * Level reachability check, for every level.
 *
 * An unreachable ledge is invisible when reading the level table -- it only
 * shows up when someone plays and cannot get up there. Worse, a pit can be
 * technically clearable but still demand a frame-perfect jump, which reads as
 * a bug rather than a challenge. Both have happened on this project.
 *
 * So none of it is estimated. This runs the REAL physics integrator from
 * src/player.js and searches takeoff points for one that actually lands. An
 * analytic approximation would miss what the integrator really does: jump-cut,
 * per-pixel collision stepping, air acceleration, and ceilings clipping an arc
 * short.
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
import { level, loadLevel, LEVEL_COUNT, overlapsSolid } from '../src/world.js';
import { player, updatePlayer } from '../src/player.js';

const maxHeight = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
const airtime = (2 * Math.abs(JUMP_VELOCITY)) / GRAVITY;
const maxDistance = MOVE_SPEED * airtime;

const STEP = 1 / 60;

/**
 * Minimum band of takeoff positions that must clear a pit. Below this, the
 * crossing reads as pixel-perfect even though it is technically possible.
 */
const TAKEOFF_WINDOW_MIN = 70;

/** How far either side of a pit must stay clear of overhead geometry. */
const CLEARANCE_MARGIN = 150;

let failures = 0;

function fail(message) {
  failures++;
  console.log('  FAIL  ' + message);
}

// --- Simulation helpers -----------------------------------------------------

/** Put the player on top of `surface` at x, at rest. */
function placeOn(surface, x) {
  player.x = x;
  player.y = surface.y - PLAYER_HEIGHT;
  player.vy = 0;
  player.onGround = true;
  player.airTime = 0;
  player.jumpBuffered = 99;
}

/** Is the player standing on `target` right now? */
function restingOn(target) {
  return (
    player.onGround &&
    Math.abs(player.y + PLAYER_HEIGHT - target.y) < 2 &&
    player.x + PLAYER_WIDTH > target.x &&
    player.x < target.x + target.w
  );
}

/** One jump attempt from `x`, running in `dir`. */
function attempt(from, target, x, dir) {
  placeOn(from, x);
  // Assume a run-up: the player arrives at speed rather than standing still.
  player.vx = dir * MOVE_SPEED;
  player.facing = dir;

  let jumped = false;
  for (let step = 0; step < 140; step++) {
    updatePlayer(STEP, { move: dir, jumpHeld: true, jumpPressed: !jumped });
    jumped = true;
    if (restingOn(target)) return true;
    if (player.y > target.y + 400) break; // fell past it
  }
  return false;
}

/** Can the player get from `from` to `target` at all, from any takeoff point? */
function canJump(from, target) {
  for (const dir of [1, -1]) {
    for (let i = 0; i <= 24; i++) {
      const x = from.x + (from.w - PLAYER_WIDTH) * (i / 24);
      if (attempt(from, target, x, dir)) return true;
    }
  }
  return false;
}

/**
 * Width in px of the band of takeoff positions that reaches `target`.
 * This is the number that decides whether a jump *feels* fair.
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

// --- Per-level checks -------------------------------------------------------

function checkLevel(index) {
  loadLevel(index);
  console.log('\n=== LEVEL ' + (index + 1) + ' of ' + LEVEL_COUNT + ' ===');

  // Ground segments are the solids that reach the bottom of the level.
  const ground = level.solids
    .filter((s) => s.y + s.h >= level.height - 1)
    .sort((a, b) => a.x - b.x);

  // Decorative obstacles are collidable but not part of the route, so they are
  // exempt from the "must be landable" requirement.
  const ledges = level.solids.filter((s) => !ground.includes(s) && !s.decor);

  console.log('\n  Ledge reachability');
  for (const ledge of ledges) {
    let reachedFrom = null;
    for (const from of level.solids) {
      if (from === ledge) continue;
      // Only consider surfaces at or below the target: dropping down is easy.
      if (from.y < ledge.y) continue;
      if (canJump(from, ledge)) {
        reachedFrom = from;
        break;
      }
    }

    const id = 'ledge x=' + String(ledge.x).padStart(4) + ' y=' + ledge.y;
    if (!reachedFrom) fail(id + ' is UNREACHABLE by simulation');
    else {
      console.log(
        '  ok    ' + id + '  from x=' + reachedFrom.x + ' (+' + (reachedFrom.y - ledge.y) + ' px)'
      );
    }
  }

  console.log('\n  Ground gaps (simulated crossing)');
  for (let i = 1; i < ground.length; i++) {
    const prev = ground[i - 1];
    const next = ground[i];
    const gap = next.x - (prev.x + prev.w);
    if (gap <= 0) continue;

    const label = 'gap at x=' + (prev.x + prev.w) + ' is ' + gap + ' px';

    if (gap > GAP_MAX) {
      fail(label + ' (exceeds cap ' + GAP_MAX + ')');
    } else if (!canJump(prev, next)) {
      fail(label + ' cannot be cleared');
    } else {
      const width = takeoffWindow(prev, next);
      if (width < TAKEOFF_WINDOW_MIN) {
        fail(label + ' -- only ' + width.toFixed(0) + ' px of takeoff room (min ' + TAKEOFF_WINDOW_MIN + ')');
      } else {
        console.log('  ok    ' + label + ', ' + width.toFixed(0) + ' px of takeoff room');
      }
    }
  }

  // A ledge above the approach to a pit is a ceiling: it clips the jump arc and
  // silently turns an ordinary gap into a pixel-perfect one. This was a real
  // bug, so it is a check rather than a thing to remember.
  console.log('\n  Pit approach clearance');
  for (let i = 1; i < ground.length; i++) {
    const prev = ground[i - 1];
    const next = ground[i];
    if (next.x - (prev.x + prev.w) <= 0) continue;

    const zoneStart = prev.x + prev.w - CLEARANCE_MARGIN;
    const zoneEnd = next.x + CLEARANCE_MARGIN;
    const arcTop = prev.y - maxHeight - PLAYER_HEIGHT;

    const blockers = level.solids.filter(
      (s) =>
        !ground.includes(s) && s.x < zoneEnd && s.x + s.w > zoneStart && s.y > arcTop && s.y < prev.y
    );

    const label = 'approach x=' + zoneStart + '..' + zoneEnd;
    if (blockers.length) {
      fail(label + ' blocked overhead by ' + blockers.map((b) => 'x=' + b.x).join(', '));
    } else {
      console.log('  ok    ' + label + ' clear overhead');
    }
  }

  // The boss needs somewhere to stand and room to pace.
  const arenaWidth = level.width - level.bossArenaX;
  if (arenaWidth < 300) fail('boss arena is only ' + arenaWidth + ' px wide');
  else console.log('\n  ok    boss arena ' + arenaWidth + ' px wide');

  // Dying to the boss puts the player back at the arena mouth. On level 2 that
  // spot was inside a pillar, so the player respawned embedded in terrain and
  // could not move at all -- indistinguishable from the game hanging. The
  // respawn now searches backwards for a clear, grounded spot; this proves the
  // search finds one, and that it does not leave the player inside the arena.
  const respawnY = level.bossSpawn.y - PLAYER_HEIGHT;
  let respawnX = null;
  for (let back = 0; back <= 400 && respawnX === null; back += 10) {
    const candidate = level.bossArenaX - 60 - back;
    if (
      !overlapsSolid(candidate, respawnY, PLAYER_WIDTH, PLAYER_HEIGHT) &&
      overlapsSolid(candidate, respawnY + 1, PLAYER_WIDTH, PLAYER_HEIGHT)
    ) {
      respawnX = candidate;
    }
  }

  if (respawnX === null) {
    fail('no clear boss respawn spot within 400 px of the arena mouth');
  } else if (respawnX >= level.bossArenaX) {
    fail('boss respawn at x=' + respawnX + ' is inside the arena');
  } else {
    const nudge = level.bossArenaX - 60 - respawnX;
    console.log(
      '  ok    boss respawn clear at x=' + respawnX +
        (nudge ? ' (stepped back ' + nudge + ' px out of terrain)' : '')
    );
  }
}

// --- Run --------------------------------------------------------------------

console.log('\nJump envelope (derived from src/config.js)');
console.log('  max height   : ' + maxHeight.toFixed(1) + ' px');
console.log('  airtime      : ' + airtime.toFixed(3) + ' s');
console.log('  max distance : ' + maxDistance.toFixed(1) + ' px');
console.log('  authoring caps: rise <= ' + LEDGE_STEP_MAX + ' px, gap <= ' + GAP_MAX + ' px');

const heightUse = (LEDGE_STEP_MAX / maxHeight) * 100;
const distUse = (GAP_MAX / maxDistance) * 100;
console.log('\nAuthoring caps vs envelope');
console.log('  rise cap uses ' + heightUse.toFixed(0) + '% of max height');
console.log('  gap cap uses  ' + distUse.toFixed(0) + '% of max distance');
if (heightUse > 80) fail('rise cap needs ' + heightUse.toFixed(0) + '% of max height (>80%)');
if (distUse > 80) fail('gap cap needs ' + distUse.toFixed(0) + '% of max distance (>80%)');

for (let i = 0; i < LEVEL_COUNT; i++) checkLevel(i);
loadLevel(0);

console.log(
  '\n' + (failures ? failures + ' PROBLEM(S)' : 'all ' + LEVEL_COUNT + ' levels are reachable') + '\n'
);
process.exit(failures ? 1 : 0);
