/**
 * The ultimate bar (GDD Section 4.3).
 *
 * Every kill deposits the colour it stole into a shared bar. How the kill
 * happened decides how much:
 *
 *   exact     one hit with the colour matching the enemy's full requirement
 *             -- rewards reading the core correctly and reacting fast
 *   stripped  the enemy was worn down one primary at a time -- safer, slower,
 *             and still viable, which matters for players still learning the
 *             grammar and for accessibility
 *
 * This module owns the charge only. The full-spectrum explosion it unlocks
 * lands with the next phase; keeping the charge separate means the bar can be
 * tuned without touching the ability.
 */
import { ULTIMATE_CHARGE_EXACT, ULTIMATE_CHARGE_STRIPPED } from './config.js';

export const ultimate = {
  /** Charge level, 0..1. At 1 the ability is available. */
  charge: 0,
};

export function isUltimateReady() {
  return ultimate.charge >= 1;
}

/**
 * Deposit a kill's colour into the bar.
 * @param {boolean} exact whether the kill was a clean exact-colour one-shot
 */
export function addUltimateCharge(exact) {
  const amount = exact ? ULTIMATE_CHARGE_EXACT : ULTIMATE_CHARGE_STRIPPED;
  ultimate.charge = Math.min(1, ultimate.charge + amount);
}

export function resetUltimate() {
  ultimate.charge = 0;
}
