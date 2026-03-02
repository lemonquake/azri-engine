/**
 * SpriteSheetCanvas - Interactive canvas for viewing and selecting sprite sheet frames
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { ZoomIn, ZoomOut, Move, RotateCcw } from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import { Tooltip, FrameTooltipContent } from './Tooltip';
import { LivePreviewOverlay } from './LivePreviewOverlay';

interface SpriteSheetCanvasProps {
    className?: string;
}

export function SpriteSheetCanvas({ className }: SpriteSheetCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const loadedImage = useCharacterMasterStore(s => s.loadedImage);
    const frames = useCharacterMasterStore(s => s.frames);
    const selection = useCharacterMasterStore(s => s.selection);
    const hoverFrameKey = useCharacterMasterStore(s => s.hoverFrameKey);
    const mode = useCharacterMasterStore(s => s.mode);

    const selectFrame = useCharacterMasterStore(s => s.selectFrame);
    const selectFrameRange = useCharacterMasterStore(s => s.selectFrameRange);
    const clearSelection = useCharacterMasterStore(s => s.clearSelection);
    const setHoverFrameKey = useCharacterMasterStore(s => s.setHoverFrameKey);

    const activeSpriteSheetId = useCharacterMasterStore(s => s.activeSpriteSheetId);
    const spriteSheets = useCharacterMasterStore(s => s.spriteSheets);
    const sheet = activeSpriteSheetId ? spriteSheets.get(activeSpriteSheetId) : null;

    const addFramesToAnimation = useCharacterMasterStore(s => s.addFramesToAnimation);
    const activeAnimationId = useCharacterMasterStore(s => s.activeAnimationId);

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);



    // Draw the canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const container = containerRef.current;
        if (!container) return;

        // Resize canvas to container
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Clear
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw checkerboard pattern
        const checkerSize = 10;
        for (let y = 0; y < canvas.height; y += checkerSize) {
            for (let x = 0; x < canvas.width; x += checkerSize) {
                const isEven = ((x / checkerSize) + (y / checkerSize)) % 2 === 0;
                ctx.fillStyle = isEven ? '#27272a' : '#1f1f23';
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }

        if (!loadedImage || !sheet) return;

        ctx.save();

        // Apply pan and zoom
        ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-loadedImage.width / 2, -loadedImage.height / 2);

        // Draw the sprite sheet image
        ctx.drawImage(loadedImage, 0, 0);

        // Draw grid overlay using sheet's grid settings
        const gridSettings = sheet.gridSettings;
        if (gridSettings.visible) {
            ctx.save();

            // Parse color and apply opacity
            const gridColor = gridSettings.color;
            ctx.globalAlpha = gridSettings.opacity;
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = gridSettings.lineWidth / zoom;

            // Set line dash pattern based on style
            if (gridSettings.style === 'dashed') {
                ctx.setLineDash([8 / zoom, 4 / zoom]);
            } else if (gridSettings.style === 'dotted') {
                ctx.setLineDash([2 / zoom, 4 / zoom]);
            } else {
                ctx.setLineDash([]);
            }

            // Draw horizontal lines
            for (let row = 0; row <= sheet.rows; row++) {
                const y = sheet.offsetY + row * (sheet.frameHeight + sheet.paddingY);
                ctx.beginPath();
                ctx.moveTo(sheet.offsetX, y);
                ctx.lineTo(sheet.offsetX + sheet.columns * (sheet.frameWidth + sheet.paddingX) - sheet.paddingX, y);
                ctx.stroke();
            }

            // Draw vertical lines
            for (let col = 0; col <= sheet.columns; col++) {
                const x = sheet.offsetX + col * (sheet.frameWidth + sheet.paddingX);
                ctx.beginPath();
                ctx.moveTo(x, sheet.offsetY);
                ctx.lineTo(x, sheet.offsetY + sheet.rows * (sheet.frameHeight + sheet.paddingY) - sheet.paddingY);
                ctx.stroke();
            }

            // Draw guide lines (crosses in center of each frame)
            if (gridSettings.guideLines) {
                ctx.globalAlpha = gridSettings.opacity * 0.3;
                ctx.lineWidth = 1 / zoom;
                ctx.setLineDash([]);

                for (let row = 0; row < sheet.rows; row++) {
                    for (let col = 0; col < sheet.columns; col++) {
                        const fx = sheet.offsetX + col * (sheet.frameWidth + sheet.paddingX);
                        const fy = sheet.offsetY + row * (sheet.frameHeight + sheet.paddingY);
                        const cx = fx + sheet.frameWidth / 2;
                        const cy = fy + sheet.frameHeight / 2;

                        // Horizontal guide
                        ctx.beginPath();
                        ctx.moveTo(fx + 4, cy);
                        ctx.lineTo(fx + sheet.frameWidth - 4, cy);
                        ctx.stroke();

                        // Vertical guide
                        ctx.beginPath();
                        ctx.moveTo(cx, fy + 4);
                        ctx.lineTo(cx, fy + sheet.frameHeight - 4);
                        ctx.stroke();
                    }
                }
            }

            // Draw frame labels
            if (gridSettings.showLabels && zoom >= 0.5) {
                ctx.globalAlpha = gridSettings.opacity * 0.8;
                ctx.fillStyle = gridColor;
                ctx.font = `bold ${Math.max(10, 12 / zoom)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                for (let row = 0; row < sheet.rows; row++) {
                    for (let col = 0; col < sheet.columns; col++) {
                        const fx = sheet.offsetX + col * (sheet.frameWidth + sheet.paddingX);
                        const fy = sheet.offsetY + row * (sheet.frameHeight + sheet.paddingY);
                        const index = row * sheet.columns + col;

                        // Draw label background
                        ctx.globalAlpha = 0.7;
                        ctx.fillStyle = '#18181b';
                        const labelText = `${index}`;
                        const textMetrics = ctx.measureText(labelText);
                        const labelPadding = 2 / zoom;
                        ctx.fillRect(
                            fx + 2 / zoom,
                            fy + 2 / zoom,
                            textMetrics.width + labelPadding * 2,
                            10 / zoom + labelPadding * 2
                        );

                        // Draw label text
                        ctx.globalAlpha = gridSettings.opacity * 0.9;
                        ctx.fillStyle = gridColor;
                        ctx.fillText(labelText, fx + 2 / zoom + labelPadding + textMetrics.width / 2, fy + 3 / zoom + labelPadding);
                    }
                }
            }

            ctx.restore();
        }

        // Draw selected frames
        selection.frames.forEach((key) => {
            const frame = frames.get(key);
            if (!frame) return;

            ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.fillRect(frame.x, frame.y, frame.width, frame.height);

            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
        });

        // Draw hover frame
        if (hoverFrameKey && !selection.frames.has(hoverFrameKey)) {
            const frame = frames.get(hoverFrameKey);
            if (frame) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
                ctx.fillRect(frame.x, frame.y, frame.width, frame.height);

                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 2 / zoom;
                ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
            }
        }

        ctx.restore();
    }, [loadedImage, sheet, zoom, pan, frames, selection, hoverFrameKey]);

    // Redraw on changes
    useEffect(() => {
        draw();
    }, [draw]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => draw();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [draw]);

    // Convert screen coordinates to frame row/col
    const screenToFrame = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas || !sheet || !loadedImage) return null;

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Reverse the transform
        const cx = canvas.width / 2 + pan.x;
        const cy = canvas.height / 2 + pan.y;

        const sheetX = (x - cx) / zoom + loadedImage.width / 2;
        const sheetY = (y - cy) / zoom + loadedImage.height / 2;

        // Calculate row/col
        const col = Math.floor((sheetX - sheet.offsetX) / (sheet.frameWidth + sheet.paddingX));
        const row = Math.floor((sheetY - sheet.offsetY) / (sheet.frameHeight + sheet.paddingY));

        if (row >= 0 && row < sheet.rows && col >= 0 && col < sheet.columns) {
            return { row, col };
        }

        return null;
    }, [sheet, loadedImage, zoom, pan]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            // Middle click or Alt+click to pan
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            return;
        }

        if (e.button === 0) {
            const framePos = screenToFrame(e.clientX, e.clientY);
            if (framePos) {
                setDragStart(framePos);
                const key = `${framePos.row},${framePos.col}`;
                selectFrame(key, e.shiftKey || e.ctrlKey);
            } else if (!e.shiftKey && !e.ctrlKey) {
                clearSelection();
            }
        }
    }, [pan, screenToFrame, selectFrame, clearSelection]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanning) {
            setPan({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
            });
            return;
        }

        const framePos = screenToFrame(e.clientX, e.clientY);
        if (framePos) {
            const key = `${framePos.row},${framePos.col}`;
            setHoverFrameKey(key);

            // Handle drag selection
            if (dragStart && (dragStart.row !== framePos.row || dragStart.col !== framePos.col)) {
                selectFrameRange(dragStart.row, dragStart.col, framePos.row, framePos.col);
            }
        } else {
            setHoverFrameKey(null);
        }
    }, [isPanning, panStart, screenToFrame, setHoverFrameKey, dragStart, selectFrameRange]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setDragStart(null);
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom((z) => Math.max(0.1, Math.min(10, z * delta)));
    }, []);

    const resetView = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    const hoverFrame = hoverFrameKey ? frames.get(hoverFrameKey) : null;

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input is focused
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const speed = 20 / zoom;
            switch (e.key.toLowerCase()) {
                case 'w':
                    setPan(p => ({ ...p, y: p.y + speed }));
                    break;
                case 's':
                    setPan(p => ({ ...p, y: p.y - speed }));
                    break;
                case 'a':
                    setPan(p => ({ ...p, x: p.x + speed }));
                    break;
                case 'd':
                    setPan(p => ({ ...p, x: p.x - speed }));
                    break;
            }

            // Space: Add selected frames to animation
            if (e.code === 'Space') {
                if (selection.frames.size > 0 && activeAnimationId) {
                    e.preventDefault();
                    e.stopPropagation();
                    const keys = Array.from(selection.frames);
                    addFramesToAnimation(activeAnimationId, keys);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoom, selection, activeAnimationId, addFramesToAnimation]);

    const [showLivePreview, setShowLivePreview] = useState(true);

    return (
        <div ref={containerRef} className={clsx("relative flex-1 overflow-hidden", className)}>
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair focus:outline-none"
                tabIndex={0}
                onMouseDown={(e) => {
                    e.currentTarget.focus();
                    handleMouseDown(e);
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                    handleMouseUp();
                    setHoverFrameKey(null);
                }}
                onWheel={handleWheel}
            />

            {/* Live Preview Overlay (Only in Animation mode) */}
            {mode === 'animation' && showLivePreview && (
                <LivePreviewOverlay
                    className="top-4 right-4"
                    onClose={() => setShowLivePreview(false)}
                />
            )}

            {/* Re-open Live Preview Button (if closed in Animation mode) */}
            {mode === 'animation' && !showLivePreview && (
                <button
                    onClick={() => setShowLivePreview(true)}
                    className="absolute top-4 right-4 px-3 py-1.5 bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors shadow-lg"
                >
                    Show Live Preview
                </button>
            )}

            {/* Zoom controls */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-zinc-800/90 backdrop-blur rounded-lg p-1.5 border border-zinc-700">
                <Tooltip content="Zoom Out">
                    <button
                        onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                    >
                        <ZoomOut size={16} className="text-zinc-300" />
                    </button>
                </Tooltip>

                <span className="text-xs font-mono text-zinc-400 min-w-[3rem] text-center">
                    {Math.round(zoom * 100)}%
                </span>

                <Tooltip content="Zoom In">
                    <button
                        onClick={() => setZoom((z) => Math.min(10, z * 1.25))}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                    >
                        <ZoomIn size={16} className="text-zinc-300" />
                    </button>
                </Tooltip>

                <div className="w-px h-5 bg-zinc-600 mx-1" />

                <Tooltip content="Reset View">
                    <button
                        onClick={resetView}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                    >
                        <RotateCcw size={16} className="text-zinc-300" />
                    </button>
                </Tooltip>
            </div>

            {/* Hover info */}
            {hoverFrame && (
                <div className="absolute top-4 left-4 bg-zinc-800/90 backdrop-blur rounded-lg px-3 py-2 border border-zinc-700 pointer-events-none">
                    <FrameTooltipContent
                        row={hoverFrame.row}
                        col={hoverFrame.col}
                        x={hoverFrame.x}
                        y={hoverFrame.y}
                        width={hoverFrame.width}
                        height={hoverFrame.height}
                        index={hoverFrame.row * (sheet?.columns || 1) + hoverFrame.col}
                    />
                </div>
            )}

            {/* Selection info (Only show if NOT in animation mode, to avoid clutter? Or keep it?) */}
            {/* Moving selection info to bottom right to avoid conflict with Live Preview if top-right is used, 
                but Live Preview is draggable. Let's keep selection info but maybe position it differently if needed.
                Actually, selection info is currently top-right. 
                I laid out Live Preview at top-4 right-4 initially.
                I'll move selection info to bottom-right or top-center to avoid overlap.
            */}
            {selection.frames.size > 0 && (
                <div className="absolute bottom-4 right-4 bg-indigo-600/90 backdrop-blur rounded-lg px-3 py-1.5 border border-indigo-500 pointer-events-none">
                    <span className="text-sm font-medium text-white">
                        {selection.frames.size} frame{selection.frames.size !== 1 ? 's' : ''} selected
                    </span>
                </div>
            )}

            {/* Empty state */}
            {!loadedImage && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center text-zinc-500">
                        <Move size={48} className="mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Load a sprite sheet to get started</p>
                    </div>
                </div>
            )}
        </div>
    );
}
