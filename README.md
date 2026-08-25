# RGBeat

A 2D platformer with color-matching combat, built for **js13kGames 2026** (theme: *Unicorns and Rainbows*).

Humans stole color from every unicorn in the world. You are the last saturated thing in a
grayscale ink drawing, and every enemy carries a fragment of the color it stole.

The complete design specification lives in [`docs/RGBeat_GDD_1.md`](docs/RGBeat_GDD_1.md) and is the
single source of truth for mechanics, combat, audio, accessibility and scope.

---

## Controls

| Input | Action |
| --- | --- |
| **← →** | Move |
| **↑** | Jump (hold for height) |
| **Q / W / E** | Ability keys. Two presses make a combo: the **first** key picks how the ability behaves, the **second** picks the colour it deals. |
| **← ↑ → ↓** *(while a combo is armed)* | Aim. Movement is suspended; releasing without a second key cancels harmlessly. |
| **R** | Ultimate — a full-spectrum explosion that ignores colour matching. Needs a full bar. |
| **M** | Mute / unmute all audio. |
| **C** | Cycle colourblind palette (default → protanopia → deuteranopia → tritanopia). Saved between sessions. |
| **↑ ↓ / Enter** | Title screen: choose a row, and start. ← → cycles the palette from either row. |

Each of Q, W and E has its own cooldown. A pure combo (`Q→Q`) spends one; a mixed
combo (`Q→W`) spends both, which is what makes secondary colours more expensive to
chain. See GDD Sections 4 and 4.2.

### Touch

Touch controls appear automatically on coarse-pointer devices. Drag the left-hand
zone to run, flick it upward to jump, and tap the three buttons on the right to build
combos — while a combo is armed, that same drag zone becomes the aim stick, exactly as
the arrow keys do. Tap the ultimate bar to fire the ultimate.

Touch and keyboard write into the same input state, so the combo grammar has one
implementation rather than two.

### Accessibility

Every hit-colour has its own **shape** as well as its own hue — triangle, square,
circle, inverted triangle, plus, cross — drawn on enemy cores, the boss's colour ring,
ability effects and the HUD. The game stays readable with colour distinction disabled
entirely.

The palette is a single object swapped wholesale at runtime, so a mode change reaches
every draw call at once. The chosen mode persists in `localStorage` under the
namespaced key `rgbeat_colorblindMode`; `localStorage.clear()` is never called, per the
jam's shared-origin rule. See GDD Section 10.

---

## Requirements

- Node.js 18+ (developed on Node 24)
- npm

```bash
npm install
```

> **Note:** do not keep this repo inside a cloud-synced folder such as Google Drive or Dropbox.
> npm's install process performs rename/rmdir operations that those virtual filesystems reject
> (`EBADF`), and background sync can corrupt `.git`. Clone it to a plain local path.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on <http://localhost:8080> with file watching and sourcemaps. Unminified, fast rebuilds. |
| `npm run build` | Production build: bundle → minify → **Roadroller** → inline → zip → size check. Output in `dist/`. Takes ~40s. |
| `npm run preview` | Serves the built `dist/` over HTTP on <http://localhost:8081>. |
| `npm run size` | Re-checks the size of the last build without rebuilding. |
| `npm run build:fast` | Same, but skips Roadroller. Quick iteration; the size it reports is a pessimistic upper bound, not the shipped figure. |
| `npm run clean` | Removes `dist/` and `dist-dev/`. |

Always verify the game via `npm run preview` rather than opening `dist/index.html` directly —
`file://` is not a faithful test of canvas and audio behaviour.

---

## Build pipeline

Source lives in `src/` as readable, unminified ES modules. Nothing in `src/` is ever shipped
as-is; the distributable is produced by `tools/build.mjs`:

```
src/*.js
   │
   ├─ esbuild ──────► one IIFE bundle (no module overhead in the output)
   ├─ Terser ───────► aggressive minification, toplevel mangling, 4 compress passes
   ├─ Roadroller ───► packed (on by default; --fast skips it)
   ├─ inline ───────► JS injected into a minified copy of src/index.html
   └─ zip ──────────► dist/rgbeat.zip, then checked against the 13 KiB budget
```

The result is a **single self-contained `index.html`** at the zip root. It has no build step,
no external requests, and no dependencies — unzip and open it.

### Packaging

`tools/zip.mjs` is a small hand-written ZIP writer rather than a library or a native tool.
Two reasons:

1. **Byte control.** It emits no extra fields, no directory entries and no timestamps beyond the
   required DOS stamp. General-purpose zip tools add container overhead we can't spare.
2. **Portability.** The GDD suggests ECT or advzip for the final recompression, but `ect-bin`
   ships no Windows prebuilt and otherwise compiles from source with `make` — which would make
   this repo unbuildable on Windows. Since the js13kGames organization clones these repos, that
   was not acceptable.

Compression uses [Zopfli](https://github.com/google/zopfli) via `@gfx/zopfli`, a pure-JS
implementation that produces smaller streams than zlib level 9 while remaining fully
deflate-compatible. Each entry is also tried as *stored* and as zlib-9, and the smallest wins.
This gets us the same class of result ECT/advzip would, with no native binary.

### Roadroller

[Roadroller](https://lifthrasiir.github.io/roadroller/) is **on by default**. It was held in
reserve while there was slack — it makes the shipped output unreadable in devtools and adds
~40s to a build — but at 94% of the budget with levels and art still to come, the reserve is
what the project needs.

| | zip | headroom |
| --- | --- | --- |
| `build:fast` (Terser only) | 12,537 B | 775 B |
| **`build` (Roadroller)** | **11,009 B** | **2,303 B** |

The second, less obvious reason it matters: **Roadroller compresses the numeric level data far
better than deflate does.** Measured by adding two levels' worth of geometry and enemies:

| | cost of 2 extra levels |
| --- | --- |
| Terser + deflate | +306 B |
| Roadroller | **+98 B** |

So content is close to free — roughly 50–150 B per level rather than ~250 B. Budget planning
should use the Roadroller figure; `build:fast` reports a pessimistic upper bound, useful for
quick iteration but not the number that ships.

---

## The byte budget

The jam's hard limit is **13,312 bytes (13 KiB)** for the final zip. Every `npm run build`
prints the current cost and remaining headroom:

```
  bundled:   1,320 B
  minified:  727 B
  html:      1,267 B

  [###.....................................] 6.6%
  zip:       884 B / 13,312 B
  headroom:  12,428 B left
```

The build **exits with a non-zero status when over budget**, so it can gate CI or a pre-push
hook rather than letting an oversized zip reach submission. `npm run size` re-runs just the
check against the last build.

---

## Jam constraints

These are non-negotiable and apply to every change:

- **≤ 13,312 bytes** for the packaged zip.
- **Zero external resources.** No CDN scripts, no remote fonts, no analytics, no network calls of
  any kind. All graphics and audio are generated procedurally at runtime (GDD Sections 8–9).
- **Zero `console.error`** on current Chrome and Firefox, fully playable.
  > **Testing status:** verified continuously in Chromium. **Firefox has not been
  > run** — it is not installed on the development machine. Every browser API used
  > is long-supported there, and the Web Audio calls avoid the one real Firefox
  > divergence (`exponentialRampToValueAtTime` throws on a zero target or a ramp
  > from zero; every ramp here is floored at `0.0001`). That is a static argument,
  > not a test. **Run it in Firefox before submitting.**
- **No build step after unzipping** — a plain `index.html` at the zip root that just works.
- **Readable source in the repo.** This repo is cloned by the js13kGames organization as a
  community learning resource, so `src/` stays modular and unminified.
- **`localStorage` keys are namespaced `rgbeat_*`**, and `localStorage.clear()` is never called
  (the jam's shared-origin "be neighbourly" rule).

---

## Project layout

```
src/              readable game source (ES modules), the thing humans edit
  index.html      page shell; the build inlines the bundle into a minified copy
  main.js         entry point: canvas setup, the fixed-timestep loop, wiring
  config.js       every tunable value, in one place
  palette.js      the central palette + colourblind modes (Sections 9–10)
  render.js       shared ink helpers and the per-colour glyphs
  world.js        level geometry, collision, ink-wash renderer, restoration
  player.js       platformer physics, health, procedural unicorn
  camera.js       follow camera and screen shake
  input.js        keyboard state
  touch.js        touch controls, writing into the same input state
  combo.js        the two-key grammar and the three cooldowns (Section 4)
  effects.js      ability effects: one shape per archetype, used to hit-test
  enemies.js      primary / secondary / volatile enemies (Section 6)
  boss.js         the boss and its cycling weakness (Section 6.4)
  ultimate.js     the ultimate bar and its two-tier charge rule (Section 4.3)
  audio.js        synthesised SFX and the dynamic music system (Section 8)
  hud.js          HUD (Section 11)
  menu.js         title screen: play, and the palette choice
  logo.js         GENERATED wordmark pixels — see tools/encode-logo.mjs
tools/            build and verification tooling — zero shipped bytes
  build.mjs       the pipeline: dev server, preview server, production build
  zip.mjs         minimal ZIP writer with Zopfli compression
  size.mjs        byte-budget reporting, also runnable standalone
  check-level.mjs proves every ledge and gap is reachable, by simulation
  check-balance.mjs proves the Section 4.2 timing constraint holds
  encode-logo.mjs encodes the title wordmark from the reference art
  clean.mjs       removes build output
docs/
  RGBeat_GDD_1.md   the Game Design Document — source of truth
  reference/        concept art (style reference only, never shipped)
dist/             production output (gitignored)
dist-dev/         dev server output (gitignored)
```

## Verification

Two design constraints in the GDD are stated as hard requirements, and both are
too easy to get wrong by eye — so each has a script that proves it rather than
asserting it. Both are dev-only and cost nothing in the shipped zip.

```bash
npm run check
```

- **`check:level`** runs the *real* physics integrator from `src/player.js` and
  searches takeoff points for one that actually lands, rather than approximating
  the jump arc. It also reports how wide each takeoff window is — a gap only one
  takeoff point can clear passes a pass/fail reachability test but still feels
  unfair — and enforces overhead clearance around every pit, because a ledge above
  a pit approach clips the jump arc and silently makes the gap pixel-perfect.
- **`check:balance`** proves GDD Section 4.2: that the player can reliably land a
  hit inside every boss weak-colour window at the current cooldown. The worst case
  is not obvious by inspection — it is a *secondary* colour whose two keys both
  went cold moments earlier — so the script derives required keys from the real
  combo table and simulates entire fights. It covers volatile enemy windows too.

`docs/reference/` holds painterly concept art used only to pin down palette, silhouette and HUD
mood. It is deliberately **not** shippable: all in-game visuals are procedural Canvas 2D shapes
per GDD Section 9.

---

## License

MIT
