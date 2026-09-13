/**
 * Combat simulation check.
 *
 * The sibling checks cover geometry (check-level) and boss timing
 * (check-balance). This one covers what is neither: what an ability actually
 * DOES to the player and to the world.
 *
 * Every case here has been a real bug on this project, which is why it exists:
 *
 *  - the dash crossed a third of the arena and was retuned four times, with
 *    nothing but a screenshot to say whether a change had landed;
 *  - shockwaves outlived the boss that fired them, kept hurting the player
 *    while invisible, and knocked them the wrong way because a projectile
 *    carried no width;
 *  - the red archetype and the dash both displaced the player, competing for
 *    the same role;
 *  - boss hits charged nothing, so the arena was the one place in the game
 *    where playing well earned no ultimate.
 *
 * None of that is visible in a screenshot, and a browser is a poor place to
 * look for it: a preview pane that stops compositing freezes
 * requestAnimationFrame without saying so, and a frozen game looks exactly like
 * a broken one. This runs the real modules headlessly, so the answer is the
 * same every time.
 *
 * Run via `npm run check:combat`. Dev-only: it costs zero shipped bytes.
 */
import { player, resetPlayer, updatePlayer, startDash, damagePlayer } from '../src/player.js';
import { updateCombo, resetCombo } from '../src/combo.js';
import {
  boss,
  spawnBoss,
  updateBoss,
  shockwaves,
  shockwaveHitting,
  resolveBossHits,
} from '../src/boss.js';
import { spawnEffect, spawnUltimateEffect, clearEffects } from '../src/effects.js';
import { ultimate, resetUltimate, addUltimateCharge } from '../src/ultimate.js';
import { level, loadLevel } from '../src/world.js';
import {
  DASH_DURATION,
  DASH_SPEED,
  DASH_IFRAME_TAIL,
  MOVE_SPEED,
  ULTIMATE_CHARGE_EXACT,
} from '../src/config.js';

const STEP = 1 / 60;
const IDLE = { move: 0, jumpHeld: false, jumpPressed: false };

let failures = 0;

function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? '  ok    ' : '  FAIL  ') + label + (detail ? '  ' + detail : ''));
}

/** Drop the player on flat ground and let them settle. */
function stand(x = 1500) {
  resetPlayer();
  player.x = x;
  player.y = 560;
  player.vx = 0;
  player.vy = 0;
  for (let f = 0; f < 20; f++) updatePlayer(STEP, IDLE);
}

/**
 * Press both keys of a pure combo through the real state machine.
 *
 * Going through updateCombo rather than building an ability by hand is the
 * point: it is the wiring between a keypress and a mechanic that broke when the
 * archetypes were renamed, not the mechanics themselves.
 */
function fireCombo(key) {
  resetCombo();
  return updateCombo(STEP, { [key]: true }, {}, 1) || updateCombo(STEP, { [key]: true }, {}, 1);
}

/** What main.js does with a fired ability. Kept in step with onAbilityFired. */
function applyAbility(ability) {
  if (ability.archetype === 'dash') startDash(ability.aimX, ability.aimY);
  else if (ability.archetype === 'assault') player.facing = ability.aimX >= 0 ? 1 : -1;
}

loadLevel(1);

// --- The dash ---------------------------------------------------------------
console.log('\nDash');
stand();
const dashFrom = player.x;
startDash(1, 0);

let dashFrames = 0;
while (player.dashTimer > 0 && dashFrames < 200) {
  updatePlayer(STEP, IDLE);
  dashFrames++;
}

const dashDistance = player.x - dashFrom;
const dashSpeed = dashDistance / (dashFrames / 60);

check(
  'lasts ' + DASH_DURATION + 's',
  Math.abs(dashFrames / 60 - DASH_DURATION) < 0.05,
  dashFrames + ' frames'
);
check('covers ground', dashDistance > 150, Math.round(dashDistance) + 'px');
check(
  'outruns a run by at least 1.4x',
  dashSpeed > MOVE_SPEED * 1.4,
  (dashSpeed / MOVE_SPEED).toFixed(2) + 'x'
);
check(
  'distance follows speed x duration',
  Math.abs(dashDistance - DASH_SPEED * DASH_DURATION) < 20,
  Math.round(dashDistance) + 'px against ' + DASH_SPEED * DASH_DURATION + 'px'
);

// The invulnerability IS the mechanic, not a bonus attached to it: a dash that
// moved without covering the player would be strictly worse than walking.
console.log('\nDash invulnerability');
stand();
player.hearts = 4;
player.invuln = 0;
startDash(1, 0);
check('covered the instant it starts', damagePlayer(0) === false);

for (let f = 0; f < Math.round(DASH_DURATION * 60) + 1; f++) updatePlayer(STEP, IDLE);
check('the dash has ended', player.dashTimer <= 0);
check(
  'still covered through the tail',
  damagePlayer(0) === false,
  player.invuln.toFixed(2) + 's left'
);

for (let f = 0; f < Math.round(DASH_IFRAME_TAIL * 60) + 3; f++) updatePlayer(STEP, IDLE);
check('vulnerable again once the tail runs out', damagePlayer(0) === true);

// A dash that phased through the floor would be a movement exploit.
stand();
startDash(0, 1);
for (let f = 0; f < 40; f++) updatePlayer(STEP, IDLE);
check(
  'does not pass through terrain',
  player.y + player.h <= 641,
  'feet at y=' + Math.round(player.y + player.h)
);

// --- Which archetype moves the player ---------------------------------------
console.log('\nArchetypes');
const blue = fireCombo('q');
const red = fireCombo('w');

check('Q Q fires', !!blue);
check('...as a dash', blue && blue.archetype === 'dash', blue && blue.archetype);
check('W W fires', !!red);
check('...as an assault', red && red.archetype === 'assault', red && red.archetype);

stand();
const redFrom = player.x;
applyAbility(red);
for (let f = 0; f < 40; f++) updatePlayer(STEP, IDLE);
check(
  'red does NOT displace the player',
  Math.abs(player.x - redFrom) < 1,
  Math.round(player.x - redFrom) + 'px'
);

// --- Shockwaves -------------------------------------------------------------
console.log('\nShockwaves');
spawnBoss();
boss.engaged = true;
for (let f = 0; f < 400 && shockwaves.length === 0; f++) updateBoss(STEP, level.bossArenaX + 10);

check('the slam fires waves', shockwaves.length > 0, shockwaves.length + ' in flight');
check(
  'some leave the floor',
  shockwaves.some((w) => !w.ground),
  'the fan is what covers the air a jump used to make safe'
);
check(
  'every wave carries a width',
  shockwaves.every((w) => Number.isFinite(w.x + w.w / 2)),
  'the knockback origin is derived from x + w / 2'
);

// updateBoss returns early once the boss is dead, so waves stop moving and stop
// being drawn. They have to stop hurting the player too.
boss.hp = 1;
boss.stagger = 0;
clearEffects();
spawnEffect(
  { archetype: 'dash', color: boss.weak, aimX: 1, aimY: 0 },
  boss.x + boss.w / 2,
  boss.y + boss.h / 2
);
resolveBossHits(
  () => {},
  () => {}
);

check('the boss dies', boss.alive === false);
check('waves are cleared with it', shockwaves.length === 0);

stand(boss.x);
player.y = boss.y + boss.h - player.h;

let phantomHits = 0;
for (let f = 0; f < 300; f++) {
  updateBoss(STEP, player.x);
  if (shockwaveHitting(player)) phantomHits++;
}
check('no invisible wave lands after the fight', phantomHits === 0, phantomHits + ' hits');

// --- Ultimate charge --------------------------------------------------------
console.log('\nUltimate charge');

/** main.js onBossHit, in one line. */
const chargeOnHit = (_boss, viaUltimate) => {
  if (!viaUltimate) addUltimateCharge(true);
};

function armBoss() {
  spawnBoss();
  boss.engaged = true;
  boss.stagger = 0;
  clearEffects();
  resetUltimate();
}

armBoss();
spawnEffect(
  { archetype: 'dash', color: boss.weak, aimX: 1, aimY: 0 },
  boss.x + boss.w / 2,
  boss.y + boss.h / 2
);
resolveBossHits(chargeOnHit, () => {});
check(
  'a boss hit charges at the exact-kill rate',
  Math.abs(ultimate.charge - ULTIMATE_CHARGE_EXACT) < 1e-9,
  ultimate.charge.toFixed(2)
);

armBoss();
spawnUltimateEffect(boss.x + boss.w / 2, boss.y + boss.h / 2);
resolveBossHits(chargeOnHit, () => {});
check('an ultimate still damages the boss', boss.hp < boss.maxHp);
check(
  'but charges nothing',
  ultimate.charge === 0,
  'a bar that refills itself is not a resource'
);

// --- Run --------------------------------------------------------------------
console.log('\n' + (failures ? failures + ' PROBLEM(S)' : 'combat behaves as specified') + '\n');
process.exit(failures ? 1 : 0);
