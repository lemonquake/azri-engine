# 🔬 Stories of Resonance — Engine Deep Dive & Enhancement Proposals

## Current Architecture Overview

## System-by-System Analysis

### 1. Rendering Engine ([Engine.ts](file:///a:/Python/stories-of-resonance/stories-of-resonance/src/engine/Engine.ts))
| Aspect | Status | Details |
|--------|--------|---------|
| Game Loop | ✅ Solid | `requestAnimationFrame` with delta-time capping at 100ms |
| Camera | ✅ Good | Lerp-based smooth follow with map clamping |
| Map Caching | ✅ Optimized | Static terrain cached to an OffscreenCanvas |
| Entity Sorting | ✅ Works | Y-sort depth ordering with pre-allocated render queue |
| Collision | ⚠️ Basic | Axis-aligned corner checks, no swept/continuous |
| Tile System | ⚠️ Limited | 8 tile types, no auto-tiling or multi-layer support |
| Lighting | ❌ None | No dynamic lighting, shadows, or time-of-day |
| Sound | ❌ None | Completely silent — no SFX, BGM, or ambient audio |
| Pathfinding | ❌ None | Entities have no AI navigation |

### 2. Sprite / Asset System ([Assets.ts](file:///a:/Python/stories-of-resonance/stories-of-resonance/src/engine/Assets.ts))
| Aspect | Status | Details |
|--------|--------|---------|
| Generation | ✅ Clever | Procedural SVG→base64 pipeline at startup |
| Caching | ✅ Solid | Pre-generated frame cache, no runtime allocations |
| Character Art | ⚠️ SVG-only | 64×64 pixel art from SVG — looks flat at larger sizes |
| Enemy Variety | ❌ Single | Only Slime enemy sprite exists |
| Tileset Art | ❌ Flat colors | Solid `fillRect` for tiles — no textures or detail |

### 3. Battle System ([BattleScreen.tsx](file:///a:/Python/stories-of-resonance/stories-of-resonance/src/components/ui/BattleScreen.tsx))
| Aspect | Status | Details |
|--------|--------|---------|
| Turn Order | ✅ Good | SPD-based priority with per-round sorting |
| Actions | ✅ Functional | Attack, Skill, Heal, Defend, Flee all implemented |
| VFX | ✅ Rich | 20 CSS animation-based effects via [BattleVFX.tsx](file:///a:/Python/stories-of-resonance/stories-of-resonance/src/components/ui/BattleVFX.tsx) |
| Keyboard Nav | ✅ Recent | Arrow + Space navigation with visual flash feedback |
| Sound | ❌ None | No hit sounds, music, or audio feedback |
| Skill Variety | ❌ Shallow | Only 1 generic "Skill" per character |
| Status Effects | ❌ None | No poison, burn, stun, buffs, etc. |
| Enemy AI | ❌ Random | Enemies randomly pick a target — no tactics |

### 4. Weather & Particles ([Engine.ts:738-942](file:///a:/Python/stories-of-resonance/stories-of-resonance/src/engine/Engine.ts#L738-L942))
| Aspect | Status | Details |
|--------|--------|---------|
| Particle Types | ✅ Rich | DUST, RAIN, SNOW, SPARK, RIPPLE, GLIMMER, FOG |
| Weather System | ✅ Functional | 5 weather states with smooth transitions |
| Batch Rendering | ✅ Optimized | Rain batched into a single stroke path |
| Physics | ⚠️ Basic | Linear acceleration + drag only |

### 5. State Management ([store.ts](file:///a:/Python/stories-of-resonance/stories-of-resonance/src/store.ts))
| Aspect | Status | Details |
|--------|--------|---------|
| Store | ✅ Good | Zustand with atomic selectors |
| Persistence | ❌ None | All progress lost on refresh — no save/load |
| Leveling | ❌ None | XP accumulates but doesn't level up characters |

### 6. UI & UX
| Aspect | Status | Details |
|--------|--------|---------|
| HUD | ✅ Polished | HP/MP bars, minimap, quest tracker, notifications |
| Dialogue | ✅ Refined | Typewriter, portraits, skip-to-complete |
| Inventory | ⚠️ Shell | UI exists but no equippable items in practice |
| Map Transitions | ❌ None | Single map, no zone transitions or loading |

---

## 🚀 15 External Library Enhancement Proposals

> [!IMPORTANT]
> These are ordered by impact-to-effort ratio. Each proposal identifies **what library**, **what it solves**, and **where it integrates** into your existing architecture.

---

### 1. 🔊 `howler.js` — Game Audio Engine
**Library**: [`howler.js`](https://howlerjs.com/) (~10KB gzipped)

**What it solves**: The game is completely silent. Audio is the single highest-impact missing feature.

**Implementation**:
- **BGM**: Looping background music per map/battle with crossfading
- **SFX**: Hit sounds, footsteps, UI clicks, spell casts, item pickups
- **Ambient**: Rain pattering, wind, forest ambience tied to weather state
- **Spatial audio**: Howler supports Web Audio panning for positional NPC sounds

**Integration Points**:
- `Engine.ts` → footstep SFX on movement, ambient loops
- `BattleScreen.tsx` → attack hit sounds, skill casts, victory fanfare
- `DialogueBox.tsx` → text tick sound, dialogue advance blip
- `store.ts` → weather change triggers ambient audio swap

```
Impact: ★★★★★ | Effort: ★★☆☆☆
```

---

### 2. 💾 `idb-keyval` — Save/Load System via IndexedDB
**Library**: [`idb-keyval`](https://github.com/nicedoc/idb-keyval) (~600B)

**What it solves**: All progress is lost on page refresh. No save system exists.

**Implementation**:
- Auto-save on map transitions, quest completions, battle victories
- Manual save slots (3 slots) with timestamps and preview info
- Save data: player position, party stats, quest states, inventory, gold/XP, defeated enemies
- "Continue" button on a new title screen

**Integration Points**:
- New `src/engine/SaveSystem.ts` module
- `store.ts` → serialize/deserialize full game state
- `Engine.ts` → restore player/follower position, defeated enemies set

```
Impact: ★★★★★ | Effort: ★★☆☆☆
```

---

### 3. 🎨 `pixi.js` — GPU-Accelerated 2D Renderer
**Library**: [`pixi.js`](https://pixijs.com/) v8 (~200KB)

**What it solves**: The Canvas2D renderer bottlenecks at scale. PixiJS would unlock WebGL hardware acceleration for massive performance gains.

**Implementation**:
- Replace `ctx.drawImage()` calls with Pixi `Sprite` and `Container` objects
- Automatic sprite batching (hundreds of entities at 60fps)
- Built-in texture atlas support for efficient VRAM usage
- Native particle container (`ParticleContainer`) for 10,000+ particles
- Displacement filters for water distortion, heatwave effects
- `ColorMatrixFilter` for grayscale death effect, poison tint, night overlays

**Integration Points**:
- Replace canvas rendering in `GameCanvas.tsx` with a Pixi `Application`
- `Engine.ts` → migrate `draw()` to use Pixi scene graph
- Particles → `ParticleContainer` for order-of-magnitude speedup
- Tile map → `TilingSprite` or `CompositeTilemap`

```
Impact: ★★★★★ | Effort: ★★★★☆
```

---

### 4. ⚡ `@tweenjs/tween.js` — Easing & Animation Library
**Library**: [`@tweenjs/tween.js`](https://github.com/tweenjs/tween.js) (~10KB)

**What it solves**: Character movements, UI transitions, and battle animations use basic linear interpolation or CSS hacks. Tween.js provides dozens of easing functions for butter-smooth, expressive motion.

**Implementation**:
- **Camera**: Elastic/bounce easing on camera snap-to-player
- **Battle lunges**: Smooth `easeInOutBack` for attack lunges instead of hard CSS transform
- **Damage numbers**: Custom rise + scale + spin with `easeOutQuint`
- **Screen transitions**: Elegant wipe/fade between maps and battle entry
- **UI panels**: Inventory, quest log slide in with spring physics

**Integration Points**:
- `Engine.ts` → camera follow, entity interpolation
- `BattleScreen.tsx` → lunge/shake/flash animations driven by tween chains
- All UI overlays (dialogue, inventory, quest log)

```
Impact: ★★★★☆ | Effort: ★★☆☆☆
```

---

### 5. 🗺️ `rot.js` — Roguelike Toolkit (Pathfinding, FOV, Map Gen)
**Library**: [`rot.js`](https://ondras.github.io/rot.js/) (~30KB)

**What it solves**: No NPC pathfinding, no field-of-view, no procedural map generation.

**Implementation**:
- **A* Pathfinding**: NPCs and enemies that wander, patrol, or chase the player
- **Field of View (FOV)**: Fog-of-war that gradually reveals as you explore
- **Procedural Dungeons**: Generate cave interiors, dungeon zones, or forest mazes
- **Line of Sight**: Enemies only aggro when they can "see" the player

**Integration Points**:
- `Engine.ts` → NPC/enemy AI update loop with pathfinding
- `MapData.ts` → procedural dungeon generator for new zones
- `Engine.draw()` → FOV mask overlay to hide unexplored areas

```
Impact: ★★★★☆ | Effort: ★★★☆☆
```

---

### 6. 🎶 `tone.js` — Procedural Music & Sound Synthesis
**Library**: [`Tone.js`](https://tonejs.github.io/) (~150KB)

**What it solves**: Instead of audio files (which require assets), Tone.js can **synthesize** background music and sound effects procedurally — perfect for a game with procedural sprites.

**Implementation**:
- **Battle music**: Procedurally generated looping combat tracks with drum patterns
- **Overworld theme**: Ambient generative music that responds to weather/area
- **SFX synthesis**: Slash whooshes, heal chimes, spell impacts — no audio files needed
- **Dynamic mixing**: Music intensity increases during combat, calms during dialogue

**Integration Points**:
- New `src/engine/AudioEngine.ts` system
- `store.ts` → music state tied to mode changes (PLAY/BATTLE/DIALOGUE)
- `Engine.ts` → ambient sound layer tied to weather

```
Impact: ★★★★☆ | Effort: ★★★☆☆
```

---

### 7. ✨ `canvas-confetti` — Victory & Achievement Celebrations
**Library**: [`canvas-confetti`](https://github.com/catdad/canvas-confetti) (~5KB)

**What it solves**: Battle victories, quest completions, and level-ups feel flat.

**Implementation**:
- **Battle victory**: Gold confetti burst when enemies are defeated
- **Quest complete**: Purple crystal sparkle shower
- **Level up**: Explosive star confetti with multiple waves
- **Item discovery**: Smaller targeted burst at item location

**Integration Points**:
- `BattleScreen.tsx` → `endBattle(true)` triggers confetti
- `QuestSystem.ts` → quest completion triggers celebration
- Easily chainable for multi-wave effects

```
Impact: ★★★☆☆ | Effort: ★☆☆☆☆
```

---

### 8. 📊 `zustand/middleware` (persist) — Middleware-Powered State Persistence
**Library**: Built-in Zustand `persist` middleware (already installed)

**What it solves**: Adds autosave with zero new dependencies.

**Implementation**:
- Wrap the existing Zustand store with `persist()`
- Configure `localStorage` or `IndexedDB` storage adapter
- Whitelist specific state slices (party, quests, gold, XP — not transient state like camera/particles)
- Add a `resetGame()` action for new game starts

**Integration Points**:
- `store.ts` → wrap `create()` call with `persist()` middleware
- `App.tsx` → add title screen with Continue/New Game

```
Impact: ★★★★☆ | Effort: ★☆☆☆☆
```

---

### 9. 🎭 `animejs` — Complex UI & Battle Choreography
**Library**: [`anime.js`](https://animejs.com/) v4 (~17KB)

**What it solves**: Battle VFX are currently pure CSS `@keyframes`. Anime.js enables timeline-based choreography with stagger, morph, and path animations.

**Implementation**:
- **Battle intro**: Cinematic pan with staggered enemy reveals
- **Skill choreography**: Multi-hit combo sequences with precise timing chains
- **UI transitions**: Staggered menu item reveals, bouncing notifications
- **Death sequences**: Dramatic dissolve/shatter effects on defeat
- **Map transitions**: Elegant scene-change wipes and fades

**Integration Points**:
- `BattleVFX.tsx` → replace CSS animations with anime.js timelines
- `BattleScreen.tsx` → intro/outro sequences
- All overlay UIs → entry/exit animations

```
Impact: ★★★★☆ | Effort: ★★★☆☆
```

---

### 10. 🧬 `simplex-noise` — Procedural Terrain Generation
**Library**: [`simplex-noise`](https://github.com/jwagner/simplex-noise) (~3KB)

**What it solves**: Maps are hand-crafted arrays. Simplex noise enables infinite procedural world generation.

**Implementation**:
- **Terrain biomes**: Multi-octave noise for smooth elevation → grass/forest/water/mountain
- **Detail layers**: Secondary noise for flower placement, tree density, rock scatter
- **World map**: Infinite scrolling overworld with chunk-based loading
- **Cave interiors**: Inverted noise for natural cave formations
- **Weather patterns**: Noise-driven cloud shadows and wind gusts

**Integration Points**:
- `MapData.ts` → procedural `buildMap()` replacement
- New `src/engine/WorldGenerator.ts` module
- `Engine.ts` → chunk loading/unloading based on player position

```
Impact: ★★★★☆ | Effort: ★★★☆☆
```

---

### 11. 🌙 `gl-matrix` — High-Performance Math for Lighting & FX
**Library**: [`gl-matrix`](https://glmatrix.net/) (~10KB)

**What it solves**: No dynamic lighting or complex math operations.

**Implementation**:
- **Day/Night cycle**: Smooth ambient light color transitions using matrix transforms
- **Point lights**: NPC lanterns, campfires, magic glow with proper attenuation
- **Shadow casting**: Simple 2D raycasting shadows from light sources
- **Camera effects**: Zoom, rotation, and screen shake with matrix multiplication

**Integration Points**:
- `Engine.ts` → light rendering pass after entities
- `MapData.ts` → light source objects in map definitions
- `Assets.ts` → dynamic tinting of sprites based on ambient light

```
Impact: ★★★☆☆ | Effort: ★★★☆☆
```

---

### 12. 📦 `texture-packer` + `@pixi/spritesheet` — Professional Sprite Atlas Pipeline
**Library**: [`free-tex-packer-core`](https://github.com/nicedoc/free-tex-packer-core) (build tool)

**What it solves**: Each sprite is a separate `Image()` object. A texture atlas packs them all into one GPU texture.

**Implementation**:
- Pack all character frames into a single spritesheet at build time
- Dramatically reduce draw calls and texture swaps
- Load one image at startup instead of dozens
- Compatible with Pixi.js `Spritesheet` loader

**Integration Points**:
- Build step: pack SVG-generated frames into atlas PNG + JSON
- `Assets.ts` → load atlas, extract frames by name/index
- Eliminates per-frame `Image()` objects

```
Impact: ★★★☆☆ | Effort: ★★★☆☆
```

---

### 13. 🎮 `gamepad-api` (native) + `joymap` — Controller Support
**Library**: [`joymap`](https://github.com/nicedoc/joymap) (~4KB) or native `Gamepad API`

**What it solves**: Game only supports keyboard. Gamepad support makes it feel like a real console RPG.

**Implementation**:
- D-pad / left stick for movement
- A button = interact/confirm, B button = cancel/back
- Triggers for inventory/quest log shortcuts
- Vibration feedback on battle hits (if supported)

**Integration Points**:
- `Engine.ts` → poll gamepad state alongside keyboard in `update()`
- `BattleScreen.tsx` → gamepad navigation for action/target selection
- `DialogueBox.tsx` → A to advance dialogue

```
Impact: ★★★☆☆ | Effort: ★★☆☆☆
```

---

### 14. 📐 `matter.js` — Physics-Based Interactions
**Library**: [`matter.js`](https://brm.io/matter-js/) (~80KB)

**What it solves**: Collision detection is basic AABB corner checks. No physics for knockback, projectiles, or environmental interaction.

**Implementation**:
- **Battle knockback**: Enemies physically pushed back on heavy hits
- **Projectile physics**: Arrow/spell trajectories with gravity and wind
- **Environmental**: Pushable crates, breakable pots, bouncing items
- **Ragdoll**: Enemy death with physics-based collapse

**Integration Points**:
- `Engine.ts` → physics world running alongside game logic
- `BattleScreen.tsx` → knockback impulses on hit
- `MapData.ts` → physics body definitions for interactive objects

```
Impact: ★★★☆☆ | Effort: ★★★★☆
```

---

### 15. 🤖 `@google/genai` — AI-Powered Dynamic Narrative
**Library**: [`@google/genai`](https://www.npmjs.com/package/@google/genai) (**already installed!**)

**What it solves**: Dialogue is static and hand-written. You already have the Gemini SDK installed — use it!

**Implementation**:
- **Dynamic NPC dialogue**: NPCs respond contextually based on quest state, time of day, player actions
- **Quest generation**: AI generates side-quests with thematic variety
- **Item descriptions**: Procedural lore-rich item flavor text
- **Battle banter**: Enemies and party members make dynamic comments during combat
- **Story branching**: AI-driven narrative responses to player choices

**Integration Points**:
- `DialogueBox.tsx` → intercept dialogue display to enrich with AI
- `QuestSystem.ts` → AI generates quest objectives and descriptions
- `BattleScreen.tsx` → dynamic battle commentary in the log
- New `src/engine/NarrativeEngine.ts` module
- `.env` → API key configuration (`.env.example` already exists!)

```
Impact: ★★★★★ | Effort: ★★★☆☆
```

---

## Priority Matrix

| Tier | Proposals | Rationale |
|------|-----------|-----------|
| **Tier 1 — Do First** | 🔊 Howler.js, 💾 Zustand Persist, ✨ canvas-confetti | Massive impact, minimal effort. Transforms feel immediately. |
| **Tier 2 — Core Upgrades** | ⚡ Tween.js, 🤖 Gemini AI Narrative, 🎭 Anime.js | Deep gameplay & polish improvements. AI is already installed. |
| **Tier 3 — Architecture** | 🗺️ rot.js, 🧬 simplex-noise, 🎮 Gamepad | Enable procedural content and input flexibility. |
| **Tier 4 — Engine Rewrite** | 🎨 PixiJS, 🌙 gl-matrix, 📦 Texture Atlas | Major rendering overhaul — do after Tier 1-3 are stable. |
| **Tier 5 — Polish** | 📐 Matter.js, 🎶 Tone.js | Nice-to-haves that layer on top of everything else. |

---

> [!TIP]
> The biggest bang-for-buck is **audio (Howler.js) + save system (Zustand persist) + AI narrative (Gemini)**. These three together would transform the game from a tech demo into something players actually want to come back to — and two of them require less than 50 lines of code each.
