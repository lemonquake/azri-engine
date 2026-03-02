/**
 * Paint Bucket Tool - Flood fill from click point
 */
import type { GridPos, Tile } from '../types';
import { generateTileId, gridKey } from '../types';
import { useEditorStore } from '../state/editorStore';
// import { useHistoryStore } from '../state/historyStore'; // Removed as pushState is now in editorStore

export function useBucketTool() {
    const {
        tiles,
        selectedTileType,
        placeTiles,
        // pushHistoryState removed
        activeLayerId,
        // setTiles, activeTilesetId, gridSize // Not explicitly requested but often come with pushHistoryState
    } = useEditorStore();

    // const { pushState } = useHistoryStore(); // Removed

    const floodFill = (startPos: GridPos) => {
        // const { activeLayerId } = useEditorStore.getState(); // Now directly available from store
        const startKey = gridKey(startPos.x, startPos.y, activeLayerId);
        const startTile = tiles.get(startKey);
        const targetSpriteId = startTile?.spriteId ?? null;

        // Don't fill if clicking on same tile type
        if (targetSpriteId === selectedTileType.id) return;

        // BFS flood fill
        const visited = new Set<string>();
        const queue: GridPos[] = [startPos];
        const tilesToPlace: Tile[] = [];

        // Define fill boundaries (reasonable limit)
        const maxSize = 100;
        const minX = startPos.x - 50;
        const maxX = startPos.x + 50;
        const minY = startPos.y - 50;
        const maxY = startPos.y + 50;

        while (queue.length > 0 && tilesToPlace.length < maxSize) {
            const pos = queue.shift()!;
            const key = gridKey(pos.x, pos.y, activeLayerId);

            if (visited.has(key)) continue;
            if (pos.x < minX || pos.x > maxX || pos.y < minY || pos.y > maxY) continue;

            visited.add(key);

            const currentTile = tiles.get(key);
            const currentSpriteId = currentTile?.spriteId ?? null;

            // Only fill if it matches the target (empty or same sprite)
            if (currentSpriteId !== targetSpriteId) continue;

            // Create new tile
            tilesToPlace.push({
                id: generateTileId(),
                gridX: pos.x,
                gridY: pos.y,
                spriteId: selectedTileType.id,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layerId: activeLayerId,
            });

            // Add neighbors
            queue.push({ x: pos.x + 1, y: pos.y });
            queue.push({ x: pos.x - 1, y: pos.y });
            queue.push({ x: pos.x, y: pos.y + 1 });
            queue.push({ x: pos.x, y: pos.y - 1 });
        }

        if (tilesToPlace.length > 0) {
            placeTiles(tilesToPlace);
        }
    };

    const onMouseDown = (pos: GridPos) => {
        // Save state for undo
        // const state = useEditorStore.getState(); // Removed
        // pushState(state.tiles, state.characters, state.selectedTileIds); // Removed
        useEditorStore.getState().pushHistoryState(); // New way to push history

        floodFill(pos);
    };

    const onMouseMove = (_pos?: GridPos, _event?: MouseEvent) => {
        // No drag behavior for bucket
    };

    const onMouseUp = (_pos?: GridPos, _event?: MouseEvent) => {
        // No action needed
    };

    return { onMouseDown, onMouseMove, onMouseUp };
}
