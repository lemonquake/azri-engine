import { useCallback, useState } from 'react';
import type { GridPos, Tile, ToolType } from '../types';
import { generateTileId } from '../types';
import { useEditorStore } from '../state/editorStore';
import {
    getLinePoints,
    getRectangleOutlinePoints,
    getRectangleFillPoints,
    getCircleOutlinePoints,
    getCircleFillPoints,
    getSymmetricalPoints
} from '../utils/geometry';
import type { Point } from '../utils/geometry';

export const useShapeTool = () => {
    const {
        selectedTileType,
        placeTiles,
        activeLayerId,
        symmetry,
        toolSettings,
        activeTool,
        dragStart,
        setDragStart,
        isDragging,
        setIsDragging,
    } = useEditorStore();

    const [previewPoints, setPreviewPoints] = useState<Point[]>([]);

    const calculatePoints = useCallback((start: GridPos, end: GridPos, tool: ToolType) => {
        let points: Point[] = [];
        if (tool === 'line') {
            points = getLinePoints(start, end);
        } else if (tool === 'rectangle') {
            points = toolSettings.shapeMode === 'fill'
                ? getRectangleFillPoints(start, end)
                : getRectangleOutlinePoints(start, end);
        } else if (tool === 'circle') {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const radius = Math.floor(Math.sqrt(dx * dx + dy * dy));
            points = toolSettings.shapeMode === 'fill'
                ? getCircleFillPoints(start, radius)
                : getCircleOutlinePoints(start, radius);
        }
        return points;
    }, [toolSettings.shapeMode]);

    const onMouseDown = useCallback((pos: GridPos) => {
        setIsDragging(true);
        setDragStart(pos);
        setPreviewPoints([pos]);
    }, [setIsDragging, setDragStart]);

    const onMouseMove = useCallback((pos: GridPos) => {
        if (!isDragging || !dragStart) return;

        // Calculate preview points
        const points = calculatePoints(dragStart, pos, activeTool);
        setPreviewPoints(points);
    }, [isDragging, dragStart, activeTool, calculatePoints]);

    const onMouseUp = useCallback((pos: GridPos) => {
        if (!isDragging || !dragStart) return;

        // Commit Shape
        const state = useEditorStore.getState();
        if (!state.selectedTileType) return;

        state.pushHistoryState();

        const points = calculatePoints(dragStart, pos, activeTool);
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

        setIsDragging(false);
        setDragStart(null);
        setPreviewPoints([]);
    }, [isDragging, dragStart, activeTool, calculatePoints, symmetry, selectedTileType, activeLayerId, placeTiles, setIsDragging, setDragStart]);

    return {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        previewPoints,
    };
};
