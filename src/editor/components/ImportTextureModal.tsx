import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { X, Upload, Check, Grid as GridIcon, Square } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import { generateTileId } from '../types';
import type { TileDefinition, Tilesheet } from '../types';

interface ImportTextureModalProps {
    onClose: () => void;
    initialMode?: 'single' | 'tileset';
}

type ImportMode = 'single' | 'tileset';

export default function ImportTextureModal({ onClose, initialMode = 'single' }: ImportTextureModalProps) {
    const { addTileDefinition, addTilesheet } = useEditorStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const [name, setName] = useState('');
    const [mode, setMode] = useState<ImportMode>(initialMode);

    // Single Mode State
    const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);

    // Tileset Mode State
    const [tileSize, setTileSize] = useState({ w: 32, h: 32 });
    const [padding, setPadding] = useState({ x: 0, y: 0 }); // Outer padding
    const [spacing, setSpacing] = useState({ x: 0, y: 0 }); // Inner gap
    const [offset, setOffset] = useState({ x: 0, y: 0 });   // Start offset

    // Canvas for rendering image and selection/grid overlay
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load image
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const src = event.target?.result as string;
            setImageSrc(src);
            setName(file.name.split('.')[0]);

            const img = new Image();
            img.onload = () => {
                setImageDimensions({ width: img.width, height: img.height });
                // Default selection: full image
                setSelection({ x: 0, y: 0, w: img.width, h: img.height });
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
    };

    // Draw canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !imageSrc) return;

        const img = new Image();
        img.src = imageSrc;

        // Wait for image (though it should be loaded if we have dimensions)
        if (imageDimensions.width === 0) return;

        // Auto-fit canvas to container, maintaining aspect ratio
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();

        // Calculate scale to fit
        const scaleX = rect.width / imageDimensions.width;
        const scaleY = rect.height / imageDimensions.height;
        const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

        // Ensure scale is valid to avoid rendering issues
        if (!isFinite(scale) || scale <= 0) return;

        const renderWidth = imageDimensions.width * scale;
        const renderHeight = imageDimensions.height * scale;

        canvas.width = rect.width;
        canvas.height = rect.height;

        // Center image
        const offsetX = (rect.width - renderWidth) / 2;
        const offsetY = (rect.height - renderHeight) / 2;

        // Clear
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw checkerboard
        const checkerSize = 10;
        ctx.save();
        ctx.beginPath();
        ctx.rect(offsetX, offsetY, renderWidth, renderHeight);
        ctx.clip();
        for (let y = offsetY; y < offsetY + renderHeight; y += checkerSize) {
            for (let x = offsetX; x < offsetX + renderWidth; x += checkerSize) {
                if (((Math.floor((x - offsetX) / checkerSize) + Math.floor((y - offsetY) / checkerSize)) % 2) === 0) {
                    ctx.fillStyle = '#27272a';
                    ctx.fillRect(x, y, checkerSize, checkerSize);
                }
            }
        }
        ctx.restore();

        // Draw Image
        ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);

        // Draw Overlays based on Mode
        if (mode === 'single' && selection) {
            const sx = offsetX + selection.x * scale;
            const sy = offsetY + selection.y * scale;
            const sw = selection.w * scale;
            const sh = selection.h * scale;

            // Darken outside
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, canvas.width, sy); // Top
            ctx.fillRect(0, sy + sh, canvas.width, canvas.height - (sy + sh)); // Bottom
            ctx.fillRect(0, sy, sx, sh); // Left
            ctx.fillRect(sx + sw, sy, canvas.width - (sx + sw), sh); // Right

            // Outline
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sw, sh);
        } else if (mode === 'tileset') {
            // Draw Grid
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'; // Indigo-500 with opacity
            ctx.lineWidth = 1;
            ctx.beginPath();

            const cols = Math.floor((imageDimensions.width - padding.x * 2 + spacing.x) / (tileSize.w + spacing.x));
            const rows = Math.floor((imageDimensions.height - padding.y * 2 + spacing.y) / (tileSize.h + spacing.y));

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const gx = offsetX + (padding.x + x * (tileSize.w + spacing.x) + offset.x) * scale;
                    const gy = offsetY + (padding.y + y * (tileSize.h + spacing.y) + offset.y) * scale;
                    const gw = tileSize.w * scale;
                    const gh = tileSize.h * scale;

                    ctx.rect(gx, gy, gw, gh);
                }
            }
            ctx.stroke();

            // Highlight first tile to show ordering/origin
            if (cols > 0 && rows > 0) {
                const gx = offsetX + (padding.x + offset.x) * scale;
                const gy = offsetY + (padding.y + offset.y) * scale;
                const gw = tileSize.w * scale;
                const gh = tileSize.h * scale;
                ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
                ctx.fillRect(gx, gy, gw, gh);

                ctx.fillStyle = '#fff';
                ctx.font = '10px monospace';
                ctx.fillText('1', gx + 2, gy + 10);
            }
        }

    }, [imageSrc, imageDimensions, selection, containerRef.current?.getBoundingClientRect().width, mode, tileSize, padding, spacing, offset]);

    // Helper functions for mouse interaction
    const getImgCoords = (e: React.MouseEvent) => {
        if (!imageDimensions.width || !containerRef.current) return null;
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = rect.width / imageDimensions.width;
        const scaleY = rect.height / imageDimensions.height;
        const scale = Math.min(scaleX, scaleY, 1);

        const renderWidth = imageDimensions.width * scale;
        const renderHeight = imageDimensions.height * scale;
        const offsetX = (rect.width - renderWidth) / 2;
        const offsetY = (rect.height - renderHeight) / 2;

        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const imgX = Math.max(0, Math.min(imageDimensions.width, (clientX - offsetX) / scale));
        const imgY = Math.max(0, Math.min(imageDimensions.height, (clientY - offsetY) / scale));

        return { x: imgX, y: imgY };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (mode !== 'single') return; // Only drag-select in single mode
        const coords = getImgCoords(e);
        if (coords) {
            setIsDragging(true);
            setDragStart(coords);
            setSelection({ x: coords.x, y: coords.y, w: 0, h: 0 });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (mode !== 'single') return;
        if (isDragging && dragStart) {
            const coords = getImgCoords(e);
            if (coords) {
                const x = Math.min(dragStart.x, coords.x);
                const y = Math.min(dragStart.y, coords.y);
                const w = Math.abs(coords.x - dragStart.x);
                const h = Math.abs(coords.y - dragStart.y);
                setSelection({ x, y, w, h });
            }
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleSave = () => {
        if (!imageSrc) return;

        if (mode === 'single') {
            if (!selection) return;
            const newTile: TileDefinition = {
                id: generateTileId(),
                name: name || 'Custom Tile',
                color: '#ffffff', // Fallback
                textureSrc: imageSrc,
                srcX: Math.round(selection.x),
                srcY: Math.round(selection.y),
                srcWidth: Math.round(selection.w),
                srcHeight: Math.round(selection.h),
            };
            addTileDefinition(newTile);
        } else {
            // Tileset Import
            const cols = Math.floor((imageDimensions.width - padding.x * 2 + spacing.x) / (tileSize.w + spacing.x));
            const rows = Math.floor((imageDimensions.height - padding.y * 2 + spacing.y) / (tileSize.h + spacing.y));

            if (cols <= 0 || rows <= 0) return;

            const sheetId = `sheet_${Date.now()}`;
            const newSheet: Tilesheet = {
                id: sheetId,
                name: name || 'Imported Tilesheet',
                imageSrc: imageSrc,
                width: imageDimensions.width,
                height: imageDimensions.height,
                frameWidth: tileSize.w,
                frameHeight: tileSize.h,
                paddingX: padding.x,
                paddingY: padding.y,
                offsetX: offset.x,
                offsetY: offset.y,
                columns: cols,
                rows: rows
            };

            const newTiles: TileDefinition[] = [];
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const srcX = padding.x + x * (tileSize.w + spacing.x) + offset.x;
                    const srcY = padding.y + y * (tileSize.h + spacing.y) + offset.y;

                    newTiles.push({
                        id: `${sheetId}_${x}_${y}`,
                        name: `${name || 'Tile'} ${x},${y}`,
                        color: '#ffffff',
                        textureSrc: imageSrc, // Currently standalone tiles carry src, eventually move to sheet ref
                        tilesheetId: sheetId,
                        srcX,
                        srcY,
                        srcWidth: tileSize.w,
                        srcHeight: tileSize.h,
                    });
                }
            }

            addTilesheet(newSheet, newTiles);
        }

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col w-[900px] h-[700px] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
                    <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Import Texture</h2>
                    <div className="flex bg-zinc-800 rounded-lg p-1 ml-8">
                        <button
                            onClick={() => setMode('single')}
                            className={clsx(
                                "px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-2",
                                mode === 'single' ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
                            )}
                        >
                            <Square size={14} />
                            Single Tile
                        </button>
                        <button
                            onClick={() => setMode('tileset')}
                            className={clsx(
                                "px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-2",
                                mode === 'tileset' ? "bg-zinc-700 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
                            )}
                        >
                            <GridIcon size={14} />
                            Tileset
                        </button>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors ml-auto">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Canvas Area */}
                    <div ref={containerRef} className="flex-1 relative bg-black flex items-center justify-center overflow-hidden p-4">
                        {!imageSrc ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-pointer p-8 border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl transition-all"
                            >
                                <Upload size={32} className="mb-2" />
                                <span className="text-sm font-medium">Click to Upload Image</span>
                            </div>
                        ) : (
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                className={clsx(
                                    "max-w-full max-h-full shadow-2xl",
                                    mode === 'single' ? "cursor-crosshair" : "cursor-default"
                                )}
                            />
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileUpload}
                        />
                    </div>

                    {/* Sidebar */}
                    <div className="w-72 border-l border-zinc-800 bg-zinc-800/50 p-4 flex flex-col gap-4 overflow-y-auto">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-zinc-400 font-medium">Asset Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                                placeholder="Name"
                            />
                        </div>

                        <div className="h-px bg-zinc-800 my-1" />

                        {mode === 'single' && selection && (
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Selection</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-400">
                                        <span className="text-zinc-600 mr-2">X:</span>{Math.round(selection.x)}
                                    </div>
                                    <div className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-400">
                                        <span className="text-zinc-600 mr-2">Y:</span>{Math.round(selection.y)}
                                    </div>
                                    <div className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-400">
                                        <span className="text-zinc-600 mr-2">W:</span>{Math.round(selection.w)}
                                    </div>
                                    <div className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-400">
                                        <span className="text-zinc-600 mr-2">H:</span>{Math.round(selection.h)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {mode === 'tileset' && (
                            <div className="flex flex-col gap-4">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Grid Settings</span>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-zinc-500">Tile Size</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">W</span>
                                            <input
                                                type="number"
                                                value={tileSize.w}
                                                onChange={(e) => setTileSize(prev => ({ ...prev, w: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">H</span>
                                            <input
                                                type="number"
                                                value={tileSize.h}
                                                onChange={(e) => setTileSize(prev => ({ ...prev, h: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-zinc-500">Offset (Start Pos)</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">X</span>
                                            <input
                                                type="number"
                                                value={offset.x}
                                                onChange={(e) => setOffset(prev => ({ ...prev, x: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">Y</span>
                                            <input
                                                type="number"
                                                value={offset.y}
                                                onChange={(e) => setOffset(prev => ({ ...prev, y: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-zinc-500">Padding (Outer)</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">X</span>
                                            <input
                                                type="number"
                                                value={padding.x}
                                                onChange={(e) => setPadding(prev => ({ ...prev, x: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">Y</span>
                                            <input
                                                type="number"
                                                value={padding.y}
                                                onChange={(e) => setPadding(prev => ({ ...prev, y: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-zinc-500">Spacing (Inner Gap)</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">X</span>
                                            <input
                                                type="number"
                                                value={spacing.x}
                                                onChange={(e) => setSpacing(prev => ({ ...prev, x: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-600 font-mono">Y</span>
                                            <input
                                                type="number"
                                                value={spacing.y}
                                                onChange={(e) => setSpacing(prev => ({ ...prev, y: Number(e.target.value) }))}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3 bg-zinc-900 rounded border border-zinc-700 mt-2">
                                    <div className="text-xs text-zinc-400 mb-1">Estimated Tiles:</div>
                                    <div className="text-lg font-bold text-zinc-100">
                                        {imageDimensions.width > 0 ?
                                            Math.floor((imageDimensions.width - padding.x * 2 + spacing.x) / (tileSize.w + spacing.x)) *
                                            Math.floor((imageDimensions.height - padding.y * 2 + spacing.y) / (tileSize.h + spacing.y))
                                            : 0}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-auto flex gap-2 pt-4 border-t border-zinc-800">
                            {imageSrc && (
                                <button
                                    onClick={() => { setImageSrc(null); setSelection(null); setIsDragging(false); }}
                                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-zinc-700 transition-colors"
                                >
                                    Reset
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={!imageSrc}
                                className={clsx(
                                    "flex-[2] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all",
                                    imageSrc
                                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                )}
                            >
                                <Check size={16} />
                                Import
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
