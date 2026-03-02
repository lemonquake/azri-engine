/**
 * Sprite Maker - Module exports
 */

// Main panel
export { SpriteMakerPanel } from './SpriteMakerPanel';

// Components
export { DrawingToolbar } from './DrawingToolbar';
export { SpriteEditorCanvas } from './SpriteEditorCanvas';
export { FlashTimeline } from './FlashTimeline';
export { ColorPicker } from './ColorPicker';
export { LayersPanel } from './LayersPanel';

// Stores
export { useDrawingStore, colorToString, colorsEqual, PALETTES } from './stores/drawingStore';
export type {
    DrawingTool,
    Color,
    Layer,
    Selection,
    BrushSettings,
    DrawingState
} from './stores/drawingStore';

export { useTimelineStore } from './stores/timelineStore';
export type {
    AnimationFrame,
    FrameLayer,
    OnionSkinSettings,
    PlaybackState,
    TimelineState,
} from './stores/timelineStore';
