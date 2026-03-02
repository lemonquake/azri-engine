/**
 * Character Master - Module exports
 */

// Main panel
export { CharacterMasterPanel } from './CharacterMasterPanel';

// State store
export { useCharacterMasterStore } from './characterMasterStore';

// Types
export type {
    SpriteSheet,
    SpriteSheetId,
    Animation,
    AnimationId,
    SpriteFrame,
    FrameId,
    AnimationFrame,
    TransformSettings,
    PlaybackState,
    CharacterMasterMode,
    FrameSelection,
    DetectionResult,
    SpriteType,
    GridSettings,
    SpriteTypePreset,
} from './types';

export {
    generateSpriteSheetId,
    generateAnimationId,
    generateFrameId,
    frameKey,
    calculateFramePosition,
    createSpriteFrame,
    DEFAULT_SPRITE_SHEET,
    DEFAULT_TRANSFORM,
    DEFAULT_PLAYBACK,
    DEFAULT_GRID_SETTINGS,
    SPRITE_TYPE_PRESETS,
} from './types';

// Components
export { SpriteSheetCanvas } from './components/SpriteSheetCanvas';
export { FrameSelector } from './components/FrameSelector';
export { AnimationTimeline } from './components/AnimationTimeline';
export { AnimationPreview } from './components/AnimationPreview';
export { TransformControls } from './components/TransformControls';
export { SpriteTypeSelector } from './components/SpriteTypeSelector';
export { GridControls } from './components/GridControls';
export {
    Tooltip,
    TooltipContent,
    FrameTooltipContent,
    ScaleTooltipContent,
    DurationTooltipContent,
} from './components/Tooltip';

// Utilities
export {
    detectSpriteSheetConfig,
    detectBestConfig,
    suggestFrameSizes
} from './utils/spriteSheetDetector';
