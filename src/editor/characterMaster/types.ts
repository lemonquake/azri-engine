/**
 * Character Master Types - Sprite Sheet Animation System
 */

// Unique identifiers
export type SpriteSheetId = string;
export type AnimationId = string;
export type FrameId = string;

/**
 * Sprite sheet metadata and configuration
 */
export interface SpriteSheet {
    id: SpriteSheetId;
    name: string;
    imageSrc: string;
    imageWidth: number;
    imageHeight: number;
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    offsetX: number;
    offsetY: number;
    paddingX: number;
    paddingY: number;
    spriteType: SpriteType;
    gridSettings: GridSettings;
}

/**
 * Types of sprite sheets with different use cases
 */
export type SpriteType =
    | 'character'    // Animated characters with walk cycles, attacks, etc.
    | 'tileset'      // Terrain, platforms, environment tiles
    | 'ui'           // UI elements like buttons, icons, panels
    | 'props'        // Static objects, decorations, items
    | 'effects'      // VFX, particles, explosions
    | 'icons'        // Small icons for inventory, skills, etc.
    | 'custom';      // User-defined configuration

/**
 * Grid display settings for the sprite sheet canvas
 */
export interface GridSettings {
    visible: boolean;
    color: string;
    opacity: number;
    lineWidth: number;
    style: 'solid' | 'dashed' | 'dotted';
    showLabels: boolean;
    highlightColor: string;
    guideLines: boolean;
}

/**
 * Preset configuration for different sprite types
 */
export interface SpriteTypePreset {
    type: SpriteType;
    name: string;
    description: string;
    icon: string;
    defaultFrameSize: { width: number; height: number };
    commonSizes: Array<{ width: number; height: number; label: string }>;
    gridSettings: GridSettings;
    animationHint: string;
}

/**
 * Presets for common sprite sheet types
 */
export const SPRITE_TYPE_PRESETS: Record<SpriteType, SpriteTypePreset> = {
    character: {
        type: 'character',
        name: 'Character Sprite',
        description: 'Animated characters with walk cycles, idle, attack, and other animations',
        icon: 'User',
        defaultFrameSize: { width: 32, height: 32 },
        commonSizes: [
            { width: 16, height: 16, label: 'Tiny (16×16)' },
            { width: 32, height: 32, label: 'Small (32×32)' },
            { width: 48, height: 48, label: 'Medium (48×48)' },
            { width: 64, height: 64, label: 'Large (64×64)' },
            { width: 96, height: 96, label: 'HD (96×96)' },
            { width: 128, height: 128, label: 'XL (128×128)' },
        ],
        gridSettings: {
            visible: true,
            color: '#00ffff',
            opacity: 0.8,
            lineWidth: 2,
            style: 'solid',
            showLabels: true,
            highlightColor: '#ff00ff',
            guideLines: true,
        },
        animationHint: 'Rows often represent different actions (idle, walk, run, attack)',
    },
    tileset: {
        type: 'tileset',
        name: 'Tileset',
        description: 'Terrain, platforms, walls, and environment tiles for level design',
        icon: 'Grid3X3',
        defaultFrameSize: { width: 16, height: 16 },
        commonSizes: [
            { width: 8, height: 8, label: 'Micro (8×8)' },
            { width: 16, height: 16, label: 'Standard (16×16)' },
            { width: 32, height: 32, label: 'Large (32×32)' },
            { width: 48, height: 48, label: 'XL (48×48)' },
        ],
        gridSettings: {
            visible: true,
            color: '#ffff00',
            opacity: 0.9,
            lineWidth: 1,
            style: 'solid',
            showLabels: true,
            highlightColor: '#00ff00',
            guideLines: true,
        },
        animationHint: 'Tiles are usually static; group by terrain type',
    },
    ui: {
        type: 'ui',
        name: 'UI Elements',
        description: 'Buttons, panels, borders, and interface components',
        icon: 'Layout',
        defaultFrameSize: { width: 32, height: 32 },
        commonSizes: [
            { width: 16, height: 16, label: 'Icon (16×16)' },
            { width: 32, height: 32, label: 'Button (32×32)' },
            { width: 64, height: 32, label: 'Wide (64×32)' },
            { width: 48, height: 48, label: 'Panel (48×48)' },
        ],
        gridSettings: {
            visible: true,
            color: '#ff8800',
            opacity: 0.7,
            lineWidth: 1,
            style: 'dashed',
            showLabels: true,
            highlightColor: '#ffffff',
            guideLines: false,
        },
        animationHint: 'UI elements may have hover, pressed, and disabled states',
    },
    props: {
        type: 'props',
        name: 'Props & Objects',
        description: 'Static objects, decorations, items, and collectibles',
        icon: 'Package',
        defaultFrameSize: { width: 32, height: 32 },
        commonSizes: [
            { width: 16, height: 16, label: 'Small (16×16)' },
            { width: 32, height: 32, label: 'Medium (32×32)' },
            { width: 64, height: 64, label: 'Large (64×64)' },
            { width: 32, height: 64, label: 'Tall (32×64)' },
        ],
        gridSettings: {
            visible: true,
            color: '#88ff88',
            opacity: 0.7,
            lineWidth: 1,
            style: 'solid',
            showLabels: true,
            highlightColor: '#ffff00',
            guideLines: true,
        },
        animationHint: 'Props may have idle animations or interaction states',
    },
    effects: {
        type: 'effects',
        name: 'Effects & VFX',
        description: 'Explosions, particles, magic effects, and visual feedback',
        icon: 'Sparkles',
        defaultFrameSize: { width: 64, height: 64 },
        commonSizes: [
            { width: 32, height: 32, label: 'Small (32×32)' },
            { width: 64, height: 64, label: 'Medium (64×64)' },
            { width: 128, height: 128, label: 'Large (128×128)' },
            { width: 256, height: 256, label: 'Epic (256×256)' },
        ],
        gridSettings: {
            visible: true,
            color: '#ff44ff',
            opacity: 0.8,
            lineWidth: 2,
            style: 'dotted',
            showLabels: true,
            highlightColor: '#ffff00',
            guideLines: true,
        },
        animationHint: 'Effects usually play once; consider looping smoke/fire',
    },
    icons: {
        type: 'icons',
        name: 'Icons',
        description: 'Small icons for inventory, skills, status effects',
        icon: 'Image',
        defaultFrameSize: { width: 16, height: 16 },
        commonSizes: [
            { width: 8, height: 8, label: 'Tiny (8×8)' },
            { width: 16, height: 16, label: 'Small (16×16)' },
            { width: 24, height: 24, label: 'Medium (24×24)' },
            { width: 32, height: 32, label: 'Large (32×32)' },
        ],
        gridSettings: {
            visible: true,
            color: '#44aaff',
            opacity: 0.9,
            lineWidth: 1,
            style: 'solid',
            showLabels: true,
            highlightColor: '#ff8800',
            guideLines: false,
        },
        animationHint: 'Icons are typically static; group by category',
    },
    custom: {
        type: 'custom',
        name: 'Custom',
        description: 'Define your own frame size and grid settings',
        icon: 'Settings',
        defaultFrameSize: { width: 32, height: 32 },
        commonSizes: [],
        gridSettings: {
            visible: true,
            color: '#ffffff',
            opacity: 0.6,
            lineWidth: 1,
            style: 'solid',
            showLabels: false,
            highlightColor: '#00ffff',
            guideLines: false,
        },
        animationHint: 'Configure based on your specific needs',
    },
};

/**
 * A single frame within a sprite sheet
 */
export interface SpriteFrame {
    id: FrameId;
    spriteSheetId: SpriteSheetId;
    row: number;
    col: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Frame reference in an animation with timing
 */
export interface AnimationFrame {
    frameId: FrameId;
    duration: number; // milliseconds
}

/**
 * Complete animation definition
 */
export interface Animation {
    id: AnimationId;
    name: string;
    spriteSheetId: SpriteSheetId;
    frames: AnimationFrame[];
    loop: boolean;
    pingPong: boolean;
}

/**
 * Auto-detection result from sprite sheet analysis
 */
export interface DetectionResult {
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    confidence: number; // 0-1
    method: 'grid' | 'alpha' | 'color-boundary' | 'manual';
}

/**
 * Transform settings for preview/export
 */
export interface TransformSettings {
    scale: number;
    offsetX: number;
    offsetY: number;
    flipX: boolean;
    flipY: boolean;
}

/**
 * Playback state for animation preview
 */
export interface PlaybackState {
    isPlaying: boolean;
    currentFrameIndex: number;
    playbackSpeed: number; // 1.0 = normal
    elapsedTime: number;
}

/**
 * Editor mode for Character Master
 */
export type CharacterMasterMode = 'sheet' | 'animation' | 'preview' | 'create' | 'character';

/**
 * Selection state
 */
export interface FrameSelection {
    frames: Set<FrameId>;
    lastSelected: FrameId | null;
}

// ========================
// Utility Functions
// ========================

/**
 * Generate unique sprite sheet ID
 */
export function generateSpriteSheetId(): SpriteSheetId {
    return `sheet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate unique animation ID
 */
export function generateAnimationId(): AnimationId {
    return `anim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate unique frame ID
 */
export function generateFrameId(): FrameId {
    return `frame_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create frame ID from row/column (for grid-based selection)
 */
export function frameKey(row: number, col: number): string {
    return `${row},${col}`;
}

/**
 * Calculate frame position from row/col and sheet configuration
 */
export function calculateFramePosition(
    row: number,
    col: number,
    sheet: Pick<SpriteSheet, 'frameWidth' | 'frameHeight' | 'offsetX' | 'offsetY' | 'paddingX' | 'paddingY'>
): { x: number; y: number } {
    return {
        x: sheet.offsetX + col * (sheet.frameWidth + sheet.paddingX),
        y: sheet.offsetY + row * (sheet.frameHeight + sheet.paddingY),
    };
}

/**
 * Create a SpriteFrame from row/col position
 */
export function createSpriteFrame(
    row: number,
    col: number,
    sheet: SpriteSheet
): SpriteFrame {
    const pos = calculateFramePosition(row, col, sheet);
    return {
        id: generateFrameId(),
        spriteSheetId: sheet.id,
        row,
        col,
        x: pos.x,
        y: pos.y,
        width: sheet.frameWidth,
        height: sheet.frameHeight,
    };
}

/**
 * Default grid settings
 */
export const DEFAULT_GRID_SETTINGS: GridSettings = {
    visible: true,
    color: '#00ffff',
    opacity: 0.8,
    lineWidth: 2,
    style: 'solid',
    showLabels: true,
    highlightColor: '#ff00ff',
    guideLines: true,
};

/**
 * Default sprite sheet configuration
 */
export const DEFAULT_SPRITE_SHEET: Omit<SpriteSheet, 'id' | 'name' | 'imageSrc' | 'imageWidth' | 'imageHeight'> = {
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    rows: 4,
    offsetX: 0,
    offsetY: 0,
    paddingX: 0,
    paddingY: 0,
    spriteType: 'character',
    gridSettings: DEFAULT_GRID_SETTINGS,
};

/**
 * Default transform settings
 */
export const DEFAULT_TRANSFORM: TransformSettings = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    flipX: false,
    flipY: false,
};

/**
 * Default playback state
 */
export const DEFAULT_PLAYBACK: PlaybackState = {
    isPlaying: false,
    currentFrameIndex: 0,
    playbackSpeed: 1,
    elapsedTime: 0,
};
