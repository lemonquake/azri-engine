import { create } from 'zustand';
import { useHistoryStore } from './historyStore';
import type { Tile, TileId, ToolType, TileDefinition, Tilesheet, CharacterInstance, Layer, GridPos, AutoTileSet, SkyboxLayer, PhysicsSettings, ClipboardData, CollisionShape, LevelImage } from '../types';
import { DEFAULT_TILES, gridKey, DEFAULT_LAYER_ID, generateTileId, DEFAULT_PHYSICS } from '../types';
import { updateAutoTiles, getNeighborPositions } from '../utils/autotile';

interface EditorState {
    // Level Data
    levelId: string | null;
    levelName: string;
    setLevelName: (name: string) => void;

    // Global Settings
    physicsSettings: PhysicsSettings;
    setPhysicsSettings: (settings: Partial<PhysicsSettings>) => void;

    loadLevel: (data: { id: string, name: string, tiles: Tile[], characters: CharacterInstance[], layers?: Layer[], skyboxLayers?: SkyboxLayer[], levelImages?: LevelImage[], physics?: PhysicsSettings, collisionShapes?: CollisionShape[], importedTilesheets?: Tilesheet[], availableTiles?: TileDefinition[] }) => void;
    saveLevel: () => Promise<void>;
    createNewLevel: () => void;

    // Active tool
    activeTool: ToolType;
    setActiveTool: (tool: ToolType) => void;

    // Selected tile type for painting
    selectedTileType: TileDefinition;
    setSelectedTileType: (tile: TileDefinition) => void;
    availableTiles: TileDefinition[];
    autoTileSets: Record<string, AutoTileSet>;

    // Imported Tilesheets
    importedTilesheets: Tilesheet[];
    addTilesheet: (sheet: Tilesheet, tiles?: TileDefinition[]) => void;
    removeTilesheet: (id: string) => void;
    addTileDefinition: (tile: TileDefinition) => void;

    // Grid settings
    gridSize: number; // Cell size in pixels
    setGridSize: (size: number) => void;
    showGrid: boolean;
    toggleGrid: () => void;

    // Tiles on canvas (key: "x,y")
    tiles: Map<string, Tile>;
    setTiles: (tiles: Map<string, Tile>) => void;
    placeTile: (tile: Tile) => void;
    placeTiles: (tiles: Tile[]) => void;
    removeTile: (key: string) => void;
    removeTiles: (keys: string[]) => void;
    updateTile: (id: TileId, changes: Partial<Tile>) => void;
    updateTiles: (updates: { id: TileId; changes: Partial<Tile> }[]) => void;
    getTileAt: (x: number, y: number) => Tile | undefined;
    clearAllTiles: () => void;

    // Characters
    characters: Map<string, CharacterInstance>;
    setCharacters: (chars: Map<string, CharacterInstance>) => void;
    placeCharacter: (char: CharacterInstance) => void;
    removeCharacter: (id: string) => void;
    removeCharacters: (ids: string[]) => void;
    updateCharacterInstance: (id: string, changes: Partial<CharacterInstance>) => void;
    activeCharacterId: string | null; // ID of character prototype to place
    setActiveCharacterId: (id: string | null) => void;
    // Selection for characters
    selectedCharacterIds: Set<string>;
    selectCharacter: (id: string, addToSelection?: boolean) => void;
    selectCharacters: (ids: string[]) => void;

    // Layers
    // Layers
    layers: Layer[];
    activeLayerId: string;
    selectedLayerIds: Set<string>;
    addLayer: (name: string) => void;
    removeLayer: (id: string) => void;
    setActiveLayer: (id: string) => void;
    toggleLayerSelection: (id: string) => void;
    selectLayerRange: (startId: string, endId: string) => void;
    toggleLayerVisibility: (id: string) => void;
    toggleLayerLock: (id: string) => void;
    reorderLayers: (fromIndex: number, toIndex: number) => void;
    duplicateLayer: (id: string) => void;
    mergeLayerDown: (id: string) => void;
    setLayerOpacity: (id: string, opacity: number) => void;
    selectAllOnLayer: (id: string) => void;
    selectAllTilesOnLayer: (id: string) => void;
    selectAllCollisionsOnLayer: (id: string) => void;
    selectSkyOnLayer: (id: string) => void;

    // Skybox
    skyboxLayers: SkyboxLayer[];
    addSkyboxLayer: (type?: SkyboxLayer['type']) => void;
    removeSkyboxLayer: (id: string) => void;
    updateSkyboxLayer: (id: string, changes: Partial<SkyboxLayer>) => void;
    reorderSkyboxLayers: (fromIndex: number, toIndex: number) => void;

    // Selection
    selectedTileIds: Set<TileId>;
    selectTile: (id: TileId, addToSelection?: boolean) => void;
    deselectTile: (id: TileId) => void;
    clearSelection: () => void;
    selectTiles: (ids: TileId[]) => void;
    getSelectedTiles: () => Tile[];

    // Drag state for tools
    isDragging: boolean;
    setIsDragging: (dragging: boolean) => void;
    dragStart: { x: number; y: number } | null;
    setDragStart: (pos: { x: number; y: number } | null) => void;

    // Hover position for preview
    hoverPos: { x: number; y: number } | null;
    setHoverPos: (pos: { x: number; y: number } | null) => void;

    // Level Editor Tools
    brushSize: number;
    setBrushSize: (size: number) => void;

    // View Settings
    showCollisions: boolean;
    toggleCollisions: () => void; // Renamed for consistency

    symmetry: {
        enabled: boolean;
        axis: 'x' | 'y' | 'both';
        center: { x: number; y: number } | null; // If null, active canvas center
    };
    setSymmetry: (settings: Partial<EditorState['symmetry']>) => void;

    toolSettings: {
        shapeMode: 'outline' | 'fill'; // For rect/circle
        fillColor?: string; // If different from active tile color? Usually uses active tile.
    };
    setToolSettings: (settings: Partial<EditorState['toolSettings']>) => void;

    // UI State
    showCharacterPicker: boolean;
    setShowCharacterPicker: (show: boolean) => void;

    // Play Mode
    isPlaying: boolean;
    togglePlayMode: () => void;

    // Spawn Tool State
    pendingSpawnPos: { x: number; y: number } | null;
    setPendingSpawnPos: (pos: { x: number; y: number } | null) => void;
    // Clipboard
    clipboard: ClipboardData | null;
    pasteMirror: { x: boolean; y: boolean };
    setPasteMirror: (mirror: { x: boolean; y: boolean }) => void;
    copySelection: () => void;
    pasteClipboard: (pos: GridPos, mirrorX?: boolean, mirrorY?: boolean) => void;

    // Move Selection
    selectionOffset: { x: number, y: number } | null;
    setSelectionOffset: (offset: { x: number, y: number } | null) => void;
    moveSelectedTiles: (delta: { x: number, y: number }) => void;
    moveSelection: (deltaX: number, deltaY: number) => void;
    moveSelectedCharacters: (gridDx: number, gridDy: number) => void;

    pushHistoryState: () => void;









    // Multiselect Rendering State
    multiSelectRect: { start: GridPos; end: GridPos } | null;
    setMultiSelectRect: (rect: { start: GridPos; end: GridPos } | null) => void;

    // Symmetry Placement State
    isPlacingSymmetry: boolean;
    setIsPlacingSymmetry: (isPlacing: boolean) => void;

    // Layer Highlighting
    highlightActiveLayer: boolean;
    toggleHighlightActiveLayer: () => void;

    // Collision Shapes
    collisionShapes: Map<string, CollisionShape>;
    selectedCollisionIds: Set<string>;
    collisionToolMode: 'box' | 'smooth' | 'brush' | 'fill';
    smoothShapeType: 'circle' | 'polygon';
    collisionBrushSize: number;
    setCollisionToolMode: (mode: 'box' | 'smooth' | 'brush' | 'fill') => void;
    setCollisionBrushSize: (size: number) => void;
    setSmoothShapeType: (type: 'circle' | 'polygon') => void;
    addCollisionShape: (shape: CollisionShape) => void;
    removeCollisionShape: (id: string) => void;
    removeCollisionShapes: (ids: string[]) => void;
    updateCollisionShape: (id: string, changes: Partial<CollisionShape>) => void;
    selectCollisionShape: (id: string, addToSelection?: boolean) => void;
    selectCollisionShapes: (ids: string[]) => void;
    clearCollisionSelection: () => void;

    // Move collision shapes
    moveSelectedCollisionShapes: (deltaX: number, deltaY: number) => void;

    // Level Images (Props)
    levelImages: LevelImage[];
    selectedImageIds: Set<string>;
    addLevelImage: (image: LevelImage) => void;
    updateLevelImage: (id: string, changes: Partial<LevelImage>) => void;
    removeLevelImage: (id: string) => void;
    removeLevelImages: (ids: string[]) => void;
    selectImage: (id: string, addToSelection?: boolean) => void;
    selectImages: (ids: string[]) => void;
    clearImageSelection: () => void;
    moveSelectedImages: (deltaX: number, deltaY: number) => void;
    duplicateSelectedImages: () => void;
    // Z-Index
    bringToFront: () => void;
    sendToBack: () => void;
    stepForward: () => void;
    stepBackward: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    // Level Data
    levelId: null,
    levelName: 'Untitled',
    setLevelName: (name) => set({ levelName: name }),

    // Physics
    physicsSettings: DEFAULT_PHYSICS,
    setPhysicsSettings: (settings) => set((state) => ({
        physicsSettings: { ...state.physicsSettings, ...settings }
    })),

    loadLevel: (data) => {
        // Ensure there's at least one layer if none exist in save data
        const layers = data.layers && data.layers.length > 0 ? data.layers : [
            { id: DEFAULT_LAYER_ID, name: 'Default Layer', visible: true, locked: false, opacity: 1, order: 0 }
        ];

        set({
            levelId: data.id,
            levelName: data.name,
            layers: layers,
            activeLayerId: layers[0].id,
            selectedLayerIds: new Set([layers[0].id]),
            skyboxLayers: data.skyboxLayers || [],
            tiles: new Map(data.tiles.map(t => [gridKey(t.gridX, t.gridY, t.layerId || layers[0].id), { ...t, layerId: t.layerId || layers[0].id }])),
            characters: new Map(data.characters.map(c => [c.id, { ...c, layerId: c.layerId || layers[0].id }])),
            levelImages: data.levelImages || [],
            physicsSettings: data.physics ? { ...DEFAULT_PHYSICS, ...data.physics } : DEFAULT_PHYSICS,
            collisionShapes: new Map((data.collisionShapes || []).map(s => [s.id, s])),
            selectedCollisionIds: new Set(),
            selectedImageIds: new Set(),
            importedTilesheets: data.importedTilesheets || [],
            availableTiles: data.availableTiles && data.availableTiles.length > 0 ? data.availableTiles : DEFAULT_TILES,
        });
        useHistoryStore.getState().clearHistory();
    },
    saveLevel: async () => {
        const state = get();
        // If no ID, generate one (for new saves)
        const id = state.levelId || `level_${Date.now()}`;

        // Prepare data
        const tilesData = JSON.stringify(Array.from(state.tiles.values()));
        const charsData = JSON.stringify(Array.from(state.characters.values()));
        const layersData = JSON.stringify(state.layers);
        const skyboxData = JSON.stringify(state.skyboxLayers);
        const collisionData = JSON.stringify(Array.from(state.collisionShapes.values()));
        const levelImagesData = JSON.stringify(state.levelImages);
        const physicsData = JSON.stringify(state.physicsSettings);
        const tilesheetsData = JSON.stringify(state.importedTilesheets);

        // Filter out default tiles to save space, only save custom ones
        const defaultTileIds = new Set(DEFAULT_TILES.map(t => t.id));
        const customTiles = state.availableTiles.filter(t => !defaultTileIds.has(t.id));
        const tileDefsData = JSON.stringify(customTiles);

        const levelData = {
            id,
            name: state.levelName,
            width: 0, // Todo: calculate bounds?
            height: 0,
            tiles_data: tilesData,
            characters_data: charsData,
            layers_data: layersData,
            skybox_data: skyboxData,
            collision_data: collisionData,
            level_images_data: levelImagesData,
            physics_data: physicsData,
            tilesheets_data: tilesheetsData,
            tile_defs_data: tileDefsData,
        };

        const { default: levelRepo } = await import('../db/repositories/LevelRepository');

        // Check if exists to decide update vs create
        const existing = levelRepo.getById(id);
        if (existing) {
            levelRepo.update(id, levelData);
        } else {
            levelRepo.create(levelData);
        }

        set({ levelId: id });
        console.log("Level saved:", id);
    },
    createNewLevel: () => {
        const defaultLayer = { id: DEFAULT_LAYER_ID, name: 'Default Layer', visible: true, locked: false, opacity: 1, order: 0 };
        set({
            levelId: null,
            levelName: 'Untitled',
            layers: [defaultLayer],
            activeLayerId: defaultLayer.id,
            selectedLayerIds: new Set([defaultLayer.id]),
            skyboxLayers: [],
            tiles: new Map(),
            characters: new Map(),
            collisionShapes: new Map(),
            selectedCollisionIds: new Set(),
            physicsSettings: DEFAULT_PHYSICS,
        });
        useHistoryStore.getState().clearHistory();
    },

    // Active tool
    activeTool: 'brush',
    setActiveTool: (tool) => set(() => {
        if (tool === 'brush') {
            return {
                activeTool: tool,
                selectedTileIds: new Set(),
                selectedCharacterIds: new Set(),
                selectedImageIds: new Set(),
                selectedCollisionIds: new Set()
            };
        }
        return { activeTool: tool };
    }),

    // Tile type selection
    selectedTileType: DEFAULT_TILES[0],
    setSelectedTileType: (tile) => set({ selectedTileType: tile }),
    availableTiles: DEFAULT_TILES,
    autoTileSets: {
        'debug_set': {
            id: 'debug_set',
            name: 'Debug Wall Set',
            baseSpriteId: 'debug_wall',
            type: '47-tile',
            rules: {
                // Bitmask values: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128
                1: 'debug_wall_n',
                4: 'debug_wall_e',
                16: 'debug_wall_s',
                64: 'debug_wall_w',
                // Combinations (just mapping to single dir for visual check if mask matches exactly)
            }
        }
    },

    // Imported Tilesheets
    importedTilesheets: [],
    addTilesheet: (sheet, tiles) => set((state) => ({
        importedTilesheets: [...state.importedTilesheets, sheet],
        availableTiles: tiles
            ? [...state.availableTiles, ...tiles.filter(t => !state.availableTiles.some(at => at.id === t.id))]
            : state.availableTiles
    })),
    removeTilesheet: (id) => set((state) => ({
        importedTilesheets: state.importedTilesheets.filter(s => s.id !== id),
        availableTiles: state.availableTiles.filter(t => t.tilesheetId !== id)
    })),
    addTileDefinition: (tile) => set((state) => ({
        availableTiles: [...state.availableTiles, tile]
    })),

    // Layers
    layers: [{ id: DEFAULT_LAYER_ID, name: 'Default Layer', visible: true, locked: false, opacity: 1, order: 0 }],
    activeLayerId: DEFAULT_LAYER_ID,
    selectedLayerIds: new Set([DEFAULT_LAYER_ID]),

    addLayer: (name) => {
        get().pushHistoryState();
        set((state) => {
            const newLayer: Layer = {
                id: `layer_${Date.now()}`,
                name,
                visible: true,
                locked: false,
                opacity: 1,
                order: state.layers.length, // Put at end (top)
            };
            return {
                layers: [...state.layers, newLayer],
                activeLayerId: newLayer.id,
                selectedLayerIds: new Set([newLayer.id]),
            };
        });
    },

    removeLayer: (id) => {
        get().pushHistoryState();
        set((state) => {
            if (state.layers.length <= 1) return state; // Don't remove last layer
            const newLayers = state.layers.filter(l => l.id !== id);

            // Also remove tiles on this layer
            const newTiles = new Map(state.tiles);
            for (const [key, tile] of newTiles) {
                if (tile.layerId === id) {
                    newTiles.delete(key);
                }
            }

            // Remove characters
            const newCharacters = new Map(state.characters);
            for (const [key, char] of newCharacters) {
                if (char.layerId === id) {
                    newCharacters.delete(key);
                }
            }

            // Remove collision shapes
            const newCollisionShapes = new Map(state.collisionShapes);
            for (const [key, shape] of newCollisionShapes) {
                if (shape.layerId === id) {
                    newCollisionShapes.delete(key);
                }
            }

            // Remove level images
            const newLevelImages = state.levelImages.filter(img => img.layerId !== id);

            const newActiveLayerId = state.activeLayerId === id ? newLayers[newLayers.length - 1].id : state.activeLayerId;
            const newSelectedLayerIds = new Set(state.selectedLayerIds);
            newSelectedLayerIds.delete(id);
            if (newSelectedLayerIds.size === 0) {
                newSelectedLayerIds.add(newActiveLayerId);
            }

            return {
                layers: newLayers,
                tiles: newTiles,
                characters: newCharacters,
                collisionShapes: newCollisionShapes,
                levelImages: newLevelImages,
                activeLayerId: newActiveLayerId,
                selectedLayerIds: newSelectedLayerIds
            };
        });
    },

    reorderLayers: (fromIndex, toIndex) => {
        get().pushHistoryState();
        set((state) => {
            const newLayers = [...state.layers];
            const [moved] = newLayers.splice(fromIndex, 1);
            newLayers.splice(toIndex, 0, moved);
            // Update order property
            return {
                layers: newLayers.map((l, i) => ({ ...l, order: i }))
            };
        });
    },

    duplicateLayer: (id) => {
        get().pushHistoryState();
        set((state) => {
            const layerToDup = state.layers.find(l => l.id === id);
            if (!layerToDup) return {};

            const newId = `layer_${Date.now()}`;
            const newLayer: Layer = {
                ...layerToDup,
                id: newId,
                name: `${layerToDup.name} (Copy)`,
                order: state.layers.length
            };

            // Duplicate Tiles
            const newTiles = new Map(state.tiles);
            state.tiles.forEach((tile) => {
                if (tile.layerId === id) {
                    const newTile = { ...tile, id: generateTileId(), layerId: newId };
                    newTiles.set(gridKey(newTile.gridX, newTile.gridY, newId), newTile);
                }
            });

            // Duplicate Characters
            const newChars = new Map(state.characters);
            state.characters.forEach((char) => {
                if (char.layerId === id) {
                    const newChar = { ...char, id: `char_inst_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, layerId: newId };
                    newChars.set(newChar.id, newChar);
                }
            });

            // Duplicate Collision Shapes
            const newShapes = new Map(state.collisionShapes);
            state.collisionShapes.forEach((shape) => {
                if (shape.layerId === id) {
                    const newShape = { ...shape, id: `col_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, layerId: newId };
                    newShapes.set(newShape.id, newShape);
                }
            });

            return {
                layers: [...state.layers, newLayer],
                tiles: newTiles,
                characters: newChars,
                collisionShapes: newShapes,
                activeLayerId: newId,
                selectedLayerIds: new Set([newId])
            };
        });
    },

    mergeLayerDown: (id) => {
        get().pushHistoryState();
        set((state) => {
            const index = state.layers.findIndex(l => l.id === id);
            if (index <= 0) return {}; // Cannot merge bottom layer

            const targetLayer = state.layers[index - 1]; // Layer below
            const targetId = targetLayer.id;

            // Merge Tiles
            const newTiles = new Map(state.tiles);
            // We need to move tiles from source (id) to target (targetId)
            // Conflict resolution: Top layer (source) overwrites bottom (target)
            state.tiles.forEach((tile, key) => {
                if (tile.layerId === id) {
                    // Remove from old key
                    newTiles.delete(key);
                    // Create new key
                    const newKey = gridKey(tile.gridX, tile.gridY, targetId);
                    // Set to map (overwriting if exists)
                    newTiles.set(newKey, { ...tile, layerId: targetId });
                }
            });

            // Merge Characters
            const newChars = new Map(state.characters);
            state.characters.forEach((char) => {
                if (char.layerId === id) {
                    newChars.set(char.id, { ...char, layerId: targetId });
                }
            });

            // Merge Collision Shapes
            const newShapes = new Map(state.collisionShapes);
            state.collisionShapes.forEach((shape) => {
                if (shape.layerId === id) {
                    newShapes.set(shape.id, { ...shape, layerId: targetId });
                }
            });

            const newLayers = state.layers.filter(l => l.id !== id);

            return {
                layers: newLayers,
                tiles: newTiles,
                characters: newChars,
                collisionShapes: newShapes,
                activeLayerId: targetId,
                selectedLayerIds: new Set([targetId])
            };
        });
    },

    setLayerOpacity: (id, opacity) => set((state) => ({
        layers: state.layers.map(l => l.id === id ? { ...l, opacity } : l)
    })),

    selectAllOnLayer: (id) => set((state) => {
        const newSelectedTiles = new Set<string>();
        state.tiles.forEach(t => {
            if (t.layerId === id) newSelectedTiles.add(t.id);
        });

        const newSelectedChars = new Set<string>();
        state.characters.forEach(c => {
            if (c.layerId === id) newSelectedChars.add(c.id);
        });

        const newSelectedShapes = new Set<string>();
        state.collisionShapes.forEach(s => {
            if (s.layerId === id) newSelectedShapes.add(s.id);
        });

        return {
            selectedTileIds: newSelectedTiles,
            selectedCharacterIds: newSelectedChars,
            selectedCollisionIds: newSelectedShapes,
            selectedImageIds: new Set(), // Images are global for now
            activeLayerId: id // Ensure active layer matches selection
        };
    }),

    selectAllTilesOnLayer: (id) => set((state) => {
        const newSelectedTiles = new Set<string>();
        state.tiles.forEach(t => {
            if (t.layerId === id) newSelectedTiles.add(t.id);
        });

        return {
            selectedTileIds: newSelectedTiles,
            selectedCharacterIds: new Set(),
            selectedCollisionIds: new Set(),
            selectedImageIds: new Set(),
            activeLayerId: id
        };
    }),

    selectAllCollisionsOnLayer: (id) => set((state) => {
        const newSelectedShapes = new Set<string>();
        state.collisionShapes.forEach(s => {
            if (s.layerId === id) newSelectedShapes.add(s.id);
        });

        return {
            selectedTileIds: new Set(),
            selectedCharacterIds: new Set(),
            selectedCollisionIds: newSelectedShapes,
            selectedImageIds: new Set(),
            activeLayerId: id
        };
    }),

    selectSkyOnLayer: (id) => set((state) => {
        const newSelectedTiles = new Set<string>();
        state.tiles.forEach(t => {
            if (t.layerId === id && t.spriteId.toLowerCase().includes('sky')) {
                newSelectedTiles.add(t.id);
            }
        });

        return {
            selectedTileIds: newSelectedTiles,
            selectedCharacterIds: new Set(),
            selectedCollisionIds: new Set(),
            selectedImageIds: new Set(),
            activeLayerId: id,
            selectedLayerIds: new Set([id])
        };
    }),

    setActiveLayer: (id) => set({ activeLayerId: id, selectedLayerIds: new Set([id]), selectedTileIds: new Set(), selectedCharacterIds: new Set() }),

    toggleLayerSelection: (id) => set((state) => {
        const newSelected = new Set(state.selectedLayerIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
            if (newSelected.size === 0) newSelected.add(state.activeLayerId);
        } else {
            newSelected.add(id);
        }
        return { selectedLayerIds: newSelected, activeLayerId: id }; // optionally set activeLayerId to the most recently clicked
    }),

    selectLayerRange: (startId, endId) => set((state) => {
        const startIndex = state.layers.findIndex(l => l.id === startId);
        const endIndex = state.layers.findIndex(l => l.id === endId);
        if (startIndex === -1 || endIndex === -1) return state;

        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);

        const newSelected = new Set(state.selectedLayerIds);
        for (let i = minIndex; i <= maxIndex; i++) {
            newSelected.add(state.layers[i].id);
        }
        return { selectedLayerIds: newSelected, activeLayerId: endId };
    }),

    toggleLayerVisibility: (id) => set((state) => ({
        layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    })),

    toggleLayerLock: (id) => set((state) => ({
        layers: state.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l)
    })),



    // Skybox
    skyboxLayers: [],
    addSkyboxLayer: (type = 'color') => {
        get().pushHistoryState();
        set((state) => {
            const newLayer: SkyboxLayer = {
                id: `skybox_${Date.now()}`,
                name: `Skybox Layer ${state.skyboxLayers.length + 1}`,
                visible: true,
                opacity: 1,
                type,
                value: type === 'color' ? '#87CEEB' : '', // Default sky blue
                offset: { x: 0, y: 0 },
                scale: { x: 1, y: 1 },
                parallax: { x: 0.5, y: 0.5 },
                velocity: { x: 0, y: 0 },
                repeat: 'repeat-x',
            };
            return { skyboxLayers: [...state.skyboxLayers, newLayer] };
        });
    },
    removeSkyboxLayer: (id) => {
        get().pushHistoryState();
        set((state) => ({
            skyboxLayers: state.skyboxLayers.filter(l => l.id !== id)
        }));
    },
    updateSkyboxLayer: (id, changes) => {
        get().pushHistoryState();
        set((state) => ({
            skyboxLayers: state.skyboxLayers.map(l => l.id === id ? { ...l, ...changes } : l)
        }));
    },
    reorderSkyboxLayers: (fromIndex, toIndex) => {
        get().pushHistoryState();
        set((state) => {
            const newLayers = [...state.skyboxLayers];
            const [moved] = newLayers.splice(fromIndex, 1);
            newLayers.splice(toIndex, 0, moved);
            return { skyboxLayers: newLayers };
        });
    },

    // Grid settings
    gridSize: 32,
    setGridSize: (size) => set({ gridSize: size }),
    showGrid: true,
    toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

    // Tiles on canvas (key: "x,y")
    tiles: new Map(),
    setTiles: (tiles) => set({ tiles: new Map(tiles) }),

    placeTile: (tile) => {
        get().placeTiles([tile]);
    },

    placeTiles: (tiles) => set((state) => {
        const newTiles = new Map(state.tiles);
        const positionsToCheck: { x: number, y: number, layerId: string }[] = [];

        tiles.forEach(tile => {
            // Apply active layer if not present
            const finalTile = { ...tile, layerId: state.activeLayerId };
            const key = gridKey(finalTile.gridX, finalTile.gridY, finalTile.layerId);
            newTiles.set(key, finalTile);
            positionsToCheck.push({ x: finalTile.gridX, y: finalTile.gridY, layerId: finalTile.layerId });
        });

        const tileDefsMap = new Map(state.availableTiles.map(d => [d.id, d]));
        const updatedTiles = updateAutoTiles(newTiles, tileDefsMap, state.autoTileSets, positionsToCheck);

        return { tiles: updatedTiles };
    }),

    removeTile: (key) => set((state) => {
        const newTiles = new Map(state.tiles);
        const tile = newTiles.get(key);
        if (!tile) return { tiles: newTiles };

        const positionsToCheck: { x: number, y: number, layerId: string }[] = [];
        // Add neighbors to check
        getNeighborPositions(tile.gridX, tile.gridY).forEach(n => {
            positionsToCheck.push({ x: n.x, y: n.y, layerId: tile.layerId });
        });

        newTiles.delete(key);

        const tileDefsMap = new Map(state.availableTiles.map(d => [d.id, d]));
        const updatedTiles = updateAutoTiles(newTiles, tileDefsMap, state.autoTileSets, positionsToCheck);

        return { tiles: updatedTiles };
    }),

    removeTiles: (keys) => set((state) => {
        const newTiles = new Map(state.tiles);
        const positionsToCheck: { x: number, y: number, layerId: string }[] = [];

        keys.forEach(key => {
            const tile = newTiles.get(key);
            if (tile) {
                getNeighborPositions(tile.gridX, tile.gridY).forEach(n => {
                    positionsToCheck.push({ x: n.x, y: n.y, layerId: tile.layerId });
                });
                newTiles.delete(key);
            }
        });

        const tileDefsMap = new Map(state.availableTiles.map(d => [d.id, d]));
        const updatedTiles = updateAutoTiles(newTiles, tileDefsMap, state.autoTileSets, positionsToCheck);

        return { tiles: updatedTiles };
    }),

    updateTile: (id, changes) => set((state) => {
        const newTiles = new Map(state.tiles);
        for (const [key, tile] of newTiles) {
            if (tile.id === id) {
                newTiles.set(key, { ...tile, ...changes });
                break;
            }
        }
        return { tiles: newTiles };
    }),

    updateTiles: (updates) => set((state) => {
        const newTiles = new Map(state.tiles);
        updates.forEach(({ id, changes }) => {
            for (const [key, tile] of newTiles) {
                if (tile.id === id) {
                    newTiles.set(key, { ...tile, ...changes });
                    break;
                }
            }
        });
        return { tiles: newTiles };
    }),

    // Level Images
    levelImages: [],
    selectedImageIds: new Set(),

    addLevelImage: (image) => {
        get().pushHistoryState();
        set((state) => ({
            levelImages: [...state.levelImages, image]
        }));
    },

    updateLevelImage: (id, changes) => {
        get().pushHistoryState();
        set((state) => ({
            levelImages: state.levelImages.map(img => img.id === id ? { ...img, ...changes } : img)
        }));
    },

    removeLevelImage: (id) => {
        get().pushHistoryState();
        set((state) => ({
            levelImages: state.levelImages.filter(img => img.id !== id),
            selectedImageIds: new Set([...state.selectedImageIds].filter(i => i !== id))
        }));
    },

    removeLevelImages: (ids) => {
        get().pushHistoryState();
        set((state) => ({
            levelImages: state.levelImages.filter(img => !ids.includes(img.id)),
            selectedImageIds: new Set([...state.selectedImageIds].filter(i => !ids.includes(i)))
        }));
    },

    selectImage: (id, addToSelection = false) => set((state) => {
        if (addToSelection) {
            const newSelection = new Set(state.selectedImageIds);
            if (newSelection.has(id)) {
                newSelection.delete(id);
            } else {
                newSelection.add(id);
            }
            return { selectedImageIds: newSelection };
        }
        return { selectedImageIds: new Set([id]), selectedTileIds: new Set(), selectedCharacterIds: new Set(), selectedCollisionIds: new Set() };
    }),

    selectImages: (ids) => set(() => ({
        selectedImageIds: new Set(ids),
        selectedTileIds: new Set(),
        selectedCharacterIds: new Set(),
        selectedCollisionIds: new Set()
    })),

    clearImageSelection: () => set({ selectedImageIds: new Set() }),

    moveSelectedImages: (deltaX, deltaY) => set((state) => ({
        levelImages: state.levelImages.map(img =>
            state.selectedImageIds.has(img.id)
                ? { ...img, x: img.x + deltaX, y: img.y + deltaY }
                : img
        )
    })),

    duplicateSelectedImages: () => {
        get().pushHistoryState();
        set((state) => {
            const newImages: LevelImage[] = [...state.levelImages];
            const newSelection = new Set<string>();

            state.levelImages.forEach(img => {
                if (state.selectedImageIds.has(img.id)) {
                    const newImg = {
                        ...img,
                        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        x: img.x + 20,
                        y: img.y + 20,
                        zIndex: (img.zIndex || 0) + 1
                    };
                    newImages.push(newImg);
                    newSelection.add(newImg.id);
                }
            });

            if (newSelection.size === 0) return {};

            return {
                levelImages: newImages,
                selectedImageIds: newSelection,
                selectedTileIds: new Set(),
                selectedCharacterIds: new Set(),
                selectedCollisionIds: new Set()
            };
        });
    },

    bringToFront: () => {
        get().pushHistoryState();
        set((state) => {
            const selected = state.levelImages.filter(img => state.selectedImageIds.has(img.id));
            const unselected = state.levelImages.filter(img => !state.selectedImageIds.has(img.id));
            return { levelImages: [...unselected, ...selected] };
        });
    },

    sendToBack: () => {
        get().pushHistoryState();
        set((state) => {
            const selected = state.levelImages.filter(img => state.selectedImageIds.has(img.id));
            const unselected = state.levelImages.filter(img => !state.selectedImageIds.has(img.id));
            return { levelImages: [...selected, ...unselected] };
        });
    },

    stepForward: () => {
        get().pushHistoryState();
        set((state) => {
            const newImages = [...state.levelImages];
            // Only works well for single selection or contiguous group, simplest logic:
            // Find highest index of selection, swap with next
            let changed = false;
            for (let i = newImages.length - 2; i >= 0; i--) {
                if (state.selectedImageIds.has(newImages[i].id) && !state.selectedImageIds.has(newImages[i + 1].id)) {
                    // Swap
                    const temp = newImages[i];
                    newImages[i] = newImages[i + 1];
                    newImages[i + 1] = temp;
                    changed = true;
                    // If we want to move the whole group together, we might need to be careful not to swap multiple times
                    // But iterating backwards helps move top-most first
                }
            }
            return changed ? { levelImages: newImages } : {};
        });
    },

    stepBackward: () => {
        get().pushHistoryState();
        set((state) => {
            const newImages = [...state.levelImages];
            let changed = false;
            for (let i = 1; i < newImages.length; i++) {
                if (state.selectedImageIds.has(newImages[i].id) && !state.selectedImageIds.has(newImages[i - 1].id)) {
                    // Swap
                    const temp = newImages[i];
                    newImages[i] = newImages[i - 1];
                    newImages[i - 1] = temp;
                    changed = true;
                }
            }
            return changed ? { levelImages: newImages } : {};
        });
    },

    getTileAt: (x, y) => {
        // This is tricky now - do we want tile at active layer or top-most visible?
        // Usually tools operate on the ACTIVE layer.
        const state = get();
        return state.tiles.get(gridKey(x, y, state.activeLayerId));
    },

    clearAllTiles: () => set({ tiles: new Map(), selectedTileIds: new Set() }),

    // Characters
    characters: new Map(),
    setCharacters: (chars) => set({ characters: new Map(chars) }),
    placeCharacter: (char) => set((state) => {
        const newChars = new Map(state.characters);
        // Ensure character has the active layer ID
        const finalChar = { ...char, layerId: state.activeLayerId };
        newChars.set(finalChar.id, finalChar);
        return { characters: newChars };
    }),
    removeCharacter: (id) => set((state) => {
        const newChars = new Map(state.characters);
        newChars.delete(id);
        return { characters: newChars };
    }),
    removeCharacters: (ids: string[]) => set((state) => {
        const newChars = new Map(state.characters);
        ids.forEach(id => newChars.delete(id));
        return { characters: newChars };
    }),
    updateCharacterInstance: (id, changes) => set((state) => {
        const newChars = new Map(state.characters);
        const char = newChars.get(id);
        if (char) {
            newChars.set(id, { ...char, ...changes });
        }
        return { characters: newChars };
    }),
    activeCharacterId: null,
    setActiveCharacterId: (id) => set({ activeCharacterId: id }),
    selectedCharacterIds: new Set(),
    selectCharacter: (id, addToSelection = false) => set((state) => {
        if (addToSelection) {
            const newSelection = new Set(state.selectedCharacterIds);
            if (newSelection.has(id)) {
                newSelection.delete(id);
            } else {
                newSelection.add(id);
            }
            return { selectedCharacterIds: newSelection };
        }
        return { selectedCharacterIds: new Set([id]), selectedTileIds: new Set() }; // Exclusive selection relative to tiles? Usually yes.
    }),
    selectCharacters: (ids: string[]) => set({ selectedCharacterIds: new Set(ids) }),

    // Selection
    selectedTileIds: new Set(),

    selectTile: (id, addToSelection = false) => set((state) => {
        if (addToSelection) {
            const newSelection = new Set(state.selectedTileIds);
            newSelection.add(id);
            return { selectedTileIds: newSelection };
        }
        return { selectedTileIds: new Set([id]) };
    }),

    deselectTile: (id) => set((state) => {
        const newSelection = new Set(state.selectedTileIds);
        newSelection.delete(id);
        return { selectedTileIds: newSelection };
    }),

    clearSelection: () => set({ selectedTileIds: new Set(), selectedCharacterIds: new Set() }),

    selectTiles: (ids) => set({ selectedTileIds: new Set(ids) }),

    getSelectedTiles: () => {
        const state = get();
        const selected: Tile[] = [];
        state.tiles.forEach(tile => {
            if (state.selectedTileIds.has(tile.id)) {
                selected.push(tile);
            }
        });
        return selected;
    },

    // Drag state
    isDragging: false,
    setIsDragging: (dragging) => set({ isDragging: dragging }),
    dragStart: null,
    setDragStart: (pos) => set({ dragStart: pos }),

    // Hover
    hoverPos: null,
    setHoverPos: (pos) => set({ hoverPos: pos }),

    // Level Editor Tools
    brushSize: 1,
    setBrushSize: (size) => set({ brushSize: size }),

    // View Settings
    showCollisions: false,
    toggleCollisions: () => set((state) => ({ showCollisions: !state.showCollisions })),

    symmetry: {
        enabled: false,
        axis: 'x',
        center: null,
    },
    setSymmetry: (settings) => set((state) => ({
        symmetry: { ...state.symmetry, ...settings }
    })),

    toolSettings: {
        shapeMode: 'outline',
    },
    setToolSettings: (settings) => set((state) => ({
        toolSettings: { ...state.toolSettings, ...settings }
    })),

    // UI State
    showCharacterPicker: false,
    setShowCharacterPicker: (show) => set({ showCharacterPicker: show }),

    // Play Mode
    isPlaying: false,
    togglePlayMode: () => set((state) => ({ isPlaying: !state.isPlaying })),

    // Spawn Tool State
    pendingSpawnPos: null,
    setPendingSpawnPos: (pos) => set({ pendingSpawnPos: pos }),

    // Clipboard
    clipboard: null,
    pasteMirror: { x: false, y: false },
    setPasteMirror: (mirror) => set({ pasteMirror: mirror }),

    copySelection: () => {
        const state = get();
        const selectedTiles = state.getSelectedTiles();

        const selectedCharacters: CharacterInstance[] = [];
        state.characters.forEach(c => {
            if (state.selectedCharacterIds.has(c.id)) {
                selectedCharacters.push(c);
            }
        });

        const selectedImages: LevelImage[] = [];
        state.levelImages.forEach(img => {
            if (state.selectedImageIds.has(img.id)) {
                selectedImages.push(img);
            }
        });

        if (selectedTiles.length === 0 && selectedCharacters.length === 0 && selectedImages.length === 0) return;

        // Calculate bounds
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        selectedTiles.forEach(t => {
            if (t.gridX < minX) minX = t.gridX;
            if (t.gridY < minY) minY = t.gridY;
            if (t.gridX > maxX) maxX = t.gridX;
            if (t.gridY > maxY) maxY = t.gridY;
        });

        selectedCharacters.forEach(c => {
            if (c.gridX < minX) minX = c.gridX;
            if (c.gridY < minY) minY = c.gridY;
            if (c.gridX > maxX) maxX = c.gridX;
            if (c.gridY > maxY) maxY = c.gridY;
        });

        // Images are in pixels, converting to grid approximation for bounds or just tracking separately?
        // Let's track pixels for images and grid for tiles.
        // Actually, to keep copy/paste relative consistent, we should normalize everything to a common origin.
        // If we have tiles, use tile grid origin. If only images, use top-left image.

        let originX = 0;
        let originY = 0;
        const gridSize = state.gridSize;

        if (selectedTiles.length > 0 || selectedCharacters.length > 0) {
            originX = minX * gridSize;
            originY = minY * gridSize;
        } else if (selectedImages.length > 0) {
            minX = Math.min(...selectedImages.map(i => i.x));
            minY = Math.min(...selectedImages.map(i => i.y));
            originX = minX;
            originY = minY;
        }

        const width = (maxX - minX) + 1; // Grid width (if tiles present)
        const height = (maxY - minY) + 1;

        // Store relative copies
        const clipboardTiles = selectedTiles.map(t => ({
            ...t,
            gridX: t.gridX - (originX / gridSize),
            gridY: t.gridY - (originY / gridSize),
        }));

        const clipboardChars = selectedCharacters.map(c => ({
            ...c,
            gridX: c.gridX - (originX / gridSize),
            gridY: c.gridY - (originY / gridSize),
        }));

        const clipboardImages = selectedImages.map(img => ({
            ...img,
            x: img.x - originX,
            y: img.y - originY,
        }));

        console.log('Copied', clipboardTiles.length, 'tiles,', clipboardChars.length, 'characters,', clipboardImages.length, 'images');

        set({
            clipboard: {
                tiles: clipboardTiles,
                characters: clipboardChars,
                levelImages: clipboardImages,
                width,
                height
            }
        });
    },

    pushHistoryState: () => {
        const state = get();
        useHistoryStore.getState().pushState(
            state.tiles,
            state.characters,
            state.layers,
            state.skyboxLayers,
            state.levelImages,
            state.collisionShapes,
            state.selectedTileIds,
            state.selectedCharacterIds,
            state.selectedLayerIds,
            state.selectedImageIds,
            state.selectedCollisionIds
        );
    },

    pasteClipboard: (pos, mirrorX = false, mirrorY = false) => set((state) => {
        if (!state.clipboard) return state;

        // Push state for undo
        state.pushHistoryState();

        const { width, height } = state.clipboard;
        const newTiles: Tile[] = [];
        const newSelectedTileIds: TileId[] = [];
        const newSelectedCharIds: string[] = [];
        const newChars = new Map(state.characters);

        // Paste Tiles
        state.clipboard.tiles.forEach(clipTile => {
            let relX = clipTile.gridX;
            let relY = clipTile.gridY;
            let scaleX = clipTile.scaleX;
            let scaleY = clipTile.scaleY;

            // Apply Mirroring
            if (mirrorX) {
                relX = width - 1 - relX;
                scaleX *= -1;
            }
            if (mirrorY) {
                relY = height - 1 - relY;
                scaleY *= -1;
            }

            const finalX = pos.x + relX;
            const finalY = pos.y + relY;

            const newTile: Tile = {
                ...clipTile,
                id: generateTileId(),
                gridX: finalX,
                gridY: finalY,
                scaleX: scaleX,
                scaleY: scaleY,
                layerId: state.activeLayerId,
            };

            newTiles.push(newTile);
            newSelectedTileIds.push(newTile.id);
        });

        // Paste Characters
        state.clipboard.characters.forEach(clipChar => {
            let relX = clipChar.gridX;
            let relY = clipChar.gridY;

            // Apply Mirroring
            if (mirrorX) {
                relX = width - 1 - relX;
                // Characters might need direction mirroring too? 
                // Currently characters are just points with IDs, maybe generic sprite scaling?
                // Let's assume no scale mirroring for characters unless they have scale props (which they don't in basic interface yet)
            }
            if (mirrorY) {
                relY = height - 1 - relY;
            }

            const finalX = pos.x + relX;
            const finalY = pos.y + relY;

            // Generate new ID
            const newId = `char_inst_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

            const newChar: CharacterInstance = {
                ...clipChar,
                id: newId,
                gridX: finalX,
                gridY: finalY,
                layerId: state.activeLayerId,
            };

            newChars.set(newId, newChar);
            newSelectedCharIds.push(newId);
            newSelectedCharIds.push(newId);
        });

        // Paste Level Images
        const { levelImages = [] } = state.clipboard; // access safely
        const newImages = [...state.levelImages];
        const newSelectedImageIds: string[] = [];

        levelImages.forEach(clipImg => {
            // For images, pos is grid pos, convert to pixels for offset
            const offsetX = pos.x * state.gridSize; // Target paste X (pixels)
            const offsetY = pos.y * state.gridSize; // Target paste Y (pixels)

            // TODO: Mirror logic for images? (Scale X -1)
            // For now just basic paste

            const newImg: LevelImage = {
                ...clipImg,
                id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                x: clipImg.x + offsetX,
                y: clipImg.y + offsetY,
            };

            newImages.push(newImg);
            newSelectedImageIds.push(newImg.id);
        });

        // Place tiles
        const updatedTiles = new Map(state.tiles);
        newTiles.forEach(t => {
            updatedTiles.set(gridKey(t.gridX, t.gridY, t.layerId), t);
        });

        return {
            tiles: updatedTiles,
            characters: newChars,
            levelImages: newImages,
            selectedTileIds: new Set(newSelectedTileIds),
            selectedCharacterIds: new Set(newSelectedCharIds),
            selectedImageIds: new Set(newSelectedImageIds)
        };
    }),

    // Move Selection
    selectionOffset: null,
    setSelectionOffset: (offset) => set({ selectionOffset: offset }),

    moveSelectedTiles: (delta) => set((state) => {
        if (delta.x === 0 && delta.y === 0) return state;

        // Push history
        state.pushHistoryState();

        const selectedIds = state.selectedTileIds;
        const tilesToMove: Tile[] = [];
        const otherTiles = new Map(state.tiles);

        // Separate moving tiles from rest
        const movingTileKeys: string[] = [];
        state.tiles.forEach((tile, key) => {
            if (selectedIds.has(tile.id)) {
                tilesToMove.push(tile);
                movingTileKeys.push(key);
            }
        });

        // Remove old positions
        movingTileKeys.forEach(k => otherTiles.delete(k));

        // Calculate new positions and Add
        tilesToMove.forEach(tile => {
            const newX = tile.gridX + delta.x;
            const newY = tile.gridY + delta.y;
            const newTile = { ...tile, gridX: newX, gridY: newY };
            const newKey = gridKey(newX, newY, tile.layerId);
            otherTiles.set(newKey, newTile);
        });

        return {
            tiles: otherTiles,
            selectionOffset: null
        };
    }),

    // Multiselect Rendering
    multiSelectRect: null,
    setMultiSelectRect: (rect) => set({ multiSelectRect: rect }),

    // Symmetry Placement State
    isPlacingSymmetry: false,
    setIsPlacingSymmetry: (isPlacing) => set({ isPlacingSymmetry: isPlacing }),

    // Layer Highlighting
    highlightActiveLayer: false,
    toggleHighlightActiveLayer: () => set((state) => ({ highlightActiveLayer: !state.highlightActiveLayer })),

    // Collision Shapes
    collisionShapes: new Map(),
    selectedCollisionIds: new Set(),
    collisionToolMode: 'box',
    smoothShapeType: 'circle',
    collisionBrushSize: 1,
    setCollisionToolMode: (mode) => set({ collisionToolMode: mode }),
    setCollisionBrushSize: (size) => set({ collisionBrushSize: size }),
    setSmoothShapeType: (type) => set({ smoothShapeType: type }),

    addCollisionShape: (shape) => set((state) => {
        const newShapes = new Map(state.collisionShapes);
        newShapes.set(shape.id, shape);
        return { collisionShapes: newShapes };
    }),

    removeCollisionShape: (id) => set((state) => {
        const newShapes = new Map(state.collisionShapes);
        newShapes.delete(id);
        const newSelected = new Set(state.selectedCollisionIds);
        newSelected.delete(id);
        return { collisionShapes: newShapes, selectedCollisionIds: newSelected };
    }),

    removeCollisionShapes: (ids) => set((state) => {
        const newShapes = new Map(state.collisionShapes);
        const newSelected = new Set(state.selectedCollisionIds);
        ids.forEach(id => {
            newShapes.delete(id);
            newSelected.delete(id);
        });
        return { collisionShapes: newShapes, selectedCollisionIds: newSelected };
    }),

    updateCollisionShape: (id, changes) => set((state) => {
        const newShapes = new Map(state.collisionShapes);
        const existing = newShapes.get(id);
        if (existing) {
            newShapes.set(id, { ...existing, ...changes });
        }
        return { collisionShapes: newShapes };
    }),

    selectCollisionShape: (id, addToSelection = false) => set((state) => {
        if (addToSelection) {
            const newSelection = new Set(state.selectedCollisionIds);
            if (newSelection.has(id)) newSelection.delete(id);
            else newSelection.add(id);
            return { selectedCollisionIds: newSelection };
        }
        return { selectedCollisionIds: new Set([id]), selectedTileIds: new Set(), selectedCharacterIds: new Set() };
    }),

    selectCollisionShapes: (ids) => set({ selectedCollisionIds: new Set(ids) }),

    clearCollisionSelection: () => set({ selectedCollisionIds: new Set() }),

    moveSelectedCollisionShapes: (deltaX, deltaY) => set((state) => {
        if (deltaX === 0 && deltaY === 0) return state;
        const newShapes = new Map(state.collisionShapes);
        state.selectedCollisionIds.forEach(id => {
            const shape = newShapes.get(id);
            if (shape) {
                newShapes.set(id, { ...shape, x: shape.x + deltaX, y: shape.y + deltaY });
            }
        });
        return { collisionShapes: newShapes };
    }),

    moveSelectedCharacters: (gridDx, gridDy) => set((state) => {
        if (gridDx === 0 && gridDy === 0) return state;
        const newChars = new Map(state.characters);
        state.selectedCharacterIds.forEach(id => {
            const char = newChars.get(id);
            if (char) {
                newChars.set(id, { ...char, gridX: char.gridX + gridDx, gridY: char.gridY + gridDy });
            }
        });
        return { characters: newChars };
    }),

    moveSelection: (deltaX, deltaY) => set((state) => {
        // Move Tiles
        const newTiles = new Map(state.tiles);
        const gridDx = Math.round(deltaX / state.gridSize);
        const gridDy = Math.round(deltaY / state.gridSize);

        // Move Characters
        const newChars = new Map(state.characters);

        // Move Collision Shapes
        const newShapes = new Map(state.collisionShapes);

        // Move Images
        let newImages = state.levelImages;

        let hasChanges = false;

        // Identify locked layers to prevent movement
        const lockedLayerIds = new Set(
            state.layers.filter(l => l.locked).map(l => l.id)
        );

        if (state.selectedTileIds.size > 0 && (gridDx !== 0 || gridDy !== 0)) {
            // First, remove all selected tiles from map
            const selectedTilesList: Tile[] = [];
            state.selectedTileIds.forEach(id => {
                for (const [key, tile] of state.tiles) {
                    if (tile.id === id) {
                        if (lockedLayerIds.has(tile.layerId)) break; // Skip locked
                        selectedTilesList.push(tile);
                        newTiles.delete(key);
                        break;
                    }
                }
            });

            // Re-add them at new positions
            selectedTilesList.forEach(tile => {
                const newX = tile.gridX + gridDx;
                const newY = tile.gridY + gridDy;
                const newKey = gridKey(newX, newY, tile.layerId);
                newTiles.set(newKey, { ...tile, gridX: newX, gridY: newY });
            });
            if (selectedTilesList.length > 0) hasChanges = true;
        }

        if (state.selectedCharacterIds.size > 0 && (gridDx !== 0 || gridDy !== 0)) {
            state.selectedCharacterIds.forEach(id => {
                const char = newChars.get(id);
                if (char && !lockedLayerIds.has(char.layerId)) {
                    newChars.set(id, { ...char, gridX: char.gridX + gridDx, gridY: char.gridY + gridDy });
                    hasChanges = true;
                }
            });
        }

        if (state.selectedCollisionIds.size > 0 && (deltaX !== 0 || deltaY !== 0)) {
            state.selectedCollisionIds.forEach(id => {
                const shape = newShapes.get(id);
                if (shape && !lockedLayerIds.has(shape.layerId)) {
                    newShapes.set(id, { ...shape, x: shape.x + deltaX, y: shape.y + deltaY });
                    hasChanges = true;
                }
            });
        }

        if (state.selectedImageIds.size > 0 && (deltaX !== 0 || deltaY !== 0)) {
            // Images are global (not on layers), so they are always movable unless we implement image locking
            newImages = state.levelImages.map(img =>
                state.selectedImageIds.has(img.id)
                    ? { ...img, x: img.x + deltaX, y: img.y + deltaY }
                    : img
            );
            hasChanges = true;
        }

        if (!hasChanges) return state;

        return {
            tiles: newTiles,
            characters: newChars,
            collisionShapes: newShapes,
            levelImages: newImages
        };
    }),

}));
