/**
 * Tile Editor Type Definitions
 */

// Unique identifier for tiles
export type TileId = string;
export type LevelImageId = string;

// Grid position
export interface GridPos {
    x: number;
    y: number;
}

// Available tool types
export type ToolType = 'brush' | 'bucket' | 'eraser' | 'select' | 'multiSelect' | 'line' | 'rectangle' | 'circle' | 'character' | 'spawn' | 'paste' | 'collision' | 'selectCollision' | 'text' | 'enemy';

// Layer definition
export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    opacity: number; // 0-1
    order: number; // 0 = back, higher = front
}

export const DEFAULT_LAYER_ID = 'layer_default';

// Skybox Layer definition
export interface SkyboxLayer {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    type: 'color' | 'image';
    value: string; // Hex color or Image URL

    // Transform
    offset: { x: number; y: number };
    scale: { x: number; y: number };

    // Animation & Parallax
    parallax: { x: number; y: number }; // 0 = fixed to screen (UI/distant sky), 1 = fixed to world (normal)
    velocity: { x: number; y: number }; // Auto-scroll speed (pixels per second)

    repeat: 'clamp' | 'repeat' | 'repeat-x' | 'repeat-y' | 'stretch' | 'stretch-x' | 'stretch-y';

    // Z-Index / Order (implicitly handle by array order, 0 = back)
}

// ─── Tile Behavior Types ─────────────────────────────────────────────
export type TileBehaviorType = 'moving' | 'floating' | 'dead' | 'bouncy' | 'slippery' | 'transitioning' | 'chaos';

export interface MovingBehavior {
    type: 'moving';
    axis: 'horizontal' | 'vertical';
    distance: number;        // In grid cells
    speed: number;           // Pixels per second
    pingPong: boolean;       // Reverse at ends
    initialDirection?: 1 | -1; // 1 (East/South) or -1 (West/North)
    speedUpOnPlayer: boolean;
    slowDownOnPlayer: boolean;
    speedMultiplier: number; // Factor applied when player stands on it
}

export interface FloatingBehavior {
    type: 'floating';
    tiltAmount: number;    // Max tilt in degrees
    sinkSpeed: number;     // How fast it sinks under player (px/s)
    recoverSpeed: number;  // How fast it recovers (px/s)
    maxSink: number;       // Max sink distance in pixels
}

export interface DeadBehavior {
    type: 'dead';
    delay: number;         // Seconds before falling
    fallSpeed: number;     // Fall acceleration (px/s²)
    shake: boolean;        // Shake before falling
}

export interface BouncyBehavior {
    type: 'bouncy';
    force: number;         // Bounce velocity (px/s upward)
    cooldown: number;      // Min seconds between bounces
}

export interface SlipperyBehavior {
    type: 'slippery';
    friction: number;      // 0 = pure ice, 1 = normal
    acceleration: number;  // Ramp rate to max speed (lower = more slippery)
}

export interface TransitioningBehavior {
    type: 'transitioning';
    axis: 'horizontal' | 'vertical'; // initial axis
    distance: number;        // In grid cells
    speed: number;           // Pixels per second
    pingPong: boolean;       // Reverse at ends
    initialDirection?: 1 | -1; // 1 (East/South) or -1 (West/North)
    delay: number;           // Initial transition delay in seconds
}

export interface ChaosBehavior {
    type: 'chaos';
    speed: number;           // Pixels per second
    maxDistance: number;     // Max distance from origin in grid cells
    erraticness: number;     // How often it changes directions (1-10)
}

export type TileBehavior = MovingBehavior | FloatingBehavior | DeadBehavior | BouncyBehavior | SlipperyBehavior | TransitioningBehavior | ChaosBehavior;

export const DEFAULT_BEHAVIORS: Record<TileBehaviorType, TileBehavior> = {
    moving: { type: 'moving', axis: 'horizontal', distance: 3, speed: 80, pingPong: true, initialDirection: 1, speedUpOnPlayer: false, slowDownOnPlayer: false, speedMultiplier: 1.5 },
    floating: { type: 'floating', tiltAmount: 8, sinkSpeed: 40, recoverSpeed: 60, maxSink: 12 },
    dead: { type: 'dead', delay: 0.8, fallSpeed: 600, shake: true },
    bouncy: { type: 'bouncy', force: 650, cooldown: 0.1 },
    slippery: { type: 'slippery', friction: 0.05, acceleration: 80 },
    transitioning: { type: 'transitioning', axis: 'horizontal', distance: 3, speed: 80, pingPong: true, initialDirection: 1, delay: 0.5 },
    chaos: { type: 'chaos', speed: 100, maxDistance: 2, erraticness: 5 },
};

export interface TileGlow {
    intensity: number; // Blur radius, e.g. 0-50
    style: 'solid' | 'pulsing' | 'multi-color' | 'random';
    color?: string; // Single color for solid or pulsing
    colors?: string[]; // Up to 5 colors for multi-color
    speed?: number; // Speed of pulsing/transitioning
}

// Tile data model
export interface Tile {
    id: TileId;
    gridX: number;
    gridY: number;
    layerId: string; // New: Layer association
    spriteId: string;
    scaleX: number;
    scaleY: number;
    rotation: number;

    // Gameplay properties
    hasCollision?: boolean;
    opacity?: number; // 0-1
    glowColor?: string; // Hex color (Backwards compatibility / solid color)
    glow?: TileGlow; // Advanced glow settings
    physics?: {
        friction: number;
        bounciness: number;
    };
    tag?: string;
    behavior?: TileBehavior;
    behavior2?: TileBehavior; // Optional second behavior

    // For tiles that use a specific region of a source image (sprite sheet or texture)
    srcX?: number;
    srcY?: number;
    srcWidth?: number;
    srcHeight?: number;

    // Text properties (new)
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
}

// Tilesheet definition
export interface Tilesheet {
    id: string;
    name: string;
    imageSrc: string; // Base64 or URL
    width: number;
    height: number;

    // Grid settings
    frameWidth: number;
    frameHeight: number;
    paddingX: number;
    paddingY: number;
    offsetX: number;
    offsetY: number;
    columns: number;
    rows: number;
}

// Available tile/sprite definitions
export interface TileDefinition {
    id: string;
    name: string;
    color: string;
    icon?: string;

    // Default properties for new tiles of this type
    defaultCollision?: boolean;
    defaultOpacity?: number;
    defaultGlowColor?: string;
    defaultPhysics?: {
        friction: number;
        bounciness: number;
    };
    defaultTag?: string;

    // Custom texture support
    textureSrc?: string; // If set, uses this image instead of color
    tilesheetId?: string; // Links to a parent tilesheet
    autoTileSetId?: string; // Links to an AutoTileSet
    hasTransparency?: boolean; // Auto-detected on tilesheet import

    // Texture coordinates (for both standalone textures and tilesheet tiles)
    srcX?: number;
    srcY?: number;
    srcWidth?: number;
    srcHeight?: number;

    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
}

// Auto-Tiling Definitions
export interface AutoTileRule {
    // Bitmask for 8-neighbor or 4-neighbor
    // 8-neighbor (0-255): N | NE | E | SE | S | SW | W | NW
    mask: number[];
    spriteId: string;
}

export interface AutoTileSet {
    id: string;
    name: string;
    baseSpriteId: string; // Fallback sprite
    // Map mask value to spriteId. 
    // We can pre-calculate simplified masks (e.g., Wang 47 or 16)
    rules: Record<number, string>;
    type: '47-tile' | '16-tile';
}

// Default tile definitions for the palette
export const DEFAULT_TILES: TileDefinition[] = [
    { id: 'ground', name: 'Ground', color: '#8B4513' },
    { id: 'grass', name: 'Grass', color: '#228B22' },
    { id: 'water', name: 'Water', color: '#1E90FF' },
    { id: 'stone', name: 'Stone', color: '#708090' },
    { id: 'brick', name: 'Brick', color: '#B22222' },
    { id: 'wood', name: 'Wood', color: '#DEB887' },
    { id: 'sand', name: 'Sand', color: '#F4A460' },
    { id: 'ice', name: 'Ice', color: '#E0FFFF' },
    { id: 'lava', name: 'Lava', color: '#FF4500' },
    { id: 'crystal', name: 'Crystal', color: '#D36EFF' },
    { id: 'metal', name: 'Metal', color: '#A9A9A9' },
    { id: 'debug_wall', name: 'Debug Wall', color: '#333333', autoTileSetId: 'debug_set' },
    // Variants for testing
    { id: 'debug_wall_n', name: 'Debug Wall N', color: '#553333', autoTileSetId: 'debug_set' },
    { id: 'debug_wall_e', name: 'Debug Wall E', color: '#335533', autoTileSetId: 'debug_set' },
    { id: 'debug_wall_s', name: 'Debug Wall S', color: '#333355', autoTileSetId: 'debug_set' },
    { id: 'debug_wall_w', name: 'Debug Wall W', color: '#555533', autoTileSetId: 'debug_set' },
    { id: 'text_object', name: 'Text Node', color: 'transparent', text: 'New Text', fontFamily: 'sans-serif', fontSize: 32, fontColor: '#ffffff' },
];

// Collision Shape definitions
export type CollisionShapeType = 'box' | 'circle' | 'polygon';

export interface CollisionShape {
    id: string;
    type: CollisionShapeType;
    layerId: string;
    // Position in world pixels
    x: number;
    y: number;
    // Box dimensions (pixels)
    width: number;
    height: number;
    // Circle radius (pixels)
    radius: number;
    // Polygon vertices (relative to x, y)
    vertices: { x: number; y: number }[];
    // Transform
    rotation: number; // degrees
}

// Utility to generate unique tile IDs
export function generateTileId(): TileId {
    return `tile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Utility to generate unique collision shape IDs
export function generateCollisionId(): string {
    return `col_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Utility to get grid key from position
export function gridKey(x: number, y: number, layerId: string): string {
    return `${x},${y},${layerId}`;
}

// Character Instance on the map
export interface CharacterInstance {
    id: string; // Unique instance ID
    characterId: string; // Prototype ID from DB
    gridX: number;
    gridY: number;

    // Instance overrides (optional, if undefined use prototype)
    overrideProperties?: {
        health?: number;
        mana?: number;
        isEnemy?: boolean;
        npcType?: string;
        isPlayer?: boolean | 1 | 2 | 3; // If true or 1-3, this instance acts as a player spawn

        // Multiplayer distinct properties
        maxWallJumps?: number;
        knockbackImmunity?: boolean;
        scaleMultiplier?: number;

        // Enemy specific properties
        maxHp?: number;
        exp?: number;
        behavior?: 'standing' | 'pingpong' | 'follow';
        enemyType?: 'melee' | 'shooter' | 'tank' | 'flyer' | 'assassin';
    };

    layerId: string; // Layer this character belongs to
}

// Physics Settings
export interface PhysicsSettings {
    gravity: number;
    jumpForce: number;
    moveSpeed: number;
    friction: number;
    isDeathLineEnabled?: boolean;
    deathLineY?: number;
}

export const DEFAULT_PHYSICS: PhysicsSettings = {
    gravity: 1200,
    jumpForce: 500,
    moveSpeed: 200,
    friction: 0.9,
    isDeathLineEnabled: false,
    deathLineY: 2000
};

export interface ClipboardData {
    tiles: Tile[];
    characters: CharacterInstance[];
    levelImages: LevelImage[];
    width: number;
    height: number;
}

export interface LevelImage {
    id: LevelImageId;
    name: string;
    src: string;
    layerId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number; // degrees
    opacity: number; // 0-1
    locked: boolean;
    visible: boolean;
    zIndex?: number; // Sorting order
    flipX?: boolean;
    flipY?: boolean;
    tint?: string; // Hex color
}
