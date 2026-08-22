/**
 * Byte-budget reporting for the js13kGames 13 KiB limit.
 *
 * Used two ways:
 *   - imported by tools/build.mjs, to report right after packaging
 *   - run directly (`npm run size`) to re-check the last build
 *
 * Exits non-zero when over budget so CI (or a pre-push hook) can fail the build
 * rather than letting an oversized zip reach the submission.
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** js13kGames hard limit: 13 KiB. */
export const BUDGET = 13312;

export const ZIP_PATH = 'dist/rgbeat.zip';

const BAR_WIDTH = 40;

export function formatBytes(n) {
  return n.toLocaleString('en-US') + ' B';
}

/**
 * Print a budget report for a zip of `size` bytes.
 * @returns {boolean} true when within budget
 */
export function report(size) {
  const remaining = BUDGET - size;
  const pct = (size / BUDGET) * 100;
  const filled = Math.min(BAR_WIDTH, Math.round((size / BUDGET) * BAR_WIDTH));
  const bar = '#'.repeat(filled) + '.'.repeat(Math.max(0, BAR_WIDTH - filled));
  const ok = remaining >= 0;

  console.log('');
  console.log('  [' + bar + '] ' + pct.toFixed(1) + '%');
  console.log('  zip:       ' + formatBytes(size) + ' / ' + formatBytes(BUDGET));
  console.log(
    ok
      ? '  headroom:  ' + formatBytes(remaining) + ' left'
      : '  OVER BUDGET by ' + formatBytes(-remaining)
  );
  console.log('');

  return ok;
}

// Direct invocation: `npm run size`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(ZIP_PATH)) {
    console.error('No build found at ' + ZIP_PATH + ' -- run `npm run build` first.');
    process.exit(1);
  }
  process.exit(report(readFileSync(ZIP_PATH).length) ? 0 : 1);
}
