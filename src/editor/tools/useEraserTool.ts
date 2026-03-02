import { useCallback } from 'react';
import type { GridPos } from '../types';
import { gridKey } from '../types';
import { useEditorStore } from '../state/editorStore';
import { getBrushPoints, getSymmetricalPoints } from '../utils/geometry';

export const useEraserTool = () => {
    const {
        removeTiles,
        removeCharacters,
        activeLayerId,
        brushSize,
        symmetry,
    } = useEditorStore();

    const performErase = useCallback((pos: GridPos) => {
        const points = getBrushPoints(pos, brushSize);
        const symPoints = getSymmetricalPoints(points, symmetry);

        // Remove Tiles
        const tileKeys = symPoints.map(p => gridKey(p.x, p.y, activeLayerId));
        removeTiles(tileKeys);

        // Remove Characters at these positions on the active layer
        const charsToRemove: string[] = [];
        symPoints.forEach(p => {
            useEditorStore.getState().characters.forEach(c => {
                if (c.layerId === activeLayerId && c.gridX === p.x && c.gridY === p.y) {
                    charsToRemove.push(c.id);
                }
            });
        });

        if (charsToRemove.length > 0) {
            removeCharacters(charsToRemove);
        }

    }, [brushSize, activeLayerId, symmetry, removeTiles, removeCharacters]);

    const onMouseDown = useCallback((pos: GridPos) => {
        const state = useEditorStore.getState();
        state.pushHistoryState();
        performErase(pos);
    }, [performErase]);

    const onMouseMove = useCallback((pos: GridPos) => {
        performErase(pos);
    }, [performErase]);

    return {
        onMouseDown,
        onMouseMove,
    };
};
