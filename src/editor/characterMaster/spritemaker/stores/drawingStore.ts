/**
 * Drawing Store - State management for sprite drawing tools
 */
import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type DrawingTool =
    | 'pencil'
    | 'brush'
    | 'eraser'
    | 'fill'
    | 'eyedropper'
    | 'select-rect'
    | 'select-lasso'
    | 'move'
    | 'line'
    | 'rectangle'
    | 'ellipse'
    | 'lighten'
    | 'darken'
    | 'color-replace';

export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    opacity: number;
    blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
    imageData: ImageData | null;
}

export interface Selection {
    active: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    path?: { x: number; y: number }[];  // For lasso selection
}

export interface FloatingSelection {
    x: number;
    y: number;
    width: number;
    height: number;
    imageData: ImageData;
}

export interface HistoryEntry {
    layerId: string;
    imageData: ImageData;
    timestamp: number;
}

export interface BrushSettings {
    size: number;
    hardness: number;  // 0-100, affects edge softness
    opacity: number;   // 0-100
    spacing: number;   // 0-100, affects stroke smoothness
    dither: boolean;
}

export interface SymmetrySettings {
    enabled: boolean;
    xAxis: boolean;
    yAxis: boolean;
    centerX: number;
    centerY: number;
}

export interface DrawingState {
    // Canvas dimensions
    canvasWidth: number;
    canvasHeight: number;

    // Current tool
    currentTool: DrawingTool;

    // Colors
    foregroundColor: Color;
    backgroundColor: Color;
    recentColors: Color[];

    // Brush settings
    brushSettings: BrushSettings;
    symmetry: SymmetrySettings;

    // Layers
    layers: Layer[];
    activeLayerId: string | null;

    // Selection
    selection: Selection;
    floatingSelection: FloatingSelection | null;
    clipboard: ImageData | null;

    // History (undo/redo)
    history: HistoryEntry[];
    historyIndex: number;
    maxHistory: number;

    // Drawing state
    isDrawing: boolean;
    lastPoint: { x: number; y: number } | null;

    // Grid
    showGrid: boolean;
    // Grid & View
    gridSize: number;
    tiledPreview: boolean;

    // Actions
    setTool: (tool: DrawingTool) => void;
    setForegroundColor: (color: Color) => void;
    setBackgroundColor: (color: Color) => void;
    swapColors: () => void;
    addRecentColor: (color: Color) => void;
    setBrushSettings: (settings: Partial<BrushSettings>) => void;

    setSymmetry: (settings: Partial<SymmetrySettings>) => void;
    toggleTiledPreview: () => void;

    // Layer actions
    addLayer: (name?: string) => void;
    setLayers: (layers: Layer[]) => void;
    removeLayer: (id: string) => void;
    setActiveLayer: (id: string) => void;
    updateLayerImageData: (id: string, imageData: ImageData) => void;
    toggleLayerVisibility: (id: string) => void;
    setLayerOpacity: (id: string, opacity: number) => void;
    reorderLayers: (fromIndex: number, toIndex: number) => void;
    mergeDown: (id: string) => void;
    flattenLayers: () => void;

    // Selection actions
    setSelection: (selection: Partial<Selection>) => void;
    clearSelection: () => void;
    setFloatingSelection: (selection: FloatingSelection | null) => void;
    moveSelection: (dx: number, dy: number) => void;
    rotateSelection: () => void;
    applySelection: () => void;
    deleteSelection: () => void;

    // Effects
    applyOutline: () => void;
    removeBackground: () => void;

    // History (undo/redo)
    undo: () => void;
    copySelection: () => void;
    pasteSelection: () => void;
    cutSelection: () => void;

    // History actions
    pushHistory: (layerId: string, imageData: ImageData) => void;
    redo: () => void;
    clearHistory: () => void;

    // Drawing actions
    startDrawing: (x: number, y: number) => void;
    continueDrawing: (x: number, y: number) => void;
    endDrawing: () => void;

    // Canvas actions
    setCanvasSize: (width: number, height: number) => void;
    clearCanvas: () => void;
    toggleGrid: () => void;
    setGridSize: (size: number) => void;

    // Initialize
    initializeCanvas: (width: number, height: number) => void;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_FOREGROUND: Color = { r: 0, g: 0, b: 0, a: 255 };
export const DEFAULT_BACKGROUND: Color = { r: 255, g: 255, b: 255, a: 255 };

export const DEFAULT_BRUSH: BrushSettings = {
    size: 1,
    hardness: 100,
    opacity: 100,
    spacing: 25,
    dither: false,
};

export const DEFAULT_SYMMETRY: SymmetrySettings = {
    enabled: false,
    xAxis: true,
    yAxis: false,
    centerX: 16, // Will be updated on init
    centerY: 16,
};

// Color palettes
export const PALETTES = {
    nes: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 252, g: 252, b: 252, a: 255 },
        { r: 188, g: 188, b: 188, a: 255 },
        { r: 124, g: 124, b: 124, a: 255 },
        { r: 164, g: 0, b: 0, a: 255 },
        { r: 228, g: 0, b: 88, a: 255 },
        { r: 216, g: 40, b: 0, a: 255 },
        { r: 228, g: 92, b: 16, a: 255 },
        { r: 172, g: 124, b: 0, a: 255 },
        { r: 0, g: 168, b: 0, a: 255 },
        { r: 0, g: 168, b: 68, a: 255 },
        { r: 0, g: 136, b: 136, a: 255 },
        { r: 0, g: 120, b: 248, a: 255 },
        { r: 0, g: 88, b: 248, a: 255 },
        { r: 104, g: 68, b: 252, a: 255 },
        { r: 216, g: 0, b: 204, a: 255 },
    ],
    pico8: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 29, g: 43, b: 83, a: 255 },
        { r: 126, g: 37, b: 83, a: 255 },
        { r: 0, g: 135, b: 81, a: 255 },
        { r: 171, g: 82, b: 54, a: 255 },
        { r: 95, g: 87, b: 79, a: 255 },
        { r: 194, g: 195, b: 199, a: 255 },
        { r: 255, g: 241, b: 232, a: 255 },
        { r: 255, g: 0, b: 77, a: 255 },
        { r: 255, g: 163, b: 0, a: 255 },
        { r: 255, g: 236, b: 39, a: 255 },
        { r: 0, g: 228, b: 54, a: 255 },
        { r: 41, g: 173, b: 255, a: 255 },
        { r: 131, g: 118, b: 156, a: 255 },
        { r: 255, g: 119, b: 168, a: 255 },
        { r: 255, g: 204, b: 170, a: 255 },
    ],
    gameboy: [
        { r: 15, g: 56, b: 15, a: 255 },
        { r: 48, g: 98, b: 48, a: 255 },
        { r: 139, g: 172, b: 15, a: 255 },
        { r: 155, g: 188, b: 15, a: 255 },
    ],
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateLayerId(): string {
    return `layer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function colorToString(color: Color): string {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

function colorsEqual(a: Color, b: Color): boolean {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

// ============================================================================
// Store
// ============================================================================

export const useDrawingStore = create<DrawingState>((set, get) => ({
    // Initial state
    canvasWidth: 32,
    canvasHeight: 32,
    currentTool: 'pencil',
    foregroundColor: { ...DEFAULT_FOREGROUND },
    backgroundColor: { ...DEFAULT_BACKGROUND },
    recentColors: [],
    brushSettings: { ...DEFAULT_BRUSH },
    symmetry: { ...DEFAULT_SYMMETRY },
    layers: [],
    activeLayerId: null,
    selection: { active: false, x: 0, y: 0, width: 0, height: 0 },
    floatingSelection: null,
    clipboard: null,
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    isDrawing: false,
    lastPoint: null,
    showGrid: true,

    gridSize: 1,
    tiledPreview: false,

    // Tool actions
    setTool: (tool) => set({ currentTool: tool }),

    setForegroundColor: (color) => {
        set({ foregroundColor: color });
        get().addRecentColor(color);
    },

    setBackgroundColor: (color) => set({ backgroundColor: color }),

    swapColors: () => set((state) => ({
        foregroundColor: state.backgroundColor,
        backgroundColor: state.foregroundColor,
    })),

    addRecentColor: (color) => set((state) => {
        const exists = state.recentColors.some(c => colorsEqual(c, color));
        if (exists) return state;

        const newRecent = [color, ...state.recentColors].slice(0, 16);
        return { recentColors: newRecent };
    }),

    setBrushSettings: (settings) => set((state) => ({
        brushSettings: { ...state.brushSettings, ...settings },
    })),

    setSymmetry: (settings) => set((state) => ({
        symmetry: { ...state.symmetry, ...settings },
    })),

    // Layer actions
    addLayer: (name) => set((state) => {
        const id = generateLayerId();
        const newLayer: Layer = {
            id,
            name: name || `Layer ${state.layers.length + 1}`,
            visible: true,
            locked: false,
            opacity: 100,
            blendMode: 'normal',
            imageData: null,
        };
        return {
            layers: [...state.layers, newLayer],
            activeLayerId: id,
        };
    }),

    setLayers: (layers) => set(() => ({
        layers,
        activeLayerId: layers.length > 0 ? layers[layers.length - 1].id : null
    })),

    removeLayer: (id) => set((state) => {
        if (state.layers.length <= 1) return state;
        const newLayers = state.layers.filter(l => l.id !== id);
        const newActiveId = state.activeLayerId === id
            ? newLayers[newLayers.length - 1]?.id || null
            : state.activeLayerId;
        return { layers: newLayers, activeLayerId: newActiveId };
    }),

    setActiveLayer: (id) => set({ activeLayerId: id }),

    updateLayerImageData: (id, imageData) => set((state) => ({
        layers: state.layers.map(l =>
            l.id === id ? { ...l, imageData } : l
        ),
    })),

    toggleLayerVisibility: (id) => set((state) => ({
        layers: state.layers.map(l =>
            l.id === id ? { ...l, visible: !l.visible } : l
        ),
    })),

    setLayerOpacity: (id, opacity) => set((state) => ({
        layers: state.layers.map(l =>
            l.id === id ? { ...l, opacity: Math.max(0, Math.min(100, opacity)) } : l
        ),
    })),

    reorderLayers: (fromIndex, toIndex) => set((state) => {
        const newLayers = [...state.layers];
        const [removed] = newLayers.splice(fromIndex, 1);
        newLayers.splice(toIndex, 0, removed);
        return { layers: newLayers };
    }),

    mergeDown: (_id) => set((state) => {
        const index = state.layers.findIndex(l => l.id === _id);
        if (index <= 0) return state;
        // Merge logic would be implemented with canvas operations
        return state;
    }),

    flattenLayers: () => set((state) => {
        if (state.layers.length <= 1) return state;
        // Flatten logic would be implemented with canvas operations
        return state;
    }),

    // Selection actions
    setSelection: (selection) => set((state) => ({
        selection: { ...state.selection, ...selection, active: true },
    })),

    setFloatingSelection: (selection) => set({ floatingSelection: selection }),

    moveSelection: (dx, dy) => set((state) => {
        if (!state.floatingSelection) return state;
        return {
            floatingSelection: {
                ...state.floatingSelection,
                x: state.floatingSelection.x + dx,
                y: state.floatingSelection.y + dy,
            }
        };
    }),

    rotateSelection: () => set((state) => {
        if (!state.floatingSelection) return state;

        const { width, height, imageData } = state.floatingSelection;

        // Create temporary canvas to rotate
        const canvas = document.createElement('canvas');
        canvas.width = height; // Swapped for 90deg rotation
        canvas.height = width;
        const ctx = canvas.getContext('2d');
        if (!ctx) return state;

        // Put original data on a temp canvas to draw it rotated
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return state;
        tempCtx.putImageData(imageData, 0, 0);

        // Rotate 90 degrees clockwise
        ctx.translate(height, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(tempCanvas, 0, 0);

        return {
            floatingSelection: {
                ...state.floatingSelection,
                width: height,
                height: width,
                imageData: ctx.getImageData(0, 0, height, width)
            }
        };
    }),

    applySelection: () => set((state) => {
        if (!state.floatingSelection || !state.activeLayerId) return { floatingSelection: null, selection: { active: false, x: 0, y: 0, width: 0, height: 0 } };

        // This action just clears the floating selection state.
        // The actual merging needs to happen in the component or via a more complex thunk,
        // but for now we'll rely on the component to commit the changes to the layer
        // BEFORE calling this, OR we implement layer merging here if we move canvas logic to store (which is hard with ImageData).
        // For this refactor, we will assume the component handles the "commit" to canvas
        // and then calls this to clear state.

        return {
            floatingSelection: null,
            selection: { active: false, x: 0, y: 0, width: 0, height: 0 }
        };
    }),

    deleteSelection: () => set((_state) => ({
        floatingSelection: null,
        selection: { active: false, x: 0, y: 0, width: 0, height: 0 }
    })),

    clearSelection: () => set((_state) => {
        // If we have a floating selection, we should probably commit it?
        // For now, let's just clear it.
        return {
            selection: { active: false, x: 0, y: 0, width: 0, height: 0 },
            floatingSelection: null
        };
    }),

    copySelection: () => {
        // Copy logic with canvas operations
    },

    pasteSelection: () => {
        // Paste logic with canvas operations
    },

    cutSelection: () => {
        get().copySelection();
        // Clear selected area
    },

    // History actions
    pushHistory: (layerId, imageData) => set((state) => {
        const newEntry: HistoryEntry = {
            layerId,
            imageData,
            timestamp: Date.now(),
        };

        // Truncate future history if we're not at the end
        const truncatedHistory = state.history.slice(0, state.historyIndex + 1);
        const newHistory = [...truncatedHistory, newEntry].slice(-state.maxHistory);

        return {
            history: newHistory,
            historyIndex: newHistory.length - 1,
        };
    }),

    applyOutline: () => {
        const state = get();
        if (!state.activeLayerId) return;
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (!layer || !layer.imageData) return;

        const width = state.canvasWidth;
        const height = state.canvasHeight;
        const data = layer.imageData.data;
        // Clone data
        const newArray = new Uint8ClampedArray(data);
        const { r, g, b, a } = state.foregroundColor;

        const getAlpha = (x: number, y: number) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return 0;
            return data[(y * width + x) * 4 + 3];
        };

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const currentAlpha = data[idx + 3];

                if (currentAlpha === 0) {
                    // Check 4-way neighbors
                    if (getAlpha(x + 1, y) > 0 || getAlpha(x - 1, y) > 0 ||
                        getAlpha(x, y + 1) > 0 || getAlpha(x, y - 1) > 0) {

                        newArray[idx] = r;
                        newArray[idx + 1] = g;
                        newArray[idx + 2] = b;
                        newArray[idx + 3] = a;
                    }
                }
            }
        }

        const newImageData = new ImageData(newArray, width, height);

        // Update active layer & push history
        state.updateLayerImageData(state.activeLayerId, newImageData);
        state.pushHistory(state.activeLayerId, newImageData);
    },

    removeBackground: () => {
        const state = get();
        if (!state.activeLayerId) return;
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (!layer || !layer.imageData) return;

        const width = state.canvasWidth;
        const height = state.canvasHeight;
        const data = layer.imageData.data;
        const newArray = new Uint8ClampedArray(data);

        // Get corner colors to guess BG
        const corners = [
            { r: data[0], g: data[1], b: data[2], a: data[3] },
            { r: data[(width - 1) * 4], g: data[(width - 1) * 4 + 1], b: data[(width - 1) * 4 + 2], a: data[(width - 1) * 4 + 3] },
            { r: data[(height - 1) * width * 4], g: data[(height - 1) * width * 4 + 1], b: data[(height - 1) * width * 4 + 2], a: data[(height - 1) * width * 4 + 3] },
            { r: data[((height - 1) * width + width - 1) * 4], g: data[((height - 1) * width + width - 1) * 4 + 1], b: data[((height - 1) * width + width - 1) * 4 + 2], a: data[((height - 1) * width + width - 1) * 4 + 3] }
        ];

        // Find most common corner color
        const colorCounts = new Map<string, number>();
        let maxCount = 0;
        let bgKey = "";

        corners.forEach(c => {
            const key = `${c.r},${c.g},${c.b},${c.a}`;
            const count = (colorCounts.get(key) || 0) + 1;
            colorCounts.set(key, count);
            if (count > maxCount) {
                maxCount = count;
                bgKey = key;
            }
        });

        if (!bgKey) return;

        const [br, bg, bb, ba] = bgKey.split(',').map(Number);

        // Replace matching pixels with transparent
        for (let i = 0; i < newArray.length; i += 4) {
            // Exact match for pixel art
            if (newArray[i] === br && newArray[i + 1] === bg && newArray[i + 2] === bb && newArray[i + 3] === ba) {
                newArray[i + 3] = 0;
            }
        }

        const newImageData = new ImageData(newArray, width, height);

        state.updateLayerImageData(state.activeLayerId, newImageData);
        state.pushHistory(state.activeLayerId, newImageData);
    },

    // History (undo/redo)
    undo: () => set((state) => {
        if (state.historyIndex < 0) return state;


        // Restore layer data from history
        // Note: This logic assumes we want to go back to the state *before* this entry?
        // Actually, usually history[index] is the state *result* of an action.
        // So undoing means going back to index - 1.

        const newIndex = state.historyIndex - 1;
        let layers = state.layers;

        if (newIndex >= 0) {
            // In a real localized undo system, we'd need to track which layer was changed.
            // Our HistoryEntry has layerId.

            // If we undo 'entry', we basically want to revert to the state before 'entry'.
            // If 'entry' modified layer X, we want to find the previous history entry for layer X.
            // If there is no previous entry for X, it was empty/initial.

            // Simplified approach for this codebase:
            // Or we need initial state. 
            // For now, let's assume if no history, we might just clear it or keep it?
            // Actually, the pushed history is the *result*. 
            // So if we are at index 5, and we undo, we want to see the result of index 4.
            // But index 5 might be layer A, and index 4 might be layer B.
            // So we need to reconstruct the state of ALL layers based on history up to index 4?
            // Yes, or simpler: just revert the specific layer change.

            // Let's implement specific layer revert:
            // The entry we are undoing is `state.history[state.historyIndex]`.
            // We need to revert its layer to what it was before.
            // What it was before is the `imageData` of the *previous* entry for that same layerId.

            const undoEntry = state.history[state.historyIndex];
            let prevLayerData: ImageData | null = null;

            for (let i = state.historyIndex - 1; i >= 0; i--) {
                if (state.history[i].layerId === undoEntry.layerId) {
                    prevLayerData = state.history[i].imageData;
                    break;
                }
            }

            // If null, it means it was empty before this action? Or initial state.
            // We'll trust null means clear/initial.

            layers = state.layers.map(l =>
                l.id === undoEntry.layerId ? { ...l, imageData: prevLayerData } : l
            );
        } else {
            // Undo the very first action -> clear that layer?
            const undoEntry = state.history[0];
            layers = state.layers.map(l =>
                l.id === undoEntry.layerId ? { ...l, imageData: null } : l
            );
        }

        return { historyIndex: newIndex, layers };
    }),

    redo: () => set((state) => {
        if (state.historyIndex >= state.history.length - 1) return state;

        const newIndex = state.historyIndex + 1;
        const redoEntry = state.history[newIndex];

        const layers = state.layers.map(l =>
            l.id === redoEntry.layerId ? { ...l, imageData: redoEntry.imageData } : l
        );

        return { historyIndex: newIndex, layers };
    }),

    clearHistory: () => set({ history: [], historyIndex: -1 }),

    // Drawing actions
    startDrawing: (x, y) => set({
        isDrawing: true,
        lastPoint: { x, y },
    }),

    continueDrawing: (x, y) => set({
        lastPoint: { x, y },
    }),

    endDrawing: () => set({
        isDrawing: false,
        lastPoint: null,
    }),

    // Canvas actions
    setCanvasSize: (width, height) => set({
        canvasWidth: width,
        canvasHeight: height,
    }),

    clearCanvas: () => set((state) => ({
        layers: state.layers.map(l => ({ ...l, imageData: null })),
    })),

    toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

    toggleTiledPreview: () => set((state) => ({ tiledPreview: !state.tiledPreview })),

    setGridSize: (size) => set({ gridSize: size }),

    initializeCanvas: (width, height) => {
        set({
            canvasWidth: width,
            canvasHeight: height,
            layers: [],
            historyIndex: -1,
            // Re-calc symmetry center if needed or keep default
            symmetry: {
                ...get().symmetry,
                centerX: Math.floor(width / 2),
                centerY: Math.floor(height / 2)
            }
        });

        get().addLayer('Background');
    },
}));

// Export helper
export { colorToString, colorsEqual };
