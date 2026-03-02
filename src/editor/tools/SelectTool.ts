/**
 * Select Tool - Click to select single tiles
 */
import type { GridPos } from '../types';
import { gridKey } from '../types';
import { useEditorStore } from '../state/editorStore';

export function useSelectTool() {
    const {
        tiles,
        selectTile,
        clearSelection,
    } = useEditorStore();

    const onMouseDown = (pos: GridPos, event: MouseEvent) => {
        const { activeLayerId, characters, selectCharacter, selectCharacters } = useEditorStore.getState();

        let clickedTile: any = null;
        let clickedCharacterId: string | null = null;

        for (const [id, char] of characters) {
            if (char.layerId === activeLayerId && char.gridX === pos.x && char.gridY === pos.y) {
                clickedCharacterId = id;
                break;
            }
        }

        if (!clickedCharacterId) {
            const t = tiles.get(gridKey(pos.x, pos.y, activeLayerId));
            if (t) {
                clickedTile = t;
            }

            // Check wider bounds for text objects
            if (!clickedTile) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    for (const [, t] of tiles) {
                        if (t.spriteId === 'text_object' && t.text && t.layerId === activeLayerId) {
                            ctx.font = `${t.fontSize || 32}px "${t.fontFamily || 'sans-serif'}"`;
                            const w = ctx.measureText(t.text).width;
                            const h = t.fontSize || 32;
                            const gridSize = 32; // Default grid size
                            const wGrid = Math.ceil(w / gridSize);
                            const hGrid = Math.ceil(h / gridSize);

                            if (pos.x >= t.gridX && pos.x < t.gridX + wGrid) {
                                if (pos.y >= t.gridY && pos.y < t.gridY + hGrid) {
                                    clickedTile = t;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        const tile = clickedTile;

        if (clickedCharacterId) {
            selectCharacter(clickedCharacterId);
            // Clear tile selection if selecting a character? Or allow both?
            // For now, character selection takes precedence or we just rely on store logic.
        } else if (tile) {
            // Shift+click adds to selection
            const addToSelection = event.shiftKey;
            selectTile(tile.id, addToSelection);
            // Deselect characters when selecting a tile
            selectCharacters([]);
        } else {
            // Clicking empty space clears selection
            clearSelection();
        }
    };

    const onMouseMove = (_pos?: GridPos, _event?: MouseEvent) => {
        // No drag behavior for basic select
    };

    const onMouseUp = (_pos?: GridPos, _event?: MouseEvent) => {
        // No action needed
    };

    return { onMouseDown, onMouseMove, onMouseUp };
}
