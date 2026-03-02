import { create } from 'zustand';
import type { Tile, TileId, CharacterInstance, Layer, SkyboxLayer, LevelImage, CollisionShape } from '../types';

const MAX_HISTORY = 50;

interface HistoryEntry {
    tiles: Map<string, Tile>;
    characters: Map<string, CharacterInstance>;
    layers: Layer[];
    skyboxLayers: SkyboxLayer[];
    levelImages: LevelImage[];
    collisionShapes: Map<string, CollisionShape>;
    selectedTileIds: Set<TileId>;
    selectedCharacterIds: Set<string>;
    selectedLayerIds: Set<string>;
    selectedImageIds: Set<string>;
    selectedCollisionIds: Set<string>;
    timestamp: number;
}

interface HistoryState {
    past: HistoryEntry[];
    future: HistoryEntry[];

    // Push current state to history (call before making changes)
    pushState: (
        tiles: Map<string, Tile>,
        characters: Map<string, CharacterInstance>,
        layers: Layer[],
        skyboxLayers: SkyboxLayer[],
        levelImages: LevelImage[],
        collisionShapes: Map<string, CollisionShape>,
        selectedTileIds: Set<TileId>,
        selectedCharacterIds: Set<string>,
        selectedLayerIds: Set<string>,
        selectedImageIds: Set<string>,
        selectedCollisionIds: Set<string>
    ) => void;

    // Undo: restore previous state
    undo: (
        currentTiles: Map<string, Tile>,
        currentCharacters: Map<string, CharacterInstance>,
        currentLayers: Layer[],
        currentSkyboxLayers: SkyboxLayer[],
        currentLevelImages: LevelImage[],
        currentCollisionShapes: Map<string, CollisionShape>,
        currentSelectedTileIds: Set<TileId>,
        currentSelectedCharacterIds: Set<string>,
        currentSelectedLayerIds: Set<string>,
        currentSelectedImageIds: Set<string>,
        currentSelectedCollisionIds: Set<string>
    ) => HistoryEntry | null;

    // Redo: restore next state
    redo: (
        currentTiles: Map<string, Tile>,
        currentCharacters: Map<string, CharacterInstance>,
        currentLayers: Layer[],
        currentSkyboxLayers: SkyboxLayer[],
        currentLevelImages: LevelImage[],
        currentCollisionShapes: Map<string, CollisionShape>,
        currentSelectedTileIds: Set<TileId>,
        currentSelectedCharacterIds: Set<string>,
        currentSelectedLayerIds: Set<string>,
        currentSelectedImageIds: Set<string>,
        currentSelectedCollisionIds: Set<string>
    ) => HistoryEntry | null;

    // Check if undo/redo available
    canUndo: () => boolean;
    canRedo: () => boolean;

    // Clear history
    clearHistory: () => void;
}

// Deep clone a tiles map
function cloneTilesMap(tiles: Map<string, Tile>): Map<string, Tile> {
    const cloned = new Map<string, Tile>();
    tiles.forEach((tile, key) => {
        cloned.set(key, { ...tile });
    });
    return cloned;
}

// Deep clone characters map
function cloneCharactersMap(chars: Map<string, CharacterInstance>): Map<string, CharacterInstance> {
    const cloned = new Map<string, CharacterInstance>();
    chars.forEach((char, key) => {
        // Deep clone overrideProperties if exists
        const overrides = char.overrideProperties ? { ...char.overrideProperties } : undefined;
        cloned.set(key, { ...char, overrideProperties: overrides });
    });
    return cloned;
}

// Deep clone collision shapes map
function cloneCollisionMap(shapes: Map<string, CollisionShape>): Map<string, CollisionShape> {
    const cloned = new Map<string, CollisionShape>();
    shapes.forEach((shape, key) => {
        const vertices = shape.vertices ? shape.vertices.map(v => ({ ...v })) : [];
        cloned.set(key, { ...shape, vertices });
    });
    return cloned;
}

// Deep clone simple arrays of objects
function cloneArray<T>(arr: T[]): T[] {
    return arr.map(item => ({ ...item }));
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
    past: [],
    future: [],

    pushState: (
        tiles,
        characters,
        layers,
        skyboxLayers,
        levelImages,
        collisionShapes,
        selectedTileIds,
        selectedCharacterIds,
        selectedLayerIds,
        selectedImageIds,
        selectedCollisionIds
    ) => set((state) => {
        const entry: HistoryEntry = {
            tiles: cloneTilesMap(tiles),
            characters: cloneCharactersMap(characters),
            layers: cloneArray(layers),
            skyboxLayers: cloneArray(skyboxLayers),
            levelImages: cloneArray(levelImages),
            collisionShapes: cloneCollisionMap(collisionShapes),
            selectedTileIds: new Set(selectedTileIds),
            selectedCharacterIds: new Set(selectedCharacterIds),
            selectedLayerIds: new Set(selectedLayerIds),
            selectedImageIds: new Set(selectedImageIds),
            selectedCollisionIds: new Set(selectedCollisionIds),
            timestamp: Date.now(),
        };

        const newPast = [...state.past, entry];
        // Limit history size
        if (newPast.length > MAX_HISTORY) {
            newPast.shift();
        }

        return {
            past: newPast,
            future: [], // Clear future on new action
        };
    }),

    undo: (
        currentTiles,
        currentCharacters,
        currentLayers,
        currentSkyboxLayers,
        currentLevelImages,
        currentCollisionShapes,
        currentSelectedTileIds,
        currentSelectedCharacterIds,
        currentSelectedLayerIds,
        currentSelectedImageIds,
        currentSelectedCollisionIds
    ) => {
        const state = get();
        if (state.past.length === 0) return null;

        const previous = state.past[state.past.length - 1];
        const currentEntry: HistoryEntry = {
            tiles: cloneTilesMap(currentTiles),
            characters: cloneCharactersMap(currentCharacters),
            layers: cloneArray(currentLayers),
            skyboxLayers: cloneArray(currentSkyboxLayers),
            levelImages: cloneArray(currentLevelImages),
            collisionShapes: cloneCollisionMap(currentCollisionShapes),
            selectedTileIds: new Set(currentSelectedTileIds),
            selectedCharacterIds: new Set(currentSelectedCharacterIds),
            selectedLayerIds: new Set(currentSelectedLayerIds),
            selectedImageIds: new Set(currentSelectedImageIds),
            selectedCollisionIds: new Set(currentSelectedCollisionIds),
            timestamp: Date.now(),
        };

        set({
            past: state.past.slice(0, -1),
            future: [currentEntry, ...state.future],
        });

        return {
            tiles: cloneTilesMap(previous.tiles),
            characters: cloneCharactersMap(previous.characters),
            layers: cloneArray(previous.layers),
            skyboxLayers: cloneArray(previous.skyboxLayers),
            levelImages: cloneArray(previous.levelImages),
            collisionShapes: cloneCollisionMap(previous.collisionShapes),
            selectedTileIds: new Set(previous.selectedTileIds),
            selectedCharacterIds: new Set(previous.selectedCharacterIds),
            selectedLayerIds: new Set(previous.selectedLayerIds),
            selectedImageIds: new Set(previous.selectedImageIds),
            selectedCollisionIds: new Set(previous.selectedCollisionIds),
            timestamp: previous.timestamp,
        };
    },

    redo: (
        currentTiles,
        currentCharacters,
        currentLayers,
        currentSkyboxLayers,
        currentLevelImages,
        currentCollisionShapes,
        currentSelectedTileIds,
        currentSelectedCharacterIds,
        currentSelectedLayerIds,
        currentSelectedImageIds,
        currentSelectedCollisionIds
    ) => {
        const state = get();
        if (state.future.length === 0) return null;

        const next = state.future[0];
        const currentEntry: HistoryEntry = {
            tiles: cloneTilesMap(currentTiles),
            characters: cloneCharactersMap(currentCharacters),
            layers: cloneArray(currentLayers),
            skyboxLayers: cloneArray(currentSkyboxLayers),
            levelImages: cloneArray(currentLevelImages),
            collisionShapes: cloneCollisionMap(currentCollisionShapes),
            selectedTileIds: new Set(currentSelectedTileIds),
            selectedCharacterIds: new Set(currentSelectedCharacterIds),
            selectedLayerIds: new Set(currentSelectedLayerIds),
            selectedImageIds: new Set(currentSelectedImageIds),
            selectedCollisionIds: new Set(currentSelectedCollisionIds),
            timestamp: Date.now(),
        };

        set({
            past: [...state.past, currentEntry],
            future: state.future.slice(1),
        });

        return {
            tiles: cloneTilesMap(next.tiles),
            characters: cloneCharactersMap(next.characters),
            layers: cloneArray(next.layers),
            skyboxLayers: cloneArray(next.skyboxLayers),
            levelImages: cloneArray(next.levelImages),
            collisionShapes: cloneCollisionMap(next.collisionShapes),
            selectedTileIds: new Set(next.selectedTileIds),
            selectedCharacterIds: new Set(next.selectedCharacterIds),
            selectedLayerIds: new Set(next.selectedLayerIds),
            selectedImageIds: new Set(next.selectedImageIds),
            selectedCollisionIds: new Set(next.selectedCollisionIds),
            timestamp: next.timestamp,
        };
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    clearHistory: () => set({ past: [], future: [] }),
}));
