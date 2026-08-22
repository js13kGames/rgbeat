# RGBeat

A 2D platformer with color-matching combat, built for **js13kGames 2026** (theme: *Unicorns and Rainbows*).

Humans stole color from every unicorn in the world. You are the last saturated thing in a
grayscale ink drawing, and every enemy carries a fragment of the color it stole.

The complete design specification lives in [`docs/RGBeat_GDD_1.md`](docs/RGBeat_GDD_1.md) and is the
single source of truth for mechanics, combat, audio, accessibility and scope.

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
| `npm run build` | Production build: bundle → minify → inline → zip → size check. Output in `dist/`. |
| `npm run preview` | Serves the built `dist/` over HTTP on <http://localhost:8081>. |
| `npm run size` | Re-checks the size of the last build without rebuilding. |
| `npm run build:roadroller` | Production build with Roadroller packing enabled (see below). |
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
   ├─ Roadroller ───► optional, off by default (see below)
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

[Roadroller](https://lifthrasiir.github.io/roadroller/) is wired up but **disabled by default**.
It packs JavaScript very well, but costs roughly 1 KB of decoder stub and makes the shipped
output unreadable in devtools. It only pays for itself once we're genuinely tight on bytes,
so it stays opt-in via `npm run build:roadroller` until the budget demands it.

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
- **No build step after unzipping** — a plain `index.html` at the zip root that just works.
- **Readable source in the repo.** This repo is cloned by the js13kGames organization as a
  community learning resource, so `src/` stays modular and unminified.
- **`localStorage` keys are namespaced `rgbeat_*`**, and `localStorage.clear()` is never called
  (the jam's shared-origin "be neighbourly" rule).

---

## Project layout

```
src/            readable game source (ES modules), the thing humans edit
  index.html    page shell; the build inlines the bundle into a minified copy
  main.js       entry point: canvas setup and the fixed-timestep loop
tools/          build tooling
  build.mjs     the pipeline: dev server, preview server, production build
  zip.mjs       minimal ZIP writer with Zopfli compression
  size.mjs      byte-budget reporting, also runnable standalone
  clean.mjs     removes build output
docs/
  RGBeat_GDD_1.md   the Game Design Document — source of truth
  reference/        concept art (style reference only, never shipped)
dist/           production output (gitignored)
dist-dev/       dev server output (gitignored)
```

`docs/reference/` holds painterly concept art used only to pin down palette, silhouette and HUD
mood. It is deliberately **not** shippable: all in-game visuals are procedural Canvas 2D shapes
per GDD Section 9.

---

## License

MIT
