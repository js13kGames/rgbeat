/**
 * RGBeat build pipeline.
 *
 *   src/*.js  --esbuild-->  one IIFE bundle
 *             --terser-->   minified
 *             --roadroller-> (optional, off by default; see --roadroller)
 *             --inline-->   single self-contained dist/index.html
 *             --zip-->      dist/rgbeat.zip, checked against the 13 KiB budget
 *
 * Usage:
 *   node tools/build.mjs              production build + size report
 *   node tools/build.mjs --dev        dev server with watch + sourcemaps
 *   node tools/build.mjs --preview    serve the built dist/ over http
 *   node tools/build.mjs --roadroller production build, Roadroller enabled
 *
 * Roadroller is deliberately opt-in. It packs the JS well, but it costs ~1 KB of
 * decoder stub and makes the shipped output unreadable in devtools, so it only
 * pays off once we are genuinely tight on bytes (GDD Section 14).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { minify } from 'terser';
import { report, formatBytes, ZIP_PATH } from './size.mjs';

// ./zip.mjs is imported lazily inside build(): it pulls in the Zopfli WASM
// module, which the dev and preview servers have no use for.

/**
 * The project root, derived from this file's own location rather than from
 * process.cwd(). The build must not care which directory it was invoked from --
 * editors, task runners and launch configs all pick their own working
 * directory, and a cwd-relative build breaks in confusing ways when they
 * disagree.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Run everything from the project root so relative paths below are stable.
process.chdir(ROOT);

const ENTRY = 'src/main.js';
const HTML_SOURCE = 'src/index.html';
const DIST = 'dist';
const DIST_DEV = 'dist-dev';
const DEV_PORT = 8080;
const PREVIEW_PORT = 8081;

/** The tag in src/index.html that the production build replaces with inline JS. */
const SCRIPT_TAG = '<script src="./game.js"></script>';

const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const isPreview = args.includes('--preview');
const useRoadroller = args.includes('--roadroller');

/**
 * Shared esbuild settings. Bundling only -- Terser does the actual squeezing.
 *
 * `absWorkingDir` is set explicitly: esbuild captures the working directory
 * when its service process starts, which happens at import time and therefore
 * before the process.chdir() above. Relying on chdir alone silently resolves
 * entry points against whatever directory the build was invoked from.
 */
const esbuildOptions = {
  entryPoints: [ENTRY],
  absWorkingDir: ROOT,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  charset: 'utf8',
};

// ---------------------------------------------------------------------------
// Dev
// ---------------------------------------------------------------------------

async function dev() {
  mkdirSync(DIST_DEV, { recursive: true });
  copyFileSync(HTML_SOURCE, DIST_DEV + '/index.html');

  // Keep the served HTML in sync without needing a restart.
  watch(HTML_SOURCE, () => copyFileSync(HTML_SOURCE, DIST_DEV + '/index.html'));

  const ctx = await esbuild.context({
    ...esbuildOptions,
    outfile: DIST_DEV + '/game.js',
    sourcemap: true,
    minify: false,
  });

  await ctx.watch();
  const server = await ctx.serve({ servedir: DIST_DEV, port: DEV_PORT });

  console.log('');
  console.log('  RGBeat dev server');
  console.log('  http://localhost:' + server.port);
  console.log('  watching src/ -- Ctrl+C to stop');
  console.log('');
}

/**
 * Serve the built dist/ over http. Needed because the packaged game must be
 * verified from a real origin -- opening dist/index.html over file:// is not a
 * faithful test (module/canvas/audio behaviour can differ).
 */
async function preview() {
  // An empty context: we only want esbuild's static file server, no build.
  const ctx = await esbuild.context({ entryPoints: [] });
  const server = await ctx.serve({ servedir: DIST, port: PREVIEW_PORT });
  console.log('');
  console.log('  RGBeat production preview');
  console.log('  http://localhost:' + server.port);
  console.log('');
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/**
 * Minify the HTML shell. Run BEFORE the JS is inlined, so these whitespace and
 * comment rules can never touch game code.
 */
function minifyHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s*([{};:,])\s*/g, '$1') // collapses the inline <style> block
    .replace(/;}/g, '}')
    .trim();
}

async function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // 1. Bundle
  const result = await esbuild.build({ ...esbuildOptions, write: false, minify: false });
  const bundled = result.outputFiles[0].text;

  // 2. Minify. `unsafe` transforms are fine here: this is our own code and we
  //    verify the built game in-browser every phase.
  const minified = await minify(bundled, {
    ecma: 2020,
    module: false,
    toplevel: true,
    compress: {
      passes: 4,
      unsafe: true,
      unsafe_arrows: true,
      unsafe_math: true,
      unsafe_methods: true,
      booleans_as_integers: true,
      drop_console: true,
    },
    mangle: { toplevel: true },
    format: { comments: false },
  });

  if (minified.error) throw minified.error;
  let code = minified.code;
  const minifiedSize = Buffer.byteLength(code);

  // 3. Roadroller (opt-in)
  let roadrolledSize = null;
  if (useRoadroller) {
    const { Packer } = await import('roadroller');
    const packer = new Packer([{ data: code, type: 'js', action: 'eval' }], {});
    await packer.optimize(2);
    const decoder = packer.makeDecoder();
    code = decoder.firstLine + decoder.secondLine;
    roadrolledSize = Buffer.byteLength(code);
  }

  // 4. Inline into a single self-contained HTML file
  const htmlShell = minifyHtml(readFileSync(HTML_SOURCE, 'utf8'));
  if (!htmlShell.includes(SCRIPT_TAG)) {
    throw new Error('Could not find the script tag to replace in ' + HTML_SOURCE);
  }
  const html = htmlShell.replace(SCRIPT_TAG, '<script>' + code + '</script>');
  writeFileSync(DIST + '/index.html', html);

  // 5. Package
  const { createZip } = await import('./zip.mjs');
  const zip = await createZip([{ name: 'index.html', data: Buffer.from(html, 'utf8') }]);
  writeFileSync(ZIP_PATH, zip);

  // 6. Report
  console.log('');
  console.log('  bundled:   ' + formatBytes(Buffer.byteLength(bundled)));
  console.log('  minified:  ' + formatBytes(minifiedSize));
  if (roadrolledSize !== null) {
    console.log('  roadrolled:' + formatBytes(roadrolledSize));
  }
  console.log('  html:      ' + formatBytes(Buffer.byteLength(html)));

  if (!report(zip.length)) process.exit(1);
}

if (isDev) await dev();
else if (isPreview) await preview();
else await build();
