/**
 * Character Master State Store
 * Manages sprite sheets, animations, selection, and playback state
 */
import { create } from 'zustand';
import type {
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
} from './types';
import {
    generateSpriteSheetId,
    generateAnimationId,
    DEFAULT_TRANSFORM,
    DEFAULT_PLAYBACK,
    createSpriteFrame,
} from './types';
import assetRepo from '../db/repositories/AssetRepository';
import dbService from '../db/DatabaseService';

interface CharacterMasterState {
    // ==================
    // Persistence
    // ==================
    isInitialized: boolean;
    init: () => Promise<void>;

    // ==================
    // Mode & View
    // ==================
    mode: CharacterMasterMode;
    setMode: (mode: CharacterMasterMode) => void;

    // ==================
    // Sprite Sheets
    // ==================
    spriteSheets: Map<SpriteSheetId, SpriteSheet>;
    activeSpriteSheetId: SpriteSheetId | null;
    addSpriteSheet: (sheet: Omit<SpriteSheet, 'id'>, imageDataBase64?: string) => Promise<SpriteSheetId>;
    updateSpriteSheet: (id: SpriteSheetId, updates: Partial<SpriteSheet>) => void;
    removeSpriteSheet: (id: SpriteSheetId) => void;
    setActiveSpriteSheet: (id: SpriteSheetId | null) => Promise<void>;
    getActiveSpriteSheet: () => SpriteSheet | null;

    // ==================
    // Frames (derived from sheet config)
    // ==================
    frames: Map<string, SpriteFrame>; // key: "row,col"
    regenerateFrames: () => void;
    getFrameAt: (row: number, col: number) => SpriteFrame | undefined;

    // ... existing ...

    // ==================
    // Frame Selection
    // ==================
    selection: FrameSelection;
    selectFrame: (frameKey: string, addToSelection?: boolean) => void;
    deselectFrame: (frameKey: string) => void;
    clearSelection: () => void;
    selectFrameRange: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
    getSelectedFrames: () => SpriteFrame[];

    // ==================
    // Animations
    // ==================
    animations: Map<AnimationId, Animation>;
    activeAnimationId: AnimationId | null;
    createAnimation: (name: string) => AnimationId;
    updateAnimation: (id: AnimationId, updates: Partial<Animation>) => void;
    deleteAnimation: (id: AnimationId) => void;
    setActiveAnimation: (id: AnimationId | null) => void;
    getActiveAnimation: () => Animation | null;
    addFramesToAnimation: (animationId: AnimationId, frameKeys: string[], duration?: number) => void;
    removeFrameFromAnimation: (animationId: AnimationId, index: number) => void;
    reorderAnimationFrame: (animationId: AnimationId, fromIndex: number, toIndex: number) => void;
    updateFrameDuration: (animationId: AnimationId, index: number, duration: number) => void;

    // ==================
    // Transform & Preview
    // ==================
    transform: TransformSettings;
    setTransform: (updates: Partial<TransformSettings>) => void;
    resetTransform: () => void;

    // ==================
    // Playback
    // ==================
    playback: PlaybackState;
    play: () => void;
    pause: () => void;
    stop: () => void;
    setPlaybackSpeed: (speed: number) => void;
    nextFrame: () => void;
    prevFrame: () => void;
    setCurrentFrame: (index: number) => void;
    tick: (deltaTime: number) => void;

    // ==================
    // Auto-Detection
    // ==================
    lastDetectionResult: DetectionResult | null;
    setDetectionResult: (result: DetectionResult | null) => void;
    applyDetectionResult: (result: DetectionResult) => void;

    // ==================
    // Hover State (for tooltips)
    // ==================
    hoverFrameKey: string | null;
    setHoverFrameKey: (key: string | null) => void;

    // ==================
    // Image Data
    // ==================
    loadedImage: HTMLImageElement | null;
    setLoadedImage: (img: HTMLImageElement | null) => void;
}

export const useCharacterMasterStore = create<CharacterMasterState>((set, get) => ({
    // ==================
    // Persistence
    // ==================
    isInitialized: false,

    init: async () => {
        if (get().isInitialized) return;

        await dbService.init();

        // Load sheets (metadata only)
        const sheets = assetRepo.getAllSpriteSheets();
        const sheetMap = new Map<SpriteSheetId, SpriteSheet>();
        sheets.forEach(s => sheetMap.set(s.id, s));

        // Load animations
        const anims = assetRepo.getAllAnimations();
        const animMap = new Map<AnimationId, Animation>();
        anims.forEach(a => animMap.set(a.id, a));

        set({
            isInitialized: true,
            spriteSheets: sheetMap,
            animations: animMap
        });
    },

    // ==================
    // Mode & View
    // ==================
    mode: 'sheet',
    setMode: (mode) => set({ mode }),

    // ==================
    // Sprite Sheets
    // ==================
    spriteSheets: new Map(),
    activeSpriteSheetId: null,

    addSpriteSheet: async (sheetData, imageDataBase64) => {
        const id = generateSpriteSheetId();
        const sheet: SpriteSheet = { ...sheetData, id };

        // Persist
        assetRepo.saveSpriteSheet(sheet, imageDataBase64);

        set((state) => {
            const newSheets = new Map(state.spriteSheets);
            newSheets.set(id, sheet);
            return {
                spriteSheets: newSheets,
                activeSpriteSheetId: id,
            };
        });
        get().regenerateFrames();
        return id;
    },

    updateSpriteSheet: (id, updates) => {
        set((state) => {
            const sheet = state.spriteSheets.get(id);
            if (!sheet) return state;

            const updatedSheet = { ...sheet, ...updates };
            // Persist (without updating image data unless we had a way to pass it, but updates usually metadata)
            assetRepo.saveSpriteSheet(updatedSheet);

            const newSheets = new Map(state.spriteSheets);
            newSheets.set(id, updatedSheet);
            return { spriteSheets: newSheets };
        });
        if (get().activeSpriteSheetId === id) {
            get().regenerateFrames();
        }
    },

    removeSpriteSheet: (id) => {
        assetRepo.deleteSpriteSheet(id);

        set((state) => {
            const newSheets = new Map(state.spriteSheets);
            newSheets.delete(id);
            return {
                spriteSheets: newSheets,
                activeSpriteSheetId: state.activeSpriteSheetId === id ? null : state.activeSpriteSheetId,
            };
        });
    },

    setActiveSpriteSheet: async (id) => {
        if (!id) {
            set({ activeSpriteSheetId: null });
            get().regenerateFrames();
            return;
        }

        const state = get();
        const sheet = state.spriteSheets.get(id);
        if (!sheet) return;

        // If sheet doesn't have image source loaded (e.g. from initial DB load), fetch it
        if (!sheet.imageSrc || sheet.imageSrc.length < 50) { // arbitrary heuristic for "not a real image"
            const fullData = assetRepo.getSpriteSheet(id);
            if (fullData) {
                const fullSheet = { ...fullData.sheet, imageSrc: fullData.imageData };
                // Update store with full image data
                const newSheets = new Map(state.spriteSheets);
                newSheets.set(id, fullSheet);
                set({ spriteSheets: newSheets });

                // Also set loadedImage for UI tools
                const img = new Image();
                img.src = fullData.imageData;
                img.onload = () => set({ loadedImage: img });
            }
        } else {
            // Image src already exists (freshly added), ensure loadedImage is set
            const img = new Image();
            img.src = sheet.imageSrc;
            img.onload = () => set({ loadedImage: img });
        }

        set({ activeSpriteSheetId: id });
        get().regenerateFrames();
    },

    getActiveSpriteSheet: () => {
        const state = get();
        if (!state.activeSpriteSheetId) return null;
        return state.spriteSheets.get(state.activeSpriteSheetId) || null;
    },

    // ==================
    // Frames
    // ==================
    frames: new Map(),

    regenerateFrames: () => {
        const sheet = get().getActiveSpriteSheet();
        if (!sheet) {
            set({ frames: new Map() });
            return;
        }

        const newFrames = new Map<string, SpriteFrame>();
        for (let row = 0; row < sheet.rows; row++) {
            for (let col = 0; col < sheet.columns; col++) {
                const key = `${row},${col}`;
                const frame = createSpriteFrame(row, col, sheet);
                newFrames.set(key, frame);
            }
        }
        set({ frames: newFrames });
    },

    getFrameAt: (row, col) => {
        return get().frames.get(`${row},${col}`);
    },

    // ==================
    // Frame Selection
    // ==================
    selection: {
        frames: new Set(),
        lastSelected: null,
    },

    selectFrame: (frameKey, addToSelection = false) => {
        set((state) => {
            const newFrames = addToSelection ? new Set(state.selection.frames) : new Set<FrameId>();
            newFrames.add(frameKey);
            return {
                selection: {
                    frames: newFrames,
                    lastSelected: frameKey,
                },
            };
        });
    },

    deselectFrame: (frameKey) => {
        set((state) => {
            const newFrames = new Set(state.selection.frames);
            newFrames.delete(frameKey);
            return {
                selection: {
                    ...state.selection,
                    frames: newFrames,
                },
            };
        });
    },

    clearSelection: () => {
        set({
            selection: {
                frames: new Set(),
                lastSelected: null,
            },
        });
    },

    selectFrameRange: (startRow, startCol, endRow, endCol) => {
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        const newFrames = new Set<string>();
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                newFrames.add(`${row},${col}`);
            }
        }
        set({
            selection: {
                frames: newFrames,
                lastSelected: `${endRow},${endCol}`,
            },
        });
    },

    getSelectedFrames: () => {
        const state = get();
        const selected: SpriteFrame[] = [];
        state.selection.frames.forEach((key) => {
            const frame = state.frames.get(key);
            if (frame) selected.push(frame);
        });
        // Sort by row, then column
        return selected.sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
    },

    // ==================
    // Animations
    // ==================
    animations: new Map(),
    activeAnimationId: null,

    createAnimation: (name) => {
        const state = get();
        const id = generateAnimationId();
        const animation: Animation = {
            id,
            name,
            spriteSheetId: state.activeSpriteSheetId || '',
            frames: [],
            loop: true,
            pingPong: false,
        };

        // Persist
        assetRepo.saveAnimation(animation);

        set((s) => {
            const newAnimations = new Map(s.animations);
            newAnimations.set(id, animation);
            return {
                animations: newAnimations,
                activeAnimationId: id,
            };
        });
        return id;
    },

    updateAnimation: (id, updates) => {
        set((state) => {
            const anim = state.animations.get(id);
            if (!anim) return state;
            const updatedAnim = { ...anim, ...updates };

            // Persist
            assetRepo.saveAnimation(updatedAnim);

            const newAnimations = new Map(state.animations);
            newAnimations.set(id, updatedAnim);
            return { animations: newAnimations };
        });
    },

    deleteAnimation: (id) => {
        assetRepo.deleteAnimation(id);

        set((state) => {
            const newAnimations = new Map(state.animations);
            newAnimations.delete(id);
            return {
                animations: newAnimations,
                activeAnimationId: state.activeAnimationId === id ? null : state.activeAnimationId,
            };
        });
    },

    setActiveAnimation: (id) => set({ activeAnimationId: id }),

    getActiveAnimation: () => {
        const state = get();
        if (!state.activeAnimationId) return null;
        return state.animations.get(state.activeAnimationId) || null;
    },

    addFramesToAnimation: (animationId, frameKeys, duration = 100) => {
        set((state) => {
            const anim = state.animations.get(animationId);
            if (!anim) return state;

            const newFrames: AnimationFrame[] = frameKeys.map((key) => ({
                frameId: key,
                duration,
            }));

            const updatedAnim = {
                ...anim,
                frames: [...anim.frames, ...newFrames],
            };
            assetRepo.saveAnimation(updatedAnim);

            const newAnimations = new Map(state.animations);
            newAnimations.set(animationId, updatedAnim);
            return { animations: newAnimations };
        });
    },

    removeFrameFromAnimation: (animationId, index) => {
        set((state) => {
            const anim = state.animations.get(animationId);
            if (!anim) return state;

            const newFrames = [...anim.frames];
            newFrames.splice(index, 1);

            const updatedAnim = { ...anim, frames: newFrames };
            assetRepo.saveAnimation(updatedAnim);

            const newAnimations = new Map(state.animations);
            newAnimations.set(animationId, updatedAnim);
            return { animations: newAnimations };
        });
    },

    reorderAnimationFrame: (animationId, fromIndex, toIndex) => {
        set((state) => {
            const anim = state.animations.get(animationId);
            if (!anim) return state;

            const newFrames = [...anim.frames];
            const [moved] = newFrames.splice(fromIndex, 1);
            newFrames.splice(toIndex, 0, moved);

            const updatedAnim = { ...anim, frames: newFrames };
            assetRepo.saveAnimation(updatedAnim);

            const newAnimations = new Map(state.animations);
            newAnimations.set(animationId, updatedAnim);
            return { animations: newAnimations };
        });
    },

    updateFrameDuration: (animationId, index, duration) => {
        set((state) => {
            const anim = state.animations.get(animationId);
            if (!anim || !anim.frames[index]) return state;

            const newFrames = [...anim.frames];
            newFrames[index] = { ...newFrames[index], duration };

            const updatedAnim = { ...anim, frames: newFrames };
            assetRepo.saveAnimation(updatedAnim);

            const newAnimations = new Map(state.animations);
            newAnimations.set(animationId, updatedAnim);
            return { animations: newAnimations };
        });
    },

    // ==================
    // Transform & Preview
    // ==================
    transform: { ...DEFAULT_TRANSFORM },
    setTransform: (updates) => set((state) => ({ transform: { ...state.transform, ...updates } })),
    resetTransform: () => set({ transform: { ...DEFAULT_TRANSFORM } }),

    // ==================
    // Playback
    // ==================
    playback: { ...DEFAULT_PLAYBACK },

    play: () => set((state) => ({ playback: { ...state.playback, isPlaying: true } })),
    pause: () => set((state) => ({ playback: { ...state.playback, isPlaying: false } })),
    stop: () => set({ playback: { ...DEFAULT_PLAYBACK } }),

    setPlaybackSpeed: (speed) => set((state) => ({ playback: { ...state.playback, playbackSpeed: speed } })),

    nextFrame: () => {
        const state = get();
        const anim = state.getActiveAnimation();
        if (!anim || anim.frames.length === 0) return;

        const nextIndex = (state.playback.currentFrameIndex + 1) % anim.frames.length;
        set((s) => ({
            playback: { ...s.playback, currentFrameIndex: nextIndex, elapsedTime: 0 },
        }));
    },

    prevFrame: () => {
        const state = get();
        const anim = state.getActiveAnimation();
        if (!anim || anim.frames.length === 0) return;

        const prevIndex = state.playback.currentFrameIndex === 0
            ? anim.frames.length - 1
            : state.playback.currentFrameIndex - 1;
        set((s) => ({
            playback: { ...s.playback, currentFrameIndex: prevIndex, elapsedTime: 0 },
        }));
    },

    setCurrentFrame: (index) => {
        set((state) => ({
            playback: { ...state.playback, currentFrameIndex: index, elapsedTime: 0 },
        }));
    },

    tick: (deltaTime) => {
        const state = get();
        if (!state.playback.isPlaying) return;

        const anim = state.getActiveAnimation();
        if (!anim || anim.frames.length === 0) return;

        const currentFrame = anim.frames[state.playback.currentFrameIndex];
        if (!currentFrame) return;

        const adjustedDelta = deltaTime * state.playback.playbackSpeed;
        const newElapsed = state.playback.elapsedTime + adjustedDelta;

        if (newElapsed >= currentFrame.duration) {
            // Move to next frame
            let nextIndex = state.playback.currentFrameIndex + 1;

            if (nextIndex >= anim.frames.length) {
                if (anim.loop) {
                    nextIndex = 0;
                } else {
                    // Stop at last frame
                    set((s) => ({ playback: { ...s.playback, isPlaying: false } }));
                    return;
                }
            }

            set((s) => ({
                playback: {
                    ...s.playback,
                    currentFrameIndex: nextIndex,
                    elapsedTime: newElapsed - currentFrame.duration,
                },
            }));
        } else {
            set((s) => ({
                playback: { ...s.playback, elapsedTime: newElapsed },
            }));
        }
    },

    // ==================
    // Auto-Detection
    // ==================
    lastDetectionResult: null,
    setDetectionResult: (result) => set({ lastDetectionResult: result }),

    applyDetectionResult: (result) => {
        const state = get();
        if (!state.activeSpriteSheetId) return;

        state.updateSpriteSheet(state.activeSpriteSheetId, {
            frameWidth: result.frameWidth,
            frameHeight: result.frameHeight,
            columns: result.columns,
            rows: result.rows,
        });
        set({ lastDetectionResult: result });
    },

    // ==================
    // Hover State
    // ==================
    hoverFrameKey: null,
    setHoverFrameKey: (key) => set({ hoverFrameKey: key }),

    // ==================
    // Image Data
    // ==================
    loadedImage: null,
    setLoadedImage: (img) => set({ loadedImage: img }),
}));
