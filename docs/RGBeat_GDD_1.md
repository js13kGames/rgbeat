# RGBeat — Game Design Document

**Genre:** 2D platformer with color-matching combat
**Jam:** js13kGames 2026 — theme "Unicorns and Rainbows"
**Target size:** ≤ 13,312 bytes (13 KiB) zipped, zero external resources
**Target platforms:** Desktop (keyboard) and Mobile (touch), Chrome + Firefox, no console errors

This document is a complete functional and creative specification. It is written to be handed to a generative AI (or a human developer) as the single source of truth for implementing the game. Where a design decision was ambiguous in the original pitch, this document resolves it explicitly and flags the resolution so it can be revisited.

**Revision note:** this version adds two systems (per-key ability cooldowns, and a player health/failure state) confirmed after reviewing reference HUD concept art. A combo-streak scoring multiplier and an in-HUD "suggested sequence" hint were also present in that concept art but were explicitly **not** adopted for this revision — do not implement them.

---

## 1. Premise

Humans stole color from every unicorn in the world. The world is now an ink drawing stripped of its watercolor — everything rendered in grayscale, silhouettes and linework only. One unicorn — the player — kept its color. It is the last saturated thing in a desaturated world, and every enemy carries, buried in its chest, a fragment of the color it stole.

The player fights through levels populated by human silhouettes, each with a colored "core" in the chest indicating what color(s) must be struck from them. Defeating enemies slowly returns color to the world; defeating each level's boss returns it in full.

---

## 2. Core Design Pillars

1. **You are the only color.** Every visual and audio choice should reinforce the contrast between the desaturated world and the player's saturated presence. This is both the art direction and the core game mechanic (color-matching combat) — they must never be treated as separate systems.
2. **Reading, not memorizing.** The player should be able to look at an enemy's core and immediately understand what to do next. Combat is a puzzle of color arithmetic played at platformer speed, not a memory test.
3. **Restraint until the payoff.** Color returning to the world is the emotional core of the game. It must be *held back* visually for most of a level so that the boss's defeat — the moment the level is fully recolored — lands hard.
4. **Nine inputs, one grammar.** All abilities come from the same two-key grammar (see Section 4). The player should be able to predict what an untried combo roughly does once they understand the pattern, rather than treating each of the nine as a fully separate thing to learn.

---

## 3. Controls

### 3.1 Desktop

- **Arrow keys:** move / jump (platformer movement — left, right, jump; down for crouch/drop-through if used).
- **Q, W, E:** the three ability keys (see Section 4 for the combo grammar).
- Combo input flow:
  1. Player presses a first ability key (Q, W, or E). If that key is currently on cooldown (Section 4.2), the press is ignored and no aiming state begins.
  2. Movement input is suspended; the arrow keys now control an **aim direction** instead (a reticle/arrow indicator appears on the player).
  3. Player has a short window (recommend ~600–800ms, tune during playtesting) to press a second ability key (Q, W, or E again) to complete the combo in the chosen direction.
  4. If the window expires without a second key press, **or** the second key pressed is currently on cooldown, the input is cancelled, control reverts to normal movement, and no ability fires (no punishment beyond the lost time, to keep it forgiving in platforming sequences).
  5. If no directional input is given during the aim window, default to "last facing direction" so combos remain usable without needing to also aim.

### 3.2 Mobile

- Virtual d-pad or drag-zone (left side of screen) for movement/jump.
- Three ability buttons (right side of screen) mirroring Q/W/E, each showing its own cooldown state (Section 4.2).
- Combo flow: tap-and-hold the first ability button freezes movement and reveals a directional swipe zone (mirroring the "arrows become aim" behavior on desktop); swipe a direction and tap the second ability button to confirm, or tap a second ability button directly for "last facing direction."
- Controls must be designed touch-first from the start (per project decision), not retrofitted after desktop is done.

---

## 4. Combat System — The Combo Grammar

The player has three ability keys, each tied to a primary color and to a **mechanic archetype** (how the ability moves/behaves):

| Key | Base color | Mechanic archetype |
|---|---|---|
| Q | Blue | **Guard** — defensive/control (barrier, root, pull) |
| W | Red | **Assault** — aggressive/mobile (dash, burst strike) |
| E | Green | **Flow** — reach/area (whip, arc, sweep) |

A combo is two key presses. **The first key determines the ability's mechanic archetype (how it behaves/moves). The second key determines the color that is actually dealt as damage** — when both keys are the same, the output is that pure primary color; when they differ, the two base colors mix into the corresponding secondary color. This resolves the pitch's "nine combinations, each a distinct ability" requirement: there are 9 distinct abilities (distinct animations, feel, and names), collapsing onto **6 distinct hit-colors** (3 primary + 3 secondary), which is what enemy color-matching (Section 6) actually checks against.

### 4.1 The Nine Combos

| Input | Mechanic | Output color | Suggested ability name | Behavior sketch |
|---|---|---|---|---|
| Q→Q | Guard | Blue | Aqua Pulse | Short defensive nova around the player; deals blue damage to anything caught in it. |
| W→W | Assault | Red | Ember Strike | Fast forward dash-strike; the "bread and butter" quick attack. |
| E→E | Flow | Green | Vine Lash | Whip-like arc attack with generous reach. |
| Q→W | Guard | Purple (Blue+Red) | Violet Ward | A pull/root effect that also deals purple damage — controls space. |
| W→Q | Assault | Purple (Blue+Red) | Amethyst Dash | A dash-strike that deals purple damage — same color, more aggressive feel. |
| Q→E | Guard | Cyan (Blue+Green) | Frost Snare | Slows/roots an enemy in an area, cyan damage. |
| E→Q | Flow | Cyan (Blue+Green) | Tidal Sweep | Wide sweeping arc, cyan damage. |
| W→E | Assault | Orange (Red+Green) | Blaze Burst | Dash that detonates on impact, orange damage. |
| E→W | Flow | Orange (Red+Green) | Solar Lash | Wide arc attack, orange damage. |

**Design note:** the two combos that share a hit-color (e.g. Q→W and W→Q) exist so the player has a *stylistic* choice even when the color they need is fixed — one is more defensive/positional, the other more aggressive. This adds expressive depth without adding new colors to track. If bytes are tight, this is the first place to cut (see Section 13) — the game is still fully functional with only 6 abilities (one per color) if the archetype distinction is dropped entirely.

### 4.2 Ability Cooldowns

Each of the **three ability keys** (Q, W, E) — not each of the 9 combos, and not each of the 6 hit-colors — has its own independent cooldown. This keeps exactly three cooldown timers to track and display, regardless of how many of the 9 two-key combos exist, and maps directly onto a simple three-button HUD (Section 11).

- Pressing a key, whether as the first or second press of a combo, starts that key's cooldown.
- A pure combo (e.g. Q→Q) uses one key twice but only starts that key's cooldown once — it doesn't stack.
- A mixed combo (e.g. Q→W) starts the cooldown on **both** keys involved, since both were used. This makes mixed/secondary abilities naturally more "expensive" to chain than repeating a pure combo — a deliberate tradeoff: pure spam is available more often, secondary-color output requires patience or planning around cooldowns.
- While a key is on cooldown, it cannot be pressed to start a new combo, nor to complete one already in progress (see Section 3.1, step 4 — a cooldown block on the second key cancels the combo the same way an expired aim window does).
- Recommended starting value: ~1.5–2s per key, independently tunable per key if balance needs it. Tune during playtesting.
- Cooldown state must be clearly visible per key in the HUD at all times (Section 11) — this is not a hidden mechanic.
- **Balance constraint:** the boss's cycling weak-color window (Section 6.4) must always be beatable within the cooldown rhythm. When tuning cooldown duration, verify the player can reliably land at least one valid hit inside every boss weak-window at the chosen cooldown value — this is a hard playtesting check, not a nice-to-have.

### 4.3 Ultimate Ability

Every enemy kill deposits its stolen color into a shared **ultimate bar**. When full, the player unleashes a full-spectrum explosion that hits every enemy on screen simultaneously with all colors at once, dealing heavy damage regardless of an enemy's current core color. This is both a panic button and a reward for sustained aggression. The ultimate is not affected by, and does not consume, the per-key cooldowns in Section 4.2.

**Charge rule:** how a kill happens affects how much it charges the ultimate bar:
- Killing an enemy with a **single exact combo matching its full required color** (e.g., one-shotting an orange enemy with Blaze Burst or Solar Lash) grants a **larger/faster** ultimate charge — it rewards reading the enemy correctly and reacting fast.
- Killing an enemy by **stripping its colors sequentially** (e.g., hitting an orange enemy with red, then green, on separate hits) still charges the bar, but by a smaller amount per kill — it's the safer, slower path.

This gives skilled play a clear, legible incentive without making the sequential approach non-viable (important for accessibility and for players still learning the combo grammar).

---

## 5. Player Health & Failure State

This is a new system, not present in the original pitch, added to give the platforming sections real stakes and to match the reference HUD's health display.

- The player has a small pool of hit points, shown in the HUD as a row of heart icons (Section 11).
- **Hearts are rendered cycling through a full rainbow gradient purely as thematic flavor** (reinforcing "Unicorns and Rainbows") **and carry no functional link to any of the 6 combat hit-colors.** Do not give a heart's hue any gameplay meaning — this avoids a player mistaking, say, a red heart for a hint about a red-related action.
- Recommended starting pool: 3–5 hearts (tune during playtesting; keep low enough that damage feels meaningful across a short jam level).
- The player takes one heart of damage on contact with an enemy or an environmental hazard (spikes, pits, etc., if such hazards are used). Enemies in this design are not specified to have ranged attacks (Section 6) — keep player damage to contact and hazards only, unless a specific enemy is deliberately designed with a telegraphed ranged attack; don't let ranged enemy attacks creep in as an implementation afterthought, since that would quietly expand both design and byte scope.
- Grant a short invulnerability window (i-frames) plus a brief knockback/flinch after taking a hit — both to make damage clearly readable and to prevent a single contact from chaining into multiple lost hearts.
- At 0 hearts: respawn the player at the start of the current level by default (lowest scope, ship this first). Mid-level checkpoints are an explicit **P2** addition (Section 13) — only add them if the byte and time budget allow; do not block the core loop on building a checkpoint system.
- This system is **P0** (Section 13) — it's now part of the core loop, not optional polish.

---

## 6. Enemy Design

All enemies are black/grayscale human silhouettes with a colored core in the chest. The core's color communicates exactly what is needed to defeat them, and it visibly updates as color is stripped from it. Enemies damage the player only through direct contact (Section 5) — no ranged attacks unless a specific enemy type is deliberately designed with one.

### 6.1 Primary enemies (one color)

Core is a single primary color (red, blue, or green). Dies in one hit from the matching pure combo (or from the ultimate). These are the "reading check" enemies — introduce them first, use them to teach the grammar.

### 6.2 Secondary enemies (two colors)

Core is a secondary color (orange, purple, or cyan). Can be defeated two ways:
- Hit with the two matching primary combos separately, in any order — after the first hit, the core visibly shifts to show only the remaining color needed.
- Hit once with the matching secondary combo directly — a one-shot kill, and per Section 4.3 the higher-value ultimate-charge path.

### 6.3 Volatile enemies (shifting core)

A variant (of either primary or secondary type) whose core **changes to a different required color if not struck within a short timer**, forcing the player to react rather than plan at leisure. Recommended for introduction in the second half of each level, once the player is fluent in the base grammar — use sparingly, as a spike of tension rather than the default enemy type, to keep the core loop (Section 6.1/6.2) legible.

### 6.4 Boss (per level)

Bosses carry **all colors** at once and require the full combo vocabulary to defeat. Recommended design: the boss's exposed weak color **cycles** — either on a timer or after each hit taken — so the player must continuously re-read the boss and switch combos mid-fight, rather than executing a fixed rotation from memory. Telegraph the upcoming color clearly before it becomes active (e.g., the core visibly shifts/glows toward the next color a beat before the switch) so this reads as a reaction check, not a memorization check. See the balance constraint in Section 4.2 — the weak-window timing and the per-key cooldown must be tuned together.

---

## 7. World & Color Restoration

Two distinct visual beats, explicitly *not* the same intensity — this was a deliberate correction during design and should not be muddled in implementation:

1. **Per-kill restoration (subtle):** each defeated enemy returns a small amount of color to its immediate surroundings — a faint desaturation-reversal in a small radius, barely noticeable individually, accumulating quietly over the course of a level. This should read as ambient texture, not as a reward animation competing for the player's attention.
2. **Boss-defeat restoration (dramatic):** defeating a level's boss triggers an obvious, large-scale recoloring of the level — ideally a readable wipe/reveal effect across the visible screen (and, if time/bytes allow, implied across the whole level via a transition or end-of-level summary shot). This must be unambiguous even to a player glancing at the screen: *this* is the moment color came back. This is the single biggest "wow" beat in the game and should get disproportionate polish relative to its implementation cost.

Implementation approach: render the grayscale world by desaturating a hue/tint value per background element (procedurally, not via image assets), and drive that desaturation amount down via two channels — a slow-accumulating per-kill value, and a fast, boss-triggered animation that overrides it toward zero (full color) on victory.

---

## 8. Audio Direction

No external audio files — everything is synthesized at runtime (fits the 13 KiB budget and the "no external resources" rule).

- **SFX:** use **ZzFX** (or an equivalent tiny synth-based SFX generator) for all hit/jump/combo/ultimate sounds. Each of the 6 hit-colors can reuse a shared "hit" synth patch with a per-color parameter tweak (pitch/timbre) rather than needing six fully distinct sound designs — keeps both bytes and design effort down while still giving each color a distinct feel.
- **Music — dynamic tension system:** background music should build in intensity as the player approaches a level's boss, so the change in intensity itself communicates "danger approaching" without needing dialogue or UI. Recommended implementation, given the byte budget:
  - Build a small procedural step-sequencer driven by Web Audio oscillators (a tiny hand-rolled tracker, or ZzFXM-style pattern data), not pre-rendered audio clips.
  - Drive it with a single **intensity parameter (0–1)**, derived from either level progress (% through the level) or physical proximity to the boss arena, whichever is simpler to compute given the level format chosen.
  - Intensity should affect: tempo (increasing BPM), layering (percussion/bass layers fade in as intensity rises), and optionally filter cutoff (brighter/harsher tone at high intensity).
  - **Boss theme:** on entering the boss arena, swap to a distinct pattern — ideally reusing the same synth engine and just swapping the note-pattern data and one or two synth parameters (e.g., a different chord progression, faster base tempo) rather than building a second audio engine. This keeps the "boss feels different" payoff cheap in bytes.

---

## 9. Visual & Art Direction

- Entire world rendered via Canvas 2D, generated procedurally (no bitmap/sprite assets) — shapes, gradients, and simple particle systems rather than drawn art, to stay inside the byte budget.
- Grayscale ink-wash aesthetic for the world and all human enemies: line-art silhouettes, minimal fill, slightly irregular/hand-drawn-feeling strokes if achievable cheaply (e.g., slight per-frame jitter on outlines).
- The player unicorn and every enemy core are the only saturated elements on screen at any time (aside from the two restoration effects in Section 7, and the thematic rainbow-cycled hearts in Section 5). Keep this rule otherwise absolute — any other saturated element dilutes the core visual hook.
- Centralize all colors (the 6 hit-colors, the player's palette, UI accents) in a single palette configuration object in code. This is a functional requirement, not just good practice — the colorblind system in Section 10 depends on being able to swap this object wholesale at runtime.

---

## 10. Accessibility — Colorblind Modes

Colorblind-selectable modes (not just shape/pattern redundancy) are feasible and cheap here, because the art is procedural rather than pre-rendered:

- Implement 2–3 selectable palette modes (e.g., Protanopia-friendly, Deuteranopia-friendly, Tritanopia-friendly), each simply a different set of hex values assigned to the same 6 semantic color slots (red/blue/green/orange/purple/cyan) in the central palette object from Section 9. Switching modes is a runtime swap of that one object — no shaders, no per-asset rework, because there are no baked assets.
- Combine this with **shape/icon redundancy on every core and every ability effect** (a distinct glyph or pattern per color, independent of hue) so the game remains fully readable even for a player who disables color distinction entirely, or for edge cases the chosen palettes don't fully cover.
- Persist the chosen mode in `localStorage` under a namespaced key (e.g. `rgbeat_colorblindMode`), per the competition's "be neighbourly" shared-origin rule — never call `localStorage.clear()`.
- This should be exposed as a simple settings toggle/menu, selectable independent of any other setting.

---

## 11. UI / HUD

- **Ultimate bar:** fills from color deposited by kills (Section 4.3); visually should itself be the one UI element allowed to show full color, gradually filling with the spectrum as it charges.
- **Health (hearts):** a row of 3–5 heart icons (Section 5), rendered cycling through a rainbow gradient for thematic flavor only — no color-matching meaning.
- **Ability buttons (Q/W/E):** three persistent indicators (mirrored on mobile as the three touch buttons from Section 3.2), each showing its key's current cooldown state from Section 4.2 clearly — e.g. a radial fill or countdown readout, with an unambiguous "ready" state.
- **Combo/aim indicator:** while a combo is "armed" (first key pressed, aiming active), show a clear on-player indicator of the pending ability and the current aim direction.
- Optional: a small legend or first-use tooltip mapping core shapes/patterns to colors, to support the colorblind modes and general onboarding without requiring the player to intuit the system from trial and error alone.

**Explicitly out of scope for this HUD:** a combo-streak counter/score multiplier, and an in-HUD "suggested next sequence" hint. Reference concept art included both; they were considered and deliberately not adopted for this design. Do not implement them unless a future revision of this document says otherwise.

---

## 12. Level Structure & Progression

- Recommended jam scope: **3–4 levels**, each ending in one boss fight. This is a size/scope judgment call — prioritize making 3 levels excellent over 5 levels thin (see Section 13).
- Within a level, introduce enemy types in this order: primary enemies first (teach the grammar) → secondary enemies (teach color combination) → volatile/shifting enemies in the level's back half (add reactive pressure) → boss.
- Difficulty progression across levels should come primarily from enemy density, timing, and platforming layout — not from adding new mechanics every level, to keep implementation scope bounded.
- Death (0 hearts, Section 5) restarts the current level by default; checkpoints are a P2 addition only (Section 13).

---

## 13. Scope Priorities (P0 / P1 / P2)

Given the 13 KiB hard limit and jam timeline, if cuts are needed, cut in this order (bottom first):

**P0 — Core loop, must ship:**
- Movement + platforming
- The 9-combo grammar and 6 hit-colors
- Per-key ability cooldowns (Section 4.2)
- Player health: hearts, contact damage, i-frames, death/respawn-at-level-start (Section 5)
- Primary + secondary enemies
- Ultimate bar and ultimate ability
- One boss per level with the all-colors/cycling-weakness fight
- Subtle per-kill restoration + dramatic boss-defeat restoration
- Grayscale-vs-color art direction
- Basic SFX via ZzFX

**P1 — Strongly desired, cut only if bytes force it:**
- Volatile/shifting enemies
- Dynamic tension music system with boss theme
- Colorblind palette modes + shape redundancy
- Mobile touch controls

**P2 — Nice-to-have, first to cut:**
- Mid-level checkpoints (death restarts the level without these)
- The archetype-flavor distinction between combos that share a hit-color (e.g. Violet Ward vs. Amethyst Dash) — collapsible to 6 total abilities if needed
- Onboarding tooltip/legend
- Per-level unique enemy silhouette variety beyond palette differences

---

## 14. Technical Stack (summary)

- Vanilla JavaScript + Canvas 2D (no framework). Optional: **kontra.js** as a very lightweight (few KB) game-loop/entity/collision helper if not writing that layer from scratch.
- Audio: **ZzFX** for SFX; a small hand-rolled procedural sequencer (or ZzFXM-style pattern data) for the dynamic music system in Section 8.
- Build pipeline: source in readable ES modules → bundle with **esbuild** or **Rollup** → minify with **Terser** → optionally further compress with **Roadroller** → package and recompress the final zip with **ECT** or **advzip** (AdvanceCOMP) for a better ratio than a standard zip. Automate this as a single build script and check the resulting zip size on every build.
- Repository must keep the original, unminified, readable source plus the build/minify/package scripts, per competition rules.

---

## 15. Open Questions for the Implementing AI

These are intentionally left flexible — make a reasonable choice, note the choice in code comments, and move on rather than blocking on them:

- Exact aim-window timing for combo input (recommend starting at 700ms and tuning by feel).
- Exact per-key cooldown duration, and whether it should differ across Q/W/E or stay uniform (recommend starting uniform at ~1.8s, per Section 4.2).
- Exact number of player hearts (recommend starting at 4).
- Exact enemy HP/hit counts beyond the "1 hit per required color" rule (e.g., does a primary enemy ever take more than one matching hit, for pacing on later levels).
- Exact level count (3 vs. 4) and per-level length — budget-dependent, decide once early art/audio byte cost is known.
- Whether the boss's weak-color cycling is timer-based or hit-triggered (Section 6.4) — timer-based is likely simpler to tune for a jam; pick this unless hit-triggered proves easy to balance.
- Precise palette hex values for the base and colorblind-mode palettes (Section 10) — use an established colorblind-safe palette reference (e.g. a Deuteranopia/Protanopia-safe set) rather than inventing values from scratch.
- Whether death restarts the whole level or a shorter "arena" segment for boss fights specifically (avoiding forcing a full level replay after multiple boss attempts) — reasonable to special-case even while general checkpoints stay P2.
