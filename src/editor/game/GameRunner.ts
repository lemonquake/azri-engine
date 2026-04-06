import { useEditorStore } from '../state/editorStore';
import { PhysicsSystem } from './PhysicsSystem';
import type { CharacterInstance, Tile, TileDefinition, SkyboxLayer, PhysicsSettings, LevelImage, Layer } from '../types';
import { DEFAULT_TILES } from '../types';
import type { CharacterAnimationState } from './DefaultCharacter';
import { NetworkManager } from './NetworkManager';
import type { NetworkMessage } from './NetworkManager';
import { PixiRenderer } from '../../engine/rendering/PixiRenderer';
import { AnimationSystem } from './AnimationSystem';
import Matter from 'matter-js';

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

    // Movement Delta Tracking (for accurate carrying logic)
    lastDelta: number;
}

function createDefaultRuntimeState(tile?: Tile): TileRuntimeState {
    let initialDir: 1 | -1 = 1;
    let initialAxis: 'horizontal' | 'vertical' = 'horizontal';
    if (tile && (tile.behavior || tile.behavior2)) {
        const behaviors = [];
        if (tile.behavior) behaviors.push(tile.behavior);
        if (tile.behavior2) behaviors.push(tile.behavior2);
        const mBehavior = behaviors.find(b => b.type === 'moving' || b.type === 'transitioning') as any;
        if (mBehavior) {
            if (mBehavior.initialDirection !== undefined) {
                initialDir = mBehavior.initialDirection;
            }
            if (mBehavior.axis !== undefined) {
                initialAxis = mBehavior.axis;
            }
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
        currentAxis: initialAxis,
        wasPlayerOnTile: false,
        transitionDelayTimer: 0,
        chaosAngle: 0,
        chaosTimer: 0,
        chaosOffsetX: 0,
        chaosOffsetY: 0,
        lastDelta: 0,
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
    private container: HTMLElement;
    private canvas: HTMLCanvasElement;
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;
    private lastTime: number = 0;

    private physics: PhysicsSystem;
    private player: CharacterAnimationState | null = null;
    private playerBody: Matter.Body | null = null;
    private pixiRenderer: PixiRenderer;

    // Remote Players
    private remotePlayers: Map<string, CharacterAnimationState> = new Map();
    private networkManager: NetworkManager | null = null;
    private syncTimer: number = 0;

    private camera = { x: 0, y: 0 };
    private keys: Set<string> = new Set();
    private previousKeys: Set<string> = new Set();

    // EXPOSED FOR DOM OVERLAY
    public getCamera() { return this.camera; }
    public getGridSize() { return this.gridSize; }
    public getTiles() { return this.tiles; }
    public getLayers() { return this.layers; }
    public getLevelImages() { return this.levelImages; }
    public addLevelImage(image: LevelImage) {
        this.levelImages.push(image);
    }
    public removeLevelImage(id: string) {
        this.levelImages = this.levelImages.filter(img => img.id !== id);
    }
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

    // Pre-computed water surface lookup: "layerId:gridX,gridY" keys for tiles that have water ABOVE them
    private waterOccupied: Set<string> = new Set();

    // Track grass tiles currently rustling: tileId → remaining rustle time (seconds)
    private grassRustling: Map<string, number> = new Map();

    // Visual Effects
    private particles: Particle[] = [];
    private cameraOffset = { x: 0, y: 0 };
    private triggerScreenShake(intensity: number) {
        AnimationSystem.add({
            id: 'screenShake',
            targets: this.cameraOffset,
            x: [
                { value: intensity, duration: 40, easing: 'easeOutQuad' },
                { value: -intensity, duration: 50, easing: 'easeInOutQuad' },
                { value: 0, duration: 40, easing: 'easeOutQuad' }
            ],
            y: [
                { value: -intensity, duration: 40, easing: 'easeOutQuad' },
                { value: intensity, duration: 50, easing: 'easeInOutQuad' },
                { value: 0, duration: 40, easing: 'easeOutQuad' }
            ]
        });
    }
    private playerLastTransitionGroupId: number = -1;

    public onStatsChange?: (stats: { hp: number, maxHp: number, exp: number, maxExp: number, level: number, wallJumps: number, maxWallJumps: number, wallFriction: number }) => void;

    constructor(container: HTMLElement) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.className = "w-full h-full block touch-none focus:outline-none bg-[#1e1e2e]";
        this.canvas.tabIndex = 0;
        this.canvas.oncontextmenu = (e) => e.preventDefault();
        this.container.appendChild(this.canvas);
        
        // Hide native canvas because Pixi will render it via WebGL on the same canvas if initialized,
        // Actually, PixiJS init takes the canvas and takes over its WebGL context.
        this.pixiRenderer = new PixiRenderer();

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

        // Initialize Multiplayer FIRST so role is known before initPlayer
        this.initMultiplayer(state);

        // Initialize Player (role is now known via this.networkManager)
        this.initPlayer(state);
    }

    private initMultiplayer(state: any) {
        // Did the LobbyModal leave us a connected NetworkManager?
        const lobbyNm = (window as any)._lobbyNetworkManager as NetworkManager | undefined;
        
        if (lobbyNm && (state.multiplayerHostId || state.isMultiplayerHost)) {
            console.log("GameRunner: Hooking into existing Lobby NetworkManager!");
            this.networkManager = lobbyNm;
            
            // Override its callbacks so it talks to the GameRunner now
            (this.networkManager as any).onMessageCallback = this.handleNetworkMessage.bind(this);
            (this.networkManager as any).onDisconnectCallback = (connId: string) => {
                this.remotePlayers.delete(connId);
            };
            
            if (this.player) {
                this.player.playerIndex = this.networkManager.myPlayerIndex;
            }
            return;
        }

        // Fallback for direct playmode toggle bypassing lobby (Singleplayer)
        if (!state.multiplayerHostId && !state.isMultiplayerHost) return;

        console.log("GameRunner: Creating fresh NetworkManager (no lobby instance found)");
        this.networkManager = new NetworkManager(
            this.handleNetworkMessage.bind(this),
            () => {},
            (connId) => {
                this.remotePlayers.delete(connId);
            }
        );

        if (state.isMultiplayerHost && state.multiplayerHostId) {
            this.networkManager.hostGame(state.multiplayerHostId).then(() => {
                console.log("GameRunner: Hosting multiplayer game at", state.multiplayerHostId);
            });
            if (this.player) this.player.playerIndex = 1; // Map host to player 1
        } else if (state.multiplayerHostId && !state.isMultiplayerHost) {
            this.networkManager.joinGame(state.multiplayerHostId).then(() => {
                console.log("GameRunner: Joined multiplayer host", state.multiplayerHostId);
            });
            if (this.player) this.player.playerIndex = 2; // Map first joiner to player 2 initially
        }
    }

    private handleNetworkMessage(msg: NetworkMessage) {
        if (msg.type === 'player_state') {
            const remoteState = msg.data;
            if (!this.remotePlayers.has(msg.senderId)) {
                // Initialize new remote player
                this.remotePlayers.set(msg.senderId, {
                    ...remoteState,
                    // Hardcode player index for visuals
                    playerIndex: this.networkManager?.isHost ? 2 : 1
                });
            } else {
                // Update existing remote player
                const player = this.remotePlayers.get(msg.senderId)!;
                player.x = remoteState.x;
                player.y = remoteState.y;
                player.velocityX = remoteState.velocityX;
                player.velocityY = remoteState.velocityY;
                player.facingRight = remoteState.facingRight;
                player.state = remoteState.state;
                player.isGrounded = remoteState.isGrounded;
                player.playerIndex = remoteState.playerIndex;
            }
        }
    }

    private resize() {
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.width = this.canvas.parentElement.clientWidth;
            this.canvas.height = this.canvas.parentElement.clientHeight;
        }
    }

    private initPlayer(state: any) {
        // Find player start
        let player1Start: CharacterInstance | undefined;
        let player2Start: CharacterInstance | undefined;
        let player3Start: CharacterInstance | undefined;

        this.enemies = [];
        this.enemyProjectiles = [];

        // Check characters for isPlayer flag
        if (state.characters && typeof state.characters.forEach === 'function') {
            state.characters.forEach((char: CharacterInstance) => {
                if (char.overrideProperties?.isPlayer === true || char.overrideProperties?.isPlayer === 1) {
                    player1Start = char;
                } else if (char.overrideProperties?.isPlayer === 2) {
                    player2Start = char;
                } else if (char.overrideProperties?.isPlayer === 3) {
                    player3Start = char;
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

        // Apply fallbacks for spawn points
        if (!player2Start) player2Start = player1Start;
        if (!player3Start) player3Start = player1Start;

        // Determine OUR spawn based on role
        let mySpawn: CharacterInstance | undefined;
        let myPlayerIndex = 1;
        if (this.networkManager && !this.networkManager.isHost) {
            // Joiner: default to P2 spawn
            mySpawn = player2Start;
            myPlayerIndex = 2;
        } else {
            // Host or singleplayer: P1 spawn
            mySpawn = player1Start;
            myPlayerIndex = 1;
        }

        const startX = mySpawn ? mySpawn.gridX * this.gridSize : 100;
        const startY = mySpawn ? mySpawn.gridY * this.gridSize : 100;

        if (!player1Start) {
            console.warn("No player 1 start found, spawning at default.");
        }

        this.player = {
            x: startX,
            y: startY,
            width: 20,
            height: 28,
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
            playerIndex: myPlayerIndex,
            username: localStorage.getItem('azri_mp_username') || undefined,
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

        this.playerBody = this.physics.createPlayerBody(startX, startY, 20, 28);
        // Notify initial stats
        this.emitStats();
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.initTileCaches(); // Cache all tiles for performance!
        if (this.playerBody) Matter.World.add(this.physics.world, this.playerBody);
        this.lastTime = performance.now();
        
        // Init PixiJS Asynchronously
        this.pixiRenderer.init(this.canvas).then(() => {
            this.loop();
        });
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        window.removeEventListener('keydown', this.boundHandleKeyDown);
        window.removeEventListener('keyup', this.boundHandleKeyUp);
        window.removeEventListener('resize', this.boundResize);

        if (this.networkManager) {
            this.networkManager.disconnect();
            this.networkManager = null;
        }
        
        if (this.pixiRenderer) {
            this.pixiRenderer.destroy();
        }
        
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
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

    private spawnDamageText(cx: number, cy: number, damage: number, color: string = '#ef4444') {
        const p = {
            x: cx, y: cy, vx: 0, vy: 0, life: 1, maxLife: 1, color: color,
            size: 16, shape: 'text' as any, text: damage.toString(), shrink: false, id: Math.random().toString()
        };
        this.particles.push(p as any);
        AnimationSystem.add({
            id: 'dmg_' + p.id, targets: p, y: cy - 40, duration: 800, easing: 'easeOutQuint'
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

    private render() {
        const shakenCamera = { x: this.camera.x + this.cameraOffset.x, y: this.camera.y + this.cameraOffset.y };
        this.pixiRenderer.renderState(
            shakenCamera,
            0,
            0,
            this.tiles,
            this.tileRuntime,
            this.enemies,
            this.player,
            Array.from(this.remotePlayers.values()),
            this.enemyProjectiles,
            this.particles,
            this.skyboxLayers,
            this.levelImages,
            this.collisionShapes,
            performance.now() / 1000,
            this.tileDefs
        );
    }

    private loop() {
        if (!this.isRunning) return;

        const now = performance.now();
        const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1); // Cap dt
        this.lastTime = now;

        this.update(deltaTime);
        AnimationSystem.update(deltaTime);
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
            let wWidth = this.gridSize * Math.abs(tile.scaleX || 1);
            let wHeight = this.gridSize * Math.abs(tile.scaleY || 1);

            // If it's flipped negatively, the bounding box top-left shifts
            if ((tile.scaleX || 1) < 0) wx -= wWidth;
            if ((tile.scaleY || 1) < 0) wy -= wHeight;

            if (tile.spriteId === 'text_object' && tile.text) {
                // Approximate Text Width without initializing a canvas context
                const fontSize = tile.fontSize || 32;
                wWidth = Math.max(32, tile.text.length * (fontSize * 0.6));
                wHeight = fontSize;
            }

            const tr = { tile, x: wx, y: wy, width: wWidth, height: wHeight };
            this.cachedTileRects.push(tr);

            if (!this.cachedRectsByLayer.has(tile.layerId)) {
                this.cachedRectsByLayer.set(tile.layerId, []);
            }
            this.cachedRectsByLayer.get(tile.layerId)!.push(tr);

        }

        // Build water surface lookup: record which cells have water
        this.waterOccupied.clear();
        for (const tile of this.tiles) {
            if (tile.spriteId === 'water') {
                this.waterOccupied.add(`${tile.layerId}:${tile.gridX},${tile.gridY}`);
            }
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

        // ─── Decay grass rustle timers ───
        for (const [tileId, remaining] of this.grassRustling) {
            const next = remaining - dt;
            if (next <= 0) {
                this.grassRustling.delete(tileId);
            } else {
                this.grassRustling.set(tileId, next);
            }
        }

        // --- Network Sync ---
        if (this.networkManager) {
            this.syncTimer -= dt;
            if (this.syncTimer <= 0) {
                this.networkManager.broadcast('player_state', {
                    x: this.player.x,
                    y: this.player.y,
                    velocityX: this.player.velocityX,
                    velocityY: this.player.velocityY,
                    facingRight: this.player.facingRight,
                    state: this.player.state,
                    isGrounded: this.player.isGrounded,
                    playerIndex: this.player.playerIndex,
                    username: this.player.username
                });
                this.syncTimer = 1 / 20; // 20 tick rate
            }
        }

        if (this.player.exhaustedWallJumpTimer && this.player.exhaustedWallJumpTimer > 0) {
            this.player.exhaustedWallJumpTimer -= dt;
        }

        if (this.player.bounceCancelWindowTimer && this.player.bounceCancelWindowTimer > 0) {
            this.player.bounceCancelWindowTimer -= dt;
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
                    this.tiles.forEach((t: import('../types').Tile) => {
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

        // ---- NEW COMBO SYSTEM ----
        const isAttacking = this.player.state.startsWith('attack');

        // Evaluate attack recovery
        if (this.player.attackCooldown && this.player.attackCooldown > 0) {
            this.player.attackCooldown -= dt;
        }
        if (this.player.attackCooldown && this.player.attackCooldown > 0) {
            this.player.attackCooldown -= dt;
        }

        // Can we attack?
        // Must not be hit-stunned. If attacking, must be past a certain animation frame (allow combo buffer)
        const canAttack = this.player.state !== 'hit' && (this.player.hitStunTimer || 0) <= 0 &&
            (!isAttacking || (isAttacking && this.player.animationTimer > 0.25 && (this.player.attackCooldown || 0) <= 0)) &&
            (this.player.isGrounded || (this.player.airAttackCount || 0) < 3);

        if (canAttack && isJustPressed('q')) {
            let variant = 1;      // 1: Swift, 2: Chain, 3: Heavy
            let step = 1;
            let isAir = !this.player.isGrounded;

            if (isAir) {
                this.player.airAttackCount = (this.player.airAttackCount || 0) + 1;
                // Air variants
                if (this.keys.has('w') || this.keys.has('arrowup')) variant = 2; // Air Up
                else if (this.keys.has('s') || this.keys.has('arrowdown')) variant = 3; // Air Down
                else variant = 1; // Air Neutral
            } else {
                // Ground variants
                if (this.keys.has('w') || this.keys.has('arrowup')) variant = 2; // Ground Chain
                else if (this.keys.has('s') || this.keys.has('arrowdown')) variant = 3; // Ground Heavy
                else variant = 1; // Ground Swift
            }

            // Combo chaining logic
            if (isAttacking) {
                // If we are already in a combo, prioritize continuing that exact variant, UNLESS it's an air combo transition
                if (this.player.comboVariant && this.player.comboStep) {
                    variant = this.player.comboVariant;
                    const maxSteps = (variant === 1 && !isAir) ? 3 : (isAir && variant === 3 ? 2 : (isAir ? 3 : 4));
                    if (this.player.comboStep < maxSteps) {
                        step = this.player.comboStep + 1;
                    } else {
                        step = 1; // Reset loop (or could force end combo)
                    }
                }
            } else {
                step = 1;
            }

            // Save combo state
            this.player.comboVariant = variant;
            this.player.comboStep = step;
            this.player.isAirCombo = isAir;

            // Generate state string
            const prefix = isAir ? 'attack_air_' : 'attack_';
            let vStr = 'base_';
            if (variant === 2) vStr = 'up_';
            else if (variant === 3) vStr = 'down_';

            this.player.state = `${prefix}${vStr}${step}`;
            this.player.animationTimer = 0;
            this.player.attackCooldown = 0.2; // Buffer window

            // --- Movement & Hitbox Tuning per Step ---
            let range = 60 + step * 20;
            let height = this.player.height;
            let dmg = 10 + step * 8;
            let stunIntensity: 'light' | 'medium' | 'heavy' = 'light';
            let isFinalHit = false;

            // Step specific overrides
            if (variant === 1 && step === 3) {
                isFinalHit = true;
                stunIntensity = 'medium';
                this.player.velocityX = this.player.facingRight ? 350 : -350;
            } else if (variant === 2 && step === 4 && !isAir) {
                isFinalHit = true;
                stunIntensity = 'heavy';
                dmg += 15;
                this.player.velocityY = -200; // Rising finish
            } else if (variant === 2 && step === 3 && isAir) {
                isFinalHit = true;
                stunIntensity = 'heavy';
            } else if (variant === 3 && step === 4 && !isAir) {
                isFinalHit = true;
                stunIntensity = 'heavy';
                dmg += 25; // Massive ground slam
                this.player.velocityX = this.player.facingRight ? 100 : -100;
            } else if (variant === 3 && step === 2 && isAir) {
                isFinalHit = true;
                stunIntensity = 'heavy';
                this.player.velocityY = 600; // Dive!
            } else if (step > 1) {
                stunIntensity = 'medium';
                if (!isAir && variant === 1) this.player.velocityX = this.player.facingRight ? 150 : -150;
            }

            // --- Apply Hitbox & VFX ---
            if (isFinalHit) {
                AnimationSystem.add({ id: 'squash', targets: this.player, scaleX: [0.5, 1], scaleY: [1.6, 1], duration: 400, easing: 'easeOutElastic(1, .5)' });
                this.spawnParticle({
                    x: this.player.facingRight ? this.player.x + this.player.width + 20 : this.player.x - 20,
                    y: this.player.y + this.player.height / 2,
                    vx: 0, vy: 0, life: 0.15, color: '#f87171', size: 90, shape: 'slash' as any,
                    rotation: this.player.facingRight ? 45 : -45, shrink: true
                });
            } else {
                AnimationSystem.add({ id: 'squash', targets: this.player, scaleX: [1.2, 1], scaleY: [0.9, 1], duration: 400, easing: 'easeOutElastic(1, .5)' });
                this.spawnParticle({
                    x: this.player.facingRight ? this.player.x + this.player.width + 10 : this.player.x - 10,
                    y: this.player.y + this.player.height / 2,
                    vx: 0, vy: 0, life: 0.1, color: '#fca5a5', size: 50, shape: 'slash' as any,
                    rotation: this.player.facingRight ? 20 + step * 10 : -20 - step * 10, shrink: true
                });
            }

            // Exert hitboxes based on variant
            if (variant === 1) {
                this.checkMeleeHitbox(range, height, dmg, 0, 0, isFinalHit, stunIntensity);
            } else if (variant === 2) {
                if (!isAir) this.player.velocityY = -100 - step * 30;
                this.checkMeleeHitbox(range + 10, height * 2.5, dmg, 0, -height * 1.5, isFinalHit, stunIntensity);
            } else if (variant === 3) {
                if (!isAir && step < 4) this.player.velocityY = 150; // Ground heavy pins down
                this.checkMeleeHitbox(range, height * 2, dmg + 5, 0, height * 0.5, isFinalHit, stunIntensity);
            }
        }

        // Combo state ending
        if (this.player.state.startsWith('attack')) {
            const maxDuration = (this.player.comboVariant === 3 && this.player.comboStep === 4) ? 0.6 : 0.45;
            if (this.player.animationTimer > maxDuration) {
                this.player.state = 'idle';
                this.player.comboVariant = undefined;
                this.player.comboStep = undefined;
            } else {
                if (this.player.isGrounded) dx = 0; // Lock horizontal move during attack
            }
        } else if (this.player.state === 'hit' || (this.player.hitStunTimer && this.player.hitStunTimer > 0)) {
            // Updated Player Hit Stun Logic - Quick Recovery
            if (this.player.hitStunTimer && this.player.hitStunTimer > 0) {
                this.player.hitStunTimer -= dt;

                // Quick Recovery Window: After first 0.2s of stun, player can break out by moving/jumping
                if (this.player.hitStunTimer < (this.player.hitStunDuration! - 0.2)) {
                    if (dx !== 0 || isJustPressed(' ') || isJustPressed('w') || isJustPressed('arrowup')) {
                        this.player.hitStunTimer = 0;
                        this.player.state = 'idle';
                        // Recovery burst
                        this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 5, '#bae6fd');
                    } else {
                        dx = 0; // Still stunned if no input
                    }
                } else {
                    dx = 0; // Hard stun phase
                }
            }
            if ((!this.player.hitStunTimer || this.player.hitStunTimer <= 0) && this.player.state === 'hit') {
                this.player.state = 'idle';
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
                this.triggerScreenShake(5);

                // Stretch dramatically
                AnimationSystem.add({ id: 'squash', targets: this.player, scaleX: [0.5, 1], scaleY: [2.0, 1], duration: 500, easing: 'easeOutElastic(1, .4)' });

            } else if (this.player.isGrounded && !this.player.isSlamming) {
                // First Jump (Standard)
                this.player.velocityY = jumpVelocity;
                this.player.isGrounded = false;
                this.player.state = 'jump';
                this.player.jumpCount = 1;

                // Visuals: Squash + Dust
                AnimationSystem.add({ id: 'squash', targets: this.player, scaleX: [0.8, 1], scaleY: [1.3, 1], duration: 400, easing: 'easeOutElastic(1, .5)' });
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

        // ─── Grass Rustle Detection (player + enemies) ───
        // Only trigger rustle when the unit is actually moving, not standing still
        {
            const px = this.player.x;
            const py = this.player.y;
            const pw = this.player.width;
            const ph = this.player.height;
            const playerMoving = Math.abs(this.player.velocityX) > 10;
            // [OPTIMIZATION] Use already culled physics tile list
            for (let i = 0; i < tileRects.length; i++) {
                const tr = tileRects[i];
                if (tr.tile.spriteId === 'grass') {
                    // Player overlap — only if actually walking/running
                    if (playerMoving && px < tr.x + tr.width && px + pw > tr.x && py < tr.y + tr.height && py + ph > tr.y) {
                        this.grassRustling.set(tr.tile.id, 0.5);
                        if (this.onGrassRustle) this.onGrassRustle(tr.tile.id);
                    }
                    // Enemy overlap — only if actually moving horizontally
                    for (const enemy of this.enemies) {
                        if (enemy.dead) continue;
                        if (Math.abs(enemy.velocityX) > 10 && enemy.x < tr.x + tr.width && enemy.x + enemy.width > tr.x &&
                            enemy.y < tr.y + tr.height && enemy.y + enemy.height > tr.y) {
                            this.grassRustling.set(tr.tile.id, 0.5);
                        }
                    }
                }
            }
        }

        // ─── Moving tile carry & push ───
        // First, handle being carried by the ground tile
        const groundBehaviorsForCarry = groundTile ? this.getTileBehaviors(groundTile) : [];
        const carryBehavior = groundBehaviorsForCarry.find(b => b.type === 'moving' || b.type === 'transitioning') as any;

        if (carryBehavior && groundRt && groundRt.lastDelta !== undefined) {
            const axis = carryBehavior.type === 'transitioning' ? groundRt.currentAxis : carryBehavior.axis;

            // Only carry if NOT delayed
            let isDelayed = false;
            if (carryBehavior.type === 'transitioning' && groundRt.transitionDelayTimer > 0) {
                isDelayed = true;
            }

            if (!isDelayed) {
                if (axis === 'horizontal') {
                    this.player.x += groundRt.lastDelta;
                } else {
                    this.player.y += groundRt.lastDelta;
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


        // ─── Physics Resolution with Matter.js ───
        this.player.isOnWall = false;

        if (this.playerBody) {
            Matter.Body.setVelocity(this.playerBody, { x: this.player.velocityX / 60, y: this.player.velocityY / 60 });

            Matter.Engine.update(this.physics.engine, dt * 1000);

            // Fetch resulting velocities and positions
            const vel = this.playerBody.velocity;
            
            // Re-apply position back to GameRunner
            this.player.x = this.playerBody.position.x - this.player.width / 2;
            this.player.y = this.playerBody.position.y - this.player.height / 2;

            // Check Grounded
            const { isGrounded, groundTileRect } = this.physics.getGroundedState(this.playerBody, this.player.width, this.player.height);
            const wasGroundedBeforePhysics = this.player.isGrounded;
            this.player.isGrounded = isGrounded;

            // Handle Landing
            if (isGrounded) {
                if (!wasGroundedBeforePhysics && this.player.velocityY >= 0) {
                    if (this.player.isSlamming) {
                        this.player.isSlamming = false;
                        this.player.bounceCancelWindowTimer = 0.15;
                        this.triggerScreenShake(15);
                        this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height, 20, '#cbd5e1');
                        this.spawnParticle({
                            x: this.player.x + this.player.width / 2,
                            y: this.player.y + this.player.height,
                            vx: 0, vy: 0, life: 0.15, color: '#ffffff', size: 40, shape: 'circle'
                        });
                        AnimationSystem.add({ id: 'squash', targets: this.player, scaleX: [1.8, 1], scaleY: [0.4, 1], duration: 600, easing: 'easeOutElastic(1, .3)' });
                    } else {
                        this.spawnDust(this.player.x + this.player.width / 2, this.player.y + this.player.height, 6, '#cbd5e1');
                        AnimationSystem.add({ id: 'squash', targets: this.player, scaleX: [1.3, 1], scaleY: [0.8, 1], duration: 400, easing: 'easeOutElastic(1, .5)' });
                    }
                }
                
                // Bonk ceiling
                if (this.player.velocityY < 0 && vel.y > -1) {
                    this.player.velocityY = 0; // Bonk!
                }
                
                // Zero out vertical velocity on ground
                this.player.velocityY = 0;

                // Ground Tile Interactions
                if (groundTileRect) {
                    const hitTile = groundTileRect.tile;
                    const hitRt = this.tileRuntime.get(hitTile.id);
                    const hitBehaviors = this.getTileBehaviors(hitTile);
                    const bouncyBehavior = hitBehaviors.find(b => b.type === 'bouncy');
                    if (bouncyBehavior && hitRt && hitRt.bounceCooldownTimer <= 0) {
                        this.player.velocityY = -bouncyBehavior.force;
                        this.player.isGrounded = false;
                        this.player.state = 'jump';
                        hitRt.bounceCooldownTimer = bouncyBehavior.cooldown;
                    } else if (canUpdateMoveState) {
                        if (dx === 0 && !onSlippery) this.player.state = 'idle';
                        else if (Math.abs(this.player.velocityX) > 5 || dx !== 0) this.player.state = 'walk';
                        else this.player.state = 'idle';
                    }
                } else {
                    if (canUpdateMoveState) {
                        if (dx === 0 && !onSlippery) this.player.state = 'idle';
                        else if (Math.abs(this.player.velocityX) > 5 || dx !== 0) this.player.state = 'walk';
                        else this.player.state = 'idle';
                    }
                }
            } else {
                 if (this.player.velocityY < 0 && vel.y > -1) {
                     this.player.velocityY = 0; // bonk ceiling
                 }
            }

            // Wall Collision detection for Wall Slide
            // If requested velocityX is high but actual is near 0, we hit a wall
            const blockedHorizontal = (Math.abs(this.player.velocityX) > 10 && Math.abs(vel.x * 60) < 5);
            let hitWall = blockedHorizontal;

            if (hitWall) {
                this.player.velocityX = 0;
                
                if (!this.player.isGrounded && !shouldCrouch && !this.player.isOverheated) {
                    this.player.isOnWall = true;
                    this.player.wallDirection = dx !== 0 ? Math.sign(dx) : (this.player.facingRight ? 1 : -1);
                    
                    if ((dx > 0 && this.player.wallDirection === 1) || (dx < 0 && this.player.wallDirection === -1)) {
                        if ((this.player.wallSlideTimer || 0) <= 0) {
                            this.player.wallSlideTimer = 1.5;
                        }
                    } else {
                        this.player.wallFriction = Math.max(0, (this.player.wallFriction || 0) - 20 * dt);
                    }
                }
            } else {
                 this.player.wallSlideTimer = 0;
                 this.player.wallFriction = Math.max(0, (this.player.wallFriction || 0) - 50 * dt);
            }

            if (this.player.isOnWall && !this.player.isOverheated) {
                 if ((this.player.wallSlideTimer || 0) > 0) {
                     this.player.wallSlideTimer = (this.player.wallSlideTimer || 0) - dt;
                     this.player.wallFriction = Math.min(100, (this.player.wallFriction || 0) + 60 * dt);
                     if (this.player.velocityY > 0) {
                         this.player.velocityY = Math.min(this.player.velocityY, moveSpeed * 0.2); // Slower fall = slide
                     }
                     if (this.player.wallFriction >= 100) {
                         this.player.isOverheated = true;
                         this.player.isOnWall = false;
                         this.spawnDust(
                            this.player.wallDirection === 1 ? this.player.x + this.player.width : this.player.x,
                            this.player.y + this.player.height / 2, 10, '#ef4444'
                         );
                     }
                 } else {
                     this.player.wallFriction = Math.max(0, (this.player.wallFriction || 0) - 10 * dt);
                 }
                 if (this.player.velocityY > 0 && Math.random() < ((this.player.wallFriction || 0) / 100)) {
                    this.spawnParticle({
                        x: this.player.wallDirection === 1 ? this.player.x + this.player.width : this.player.x,
                        y: this.player.y + this.player.height,
                        vx: -(this.player.wallDirection || 1) * (5 + Math.random() * 10),
                        vy: -(10 + Math.random() * 20),
                        life: 0.2 + Math.random() * 0.2, color: (this.player.wallFriction || 0) > 80 ? '#ef4444' : '#fbbf24', size: 2 + Math.random() * 2
                    });
                }
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

        // Animation Timer
        this.player.animationTimer += dt;

        // Visual FX Recovery: Squash & Stretch — now handled by AnimationSystem

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

        // ─── Multiplayer Sync ───
        if (this.networkManager) {
            this.syncTimer += dt;
            if (this.syncTimer > 0.05) { // Sync ~20 times per second
                this.syncTimer = 0;
                this.networkManager.broadcast('player_state', {
                    x: this.player.x,
                    y: this.player.y,
                    velocityX: this.player.velocityX,
                    velocityY: this.player.velocityY,
                    facingRight: this.player.facingRight,
                    state: this.player.state,
                    isGrounded: this.player.isGrounded,
                    playerIndex: this.player.playerIndex
                });
            }

            // Extrapolate remote players
            this.remotePlayers.forEach(rp => {
                rp.x += rp.velocityX * dt;
                rp.y += rp.velocityY * dt;

                // Advance their animations
                if (rp.state !== 'idle') {
                    rp.animationTimer = (rp.animationTimer || 0) + dt;
                }
            });
        }

        // Update previous keys
        this.previousKeys = new Set(this.keys);
    }

    private checkMeleeHitbox(width: number, height: number, damage: number, offsetX: number = 0, offsetY: number = 0, isFinalHit: boolean = false, stunIntensity: 'light' | 'medium' | 'heavy' = 'light') {
        if (!this.player) return;

        const dirMulti = this.player.facingRight ? 1 : -1;
        const startX = this.player.facingRight ? this.player.x + this.player.width : this.player.x - width;

        const hitbox = {
            x: startX + (offsetX * dirMulti),
            y: this.player.y + offsetY,
            width: width,
            height: height
        };

        let hitAny = false;

        // Check enemies
        this.enemies.forEach(enemy => {
            if (enemy.dead) return;
            if (hitbox.x < enemy.x + enemy.width && hitbox.x + hitbox.width > enemy.x &&
                hitbox.y < enemy.y + enemy.height && hitbox.y + hitbox.height > enemy.y) {
                // Hit!
                hitAny = true;
                enemy.hp -= damage; this.spawnDamageText(enemy.x + enemy.width / 2, enemy.y, damage, '#ffffff');
                enemy.state = 'hit';
                enemy.animationTimer = 0;

                // Advanced Hit Stun System
                let stunTime = 0.3;
                if (stunIntensity === 'medium') stunTime = 0.5;
                if (stunIntensity === 'heavy') stunTime = 0.8;

                enemy.hitStunTimer = stunTime;
                enemy.hitStunDuration = stunTime;
                enemy.hitIntensity = stunIntensity;

                // VFX
                const sparks = stunIntensity === 'heavy' ? 12 : (stunIntensity === 'medium' ? 8 : 4);
                const color = stunIntensity === 'heavy' ? '#b91c1c' : '#ef4444';
                this.spawnDust(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, sparks, color);

                if (isFinalHit || stunIntensity === 'heavy') {
                    this.triggerScreenShake(15);
                    // Heavy hit pushes enemy right away
                    enemy.velocityX = this.player!.facingRight ? 250 : -250;
                    enemy.velocityY = -150;
                } else {
                    this.triggerScreenShake(4);
                    // Light hits will push slightly, but mainly they freeze
                    enemy.velocityX = this.player!.facingRight ? 50 : -50;
                    enemy.velocityY = 0;
                }

                if (enemy.hp <= 0) {
                    enemy.dead = true;
                    this.player!.exp += enemy.exp;
                    this.emitStats();
                    for (let i = 0; i < 20; i++) {
                        this.spawnParticle({
                            x: enemy.x + enemy.width / 2,
                            y: enemy.y + enemy.height / 2,
                            vx: (Math.random() - 0.5) * 400,
                            vy: (Math.random() - 0.5) * 400,
                            life: 0.5 + Math.random() * 0.5,
                            color: '#b91c1c',
                            size: 4 + Math.random() * 6
                        });
                    }
                    this.triggerScreenShake(10);
                }
            }
        });

        // Hit stop on heavy hits (freeze game slightly)
        if (hitAny && (stunIntensity === 'heavy' || isFinalHit)) {
            // A simple implementation of hit-stop without massive engine rewrite:
            // Just delay the next animation frame slightly, or we can use a sleep if we had one.
            // Since we can't block the JS thread safely, we'll trigger a massive screen shake instead.
            this.triggerScreenShake(15);
        }
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

            if (enemy.state === 'hit' || (enemy.hitStunTimer && enemy.hitStunTimer > 0)) {
                // Enemy is frozen in hit stun
                if (enemy.hitStunTimer && enemy.hitStunTimer > 0) {
                    enemy.hitStunTimer -= dt;
                    // Freeze velocity completely while in stun except for heavy knockbacks which overrides
                    if (enemy.hitIntensity !== 'heavy') {
                        enemy.velocityX = 0;
                        enemy.velocityY = 0;
                    }
                } else {
                    // Stun is over
                    enemy.state = 'idle';
                    enemy.animationTimer = 0;
                    enemy.hitStunTimer = 0;
                    enemy.hitStunDuration = 0;
                }

                // Keep resolving physics so they don't fall through floor if knocked back heavily
                enemy.x += enemy.velocityX * dt;
                const colliderX = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
                if (this.physics.checkCollision(colliderX, this.cachedTileRects) || this.physics.checkCollisionShapes(colliderX, this.collisionShapes)) {
                    enemy.x -= enemy.velocityX * dt;
                }
                enemy.y += enemy.velocityY * dt;
                const colliderY = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
                if (this.physics.checkCollision(colliderY, this.cachedTileRects) || this.physics.checkCollisionShapes(colliderY, this.collisionShapes)) {
                    enemy.y -= enemy.velocityY * dt;
                    if (enemy.velocityY > 0) enemy.isGrounded = true;
                    enemy.velocityY = 0;
                } else {
                    enemy.isGrounded = false;
                }
                return; // Skip AI completely
            }

            const distToPlayer = Math.hypot(this.player!.x - enemy.x, this.player!.y - enemy.y);
            // ... AI Logic Continues ...
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
                        if (enemy.dead || enemy.state === 'hit') return;
                        // Huge shockwave hit
                        const hitX = enemy.facingRight ? enemy.x + enemy.width : enemy.x - 40;
                        if (hitX < this.player!.x + this.player!.width && hitX + 40 > this.player!.x &&
                            enemy.y - 20 < this.player!.y + this.player!.height && enemy.y + enemy.height + 20 > this.player!.y) {
                            this.hitPlayer(25);
                        }
                        this.triggerScreenShake(8);
                    }, 600);
                } else if (isFlyer) {
                    // Swoop
                    enemy.velocityX = enemy.facingRight ? 150 : -150;
                    enemy.velocityY = 100;
                    setTimeout(() => {
                        if (enemy.dead || enemy.state === 'hit') return;
                        if (Math.hypot(this.player!.x - enemy.x, this.player!.y - enemy.y) < 40) {
                            this.hitPlayer(10);
                        }
                    }, 200);
                } else {
                    // Melee & Assassin
                    setTimeout(() => {
                        if (enemy.dead || enemy.state === 'hit') return;
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
            } else {
                if (enemy.animationTimer > (isTank ? 0.8 : 0.3)) { // Longer attack anim for tank
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
        if (!this.player || this.player.state === 'hit' || (this.player.hitStunTimer && this.player.hitStunTimer > 0)) return;
        this.player.hp -= damage; this.spawnDamageText(this.player.x + this.player.width / 2, this.player.y, damage, '#ef4444');
        this.player.state = 'hit';
        this.player.animationTimer = 0;

        // Player Hit Stun 
        this.player.hitStunTimer = 0.6; // Base 0.6s stun
        this.player.hitStunDuration = 0.6;
        this.player.comboVariant = undefined;
        this.player.comboStep = undefined;

        this.triggerScreenShake(8);
        this.emitStats();

        // Knockback
        this.player.velocityX = this.player.facingRight ? -100 : 100;
        this.player.velocityY = -100;

        // Big blood splash
        for (let i = 0; i < 8; i++) {
            this.spawnParticle({
                x: this.player.x + this.player.width / 2,
                y: this.player.y + this.player.height / 2,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * -200,
                life: 0.3 + Math.random() * 0.3,
                color: '#ef4444',
                size: 3 + Math.random() * 5
            });
        }

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
                const prevOffset = rt.movingOffset;

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

                if (behavior.type === 'moving' || behavior.type === 'transitioning') {
                    rt.lastDelta = rt.movingOffset - prevOffset;
                }
            }
        }
    }
}
