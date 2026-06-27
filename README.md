# 🎮 Azri Engine

A 2D platformer **game engine + visual editor** that runs in the browser and packages to a desktop app via Electron. Build levels, draw and animate characters, wire up tile behaviors, and play your creation — solo or with friends over peer-to-peer multiplayer.

> Built with React 19 · TypeScript · Vite · PixiJS 8 (WebGL) · Matter.js · Zustand · sql.js · PeerJS · Electron · Tailwind CSS 4

---

## Features

- **Level Editor** — paint tiles across multiple layers, place props/images, draw custom collision shapes (box/circle/polygon), parallax skyboxes, prefabs, and per-level physics settings.
- **Character & Sprite Maker** — pixel-art drawing canvas with layers, an animation timeline, sprite-sheet import/detection, and GIF/sheet export.
- **Game Runtime** — a juicy platformer: multi-jump, dashes, wall-jumps & wall-slide, ground-slam + bounce-cancel, a multi-variant melee combo system, enemies (melee/shooter/tank/assassin/flyer), particles, and screen shake.
- **Tile Behaviors** — moving, transitioning, floating, bouncy, slippery, chaos, and crumbling ("dead") tiles.
- **Multiplayer** — peer-to-peer via PeerJS (connect by host code). LAN auto-discovery and internet tunnel hosting are available in dev mode.
- **Persistence** — projects, characters, prefabs, and levels stored in SQLite (sql.js), persisted to IndexedDB in the browser and to a file in the desktop build.

## Getting started

```bash
npm install
npm run dev          # start the Vite dev server (http://localhost:5173)
```

### Desktop (Electron)

```bash
npm run electron:dev     # run the app in an Electron window against the dev server
npm run electron:build   # produce a packaged desktop build in dist_electron/
```

### Other scripts

```bash
npm run build      # type-check (tsc -b) + production web build to dist/
npm run preview    # preview the production build
npm run lint       # run ESLint
```

## Architecture

```
src/
├── engine/rendering/PixiRenderer.ts   # WebGL scene-graph renderer (tiles, entities, particles, skybox, FX)
├── editor/
│   ├── game/                          # runtime: GameRunner (loop), PhysicsSystem (Matter.js),
│   │                                  #   AnimationSystem (anime.js), EnemyRenderer, NetworkManager
│   ├── components/                    # editor UI: canvas, panels, modals, tiles
│   ├── characterMaster/              # character + sprite maker (drawing, timeline, export)
│   ├── state/                         # Zustand stores (editorStore, historyStore)
│   ├── db/                            # sql.js DatabaseService + repositories
│   └── tools/                         # editor tools (brush, eraser, shape, bucket, select, collision)
└── App.tsx                            # shell / layout entry
electron/                              # Electron main + preload (IPC for maps + DB paths)
vite.config.ts                         # Vite config + dev-only PeerServer / LAN discovery / tunnel plugin
```

The game loop lives in [`GameRunner`](src/editor/game/GameRunner.ts): it reads a snapshot of the editor state, builds a Matter.js collision world from the level's tiles and collision shapes, runs input/physics/AI/particles each frame, and hands a render snapshot to [`PixiRenderer`](src/engine/rendering/PixiRenderer.ts).

## Controls (play mode)

| Action | Keys |
|--------|------|
| Move | `A` / `D` or `←` / `→` |
| Jump / Double-jump | `Space` / `W` / `↑` |
| Crouch | `S` / `↓` |
| Dash | `F` |
| Attack (combo variants) | `Q` (hold a direction for variants) |
| Ground slam | `↓` while airborne |

## Multiplayer

Signaling uses the public PeerJS cloud with Google STUN servers (see [`peerConfig.ts`](src/editor/utils/peerConfig.ts)), so **connect-by-code works in production and Electron builds**. **LAN auto-discovery** and **internet tunnel hosting** are implemented as a Vite dev-server plugin and are therefore only available under `npm run dev`. See [`MULTIPLAYER_GUIDE.md`](MULTIPLAYER_GUIDE.md) and [`host_guide.md`](host_guide.md).

> ℹ️ For robust multiplayer across all networks (symmetric NAT), add a TURN server to the ICE list in `peerConfig.ts`.

## Roadmap

See [`MASTER_PLAN.md`](MASTER_PLAN.md) for the full architecture audit, performance notes, recommended libraries, and the phased plan to ship.
