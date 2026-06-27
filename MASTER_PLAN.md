# 🎮 Azri Engine — Grand Master Plan to Ship

_Audit + roadmap generated from a full read of the codebase (≈30k LOC, 92 TS/TSX files). TypeScript build passes clean (`tsc -b` → exit 0)._

---

## ✅ Completed in this pass

Phases 0–1 + the quick perf wins are **done and verified** (`tsc -b` clean, `vite build` clean, headless physics test passing):

- **P0 physics fix** — `startWorld()` is now called in `GameRunner.start()`; tile collision bodies populate the Matter world and the player is grounded (verified headlessly: without the fix the player falls through; with it, lands and grounds on a tile). Moving-platform bodies are kept in sync each frame; duplicate player-body add removed.
- **Secondary physics fix** — `getGroundedState()` extracted the tile id with `split('_')[1]`, which always returned `null` because real tile ids (`tile_<ts>_<rand>`) contain underscores → bouncy-tile landings were dead. Now strips only the label prefix.
- **Redundancies** — triple `attackCooldown` decrement → one; dual contradictory network-sync blocks → one canonical broadcast (+ remote extrapolation kept).
- **Dead code / clutter** — removed `applyGravity`, `checkCollisionLegacy`, the `patch*.cjs`/`refactor.cjs` codemod scripts, and unused deps `@pixi/react` + `locally`.
- **Electron** — DevTools no longer opens in production; added the missing `get-user-data-path` / `get-app-path` IPC handlers so the packaged DB path works.
- **Perf** — pooled particles (no per-frame `Graphics` churn + fixed a `spriteCache` leak); behavior loop + floating-tile checks now iterate the small `dynamicTiles` cache instead of all tiles; reusable probe-body cache in `checkCollisionShapes`.
- **Docs** — real `README.md`; removed the stale `engine_deep_dive.md` (it documented a different project).

### Wave 2 (follow-ups — also done & verified)

- **Audio** — new zero-asset `AudioSystem` (procedural Web Audio SFX, no audio files needed) wired into 12 game events (jump/double/wall/super-jump, dash, land/heavy-land, bounce, melee hit/heavy, enemy death, player hit, game over); unlocked on first keypress. Optional howler-backed music API (`playMusic`) ready for when you add tracks.
- **Tests** — Vitest set up (`npm test`); `PhysicsSystem.test.ts` (8 tests) locks in the P0 grounding fix, the underscore-id fix, AABB/shape collision, and the probe-body cache.
- **Bundle** — `manualChunks` split the single 1.6 MB chunk into `index` (810 kB) + cached vendor chunks (pixi/matter/react/sql/misc).
- **Multiplayer** — `peerConfig` now appends an env-driven TURN server (`VITE_TURN_*`, see `.env.example`) on top of STUN.
- **Renderer** — view-frustum tile culling (behavior/moving tiles exempt) + the O(n²) water-surface lookup replaced with the precomputed `waterOccupied` set.
- **Electron security** — flipped to `contextIsolation: true` / `nodeIntegration: false`; `DatabaseService` and wasm/DB-file access now go through a `contextBridge` API in `preload.js` (renderer has zero direct Node access), with a defensive IndexedDB fallback if the Electron file path errors.
- **Lint** — auto-fixed the safe rules (`prefer-const`) on touched files.

### Wave 3 (gameplay bug + final perf — done & verified)

- **Floating platforms fixed** — two real bugs: (1) they never bobbed (only sank under the player), and (2) their Matter collision body stayed static at the spawn point while the sprite moved. Added a continuous sine **bob** (new `bobAmount`/`bobSpeed` editor sliders, back-compat defaults), and made floating/chaos/dead tiles **kinematic collision bodies** that track their visual position every frame. Headless sim confirms the player rides the bob (12px oscillation = the 6px amplitude), stays grounded, never falls through. Same root-cause fix also repairs chaos/crumbling-tile collision.
- **Entity render cache (atlas-equivalent)** — `PixiRenderer` no longer re-rasterizes every character to canvas and re-uploads to the GPU each frame. A pure `entitySignature()` keys the cached texture on all ~18 raster-affecting fields (continuous ones quantized to ~20fps); a static/walking entity reuses its texture (~3× fewer redraws), dynamic states (hit/dash/wall) render live. Sprite transforms (position/rotation/squash) stay 60fps. Guarded by `entitySignature.test.ts`.

Test suite is now **16 tests across 2 files** (`npm test`).

**Still genuinely open:** fixed-timestep sim for multiplayer determinism, the bulk `any` lint cleanup, Sentry/error monitoring, `electron-updater` + code signing, and an Electron desktop smoke-test of the new DB-file path (the web path is fully covered; the desktop path is defensively guarded).

---

## Verdict

This is a **genuinely impressive** 2D platformer engine + editor: deep movement (combos, dashes, wall-jumps, slams, bounce-cancel), 8+ tile behaviors, a sprite/character maker, level editor, P2P multiplayer, and Electron packaging. The bones are strong.

But three things stand between you and "deployable":
1. **One likely game-breaking physics regression** (player tile collision is not wired up at HEAD).
2. **A handful of redundancies and dead code** from the recent Matter.js migration.
3. **A half-wired deployment story** — multiplayer discovery/hosting only exists in `vite dev`, there's no audio, no tests, and Electron ships with DevTools open.

All fixable. Plan below is ordered so each phase unblocks the next.

---

## 🔴 P0 — The one thing that may be broken right now

**Player has no tile collision because the Matter world is never populated.**

- `PhysicsSystem.startWorld()` ([PhysicsSystem.ts:48](src/editor/game/PhysicsSystem.ts:48)) builds and adds **every tile/shape collision body** to the Matter world. It is **never called anywhere** (verified by grep across `src/`).
- In [GameRunner.ts:456](src/editor/game/GameRunner.ts:456) the **only** body added to the Matter world is the player (and it's added twice — `createPlayerBody` already adds it at [PhysicsSystem.ts:123](src/editor/game/PhysicsSystem.ts:123)).
- Matter gravity is zeroed ([PhysicsSystem.ts:34-36](src/editor/game/PhysicsSystem.ts:34)), so with no tile bodies, `getGroundedState()` can never find ground → `isGrounded` is effectively always false and the player falls through the world.

**Fix (≈2 lines):** in `GameRunner.start()`, after `initTileCaches()`, call:
```ts
this.physics.startWorld(this.cachedTileRects, this.collisionShapes);
```
and remove the duplicate player-body add at line 456 (keep the one inside `createPlayerBody`). Then re-verify grounding/landing.

> ⚠️ This is a static-analysis finding — it should be confirmed with a 2-minute runtime check (run the game, walk on a tile). If movement currently works in your testing, then `startWorld` is being called somewhere outside `src/` and we should find it — but nothing in the tree calls it.

---

## 🟠 Redundancies & holes (the "no redundancies or holes" pass)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 1 | `attackCooldown` decremented **3×** per frame | [GameRunner.ts:869-882](src/editor/game/GameRunner.ts:869) | Combo timing drains 3× too fast | Keep one decrement, delete the other two |
| 2 | **Two contradictory** network-sync blocks (one counts timer down @ 20 t/s incl. `username`, the other counts up @ ~20 t/s w/o it) | [706-723](src/editor/game/GameRunner.ts:706) & [1667-1682](src/editor/game/GameRunner.ts:1667) | Double broadcasts, erratic tick rate, wasted bandwidth | Delete one block; keep a single sync path |
| 3 | Player body added to Matter world **twice** | [447](src/editor/game/GameRunner.ts:447) + [456](src/editor/game/GameRunner.ts:456) | Redundant body | Remove the second add |
| 4 | Dead code: `applyGravity`, `checkCollisionLegacy` (no callers) | [PhysicsSystem.ts:181,231](src/editor/game/PhysicsSystem.ts:181) | Confusion, dead weight | Delete |
| 5 | Untracked codemod scripts left in repo root | `patch.cjs`, `patch_final.cjs`, `refactor.cjs` | Clutter; the only uncommitted files | Delete (already applied to GameRunner) |
| 6 | Unused dependencies | `@pixi/react`, `locally` (no imports in `src/`) | Bloats install/bundle | `npm remove @pixi/react locally` |
| 7 | Electron opens **DevTools in production** | [electron/main.js:30](electron/main.js:30) | Ships dev UI to users | Guard behind `isDev` |
| 8 | `nodeIntegration:true` + `contextIsolation:false` | [electron/main.js:17-18](electron/main.js:18) | Security risk if ever distributed | Move FS access to preload + IPC, isolate context |
| 9 | Stale/misleading docs | `engine_deep_dive.md` (documents a *different* project, "Stories of Resonance"), `README.md` (default Vite template) | Misleads contributors; half its lib advice you already adopted | Rewrite/delete |
| 10 | No audio anywhere | whole `src/` | Silent game | See libraries §A |
| 11 | No tests, no error monitoring | repo-wide | Risky to ship/update | See libraries §B |

---

## 🟢 Smoothness / performance — running as smooth as possible

These don't bite on small maps but will tank FPS as levels/particles grow.

| Hotspot | Location | Problem | Fix |
|---------|----------|---------|-----|
| Particle rendering | [PixiRenderer.ts:592](src/engine/rendering/PixiRenderer.ts:592) | Destroys & re-creates a `Graphics` for **every particle every frame** (code even admits "will pool sprites") | Use a pooled `ParticleContainer` (built into Pixi v8) or `@pixi/particle-emitter` |
| Tile sync | [PixiRenderer.ts:363](src/engine/rendering/PixiRenderer.ts:363) | `tiles.some(...)` water-surface check **inside** the per-tile loop = O(n²); no off-screen culling — every tile updated each frame | Pass the precomputed `waterOccupied` set from GameRunner; cull tiles to the camera view |
| Tile behaviors | [GameRunner.ts:2049](src/editor/game/GameRunner.ts:2049) | Iterates **all** tiles and allocates a behaviors array every frame, even for static tiles | Iterate the existing `dynamicTiles` cache only |
| Floating tiles | [GameRunner.ts:814](src/editor/game/GameRunner.ts:814) | `this.tiles.find(...)` (O(n)) inside a `forEach` = O(n²) | Use a `Map<id,tile>` lookup |
| Shape collision | [PhysicsSystem.ts:224](src/editor/game/PhysicsSystem.ts:224) | Allocates a `Matter.Bodies.rectangle` on **every** call (multiple per enemy per frame) | Reuse one temp body, or cache a broad-phase grid |
| Entity textures | [PixiRenderer.ts:497-510](src/engine/rendering/PixiRenderer.ts:497) | Re-rasterizes each character via Canvas2D and re-uploads to GPU **every frame** | Bake animation frames into a texture atlas once; swap frames instead of redrawing (see §A atlas) |
| Enemy attacks use `setTimeout` | [GameRunner.ts:1875+](src/editor/game/GameRunner.ts:1875) | Wall-clock timers fire independent of the game loop (break on pause/lag) | Drive from accumulated `dt` timers in the update loop |
| Variable timestep | [GameRunner.ts:579](src/editor/game/GameRunner.ts:579) | `Math.min(dt,0.1)` is fine solo, but non-deterministic — bad for multiplayer sync | Fixed-timestep accumulator for the sim, render interpolated |

---

## 🧰 3rd-party engines & libraries to add

You already use the heavy hitters well (PixiJS 8, Matter.js, anime.js, Zustand, sql.js, PeerJS). Don't re-add those. These are the genuine gaps.

### §A — Make it epic, playable & fun

| Library | Why | Where it plugs in |
|---------|-----|-------------------|
| **howler.js** (~10KB) | #1 missing feature: zero audio. SFX (hits, jumps, dashes, UI), BGM with crossfade, spatial panning | New `AudioSystem`; fire from `checkMeleeHitbox`, jump/land/dash, `hitPlayer`, tile triggers |
| **Pixi `ParticleContainer` / @pixi/particle-emitter** | Order-of-magnitude faster particles; you already spawn hundreds | Replace `syncParticles` immediate-mode path |
| **Native Gamepad API** (no dep) or **joypad.js** (~4KB) | Controller support → feels like a real console platformer | Poll alongside keyboard in `update()` |
| **EasyStar.js** (~10KB) | Real A* pathfinding on your tile grid → enemies that navigate, not just home in by distance | Enemy AI in `updateEnemies` |
| **Extra Pixi filters** (`@pixi/filter-bloom`, `-crt`, `-displacement`) | You already ship `@pixi/filter-glow`; add bloom on hits, CRT toggle, displacement water | Renderer filter pass |
| **xstate** or a 30-line FSM _(optional)_ | The player `state` string soup (`attack_air_down_3`…) is fragile | Replace ad-hoc state strings |
| **rot.js / simplex-noise / Tone.js** _(optional, later)_ | Proc-gen levels, procedural terrain, generative music if you want infinite content | New world-gen + audio modules |

### §B — Make it deployable & robust

| Tool | Why |
|------|-----|
| **TURN server** (coturn self-host, or Metered/Twilio) | You're STUN-only → ~10-20% of players (symmetric NAT) can't connect. Add TURN ICE servers to [peerConfig.ts](src/editor/utils/peerConfig.ts) |
| **Deployable signaling** (host `peerjs-server`, or keep public cloud) | Public PeerJS cloud works but is rate-limited/unreliable for a real launch |
| **Vitest + @testing-library + Playwright** | Currently **zero tests**. At minimum: physics/collision unit tests + one editor smoke test |
| **@sentry/electron + @sentry/browser** | Crash & error reporting once real users hit it |
| **electron-updater** | Auto-update the desktop build (pairs with electron-builder you already have) |
| **electron-builder code signing** | Unsigned installers trip SmartScreen/Gatekeeper warnings |

---

## 🗺️ The phased master plan

### Phase 0 — Make it provably run _(gate everything on this)_
- Fix P0 physics (`startWorld`) and remove the duplicate player body.
- Manual smoke test: walk, jump, land, wall-jump, hit an enemy, die, restart.

### Phase 1 — Clean house
- Delete `patch.cjs`, `patch_final.cjs`, `refactor.cjs`.
- Fix redundancies #1-3, delete dead code #4, prune unused deps #6.
- Guard Electron DevTools behind `isDev` (#7).
- Replace `README.md` with real docs; delete/replace `engine_deep_dive.md`.

### Phase 2 — Pick target(s) & finish the wiring
- **Web (recommended primary)** → static deploy to itch.io / Netlify. Multiplayer via public PeerJS + **TURN**. Fastest path to "people can actually play."
- **Desktop (Electron)** → harden security (#8), DevTools off, add `electron-updater` + signing.
- **Multiplayer** → move LAN discovery / tunnel hosting out of `vite.config` (dev-only today) into something that exists in prod, or ship "connect by code" as v1 and make LAN a desktop-only bonus.

### Phase 3 — Performance hardening
- Pooled particles, renderer tile culling, fix the O(n²) lookups, atlas the entity frames, reuse the broad-phase temp body, fixed-timestep sim.

### Phase 4 — Juice & content
- Audio (howler), gamepad, save slots (Zustand `persist` / sql.js / idb-keyval), more enemy types & player skills, screen-transition polish.

### Phase 5 — Productionize
- Vitest + Playwright in CI, Sentry, auto-update, code signing, store/itch pages, trailer GIF (you already have `gifenc`).

---

## Recommended path

**Web-first** (itch.io) as the primary, public target — it's the shortest line to players and exercises 90% of the engine. Keep **Electron** as the premium desktop build (with updater + signing). Ship multiplayer as **"connect by code" + TURN** for v1; treat LAN auto-discovery as a desktop-only nicety. Everything in Phases 0-1 is mandatory regardless of which target you choose.
