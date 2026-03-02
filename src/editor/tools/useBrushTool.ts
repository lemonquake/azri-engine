import { useCallback } from 'react';
import type { GridPos, Tile } from '../types';
import { generateTileId } from '../types';
import { useEditorStore } from '../state/editorStore';
import { getBrushPoints, getSymmetricalPoints } from '../utils/geometry';

export const useBrushTool = () => {
    const {
        selectedTileType,
        placeTiles,
        activeLayerId,
        brushSize,
        symmetry,
    } = useEditorStore();

    const onMouseDown = useCallback((pos: GridPos) => {
        const state = useEditorStore.getState();
        if (!state.selectedTileType) return;

        // Push state BEFORE any changes
        state.pushHistoryState();

        const points = getBrushPoints(pos, brushSize);
        const symPoints = getSymmetricalPoints(points, symmetry);

        const newTiles: Tile[] = symPoints.map(p => ({
            id: generateTileId(),
            gridX: p.x,
            gridY: p.y,
            spriteId: selectedTileType.id,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            hasCollision: selectedTileType.defaultCollision,
            opacity: selectedTileType.defaultOpacity ?? 1,
            glowColor: selectedTileType.defaultGlowColor,
            physics: selectedTileType.defaultPhysics,
            tag: selectedTileType.defaultTag,
            layerId: activeLayerId
        }));

        placeTiles(newTiles);
    }, [brushSize, selectedTileType, activeLayerId, symmetry, placeTiles]);

    const onMouseMove = useCallback((pos: GridPos) => {
        if (!selectedTileType) return;
        const points = getBrushPoints(pos, brushSize);
        const symPoints = getSymmetricalPoints(points, symmetry);

        const newTiles: Tile[] = symPoints.map(p => ({
            id: generateTileId(),
            gridX: p.x,
            gridY: p.y,
            spriteId: selectedTileType.id,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            hasCollision: selectedTileType.defaultCollision,
            opacity: selectedTileType.defaultOpacity ?? 1,
            glowColor: selectedTileType.defaultGlowColor,
            physics: selectedTileType.defaultPhysics,
            tag: selectedTileType.defaultTag,
            layerId: activeLayerId
        }));

        placeTiles(newTiles);
    }, [brushSize, selectedTileType, activeLayerId, symmetry, placeTiles]);

    return {
        onMouseDown,
        onMouseMove,
    };
};
