/**
 * SpriteEditorCanvas - Main pixel drawing canvas with tool support
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { ZoomIn, ZoomOut, Maximize, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { useDrawingStore, colorToString } from './stores/drawingStore';
import { useTimelineStore } from './stores/timelineStore';

interface SpriteEditorCanvasProps {
    className?: string;
}

export function SpriteEditorCanvas({ className }: SpriteEditorCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);

    const [zoom, setZoom] = useState(8);  // 8x zoom by default for pixel art
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
    const lastSyncedImageDataRef = useRef<ImageData | null>(null);

    const {
        canvasWidth,
        canvasHeight,
        currentTool,
        foregroundColor,
        brushSettings,
        isDrawing,
        lastPoint,
        showGrid,
        startDrawing,
        continueDrawing,
        endDrawing,
        setForegroundColor,
        undo,
        redo,
        pushHistory,
        selection,
        setSelection,

        floatingSelection,
        setFloatingSelection,
        moveSelection,
        rotateSelection,
        applySelection,
        deleteSelection,
        updateLayerImageData,
        activeLayerId,
        layers,

        symmetry,
        tiledPreview,
    } = useDrawingStore();

    const {
        currentFrameIndex,
        updateFrameImageData,
        updateFrameLayerData,
        frames,
        onionSkin,
    } = useTimelineStore();

    // Initialize offscreen canvas
    useEffect(() => {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvasWidth;
        offscreen.height = canvasHeight;
        offscreenRef.current = offscreen;

        // Fill with transparent background
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        if (ctx) {
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        }
    }, [canvasWidth, canvasHeight]);

    // Helper: RGB to HSL and back for shading
    const shadeColor = (color: { r: number; g: number; b: number; a: number }, amount: number) => {
        // Simple RGB approach for now (cheaper/faster)
        // Amount > 1 lightens, < 1 darkens
        return {
            r: Math.min(255, Math.max(0, Math.floor(color.r * amount))),
            g: Math.min(255, Math.max(0, Math.floor(color.g * amount))),
            b: Math.min(255, Math.max(0, Math.floor(color.b * amount))),
            a: color.a
        };
    };

    // Draw pixel/shape at position
    const drawPixel = useCallback((x: number, y: number, color: { r: number; g: number; b: number; a: number }) => {
        const offscreen = offscreenRef.current;
        if (!offscreen) return;

        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Dithering check
        if (brushSettings.dither && (currentTool === 'brush' || currentTool === 'pencil')) {
            if ((Math.floor(x) + Math.floor(y)) % 2 !== 0) {
                return;
            }
        }

        // Size depends on tool
        const size = (currentTool === 'pencil' || currentTool === 'eraser')
            ? (currentTool === 'pencil' ? 1 : brushSettings.size)
            : brushSettings.size;

        // Calculate the top-left pixel of the brush area
        // This ensures the brush is centered on the cursor pixel
        const getDrawPosition = (px: number, py: number) => {
            const halfSize = Math.floor(size / 2);
            return {
                drawX: Math.floor(px) - halfSize,
                drawY: Math.floor(py) - halfSize
            };
        };

        // Helper to draw single point
        const drawPoint = (px: number, py: number) => {
            const { drawX, drawY } = getDrawPosition(px, py);

            if (currentTool === 'eraser') {
                ctx.clearRect(drawX, drawY, size, size);
            } else if (currentTool === 'lighten' || currentTool === 'darken') {
                // Sample current pixel at center
                const sampleX = Math.max(0, Math.min(drawX, canvasWidth - 1));
                const sampleY = Math.max(0, Math.min(drawY, canvasHeight - 1));
                const imgData = ctx.getImageData(sampleX, sampleY, 1, 1);
                const current = { r: imgData.data[0], g: imgData.data[1], b: imgData.data[2], a: imgData.data[3] };

                // If transparent, don't shade
                if (current.a === 0) return;

                const factor = currentTool === 'lighten' ? 1.1 : 0.9;
                const newColor = shadeColor(current, factor);

                ctx.fillStyle = `rgba(${newColor.r}, ${newColor.g}, ${newColor.b}, ${newColor.a / 255})`;
                ctx.fillRect(drawX, drawY, size, size);
            } else {
                ctx.fillStyle = colorToString(color);
                ctx.fillRect(drawX, drawY, size, size);
            }
        };

        // Draw primary point
        drawPoint(x, y);

        // Handle Symmetry
        if (symmetry.enabled) {
            const offset = size % 2 === 0 ? 1 : 0;

            if (symmetry.xAxis) {
                // Mirror around center X axis
                const symX = (symmetry.centerX * 2) - x - 1 + offset;
                drawPoint(symX, y);
            }
            if (symmetry.yAxis) {
                // Mirror around center Y axis
                const symY = (symmetry.centerY * 2) - y - 1 + offset;
                drawPoint(x, symY);
            }
            if (symmetry.xAxis && symmetry.yAxis) {
                const symX = (symmetry.centerX * 2) - x - 1 + offset;
                const symY = (symmetry.centerY * 2) - y - 1 + offset;
                drawPoint(symX, symY);
            }
        }

    }, [currentTool, brushSettings.size, brushSettings.dither, symmetry, canvasWidth, canvasHeight]);

    // Bresenham line for smooth strokes
    const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number, color: { r: number; g: number; b: number; a: number }) => {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        while (true) {
            drawPixel(x, y, color);

            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
        }
    }, [drawPixel]);

    // Flood fill algorithm
    const floodFill = useCallback((startX: number, startY: number, fillColor: { r: number; g: number; b: number; a: number }) => {
        const offscreen = offscreenRef.current;
        if (!offscreen) return;

        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;

        const getPixelIndex = (x: number, y: number) => (y * canvasWidth + x) * 4;

        const startIdx = getPixelIndex(startX, startY);
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const targetA = data[startIdx + 3];

        // Don't fill if target color is same as fill color
        if (targetR === fillColor.r && targetG === fillColor.g &&
            targetB === fillColor.b && targetA === fillColor.a) {
            return;
        }

        const stack: [number, number][] = [[startX, startY]];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;

            const idx = getPixelIndex(x, y);

            if (data[idx] !== targetR || data[idx + 1] !== targetG ||
                data[idx + 2] !== targetB || data[idx + 3] !== targetA) {
                continue;
            }

            visited.add(key);

            data[idx] = fillColor.r;
            data[idx + 1] = fillColor.g;
            data[idx + 2] = fillColor.b;
            data[idx + 3] = fillColor.a;

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        ctx.putImageData(imageData, 0, 0);
    }, [canvasWidth, canvasHeight]);

    // Color Replace
    const replaceColor = useCallback((startX: number, startY: number) => {
        const offscreen = offscreenRef.current;
        if (!offscreen) return;
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;

        // Get target color from start position
        const idx = (startY * canvasWidth + startX) * 4;
        const tr = data[idx];
        const tg = data[idx + 1];
        const tb = data[idx + 2];
        const ta = data[idx + 3];

        // If target is same as FG, do nothing
        if (tr === foregroundColor.r && tg === foregroundColor.g &&
            tb === foregroundColor.b && ta === foregroundColor.a) return;

        // Replace all matching pixels
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] === tr && data[i + 1] === tg && data[i + 2] === tb && data[i + 3] === ta) {
                data[i] = foregroundColor.r;
                data[i + 1] = foregroundColor.g;
                data[i + 2] = foregroundColor.b;
                data[i + 3] = foregroundColor.a;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }, [canvasWidth, canvasHeight, foregroundColor]);

    // Eyedropper
    const pickColor = useCallback((x: number, y: number) => {
        const offscreen = offscreenRef.current;
        if (!offscreen) return;

        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const pixel = ctx.getImageData(x, y, 1, 1).data;
        setForegroundColor({
            r: pixel[0],
            g: pixel[1],
            b: pixel[2],
            a: pixel[3],
        });
    }, [setForegroundColor]);

    // Convert screen coords to canvas coords
    const screenToCanvas = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const centerX = rect.width / 2 + pan.x;
        const centerY = rect.height / 2 + pan.y;

        const canvasX = Math.floor((clientX - rect.left - centerX) / zoom + canvasWidth / 2);
        const canvasY = Math.floor((clientY - rect.top - centerY) / zoom + canvasHeight / 2);

        if (canvasX >= 0 && canvasX < canvasWidth && canvasY >= 0 && canvasY < canvasHeight) {
            return { x: canvasX, y: canvasY };
        }
        return null;
    }, [zoom, pan, canvasWidth, canvasHeight]);

    // Handle selection with select-rect tool
    const handleSelectionStart = useCallback((e: React.MouseEvent) => {
        if (currentTool !== 'select-rect') return;
        const pos = screenToCanvas(e.clientX, e.clientY);
        if (pos) {
            setSelectionStart(pos);
            setSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
        }
    }, [currentTool, screenToCanvas, setSelection]);

    const handleSelectionMove = useCallback((e: React.MouseEvent) => {
        if (currentTool !== 'select-rect' || !selectionStart) return;
        const pos = screenToCanvas(e.clientX, e.clientY);
        if (pos) {
            const x = Math.min(selectionStart.x, pos.x);
            const y = Math.min(selectionStart.y, pos.y);
            const width = Math.abs(pos.x - selectionStart.x) + 1;
            const height = Math.abs(pos.y - selectionStart.y) + 1;
            setSelection({ x, y, width, height });
        }
    }, [currentTool, selectionStart, screenToCanvas, setSelection]);

    const handleSelectionEnd = useCallback(() => {
        if (currentTool === 'select-rect' && selectionStart && selection.width > 0 && selection.height > 0) {
            // Create floating selection from current selection
            const offscreen = offscreenRef.current;
            if (offscreen) {
                const ctx = offscreen.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    const imageData = ctx.getImageData(selection.x, selection.y, selection.width, selection.height);

                    // Clear the area from original canvas (cut)
                    ctx.clearRect(selection.x, selection.y, selection.width, selection.height);

                    // Set floating selection
                    setFloatingSelection({
                        x: selection.x,
                        y: selection.y,
                        width: selection.width,
                        height: selection.height,
                        imageData: imageData
                    });

                    // We don't clear selection rect yet, it stays as the bound of the floating selection
                }
            }
        }
        setSelectionStart(null);
    }, [currentTool, selectionStart, selection, setFloatingSelection]);

    // Commit floating selection back to canvas
    const commitFloatingSelection = useCallback(() => {
        if (!floatingSelection) return;

        const offscreen = offscreenRef.current;
        if (offscreen) {
            const ctx = offscreen.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                ctx.putImageData(floatingSelection.imageData, floatingSelection.x, floatingSelection.y);

                // Update layer data
                const newImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
                if (activeLayerId) {
                    updateLayerImageData(activeLayerId, newImageData);
                    pushHistory(activeLayerId, newImageData);
                } else {
                    updateFrameImageData(currentFrameIndex, newImageData);
                }
            }
        }
        applySelection(); // Clear store state
    }, [floatingSelection, activeLayerId, updateLayerImageData, currentFrameIndex, updateFrameImageData, applySelection, canvasWidth, canvasHeight, pushHistory]);

    // Handle mouse events
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            return;
        }

        if (e.button !== 0) return;

        const pos = screenToCanvas(e.clientX, e.clientY);
        if (!pos) return;

        // Handle floating selection interaction
        if (floatingSelection) {
            // Check if clicking inside floating selection
            const inside =
                pos.x >= floatingSelection.x &&
                pos.x < floatingSelection.x + floatingSelection.width &&
                pos.y >= floatingSelection.y &&
                pos.y < floatingSelection.y + floatingSelection.height;

            if (inside) {
                // Start moving selection
                setIsPanning(false); // Ensure we don't pan
                startDrawing(pos.x, pos.y);
                // We need to know we are moving the selection
                return;
            } else {
                // Clicked outside -> Apply selection
                commitFloatingSelection();
                // Then continue to normal tool behavior (e.g. start new selection)
            }
        }

        startDrawing(pos.x, pos.y);

        switch (currentTool) {
            case 'pencil':
            case 'brush':
            case 'lighten':
            case 'darken':
                drawPixel(pos.x, pos.y, foregroundColor);
                break;
            case 'eraser':
                drawPixel(pos.x, pos.y, { r: 0, g: 0, b: 0, a: 0 }); // Color doesn't matter for clearRect
                break;
            case 'fill':
                floodFill(pos.x, pos.y, foregroundColor);
                break;
            case 'color-replace':
                replaceColor(pos.x, pos.y);
                break;
            case 'eyedropper':
                pickColor(pos.x, pos.y);
                break;
        }
    }, [currentTool, pan, screenToCanvas, startDrawing, drawPixel, foregroundColor, floodFill, pickColor, floatingSelection, commitFloatingSelection]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            setPan({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
            });
            return;
        }

        const pos = screenToCanvas(e.clientX, e.clientY);
        if (!pos) return;

        // Handle moving floating selection
        if (floatingSelection && isDrawing && lastPoint) {
            if (currentTool === 'select-rect' || currentTool === 'select-lasso') {
                // Check if we are dragging the selection (calc delta)
                const dx = pos.x - lastPoint.x;
                const dy = pos.y - lastPoint.y;
                if (dx !== 0 || dy !== 0) {
                    moveSelection(dx, dy);
                    continueDrawing(pos.x, pos.y); // Update last point
                }
                return;
            }
        }

        if (isDrawing && lastPoint) {
            switch (currentTool) {
                case 'pencil':
                case 'brush':
                    drawLine(lastPoint.x, lastPoint.y, pos.x, pos.y, foregroundColor);
                    break;
                case 'eraser':
                    drawLine(lastPoint.x, lastPoint.y, pos.x, pos.y, { r: 0, g: 0, b: 0, a: 0 });
                    break;
            }
            continueDrawing(pos.x, pos.y);
        }
    }, [isPanning, panStart, isDrawing, lastPoint, currentTool, screenToCanvas, drawLine, foregroundColor, continueDrawing, floatingSelection, moveSelection]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        if (isDrawing) {
            endDrawing();

            // Save to history and frame
            const offscreen = offscreenRef.current;
            if (offscreen) {
                const ctx = offscreen.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
                    // Store reference to avoid redundant re-render updates
                    lastSyncedImageDataRef.current = imageData;
                    if (activeLayerId) {
                        updateLayerImageData(activeLayerId, imageData);
                        pushHistory(activeLayerId, imageData); // Push to history
                        // Also sync to frame layer for persistence
                        updateFrameLayerData(currentFrameIndex, activeLayerId, imageData);
                        // Also sync to frame for thumbnail/preview
                        updateFrameImageData(currentFrameIndex, imageData);
                    } else {
                        updateFrameImageData(currentFrameIndex, imageData);
                    }
                }
            }
        }
    }, [isDrawing, endDrawing, canvasWidth, canvasHeight, currentFrameIndex, updateFrameImageData, activeLayerId, updateLayerImageData, pushHistory, updateFrameLayerData]);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        const offscreen = offscreenRef.current;
        if (!canvas || !offscreen) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const container = containerRef.current;
        if (!container) return;

        // Resize display canvas
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Clear with background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw checkerboard pattern for transparency
        ctx.save();
        ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
        ctx.translate(-canvasWidth * zoom / 2, -canvasHeight * zoom / 2);

        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a2a' : '#333333';
                ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
            }
        }

        // Draw onion skin (previous frames)
        if (onionSkin.enabled) {
            ctx.globalAlpha = onionSkin.prevOpacity / 100;
            for (let i = 1; i <= onionSkin.prevFrames; i++) {
                const prevIndex = currentFrameIndex - i;
                if (prevIndex >= 0 && frames[prevIndex]?.imageData) {
                    // Would draw previous frame with tint
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvasWidth;
                    tempCanvas.height = canvasHeight;
                    const tempCtx = tempCanvas.getContext('2d');
                    if (tempCtx) {
                        tempCtx.putImageData(frames[prevIndex].imageData, 0, 0);
                        ctx.drawImage(tempCanvas, 0, 0, canvasWidth * zoom, canvasHeight * zoom);
                    }
                }
            }
            ctx.globalAlpha = 1;
        }

        // Draw the current frame
        ctx.imageSmoothingEnabled = false;

        // Tiled Preview Logic
        if (tiledPreview) {
            for (let ty = -1; ty <= 1; ty++) {
                for (let tx = -1; tx <= 1; tx++) {
                    const isCenter = tx === 0 && ty === 0;
                    if (!isCenter) ctx.globalAlpha = 0.5;

                    ctx.drawImage(
                        offscreen,
                        tx * canvasWidth * zoom,
                        ty * canvasHeight * zoom,
                        canvasWidth * zoom,
                        canvasHeight * zoom
                    );

                    if (!isCenter) ctx.globalAlpha = 1.0;
                }
            }
        } else {
            ctx.drawImage(offscreen, 0, 0, canvasWidth * zoom, canvasHeight * zoom);
        }

        // Draw Floating Selection
        if (floatingSelection) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = floatingSelection.width;
            tempCanvas.height = floatingSelection.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.putImageData(floatingSelection.imageData, 0, 0);

                ctx.drawImage(
                    tempCanvas,
                    floatingSelection.x * zoom,
                    floatingSelection.y * zoom,
                    floatingSelection.width * zoom,
                    floatingSelection.height * zoom
                );

                ctx.strokeStyle = '#fff';
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(
                    floatingSelection.x * zoom,
                    floatingSelection.y * zoom,
                    floatingSelection.width * zoom,
                    floatingSelection.height * zoom
                );
                ctx.setLineDash([]);
            }
        }

        // Draw grid
        if (showGrid && zoom >= 4) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;

            for (let x = 0; x <= canvasWidth; x++) {
                ctx.beginPath();
                ctx.moveTo(x * zoom, 0);
                ctx.lineTo(x * zoom, canvasHeight * zoom);
                ctx.stroke();
            }
            for (let y = 0; y <= canvasHeight; y++) {
                ctx.beginPath();
                ctx.moveTo(0, y * zoom);
                ctx.lineTo(canvasWidth * zoom, y * zoom);
                ctx.stroke();
            }
        }

        // Draw Symmetry Lines
        if (symmetry.enabled) {
            ctx.strokeStyle = 'rgba(64, 224, 208, 0.5)'; // Turquoise
            ctx.lineWidth = 1;

            if (symmetry.xAxis) {
                const x = symmetry.centerX * zoom;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvasHeight * zoom);
                ctx.stroke();
            }
            if (symmetry.yAxis) {
                const y = symmetry.centerY * zoom;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvasWidth * zoom, y);
                ctx.stroke();
            }
        }

        // Canvas border
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvasWidth * zoom, canvasHeight * zoom);

        // Draw Tool Cursor Preview
        if (cursorPos && !isPanning && !floatingSelection) {
            const size = (currentTool === 'pencil' || currentTool === 'eraser')
                ? (currentTool === 'pencil' ? 1 : brushSettings.size)
                : brushSettings.size;

            if (currentTool === 'brush' || currentTool === 'pencil' || currentTool === 'eraser' || currentTool === 'lighten' || currentTool === 'darken') {
                const halfSize = Math.floor(size / 2);
                const drawX = Math.floor(cursorPos.x) - halfSize;
                const drawY = Math.floor(cursorPos.y) - halfSize;

                // Draw preview rect
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(drawX * zoom, drawY * zoom, size * zoom, size * zoom);

                // Inner contrast line
                ctx.strokeStyle = '#000';
                ctx.strokeRect(
                    drawX * zoom + 1,
                    drawY * zoom + 1,
                    size * zoom - 2,
                    size * zoom - 2
                );

                // Show symmetry cursors
                if (symmetry.enabled) {
                    ctx.strokeStyle = 'rgba(64, 224, 208, 0.8)'; // Turquoise for symmetry

                    if (symmetry.xAxis) {
                        const symX = (symmetry.centerX * 2) - cursorPos.x - 1;
                        const symDrawX = Math.floor(symX) - halfSize;
                        ctx.strokeRect(symDrawX * zoom, drawY * zoom, size * zoom, size * zoom);
                    }
                    if (symmetry.yAxis) {
                        const symY = (symmetry.centerY * 2) - cursorPos.y - 1;
                        const symDrawY = Math.floor(symY) - halfSize;
                        ctx.strokeRect(drawX * zoom, symDrawY * zoom, size * zoom, size * zoom);
                    }
                    if (symmetry.xAxis && symmetry.yAxis) {
                        const symX = (symmetry.centerX * 2) - cursorPos.x - 1;
                        const symY = (symmetry.centerY * 2) - cursorPos.y - 1;
                        const symDrawX = Math.floor(symX) - halfSize;
                        const symDrawY = Math.floor(symY) - halfSize;
                        ctx.strokeRect(symDrawX * zoom, symDrawY * zoom, size * zoom, size * zoom);
                    }
                }
            }
        }

        ctx.restore();
    }, [zoom, pan, canvasWidth, canvasHeight, showGrid, onionSkin, currentFrameIndex, frames, tiledPreview, symmetry, floatingSelection, cursorPos, currentTool, brushSettings, isPanning]);

    // Handle wheel zoom with non-passive listener
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom((z) => Math.max(1, Math.min(32, z * delta)));
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', onWheel);
        };
    }, []);

    // Zoom control functions
    const zoomIn = useCallback(() => {
        setZoom((z) => Math.min(32, z * 1.25));
    }, []);

    const zoomOut = useCallback(() => {
        setZoom((z) => Math.max(1, z / 1.25));
    }, []);

    const resetZoom = useCallback(() => {
        setZoom(8);
        setPan({ x: 0, y: 0 });
    }, []);

    const fitToScreen = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const scaleX = (rect.width - 100) / canvasWidth;
        const scaleY = (rect.height - 100) / canvasHeight;
        setZoom(Math.max(1, Math.min(32, Math.floor(Math.min(scaleX, scaleY)))));
        setPan({ x: 0, y: 0 });
    }, [canvasWidth, canvasHeight]);

    // Keyboard shortcuts and WASD navigation
    useEffect(() => {
        const panSpeed = 3;  // Pixels per frame when holding
        const pressedKeys = new Set<string>();
        let animationFrameId: number | null = null;

        const updatePan = () => {
            if (pressedKeys.size === 0) {
                animationFrameId = null;
                return;
            }

            let dx = 0;
            let dy = 0;

            if (pressedKeys.has('w')) dy += panSpeed * zoom;
            if (pressedKeys.has('s')) dy -= panSpeed * zoom;
            if (pressedKeys.has('a')) dx += panSpeed * zoom;
            if (pressedKeys.has('d')) dx -= panSpeed * zoom;

            if (dx !== 0 || dy !== 0) {
                setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            }

            animationFrameId = requestAnimationFrame(updatePan);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't capture if focused on input
            if (document.activeElement?.tagName === 'INPUT' ||
                document.activeElement?.tagName === 'TEXTAREA') return;

            const key = e.key.toLowerCase();

            // WASD navigation
            if (['w', 'a', 's', 'd'].includes(key) && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();

                // First press - move 1 pixel immediately
                if (!pressedKeys.has(key)) {
                    pressedKeys.add(key);

                    // Single tap movement (1 pixel * zoom level)
                    let dx = 0, dy = 0;
                    if (key === 'w') dy = zoom;
                    if (key === 's') dy = -zoom;
                    if (key === 'a') dx = zoom;
                    if (key === 'd') dx = -zoom;
                    setPan(p => ({ x: p.x + dx, y: p.y + dy }));

                    // Start continuous movement if not already running
                    if (!animationFrameId) {
                        animationFrameId = requestAnimationFrame(updatePan);
                    }
                }
                return;
            }

            // Ctrl/Cmd shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                        break;
                    case 'y':
                        e.preventDefault();
                        redo();
                        break;
                    case '=':
                    case '+':
                        e.preventDefault();
                        zoomIn();
                        break;
                    case '-':
                        e.preventDefault();
                        zoomOut();
                        break;
                    case '0':
                        e.preventDefault();
                        resetZoom();
                        break;
                }
            }

            // Non-modifier zoom keys
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key) {
                    case '+':
                    case '=':
                        zoomIn();
                        break;
                    case '-':
                        zoomOut();
                        break;
                    case 'Delete':
                    case 'Backspace':
                        if (floatingSelection) {
                            deleteSelection();
                        }
                        break;
                    case 'r':
                    case 'R':
                        if (floatingSelection) {
                            rotateSelection();
                        }
                        break;
                    case 'Enter':
                        if (floatingSelection) {
                            commitFloatingSelection();
                        }
                        break;
                    case 'ArrowUp':
                        if (floatingSelection) moveSelection(0, -1);
                        else setPan(p => ({ ...p, y: p.y - zoom }));
                        break;
                    case 'ArrowDown':
                        if (floatingSelection) moveSelection(0, 1);
                        else setPan(p => ({ ...p, y: p.y + zoom }));
                        break;
                    case 'ArrowLeft':
                        if (floatingSelection) moveSelection(-1, 0);
                        else setPan(p => ({ ...p, x: p.x + zoom }));
                        break;
                    case 'ArrowRight':
                        if (floatingSelection) moveSelection(1, 0);
                        else setPan(p => ({ ...p, x: p.x - zoom }));
                        break;
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(key)) {
                pressedKeys.delete(key);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [undo, redo, zoomIn, zoomOut, resetZoom, zoom]);


    // Track cursor position
    const handleCursorMove = useCallback((e: React.MouseEvent) => {
        const pos = screenToCanvas(e.clientX, e.clientY);
        setCursorPos(pos);
    }, [screenToCanvas]);

    useEffect(() => {
        render();
    }, [render, isDrawing, lastPoint]);

    useEffect(() => {
        const handleResize = () => render();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [render]);

    // Load current frame's image data
    useEffect(() => {
        const currentFrame = frames[currentFrameIndex];
        // Only load frame if we don't have an active layer loop handling it, 
        // OR if this is strictly for animation playback/init.
        // For now, let's allow frame loading to happen, but Layer loading (below) should take precedence for editing.
        if (currentFrame?.imageData && offscreenRef.current && !activeLayerId) {
            const ctx = offscreenRef.current.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                ctx.putImageData(currentFrame.imageData, 0, 0);
                render();
            }
        }
    }, [currentFrameIndex, frames, render, activeLayerId]);

    // Sync Active Layer to Offscreen
    useEffect(() => {
        if (!activeLayerId || !layers.length) return;

        const layer = layers.find(l => l.id === activeLayerId);
        // If layer doesn't exist, do nothing
        if (!layer) return;

        const offscreen = offscreenRef.current;
        if (!offscreen) return;

        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // If layer has no image data (empty/new), clear the canvas
        if (!layer.imageData) {
            // Optimization: If we already know it's empty (ref is null), skip
            if (lastSyncedImageDataRef.current === null) return;

            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            lastSyncedImageDataRef.current = null;
            render();
            return;
        }

        // Optimization: If layer data matches what we just synced/drew, skip
        if (layer.imageData === lastSyncedImageDataRef.current) {
            return;
        }

        // Otherwise, update canvas with layer data
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.putImageData(layer.imageData, 0, 0);
        lastSyncedImageDataRef.current = layer.imageData;
        render();

    }, [activeLayerId, layers, render, canvasWidth, canvasHeight]);

    return (
        <div
            ref={containerRef}
            className={clsx("relative flex-1 overflow-hidden bg-zinc-900 flex flex-col", className)}
            tabIndex={0}
        >
            {/* Top Toolbar - Zoom & Undo/Redo */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                {/* Undo/Redo */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={undo}
                        title="Undo (Ctrl+Z)"
                        className="p-2 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        onClick={redo}
                        title="Redo (Ctrl+Y)"
                        className="p-2 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                        <Redo2 size={16} />
                    </button>
                </div>

                {/* Cursor Position */}
                {cursorPos && (
                    <div className="px-3 py-1 bg-zinc-700/50 rounded text-xs font-mono text-zinc-300">
                        X: {cursorPos.x}, Y: {cursorPos.y}
                    </div>
                )}

                {/* Selection Info */}
                {selection.active && selection.width > 0 && (
                    <div className="px-3 py-1 bg-indigo-600/30 rounded text-xs font-mono text-indigo-300">
                        Selection: {selection.width}×{selection.height} at ({selection.x}, {selection.y})
                    </div>
                )}

                {/* Zoom Controls */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={zoomOut}
                        title="Zoom Out (-)"
                        className="p-2 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                        <ZoomOut size={16} />
                    </button>
                    <div className="px-3 py-1 bg-zinc-700/50 rounded text-sm font-mono text-zinc-300 min-w-[60px] text-center">
                        {Math.round(zoom * 100)}%
                    </div>
                    <button
                        onClick={zoomIn}
                        title="Zoom In (+)"
                        className="p-2 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                        <ZoomIn size={16} />
                    </button>
                    <button
                        onClick={fitToScreen}
                        title="Fit to Screen"
                        className="p-2 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                        <Maximize size={16} />
                    </button>
                    <button
                        onClick={resetZoom}
                        title="Reset View (Ctrl+0)"
                        className="p-2 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
                    >
                        <RotateCcw size={16} />
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 relative overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className="w-full h-full cursor-crosshair"
                    onMouseDown={(e) => {
                        handleMouseDown(e);
                        handleSelectionStart(e);
                    }}
                    onMouseMove={(e) => {
                        handleMouseMove(e);
                        handleCursorMove(e);
                        handleSelectionMove(e);
                    }}
                    onMouseUp={() => {
                        handleMouseUp();
                        handleSelectionEnd();
                    }}
                    onMouseLeave={() => {
                        handleMouseUp();
                        handleSelectionEnd();
                    }}
                />
            </div>
        </div>
    );
}
