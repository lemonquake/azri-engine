import { useEditorStore } from '../state/editorStore';
import { PhysicsSystem } from './PhysicsSystem';
import type { CharacterInstance, Tile, TileDefinition, SkyboxLayer, PhysicsSettings, LevelImage, Layer } from '../types';
import { DEFAULT_LAYER_ID, DEFAULT_TILES } from '../types';
import { DefaultCharacter } from './DefaultCharacter';
import { EnemyRenderer } from './EnemyRenderer';
import type { CharacterAnimationState } from './DefaultCharacter';
import characterRepo from '../db/repositories/CharacterRepository';

/** Runtime state for tiles with behaviors */
interface TileRuntimeState {
    // Moving
    movingOffset: number;
    movingDirection: 1 | -1;

    // Floating
    sinkOffset: number;
    tiltAngle: number;
    playerOnTile: boolean;

    // Dead
    deadState: 'idle' | 'triggered' | 'shaking' | 'falling' | 'removed';
    deadTimer: number;
    fallVelocity: number;
    fallOffset: number;

    // Bouncy
    bounceCooldownTimer: number;

    // Transitioning
    transitionGroupId: number;
    currentAxis: 'horizontal' | 'vertical';
    wasPlayerOnTile: boolean;
    transitionDelayTimer: number;

    // Chaos
    chaosAngle: number;
    chaosTimer: number;
    chaosOffsetX: number;
    chaosOffsetY: number;
}

function createDefaultRuntimeState(tile?: Tile): TileRuntimeState {
    let initialDir: 1 | -1 = 1;
    if (tile && (tile.behavior || tile.behavior2)) {
        const behaviors = [];
        if (tile.behavior) behaviors.push(tile.behavior);
        if (tile.behavior2) behaviors.push(tile.behavior2);
        const mBehavior = behaviors.find(b => b.type === 'moving' || b.type === 'transitioning') as any;
        if (mBehavior && mBehavior.initialDirection !== undefined) {
            initialDir = mBehavior.initialDirection;
        }
    }
    return {
        movingOffset: 0,
        movingDirection: initialDir,
        sinkOffset: 0,
        tiltAngle: 0,
        playerOnTile: false,
        deadState: 'idle',
        deadTimer: 0,
        fallVelocity: 0,
        fallOffset: 0,
        bounceCooldownTimer: 0,
        transitionGroupId: -1,
        currentAxis: 'horizontal',
        wasPlayerOnTile: false,
        transitionDelayTimer: 0,
        chaosAngle: 0,
        chaosTimer: 0,
        chaosOffsetX: 0,
        chaosOffsetY: 0,
    };
}

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
    shrink: boolean;
    shape: 'circle' | 'square' | 'ring';
    rotation?: number;
    rotationSpeed?: number;
}

export interface Projectile {
    x: number;
    y: number;
    vx: number;
    vy: number;
    width: number;
    height: number;
    damage: number;
    color: string;
    life: number;
    shape: 'circle' | 'square';
}

export class GameRunner {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;
    private lastTime: number = 0;

    private physics: PhysicsSystem;
    private player: CharacterAnimationState | null = null;
    private playerTexture: HTMLImageElement | null = null;
    private camera = { x: 0, y: 0 };
    private keys: Set<string> = new Set();
    private previousKeys: Set<string> = new Set();

    // EXPOSED FOR DOM OVERLAY
    public getCamera() { return this.camera; }
    public getGridSize() { return this.gridSize; }
    public getTiles() { return this.tiles; }
    public getLayers() { return this.layers; }
    public onGrassRustle?: (tileId: string) => void;
    public onGameOver?: () => void; // [NEW] Game Over Callback

    // --- State ---
    private isGameOver: boolean = false; // [NEW] Game Over State

    // Characters & Combat
    private enemies: CharacterAnimationState[] = [];
    private enemyProjectiles: Projectile[] = [];

    // Bound handler references for proper cleanup
    private boundHandleKeyDown: (e: KeyboardEvent) => void;
    private boundHandleKeyUp: (e: KeyboardEvent) => void;
    private boundResize: () => void;

    // Editor State Snapshot
    private layers: Layer[] = [];
    private tiles: Tile[] = [];
    private levelImages: LevelImage[] = []; // [NEW] Level Images
    private collisionShapes: import('../types').CollisionShape[] = []; // [NEW] Collision Shapes
    private tileDefs: Map<string, TileDefinition> = new Map();
    private gridSize: number = 32;
    private skyboxLayers: SkyboxLayer[] = [];
    private skyboxOffsets: Map<string, { x: number, y: number }> = new Map(); // Runtime offsets for velocity
    private physicsSettings: PhysicsSettings;

    // Tile behavior runtime
    private tileRuntime: Map<string, TileRuntimeState> = new Map();

    // Collision and Rendering Caches for Performance
    private cachedTileRects: import('./PhysicsSystem').TileWorldRect[] = [];
    private dynamicTiles: { tile: Tile, rt: TileRuntimeState, tr: import('./PhysicsSystem').TileWorldRect, baseX: number, baseY: number }[] = [];
    private cachedRectsByLayer: Map<string, import('./PhysicsSystem').TileWorldRect[]> = new Map();

    // Visual Effects
    private particles: Particle[] = [];
    private screenShakeTimer: number = 0;
    private screenShakeIntensity: number = 0;
    private playerLastTransitionGroupId: number = -1;

    public onStatsChange?: (stats: { hp: number, maxHp: number, exp: number, maxExp: number, level: number, wallJumps: number, maxWallJumps: number, wallFriction: number }) => void;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        // Optimization: Disable image smoothing for pixel art look
        this.ctx.imageSmoothingEnabled = false;

        // Grab state
        const state = useEditorStore.getState();
        this.layers = state.layers;
        this.tiles = Array.from(state.tiles.values());
        this.levelImages = state.levelImages; // [NEW]
        this.collisionShapes = Array.from(state.collisionShapes.values()); // [NEW] Load shapes
        this.gridSize = state.gridSize;
        this.skyboxLayers = state.skyboxLayers;
        this.physicsSettings = state.physicsSettings;
        DEFAULT_TILES.forEach(def => this.tileDefs.set(def.id, def));
        state.availableTiles.forEach(def => this.tileDefs.set(def.id, def));

        this.physics = new PhysicsSystem(this.gridSize);

        // Init runtime states for behavior tiles
        this.tiles.forEach(tile => {
            if (tile.behavior) {
                this.tileRuntime.set(tile.id, createDefaultRuntimeState(tile));
            }
        });

        // Store bound handler references for proper cleanup
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        this.boundResize = this.resize.bind(this);

        // Resize handling
        this.resize();
        window.addEventListener('resize', this.boundResize);

        // Input handling
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);

        // Initialize Player
        this.initPlayer(state);
    }

    private resize() {
        if (this.canvas.parentElement) {
            this.canvas.width = this.canvas.parentElement.clientWidth;
            this.canvas.height = this.canvas.parentElement.clientHeight;
            this.ctx.imageSmoothingEnabled = false;
        }
    }

    private getTileImage(src: string): HTMLImageElement {
        const imageCache: { [key: string]: HTMLImageElement } = (window as any)._tileImageCache || {};
        (window as any)._tileImageCache = imageCache;
        if (!imageCache[src]) {
            const img = new Image();
            img.src = src;
            imageCache[src] = img;
        }
        return imageCache[src];
    }

    private initPlayer(state: any) {
        // Find player start
        let playerStart: CharacterInstance | undefined;

        this.enemies = [];
        this.enemyProjectiles = [];

        // Check characters for isPlayer flag
        if (state.characters && typeof state.characters.forEach === 'function') {
            state.characters.forEach((char: CharacterInstance) => {
                if (char.overrideProperties?.isPlayer) {
                    playerStart = char;
                } else if (char.overrideProperties?.isEnemy) {
                    this.enemies.push({
                        x: char.gridX * this.gridSize,
                        y: char.gridY * this.gridSize,
                        width: 20,
                        height: 28,
                        velocityX: 0,
                        velocityY: 0,
                        isGrounded: false,
                        facingRight: false,
                        state: 'idle',
                        animationTimer: Math.random() * 10,
                        hp: char.overrideProperties.maxHp || 50,
                        maxHp: char.overrideProperties.maxHp || 50,
                        exp: char.overrideProperties.exp || 25,
                        maxExp: 100,
                        level: 1,
                        isEnemy: true,
                        enemyType: char.overrideProperties.enemyType || 'melee',
                        enemyBehavior: char.overrideProperties.behavior || 'standing',
                        startX: char.gridX * this.gridSize,
                        attackCooldown: 0,
                        dead: false
                    });
                }
            });
        }

        const startX = playerStart ? playerStart.gridX * this.gridSize : 100;
        const startY = playerStart ? playerStart.gridY * this.gridSize : 100;

        this.player = {
            x: startX,
            y: startY,
            width: 20, // Slimmer than grid
            height: 28, // Slightly shorter than grid
            velocityX: 0,
            velocityY: 0,
            isGrounded: false,
            facingRight: true,
            state: 'idle',
            animationTimer: 0,
            hp: 100,
            maxHp: 100,
            exp: 0,
            maxExp: 100,
            level: 1,
            // Gameplay Mechanics
            jumpCount: 0,
            maxJumps: 2,
            dashCooldownTimer: 0,
            dashDurationTimer: 0,
            isDashing: false,
            isOnWall: false,
            wallSlideTimer: 0,
            wallDirection: 0,
            wallJumpCount: 0,
            isSlamming: false,
            exhaustedWallJumpTimer: 0,
            wallFriction: 0,
            isOverheated: false,
            bounceCancelWindowTimer: 0
        };

        // Notify initial stats
        this.emitStats();

        // Load Player Texture if custom character
        if (playerStart) {
            const charDef = characterRepo.getById(playerStart.characterId);
            if (charDef && charDef.metadata) {
                try { } catch (e) { }
            }
        }

        if (!playerStart) {
            console.warn("No player start found, spawning at default.");
        }
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.initTileCaches(); // Cache all tiles for performance!
        this.lastTime = performance.now();
        this.loop();
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        window.removeEventListener('keydown', this.boundHandleKeyDown);
        window.removeEventListener('keyup', this.boundHandleKeyUp);
        window.removeEventListener('resize', this.boundResize);
    }

    private emitStats() {
        if (this.onStatsChange && this.player) {
            this.onStatsChange({
                hp: this.player.hp,
                maxHp: this.player.maxHp,
                exp: this.player.exp,
                maxExp: this.player.maxExp,
                level: this.player.level,
                wallJumps: 4 - (this.player.wallJumpCount || 0),
                maxWallJumps: 4,
                wallFriction: this.player.wallFriction || 0
            });
        }
    }

    private handleKeyDown(e: KeyboardEvent) {
        this.keys.add(e.key.toLowerCase());
    }

    private handleKeyUp(e: KeyboardEvent) {
        this.keys.delete(e.key.toLowerCase());
    }

    private spawnParticle(p: Partial<Particle>) {
        this.particles.push({
            x: p.x || 0,
            y: p.y || 0,
            vx: p.vx || 0,
            vy: p.vy || 0,
            life: p.life || 0.5,
            maxLife: p.maxLife || p.life || 0.5,
            color: p.color || '#ffffff',
            size: p.size || 4,
            shrink: p.shrink ?? true,
            shape: p.shape || 'square',
            rotation: p.rotation || 0,
            rotationSpeed: p.rotationSpeed || 0
        });
    }

    private spawnDust(cx: number, cy: number, count: number = 5, color: string = '#d1d5db') {
        for (let i = 0; i < count; i++) {
            this.spawnParticle({
                x: cx + (Math.random() - 0.5) * 10,
                y: cy + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * -10, // slightly upward
                life: 0.3 + Math.random() * 0.2,
                color: color,
                size: 3 + Math.random() * 3,
                shape: 'square'
            });
        }
    }

    private loop() {
        if (!this.isRunning) return;

        const now = performance.now();
        const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1); // Cap dt
        this.lastTime = now;

        this.update(deltaTime);
        this.render();

        this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
    }

    // ─── Initialize caching for tiles to prevent garbage collection stutter ───
    private initTileCaches() {
        this.cachedTileRects = [];
        this.dynamicTiles = [];
        this.cachedRectsByLayer.clear();

        for (const tile of this.tiles) {
            let wx = tile.gridX * this.gridSize;
            let wy = tile.gridY * this.gridSize;
            let wWidth = this.gridSize;
            let wHeight = this.gridSize;

            if (tile.spriteId === 'text_object' && tile.text) {
                this.ctx.save();
                this.ctx.font = `${tile.fontSize || 32}px "${tile.fontFamily || 'sans-serif'}"`;
                wWidth = this.ctx.measureText(tile.text).width;
                wHeight = tile.fontSize || 32;
                this.ctx.restore();
            }

            const tr = { tile, x: wx, y: wy, width: wWidth, height: wHeight };
            this.cachedTileRects.push(tr);

            if (!this.cachedRectsByLayer.has(tile.layerId)) {
                this.cachedRectsByLayer.set(tile.layerId, []);
            }
            this.cachedRectsByLayer.get(tile.layerId)!.push(tr);

        }

        // Init runtime states for behavior tiles
        for (const tile of this.tiles) {
            const behaviors = this.getTileBehaviors(tile);
            if (behaviors.length > 0) {
                const rt = createDefaultRuntimeState(tile);
                this.tileRuntime.set(tile.id, rt);

                // Set initial axis for transitioning behavior if present
                for (const b of behaviors) {
                    if (b.type === 'transitioning') {
                        rt.currentAxis = b.axis;
                    }
                }
                // Find the corresponding cached tile rect
                const tr = this.cachedTileRects.find(r => r.tile.id === tile.id);
                if (tr) {
                    this.dynamicTiles.push({ tile, rt, tr, baseX: tr.x, baseY: tr.y });
                }
            }
        }

        // --- Group Transitioning Tiles ---
        let nextGroupId = 0;
        const visitedIds = new Set<string>();

        for (const dtile of this.dynamicTiles) {
            const dtBehaviors = this.getTileBehaviors(dtile.tile);
            const isTransitioning = dtBehaviors.some(b => b.type === 'transitioning');

            if (isTransitioning && !visitedIds.has(dtile.tile.id)) {
                // Flood fill to find all contiguous transitioning tiles
                const groupIds: string[] = [];
                const queue: typeof dtile[] = [dtile];
                visitedIds.add(dtile.tile.id);

                while (queue.length > 0) {
                    const current = queue.shift()!;
                    groupIds.push(current.tile.id);

                    // Find neighbors
                    for (const other of this.dynamicTiles) {
                        const otherBehaviors = this.getTileBehaviors(other.tile);
                        if (otherBehaviors.some(b => b.type === 'transitioning') && !visitedIds.has(other.tile.id)) {
                            // Check adjacency (left, right, top, bottom)
                            const dx = Math.abs(current.tile.gridX - other.tile.gridX);
                            const dy = Math.abs(current.tile.gridY - other.tile.gridY);
                            if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                                visitedIds.add(other.tile.id);
                                queue.push(other);
                            }
                        }
                    }
                }

                groupIds.forEach(id => {
                    const rt = this.tileRuntime.get(id);
                    if (rt) rt.transitionGroupId = nextGroupId;
                });
                nextGroupId++;
            }
        }
    }

    private update(dt: number) {
        if (!this.player || this.isGameOver) return;

        if (this.player.exhaustedWallJumpTimer && this.player.exhaustedWallJumpTimer > 0) {
            this.player.exhaustedWallJumpTimer -= dt;
        }

        if (this.player.bounceCancelWindowTimer && this.player.bounceCancelWindowTimer > 0) {
            this.player.bounceCancelWindowTimer -= dt;
        }

        if (this.screenShakeTimer > 0) {
            this.screenShakeTimer -= dt;
        }

        // ─── Update Tile Behaviors ───
        this.updateTileBehaviors(dt);

        // [OPTIMIZATION] Update cached rects for dynamic tiles only
        for (const dtile of this.dynamicTiles) {
            const { tile, rt, tr, baseX, baseY } = dtile;
            let wx = baseX;
            let wy = baseY;

            const behaviors = this.getTileBehaviors(tile);
            for (const behavior of behaviors) {
                if (!behavior) continue; // Should not happen with getTileBehaviors, but for safety
                switch (behavior.type) {
                    case 'moving': {
                        if (behavior.axis === 'horizontal') wx += rt.movingOffset;
                        else wy += rt.movingOffset;
                        break;
                    }
                    case 'transitioning': {
                        if (rt.currentAxis === 'horizontal') wx += rt.movingOffset;
                        else wy += rt.movingOffset;
                        break;
                    }
                    case 'chaos': {
                        wx += rt.chaosOffsetX;
                        wy += rt.chaosOffsetY;
                        break;
                    }
                    case 'floating': {
                        wy += rt.sinkOffset;
                        break;
                    }
                    case 'dead': {
                        if (rt.deadState === 'removed') {
                            tr.x = -999999;
                            tr.y = -999999;
                            tr.width = 0;
                            tr.height = 0;
                            continue; // Skip further updates for this tile if removed
                        }
                        wy += rt.fallOffset;
                        if (rt.deadState === 'shaking') {
                            wx += (Math.random() - 0.5) * 4;
                        }
                        break;
                    }
                } // end behavior switch
            } // end behavior loop
            tr.x = wx;
            tr.y = wy;
        }

        const { moveSpeed, jumpForce, gravity } = this.physicsSettings;
        const jumpVelocity = -jumpForce;

        // [OPTIMIZATION] Cull tiles for physics down to a small radius around player
        const cullRange = this.gridSize * 4;
        const pX = this.player.x;
        const pY = this.player.y;
        const pW = this.player.width;
        const pH = this.player.height;

        const tileRects = this.cachedTileRects.filter(tr =>
            tr.x + tr.width >= pX - cullRange &&
            tr.x <= pX + pW + cullRange &&
            tr.y + tr.height >= pY - cullRange &&
            tr.y <= pY + pH + cullRange
        );

        // ─── Determine ground tile BEFORE input ───
        const groundTileRect = this.physics.getGroundTile(
            { x: this.player.x, y: this.player.y, width: this.player.width, height: this.player.height },
            tileRects
        );
        const groundTile = groundTileRect?.tile ?? null;
        const groundRt = groundTile ? this.tileRuntime.get(groundTile.id) : null;

        // Mark floating tiles player status
        this.tileRuntime.forEach((rt, id) => {
            const tile = this.tiles.find(t => t.id === id);
            if (tile?.behavior?.type === 'floating') {
                rt.playerOnTile = groundTile?.id === id;
            }
        });

        // Handle Transitioning & Dead Triggers
        if (groundTile && groundRt) {
            const groundBehaviors = this.getTileBehaviors(groundTile);

            // Transitioning
            const transitioningBehavior = groundBehaviors.find(b => b.type === 'transitioning') as import('../types').TransitioningBehavior | undefined;
            if (transitioningBehavior) {
                if (this.playerLastTransitionGroupId !== groundRt.transitionGroupId) {
                    this.playerLastTransitionGroupId = groundRt.transitionGroupId;

                    const delay = transitioningBehavior.delay;
                    this.tiles.forEach(t => {
                        const tBehaviors = this.getTileBehaviors(t);
                        if (tBehaviors.some(b => b.type === 'transitioning')) {
                            const trt = this.tileRuntime.get(t.id);
                            if (trt && trt.transitionGroupId === groundRt.transitionGroupId) {
                                if (delay > 0) {
                                    trt.transitionDelayTimer = delay;
                                } else {
                                    trt.currentAxis = trt.currentAxis === 'horizontal' ? 'vertical' : 'horizontal';
                                }
                            }
                        }
                    });
                }
            } else if (!groundBehaviors.some(b => b.type === 'moving')) {
                // Reset if standing on normal ground or in air, to allow re-triggering later.
                this.playerLastTransitionGroupId = -1;
            }

            // Trigger dead tiles
            const deadBehavior = groundBehaviors.find(b => b.type === 'dead') as import('../types').DeadBehavior | undefined;
            if (deadBehavior && groundRt.deadState === 'idle') {
                groundRt.deadState = 'triggered';
                groundRt.deadTimer = deadBehavior.delay;
            }
        } else {
            this.playerLastTransitionGroupId = -1;
        }

        // Check for newly pressed keys
        const isJustPressed = (key: string) => this.keys.has(key) && !this.previousKeys.has(key);

        // Input
        let dx = 0;
        if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
        if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;

        // Attack Mechanics
        if (this.player.attackCooldown && this.player.attackCooldown > 0) {
            this.player.attackCooldown -= dt;
        }

        const isAttacking = this.player.state.startsWith('attack');

        // Attack Mechanics (Combo Logic)
        if (this.player.attackCooldown && this.player.attackCooldown > 0) {
            this.player.attackCooldown -= dt;
        }

        const canAttack = this.player.state !== 'hit' &&
            (!isAttacking || (isAttacking && this.player.animationTimer > 0.2 && (this.player.attackCooldown || 0) <= 0)) &&
            (this.player.isGrounded || (this.player.airAttackCount || 0) < 3);

        if (canAttack && isJustPressed('q')) {
            if (!this.player.isGrounded) {
                this.player.airAttackCount = (this.player.airAttackCount || 0) + 1;
            }
            let prefix = 'attack_base_';
            if (this.keys.has('w') || this.keys.has('arrowup')) {
                prefix = 'attack_up_';
            } else if (this.keys.has('s') || this.keys.has('arrowdown')) {
                prefix = 'attack_down_';
            }

            let step = 1;
            if (isAttacking && this.player.state.startsWith(prefix)) {
                const currentStep = parseInt(this.player.state.slice(-1));
                if (currentStep && currentStep < 3) {
                    step = currentStep + 1;
                }
            }

            this.player.state = `${prefix}${step}`;
            this.player.animationTimer = 0;
            this.player.attackCooldown = 0.2; // brief window to buffer next input

            // Movement and hitbox specifics
            let range = 60 + step * 30; // 90, 120, 150
            let height = this.player.height;
            let dmg = 15 + step * 10;

            if (step === 3) {
                // Player Stretch for impact
                this.player.scaleX = 0.5;
                this.player.scaleY = 1.6;

                // Slash Effect
                this.spawnParticle({
                    x: this.player.facingRight ? this.player.x + this.player.width + 20 : this.player.x - 20,
                    y: this.player.y + this.player.height / 2,
                    vx: 0, vy: 0,
                    life: 0.15,
                    color: '#f87171',
                    size: 80, // Massive slash
                    shape: 'slash' as any,
                    rotation: this.player.facingRight ? 45 : -45,
                    shrink: true
                });
            } else {
                // Normal hit effects
                this.player.scaleX = 1.2;
                this.player.scaleY = 0.9;

                // Slash Effect
                this.spawnParticle({
                    x: this.player.facingRight ? this.player.x + this.player.width + 10 : this.player.x - 10,
                    y: this.player.y + this.player.height / 2,
                    vx: 0, vy: 0,
                    life: 0.1,
                    color: '#fca5a5',
                    size: 40,
                    shape: 'slash' as any,
                    rotation: this.player.facingRight ? 20 + step * 10 : -20 - step * 10,
                    shrink: true
                });
            }

            if (prefix === 'attack_base_') {
                if (step === 3) this.player.velocityX = this.player.facingRight ? 250 : -250;
                this.checkMeleeHitbox(range, height, dmg, 0, 0, step === 3);
            } else if (prefix === 'attack_up_') {
                if (!this.player.isGrounded) this.player.velocityY = -150 - step * 50;
                this.checkMeleeHitbox(range + 20, height * 2.5, dmg, 0, -height * 1.5, step === 3); // Huge upwards box
            } else if (prefix === 'attack_down_') {
                if (!this.player.isGrounded) this.player.velocityY = 400;
                this.checkMeleeHitbox(range, height * 2, dmg + 10, 0, height * 0.5, step === 3); // Hurtbox extends below feet
            }
        }

        if (this.player.state.startsWith('attack')) {
            if (this.player.animationTimer > 0.4) {
                this.player.state = 'idle'; // End attack
            } else {
                if (this.player.isGrounded) dx = 0; // Lock horizontal input on ground
            }
        } else if (this.player.state === 'hit') {
            if (this.player.animationTimer > 0.4) {
                this.player.state = 'idle';
            } else {
                dx = 0; // Stunned
            }
        }

        // Dash Mechanics
        const dashKey = 'f';
        if (this.player.dashCooldownTimer !== undefined) {
            if (this.player.dashCooldownTimer > 0) {
                this.player.dashCooldownTimer -= dt;
            }
        }
        if (this.player.dashDurationTimer !== undefined) {
            if (this.player.dashDurationTimer > 0) {
                this.player.dashDurationTimer -= dt;
                if (this.player.dashDurationTimer <= 0) {
                    this.player.isDashing = false;
                }
            }
        }

        if (isJustPressed(dashKey) && !this.player.isDashing && (this.player.dashCooldownTimer || 0) <= 0) {
            this.player.isDashing = true;
            this.player.isSlamming = false;
            this.player.dashDurationTimer = 0.2; // 200ms dash
            this.player.dashCooldownTimer = 1.0; // 1s cooldown
            // Set dash velocity immediately
            const dashSpeed = moveSpeed * 3;
            // Dash in facing direction if no input, else dash in input direction
            const dashDir = dx !== 0 ? Math.sign(dx) : (this.player.facingRight ? 1 : -1);
            this.player.velocityX = dashDir * dashSpeed;
            // Reset Y velocity to stay airborne/straight
            this.player.velocityY = 0;
        }

        // Crouch & Slam Logic
        const isCrouchInput = this.keys.has('s') || this.keys.has('arrowdown');
        const crouchJustPressed = isJustPressed('s') || isJustPressed('arrowdown');
        const standingHeight = 28;
        const crouchingHeight = 18;

        // Ground Smash
        if (!this.player.isGrounded && crouchJustPressed && !this.player.isOnWall) {
            // Check minimum distance to ground to prevent abuse (e.g. 80 pixels)
            // We project a box purely BELOW the player. If it hits ground, they are too low to smash.
            const minSmashHeight = 80;
            const smashCheckCollider = {
                x: this.player.x + 2, // Slight inward inset to avoid wall friction triggering it
                y: this.player.y + this.player.height, // Start checking directly below feet
                width: this.player.width - 4,
                height: minSmashHeight
            };

            const tooLowToSmash = this.physics.checkCollision(smashCheckCollider, tileRects) ||
                this.physics.checkCollisionShapes(smashCheckCollider, this.collisionShapes);

            if (!tooLowToSmash) {
                this.player.isSlamming = true;
                this.player.isDashing = false; // Cancel dash
                this.player.dashDurationTimer = 0;
                this.player.velocityY = 800; // Massive downward velocity
                this.player.velocityX = 0; // Stop horizontal movement
            }
        }

        let shouldCrouch = isCrouchInput && this.player.isGrounded; // Only crouch on ground

        // If trying to stand up, check if we CAN stand up
        if (!shouldCrouch && this.player.state === 'crouch') {
            const collider = {
                x: this.player.x,
                y: this.player.y - (standingHeight - crouchingHeight),
                width: this.player.width,
                height: standingHeight
            };
            // Check tiles AND shapes
            if (this.physics.checkCollision(collider, tileRects) || this.physics.checkCollisionShapes(collider, this.collisionShapes)) {
                shouldCrouch = true;
            }
        }

        const canUpdateMoveState = !this.player.state.startsWith('attack') && this.player.state !== 'hit';

        // Apply Crouch State
        if (shouldCrouch && canUpdateMoveState) {
            if (this.player.state !== 'crouch') {
                this.player.y += (standingHeight - crouchingHeight);
                this.player.height = crouchingHeight;
                this.player.state = 'crouch';
            }
            dx = 0;
        } else {
            if (this.player.state === 'crouch') {
                this.player.y -= (standingHeight - crouchingHeight);
                this.player.height = standingHeight;
                if (canUpdateMoveState) this.player.state = 'idle';
            }
        }

        // Slippery tile handling
        const groundBehaviorsForSlippery = groundTile ? this.getTileBehaviors(groundTile) : [];
        const slipperyBehavior = groundBehaviorsForSlippery.find(b => b.type === 'slippery') as import('../types').SlipperyBehavior | undefined;
        const onSlippery = !!slipperyBehavior;

        const wasMovingHorizontal = Math.abs(this.player.velocityX) > 10;

        // Horizontal Movement
        if (this.player.isDashing) {
            // Dashing overrides horizontal movement and gravity
            // Keep existing dash velocity
            if (this.player.velocityX !== 0) {
                this.player.facingRight = this.player.velocityX > 0;
            }
        } else if (onSlippery && slipperyBehavior) {
            // Momentum-based sliding
            const targetVX = dx * moveSpeed;
            const accel = slipperyBehavior.acceleration;
            if (Math.abs(targetVX - this.player.velocityX) < accel * dt) {
                this.player.velocityX = targetVX;
            } else if (targetVX > this.player.velocityX) {
                this.player.velocityX += accel * dt;
            } else if (targetVX < this.player.velocityX) {
                this.player.velocityX -= accel * dt;
            }
            // Apply friction deceleration when no input
            if (dx === 0) {
                this.player.velocityX *= (1 - slipperyBehavior.friction);
                if (Math.abs(this.player.velocityX) < 1) this.player.velocityX = 0;
            }
            if (dx !== 0) this.player.facingRight = dx > 0;
            if (this.player.isGrounded && canUpdateMoveState) {
                this.player.state = Math.abs(this.player.velocityX) > 5 ? 'walk' : 'idle';
            }
        } else {
            // Normal movement
            if (dx !== 0) {
                this.player.velocityX = dx * moveSpeed;
                this.player.facingRight = dx > 0;
                if (this.player.isGrounded && canUpdateMoveState) this.player.state = 'walk';
            } else {
                if (wasMovingHorizontal && this.player.isGrounded && !shouldCrouch) {
                    // Braking smoke
                    const brakeFrontX = this.player.facingRight ? this.player.x + this.player.width : this.player.x;
                    this.spawnDust(brakeFrontX, this.player.y + this.player.height, 3, '#9ca3af');
                }
                this.player.velocityX = 0;
                if (this.player.isGrounded && !shouldCrouch && canUpdateMoveState) this.player.state = 'idle';
            }
        }

        // Jump
        const jumpJustPressed = isJustPressed(' ') || isJustPressed('w') || isJustPressed('arrowup');

        // Reset jump count when grounded
        if (this.player.isGrounded) {
            this.player.jumpCount = 0;
            this.player.airAttackCount = 0; // Reset air attacks
            if (this.player.wallJumpCount !== 0) {
                this.player.wallJumpCount = 0;
                this.emitStats();
            }
            this.player.isOverheated = false; // Reset overheat on ground
        }

        // --- SLAM VISUALS DURING FALL ---
        if (this.player.isSlamming) {
            // Intense wind lines blowing UP
            for (let i = 0; i < 2; i++) {
                this.spawnParticle({
                    x: this.player.x + Math.random() * this.player.width,
                    y: this.player.y + this.player.height + Math.random() * 20,
                    vx: (Math.random() - 0.5) * 10,
                    vy: -400 - Math.random() * 400,
                    life: 0.1 + Math.random() * 0.15,
                    color: '#e2e8f0', // light slate wind
                    size: 1 + Math.random() * 2,
                    shape: 'square'
                });
            }
            // Red Afterimages
            if (!this.player.dashTrail) this.player.dashTrail = [];
            if (Math.random() > 0.3) {
                this.player.dashTrail.push({
                    x: this.player.x,
                    y: this.player.y,
                    facingRight: this.player.facingRight,
                    state: this.player.state,
                    rotation: this.player.rotation || 0,
                    opacity: 0.8,
                    tint: '#ef4444' // Intense Red
                });
            }
        }

        if (jumpJustPressed && !shouldCrouch) {
            if (this.player.bounceCancelWindowTimer && this.player.bounceCancelWindowTimer > 0) {
                // Bounce-Cancel Super Jump!
                this.player.velocityY = jumpVelocity * 1.5; // Massive jump
                this.player.isGrounded = false;
                this.player.state = 'jump';
                this.player.jumpCount = 1;
                this.player.bounceCancelWindowTimer = 0;
                this.player.isSlamming = false;

                // Visuals: Super Flash & Spring
                this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height, 10, '#fcd34d'); // Yellowish dust

                // Yellow Energy Burst from feet
                for (let i = 0; i < 20; i++) {
                    const angle = (i / 20) * Math.PI * 2;
                    const speed = 150 + Math.random() * 100;
                    this.spawnParticle({
                        x: this.player.x + this.player.width / 2,
                        y: this.player.y + this.player.height,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 0.3 + Math.random() * 0.2,
                        color: '#fef08a', // Yellow energy
                        size: 4 + Math.random() * 4,
                        shape: 'circle'
                    });
                }

                // Screen shake on super jump
                this.screenShakeTimer = 0.15;
                this.screenShakeIntensity = 5;

                // Stretch dramatically
                this.player.scaleX = 0.5;
                this.player.scaleY = 2.0;

            } else if (this.player.isGrounded && !this.player.isSlamming) {
                // First Jump (Standard)
                this.player.velocityY = jumpVelocity;
                this.player.isGrounded = false;
                this.player.state = 'jump';
                this.player.jumpCount = 1;

                // Visuals: Squash + Dust
                this.player.scaleX = 0.8;
                this.player.scaleY = 1.3;
                this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height, 5, '#e5e7eb');
            } else if (this.player.isOnWall && (this.player.wallJumpCount || 0) < 4) {
                // Wall Jump (Max 4)
                this.player.velocityY = jumpVelocity * 0.9;
                // Kick off the wall
                this.player.velocityX = -(this.player.wallDirection || 1) * moveSpeed * 1.5;
                this.player.facingRight = this.player.velocityX > 0;

                this.player.state = 'jump';
                this.player.isOnWall = false;
                this.player.wallSlideTimer = 0;
                this.player.jumpCount = 1; // Count as first jump so they can double jump after
                this.player.wallJumpCount = (this.player.wallJumpCount || 0) + 1;
                this.player.wallFriction = 0; // Reset friction on jump
                this.emitStats();

                // Visuals: Wall kick particles
                const wallX = this.player.wallDirection === 1 ? this.player.x + this.player.width : this.player.x;
                for (let i = 0; i < 6; i++) {
                    this.spawnParticle({
                        x: wallX,
                        y: this.player.y + this.player.height / 2 + (Math.random() - 0.5) * 10,
                        vx: -(this.player.wallDirection || 1) * (10 + Math.random() * 20),
                        vy: (Math.random() - 0.5) * 20,
                        life: 0.3 + Math.random() * 0.2,
                        color: '#ddd6fe', // light purple
                        size: 3 + Math.random() * 3
                    });
                }
            } else if (this.player.isOnWall && (this.player.wallJumpCount || 0) >= 4) {
                this.player.exhaustedWallJumpTimer = 0.5;
            } else if ((this.player.jumpCount || 0) < (this.player.maxJumps || 2)) {
                // Double/Multi Jump
                this.player.velocityY = jumpVelocity;
                this.player.state = 'jump';
                this.player.jumpCount = (this.player.jumpCount || 0) + 1;
                this.player.isSlamming = false;

                // Visuals: Flip animation trigger and explosive ring
                this.player.rotation = this.player.facingRight ? 1 : -1; // init flip rotation in facing direction
                for (let i = 0; i < 12; i++) {
                    const angle = (i / 12) * Math.PI * 2;
                    const speed = 30 + Math.random() * 20;
                    this.spawnParticle({
                        x: this.player.x + this.player.width / 2,
                        y: this.player.y + this.player.height,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 0.2 + Math.random() * 0.2,
                        color: '#a855f7',
                        size: 4 + Math.random() * 2
                    });
                }

                // Allow cancelling a dash with a jump
                if (this.player.isDashing) {
                    this.player.isDashing = false;
                    this.player.dashDurationTimer = 0;
                    // Retain some of horizontal momentum butcap it
                    this.player.velocityX = Math.sign(this.player.velocityX) * moveSpeed;
                }
            }
        }

        // Gravity
        if (!this.player.isDashing && !this.player.isSlamming) {
            this.player.velocityY += gravity * dt;
        }

        // ─── Grass Rustle Detection ───
        if (this.onGrassRustle) {
            const px = this.player.x;
            const py = this.player.y;
            const pw = this.player.width;
            const ph = this.player.height;
            // [OPTIMIZATION] Use already culled physics tile list
            for (let i = 0; i < tileRects.length; i++) {
                const tr = tileRects[i];
                if (tr.tile.spriteId === 'grass') {
                    if (px < tr.x + tr.width && px + pw > tr.x && py < tr.y + tr.height && py + ph > tr.y) {
                        this.onGrassRustle!(tr.tile.id);
                    }
                }
            }
        }

        // ─── Moving tile carry & push ───
        // First, handle being carried by the ground tile
        const groundBehaviorsForCarry = groundTile ? this.getTileBehaviors(groundTile) : [];
        const carryBehavior = groundBehaviorsForCarry.find(b => b.type === 'moving' || b.type === 'transitioning') as any;

        if (carryBehavior && groundRt) {
            let currentSpeed = carryBehavior.speed * groundRt.movingDirection;
            if (carryBehavior.speedUpOnPlayer) currentSpeed *= carryBehavior.speedMultiplier || 1;
            if (carryBehavior.slowDownOnPlayer) currentSpeed /= carryBehavior.speedMultiplier || 1;

            const axis = carryBehavior.type === 'transitioning' ? groundRt.currentAxis : carryBehavior.axis;

            // Only carry if NOT delayed
            let isDelayed = false;
            if (carryBehavior.type === 'transitioning' && groundRt.transitionDelayTimer > 0) {
                isDelayed = true;
            }

            if (!isDelayed) {
                if (axis === 'horizontal') {
                    this.player.x += currentSpeed * dt;
                } else {
                    this.player.y += currentSpeed * dt;
                }
            }
        }

        // Second, push player horizontally if a moving tile pushes INTO them from the side
        for (let i = 0; i < tileRects.length; i++) {
            const tr = tileRects[i];
            const tBehaviors = this.getTileBehaviors(tr.tile);
            const pushBehavior = tBehaviors.find(b => b.type === 'moving' || b.type === 'transitioning') as any;

            if (pushBehavior) {
                const rt = this.tileRuntime.get(tr.tile.id);
                if (!rt) continue;

                let isDelayed = false;
                if (pushBehavior.type === 'transitioning' && rt.transitionDelayTimer > 0) {
                    isDelayed = true;
                }

                if (isDelayed) continue; // Not moving, won't push

                // Basic AABB check
                const px = this.player.x;
                const py = this.player.y;
                const pw = this.player.width;
                const ph = this.player.height;

                // Expand tile rect slightly to catch overlaps created this frame
                const overlapX = (px < tr.x + tr.width) && (px + pw > tr.x);
                const overlapY = (py < tr.y + tr.height - 2) && (py + ph > tr.y + 2); // -2/+2 to ignore floor/ceiling grazing

                if (overlapX && overlapY) {
                    // We are intersecting a moving tile laterally
                    const axis = pushBehavior.type === 'transitioning' ? rt.currentAxis : pushBehavior.axis;

                    if (axis === 'horizontal') {
                        let currentSpeed = pushBehavior.speed * rt.movingDirection;
                        if (currentSpeed > 0 && px < tr.x + tr.width && px + pw / 2 > tr.x + tr.width / 2) {
                            // Moving Right, hit player on right side
                            this.player.x = tr.x + tr.width;
                        } else if (currentSpeed < 0 && px + pw > tr.x && px + pw / 2 < tr.x + tr.width / 2) {
                            // Moving Left, hit player on left side
                            this.player.x = tr.x - pw;
                        }
                    }
                }
            }
        }

        // ─── Physics Resolution with world rects ───
        this.player.isOnWall = false;

        // Apply Velocity (X)
        this.player.x += this.player.velocityX * dt;
        let collider = { x: this.player.x, y: this.player.y, width: this.player.width, height: this.player.height };

        // [NEW] Check Tiles OR Shapes
        if (this.physics.checkCollision(collider, tileRects) || this.physics.checkCollisionShapes(collider, this.collisionShapes)) {
            // ─── Step-Up / Slope Logic ───
            // If we hit a wall/slope, try stepping up slightly
            const stepHeight = 8;
            const originalY = this.player.y;
            let steppedUp = false;

            // Check if we can step up (iterate for precision)
            for (let i = 1; i <= stepHeight; i++) {
                collider.y = originalY - i;
                if (!this.physics.checkCollision(collider, tileRects) && !this.physics.checkCollisionShapes(collider, this.collisionShapes)) {
                    this.player.y = originalY - i;
                    steppedUp = true;
                    break;
                }
            }

            if (!steppedUp) {
                // Wall is too tall, stop horizontal movement
                collider.y = originalY; // Reset collider for future checks if needed

                // ─── Precise Horizontal Binary Search ───
                const preCollisionX = this.player.x - this.player.velocityX * dt;
                let loX = preCollisionX;
                let hiX = this.player.x;
                for (let step = 0; step < 10; step++) {
                    const midX = (loX + hiX) / 2;
                    collider.x = midX;
                    const collides = this.physics.checkCollision(collider, tileRects) ||
                        this.physics.checkCollisionShapes(collider, this.collisionShapes);
                    if (collides) {
                        hiX = midX; // still colliding, search backward
                    } else {
                        loX = midX; // no collision, search deeper
                    }
                }
                this.player.x = loX;
                collider.x = this.player.x; // Restore collider state

                // Wall Climb/Slide Logic
                if (!this.player.isGrounded && !shouldCrouch && !this.player.isOverheated) {
                    this.player.isOnWall = true;
                    this.player.wallDirection = this.player.velocityX > 0 ? 1 : -1;

                    // If pressing towards the wall, we stick/slide but build friction
                    if ((dx > 0 && this.player.wallDirection === 1) || (dx < 0 && this.player.wallDirection === -1)) {
                        if ((this.player.wallSlideTimer || 0) <= 0) {
                            this.player.wallSlideTimer = 1.5; // stick for 1.5s
                        }
                    } else {
                        // Not holding towards wall, cool down friction slowly
                        this.player.wallFriction = Math.max(0, (this.player.wallFriction || 0) - 20 * dt);
                    }
                }

                this.player.velocityX = 0;
            }
            // If stepped up, we accept the new Y and KEEP the X movement/velocity
        } else {
            // Not touching wall this frame
            this.player.wallSlideTimer = 0;
            this.player.wallFriction = Math.max(0, (this.player.wallFriction || 0) - 50 * dt);
        }

        // Apply Wall Slide limits & Friction Overheat
        if (this.player.isOnWall && !this.player.isOverheated) {
            if ((this.player.wallSlideTimer || 0) > 0) {
                this.player.wallSlideTimer = (this.player.wallSlideTimer || 0) - dt;
                // Braking/Sliding builds friction
                this.player.wallFriction = Math.min(100, (this.player.wallFriction || 0) + 60 * dt);

                // Cap downward velocity while sliding (slower slide = more friction)
                if (this.player.velocityY > 0) {
                    this.player.velocityY = Math.min(this.player.velocityY, moveSpeed * 0.2);
                }

                // Overheat Threshold Trigger
                if (this.player.wallFriction >= 100) {
                    this.player.isOverheated = true;
                    this.player.isOnWall = false; // Fall off immediately

                    // Visuals: Big smoke explosion due to overheat
                    this.spawnDust(
                        this.player.wallDirection === 1 ? this.player.x + this.player.width : this.player.x,
                        this.player.y + this.player.height / 2,
                        10,
                        '#ef4444' // red dust
                    );
                }
            } else {
                // Free fall along wall - accelerate downwards
                this.player.wallFriction = Math.max(0, (this.player.wallFriction || 0) - 10 * dt);
            }

            // Visuals: Wall sparks
            if (this.player.velocityY > 0 && Math.random() < ((this.player.wallFriction || 0) / 100)) {
                this.spawnParticle({
                    x: this.player.wallDirection === 1 ? this.player.x + this.player.width : this.player.x,
                    y: this.player.y + this.player.height,
                    vx: -(this.player.wallDirection || 1) * (5 + Math.random() * 10),
                    vy: -(10 + Math.random() * 20),
                    life: 0.2 + Math.random() * 0.2,
                    color: (this.player.wallFriction || 0) > 80 ? '#ef4444' : '#fbbf24', // Yellow to Red sparks
                    size: 2 + Math.random() * 2
                });
            }
        }

        this.emitStats();

        // Apply Velocity (Y)
        this.player.y += this.player.velocityY * dt;
        const wasGroundedBeforePhysics = this.player.isGrounded;
        this.player.isGrounded = false;

        collider.x = this.player.x;
        collider.y = this.player.y;

        const hitTileRect = this.physics.getCollidingTile(collider, tileRects);
        // [NEW] Check shape collision
        const hitShape = !hitTileRect && this.physics.checkCollisionShapes(collider, this.collisionShapes);

        if (hitTileRect || hitShape) {
            // Resolve Y collision — use binary search for precise surface placement
            const preCollisionY = this.player.y - this.player.velocityY * dt;
            let lo = preCollisionY;
            let hi = this.player.y;
            // Binary search: find the Y value where we just barely don't collide
            for (let step = 0; step < 10; step++) {
                const mid = (lo + hi) / 2;
                collider.y = mid;
                collider.x = this.player.x;
                const collides = this.physics.getCollidingTile(collider, tileRects) ||
                    this.physics.checkCollisionShapes(collider, this.collisionShapes);
                if (collides) {
                    hi = mid; // still colliding, search upward (or toward preCollisionY)
                } else {
                    lo = mid; // no collision here, search deeper toward surface
                }
            }
            // lo is now the last non-colliding Y
            this.player.y = lo;

            if (this.player.velocityY > 0) {
                // Hit floor
                this.player.isGrounded = true;

                if (!wasGroundedBeforePhysics) {
                    // Check if it was a SLAM landing
                    if (this.player.isSlamming) {
                        this.player.isSlamming = false;

                        // Bounce-Cancel Window
                        this.player.bounceCancelWindowTimer = 0.15; // 150ms window

                        // Screen Shake!
                        this.screenShakeTimer = 0.3;
                        this.screenShakeIntensity = 15;

                        // Heavy Impact Dust & Shockwave
                        this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height, 20, '#cbd5e1');

                        // Impact Flash Center
                        this.spawnParticle({
                            x: this.player.x + this.player.width / 2,
                            y: this.player.y + this.player.height,
                            vx: 0,
                            vy: 0,
                            life: 0.15,
                            color: '#ffffff',
                            size: 40,
                            shape: 'circle'
                        });

                        // Shockwave particles (left and right)
                        for (let i = 0; i < 8; i++) {
                            // Right wave
                            this.spawnParticle({
                                x: this.player.x + this.player.width,
                                y: this.player.y + this.player.height - 2,
                                vx: 400 + Math.random() * 300,
                                vy: -10 - Math.random() * 30,
                                life: 0.4,
                                color: '#e2e8f0',
                                size: 5 + Math.random() * 8
                            });
                            // Left wave
                            this.spawnParticle({
                                x: this.player.x,
                                y: this.player.y + this.player.height - 2,
                                vx: -400 - Math.random() * 300,
                                vy: -10 - Math.random() * 30,
                                life: 0.4,
                                color: '#e2e8f0',
                                size: 5 + Math.random() * 8
                            });
                        }

                        // Flying Rock Debris!
                        for (let i = 0; i < 12; i++) {
                            this.spawnParticle({
                                x: this.player.x + this.player.width / 2 + (Math.random() - 0.5) * 20,
                                y: this.player.y + this.player.height,
                                vx: (Math.random() - 0.5) * 300,
                                vy: -200 - Math.random() * 400, // blast upward
                                life: 0.5 + Math.random() * 0.5,
                                color: '#475569', // Dark rock fragments
                                size: 4 + Math.random() * 6,
                                shape: 'square'
                            });
                        }

                        this.player.scaleX = 1.8; // Huge squash
                        this.player.scaleY = 0.4;
                    } else {
                        // Regular Landing Landing Smoke & Squash Effect
                        this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height, 6, '#cbd5e1');
                        this.player.scaleX = 1.3;
                        this.player.scaleY = 0.8;
                    }
                }

                if (hitTileRect) {
                    // ─── Bouncy tile check ───
                    const hitTile = hitTileRect.tile;
                    const hitRt = this.tileRuntime.get(hitTile.id);
                    const hitBehaviors = this.getTileBehaviors(hitTile);
                    const bouncyBehavior = hitBehaviors.find(b => b.type === 'bouncy') as import('../types').BouncyBehavior | undefined;

                    if (bouncyBehavior && hitRt && hitRt.bounceCooldownTimer <= 0) {
                        this.player.velocityY = -bouncyBehavior.force;
                        this.player.isGrounded = false;
                        this.player.state = 'jump';
                        hitRt.bounceCooldownTimer = bouncyBehavior.cooldown;
                    } else {
                        if (shouldCrouch && canUpdateMoveState) this.player.state = 'crouch';
                        else if (canUpdateMoveState) {
                            if (dx === 0 && !onSlippery) this.player.state = 'idle';
                            else if (Math.abs(this.player.velocityX) > 5 || dx !== 0) this.player.state = 'walk';
                            else this.player.state = 'idle';
                        }
                        this.player.velocityY = 0;
                    }
                } else {
                    // Hit generic shape (floor) - Normal landing
                    if (shouldCrouch && canUpdateMoveState) this.player.state = 'crouch';
                    else if (canUpdateMoveState) {
                        if (dx === 0 && !onSlippery) this.player.state = 'idle';
                        else if (Math.abs(this.player.velocityX) > 5 || dx !== 0) this.player.state = 'walk';
                        else this.player.state = 'idle';
                    }
                    this.player.velocityY = 0;
                }
            } else {
                // Hit ceiling
                this.player.velocityY = 0;
            }
        }
        // --- Apply Freefall State ---
        if (!this.player.isGrounded &&
            !this.player.isOnWall &&
            !this.player.isDashing &&
            this.player.velocityY > 300 &&
            !this.player.state.startsWith('attack') &&
            this.player.state !== 'hit') {
            this.player.state = 'freefall';
        }

        // ─── Pop-off Unstuck Mechanic ───
        // If after all movement resolution the player is still inside something (e.g. crushed), pop them out
        collider.x = this.player.x;
        collider.y = this.player.y;
        if (this.physics.checkCollision(collider, tileRects) || this.physics.checkCollisionShapes(collider, this.collisionShapes)) {
            let poppedOut = false;
            // Check increasing distances to find a safe spot
            for (let r = 2; r <= 32; r += 4) {
                const offsets = [
                    { dx: 0, dy: -r }, // Top (prioritize popping up)
                    { dx: r, dy: 0 },  // Right
                    { dx: -r, dy: 0 }, // Left
                    { dx: 0, dy: r },  // Bottom
                    // Diagonals
                    { dx: r, dy: -r }, { dx: -r, dy: -r },
                    { dx: r, dy: r }, { dx: -r, dy: r }
                ];
                for (const offset of offsets) {
                    collider.x = this.player.x + offset.dx;
                    collider.y = this.player.y + offset.dy;
                    if (!this.physics.checkCollision(collider, tileRects) && !this.physics.checkCollisionShapes(collider, this.collisionShapes)) {
                        this.player.x = collider.x;
                        this.player.y = collider.y;
                        poppedOut = true;

                        // Spawn pop-off visual effects
                        this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 8, '#f87171');
                        for (let i = 0; i < 6; i++) {
                            this.spawnParticle({
                                x: this.player.x + this.player.width / 2,
                                y: this.player.y + this.player.height / 2,
                                vx: (Math.random() - 0.5) * 150,
                                vy: (Math.random() - 0.5) * 150,
                                life: 0.2 + Math.random() * 0.2,
                                color: '#ffffff',
                                size: 3
                            });
                        }
                        // Visual bump
                        this.screenShakeTimer = 0.1;
                        this.screenShakeIntensity = 3;
                        break;
                    }
                }
                if (poppedOut) break;
            }
            if (!poppedOut) {
                // Absolute fallback if severely crushed
                this.player.y -= 40;
            }
        }

        // Animation Timer
        this.player.animationTimer += dt;

        // Visual FX Recovery: Squash & Stretch
        if (this.player.scaleX !== undefined) {
            this.player.scaleX += (1 - this.player.scaleX) * 10 * dt; // Lerp back to 1
        }
        if (this.player.scaleY !== undefined) {
            this.player.scaleY += (1 - this.player.scaleY) * 10 * dt; // Lerp back to 1
        }

        // Visual FX: Flip Rotation
        if (this.player.rotation !== undefined && this.player.rotation !== 0) {
            // Spin by completing 360 degrees quickly (e.g. 720 deg/sec)
            const spinSpeed = 900;
            const rotationDir = Math.sign(this.player.rotation);
            this.player.rotation += spinSpeed * dt * rotationDir;
            // Cap at 360 or 0
            if (Math.abs(this.player.rotation) >= 360) {
                this.player.rotation = 0; // Reset once complete
            }
        }

        // Dash Trails
        if (this.player.isDashing) {
            if (!this.player.dashTrail) this.player.dashTrail = [];
            // Spawn trail every frame while dashing
            this.player.dashTrail.push({
                x: this.player.x,
                y: this.player.y,
                facingRight: this.player.facingRight,
                state: this.player.state,
                rotation: this.player.rotation || 0,
                opacity: 0.6
            });
            // Dash Smoke
            if (Math.random() > 0.4) {
                this.spawnDust(
                    this.player.x + (this.player.facingRight ? 0 : this.player.width),
                    this.player.y + this.player.height * (0.3 + Math.random() * 0.7),
                    2,
                    '#d1d5db'
                );
            }
        }
        // Update Trail Opacity
        if (this.player.dashTrail) {
            this.player.dashTrail.forEach(t => t.opacity -= 2 * dt); // Fades in ~0.5s
            this.player.dashTrail = this.player.dashTrail.filter(t => t.opacity > 0);
        }

        // --- Update Particles ---
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
                p.rotation += p.rotationSpeed * dt;
            }

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Camera Follow
        if (this.player) {
            this.camera.x = this.player.x + this.player.width / 2 - this.canvas.width / 2;
            this.camera.y = this.player.y + this.player.height / 2 - this.canvas.height / 2;
        }

        // Skybox Velocity Update
        this.skyboxLayers.forEach(layer => {
            if (layer.velocity.x !== 0 || layer.velocity.y !== 0) {
                const current = this.skyboxOffsets.get(layer.id) || { x: 0, y: 0 };
                this.skyboxOffsets.set(layer.id, {
                    x: current.x + layer.velocity.x * dt,
                    y: current.y + layer.velocity.y * dt
                });
            }
        });

        // ─── Enemy Update ───
        this.updateEnemies(dt);

        // ─── Death Line Check ───
        if (this.physicsSettings.isDeathLineEnabled && this.physicsSettings.deathLineY !== undefined) {
            if (this.player.y > this.physicsSettings.deathLineY) {
                this.triggerGameOver();
            }
        }

        // Update previous keys
        this.previousKeys = new Set(this.keys);
    }

    private checkMeleeHitbox(width: number, height: number, damage: number, offsetX: number = 0, offsetY: number = 0, isFinalHit: boolean = false) {
        if (!this.player) return;

        const dirMulti = this.player.facingRight ? 1 : -1;
        const startX = this.player.facingRight ? this.player.x + this.player.width : this.player.x - width;

        const hitbox = {
            x: startX + (offsetX * dirMulti),
            y: this.player.y + offsetY,
            width: width,
            height: height
        };

        // Check enemies
        this.enemies.forEach(enemy => {
            if (enemy.dead) return;
            if (hitbox.x < enemy.x + enemy.width && hitbox.x + hitbox.width > enemy.x &&
                hitbox.y < enemy.y + enemy.height && hitbox.y + hitbox.height > enemy.y) {
                // Hit!
                enemy.hp -= damage;
                enemy.state = 'hit';
                enemy.animationTimer = 0;
                this.spawnDust(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 8, '#ef4444');

                if (isFinalHit) {
                    this.screenShakeTimer = 0.4;
                    this.screenShakeIntensity = 15;
                } else {
                    this.screenShakeTimer = 0.1;
                    this.screenShakeIntensity = 4;
                }

                // Knockback
                enemy.velocityX = this.player!.facingRight ? 150 : -150;
                enemy.velocityY = -100;

                if (enemy.hp <= 0) {
                    enemy.dead = true;
                    this.player!.exp += enemy.exp;
                    this.emitStats();
                    for (let i = 0; i < 15; i++) {
                        this.spawnParticle({
                            x: enemy.x + enemy.width / 2,
                            y: enemy.y + enemy.height / 2,
                            vx: (Math.random() - 0.5) * 300,
                            vy: (Math.random() - 0.5) * 300,
                            life: 0.5 + Math.random() * 0.5,
                            color: '#ef4444',
                            size: 4 + Math.random() * 4
                        });
                    }
                    this.screenShakeTimer = 0.2;
                    this.screenShakeIntensity = 8;
                }
            }
        });
    }

    private updateEnemies(dt: number) {
        if (!this.player) return;

        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const proj = this.enemyProjectiles[i];
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;
            proj.life -= dt;

            if (this.player.state !== 'hit' &&
                proj.x < this.player.x + this.player.width && proj.x + proj.width > this.player.x &&
                proj.y < this.player.y + this.player.height && proj.y + proj.height > this.player.y) {
                this.hitPlayer(proj.damage);
                this.enemyProjectiles.splice(i, 1);
                continue;
            }

            if (proj.life <= 0) {
                this.enemyProjectiles.splice(i, 1);
            }
        }

        this.enemies.forEach(enemy => {
            if (enemy.dead) return;

            enemy.animationTimer += dt;
            if (enemy.attackCooldown && enemy.attackCooldown > 0) enemy.attackCooldown -= dt;

            // FLYER ignores gravity
            if (enemy.enemyType !== 'flyer') {
                enemy.velocityY += this.physicsSettings.gravity * dt;
            }

            if (enemy.state !== 'hit') {
                const distToPlayer = Math.hypot(this.player!.x - enemy.x, this.player!.y - enemy.y);
                const isShooter = enemy.enemyType === 'shooter';
                const isTank = enemy.enemyType === 'tank';
                const isAssassin = enemy.enemyType === 'assassin';
                const isFlyer = enemy.enemyType === 'flyer';

                let attackRange = 40;
                if (isShooter) attackRange = 300;
                if (isTank) attackRange = 60;
                if (isAssassin) attackRange = 50;

                if (distToPlayer < attackRange && (enemy.attackCooldown || 0) <= 0) {
                    enemy.state = 'attack1';
                    enemy.animationTimer = 0;

                    if (isShooter) enemy.attackCooldown = 2.5;
                    else if (isTank) enemy.attackCooldown = 3.0;
                    else if (isAssassin) enemy.attackCooldown = 0.8;
                    else enemy.attackCooldown = 1.5;

                    enemy.facingRight = this.player!.x > enemy.x;
                    enemy.velocityX = 0;
                    if (isFlyer) enemy.velocityY = 0;

                    if (isShooter) {
                        setTimeout(() => {
                            if (enemy.dead) return;
                            const dirX = this.player!.x - enemy.x;
                            const dirY = this.player!.y - enemy.y;
                            const mag = Math.hypot(dirX, dirY);
                            this.enemyProjectiles.push({
                                x: enemy.x + enemy.width / 2,
                                y: enemy.y + enemy.height / 2,
                                vx: (dirX / mag) * 200,
                                vy: (dirY / mag) * 200,
                                width: 8, height: 8,
                                damage: 15,
                                color: '#f59e0b', // amber
                                life: 3,
                                shape: 'circle'
                            });
                        }, 300);
                    } else if (isTank) {
                        setTimeout(() => {
                            if (enemy.dead) return;
                            // Huge shockwave hit
                            const hitX = enemy.facingRight ? enemy.x + enemy.width : enemy.x - 40;
                            if (hitX < this.player!.x + this.player!.width && hitX + 40 > this.player!.x &&
                                enemy.y - 20 < this.player!.y + this.player!.height && enemy.y + enemy.height + 20 > this.player!.y) {
                                this.hitPlayer(25);
                            }
                            this.screenShakeTimer = 0.2;
                            this.screenShakeIntensity = 8;
                        }, 600);
                    } else if (isFlyer) {
                        // Swoop
                        enemy.velocityX = enemy.facingRight ? 150 : -150;
                        enemy.velocityY = 100;
                        setTimeout(() => {
                            if (enemy.dead) return;
                            if (Math.hypot(this.player!.x - enemy.x, this.player!.y - enemy.y) < 40) {
                                this.hitPlayer(10);
                            }
                        }, 200);
                    } else {
                        // Melee & Assassin
                        setTimeout(() => {
                            if (enemy.dead) return;
                            const hitX = enemy.facingRight ? enemy.x + enemy.width : enemy.x - 20;
                            if (hitX < this.player!.x + this.player!.width && hitX + 20 > this.player!.x &&
                                enemy.y < this.player!.y + this.player!.height && enemy.y + enemy.height > this.player!.y) {
                                this.hitPlayer(isAssassin ? 15 : 10);
                            }
                        }, isAssassin ? 100 : 200);
                    }
                } else if (!['attack1', 'attack2', 'attack3'].includes(enemy.state)) {
                    let targetVx = 0;
                    let targetVy = 0;

                    let moveSpeed = 40;
                    if (isTank) moveSpeed = 20;
                    if (isAssassin) moveSpeed = 150;
                    if (isFlyer) moveSpeed = 100;

                    if (enemy.enemyBehavior === 'follow' && distToPlayer < (isFlyer ? 500 : 400) && distToPlayer > attackRange - 10) {
                        targetVx = this.player!.x > enemy.x ? moveSpeed : -moveSpeed;
                        if (isFlyer) {
                            targetVy = this.player!.y > enemy.y ? moveSpeed : -moveSpeed;
                        }
                        enemy.facingRight = targetVx > 0;
                        enemy.state = 'walk';
                    } else if (enemy.enemyBehavior === 'pingpong') {
                        if (enemy.startX === undefined) enemy.startX = enemy.x;
                        const patrolDist = 100;
                        targetVx = enemy.facingRight ? moveSpeed : -moveSpeed;
                        if (enemy.facingRight && enemy.x > enemy.startX + patrolDist) enemy.facingRight = false;
                        if (!enemy.facingRight && enemy.x < enemy.startX - patrolDist) enemy.facingRight = true;
                        enemy.state = 'walk';
                    } else {
                        enemy.state = 'idle';
                    }

                    if (isFlyer) {
                        // Smoothly transition velocity for flyers
                        enemy.velocityX += (targetVx - enemy.velocityX) * dt * 2;
                        enemy.velocityY += (targetVy - enemy.velocityY) * dt * 2;
                    } else {
                        enemy.velocityX = targetVx;
                    }
                }
            } else {
                if (enemy.animationTimer > 0.3) {
                    enemy.state = 'idle';
                    enemy.animationTimer = 0;
                }
            }

            enemy.x += enemy.velocityX * dt;
            const colliderX = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
            if (this.physics.checkCollision(colliderX, this.cachedTileRects) || this.physics.checkCollisionShapes(colliderX, this.collisionShapes)) {
                enemy.x -= enemy.velocityX * dt;
                if (enemy.enemyBehavior === 'pingpong') enemy.facingRight = !enemy.facingRight;
            }

            enemy.y += enemy.velocityY * dt;
            const colliderY = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
            if (this.physics.checkCollision(colliderY, this.cachedTileRects) || this.physics.checkCollisionShapes(colliderY, this.collisionShapes)) {
                let lo = enemy.y - enemy.velocityY * dt;
                let hi = enemy.y;
                for (let step = 0; step < 10; step++) {
                    const mid = (lo + hi) / 2;
                    colliderY.y = mid;
                    if (this.physics.checkCollision(colliderY, this.cachedTileRects) || this.physics.checkCollisionShapes(colliderY, this.collisionShapes)) {
                        hi = mid;
                    } else {
                        lo = mid;
                    }
                }
                enemy.y = lo;
                if (enemy.velocityY > 0) enemy.isGrounded = true;
                enemy.velocityY = 0;
            } else {
                enemy.isGrounded = false;
            }
        });
    }

    private hitPlayer(damage: number) {
        if (!this.player || this.player.state === 'hit') return;
        this.player.hp -= damage;
        this.player.state = 'hit';
        this.player.animationTimer = 0;
        this.screenShakeTimer = 0.2;
        this.screenShakeIntensity = 5;
        this.emitStats();
        if (this.player.hp <= 0) {
            this.triggerGameOver();
        }
    }

    private triggerGameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        if (this.onGameOver) {
            this.onGameOver();
        }
    }

    // ─── Tile Behavior Updates ───────────────────────────────────────────
    private getTileBehaviors(tile: Tile): import('../types').TileBehavior[] {
        const behaviors: import('../types').TileBehavior[] = [];
        if (tile.behavior) behaviors.push(tile.behavior);
        if (tile.behavior2) behaviors.push(tile.behavior2);
        return behaviors;
    }

    private updateTileBehaviors(dt: number) {
        for (const tile of this.tiles) {
            const behaviors = this.getTileBehaviors(tile);
            if (behaviors.length === 0) continue;

            let rt = this.tileRuntime.get(tile.id);
            if (!rt) {
                rt = createDefaultRuntimeState(tile);
                this.tileRuntime.set(tile.id, rt);
            }

            for (const behavior of behaviors) {
                switch (behavior.type) {
                    case 'moving': {
                        const maxOffset = behavior.distance * this.gridSize;
                        let speed = behavior.speed;

                        // Speed modifiers based on player presence
                        if (rt.playerOnTile) {
                            if (behavior.speedUpOnPlayer) speed *= behavior.speedMultiplier;
                            if (behavior.slowDownOnPlayer) speed /= behavior.speedMultiplier;
                        }

                        rt.movingOffset += speed * rt.movingDirection * dt;

                        let initDir = behavior.initialDirection ?? 1;
                        if (behavior.pingPong) {
                            if (initDir === 1) {
                                if (rt.movingOffset >= maxOffset) {
                                    rt.movingOffset = maxOffset;
                                    rt.movingDirection = -1;
                                } else if (rt.movingOffset <= 0) {
                                    rt.movingOffset = 0;
                                    rt.movingDirection = 1;
                                }
                            } else {
                                if (rt.movingOffset <= -maxOffset) {
                                    rt.movingOffset = -maxOffset;
                                    rt.movingDirection = 1;
                                } else if (rt.movingOffset >= 0) {
                                    rt.movingOffset = 0;
                                    rt.movingDirection = -1;
                                }
                            }
                        } else {
                            // Loop: wrap around
                            if (initDir === 1) {
                                if (rt.movingOffset >= maxOffset) rt.movingOffset = 0;
                                if (rt.movingOffset < 0) rt.movingOffset = maxOffset;
                            } else {
                                if (rt.movingOffset <= -maxOffset) rt.movingOffset = 0;
                                if (rt.movingOffset > 0) rt.movingOffset = -maxOffset;
                            }
                        }
                        break;
                    }

                    case 'transitioning': {
                        const maxOffset = behavior.distance * this.gridSize;

                        // Handle Transition Delay
                        if (rt.transitionDelayTimer > 0) {
                            rt.transitionDelayTimer -= dt;
                            if (rt.transitionDelayTimer <= 0) {
                                rt.transitionDelayTimer = 0;
                                rt.currentAxis = rt.currentAxis === 'horizontal' ? 'vertical' : 'horizontal';
                            }
                            // Stop moving while delayed
                            break;
                        }

                        rt.movingOffset += behavior.speed * rt.movingDirection * dt;

                        let initDir = behavior.initialDirection ?? 1;
                        if (behavior.pingPong) {
                            if (initDir === 1) {
                                if (rt.movingOffset >= maxOffset) {
                                    rt.movingOffset = maxOffset;
                                    rt.movingDirection = -1;
                                } else if (rt.movingOffset <= 0) {
                                    rt.movingOffset = 0;
                                    rt.movingDirection = 1;
                                }
                            } else {
                                if (rt.movingOffset <= -maxOffset) {
                                    rt.movingOffset = -maxOffset;
                                    rt.movingDirection = 1;
                                } else if (rt.movingOffset >= 0) {
                                    rt.movingOffset = 0;
                                    rt.movingDirection = -1;
                                }
                            }
                        } else {
                            if (initDir === 1) {
                                if (rt.movingOffset >= maxOffset) rt.movingOffset = 0;
                                if (rt.movingOffset < 0) rt.movingOffset = maxOffset;
                            } else {
                                if (rt.movingOffset <= -maxOffset) rt.movingOffset = 0;
                                if (rt.movingOffset > 0) rt.movingOffset = -maxOffset;
                            }
                        }
                        break;
                    }

                    case 'chaos': {
                        rt.chaosTimer -= dt;
                        if (rt.chaosTimer <= 0) {
                            // higher erraticness = lower timer
                            const baseTime = 1.0;
                            const erraticFactor = Math.max(0.1, 1 - (behavior.erraticness / 10)); // 0.1 to 0.9
                            rt.chaosTimer = baseTime * erraticFactor + Math.random() * erraticFactor;
                            rt.chaosAngle = Math.random() * Math.PI * 2;
                        }

                        rt.chaosOffsetX += Math.cos(rt.chaosAngle) * behavior.speed * dt;
                        rt.chaosOffsetY += Math.sin(rt.chaosAngle) * behavior.speed * dt;

                        const maxPixels = behavior.maxDistance * this.gridSize;
                        const len = Math.sqrt(rt.chaosOffsetX * rt.chaosOffsetX + rt.chaosOffsetY * rt.chaosOffsetY);
                        if (len > maxPixels) {
                            // gently steer back to center instead of hard wall
                            rt.chaosAngle = Math.atan2(-rt.chaosOffsetY, -rt.chaosOffsetX);
                            // clamp completely if too far
                            if (len > maxPixels * 1.5) {
                                rt.chaosOffsetX = (rt.chaosOffsetX / len) * maxPixels;
                                rt.chaosOffsetY = (rt.chaosOffsetY / len) * maxPixels;
                            }
                        }
                        break;
                    }

                    case 'floating': {
                        if (rt.playerOnTile) {
                            // Sink
                            rt.sinkOffset = Math.min(rt.sinkOffset + behavior.sinkSpeed * dt, behavior.maxSink);
                            // Tilt based on player relative position (simple oscillation)
                            const targetTilt = behavior.tiltAmount * Math.sin(performance.now() / 400);
                            rt.tiltAngle += (targetTilt - rt.tiltAngle) * 0.1;
                        } else {
                            // Recover
                            rt.sinkOffset = Math.max(rt.sinkOffset - behavior.recoverSpeed * dt, 0);
                            rt.tiltAngle *= 0.92; // Dampen tilt
                        }
                        break;
                    }

                    case 'dead': {
                        if (rt.deadState === 'triggered') {
                            rt.deadTimer -= dt;
                            if (rt.deadTimer <= 0) {
                                rt.deadState = behavior.shake ? 'shaking' : 'falling';
                                rt.deadTimer = behavior.shake ? 0.3 : 0; // Shake duration
                            }
                        } else if (rt.deadState === 'shaking') {
                            rt.deadTimer -= dt;
                            if (rt.deadTimer <= 0) {
                                rt.deadState = 'falling';
                            }
                        } else if (rt.deadState === 'falling') {
                            rt.fallVelocity += behavior.fallSpeed * dt;
                            rt.fallOffset += rt.fallVelocity * dt;
                            // Remove once far offscreen
                            if (rt.fallOffset > 2000) {
                                rt.deadState = 'removed';
                            }
                        }
                        break;
                    }

                    case 'bouncy': {
                        if (rt.bounceCooldownTimer > 0) {
                            rt.bounceCooldownTimer -= dt;
                        }
                        break;
                    }

                    // Slippery: handled in player update, no per-tile update needed
                } // end switch
            }
        }
    }


    private render() {
        // Clear
        this.ctx.fillStyle = '#1e1e2e'; // Darker background
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Screen Shake Apply
        this.ctx.save();
        if (this.screenShakeTimer > 0) {
            const dx = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
            const dy = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
            this.ctx.translate(dx, dy);
        }

        // --- RENDER SKYBOX ---
        this.skyboxLayers.forEach(layer => {
            if (!layer.visible) return;

            this.ctx.save();
            this.ctx.globalAlpha = layer.opacity;

            if (layer.type === 'color') {
                this.ctx.fillStyle = layer.value;
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            } else if (layer.type === 'image' && layer.value) {
                const img = this.getTileImage(layer.value);
                if (img.complete && img.naturalWidth > 0) {
                    const runtimeOffset = this.skyboxOffsets.get(layer.id) || { x: 0, y: 0 };
                    let offsetX = layer.offset.x + runtimeOffset.x;
                    let offsetY = layer.offset.y + runtimeOffset.y;

                    // Apply parallax smoothly using exact camera coordinates, we will floor later to prevent fractional pixel rendering stutter
                    // types.ts defines parallax as: 0 = fixed to screen (UI/distant sky), 1 = fixed to world (normal)
                    offsetX -= this.camera.x * layer.parallax.x;
                    offsetY -= this.camera.y * layer.parallax.y;

                    const scaleX = layer.scale.x;
                    const scaleY = layer.scale.y;

                    let sw = Math.floor(img.naturalWidth * scaleX);
                    let sh = Math.floor(img.naturalHeight * scaleY);

                    let repeatX = layer.repeat === 'repeat' || layer.repeat === 'repeat-x';
                    let repeatY = layer.repeat === 'repeat' || layer.repeat === 'repeat-y';
                    let isClamp = layer.repeat === 'clamp';

                    if (layer.repeat === 'stretch') {
                        sw = this.canvas.width;
                        sh = this.canvas.height;
                        offsetX = 0;
                        offsetY = 0;
                        repeatX = false;
                        repeatY = false;
                        isClamp = true;
                    } else if (layer.repeat === 'stretch-x') {
                        // Stretch Width (Repeat Vertical)
                        const scale = this.canvas.width / img.naturalWidth;
                        sw = this.canvas.width;
                        sh = Math.floor(img.naturalHeight * scale);
                        offsetX = 0;
                        repeatX = false;
                        repeatY = true;
                        isClamp = false;
                    } else if (layer.repeat === 'stretch-y') {
                        // Stretch Height (Repeat Horizontal)
                        const scale = this.canvas.height / img.naturalHeight;
                        sw = Math.floor(img.naturalWidth * scale);
                        sh = this.canvas.height;
                        offsetY = 0;
                        repeatX = true;
                        repeatY = false;
                        isClamp = false;
                    }

                    // Tiling Logic
                    const mod = (n: number, m: number) => ((n % m) + m) % m;

                    if (isClamp) {
                        this.ctx.drawImage(img, Math.floor(offsetX), Math.floor(offsetY), sw, sh);
                    } else {
                        const startX = mod(offsetX, sw);
                        const startY = mod(offsetY, sh);

                        const cols = repeatX ? Math.ceil(this.canvas.width / sw) + 2 : 1;
                        const rows = repeatY ? Math.ceil(this.canvas.height / sh) + 2 : 1;

                        const startCol = repeatX ? -1 : 0;
                        const startRow = repeatY ? -1 : 0;

                        for (let c = startCol; c < cols; c++) {
                            for (let r = startRow; r < rows; r++) {
                                const dx = Math.floor(repeatX ? startX + c * sw : offsetX);
                                const dy = Math.floor(repeatY ? startY + r * sh : offsetY);

                                this.ctx.drawImage(img, dx, dy, sw, sh);
                            }
                        }
                    }
                }
            }
            this.ctx.restore();
        });

        this.ctx.save();
        this.ctx.translate(-Math.floor(this.camera.x), -Math.floor(this.camera.y));

        // ─── Render by Layer ───
        const rectsByLayer = this.cachedRectsByLayer;

        // [OPTIMIZATION] Viewport Culling Bounds
        const camX = this.camera.x;
        const camY = this.camera.y;
        const sw = this.canvas.width;
        const sh = this.canvas.height;
        const pad = this.gridSize * 2;

        const cullMinX = camX - pad;
        const cullMaxX = camX + sw + pad;
        const cullMinY = camY - pad;
        const cullMaxY = camY + sh + pad;

        const imagesByLayer = new Map<string, LevelImage[]>();
        this.levelImages.forEach(img => {
            const layerId = img.layerId || DEFAULT_LAYER_ID;
            if (!imagesByLayer.has(layerId)) imagesByLayer.set(layerId, []);
            imagesByLayer.get(layerId)!.push(img);
        });

        const sortedLayers = [...this.layers].sort((a, b) => a.order - b.order);

        sortedLayers.forEach(layer => {
            if (!layer.visible) return;

            // 1. Draw Tiles for this layer
            const layerRects = rectsByLayer.get(layer.id) || [];
            for (const tr of layerRects) {
                const { tile, x, y } = tr;
                if (['grass', 'water', 'lava', 'crystal'].includes(tile.spriteId)) continue; // Skip rendering SVG tiles via canvas

                // [OPTIMIZATION] Viewport Culling
                if (x + tr.width < cullMinX || x > cullMaxX || y + tr.height < cullMinY || y > cullMaxY) {
                    continue;
                }

                const def = this.tileDefs.get(tile.spriteId);
                const rt = this.tileRuntime.get(tile.id);

                this.ctx.save();

                // ─── Apply tile transform (scale, rotation) ───
                const cx = x + this.gridSize / 2;
                const cy = y + this.gridSize / 2;
                this.ctx.translate(cx, cy);
                if (tile.rotation) {
                    this.ctx.rotate(tile.rotation * Math.PI / 180);
                }
                const sx = tile.scaleX ?? 1;
                const sy = tile.scaleY ?? 1;
                if (sx !== 1 || sy !== 1) {
                    this.ctx.scale(sx, sy);
                }
                this.ctx.translate(-cx, -cy);

                // Apply floating tilt (stacks on top of tile rotation)
                if (tile.behavior?.type === 'floating' && rt && rt.tiltAngle !== 0) {
                    this.ctx.translate(cx, cy);
                    this.ctx.rotate(rt.tiltAngle * Math.PI / 180);
                    this.ctx.translate(-cx, -cy);
                }

                // Apply tile opacity
                this.ctx.globalAlpha = tile.opacity ?? 1;

                // Opacity for dead tiles (fade as they fall)
                if (tile.behavior?.type === 'dead' && rt && rt.deadState === 'falling') {
                    this.ctx.globalAlpha *= Math.max(0, 1 - rt.fallOffset / 500);
                }

                // Glow
                if (tile.glowColor || tile.glow) {
                    let currentGlowColor = tile.glowColor || tile.glow?.color || '#ffffff';
                    let intensity = tile.glow?.intensity ?? 15;

                    if (tile.glow) {
                        const time = performance.now() / 1000;
                        const speed = tile.glow.speed || 1;
                        if (tile.glow.style === 'pulsing') {
                            const pulse = (Math.sin(time * speed * Math.PI) + 1) / 2;
                            intensity = intensity * (0.5 + 0.5 * pulse);
                        } else if (tile.glow.style === 'multi-color' && tile.glow.colors && tile.glow.colors.length > 0) {
                            const lerpHex = (a: string, b: string, t: number) => {
                                if (!a || !b) return a || b || '#ffffff';
                                const ah = parseInt(a.replace('#', ''), 16);
                                const ar = (ah >> 16) & 255; const ag = (ah >> 8) & 255; const ab = ah & 255;
                                const bh = parseInt(b.replace('#', ''), 16);
                                const br = (bh >> 16) & 255; const bg = (bh >> 8) & 255; const bb = bh & 255;
                                const rr = Math.round(ar + (br - ar) * t);
                                const rg = Math.round(ag + (bg - ag) * t);
                                const rb = Math.round(ab + (bb - ab) * t);
                                return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
                            };
                            const t = (time * speed) % tile.glow.colors.length;
                            const idx1 = Math.floor(t);
                            const idx2 = (idx1 + 1) % tile.glow.colors.length;
                            const blend = t - idx1;
                            currentGlowColor = lerpHex(tile.glow.colors[idx1], tile.glow.colors[idx2], blend);
                        } else if (tile.glow.style === 'random') {
                            intensity = intensity * (0.5 + Math.random() * 0.5);
                            if (tile.glow.colors && tile.glow.colors.length > 0) {
                                const tHash = Math.floor(time * speed * 10);
                                const idx = tHash % tile.glow.colors.length;
                                currentGlowColor = tile.glow.colors[idx];
                            } else {
                                const timeHash = Math.floor(time * speed * 10);
                                const r = (timeHash * 13) % 255;
                                const g = (timeHash * 17) % 255;
                                const b = (timeHash * 23) % 255;
                                currentGlowColor = `rgb(${r},${g},${b})`;
                            }
                        }
                    }

                    this.ctx.shadowColor = currentGlowColor;
                    this.ctx.shadowBlur = intensity;
                }

                // Default Color
                this.ctx.fillStyle = tile.hasCollision ? '#4b5563' : '#374151';
                if (def) this.ctx.fillStyle = def.color;

                let drawn = false;

                // Draw Text Object
                if (tile.spriteId === 'text_object' && tile.text) {
                    const textOpts = {
                        text: tile.text,
                        family: tile.fontFamily || 'sans-serif',
                        size: tile.fontSize || 32,
                        color: tile.fontColor || '#ffffff',
                    };

                    this.ctx.fillStyle = textOpts.color;
                    this.ctx.font = `${textOpts.size}px "${textOpts.family}"`;
                    this.ctx.textAlign = 'left';
                    this.ctx.textBaseline = 'top';
                    this.ctx.fillText(textOpts.text, x, y);
                    drawn = true;
                }
                // Draw Texture if available
                else if (def && def.textureSrc) {
                    const img = this.getTileImage(def.textureSrc);
                    if (img.complete && img.naturalWidth > 0) {
                        if (def.srcX !== undefined && def.srcY !== undefined && def.srcWidth && def.srcHeight) {
                            this.ctx.drawImage(img, def.srcX, def.srcY, def.srcWidth, def.srcHeight, x, y, this.gridSize, this.gridSize);
                        } else {
                            this.ctx.drawImage(img, x, y, this.gridSize, this.gridSize);
                        }
                        drawn = true;
                    }
                }

                if (!drawn) {
                    this.ctx.fillRect(x, y, this.gridSize, this.gridSize);
                }

                // ─── Behavior visual cues in play mode ───
                if (tile.behavior || tile.behavior2) {
                    this.renderBehaviorCue(tile, x, y, rt);
                }

                this.ctx.restore();
            }

            // 2. Draw Level Images (Props) for this layer
            const layerImages = imagesByLayer.get(layer.id) || [];
            layerImages.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach(img => {
                if (!img.visible) return;
                const image = this.getTileImage(img.src);
                if (image.complete && image.naturalWidth > 0) {
                    this.ctx.save();

                    const cx = img.x + img.width / 2;
                    const cy = img.y + img.height / 2;

                    this.ctx.translate(cx, cy);
                    this.ctx.rotate((img.rotation || 0) * Math.PI / 180);
                    this.ctx.translate(-cx, -cy);

                    this.ctx.globalAlpha = img.opacity ?? 1;
                    this.ctx.drawImage(image, img.x, img.y, img.width, img.height);

                    this.ctx.restore();
                }
            });
        });

        // Draw Enemies
        this.enemies.forEach(enemy => {
            if (enemy.dead) return;
            EnemyRenderer.render(this.ctx, enemy as any);
        });

        // Draw Projectiles
        this.enemyProjectiles.forEach(proj => {
            this.ctx.fillStyle = proj.color;
            if (proj.shape === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(proj.x, proj.y, proj.width / 2, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.fillRect(proj.x - proj.width / 2, proj.y - proj.height / 2, proj.width, proj.height);
            }
        });

        // Draw Player
        if (this.player) {
            if (this.playerTexture) {
                this.ctx.drawImage(this.playerTexture, this.player.x, this.player.y, this.player.width, this.player.height);
            } else {
                DefaultCharacter.render(this.ctx, this.player);
            }
        }

        // --- Render Particles ---
        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            if (p.rotation !== undefined) {
                this.ctx.rotate(p.rotation * Math.PI / 180);
            }

            this.ctx.globalAlpha = Math.max(0, p.life / p.maxLife);

            const currentSize = p.shrink ? p.size * (p.life / p.maxLife) : p.size;
            this.ctx.fillStyle = p.color;
            this.ctx.strokeStyle = p.color;
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            if (p.shape === 'circle') {
                this.ctx.arc(0, 0, currentSize, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.shape === 'square') {
                this.ctx.fillRect(-currentSize / 2, -currentSize / 2, currentSize, currentSize);
            } else if (p.shape === 'ring') {
                this.ctx.arc(0, 0, currentSize, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (p.shape === 'slash' as any) {
                this.ctx.beginPath();
                this.ctx.moveTo(-currentSize, 0);
                this.ctx.bezierCurveTo(-currentSize / 2, -currentSize / 4, currentSize / 2, -currentSize / 4, currentSize, 0);
                this.ctx.bezierCurveTo(currentSize / 2, currentSize / 4, -currentSize / 2, currentSize / 4, -currentSize, 0);
                this.ctx.fill();
            }

            this.ctx.restore();
        });

        this.ctx.restore(); // Restore camera translation

        this.ctx.restore(); // Restore screen shake

        // HUD
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px monospace';
        this.ctx.fillText("PLAY MODE", 10, 20);
        this.ctx.fillText("WASD / Arrows to Move + Jump", 10, 35);
        this.ctx.fillText("S to Crouch", 10, 50);
    }

    /** Render small visual cues for behavior tiles in play mode */
    private renderBehaviorCue(tile: Tile, x: number, y: number, rt: TileRuntimeState | undefined) {
        const behaviors = this.getTileBehaviors(tile);
        if (behaviors.length === 0) return;

        const gs = this.gridSize;
        this.ctx.save();
        this.ctx.globalAlpha = 0.6;
        this.ctx.font = `${Math.max(10, gs * 0.35)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        for (const behavior of behaviors) {
            switch (behavior.type) {
                case 'bouncy': {
                    // Subtle spring squash animation
                    const squash = rt && rt.bounceCooldownTimer > 0 ? 0.85 : 1;
                    this.ctx.save();
                    this.ctx.translate(x + gs / 2, y + gs);
                    this.ctx.scale(1 / squash, squash);
                    this.ctx.translate(-(x + gs / 2), -(y + gs));
                    this.ctx.restore();
                    break;
                }
            }
        }

        this.ctx.restore();
    }
}
