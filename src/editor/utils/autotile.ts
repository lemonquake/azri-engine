import type { Tile, TileDefinition, AutoTileSet } from '../types';
import { gridKey } from '../types';

/**
 * Checks if a tile at the given position is "connected" to the reference tile type.
 * Connection depends on having the same AutoTileSet ID.
 */
function isConnected(
    grid: Map<string, Tile>,
    x: number,
    y: number,
    layerId: string,
    targetAutoTileSetId: string,
    tileDefs: Map<string, TileDefinition>
): number {
    const key = gridKey(x, y, layerId);
    const tile = grid.get(key);

    if (!tile) return 0;

    const def = tileDefs.get(tile.spriteId);
    if (!def) return 0;

    // Check if neighbor belongs to the same auto-tile set
    return def.autoTileSetId === targetAutoTileSetId ? 1 : 0;
}

/**
 * Calculates the 8-bit bitmask for a tile at (x, y).
 * Order: North=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128
 */
export function calculateBitmask(
    grid: Map<string, Tile>,
    x: number,
    y: number,
    layerId: string,
    autoTileSetId: string,
    tileDefs: Map<string, TileDefinition>
): number {
    let mask = 0;

    // North
    if (isConnected(grid, x, y - 1, layerId, autoTileSetId, tileDefs)) mask |= 1;
    // North-East
    if (isConnected(grid, x + 1, y - 1, layerId, autoTileSetId, tileDefs)) mask |= 2;
    // East
    if (isConnected(grid, x + 1, y, layerId, autoTileSetId, tileDefs)) mask |= 4;
    // South-East
    if (isConnected(grid, x + 1, y + 1, layerId, autoTileSetId, tileDefs)) mask |= 8;
    // South
    if (isConnected(grid, x, y + 1, layerId, autoTileSetId, tileDefs)) mask |= 16;
    // South-West
    if (isConnected(grid, x - 1, y + 1, layerId, autoTileSetId, tileDefs)) mask |= 32;
    // West
    if (isConnected(grid, x - 1, y, layerId, autoTileSetId, tileDefs)) mask |= 64;
    // North-West
    if (isConnected(grid, x - 1, y - 1, layerId, autoTileSetId, tileDefs)) mask |= 128;

    return mask;
}

/**
 * Returns the neighbor coordinates that need updating when a tile at (x,y) changes.
 */
export function getNeighborPositions(x: number, y: number): { x: number; y: number }[] {
    return [
        { x: x, y: y - 1 },     // N
        { x: x + 1, y: y - 1 }, // NE
        { x: x + 1, y: y },     // E
        { x: x + 1, y: y + 1 }, // SE
        { x: x, y: y + 1 },     // S
        { x: x - 1, y: y + 1 }, // SW
        { x: x - 1, y: y },     // W
        { x: x - 1, y: y - 1 }  // NW
    ];
}

/**
 * Updates tiles at specific positions (and their neighbors) based on auto-tile rules.
 * Returns the modified tiles map.
 */
export function updateAutoTiles(
    tiles: Map<string, Tile>,
    tileDefs: Map<string, TileDefinition>,
    autoTileSets: Record<string, AutoTileSet>,
    positions: { x: number, y: number, layerId: string }[]
): Map<string, Tile> {
    const updatedTiles = new Map(tiles);
    const checkedKeys = new Set<string>();

    const processQueue = [...positions];

    // Add neighbors of changed tiles to queue
    positions.forEach(pos => {
        getNeighborPositions(pos.x, pos.y).forEach(n => {
            processQueue.push({ x: n.x, y: n.y, layerId: pos.layerId });
        });
    });

    processQueue.forEach(pos => {
        const key = gridKey(pos.x, pos.y, pos.layerId);
        if (checkedKeys.has(key)) return;
        checkedKeys.add(key);

        const tile = updatedTiles.get(key);
        if (!tile) return;

        const def = tileDefs.get(tile.spriteId);
        // We need to check if the current sprite is part of an auto-tile set.
        // If the spriteId IS the base, OR if it is one of the variants.
        // Simplest is if the Tile Definition *for this sprite* points to a Set.
        // BUT, what if we are already a variant? The variant needs to point back to the Set?
        // Or we Iterate all sets to see if this sprite is in it? No, that's slow.
        // Ideally, generated variants are also TileDefinitions? 
        // OR the Tile stores the 'autoTileSetId' directly? 
        // Let's assume TileDefinition has it. If we swap spriteId to a variant, does that variant have a definition?
        // If not, we break the chain. 
        // DECISION: All auto-tile variants MUST be in availableTiles (or at least findable).
        // For now, let's assume `def.autoTileSetId` is sufficient. 

        if (def && def.autoTileSetId) {
            const set = autoTileSets[def.autoTileSetId];
            if (set) {
                const mask = calculateBitmask(updatedTiles, tile.gridX, tile.gridY, tile.layerId, def.autoTileSetId, tileDefs);
                const newSpriteId = set.rules[mask];

                if (newSpriteId && newSpriteId !== tile.spriteId) {
                    updatedTiles.set(key, { ...tile, spriteId: newSpriteId });
                }
            }
        }
    });

    return updatedTiles;
}
