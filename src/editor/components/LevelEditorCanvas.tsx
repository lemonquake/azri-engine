/**
 * LevelEditorCanvas Component - Main canvas with grid, tiles, and tool interaction
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useHistoryStore } from '../state/historyStore';
import { useBucketTool, useSelectTool, useMultiSelectTool, useBrushTool, useEraserTool, useShapeTool, useCollisionTool } from '../tools';
import type { GridPos, CollisionShape } from '../types';
import { DEFAULT_TILES, gridKey, DEFAULT_LAYER_ID, generateCollisionId } from '../types';
import {
    getBrushPoints,
    getSymmetricalPoints
} from '../utils/geometry';
import { generatePolygonFromImage } from '../../utils/imageToPolygon';
import characterRepo from '../db/repositories/CharacterRepository';
import type { CharacterEntity } from '../db/repositories/CharacterRepository';
import { EditorContextMenu } from './EditorContextMenu';
import { EnemyConfigModal } from './EnemyConfigModal';
import { GrassTile } from './tiles/GrassTile';
import { WaterTile } from './tiles/WaterTile';
import { LavaTile } from './tiles/LavaTile';
import { CrystalTile } from './tiles/CrystalTile';

const SVG_TILES = ['grass', 'water', 'lava', 'crystal'];

// Helper to rotate a point around a center
function rotatePoint(point: { x: number, y: number }, center: { x: number, y: number }, angleDegrees: number) {
    const angleRad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + (dx * cos - dy * sin),
        y: center.y + (dx * sin + dy * cos)
    };
}

type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'rot';

function getImageHandles(img: { x: number, y: number, width: number, height: number, rotation: number }) {
    const cx = img.x + img.width / 2;
    const cy = img.y + img.height / 2;
    const rot = img.rotation || 0;

    const hw = img.width / 2;
    const hh = img.height / 2;

    return {
        tl: rotatePoint({ x: cx - hw, y: cy - hh }, { x: cx, y: cy }, rot),
        tr: rotatePoint({ x: cx + hw, y: cy - hh }, { x: cx, y: cy }, rot),
        bl: rotatePoint({ x: cx - hw, y: cy + hh }, { x: cx, y: cy }, rot),
        br: rotatePoint({ x: cx + hw, y: cy + hh }, { x: cx, y: cy }, rot),
        rot: rotatePoint({ x: cx, y: cy - hh - 25 }, { x: cx, y: cy }, rot),
    };
}

function hitTestHandle(worldX: number, worldY: number, handlePos: { x: number, y: number }, radius: number = 6): boolean {
    const dx = worldX - handlePos.x;
    const dy = worldY - handlePos.y;
    return (dx * dx + dy * dy) <= (radius * radius);
}

export function LevelEditorCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Zoom and pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    const {
        tiles,
        gridSize,
        showGrid,
        activeTool,
        clearSelection, // Added
        selectedTileIds,
        selectedTileType,
        availableTiles,
        hoverPos,
        setHoverPos,
        isDragging,
        setIsDragging,
        dragStart,
        setDragStart,
        setActiveTool,
        brushSize,
        symmetry,
        showCollisions,
        characters,
        placeCharacter,
        // selectCharacter removed

        activeCharacterId,
        selectCharacters,
        selectedCharacterIds,
        layers,
        activeLayerId,
        // New Hooks
        clipboard,
        copySelection,
        pasteClipboard,
        skyboxLayers,
        pasteMirror,
        setPasteMirror,
        multiSelectRect,
        isPlacingSymmetry,
        setIsPlacingSymmetry,
        setSymmetry,
        highlightActiveLayer,
        // Physics
        physicsSettings,
        setPhysicsSettings,
        // Collision
        collisionShapes,
        selectedCollisionIds,
        selectCollisionShape,
        clearCollisionSelection,
        moveSelectedTiles,
        moveSelectedCollisionShapes,
        collisionToolMode, // Added
        collisionBrushSize, // Added
        // Level Images
        levelImages,
        selectedImageIds,
        selectImage,
        clearImageSelection,
        moveSelectedImages,
        updateLevelImage,
        duplicateSelectedImages, // Added
        moveSelection,
        selectAllTilesOnLayer,
        selectAllCollisionsOnLayer,
        selectSkyOnLayer,
    } = useEditorStore();

    // Drag Move State
    const dragMoveRef = useRef<{
        mode: 'move' | 'resize' | 'rotate' | 'brush';
        target: 'tiles' | 'collision' | 'images' | 'character' | 'selection';
        startWorld: { x: number; y: number };
        startGrid: GridPos;
        handle?: HandleType; // for resize/rotate
        initialShape?: CollisionShape; // for collision resize
        imageId?: string; // for image resize
        initialBounds?: { x: number, y: number, width: number, height: number, rotation: number }; // for image
        initialCenter?: { x: number, y: number }; // for image rotate
        collisionId?: string; // for collision resize/rotate
        initialCollisionBounds?: { x: number, y: number, width: number, height: number, rotation: number };
        initialDeathLineY?: number; // for death line dragging
    } | null>(null);

    // Helper to get selected bounding box for generic center calculation if needed
    // ...

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [enemyModalPos, setEnemyModalPos] = useState<GridPos | null>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();

        // Right click finishes polygon
        if (activeTool === 'collision' && collisionTool.isDrawingPolygon) {
            collisionTool.finishPolygon();
            return;
        }

        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleAddAutoCollision = useCallback(async () => {
        const state = useEditorStore.getState();
        let targetImgSrc: string | null = null;
        let targetX = 0, targetY = 0, targetW = 0, targetH = 0, targetRot = 0;
        let layerId = state.activeLayerId;

        // Currently supporting Level Images (Props) selection
        if (state.selectedImageIds.size === 1) {
            const imgId = Array.from(state.selectedImageIds)[0];
            const img = state.levelImages.find(i => i.id === imgId);
            if (img) {
                targetImgSrc = img.src;
                targetX = img.x;
                targetY = img.y;
                targetW = img.width;
                targetH = img.height;
                targetRot = img.rotation || 0;
                layerId = img.layerId || layerId;
            }
        } else if (state.selectedTileIds.size === 1) {
            // Also support tiles if they have an image
            const tileId = Array.from(state.selectedTileIds)[0];
            const tile = Array.from(state.tiles.values()).find(t => t.id === tileId);
            if (tile) {
                const def = state.availableTiles.find(t => t.id === tile.spriteId) || DEFAULT_TILES.find(t => t.id === tile.spriteId);
                if (def && def.textureSrc) {
                    targetImgSrc = def.textureSrc;
                    targetX = tile.gridX * gridSize;
                    targetY = tile.gridY * gridSize;
                    targetW = gridSize * tile.scaleX;
                    targetH = gridSize * tile.scaleY;
                    targetRot = tile.rotation || 0;
                    layerId = tile.layerId || layerId;
                }
            }
        }

        if (!targetImgSrc) {
            handleCloseContextMenu();
            return;
        }

        try {
            const { points, width: imgNatWidth, height: imgNatHeight } = await generatePolygonFromImage(targetImgSrc, 2.0);
            if (points.length >= 3) {
                // Scale points from natural image space to final Level space
                const scaleX = targetW / imgNatWidth;
                const scaleY = targetH / imgNatHeight;

                // We center the origin initially during tracing, actually the tracing returns points in 0...width, 0...height
                // So we need to shift them so that 0,0 is at the top-left of the targetX, targetY bounds.
                // Or if targetX, targetY is already top-left:
                const scaledPoints = points.map(p => ({
                    x: Math.round(p.x * scaleX),
                    y: Math.round(p.y * scaleY)
                }));

                // Calculate center and normalize points relative to center
                // Wait, our CollisionShape x,y is the top-left of the bounding box if we use `x` and `y` properties,
                // but for polygon it usually offsets from x,y. Let's make x,y the top left!
                const shape: CollisionShape = {
                    id: generateCollisionId(),
                    type: 'polygon',
                    layerId,
                    x: targetX,
                    y: targetY,
                    width: targetW,
                    height: targetH,
                    radius: 0,
                    vertices: scaledPoints,
                    rotation: targetRot
                };

                state.addCollisionShape(shape);
                state.clearImageSelection(); // Optional: deselect image
                state.clearSelection(); // Deselect tile
                state.selectCollisionShape(shape.id, false); // Select newly created collision
                state.setActiveTool('selectCollision');
            }
        } catch (error) {
            console.error('Failed to generate auto-collision:', error);
        }

        handleCloseContextMenu();
    }, [gridSize]);

    const handleDeleteSelection = useCallback(() => {
        const state = useEditorStore.getState();
        // const history = useHistoryStore.getState(); removed

        let modified = false;

        // Check tiles (on active layer)
        const keysToDelete: string[] = [];
        if (state.selectedTileIds.size > 0) {
            state.tiles.forEach((t, k) => {
                if (state.selectedTileIds.has(t.id) && t.layerId === state.activeLayerId) {
                    keysToDelete.push(k);
                }
            });
            if (keysToDelete.length > 0) modified = true;
        }

        // Check characters (on active layer)
        const idsToDelete: string[] = [];
        if (state.selectedCharacterIds.size > 0) {
            state.selectedCharacterIds.forEach(id => {
                const char = state.characters.get(id);
                if (char && char.layerId === state.activeLayerId) {
                    idsToDelete.push(id);
                }
            });
            if (idsToDelete.length > 0) modified = true;
        }

        // Check Level Images (Global / No Layer ID)
        const imageIdsToDelete: string[] = [];
        if (state.selectedImageIds.size > 0) {
            state.selectedImageIds.forEach(id => imageIdsToDelete.push(id));
            if (imageIdsToDelete.length > 0) modified = true;
        }

        // Check Collision Shapes (on active layer)
        const collisionIdsToDelete: string[] = [];
        if (state.selectedCollisionIds.size > 0) {
            state.selectedCollisionIds.forEach(id => {
                const shape = state.collisionShapes.get(id);
                if (shape && shape.layerId === state.activeLayerId) {
                    collisionIdsToDelete.push(id);
                }
            });
            if (collisionIdsToDelete.length > 0) modified = true;
        }

        if (modified) {
            pushState();

            if (keysToDelete.length > 0) state.removeTiles(keysToDelete);
            if (idsToDelete.length > 0) state.removeCharacters(idsToDelete);
            if (imageIdsToDelete.length > 0) state.removeLevelImages(imageIdsToDelete);
            if (collisionIdsToDelete.length > 0) state.removeCollisionShapes(collisionIdsToDelete);
        }

        handleCloseContextMenu();
    }, []);

    // Cache for character definitions to avoid frequent DB lookups
    const characterDefsRef = useRef<Map<string, CharacterEntity>>(new Map());

    // Load character definitions on mount/update
    useEffect(() => {
        const loadChars = () => {
            const allIds = new Set<string>();
            characters.forEach(c => allIds.add(c.characterId));
            if (activeCharacterId) allIds.add(activeCharacterId);

            const allChars = characterRepo.getAll();
            allChars.forEach(c => characterDefsRef.current.set(c.id, c));
        };
        loadChars();
    }, [characters, activeCharacterId]);

    // Draw loop
    const { undo, redo, canUndo, canRedo, pushState: pushHistoryState } = useHistoryStore();

    // Helper to push full state easily
    const pushState = useCallback(() => {
        const state = useEditorStore.getState();
        pushHistoryState(
            state.tiles,
            state.characters,
            state.layers,
            state.skyboxLayers,
            state.levelImages,
            state.collisionShapes,
            state.selectedTileIds,
            state.selectedCharacterIds,
            state.selectedLayerIds,
            state.selectedImageIds,
            state.selectedCollisionIds
        );
    }, [pushHistoryState]);

    // Tool hooks
    const brushTool = useBrushTool();
    const eraserTool = useEraserTool();
    const shapeTool = useShapeTool();
    const bucketTool = useBucketTool();
    const selectTool = useSelectTool();
    const multiSelectTool = useMultiSelectTool();
    const collisionTool = useCollisionTool();

    // Keep a ref to collisionTool to avoid stale closures in useEffect without constant re-binding
    const collisionToolRef = useRef(collisionTool);
    useEffect(() => {
        collisionToolRef.current = collisionTool;
    });

    // Hit-test for collision shapes (for select tool)
    const hitTestCollisionShape = useCallback((shape: CollisionShape, wx: number, wy: number): boolean => {
        if (shape.type === 'box') {
            // Simple AABB (no rotation for hit test simplicity; rotation applied at render)
            const rad = shape.rotation * Math.PI / 180;
            if (rad === 0) {
                return wx >= shape.x && wx <= shape.x + shape.width &&
                    wy >= shape.y && wy <= shape.y + shape.height;
            }
            // Rotate point into local space
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;
            const cos = Math.cos(-rad);
            const sin = Math.sin(-rad);
            const lx = cos * (wx - cx) - sin * (wy - cy) + cx;
            const ly = sin * (wx - cx) + cos * (wy - cy) + cy;
            return lx >= shape.x && lx <= shape.x + shape.width &&
                ly >= shape.y && ly <= shape.y + shape.height;
        } else if (shape.type === 'circle') {
            const dx = wx - shape.x;
            const dy = wy - shape.y;
            return dx * dx + dy * dy <= shape.radius * shape.radius;
        } else if (shape.type === 'polygon' && shape.vertices.length >= 3) {
            // Point-in-polygon (ray casting)
            const verts = shape.vertices.map(v => ({ x: v.x + shape.x, y: v.y + shape.y }));
            let inside = false;
            for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
                const xi = verts[i].x, yi = verts[i].y;
                const xj = verts[j].x, yj = verts[j].y;
                if ((yi > wy) !== (yj > wy) && wx < (xj - xi) * (wy - yi) / (yj - yi) + xi) {
                    inside = !inside;
                }
            }
            return inside;
        }
        return false;
    }, []);

    // Hit-test for Level Images
    const hitTestLevelImage = useCallback((img: any, wx: number, wy: number): boolean => {
        // Rotated Rectangle Hit Test
        const cx = img.x + img.width / 2;
        const cy = img.y + img.height / 2;
        const rad = -(img.rotation || 0) * Math.PI / 180; // Negative for reverse rotation

        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const dx = wx - cx;
        const dy = wy - cy;

        const localX = cx + (dx * cos - dy * sin);
        const localY = cy + (dx * sin + dy * cos);

        return localX >= img.x && localX <= img.x + img.width &&
            localY >= img.y && localY <= img.y + img.height;
    }, []);

    // Convert pixel position to grid position
    const pixelToGrid = useCallback((pixelX: number, pixelY: number): GridPos => {
        return {
            x: Math.floor((pixelX - pan.x) / zoom / gridSize),
            y: Math.floor((pixelY - pan.y) / zoom / gridSize),
        };
    }, [gridSize, pan, zoom]);

    // Convert pixel to world coordinates (not grid-snapped)
    const pixelToWorld = useCallback((pixelX: number, pixelY: number) => {
        return {
            x: (pixelX - pan.x) / zoom,
            y: (pixelY - pan.y) / zoom,
        };
    }, [pan, zoom]);

    // Handle Tools
    const handleToolDown = (pos: GridPos, e: MouseEvent) => {
        const activeLayer = layers.find(l => l.id === activeLayerId);
        const isLayerLocked = activeLayer?.locked;

        if (isLayerLocked && ['brush', 'eraser', 'line', 'rectangle', 'circle', 'character', 'spawn', 'bucket', 'paste', 'collision', 'multiSelect'].includes(activeTool)) {
            return;
        }

        if (activeTool === 'brush') {
            brushTool.onMouseDown(pos);
            setIsDragging(true); // Redundant if hook handles it, but good for local state sync
            setDragStart(pos);
        } else if (activeTool === 'eraser') {
            eraserTool.onMouseDown(pos);
            setIsDragging(true);
            setDragStart(pos);
        } else if (['line', 'rectangle', 'circle'].includes(activeTool)) {
            shapeTool.onMouseDown(pos);
        } else if (activeTool === 'collision') {
            // Collision uses world-pixel coords, not grid pos
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
                collisionTool.onMouseDown(world.x, world.y, e.detail >= 2);
            }
        } else if (activeTool === 'spawn') {
            pushState();
            placeCharacter({
                id: `player_spawn_${Date.now()}`,
                characterId: 'default',
                gridX: pos.x,
                gridY: pos.y,
                layerId: activeLayerId,
                overrideProperties: { isPlayer: true }
            });
            setActiveTool('select');
        } else if (activeTool === 'text') {
            pushState();
            const textTileId = `text_${Date.now()}`;
            useEditorStore.getState().placeTile({
                id: textTileId,
                gridX: pos.x,
                gridY: pos.y,
                layerId: activeLayerId,
                spriteId: 'text_object',
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                text: 'New Text',
                fontFamily: 'sans-serif',
                fontSize: 32,
                fontColor: '#ffffff'
            });
            useEditorStore.getState().selectTiles([textTileId]);
            setActiveTool('select');
        } else if (activeTool === 'enemy') {
            setEnemyModalPos(pos);
        } else if (activeTool === 'character') {
            if (activeCharacterId) {
                pushState();
                const newInstance = {
                    id: `char_inst_${Date.now()}`,
                    characterId: activeCharacterId,
                    gridX: pos.x,
                    gridY: pos.y,
                    layerId: activeLayerId,
                };
                placeCharacter(newInstance);
            }
        } else {
            // Legacy/Special tools
            if (activeTool === 'bucket') bucketTool.onMouseDown(pos);
            if (activeTool === 'select') {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);

                // 1. Check for Image Handles (Resize/Rotate)
                let handleClicked = false;
                // Check all selected images for handle clicks
                // Iterate in reverse to match rendering order (top on top) ??
                // Actually rendering is back-to-front. So check front-to-back?
                // `levelImages` is rendered in order. So last one is on top.
                const selectedImgs = levelImages.filter(img => selectedImageIds.has(img.id));
                // We should check interaction front-to-back
                // Since selected images are usually drawn on top (or we want to prioritize them)

                const hitRadius = 10 / zoom;
                for (const img of selectedImgs) {
                    const handles = getImageHandles(img);
                    // Check handles
                    if (hitTestHandle(world.x, world.y, handles.rot, hitRadius)) {
                        dragMoveRef.current = {
                            mode: 'rotate',
                            target: 'images',
                            startWorld: world,
                            startGrid: pos,
                            imageId: img.id,
                            initialBounds: { ...img },
                            initialCenter: { x: img.x + img.width / 2, y: img.y + img.height / 2 }
                        };
                        pushState();
                        setIsDragging(true);
                        handleClicked = true;
                        break;
                    }

                    // Check resize handles
                    const checkResize = (type: HandleType, pos: { x: number, y: number }) => {
                        if (hitTestHandle(world.x, world.y, pos, hitRadius)) {
                            dragMoveRef.current = {
                                mode: 'resize',
                                target: 'images',
                                startWorld: world,
                                startGrid: pos,
                                imageId: img.id,
                                handle: type,
                                initialBounds: { ...img },
                                initialCenter: { x: img.x + img.width / 2, y: img.y + img.height / 2 }
                            };
                            pushState();
                            setIsDragging(true);
                            handleClicked = true;
                            return true;
                        }
                        return false;
                    };

                    if (checkResize('tl', handles.tl)) break;
                    if (checkResize('tr', handles.tr)) break;
                    if (checkResize('bl', handles.bl)) break;
                    if (checkResize('br', handles.br)) break;
                }

                if (handleClicked) return;

                if (handleClicked) return;

                // 2. Check for Resize Handles (Collision)
                if (selectedCollisionIds.size === 1) {
                    const id = Array.from(selectedCollisionIds)[0];
                    const shape = collisionShapes.get(id);
                    if (shape && shape.type === 'box') {
                        const handles = getImageHandles(shape as any);

                        if (hitTestHandle(world.x, world.y, handles.rot, hitRadius)) {
                            dragMoveRef.current = {
                                mode: 'rotate', target: 'collision', startWorld: world, startGrid: pos,
                                collisionId: id, initialCollisionBounds: { ...shape },
                                initialCenter: { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
                            };
                            pushState();
                            setIsDragging(true); return;
                        }
                        const checkResize = (type: HandleType, handlePos: { x: number, y: number }) => {
                            if (hitTestHandle(world.x, world.y, handlePos, hitRadius)) {
                                dragMoveRef.current = {
                                    mode: 'resize', target: 'collision', startWorld: world, startGrid: pos,
                                    handle: type, collisionId: id, initialCollisionBounds: { ...shape },
                                    initialCenter: { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
                                };
                                pushState();
                                setIsDragging(true); return true;
                            }
                            return false;
                        };
                        if (checkResize('tl', handles.tl)) return;
                        if (checkResize('tr', handles.tr)) return;
                        if (checkResize('bl', handles.bl)) return;
                        if (checkResize('br', handles.br)) return;
                    }
                }

                // 3. Check for Click on ANY Selected Item (Start Unified Drag-Move)
                let clickedSelectedCollision = false;
                collisionShapes.forEach(shape => {
                    if (selectedCollisionIds.has(shape.id) && hitTestCollisionShape(shape, world.x, world.y)) {
                        clickedSelectedCollision = true;
                    }
                });

                let clickedSelectedImage = false;
                levelImages.forEach(img => {
                    if (selectedImageIds.has(img.id) && hitTestLevelImage(img, world.x, world.y)) {
                        clickedSelectedImage = true;
                    }
                });

                let clickedSelectedTile = false;
                const tileKey = gridKey(pos.x, pos.y, activeLayerId);
                const tile = tiles.get(tileKey);
                if (tile && selectedTileIds.has(tile.id)) {
                    clickedSelectedTile = true;
                }

                let clickedSelectedChar = false;
                Array.from(characters.values()).forEach(c => {
                    if (c.gridX === pos.x && c.gridY === pos.y && selectedCharacterIds.has(c.id)) {
                        clickedSelectedChar = true;
                    }
                });

                if (clickedSelectedCollision || clickedSelectedImage || clickedSelectedTile || clickedSelectedChar) {
                    dragMoveRef.current = {
                        mode: 'move',
                        target: 'selection', // Unified target
                        startWorld: world,
                        startGrid: pos,
                    };
                    pushState();
                    setIsDragging(true);
                    return;
                }

                // 5. Normal Select Logic (Unselected)

                // Images
                let imageClicked = false;
                for (let i = levelImages.length - 1; i >= 0; i--) {
                    const img = levelImages[i];
                    if (!img.visible) continue;
                    if (img.locked) continue;
                    if (img.layerId !== activeLayerId) continue;

                    if (hitTestLevelImage(img, world.x, world.y)) {
                        selectImage(img.id, e.shiftKey);
                        imageClicked = true;

                        // Start dragging immediately if not multiselecting (or even if multiselecting?)
                        // If we just added to selection, we probably want to move the whole selection?
                        // If we hold shift, we add to selection.

                        // Let's enable drag immediately.
                        dragMoveRef.current = {
                            mode: 'move',
                            target: 'images',
                            startWorld: world,
                            startGrid: pos,
                        };
                        pushState();
                        setIsDragging(true);

                        break;
                    }
                }
                if (imageClicked) {
                    if (!e.shiftKey) {
                        clearCollisionSelection();
                        clearSelection();
                        selectCharacters([]);
                    }
                    return;
                }
                if (!e.shiftKey) clearImageSelection();

                // Collision Shapes
                let collisionClicked = false;
                collisionShapes.forEach(shape => {
                    if (shape.layerId !== activeLayerId) return;
                    if (hitTestCollisionShape(shape, world.x, world.y)) {
                        selectCollisionShape(shape.id, e.shiftKey);
                        collisionClicked = true;
                    }
                });
                if (collisionClicked) return;
                if (!e.shiftKey) clearCollisionSelection();

                // Tiles / Characters
                Array.from(characters.values()).forEach(c => {
                    if (c.gridX === pos.x && c.gridY === pos.y) {
                        pushState();
                        setSymmetry({ enabled: false });
                    }
                });

                selectTool.onMouseDown(pos, e);
            }
            if (activeTool === 'selectCollision') {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);

                const hitRadius = 10 / zoom;

                // 1. Check handles of selected collisions
                if (selectedCollisionIds.size === 1) {
                    const id = Array.from(selectedCollisionIds)[0];
                    const shape = collisionShapes.get(id);
                    if (shape && shape.type === 'box') {
                        const handles = getImageHandles(shape as any); // using shape as it has x,y,width,height,rotation

                        if (hitTestHandle(world.x, world.y, handles.rot, hitRadius)) {
                            dragMoveRef.current = {
                                mode: 'rotate', target: 'collision', startWorld: world, startGrid: pos,
                                collisionId: id, initialCollisionBounds: { ...shape },
                                initialCenter: { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
                            };
                            pushState();
                            setIsDragging(true); return;
                        }
                        const checkResize = (type: HandleType, handlePos: { x: number, y: number }) => {
                            if (hitTestHandle(world.x, world.y, handlePos, hitRadius)) {
                                dragMoveRef.current = {
                                    mode: 'resize', target: 'collision', startWorld: world, startGrid: pos,
                                    handle: type, collisionId: id, initialCollisionBounds: { ...shape },
                                    initialCenter: { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
                                };
                                pushState();
                                setIsDragging(true); return true;
                            }
                            return false;
                        };
                        if (checkResize('tl', handles.tl)) return;
                        if (checkResize('tr', handles.tr)) return;
                        if (checkResize('bl', handles.bl)) return;
                        if (checkResize('br', handles.br)) return;
                    }
                }

                // 2. Check click on selected body
                let bodyClicked = false;
                collisionShapes.forEach(shape => {
                    if (selectedCollisionIds.has(shape.id) && hitTestCollisionShape(shape, world.x, world.y)) {
                        bodyClicked = true;
                    }
                });

                if (bodyClicked) {
                    dragMoveRef.current = { mode: 'move', target: 'collision', startWorld: world, startGrid: pos };
                    pushState();
                    setIsDragging(true);
                    return;
                }

                // 3. Selection click
                let collisionClicked = false;
                collisionShapes.forEach(shape => {
                    if (shape.layerId !== activeLayerId) return;
                    if (hitTestCollisionShape(shape, world.x, world.y)) {
                        selectCollisionShape(shape.id, e.shiftKey);
                        collisionClicked = true;

                        dragMoveRef.current = { mode: 'move', target: 'collision', startWorld: world, startGrid: pos };
                        pushState();
                        setIsDragging(true);
                    }
                });

                if (!collisionClicked && !e.shiftKey) {
                    clearCollisionSelection();
                }
            }
            if (activeTool === 'multiSelect') {
                multiSelectTool.onMouseDown(pos, e);
                setIsDragging(true);
                setDragStart(pos);
            }
            if (activeTool === 'paste') {
                pasteClipboard(pos, pasteMirror.x, pasteMirror.y);
            }
        }
    };

    const handleToolMove = (pos: GridPos, e: MouseEvent) => {
        if (activeTool === 'collision') {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
                collisionTool.onMouseMove(world.x, world.y);
            }
            return;
        }


        if (activeTool === 'select' && !isDragging) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
                let cursor = 'default';
                const hitRadius = 8 / zoom; // Match visual handle size roughly

                // 1. Check Handles of Selected Images
                const selectedImgs = levelImages.filter(img => selectedImageIds.has(img.id));
                // Check in reverse rendering order (top first)
                for (let i = selectedImgs.length - 1; i >= 0; i--) {
                    const img = selectedImgs[i];
                    const handles = getImageHandles(img);

                    if (hitTestHandle(world.x, world.y, handles.rot, hitRadius)) {
                        cursor = 'grab';
                        break;
                    }
                    if (hitTestHandle(world.x, world.y, handles.tl, hitRadius) || hitTestHandle(world.x, world.y, handles.br, hitRadius)) {
                        cursor = 'nwse-resize';
                        break;
                    }
                    if (hitTestHandle(world.x, world.y, handles.tr, hitRadius) || hitTestHandle(world.x, world.y, handles.bl, hitRadius)) {
                        cursor = 'nesw-resize';
                        break;
                    }

                    if (hitTestLevelImage(img, world.x, world.y)) {
                        cursor = 'move';
                    }
                }

                // 2. Check Unselected Images (Selectable)
                if (cursor === 'default') {
                    for (let i = levelImages.length - 1; i >= 0; i--) {
                        const img = levelImages[i];
                        if (selectedImageIds.has(img.id)) continue;
                        if (!img.visible || img.locked) continue;
                        if (img.layerId !== activeLayerId) continue;

                        if (hitTestLevelImage(img, world.x, world.y)) {
                            cursor = 'pointer';
                            break;
                        }
                    }
                }

                if (canvasRef.current) {
                    canvasRef.current.style.cursor = cursor;
                }
            }
        }

        if (activeTool === 'selectCollision' && !isDragging) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
                let cursor = 'default';
                const hitRadius = 8 / zoom;

                if (selectedCollisionIds.size === 1) {
                    const id = Array.from(selectedCollisionIds)[0];
                    const shape = collisionShapes.get(id);
                    if (shape && shape.type === 'box') {
                        const handles = getImageHandles(shape as any);
                        if (hitTestHandle(world.x, world.y, handles.rot, hitRadius)) cursor = 'grab';
                        else if (hitTestHandle(world.x, world.y, handles.tl, hitRadius) || hitTestHandle(world.x, world.y, handles.br, hitRadius)) cursor = 'nwse-resize';
                        else if (hitTestHandle(world.x, world.y, handles.tr, hitRadius) || hitTestHandle(world.x, world.y, handles.bl, hitRadius)) cursor = 'nesw-resize';
                        else if (hitTestCollisionShape(shape, world.x, world.y)) cursor = 'move';
                    }
                }

                if (cursor === 'default') {
                    for (const [, shape] of collisionShapes) {
                        if (shape.layerId !== activeLayerId) continue;
                        if (selectedCollisionIds.has(shape.id)) continue;
                        if (hitTestCollisionShape(shape, world.x, world.y)) {
                            cursor = 'pointer';
                            break;
                        }
                    }
                }

                if (canvasRef.current) {
                    canvasRef.current.style.cursor = cursor;
                }
            }
        }

        if (isDragging && dragMoveRef.current && (activeTool === 'select' || activeTool === 'selectCollision')) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const world = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);

            // 1. Image Rotate
            if (dragMoveRef.current.mode === 'rotate' && dragMoveRef.current.imageId) { // Removed target check to avoid TS strict narrowing if union is weird, but dragRef type has target..
                // Actually if I check mode='rotate', TS knows target must be 'images' if I typed it correctly.
                // But let's keep it simple.
                const { initialBounds, initialCenter } = dragMoveRef.current;
                if (initialBounds && initialCenter) {
                    const dx = world.x - initialCenter.x;
                    const dy = world.y - initialCenter.y;
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                    const startDx = dragMoveRef.current.startWorld.x - initialCenter.x;
                    const startDy = dragMoveRef.current.startWorld.y - initialCenter.y;
                    const startAngle = Math.atan2(startDy, startDx) * 180 / Math.PI;

                    const deltaAngle = angle - startAngle;
                    let newRot = initialBounds.rotation + deltaAngle;

                    if (e.shiftKey) {
                        newRot = Math.round(newRot / 15) * 15;
                    }

                    updateLevelImage(dragMoveRef.current.imageId, { rotation: newRot });
                }
                return;
            } else if (dragMoveRef.current.mode === 'rotate' && dragMoveRef.current.collisionId) {
                const { initialCollisionBounds, initialCenter } = dragMoveRef.current;
                if (initialCollisionBounds && initialCenter) {
                    const dx = world.x - initialCenter.x;
                    const dy = world.y - initialCenter.y;
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                    const startDx = dragMoveRef.current.startWorld.x - initialCenter.x;
                    const startDy = dragMoveRef.current.startWorld.y - initialCenter.y;
                    const startAngle = Math.atan2(startDy, startDx) * 180 / Math.PI;

                    const deltaAngle = angle - startAngle;
                    let newRot = initialCollisionBounds.rotation + deltaAngle;

                    if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;

                    useEditorStore.getState().updateCollisionShape(dragMoveRef.current.collisionId, { rotation: newRot });
                }
                return;
            }

            // 2. Image Resize
            if (dragMoveRef.current.mode === 'resize' && dragMoveRef.current.imageId) {
                const { initialBounds, initialCenter, handle } = dragMoveRef.current;
                if (initialBounds && initialCenter) {
                    const dx = world.x - dragMoveRef.current.startWorld.x;
                    const dy = world.y - dragMoveRef.current.startWorld.y;

                    const rad = -initialBounds.rotation * Math.PI / 180;
                    const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
                    const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);

                    let newW = initialBounds.width;
                    let newH = initialBounds.height;
                    let centerX = initialCenter.x;
                    let centerY = initialCenter.y;

                    if (handle === 'br') {
                        newW += localDx;
                        newH += localDy;
                    } else if (handle === 'bl') {
                        newW -= localDx;
                        newH += localDy;
                    } else if (handle === 'tr') {
                        newW += localDx;
                        newH -= localDy;
                    } else if (handle === 'tl') {
                        newW -= localDx;
                        newH -= localDy;
                    }

                    // Aspect ratio lock? (Shift key) - Optional TODO

                    if (e.shiftKey) {
                        const ratio = initialBounds.width / initialBounds.height;
                        // Logic to lock ratio based on the larger dimension change or specific handle behavior
                        // Simple approach: preserve ratio based on Width change if horizontal drag is dominant?
                        // Or just recalculate H based on W?
                        // Let's use the magnitude of the diagonal vector?
                        // Simpler: Just force H = W / ratio

                        // We need to ensure we don't flip the sign implies checking directions.
                        // For now, let's just straightforwardly set H
                        newH = newW / ratio;
                    }

                    if (newW < 10) newW = 10;
                    if (newH < 10) newH = 10;

                    // Recalculate center based on new dimensions and handle position
                    // This is tricky because we need the anchor point (opposite corner) to stay fixed.
                    // The previous logic was calculating center shift based on delta.
                    // If we modify newW/newH arbitrarily, we need to recalculate center from the anchor.

                    // Let's find the anchor point in local space (relative to initial center)
                    const halfW = initialBounds.width / 2;
                    const halfH = initialBounds.height / 2;
                    let anchorX = 0;
                    let anchorY = 0;

                    if (handle === 'tl') { anchorX = halfW; anchorY = halfH; }
                    else if (handle === 'tr') { anchorX = -halfW; anchorY = halfH; }
                    else if (handle === 'bl') { anchorX = halfW; anchorY = -halfH; }
                    else if (handle === 'br') { anchorX = -halfW; anchorY = -halfH; }

                    // The new dimensions are newW, newH.
                    // The anchor point should remain at the same WORLD position.
                    // But we are updating x,y (top-left) and width/height.
                    // Actually, let's look at the center shift logic again.
                    // It was: centerX += centerShift.x

                    // Alternative:
                    // 1. Calculate anchor point in World Space (it doesn't move).
                    // 2. Calculate new Center in World Space based on new dimensions and rotation.
                    // Anchor is `initialCenter` + rotated(anchorLocal).

                    const radInitial = initialBounds.rotation * Math.PI / 180;
                    const cos = Math.cos(radInitial);
                    const sin = Math.sin(radInitial);

                    const anchorWorldX = initialCenter.x + (anchorX * cos - anchorY * sin);
                    const anchorWorldY = initialCenter.y + (anchorX * sin + anchorY * cos);

                    // New Center relative to Anchor?
                    // The handle is at the opposite side. 
                    // New Center is Anchor + rotated(NewHalfSize * DirectionToCenter)
                    // DirectionToCenter from Anchor is opposite to the handle direction.
                    // Actually, simply:
                    // TL handle moves, BR is anchor.
                    // New Center is midway between new handle pos and anchor.
                    // But we constrained new handle pos by aspect ratio?

                    // Let's stick to the previous delta logic but adjusted for the forced ratio.
                    // The "localDx" effectively determines the new width.
                    // If we locked aspect ratio, effective localDy changed.

                    if (e.shiftKey) {
                        // Recalculate localDy based on the Ratio-enforced Height change
                        // Recalculate localDy based on the Ratio-enforced Height change
                        // const deltaH = newH - initialBounds.height; // Unused
                        // But wait, the sign of deltaH depends on handle.
                        // If 'br', positive deltaW means positive deltaH.
                        // If 'tr', positive deltaW means positive deltaH (scale up) but y changes differently.

                        // Let's simplify: 
                        // Just use the logic: Center = Anchor - rotated(NewHalfSize * Sign)
                        // where Sign depends on handle.

                        let signX = 0; let signY = 0;
                        if (handle === 'tl') { signX = 1; signY = 1; }
                        else if (handle === 'tr') { signX = -1; signY = 1; }
                        else if (handle === 'bl') { signX = 1; signY = -1; }
                        else if (handle === 'br') { signX = -1; signY = -1; }

                        const newHalfW = newW / 2;
                        const newHalfH = newH / 2;

                        // Vector from Anchor to Center in unrotated space is (-signX * newHalfW, -signY * newHalfH)
                        const offsetX = -signX * newHalfW;
                        const offsetY = -signY * newHalfH;

                        centerX = anchorWorldX + (offsetX * cos - offsetY * sin);
                        centerY = anchorWorldY + (offsetX * sin + offsetY * cos);

                    } else {
                        // Use existing logic for non-constrained
                        if (handle === 'br') {
                            const centerShift = rotatePoint({ x: localDx / 2, y: localDy / 2 }, { x: 0, y: 0 }, initialBounds.rotation);
                            centerX += centerShift.x;
                            centerY += centerShift.y;
                        } else if (handle === 'tl') {
                            const centerShift = rotatePoint({ x: localDx / 2, y: localDy / 2 }, { x: 0, y: 0 }, initialBounds.rotation);
                            centerX += centerShift.x;
                            centerY += centerShift.y;
                        } else if (handle === 'tr') {
                            const centerShift = rotatePoint({ x: localDx / 2, y: localDy / 2 }, { x: 0, y: 0 }, initialBounds.rotation);
                            centerX += centerShift.x;
                            centerY += centerShift.y;
                        } else if (handle === 'bl') {
                            const centerShift = rotatePoint({ x: localDx / 2, y: localDy / 2 }, { x: 0, y: 0 }, initialBounds.rotation);
                            centerX += centerShift.x;
                            centerY += centerShift.y;
                        }
                    }

                    updateLevelImage(dragMoveRef.current.imageId, {
                        width: newW,
                        height: newH,
                        x: centerX - newW / 2,
                        y: centerY - newH / 2
                    });
                }
                return;
            } else if (dragMoveRef.current.mode === 'resize' && dragMoveRef.current.collisionId) {
                const { initialCollisionBounds, initialCenter, handle } = dragMoveRef.current;
                if (initialCollisionBounds && initialCenter) {
                    const dx = world.x - dragMoveRef.current.startWorld.x;
                    const dy = world.y - dragMoveRef.current.startWorld.y;

                    const rad = -initialCollisionBounds.rotation * Math.PI / 180;
                    const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
                    const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);

                    let newW = initialCollisionBounds.width;
                    let newH = initialCollisionBounds.height;
                    let centerX = initialCenter.x;
                    let centerY = initialCenter.y;

                    if (handle === 'br') { newW += localDx; newH += localDy; }
                    else if (handle === 'bl') { newW -= localDx; newH += localDy; }
                    else if (handle === 'tr') { newW += localDx; newH -= localDy; }
                    else if (handle === 'tl') { newW -= localDx; newH -= localDy; }

                    if (e.shiftKey) {
                        const ratio = initialCollisionBounds.width / initialCollisionBounds.height;
                        newH = newW / ratio;
                        let signX = 0; let signY = 0;
                        if (handle === 'tl') { signX = 1; signY = 1; }
                        else if (handle === 'tr') { signX = -1; signY = 1; }
                        else if (handle === 'bl') { signX = 1; signY = -1; }
                        else if (handle === 'br') { signX = -1; signY = -1; }

                        const newHalfW = newW / 2;
                        const newHalfH = newH / 2;
                        const offsetX = -signX * newHalfW;
                        const offsetY = -signY * newHalfH;

                        const radInitial = initialCollisionBounds.rotation * Math.PI / 180;
                        const cos = Math.cos(radInitial);
                        const sin = Math.sin(radInitial);
                        let anchorX = 0; let anchorY = 0;
                        const halfW = initialCollisionBounds.width / 2;
                        const halfH = initialCollisionBounds.height / 2;
                        if (handle === 'tl') { anchorX = halfW; anchorY = halfH; }
                        else if (handle === 'tr') { anchorX = -halfW; anchorY = halfH; }
                        else if (handle === 'bl') { anchorX = halfW; anchorY = -halfH; }
                        else if (handle === 'br') { anchorX = -halfW; anchorY = -halfH; }
                        const anchorWorldX = initialCenter.x + (anchorX * cos - anchorY * sin);
                        const anchorWorldY = initialCenter.y + (anchorX * sin + anchorY * cos);

                        centerX = anchorWorldX + (offsetX * cos - offsetY * sin);
                        centerY = anchorWorldY + (offsetX * sin + offsetY * cos);
                    } else {
                        const centerShift = rotatePoint({ x: localDx / 2, y: localDy / 2 }, { x: 0, y: 0 }, initialCollisionBounds.rotation);
                        centerX += centerShift.x;
                        centerY += centerShift.y;
                    }
                    if (newW < 2) newW = 2;
                    if (newH < 2) newH = 2;

                    useEditorStore.getState().updateCollisionShape(dragMoveRef.current.collisionId, {
                        width: newW,
                        height: newH,
                        x: centerX - newW / 2,
                        y: centerY - newH / 2
                    });
                }
                return;
            }

            // 3. Move Logic
            const dx = world.x - dragMoveRef.current.startWorld.x;
            const dy = world.y - dragMoveRef.current.startWorld.y;

            if (dragMoveRef.current.target === 'selection') {
                const hasGridItems = selectedTileIds.size > 0 || selectedCharacterIds.size > 0;

                if (hasGridItems) {
                    const gridDx = Math.round(dx / gridSize);
                    const gridDy = Math.round(dy / gridSize);

                    if (gridDx !== 0 || gridDy !== 0) {
                        moveSelection(gridDx * gridSize, gridDy * gridSize);
                        dragMoveRef.current.startWorld.x += gridDx * gridSize;
                        dragMoveRef.current.startWorld.y += gridDy * gridSize;
                    }
                } else {
                    if (dx !== 0 || dy !== 0) {
                        if (e.ctrlKey) {
                            const snapDx = Math.round(dx / gridSize) * gridSize;
                            const snapDy = Math.round(dy / gridSize) * gridSize;
                            if (snapDx !== 0 || snapDy !== 0) {
                                moveSelection(snapDx, snapDy);
                                dragMoveRef.current.startWorld.x += snapDx;
                                dragMoveRef.current.startWorld.y += snapDy;
                            }
                        } else {
                            moveSelection(dx, dy);
                            dragMoveRef.current.startWorld = world;
                        }
                    }
                }
            } else if (dragMoveRef.current.target === 'collision') {
                if (dx !== 0 || dy !== 0) {
                    moveSelectedCollisionShapes(dx, dy);
                    dragMoveRef.current.startWorld = world;
                }
            } else if (dragMoveRef.current.target === 'images') {
                if (e.ctrlKey) {
                    const snapDx = Math.round(dx / gridSize) * gridSize;
                    const snapDy = Math.round(dy / gridSize) * gridSize;
                    if (snapDx !== 0 || snapDy !== 0) {
                        moveSelectedImages(snapDx, snapDy);
                        dragMoveRef.current.startWorld.x += snapDx;
                        dragMoveRef.current.startWorld.y += snapDy;
                    }
                } else {
                    if (dx !== 0 || dy !== 0) {
                        moveSelectedImages(dx, dy);
                        dragMoveRef.current.startWorld = world;
                    }
                }
            } else if (dragMoveRef.current.target === 'tiles') {
                const gridDx = Math.round(dx / gridSize);
                const gridDy = Math.round(dy / gridSize);
                if (gridDx !== 0 || gridDy !== 0) {
                    moveSelectedTiles({ x: gridDx, y: gridDy });
                    dragMoveRef.current.startWorld.x += gridDx * gridSize;
                    dragMoveRef.current.startWorld.y += gridDy * gridSize;
                }
            }
            return;
        }

        if (isDragging && dragStart) {
            if (activeTool === 'brush') {
                brushTool.onMouseMove(pos);
            } else if (activeTool === 'eraser') {
                eraserTool.onMouseMove(pos);
            } else if (['line', 'rectangle', 'circle'].includes(activeTool)) {
                shapeTool.onMouseMove(pos);
            } else {
                if (activeTool === 'select') selectTool.onMouseMove(pos, e);
                if (activeTool === 'multiSelect') multiSelectTool.onMouseMove(pos);
            }
        }
    };

    const handleToolUp = (pos: GridPos, e: MouseEvent) => {
        if (activeTool === 'collision') {
            collisionTool.onMouseUp();
            return;
        }

        if (isDragging && dragMoveRef.current && (activeTool === 'select' || activeTool === 'selectCollision')) {
            if (dragMoveRef.current.target === 'selection' && dragMoveRef.current.initialDeathLineY !== undefined) {
                // Done dragging death line
                dragMoveRef.current = null;
                setIsDragging(false);
                return;
            } else if (dragMoveRef.current.target === 'tiles') {
                const dx = pos.x - dragMoveRef.current.startGrid.x;
                const dy = pos.y - dragMoveRef.current.startGrid.y;
                if (dx !== 0 || dy !== 0) {
                    moveSelectedTiles({ x: dx, y: dy });
                }
            }
            // Collision move was live, so nothing to do here
            dragMoveRef.current = null;
            setIsDragging(false);
            return;
        }

        if (isDragging && dragStart) {
            if (['line', 'rectangle', 'circle'].includes(activeTool)) {
                shapeTool.onMouseUp(pos);
            } else {
                if (activeTool === 'bucket') bucketTool.onMouseUp(pos, e);
                if (activeTool === 'select') selectTool.onMouseUp(pos, e);
                if (activeTool === 'multiSelect') multiSelectTool.onMouseUp(pos, e);
            }
        }
        setIsDragging(false);
        setDragStart(null);
    };

    // Pan Handlers
    const handlePanStart = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handlePanMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        }
    };

    const handlePanEnd = () => {
        setIsPanning(false);
    };


    // Generic Mouse handlers
    const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Check for Pan
        if (e.button === 1 || e.altKey) {
            handlePanStart(e);
            return;
        }

        const worldY = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top).y;

        // Death line drag check (only if enabled and using select tool)
        if (activeTool === 'select' && physicsSettings.isDeathLineEnabled && physicsSettings.deathLineY !== undefined) {
            const hitTolerance = 12 / zoom;
            if (Math.abs(worldY - physicsSettings.deathLineY) <= hitTolerance) {
                dragMoveRef.current = {
                    mode: 'move',
                    target: 'selection',
                    startWorld: pixelToWorld(e.clientX - rect.left, e.clientY - rect.top),
                    startGrid: pixelToGrid(e.clientX - rect.left, e.clientY - rect.top),
                    initialDeathLineY: physicsSettings.deathLineY
                };
                pushState();
                setIsDragging(true);
                return; // Stop here, we are dragging the line
            }
        }

        const pos = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top);

        // Symmetry Placement Mode
        if (isPlacingSymmetry) {
            setSymmetry({ center: pos });
            setIsPlacingSymmetry(false);
            return;
        }

        handleToolDown(pos, e.nativeEvent);
    };

    const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (isPanning) {
            handlePanMove(e);
            return;
        }

        // If dragging death line
        if (isDragging && dragMoveRef.current?.target === 'selection' && dragMoveRef.current.initialDeathLineY !== undefined) {
            const worldY = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top).y;
            const dy = worldY - dragMoveRef.current.startWorld.y;
            setPhysicsSettings({ deathLineY: Math.round(dragMoveRef.current.initialDeathLineY + dy) });
            return;
        }

        const pos = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top);
        setHoverPos(pos);
        handleToolMove(pos, e.nativeEvent);
    };

    const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (isPanning) {
            handlePanEnd();
            return;
        }

        const pos = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top);
        handleToolUp(pos, e.nativeEvent);
    };

    const handleMouseLeave = () => {
        setHoverPos(null);
        if (isDragging) {
            setIsDragging(false);
            setDragStart(null);
        }
        if (isPanning) {
            handlePanEnd();
        }
    };

    const zoomIn = useCallback(() => setZoom(z => Math.min(4, z * 1.25)), []);
    const zoomOut = useCallback(() => setZoom(z => Math.max(0.25, z / 1.25)), []);
    const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(0.25, Math.min(4, z * delta)));
    }, []);

    // Keys
    useEffect(() => {
        const panSpeed = 10;
        const pressedKeys = new Set<string>();
        let animationFrameId: number | null = null;
        const updatePan = () => {
            if (pressedKeys.size === 0) { animationFrameId = null; return; }
            let dx = 0; let dy = 0;
            if (pressedKeys.has('w')) dy += panSpeed;
            if (pressedKeys.has('s')) dy -= panSpeed;
            if (pressedKeys.has('a')) dx += panSpeed;
            if (pressedKeys.has('d')) dx -= panSpeed;
            if (dx !== 0 || dy !== 0) setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            animationFrameId = requestAnimationFrame(updatePan);
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(key) && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (!pressedKeys.has(key)) {
                    pressedKeys.add(key);
                    const isW = key === 'w'; // Explicit check to use variable
                    let dx = 0, dy = 0;
                    if (isW) dy = gridSize;
                    if (key === 's') dy = -gridSize;
                    if (key === 'a') dx = gridSize;
                    if (key === 'd') dx = -gridSize;
                    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
                    if (!animationFrameId) animationFrameId = requestAnimationFrame(updatePan);
                }
                return;
            }
            if (!e.ctrlKey && !e.metaKey) {
                switch (key) {
                    case 'b': setActiveTool('brush'); break;
                    case 'g': setActiveTool('bucket'); break;
                    case 'e': setActiveTool('eraser'); break;
                    case 'v': setActiveTool('select'); break;
                    case 'm': setActiveTool('multiSelect'); break;
                    case 'l': setActiveTool('line'); break;
                    case 'r': setActiveTool('rectangle'); break;
                    case 'c': setActiveTool('circle'); break;
                    case 'k': setActiveTool('collision'); break;
                    case 'o': setActiveTool('selectCollision'); break;
                    case '+': case '=': zoomIn(); break;
                    case '-': zoomOut(); break;
                }
            }

            // Undo/Redo
            if ((e.ctrlKey || e.metaKey) && key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    if (canRedo()) {
                        const state = useEditorStore.getState();
                        const restored = redo(
                            state.tiles, state.characters, state.layers, state.skyboxLayers, state.levelImages, state.collisionShapes,
                            state.selectedTileIds, state.selectedCharacterIds, state.selectedLayerIds, state.selectedImageIds, state.selectedCollisionIds
                        );
                        if (restored) useEditorStore.setState(restored as any);
                    }
                } else {
                    if (canUndo()) {
                        const state = useEditorStore.getState();
                        const restored = undo(
                            state.tiles, state.characters, state.layers, state.skyboxLayers, state.levelImages, state.collisionShapes,
                            state.selectedTileIds, state.selectedCharacterIds, state.selectedLayerIds, state.selectedImageIds, state.selectedCollisionIds
                        );
                        if (restored) useEditorStore.setState(restored as any);
                    }
                }
            }
            // Clipboard Shortcuts
            if ((e.ctrlKey || e.metaKey) && key === 'c') {
                e.preventDefault();
                copySelection();
            }
            if ((e.ctrlKey || e.metaKey) && key === 'd') {
                e.preventDefault();
                duplicateSelectedImages();
            }
            if ((e.ctrlKey || e.metaKey) && key === 'v') {
                e.preventDefault();
                const state = useEditorStore.getState();
                if (state.clipboard) {
                    setActiveTool('paste');
                    setPasteMirror({ x: false, y: false });
                }
            }
            // Paste Tool shortcuts
            if (activeTool === 'paste') {
                if (key === 'h') {
                    setPasteMirror({ ...pasteMirror, x: !pasteMirror.x });
                }
                if (key === 'v') {
                    setPasteMirror({ ...pasteMirror, y: !pasteMirror.y });
                }
            }
            // Delete
            if (key === 'delete') {
                handleDeleteSelection();
            }
            // Enter finishes polygon drawing
            if (activeTool === 'collision' && key === 'enter') {
                collisionToolRef.current.finishPolygon();
            }

            // General Escape behavior
            if (key === 'escape') {
                if (activeTool === 'collision' && collisionToolRef.current.isDrawingPolygon) {
                    collisionToolRef.current.cancelPolygon();
                } else {
                    setActiveTool('select');
                    if (activeTool === 'paste') {
                        setPasteMirror({ x: false, y: false });
                    }
                    const state = useEditorStore.getState();
                    state.clearSelection();
                    state.clearCollisionSelection();
                    state.clearImageSelection();
                    state.selectCharacters([]);
                }
            }
            // Ctrl+Y = Redo
            if ((e.ctrlKey || e.metaKey) && key === 'y') {
                e.preventDefault();
                if (canRedo()) {
                    const state = useEditorStore.getState();
                    const restored = redo(
                        state.tiles, state.characters, state.layers, state.skyboxLayers, state.levelImages, state.collisionShapes,
                        state.selectedTileIds, state.selectedCharacterIds, state.selectedLayerIds, state.selectedImageIds, state.selectedCollisionIds
                    );
                    if (restored) useEditorStore.setState(restored as any);
                }
            }
            if ((e.ctrlKey || e.metaKey) && key === '0') { e.preventDefault(); resetZoom(); }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(key)) pressedKeys.delete(key);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [setActiveTool, undo, redo, canUndo, canRedo, zoomIn, zoomOut, resetZoom, gridSize, handleDeleteSelection, activeTool, clipboard, copySelection, pasteMirror, setPasteMirror, pasteClipboard]);
    // Canvas rendering
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const resizeCanvas = () => { canvas.width = container.clientWidth; canvas.height = container.clientHeight; };
        resizeCanvas();
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    // Draw loop
    const renderScene = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Helper to get image
        const imageCache: { [key: string]: HTMLImageElement } = (window as any)._tileImageCache || {};
        (window as any)._tileImageCache = imageCache;
        const getTileImage = (src: string): HTMLImageElement => {
            if (!imageCache[src]) {
                const img = new Image();
                img.src = src;
                imageCache[src] = img;
            }
            return imageCache[src];
        };

        // --- RENDER SKYBOX ---
        skyboxLayers.forEach(layer => {
            if (!layer.visible) return;

            ctx.save();
            ctx.globalAlpha = layer.opacity;

            if (layer.type === 'color') {
                ctx.fillStyle = layer.value;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else if (layer.type === 'image' && layer.value) {
                const img = getTileImage(layer.value);
                if (img.complete && img.naturalWidth > 0) {
                    let offsetX = layer.offset.x;
                    let offsetY = layer.offset.y;

                    const camX = -pan.x / zoom;
                    const camY = -pan.y / zoom;

                    offsetX -= camX * layer.parallax.x;
                    offsetY -= camY * layer.parallax.y;

                    let sw = Math.floor(img.naturalWidth * layer.scale.x * zoom);
                    let sh = Math.floor(img.naturalHeight * layer.scale.y * zoom);

                    let repeatX = layer.repeat === 'repeat' || layer.repeat === 'repeat-x';
                    let repeatY = layer.repeat === 'repeat' || layer.repeat === 'repeat-y';
                    let isClamp = layer.repeat === 'clamp';

                    if (layer.repeat === 'stretch') {
                        sw = canvas.width;
                        sh = canvas.height;
                        offsetX = 0;
                        offsetY = 0;
                        repeatX = false;
                        repeatY = false;
                        isClamp = true;
                    } else if (layer.repeat === 'stretch-x') {
                        // Stretch Width (Repeat Vertical)
                        sw = canvas.width;
                        sh = Math.floor(img.naturalHeight * (canvas.width / img.naturalWidth));
                        offsetX = 0;
                        repeatX = false;
                        repeatY = true;
                        isClamp = false;
                    } else if (layer.repeat === 'stretch-y') {
                        // Stretch Height (Repeat Horizontal)
                        sh = canvas.height;
                        sw = Math.floor(img.naturalWidth * (canvas.height / img.naturalHeight));
                        offsetY = 0;
                        repeatX = true;
                        repeatY = false;
                        isClamp = false;
                    }

                    // Tiling Logic
                    const mod = (n: number, m: number) => ((n % m) + m) % m;

                    if (isClamp) {
                        ctx.drawImage(img, Math.floor(offsetX * zoom), Math.floor(offsetY * zoom), sw, sh);
                    } else {
                        const startX = mod(offsetX * zoom, sw);
                        const startY = mod(offsetY * zoom, sh);

                        const cols = repeatX ? Math.ceil(canvas.width / sw) + 2 : 1;
                        const rows = repeatY ? Math.ceil(canvas.height / sh) + 2 : 1;

                        const startCol = repeatX ? -1 : 0;
                        const startRow = repeatY ? -1 : 0;

                        for (let c = startCol; c < cols; c++) {
                            for (let r = startRow; r < rows; r++) {
                                const dx = Math.floor(repeatX ? startX + c * sw : offsetX * zoom);
                                const dy = Math.floor(repeatY ? startY + r * sh : offsetY * zoom);

                                ctx.drawImage(img, dx, dy, sw, sh);
                            }
                        }
                    }
                }
            }
            ctx.restore();
        });

        // Apply zoom and pan transforms for World
        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        // Draw grid
        if (showGrid) {
            ctx.strokeStyle = '#2a2a4a';
            ctx.lineWidth = 1;
            const startX = Math.floor(-pan.x / zoom / gridSize) - 1;
            const startY = Math.floor(-pan.y / zoom / gridSize) - 1;
            const endX = startX + Math.ceil(canvas.width / zoom / gridSize) + 2;
            const endY = startY + Math.ceil(canvas.height / zoom / gridSize) + 2;

            ctx.beginPath();
            for (let x = startX; x <= endX; x++) {
                ctx.moveTo(x * gridSize, startY * gridSize);
                ctx.lineTo(x * gridSize, endY * gridSize);
            }
            for (let y = startY; y <= endY; y++) {
                ctx.moveTo(startX * gridSize, y * gridSize);
                ctx.lineTo(endX * gridSize, y * gridSize);
            }
            ctx.stroke();

            // Draw axis lines
            ctx.strokeStyle = '#4f4f7a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, startY * gridSize);
            ctx.lineTo(0, endY * gridSize);
            ctx.moveTo(startX * gridSize, 0);
            ctx.lineTo(endX * gridSize, 0);
            ctx.stroke();

            // Draw symmetry lines
            if (symmetry.enabled) {
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();
                if (symmetry.axis === 'x' || symmetry.axis === 'both') {
                    ctx.moveTo(-0.5 * gridSize, startY * gridSize);
                    ctx.lineTo(-0.5 * gridSize, endY * gridSize);
                }
                if (symmetry.axis === 'y' || symmetry.axis === 'both') {
                    ctx.moveTo(startX * gridSize, -0.5 * gridSize);
                    ctx.lineTo(endX * gridSize, -0.5 * gridSize);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        const lerpHex = (a: string, b: string, t: number) => {
            if (!a || !b) return a || b || '#ffffff';
            const ah = parseInt(a.replace('#', ''), 16);
            const ar = (ah >> 16) & 255; const ag = (ah >> 8) & 255; const ab = ah & 255;
            const bh = parseInt(b.replace('#', ''), 16);
            const br = (bh >> 16) & 255; const bg = (bh >> 8) & 255; const bb = bh & 255;
            const rr = Math.round(ar + (br - ar) * t);
            const rg = Math.round(ag + (bg - ag) * t);
            const rb = Math.round(ab + (bb - ab) * t);
            return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
        };

        const drawTile = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, spriteId: string, opacity: number = 1, glowColor?: string, scaleX: number = 1, scaleY: number = 1, rotation: number = 0, textOpts?: { text: string, family: string, size: number, color: string }, glow?: import('../types').TileGlow) => {
            let def = availableTiles.find(t => t.id === spriteId) || DEFAULT_TILES.find(t => t.id === spriteId);

            ctx.save();
            const cx = x + size / 2;
            const cy = y + size / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation * Math.PI / 180);
            ctx.scale(scaleX, scaleY);
            ctx.translate(-cx, -cy);

            if (glowColor || glow) {
                let currentGlowColor = glowColor || glow?.color || '#ffffff';
                let intensity = glow?.intensity ?? 15;

                if (glow) {
                    const time = Date.now() / 1000;
                    const speed = glow.speed || 1;
                    if (glow.style === 'pulsing') {
                        const pulse = (Math.sin(time * speed * Math.PI) + 1) / 2;
                        intensity = intensity * (0.5 + 0.5 * pulse);
                    } else if (glow.style === 'multi-color' && glow.colors && glow.colors.length > 0) {
                        const t = (time * speed) % glow.colors.length;
                        const idx1 = Math.floor(t);
                        const idx2 = (idx1 + 1) % glow.colors.length;
                        const blend = t - idx1;
                        currentGlowColor = lerpHex(glow.colors[idx1], glow.colors[idx2], blend);
                    } else if (glow.style === 'random') {
                        intensity = intensity * (0.5 + Math.random() * 0.5);
                        if (glow.colors && glow.colors.length > 0) {
                            const tHash = Math.floor(time * speed * 10);
                            const idx = tHash % glow.colors.length;
                            currentGlowColor = glow.colors[idx];
                        } else {
                            const timeHash = Math.floor(time * speed * 10);
                            const r = (timeHash * 13) % 255;
                            const g = (timeHash * 17) % 255;
                            const b = (timeHash * 23) % 255;
                            currentGlowColor = `rgb(${r},${g},${b})`;
                        }
                    }
                }

                ctx.shadowColor = currentGlowColor;
                ctx.shadowBlur = intensity;
            }
            ctx.globalAlpha = opacity;

            if (textOpts) {
                ctx.fillStyle = textOpts.color;
                ctx.font = `${textOpts.size}px "${textOpts.family}"`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(textOpts.text, x, y);
                ctx.restore();
                return;
            } else if (!def) {
                ctx.fillStyle = '#ff00ff';
                ctx.fillRect(x, y, size, size);
                ctx.restore();
                return;
            }

            if (def.textureSrc) {
                const img = getTileImage(def.textureSrc);
                if (img.complete && img.naturalWidth > 0) {
                    if (def.srcX !== undefined && def.srcY !== undefined && def.srcWidth && def.srcHeight) {
                        ctx.drawImage(img, def.srcX, def.srcY, def.srcWidth, def.srcHeight, x, y, size, size);
                    } else {
                        ctx.drawImage(img, x, y, size, size);
                    }
                } else {
                    ctx.fillStyle = def.color || '#ff00ff';
                    ctx.fillRect(x, y, size, size);
                }
            } else {
                ctx.fillStyle = def.color || '#888888';
                ctx.fillRect(x, y, size, size);
            }

            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1 / Math.max(scaleX, scaleY);
            ctx.strokeRect(x, y, size, size);
            ctx.restore();
        };

        const tilesByLayer = new Map<string, typeof tiles extends Map<any, infer V> ? V[] : never>();
        tiles.forEach(tile => {
            if (!tilesByLayer.has(tile.layerId)) tilesByLayer.set(tile.layerId, []);
            tilesByLayer.get(tile.layerId)!.push(tile);
        });

        const imagesByLayer = new Map<string, typeof levelImages extends Array<infer V> ? V[] : never>();
        levelImages.forEach(img => {
            const layerId = img.layerId || DEFAULT_LAYER_ID;
            if (!imagesByLayer.has(layerId)) imagesByLayer.set(layerId, []);
            imagesByLayer.get(layerId)!.push(img);
        });

        // [OPTIMIZATION] Viewport Culling Bounds
        const sw = canvasRef.current!.width;
        const sh = canvasRef.current!.height;
        const pad = gridSize * 8; // generous padding for scaled tiles
        const cullMinX = -pan.x / zoom - pad;
        const cullMaxX = (sw - pan.x) / zoom + pad;
        const cullMinY = -pan.y / zoom - pad;
        const cullMaxY = (sh - pan.y) / zoom + pad;

        const sortedLayers = [...layers].sort((a, b) => a.order - b.order);

        sortedLayers.forEach(layer => {
            if (!layer.visible) return;

            // 1. Draw Tiles
            const layerTiles = tilesByLayer.get(layer.id) || [];

            // Calculate opacity for this layer
            let layerOpacity = layer.opacity ?? 1;
            if (highlightActiveLayer && layer.id !== activeLayerId) {
                layerOpacity *= 0.3; // Dim inactive layers
            }

            layerTiles.forEach(tile => {
                if (SVG_TILES.includes(tile.spriteId)) return; // Skip rendering SVG tiles via canvas

                const x = tile.gridX * gridSize;
                const y = tile.gridY * gridSize;

                // [OPTIMIZATION] Viewport Culling
                if (x > cullMaxX || x < cullMinX || y > cullMaxY || y < cullMinY) return;

                drawTile(ctx, x, y, gridSize, tile.spriteId, (tile.opacity ?? 1) * layerOpacity, tile.glowColor, tile.scaleX, tile.scaleY, tile.rotation, tile.text ? { text: tile.text, family: tile.fontFamily || 'sans-serif', size: tile.fontSize || 32, color: tile.fontColor || '#ffffff' } : undefined, tile.glow);

                // Draw behavior badge
                if (tile.behavior) {
                    ctx.save();
                    ctx.globalAlpha = 0.85 * layerOpacity;
                    const badgeSize = Math.max(10, gridSize * 0.35);
                    const bx = x + gridSize - badgeSize - 1;
                    const by = y + 1;

                    // Badge background
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.beginPath();
                    ctx.roundRect(bx - 1, by - 1, badgeSize + 2, badgeSize + 2, 3);
                    ctx.fill();

                    // Badge icon
                    ctx.font = `${badgeSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const icons: Record<string, string> = { moving: '↔', floating: '~', dead: '☠', bouncy: '⇡', slippery: '❄' };
                    ctx.fillStyle = '#fff';
                    ctx.fillText(icons[tile.behavior.type] || '?', bx + badgeSize / 2, by + badgeSize / 2 + 1);
                    ctx.restore();
                }
            });

            // 2. Draw Characters
            characters.forEach(char => {
                if (char.layerId !== layer.id) return;
                const x = char.gridX * gridSize;
                const y = char.gridY * gridSize;

                // const def = characterDefsRef.current.get(char.characterId);

                ctx.save();

                if (selectedCharacterIds.has(char.id)) {
                    ctx.shadowColor = '#00ffff';
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x - 2, y - 2, gridSize + 4, gridSize + 4);
                }

                // Placeholder for character (simplified)
                ctx.globalAlpha = layerOpacity;
                ctx.fillStyle = '#ffaa00';
                ctx.beginPath();
                ctx.arc(x + gridSize / 2, y + gridSize / 2, gridSize / 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            });

            // 3. Draw Level Images (Props)
            const layerImages = imagesByLayer.get(layer.id) || [];
            layerImages.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach(img => {
                if (!img.visible) return;

                const image = getTileImage(img.src);
                // Even if not loaded, we might want to draw placeholder
                if (image.complete && image.naturalWidth > 0) {

                    ctx.save();

                    const centerX = img.x + img.width / 2;
                    const centerY = img.y + img.height / 2;

                    ctx.translate(centerX, centerY);
                    ctx.rotate((img.rotation || 0) * Math.PI / 180);
                    ctx.scale(img.flipX ? -1 : 1, img.flipY ? -1 : 1);

                    ctx.globalAlpha = img.opacity ?? 1;

                    ctx.drawImage(image, -img.width / 2, -img.height / 2, img.width, img.height);

                    if (img.tint) {
                        ctx.globalCompositeOperation = 'source-atop';
                        ctx.fillStyle = img.tint;
                        ctx.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
                        ctx.globalCompositeOperation = 'source-over';
                    }

                    // To draw highlighting/handles, we need to be in un-flipped space?
                    // Or we want handles to rotate with the image?
                    // Usually handles are "outside" the flip transform so they don't flip visually (e.g. icon orientation)
                    // BUT their position should track the corners.
                    // If we flip X, the top-right corner in local space (-w/2, -h/2) becomes (w/2, -h/2) ??
                    // No, (-w/2) * -1 = w/2.
                    // So the image is flipped.

                    // Let's restore to World Space (or at least Rotate-only space) for handles to avoid confusion
                    ctx.restore();

                    // Re-apply Transform for Selection Outline (Rotation only, no flip for the outline box itself? 
                    // Wait, if we flip the image, the bounding box is still the same rectangle in local space.
                    // So standard rotation is fine.

                    if (selectedImageIds.has(img.id)) {
                        ctx.save();
                        ctx.translate(centerX, centerY);
                        ctx.rotate((img.rotation || 0) * Math.PI / 180);
                        // No flip here, we just draw the box around the extent

                        const w = img.width;
                        const h = img.height;

                        ctx.strokeStyle = '#00ffff';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(-w / 2, -h / 2, w, h);

                        // Handles
                        const handleSize = 8 / zoom;
                        const hOffset = handleSize / 2;
                        ctx.fillStyle = '#00ffff';
                        ctx.strokeStyle = '#000';

                        // Draw handles at corners
                        const corners = [
                            { x: -w / 2, y: -h / 2 }, // TL
                            { x: w / 2, y: -h / 2 },  // TR
                            { x: -w / 2, y: h / 2 },  // BL
                            { x: w / 2, y: h / 2 }    // BR
                        ];

                        corners.forEach(c => {
                            ctx.fillRect(c.x - hOffset, c.y - hOffset, handleSize, handleSize);
                            ctx.strokeRect(c.x - hOffset, c.y - hOffset, handleSize, handleSize);
                        });

                        // Rotation Handle (Top Center)
                        ctx.beginPath();
                        ctx.moveTo(0, -h / 2);
                        ctx.lineTo(0, -h / 2 - 20 / zoom);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.arc(0, -h / 2 - 20 / zoom, 4 / zoom, 0, Math.PI * 2);
                        ctx.fillStyle = '#fff';
                        ctx.fill();
                        ctx.stroke();

                        ctx.restore();
                    }

                } else {
                    // Placeholder
                    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
                    ctx.fillRect(img.x, img.y, img.width, img.height);
                }
            });
        });


        // Draw Selection Highligts (Overlay)
        ctx.save();
        ctx.strokeStyle = '#ffd700'; // Gold
        ctx.lineWidth = 2;
        selectedTileIds.forEach(id => {
            Array.from(tiles.values()).forEach(t => {
                if (t.id === id) {
                    let w = gridSize;
                    let h = gridSize;
                    if (t.spriteId === 'text_object' && t.text) {
                        ctx.save();
                        ctx.font = `${t.fontSize || 32}px "${t.fontFamily || 'sans-serif'}"`;
                        w = ctx.measureText(t.text).width;
                        h = t.fontSize || 32;
                        ctx.restore();
                    }
                    ctx.strokeRect(t.gridX * gridSize, t.gridY * gridSize, w, h);
                }
            });
        });
        ctx.restore();

        // Draw Tool Preview / Cursor
        if (hoverPos) {
            ctx.save();
            const x = hoverPos.x * gridSize;
            const y = hoverPos.y * gridSize;

            // Tool-specific cursors
            if (activeTool === 'brush' || activeTool === 'eraser') {
                const points = getBrushPoints(hoverPos, brushSize);
                const symPoints = getSymmetricalPoints(points, symmetry);

                ctx.strokeStyle = activeTool === 'brush' ? 'rgba(255, 255, 255, 0.8)' :
                    activeTool === 'eraser' ? 'rgba(255, 50, 50, 0.8)' :
                        'rgba(0, 255, 150, 0.8)'; // Collision brush
                ctx.lineWidth = 2;

                symPoints.forEach(p => {
                    ctx.strokeRect(p.x * gridSize, p.y * gridSize, gridSize, gridSize);
                });

                if (activeTool === 'brush' && selectedTileType) {
                    ctx.globalAlpha = 0.5;
                    symPoints.forEach(p => {
                        const px = p.x * gridSize;
                        const py = p.y * gridSize;
                        drawTile(ctx, px, py, gridSize, selectedTileType.id, 0.5);
                    });
                }

            } else if (activeTool === 'select' || activeTool === 'multiSelect') {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, gridSize, gridSize);
            } else if (activeTool === 'paste' && clipboard) {
                ctx.globalAlpha = 0.5;
                clipboard.tiles.forEach(t => {
                    let finalX = t.gridX;
                    let finalY = t.gridY;

                    if (pasteMirror.x) finalX = -finalX;
                    if (pasteMirror.y) finalY = -finalY;

                    const px = (hoverPos.x + finalX) * gridSize;
                    const py = (hoverPos.y + finalY) * gridSize;

                    drawTile(ctx, px, py, gridSize, t.spriteId, 0.5);
                });
            } else if (['line', 'rectangle', 'circle'].includes(activeTool) && shapeTool.previewPoints.length > 0) {
                const symPoints = getSymmetricalPoints(shapeTool.previewPoints, symmetry);

                symPoints.forEach(p => {
                    const px = p.x * gridSize;
                    const py = p.y * gridSize;

                    if (selectedTileType) {
                        drawTile(ctx, px, py, gridSize, selectedTileType.id, 0.5);
                    }

                    ctx.strokeStyle = 'cyan';
                    ctx.strokeRect(px, py, gridSize, gridSize);
                });
            } else if (activeTool === 'spawn') {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#ffaa00';
                ctx.beginPath();
                ctx.arc(x + gridSize / 2, y + gridSize / 2, gridSize / 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (activeTool === 'text') {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#ffffff';
                ctx.font = `32px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText('New Text', x, y);
            }

            // Symmetry Placement Preview
            if (isPlacingSymmetry) {
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();

                // Draw crosshair at hoverPos
                // const cx = (x + gridSize / 2); // Unused
                // const cy = (y + gridSize / 2); // Unused

                // Draw axis lines relative to this center
                // Actually, if we are placing center, we want to show the AXIS lines passing through this point
                // based on current axis setting.

                // X-Axis (Vertical line)
                if (symmetry.axis === 'x' || symmetry.axis === 'both') {
                    // The axis is vertical? No, X-Symmetry usually means mirroring across X axis?
                    // Wait, in this codebase:
                    // if (symmetry.axis === 'x' || symmetry.axis === 'both') {
                    //    ctx.moveTo(-0.5 * gridSize, startY * gridSize);
                    // This implies X-axis symmetry is a vertical line at X=0 (or center).
                    // So if we place center at `pos`, vertical line is at `pos.x`.
                    // But `x` here is `hoverPos.x * gridSize`. 
                    // Let's draw through the center of the hovered cell for now?
                    // Or left edge? Grid snapping... usually left/top edge or center.
                    // Let's assume center of cell for now if grid based.

                    // Actually existing code uses `symmetry.center` or default 0.
                    // Existing draw code:
                    // if (symmetry.axis === 'x' || symmetry.axis === 'both') {
                    //    ctx.moveTo(-0.5 * gridSize, ...)

                    // So let's draw lines passing through `x + gridSize/2`.

                    // We need canvas bounds in world space? No, just draw long lines from -infinity to infinity...
                    // Or just use the view bounds we invoked earlier.

                    const startY = Math.floor(-pan.y / zoom / gridSize) - 1;
                    const endY = startY + Math.ceil(canvas.height / zoom / gridSize) + 2;

                    // We need the X coordinate of the axis.
                    // If we click at `pos`, the axis is at `pos.x`.
                    // Should it be edge or center? 
                    // Let's stick to consistent grid coordinates. `pos.x * gridSize`.
                    // Maybe render a line at `x` ?

                    ctx.moveTo(x, startY * gridSize);
                    ctx.lineTo(x, endY * gridSize);
                }

                if (symmetry.axis === 'y' || symmetry.axis === 'both') {
                    const startX = Math.floor(-pan.x / zoom / gridSize) - 1;
                    const endX = startX + Math.ceil(canvas.width / zoom / gridSize) + 2;

                    ctx.moveTo(startX * gridSize, y);
                    ctx.lineTo(endX * gridSize, y);
                }

                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
        }

        // Draw MultiSelect Rect
        if (multiSelectRect) {
            ctx.save();
            const startX = Math.min(multiSelectRect.start.x, multiSelectRect.end.x) * gridSize;
            const startY = Math.min(multiSelectRect.start.y, multiSelectRect.end.y) * gridSize;
            const endX = Math.max(multiSelectRect.start.x, multiSelectRect.end.x) * gridSize + gridSize;
            const endY = Math.max(multiSelectRect.start.y, multiSelectRect.end.y) * gridSize + gridSize;

            ctx.fillStyle = 'rgba(100, 149, 237, 0.3)'; // Cornflower Blue, low opacity
            ctx.strokeStyle = 'rgba(100, 149, 237, 0.8)';
            ctx.lineWidth = 1;

            ctx.fillRect(startX, startY, endX - startX, endY - startY);
            ctx.strokeRect(startX, startY, endX - startX, endY - startY);
            ctx.restore();
        }


        // Collisions Overlay (Physics)
        if (showCollisions) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.strokeStyle = 'red';

            tiles.forEach(tile => {
                if (tile.hasCollision) {
                    const x = tile.gridX * gridSize;
                    const y = tile.gridY * gridSize;
                    ctx.fillRect(x, y, gridSize, gridSize);
                    ctx.strokeRect(x, y, gridSize, gridSize);
                }
            });
            ctx.restore();
        }

        // ─── Render Death Line ───
        if (physicsSettings.isDeathLineEnabled && physicsSettings.deathLineY !== undefined) {
            ctx.save();
            ctx.strokeStyle = '#ef4444'; // Tailwind red-500
            ctx.lineWidth = 2;
            const lineY = physicsSettings.deathLineY;

            // Draw a dashed endless line
            ctx.setLineDash([20, 10]);
            ctx.beginPath();

            // Get view bounds to draw line across screen
            const startX = -pan.x / zoom;
            const endX = (canvas.width - pan.x) / zoom;

            ctx.moveTo(startX, lineY);
            ctx.lineTo(endX, lineY);
            ctx.stroke();

            // Draw shadow/glow
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.stroke();

            ctx.setLineDash([]);

            // Draw skull icon or text
            ctx.fillStyle = '#ef4444';
            ctx.shadowBlur = 0;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText('DEATH LINE ☠', endX - 20, lineY - 8);

            ctx.restore();
        }

        // ─── Render Collision Shapes ───
        collisionShapes.forEach(shape => {
            const shapeLayer = layers.find(l => l.id === (shape.layerId || DEFAULT_LAYER_ID));
            if (shapeLayer && !shapeLayer.visible) return;

            ctx.save();
            const isSelected = selectedCollisionIds.has(shape.id);

            if (isSelected) {
                ctx.fillStyle = 'rgba(0, 200, 120, 0.35)';
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#00ff88';
                ctx.shadowBlur = 8;
            } else {
                ctx.fillStyle = 'rgba(0, 180, 100, 0.2)';
                ctx.strokeStyle = 'rgba(0, 220, 120, 0.6)';
                ctx.lineWidth = 1.5;
            }

            if (shape.type === 'box') {
                ctx.save();
                if (shape.rotation !== 0) {
                    const cx = shape.x + shape.width / 2;
                    const cy = shape.y + shape.height / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate(shape.rotation * Math.PI / 180);
                    ctx.translate(-cx, -cy);
                }
                ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
                ctx.restore();
            } else if (shape.type === 'circle') {
                ctx.beginPath();
                ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (shape.type === 'polygon' && shape.vertices.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(shape.x + shape.vertices[0].x, shape.y + shape.vertices[0].y);
                for (let i = 1; i < shape.vertices.length; i++) {
                    ctx.lineTo(shape.x + shape.vertices[i].x, shape.y + shape.vertices[i].y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            // Draw label
            if (isSelected) {
                ctx.fillStyle = '#00ff88';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                const labelX = shape.type === 'box' ? shape.x + shape.width / 2 : shape.x;
                const labelY = shape.type === 'box' ? shape.y - 4 : shape.y - shape.radius - 4;
                ctx.fillText(`${shape.type} [${shape.id.slice(-5)}]`, labelX, labelY);
            }

            ctx.restore();
        });

        // ─── Collision Tool Preview ───
        if (activeTool === 'collision') {
            if (collisionToolMode === 'brush' && collisionTool.freehandPath.length > 0) {
                // Render freehand path preview
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 255, 150, 0.8)';
                ctx.lineWidth = Math.max(2, collisionBrushSize);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                ctx.beginPath();
                ctx.moveTo(collisionTool.freehandPath[0].x, collisionTool.freehandPath[0].y);
                for (let i = 1; i < collisionTool.freehandPath.length; i++) {
                    ctx.lineTo(collisionTool.freehandPath[i].x, collisionTool.freehandPath[i].y);
                }
                ctx.stroke();

                // Fill with transparency to show what the final shape will look like
                ctx.fillStyle = 'rgba(0, 255, 150, 0.2)';
                ctx.fill();

                ctx.restore();
            } else if (collisionTool.preview && collisionToolMode !== 'brush') {
                const p = collisionTool.preview;
                ctx.save();
                ctx.fillStyle = 'rgba(0, 255, 150, 0.25)';
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);

                if (p.type === 'box') {
                    ctx.fillRect(p.x, p.y, p.width, p.height);
                    ctx.strokeRect(p.x, p.y, p.width, p.height);
                } else if (p.type === 'circle') {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                } else if (p.type === 'polygon' && p.vertices.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(p.vertices[0].x, p.vertices[0].y);
                    for (let i = 1; i < p.vertices.length; i++) {
                        ctx.lineTo(p.vertices[i].x, p.vertices[i].y);
                    }
                    ctx.stroke();
                    // Draw vertices as dots
                    p.vertices.forEach(v => {
                        ctx.beginPath();
                        ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
                        ctx.fillStyle = '#00ff88';
                        ctx.fill();
                    });
                }

                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // ─── Render Polygon Finish Button ───
        if (activeTool === 'collision' && collisionTool.isDrawingPolygon && collisionTool.preview && collisionTool.preview.vertices.length >= 3) {
            const lastVert = collisionTool.preview.vertices[collisionTool.preview.vertices.length - 1];
            const px = (lastVert.x * zoom) + pan.x;
            const py = (lastVert.y * zoom) + pan.y;

            ctx.save();
            ctx.fillStyle = '#00ff88';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.8;
            // Draw generic "Enter to Finish" text near cursor
            ctx.fillText("Enter to Finish", px + 15, py);
            ctx.restore();
        }

        // ─── Render Collision Scale Handles (Move Helper) ───
        // Only if single box selected
        if ((activeTool === 'select' || activeTool === 'selectCollision') && selectedCollisionIds.size === 1) {
            const id = Array.from(selectedCollisionIds)[0];
            const shape = collisionShapes.get(id);
            if (shape && shape.type === 'box') {
                ctx.save();
                const centerX = shape.x + shape.width / 2;
                const centerY = shape.y + shape.height / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate((shape.rotation || 0) * Math.PI / 180);

                const w = shape.width;
                const h = shape.height;

                // Handles
                const handleSize = 8 / zoom;
                const hOffset = handleSize / 2;
                ctx.fillStyle = '#00ff88';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1 / zoom;

                const corners = [
                    { x: -w / 2, y: -h / 2 }, // TL
                    { x: w / 2, y: -h / 2 },  // TR
                    { x: -w / 2, y: h / 2 },  // BL
                    { x: w / 2, y: h / 2 }    // BR
                ];

                corners.forEach(c => {
                    ctx.fillRect(c.x - hOffset, c.y - hOffset, handleSize, handleSize);
                    ctx.strokeRect(c.x - hOffset, c.y - hOffset, handleSize, handleSize);
                });

                // Rotation Handle
                ctx.beginPath();
                ctx.moveTo(0, -h / 2);
                ctx.lineTo(0, -h / 2 - 25 / zoom);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, -h / 2 - 25 / zoom, 5 / zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            }
        }

        ctx.restore();
    }, [zoom, pan, gridSize, showGrid, tiles, showCollisions, availableTiles, hoverPos, activeTool, selectedTileIds, selectedTileType, brushSize, symmetry, characters, selectedCharacterIds, activeLayerId, layers, activeCharacterId, skyboxLayers, clipboard, pasteMirror, shapeTool.previewPoints, collisionShapes, selectedCollisionIds, collisionTool.preview, collisionTool.isDrawingPolygon, collisionTool.freehandPath, collisionToolMode, collisionBrushSize, isDragging, levelImages, selectedImageIds]);

    // Animation Loop
    useEffect(() => {
        let animationFrameId: number;
        const renderLoop = () => {
            renderScene();
            animationFrameId = requestAnimationFrame(renderLoop);
        };
        renderLoop();
        return () => cancelAnimationFrame(animationFrameId);
    }, [renderScene]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-zinc-900"
            onContextMenu={handleContextMenu}
            onMouseLeave={handleMouseLeave}
            onMouseUp={() => { if (isDragging) setIsDragging(false); }}
        >
            <canvas
                ref={canvasRef}
                className="block cursor-crosshair active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onWheel={handleWheel}
            />
            {/* --- DOM Overlay for SVG Tiles --- */}
            {layers.filter(l => l.visible).map(layer => {
                const layerTilesArr = Array.from(tiles.values());
                const screenW = containerRef.current?.getBoundingClientRect().width || window.innerWidth;
                const screenH = containerRef.current?.getBoundingClientRect().height || window.innerHeight;

                const layerTiles = layerTilesArr.filter(t => {
                    if (t.layerId !== layer.id || !SVG_TILES.includes(t.spriteId)) return false;
                    const px = t.gridX * gridSize * zoom + pan.x;
                    const py = t.gridY * gridSize * zoom + pan.y;
                    const pSize = gridSize * zoom;
                    return px + pSize >= -100 && px <= screenW + 100 && py + pSize >= -100 && py <= screenH + 100;
                });

                return layerTiles.map(tile => {
                    const x = tile.gridX * gridSize * zoom + pan.x;
                    const y = tile.gridY * gridSize * zoom + pan.y;
                    const tileProps = { key: tile.id, x, y, size: gridSize * zoom, opacity: tile.opacity, rotation: tile.rotation, scaleX: tile.scaleX, scaleY: tile.scaleY, glowColor: tile.glowColor, glow: tile.glow };

                    if (tile.spriteId === 'grass') return <GrassTile {...tileProps} />;
                    if (tile.spriteId === 'lava') {
                        // Same interior optimization for Lava? Let's just do it for dirt for now since Dirt is most spammed
                        return <LavaTile {...tileProps} />;
                    }
                    if (tile.spriteId === 'crystal') return <CrystalTile {...tileProps} />;
                    if (tile.spriteId === 'water') {
                        const isSurface = !layerTilesArr.some(t => t.layerId === layer.id && t.spriteId === 'water' && t.gridX === tile.gridX && t.gridY === tile.gridY - 1);
                        return <WaterTile {...tileProps} isSurface={isSurface} />;
                    }
                    return null;
                });
            })}
            {contextMenu && (
                <EditorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={handleCloseContextMenu}
                    onCopy={copySelection}
                    onPaste={() => { if (hoverPos) pasteClipboard(hoverPos, false, false); handleCloseContextMenu(); }}
                    onPasteMirrorX={() => { if (hoverPos) pasteClipboard(hoverPos, true, false); handleCloseContextMenu(); }}
                    onPasteMirrorY={() => { if (hoverPos) pasteClipboard(hoverPos, false, true); handleCloseContextMenu(); }}
                    onDelete={handleDeleteSelection}
                    onSelectAllTiles={() => { selectAllTilesOnLayer(activeLayerId); handleCloseContextMenu(); }}
                    onSelectAllCollisions={() => { selectAllCollisionsOnLayer(activeLayerId); handleCloseContextMenu(); }}
                    onSelectSky={() => { selectSkyOnLayer(activeLayerId); handleCloseContextMenu(); }}
                    onAddAutoCollision={handleAddAutoCollision}
                    hasImageSelection={selectedImageIds.size === 1 || selectedTileIds.size === 1}
                    canPaste={!!clipboard}
                    hasSelection={selectedTileIds.size > 0 || selectedCharacterIds.size > 0 || selectedImageIds.size > 0 || selectedCollisionIds.size > 0}
                />
            )}
            <EnemyConfigModal
                isOpen={!!enemyModalPos}
                onClose={() => {
                    setEnemyModalPos(null);
                    setActiveTool('select');
                }}
                onConfirm={(config) => {
                    if (enemyModalPos) {
                        pushState();
                        placeCharacter({
                            id: `enemy_${Date.now()}`,
                            characterId: config.characterId,
                            gridX: enemyModalPos.x,
                            gridY: enemyModalPos.y,
                            layerId: activeLayerId,
                            overrideProperties: {
                                isEnemy: true,
                                enemyType: config.enemyType,
                                maxHp: config.maxHp,
                                exp: config.exp,
                                behavior: config.behavior
                            }
                        });
                        setEnemyModalPos(null);
                        setActiveTool('select');
                    }
                }}
            />
        </div>
    );
}

