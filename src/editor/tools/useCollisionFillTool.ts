/**
 * Collision Fill Tool - Flood fill collision shapes from click point (paint bucket style)
 */
import { useCallback } from 'react';
import { useEditorStore } from '../state/editorStore';
import { generateCollisionId } from '../types';
import type { CollisionShape } from '../types';

/** Check if a grid cell already has a collision shape or a tile with collision */
function cellHasCollision(gridX: number, gridY: number, gridSize: number, collisionShapes: Map<string, CollisionShape>, layerId: string): boolean {
    const cellX = gridX * gridSize;
    const cellY = gridY * gridSize;
    for (const [, shape] of collisionShapes) {
        if (shape.layerId !== layerId) continue;
        if (shape.type === 'box' &&
            shape.x === cellX && shape.y === cellY &&
            shape.width === gridSize && shape.height === gridSize) {
            return true;
        }
    }
    return false;
}

/** Check if a grid cell has a tile with collision enabled */
function cellHasCollisionTile(gridX: number, gridY: number, tiles: Map<string, any>, layerId: string): boolean {
    const key = `${gridX},${gridY},${layerId}`;
    const tile = tiles.get(key);
    return !!(tile && tile.hasCollision);
}

export function useCollisionFillTool() {
    const floodFill = useCallback((worldX: number, worldY: number) => {
        const state = useEditorStore.getState();
        const { gridSize, activeLayerId, collisionShapes, tiles } = state;

        // Convert to grid coords
        const startGridX = Math.floor(worldX / gridSize);
        const startGridY = Math.floor(worldY / gridSize);

        // Don't fill if the start cell already has collision
        if (cellHasCollision(startGridX, startGridY, gridSize, collisionShapes, activeLayerId)) return;
        if (cellHasCollisionTile(startGridX, startGridY, tiles, activeLayerId)) return;

        // BFS flood fill
        const visited = new Set<string>();
        const queue: { x: number; y: number }[] = [{ x: startGridX, y: startGridY }];
        const shapesToAdd: CollisionShape[] = [];

        const maxCells = 200;
        const boundaryRadius = 50;
        const minX = startGridX - boundaryRadius;
        const maxX = startGridX + boundaryRadius;
        const minY = startGridY - boundaryRadius;
        const maxY = startGridY + boundaryRadius;

        while (queue.length > 0 && shapesToAdd.length < maxCells) {
            const pos = queue.shift()!;
            const cellKey = `${pos.x},${pos.y}`;

            if (visited.has(cellKey)) continue;
            if (pos.x < minX || pos.x > maxX || pos.y < minY || pos.y > maxY) continue;

            visited.add(cellKey);

            // Stop spreading if this cell already has collision (acts as boundary)
            if (cellHasCollision(pos.x, pos.y, gridSize, collisionShapes, activeLayerId)) continue;
            if (cellHasCollisionTile(pos.x, pos.y, tiles, activeLayerId)) continue;

            // Create collision shape for this cell
            shapesToAdd.push({
                id: generateCollisionId(),
                type: 'box',
                layerId: activeLayerId,
                x: pos.x * gridSize,
                y: pos.y * gridSize,
                width: gridSize,
                height: gridSize,
                radius: 0,
                vertices: [],
                rotation: 0,
            });

            // Add 4 neighbors
            queue.push({ x: pos.x + 1, y: pos.y });
            queue.push({ x: pos.x - 1, y: pos.y });
            queue.push({ x: pos.x, y: pos.y + 1 });
            queue.push({ x: pos.x, y: pos.y - 1 });
        }

        // Add all shapes
        if (shapesToAdd.length > 0) {
            for (const shape of shapesToAdd) {
                state.addCollisionShape(shape);
            }
        }
    }, []);

    const onMouseDown = useCallback((worldX: number, worldY: number) => {
        // Push undo state
        useEditorStore.getState().pushHistoryState();
        floodFill(worldX, worldY);
    }, [floodFill]);

    const onMouseMove = useCallback((_worldX: number, _worldY: number) => {
        // No drag behavior for fill
    }, []);

    const onMouseUp = useCallback(() => {
        // No action needed
    }, []);

    return { onMouseDown, onMouseMove, onMouseUp };
}
