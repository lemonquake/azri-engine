import type { GridPos, TileId } from '../types';
import { gridKey } from '../types';
import { useEditorStore } from '../state/editorStore';
import { useRef } from 'react';

export function useMultiSelectTool() {
    const {
        tiles,
        characters,
        selectTile,
        selectTiles,
        selectCharacter,
        selectCharacters,
        clearSelection,
        selectedTileIds,
        selectedCharacterIds,
        setDragStart,
        dragStart,
        setIsDragging,
        activeLayerId,
        setSelectionOffset,
        setMultiSelectRect
    } = useEditorStore();

    const modeRef = useRef<'select' | 'move'>('select');

    const onMouseDown = (pos: GridPos, event: MouseEvent) => {
        let characterId: string | null = null;

        const tile = tiles.get(gridKey(pos.x, pos.y, activeLayerId));

        // Check for character at pos on active layer
        for (const char of characters.values()) {
            if (char.gridX === pos.x && char.gridY === pos.y && char.layerId === activeLayerId) {
                characterId = char.id;
                break;
            }
        }

        const isTileSelected = tile && selectedTileIds.has(tile.id);
        const isCharSelected = characterId && selectedCharacterIds.has(characterId);

        // If clicking on an already selected item (and not holding shift), start moving
        if ((isTileSelected || isCharSelected) && !event.shiftKey) {
            modeRef.current = 'move';
            setDragStart({ x: pos.x, y: pos.y });
            setIsDragging(true);
            return;
        }

        modeRef.current = 'select';

        if (event.shiftKey) {
            // Shift+click toggles selection
            if (tile) {
                if (selectedTileIds.has(tile.id)) {
                    const newSelection = Array.from(selectedTileIds).filter(id => id !== tile.id);
                    selectTiles(newSelection);
                } else {
                    selectTile(tile.id, true);
                }
            }
            if (characterId) {
                selectCharacter(characterId, true);
            }
        } else {
            // Start box selection
            // Clear previous unless shift (which is handled above, so here means new selection)
            if (!event.shiftKey) {
                clearSelection();
            }

            // Valid click on unselected item? Select it immediately?
            // Usually box tool starts empty if clicking empty space, but if clicking an item it selects it?
            // Standard behavior: Click on item = select only that item. Click on empty = start box.
            // But this is "MultiSelectTool", essentially a Box Select tool.
            // If I click and drag on an unselected item, it should probably select it and start moving? 
            // OR just start box selection.
            // Let's stick to box selection logic: Click = start box. 
            // EXCEPT if we clicked an item, we might want to select it effectively?
            // Current code cleared selection.

            // If we clicked an unselected item without shift, let's treat it as "Select and Start Move" if we drag?
            // Or just "Start Box".
            // Implementation: Simple Box Select.

            setDragStart({ x: pos.x, y: pos.y });
            setIsDragging(true);
        }
    };

    const onMouseMove = (pos?: GridPos) => {
        if (!pos || !dragStart) return;

        if (modeRef.current === 'move') {
            const dx = pos.x - dragStart.x;
            const dy = pos.y - dragStart.y;
            setSelectionOffset({ x: dx, y: dy });
        } else {
            // Update Selection Rect
            setMultiSelectRect({
                start: dragStart,
                end: pos
            });
        }
    };

    const onMouseUp = (pos: GridPos, event: MouseEvent) => {
        if (dragStart) {
            if (modeRef.current === 'move') {
                const dx = pos.x - dragStart.x;
                const dy = pos.y - dragStart.y;
                if (dx !== 0 || dy !== 0) {
                    useEditorStore.getState().pushHistoryState();
                    const state = useEditorStore.getState();
                    state.moveSelection(dx * state.gridSize, dy * state.gridSize);
                }
                setSelectionOffset(null);
            } else {
                // Capture Box Selection
                const minX = Math.min(dragStart.x, pos.x);
                const maxX = Math.max(dragStart.x, pos.x);
                const minY = Math.min(dragStart.y, pos.y);
                const maxY = Math.max(dragStart.y, pos.y);

                const tilesInBox: TileId[] = [];
                tiles.forEach((t) => {
                    if (t.layerId === activeLayerId &&
                        t.gridX >= minX &&
                        t.gridX <= maxX &&
                        t.gridY >= minY &&
                        t.gridY <= maxY
                    ) {
                        tilesInBox.push(t.id);
                    }
                });

                const charsInBox: string[] = [];
                characters.forEach((char) => {
                    if (char.layerId === activeLayerId &&
                        char.gridX >= minX &&
                        char.gridX <= maxX &&
                        char.gridY >= minY &&
                        char.gridY <= maxY
                    ) {
                        charsInBox.push(char.id);
                    }
                });

                if (event.shiftKey) {
                    selectTiles([...Array.from(selectedTileIds), ...tilesInBox]);
                    selectCharacters([...Array.from(selectedCharacterIds), ...charsInBox]);
                } else {
                    selectTiles(tilesInBox);
                    selectCharacters(charsInBox);
                }
                setMultiSelectRect(null); // Clear rect on up
            }
        }

        setDragStart(null);
        setIsDragging(false);
        modeRef.current = 'select';
    };

    return { onMouseDown, onMouseMove, onMouseUp };
}
