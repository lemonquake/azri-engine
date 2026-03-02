/**
 * Timeline Store - State management for Flash-style frame animation
 */
import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface AnimationFrame {
    id: string;
    name: string;
    imageData: ImageData | null;
    duration: number;  // In ticks (1 tick = 1/fps seconds)
    isKeyframe: boolean;
    layers: FrameLayer[];
}

export interface FrameLayer {
    layerId: string;
    imageData: ImageData | null;
    visible: boolean;
}

export interface OnionSkinSettings {
    enabled: boolean;
    prevFrames: number;      // Number of previous frames to show
    nextFrames: number;      // Number of next frames to show
    prevOpacity: number;     // Opacity for previous frames (0-100)
    nextOpacity: number;     // Opacity for next frames (0-100)
    prevColor: string;       // Tint color for previous frames
    nextColor: string;       // Tint color for next frames
}

export interface PlaybackState {
    isPlaying: boolean;
    isLooping: boolean;
    fps: number;
    currentTick: number;
}

export interface TimelineState {
    // Frames
    frames: AnimationFrame[];
    currentFrameIndex: number;
    selectedFrameIndices: Set<number>;

    // Playback
    playback: PlaybackState;

    // Onion skinning
    onionSkin: OnionSkinSettings;

    // Canvas size for new frames
    frameWidth: number;
    frameHeight: number;

    // Clipboard for frames
    frameClipboard: AnimationFrame[];

    // Actions - Frame Management
    addFrame: (atIndex?: number, duplicate?: boolean) => void;
    removeFrame: (index: number) => void;
    duplicateFrame: (index: number) => void;
    moveFrame: (fromIndex: number, toIndex: number) => void;
    setCurrentFrame: (index: number) => void;
    selectFrame: (index: number, addToSelection?: boolean) => void;
    selectFrameRange: (startIndex: number, endIndex: number) => void;
    clearFrameSelection: () => void;

    // Actions - Frame Data
    updateFrameImageData: (index: number, imageData: ImageData) => void;
    updateFrameLayerData: (frameIndex: number, layerId: string, imageData: ImageData) => void;
    setFrameDuration: (index: number, duration: number) => void;
    setFrameName: (index: number, name: string) => void;
    toggleKeyframe: (index: number) => void;

    // Actions - Clipboard
    copyFrames: () => void;
    pasteFrames: (atIndex?: number) => void;
    cutFrames: () => void;

    // Actions - Playback
    play: () => void;
    pause: () => void;
    stop: () => void;
    toggleLoop: () => void;
    setFps: (fps: number) => void;
    nextFrame: () => void;
    prevFrame: () => void;
    goToFrame: (index: number) => void;
    tick: () => void;  // Called by animation loop

    // Actions - Onion Skin
    toggleOnionSkin: () => void;
    setOnionSkinSettings: (settings: Partial<OnionSkinSettings>) => void;

    // Actions - Canvas Size
    setFrameSize: (width: number, height: number) => void;

    // Getters
    getCurrentFrame: () => AnimationFrame | null;
    getFrameCount: () => number;
    getTotalDuration: () => number;  // In ticks
    getFrameAtTick: (tick: number) => { frame: AnimationFrame; index: number } | null;

    // Animation Management
    animations: AnimationDefinition[];
    previewAnimationId: string | null;  // If set, playback is constrained to this animation

    // Actions - Animation Management
    addAnimation: (name: string, startFrame: number, endFrame: number) => void;
    removeAnimation: (id: string) => void;
    updateAnimation: (id: string, updates: Partial<AnimationDefinition>) => void;
    setPreviewAnimation: (id: string | null) => void;

    // Initialize
    initializeTimeline: (width: number, height: number) => void;
}

export interface AnimationDefinition {
    id: string;
    name: string;
    startFrame: number;
    endFrame: number;
    loop: boolean;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_ONION_SKIN: OnionSkinSettings = {
    enabled: false,
    prevFrames: 2,
    nextFrames: 1,
    prevOpacity: 30,
    nextOpacity: 20,
    prevColor: '#ff6b6b',
    nextColor: '#4ecdc4',
};

export const DEFAULT_PLAYBACK: PlaybackState = {
    isPlaying: false,
    isLooping: true,
    fps: 12,
    currentTick: 0,
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateFrameId(): string {
    return `frame_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function createEmptyFrame(name: string = 'Frame'): AnimationFrame {
    return {
        id: generateFrameId(),
        name,
        imageData: null,
        duration: 1,
        isKeyframe: true,
        layers: [],
    };
}

// ============================================================================
// Store
// ============================================================================

export const useTimelineStore = create<TimelineState>((set, get) => ({
    // Initial state
    frames: [],
    currentFrameIndex: 0,
    selectedFrameIndices: new Set([0]),
    playback: { ...DEFAULT_PLAYBACK },
    onionSkin: { ...DEFAULT_ONION_SKIN },
    frameWidth: 32,
    frameHeight: 32,
    frameClipboard: [],
    animations: [],
    previewAnimationId: null,

    // Frame Management
    addFrame: (atIndex, duplicate = false) => set((state) => {
        const insertIndex = atIndex ?? state.frames.length;
        let newFrame: AnimationFrame;

        if (duplicate && state.frames[state.currentFrameIndex]) {
            const sourceFrame = state.frames[state.currentFrameIndex];
            newFrame = {
                ...sourceFrame,
                id: generateFrameId(),
                name: `${sourceFrame.name} copy`,
                imageData: sourceFrame.imageData ?
                    new ImageData(
                        new Uint8ClampedArray(sourceFrame.imageData.data),
                        sourceFrame.imageData.width,
                        sourceFrame.imageData.height
                    ) : null,
                layers: sourceFrame.layers.map(l => ({
                    ...l,
                    imageData: l.imageData ?
                        new ImageData(
                            new Uint8ClampedArray(l.imageData.data),
                            l.imageData.width,
                            l.imageData.height
                        ) : null,
                })),
            };
        } else {
            newFrame = createEmptyFrame(`Frame ${state.frames.length + 1}`);
        }

        const newFrames = [...state.frames];
        newFrames.splice(insertIndex, 0, newFrame);

        return {
            frames: newFrames,
            currentFrameIndex: insertIndex,
            selectedFrameIndices: new Set([insertIndex]),
        };
    }),

    removeFrame: (index) => set((state) => {
        if (state.frames.length <= 1) return state;

        const newFrames = state.frames.filter((_, i) => i !== index);
        const newIndex = Math.min(state.currentFrameIndex, newFrames.length - 1);

        return {
            frames: newFrames,
            currentFrameIndex: newIndex,
            selectedFrameIndices: new Set([newIndex]),
        };
    }),

    duplicateFrame: (index) => {
        get().addFrame(index + 1, true);
    },

    moveFrame: (fromIndex, toIndex) => set((state) => {
        if (fromIndex === toIndex) return state;

        const newFrames = [...state.frames];
        const [removed] = newFrames.splice(fromIndex, 1);
        newFrames.splice(toIndex, 0, removed);

        // Update current frame index if it was affected
        let newCurrentIndex = state.currentFrameIndex;
        if (state.currentFrameIndex === fromIndex) {
            newCurrentIndex = toIndex;
        } else if (fromIndex < state.currentFrameIndex && toIndex >= state.currentFrameIndex) {
            newCurrentIndex--;
        } else if (fromIndex > state.currentFrameIndex && toIndex <= state.currentFrameIndex) {
            newCurrentIndex++;
        }

        return {
            frames: newFrames,
            currentFrameIndex: newCurrentIndex,
        };
    }),

    setCurrentFrame: (index) => set((state) => ({
        currentFrameIndex: Math.max(0, Math.min(index, state.frames.length - 1)),
        selectedFrameIndices: new Set([index]),
    })),

    selectFrame: (index, addToSelection = false) => set((state) => {
        if (addToSelection) {
            const newSelection = new Set(state.selectedFrameIndices);
            if (newSelection.has(index)) {
                newSelection.delete(index);
            } else {
                newSelection.add(index);
            }
            return { selectedFrameIndices: newSelection, currentFrameIndex: index };
        }
        return {
            selectedFrameIndices: new Set([index]),
            currentFrameIndex: index,
        };
    }),

    selectFrameRange: (startIndex, endIndex) => set(() => {
        const selection = new Set<number>();
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        for (let i = min; i <= max; i++) {
            selection.add(i);
        }
        return { selectedFrameIndices: selection };
    }),

    clearFrameSelection: () => set((state) => ({
        selectedFrameIndices: new Set([state.currentFrameIndex]),
    })),

    // Frame Data
    updateFrameImageData: (index, imageData) => set((state) => ({
        frames: state.frames.map((f, i) =>
            i === index ? { ...f, imageData } : f
        ),
    })),

    updateFrameLayerData: (frameIndex, layerId, imageData) => set((state) => ({
        frames: state.frames.map((f, i) => {
            if (i !== frameIndex) return f;

            const existingLayer = f.layers.find(l => l.layerId === layerId);
            if (existingLayer) {
                return {
                    ...f,
                    layers: f.layers.map(l =>
                        l.layerId === layerId ? { ...l, imageData } : l
                    ),
                };
            } else {
                return {
                    ...f,
                    layers: [...f.layers, { layerId, imageData, visible: true }],
                };
            }
        }),
    })),

    setFrameDuration: (index, duration) => set((state) => ({
        frames: state.frames.map((f, i) =>
            i === index ? { ...f, duration: Math.max(1, duration) } : f
        ),
    })),

    setFrameName: (index, name) => set((state) => ({
        frames: state.frames.map((f, i) =>
            i === index ? { ...f, name } : f
        ),
    })),

    toggleKeyframe: (index) => set((state) => ({
        frames: state.frames.map((f, i) =>
            i === index ? { ...f, isKeyframe: !f.isKeyframe } : f
        ),
    })),

    // Clipboard
    copyFrames: () => set((state) => {
        const selectedIndices = Array.from(state.selectedFrameIndices).sort((a, b) => a - b);
        const copiedFrames = selectedIndices.map(i => ({
            ...state.frames[i],
            id: generateFrameId(),
        }));
        return { frameClipboard: copiedFrames };
    }),

    pasteFrames: (atIndex) => set((state) => {
        if (state.frameClipboard.length === 0) return state;

        const insertIndex = atIndex ?? state.currentFrameIndex + 1;
        const newFrames = [...state.frames];
        const pastedFrames = state.frameClipboard.map(f => ({
            ...f,
            id: generateFrameId(),
            name: `${f.name} copy`,
        }));

        newFrames.splice(insertIndex, 0, ...pastedFrames);

        return {
            frames: newFrames,
            currentFrameIndex: insertIndex,
        };
    }),

    cutFrames: () => {
        const state = get();
        state.copyFrames();

        // Remove selected frames (in reverse order to preserve indices)
        const selectedIndices = Array.from(state.selectedFrameIndices).sort((a, b) => b - a);
        for (const index of selectedIndices) {
            if (state.frames.length > 1) {
                state.removeFrame(index);
            }
        }
    },

    // Playback
    play: () => set((state) => ({
        playback: { ...state.playback, isPlaying: true },
    })),

    pause: () => set((state) => ({
        playback: { ...state.playback, isPlaying: false },
    })),

    stop: () => set((state) => ({
        playback: { ...state.playback, isPlaying: false, currentTick: 0 },
        currentFrameIndex: 0,
    })),

    toggleLoop: () => set((state) => ({
        playback: { ...state.playback, isLooping: !state.playback.isLooping },
    })),

    setFps: (fps) => set((state) => ({
        playback: { ...state.playback, fps: Math.max(1, Math.min(60, fps)) },
    })),

    nextFrame: () => set((state) => {
        const nextIndex = state.currentFrameIndex + 1;
        if (nextIndex >= state.frames.length) {
            if (state.playback.isLooping) {
                return { currentFrameIndex: 0 };
            }
            return state;
        }
        return { currentFrameIndex: nextIndex };
    }),

    prevFrame: () => set((state) => ({
        currentFrameIndex: Math.max(0, state.currentFrameIndex - 1),
    })),

    goToFrame: (index) => set((state) => ({
        currentFrameIndex: Math.max(0, Math.min(index, state.frames.length - 1)),
    })),

    tick: () => set((state) => {
        if (!state.playback.isPlaying) return state;

        // Determine range
        let startFrame = 0;
        let endFrame = state.frames.length - 1;
        let shouldLoop = state.playback.isLooping;

        if (state.previewAnimationId) {
            const anim = state.animations.find(a => a.id === state.previewAnimationId);
            if (anim) {
                startFrame = Math.max(0, Math.min(anim.startFrame, state.frames.length - 1));
                endFrame = Math.max(startFrame, Math.min(anim.endFrame, state.frames.length - 1));
                shouldLoop = anim.loop;

                // If currently outside range, jump to start
                if (state.currentFrameIndex < startFrame || state.currentFrameIndex > endFrame) {
                    return { currentFrameIndex: startFrame, playback: { ...state.playback, currentTick: 0 } };
                }
            }
        }

        // Calculate which frame we should be on based on tick
        // We need to calculate ticks relative to the start of the current range
        // But the store tracks 'currentTick' which accumulates.
        // Simpler approach: Just increment frame based on duration?
        // The current implementation uses accumulated 'currentTick' against ALL frames.
        // Let's refactor 'currentTick' to be relative to the current frame's start?
        // Or just increment ticks and see if we cross the current frame's duration.

        const currentFrame = state.frames[state.currentFrameIndex];
        const nextTick = state.playback.currentTick + 1;

        if (nextTick >= currentFrame.duration) {
            // Move to next frame
            const nextIndex = state.currentFrameIndex + 1;

            if (nextIndex > endFrame) {
                // Loop or Stop
                if (shouldLoop) {
                    return {
                        currentFrameIndex: startFrame,
                        playback: { ...state.playback, currentTick: 0 }
                    };
                } else {
                    return {
                        playback: { ...state.playback, isPlaying: false, currentTick: 0 },
                        currentFrameIndex: startFrame // Optional: reset to start? Or stay at end? Flash usually stays at end.
                    };
                }
            } else {
                return {
                    currentFrameIndex: nextIndex,
                    playback: { ...state.playback, currentTick: 0 }
                };
            }
        }

        return {
            playback: { ...state.playback, currentTick: nextTick }
        };
    }),

    // Onion Skin
    toggleOnionSkin: () => set((state) => ({
        onionSkin: { ...state.onionSkin, enabled: !state.onionSkin.enabled },
    })),

    setOnionSkinSettings: (settings) => set((state) => ({
        onionSkin: { ...state.onionSkin, ...settings },
    })),

    // Canvas Size
    setFrameSize: (width, height) => set({
        frameWidth: width,
        frameHeight: height,
    }),

    // Getters
    getCurrentFrame: () => {
        const state = get();
        return state.frames[state.currentFrameIndex] || null;
    },

    getFrameCount: () => get().frames.length,

    getTotalDuration: () => {
        return get().frames.reduce((sum, f) => sum + f.duration, 0);
    },

    getFrameAtTick: (tick) => {
        const state = get();
        let tickCount = 0;

        for (let i = 0; i < state.frames.length; i++) {
            tickCount += state.frames[i].duration;
            if (tick < tickCount) {
                return { frame: state.frames[i], index: i };
            }
        }

        return null;
    },

    // Animation Management
    addAnimation: (name, startFrame, endFrame) => set((state) => ({
        animations: [
            ...state.animations,
            {
                id: `anim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                name,
                startFrame,
                endFrame,
                loop: true
            }
        ]
    })),

    removeAnimation: (id) => set((state) => ({
        animations: state.animations.filter(a => a.id !== id),
        previewAnimationId: state.previewAnimationId === id ? null : state.previewAnimationId
    })),

    updateAnimation: (id, updates) => set((state) => ({
        animations: state.animations.map(a => a.id === id ? { ...a, ...updates } : a)
    })),

    setPreviewAnimation: (id) => set({ previewAnimationId: id }),

    // Initialize
    initializeTimeline: (width, height) => {
        set({
            frames: [createEmptyFrame('Frame 1')],
            currentFrameIndex: 0,
            selectedFrameIndices: new Set([0]),
            playback: { ...DEFAULT_PLAYBACK },
            onionSkin: { ...DEFAULT_ONION_SKIN },
            frameWidth: width,
            frameHeight: height,
            frameClipboard: [],
            animations: [],
            previewAnimationId: null,
        });
    },
}));
