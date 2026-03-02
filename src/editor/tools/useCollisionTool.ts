/**
 * Collision Tool - Draw invisible collision shapes (Box or Smooth mode)
 */
import { useCallback, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { generateCollisionId } from '../types';
import type { CollisionShape } from '../types';
import { useCollisionBrushTool } from './useCollisionBrushTool';
import { useCollisionFillTool } from './useCollisionFillTool';

export interface CollisionPreview {
    type: 'box' | 'circle' | 'polygon';
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    vertices: { x: number; y: number }[];
}

export function useCollisionTool() {
    const [preview, setPreview] = useState<CollisionPreview | null>(null);
    const [polygonVertices, setPolygonVertices] = useState<{ x: number; y: number }[]>([]);
    const collisionBrush = useCollisionBrushTool();
    const collisionFill = useCollisionFillTool();

    const handleBoxDown = useCallback((worldX: number, worldY: number) => {
        const { setIsDragging, setDragStart, gridSize } = useEditorStore.getState();
        // Snap to grid
        const snappedX = Math.floor(worldX / gridSize) * gridSize;
        const snappedY = Math.floor(worldY / gridSize) * gridSize;
        setIsDragging(true);
        setDragStart({ x: snappedX, y: snappedY });
        setPreview({
            type: 'box',
            x: snappedX,
            y: snappedY,
            width: gridSize,
            height: gridSize,
            radius: 0,
            vertices: [],
        });
    }, []);

    const handleBoxMove = useCallback((worldX: number, worldY: number) => {
        const { isDragging, dragStart, gridSize } = useEditorStore.getState();
        if (!isDragging || !dragStart) return;

        // Snap end to grid
        const snappedEndX = Math.ceil(worldX / gridSize) * gridSize;
        const snappedEndY = Math.ceil(worldY / gridSize) * gridSize;

        const x = Math.min(dragStart.x, snappedEndX);
        const y = Math.min(dragStart.y, snappedEndY);
        const w = Math.abs(snappedEndX - dragStart.x);
        const h = Math.abs(snappedEndY - dragStart.y);

        setPreview({
            type: 'box',
            x,
            y,
            width: Math.max(w, gridSize),
            height: Math.max(h, gridSize),
            radius: 0,
            vertices: [],
        });
    }, []);

    const handleBoxUp = useCallback(() => {
        const { isDragging, dragStart, addCollisionShape, activeLayerId, setIsDragging, setDragStart } = useEditorStore.getState();
        if (!isDragging || !dragStart || !preview || preview.type !== 'box') {
            setPreview(null);
            return;
        }

        const shape: CollisionShape = {
            id: generateCollisionId(),
            type: 'box',
            layerId: activeLayerId,
            x: preview.x,
            y: preview.y,
            width: preview.width,
            height: preview.height,
            radius: 0,
            vertices: [],
            rotation: 0,
        };

        addCollisionShape(shape);
        setIsDragging(false);
        setDragStart(null);
        setPreview(null);
    }, [preview]);

    const handleCircleDown = useCallback((worldX: number, worldY: number) => {
        const { setIsDragging, setDragStart } = useEditorStore.getState();
        setIsDragging(true);
        setDragStart({ x: worldX, y: worldY });
        setPreview({
            type: 'circle',
            x: worldX,
            y: worldY,
            width: 0,
            height: 0,
            radius: 0,
            vertices: [],
        });
    }, []);

    const handleCircleMove = useCallback((worldX: number, worldY: number) => {
        const { isDragging, dragStart } = useEditorStore.getState();
        if (!isDragging || !dragStart) return;

        const dx = worldX - dragStart.x;
        const dy = worldY - dragStart.y;
        const radius = Math.sqrt(dx * dx + dy * dy);

        setPreview({
            type: 'circle',
            x: dragStart.x,
            y: dragStart.y,
            width: 0,
            height: 0,
            radius,
            vertices: [],
        });
    }, []);

    const handleCircleUp = useCallback(() => {
        const { isDragging, addCollisionShape, activeLayerId, setIsDragging, setDragStart } = useEditorStore.getState();
        if (!isDragging || !preview || preview.type !== 'circle' || preview.radius < 4) {
            setIsDragging(false);
            setDragStart(null);
            setPreview(null);
            return;
        }

        const shape: CollisionShape = {
            id: generateCollisionId(),
            type: 'circle',
            layerId: activeLayerId,
            x: preview.x,
            y: preview.y,
            width: 0,
            height: 0,
            radius: preview.radius,
            vertices: [],
            rotation: 0,
        };

        addCollisionShape(shape);
        setIsDragging(false);
        setDragStart(null);
        setPreview(null);
    }, [preview]);

    // Externalized polygon finalization — callable from double-click, Enter, right-click, or UI button
    const finishPolygon = useCallback(() => {
        if (polygonVertices.length < 3) return;

        const { addCollisionShape, activeLayerId } = useEditorStore.getState();

        // Calculate centroid
        let cx = 0, cy = 0;
        polygonVertices.forEach(v => { cx += v.x; cy += v.y; });
        cx /= polygonVertices.length;
        cy /= polygonVertices.length;

        const relativeVerts = polygonVertices.map(v => ({
            x: v.x - cx,
            y: v.y - cy,
        }));

        const shape: CollisionShape = {
            id: generateCollisionId(),
            type: 'polygon',
            layerId: activeLayerId,
            x: cx,
            y: cy,
            width: 0,
            height: 0,
            radius: 0,
            vertices: relativeVerts,
            rotation: 0,
        };

        addCollisionShape(shape);
        setPolygonVertices([]);
        setPreview(null);
    }, [polygonVertices]);

    const handlePolygonClick = useCallback((worldX: number, worldY: number, isDoubleClick: boolean) => {
        if (isDoubleClick && polygonVertices.length >= 3) {
            finishPolygon();
        } else if (!isDoubleClick) {
            // Add vertex
            const newVerts = [...polygonVertices, { x: worldX, y: worldY }];
            setPolygonVertices(newVerts);
            setPreview({
                type: 'polygon',
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                radius: 0,
                vertices: newVerts,
            });
        }
    }, [polygonVertices, finishPolygon]);

    const handlePolygonMove = useCallback((worldX: number, worldY: number) => {
        if (polygonVertices.length === 0) return;
        // Update preview with cursor as potential next vertex
        setPreview({
            type: 'polygon',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            radius: 0,
            vertices: [...polygonVertices, { x: worldX, y: worldY }],
        });
    }, [polygonVertices]);

    // Main dispatchers
    const onMouseDown = useCallback((worldX: number, worldY: number, isDoubleClick: boolean = false) => {
        const { collisionToolMode, smoothShapeType } = useEditorStore.getState();
        if (collisionToolMode === 'box') {
            handleBoxDown(worldX, worldY);
        } else if (collisionToolMode === 'brush') {
            collisionBrush.onMouseDown(worldX, worldY);
        } else if (collisionToolMode === 'fill') {
            collisionFill.onMouseDown(worldX, worldY);
        } else if (smoothShapeType === 'circle') {
            handleCircleDown(worldX, worldY);
        } else {
            handlePolygonClick(worldX, worldY, isDoubleClick);
        }
    }, [handleBoxDown, handleCircleDown, handlePolygonClick, collisionBrush, collisionFill]);

    const onMouseMove = useCallback((worldX: number, worldY: number) => {
        const { collisionToolMode, smoothShapeType } = useEditorStore.getState();
        if (collisionToolMode === 'box') {
            handleBoxMove(worldX, worldY);
        } else if (collisionToolMode === 'brush') {
            collisionBrush.onMouseMove(worldX, worldY);
        } else if (collisionToolMode === 'fill') {
            collisionFill.onMouseMove(worldX, worldY);
        } else if (smoothShapeType === 'circle') {
            handleCircleMove(worldX, worldY);
        } else {
            handlePolygonMove(worldX, worldY);
        }
    }, [handleBoxMove, handleCircleMove, handlePolygonMove, collisionBrush, collisionFill]);

    const onMouseUp = useCallback(() => {
        const { collisionToolMode, smoothShapeType } = useEditorStore.getState();
        if (collisionToolMode === 'box') {
            handleBoxUp();
        } else if (collisionToolMode === 'brush') {
            collisionBrush.onMouseUp();
        } else if (collisionToolMode === 'fill') {
            collisionFill.onMouseUp();
        } else if (smoothShapeType === 'circle') {
            handleCircleUp();
        }
        // Polygon doesn't use mouseUp — it uses clicks
    }, [handleBoxUp, handleCircleUp, collisionBrush, collisionFill]);

    const cancelPolygon = useCallback(() => {
        setPolygonVertices([]);
        setPreview(null);
    }, []);

    return {
        onMouseDown,
        onMouseMove,
        onMouseUp,
        cancelPolygon,
        finishPolygon,
        preview,
        isDrawingPolygon: polygonVertices.length > 0,
        polygonVertexCount: polygonVertices.length,
        freehandPath: collisionBrush.path,
    };
}
