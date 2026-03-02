/**
 * Collision Brush Tool - Freehand draw collision polygons
 */
import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { generateCollisionId } from '../types';
import type { CollisionShape } from '../types';

export function useCollisionBrushTool() {
    const [path, setPath] = useState<{ x: number; y: number }[]>([]);
    const isPaintingRef = useRef(false);

    // Distance threshold to filter points and keep the polygon optimized
    const DISTANCE_THRESHOLD = 5;

    const onMouseDown = useCallback((worldX: number, worldY: number) => {
        useEditorStore.getState().pushHistoryState();
        isPaintingRef.current = true;
        setPath([{ x: worldX, y: worldY }]);
    }, []);

    const onMouseMove = useCallback((worldX: number, worldY: number) => {
        if (!isPaintingRef.current) return;

        setPath((currentPath) => {
            if (currentPath.length === 0) return [{ x: worldX, y: worldY }];

            const lastPoint = currentPath[currentPath.length - 1];
            const dx = worldX - lastPoint.x;
            const dy = worldY - lastPoint.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > DISTANCE_THRESHOLD) {
                return [...currentPath, { x: worldX, y: worldY }];
            }
            return currentPath;
        });
    }, []);

    const onMouseUp = useCallback(() => {
        if (!isPaintingRef.current) return;
        isPaintingRef.current = false;

        setPath((currentPath) => {
            if (currentPath.length > 2) {
                const state = useEditorStore.getState();
                const { activeLayerId } = state;

                // Calculate centroid for the polygon shape
                let cx = 0, cy = 0;
                currentPath.forEach(p => {
                    cx += p.x;
                    cy += p.y;
                });
                cx /= currentPath.length;
                cy /= currentPath.length;

                const relativeVerts = currentPath.map(p => ({
                    x: p.x - cx,
                    y: p.y - cy,
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

                state.addCollisionShape(shape);
            }
            return []; // Clear path
        });
    }, []);

    return { onMouseDown, onMouseMove, onMouseUp, path };
}
