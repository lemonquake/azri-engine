/**
 * Import Tilesheet Modal — upload a spritesheet image, configure grid settings,
 * auto-detect transparency per tile, and import as individual TileDefinitions.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { X, Upload, Check, EyeOff } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import type { TileDefinition, Tilesheet } from '../types';

interface ImportTilesheetModalProps {
    onClose: () => void;
}

interface TileCellMeta {
    col: number;
    row: number;
    isEmpty: boolean;
    hasTransparency: boolean;
}

/**
 * Analyze each tile cell in the spritesheet for transparency.
 * Returns metadata per cell.
 */
function analyzeTiles(
    img: HTMLImageElement,
    cols: number,
    rows: number,
    frameWidth: number,
    frameHeight: number,
    paddingX: number,
    paddingY: number,
    offsetX: number,
    offsetY: number,
): TileCellMeta[] {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Single getImageData for the entire image — avoids N costly GPU readbacks
    const fullImageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = fullImageData.data;
    const imgW = img.width;

    const results: TileCellMeta[] = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const srcX = offsetX + col * (frameWidth + paddingX);
            const srcY = offsetY + row * (frameHeight + paddingY);

            // Bounds check
            if (srcX + frameWidth > img.width || srcY + frameHeight > img.height) {
                results.push({ col, row, isEmpty: true, hasTransparency: true });
                continue;
            }

            let opaquePixels = 0;
            let transparentPixels = 0;

            // Sample alpha directly from the flat pixel array
            for (let py = 0; py < frameHeight; py++) {
                const rowOffset = ((srcY + py) * imgW + srcX) * 4;
                for (let px = 0; px < frameWidth; px++) {
                    const alpha = pixels[rowOffset + px * 4 + 3];
                    if (alpha < 10) {
                        transparentPixels++;
                    } else {
                        opaquePixels++;
                    }
                }
            }

            const isEmpty = opaquePixels === 0;
            const hasTransparency = transparentPixels > 0;

            results.push({ col, row, isEmpty, hasTransparency });
        }
    }

    return results;
}

export function ImportTilesheetModal({ onClose }: ImportTilesheetModalProps) {
    const { addTilesheet } = useEditorStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const [name, setName] = useState('');

    // Grid settings
    const [frameWidth, setFrameWidth] = useState(32);
    const [frameHeight, setFrameHeight] = useState(32);
    const [paddingX, setPaddingX] = useState(0);
    const [paddingY, setPaddingY] = useState(0);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [skipEmpty, setSkipEmpty] = useState(true);

    // Computed grid
    const columns = imageDimensions.width > 0
        ? Math.max(1, Math.floor((imageDimensions.width - offsetX + paddingX) / (frameWidth + paddingX)))
        : 0;
    const rows = imageDimensions.height > 0
        ? Math.max(1, Math.floor((imageDimensions.height - offsetY + paddingY) / (frameHeight + paddingY)))
        : 0;

    // Canvas for preview
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Tile analysis
    const tileMeta = useMemo(() => {
        if (!imageEl || columns === 0 || rows === 0) return [];
        return analyzeTiles(imageEl, columns, rows, frameWidth, frameHeight, paddingX, paddingY, offsetX, offsetY);
    }, [imageEl, columns, rows, frameWidth, frameHeight, paddingX, paddingY, offsetX, offsetY]);

    const totalTiles = tileMeta.length;
    const emptyTiles = tileMeta.filter(t => t.isEmpty).length;
    const transparentTiles = tileMeta.filter(t => t.hasTransparency && !t.isEmpty).length;
    const importCount = skipEmpty ? totalTiles - emptyTiles : totalTiles;

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
                setImageEl(img);

                // Auto-detect frame size from common patterns
                if (img.width === img.height) {
                    // Square image — try common tile sizes
                    const side = img.width;
                    for (const s of [16, 32, 48, 64]) {
                        if (side % s === 0) {
                            setFrameWidth(s);
                            setFrameHeight(s);
                            break;
                        }
                    }
                }
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
    };

    // Draw preview canvas with grid overlay
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !imageEl || !imageSrc) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const scaleX = rect.width / imageDimensions.width;
        const scaleY = rect.height / imageDimensions.height;
        const scale = Math.min(scaleX, scaleY, 2);

        const renderWidth = imageDimensions.width * scale;
        const renderHeight = imageDimensions.height * scale;

        canvas.width = rect.width;
        canvas.height = rect.height;

        const ox = (rect.width - renderWidth) / 2;
        const oy = (rect.height - renderHeight) / 2;

        // Background
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Checkerboard under image
        const checkerSize = 8;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, renderWidth, renderHeight);
        ctx.clip();
        for (let y = oy; y < oy + renderHeight; y += checkerSize) {
            for (let x = ox; x < ox + renderWidth; x += checkerSize) {
                const cx = Math.floor((x - ox) / checkerSize);
                const cy = Math.floor((y - oy) / checkerSize);
                ctx.fillStyle = (cx + cy) % 2 === 0 ? '#27272a' : '#3f3f46';
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }
        ctx.restore();

        // Draw image
        ctx.drawImage(imageEl, ox, oy, renderWidth, renderHeight);

        // Draw grid overlay
        if (columns > 0 && rows > 0) {
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < columns; col++) {
                    const srcX = offsetX + col * (frameWidth + paddingX);
                    const srcY = offsetY + row * (frameHeight + paddingY);

                    const rx = ox + srcX * scale;
                    const ry = oy + srcY * scale;
                    const rw = frameWidth * scale;
                    const rh = frameHeight * scale;

                    // Find meta for this cell
                    const meta = tileMeta.find(m => m.col === col && m.row === row);

                    if (meta?.isEmpty) {
                        // Empty tile overlay
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
                        ctx.fillRect(rx, ry, rw, rh);
                    }

                    // Grid lines
                    ctx.strokeStyle = meta?.isEmpty
                        ? 'rgba(239, 68, 68, 0.6)'
                        : meta?.hasTransparency
                            ? 'rgba(59, 130, 246, 0.6)'
                            : 'rgba(99, 102, 241, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
                }
            }
        }
    }, [imageEl, imageSrc, imageDimensions, frameWidth, frameHeight, paddingX, paddingY, offsetX, offsetY, columns, rows, tileMeta]);

    const handleSave = () => {
        if (!imageSrc || !imageEl) return;

        const sheetId = `sheet_${Date.now()}`;

        const newSheet: Tilesheet = {
            id: sheetId,
            name: name || 'Custom Sheet',
            imageSrc,
            width: imageDimensions.width,
            height: imageDimensions.height,
            frameWidth,
            frameHeight,
            paddingX,
            paddingY,
            offsetX,
            offsetY,
            columns,
            rows,
        };

        // Generate TileDefinitions for each cell
        const tiles: TileDefinition[] = [];
        for (const meta of tileMeta) {
            if (skipEmpty && meta.isEmpty) continue;

            const srcX = offsetX + meta.col * (frameWidth + paddingX);
            const srcY = offsetY + meta.row * (frameHeight + paddingY);

            tiles.push({
                id: `tile_${sheetId}_${meta.col}_${meta.row}`,
                name: `${name || 'Tile'} (${meta.col},${meta.row})`,
                color: '#ffffff',
                textureSrc: imageSrc,
                tilesheetId: sheetId,
                srcX,
                srcY,
                srcWidth: frameWidth,
                srcHeight: frameHeight,
                hasTransparency: meta.hasTransparency,
            });
        }

        addTilesheet(newSheet, tiles);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col w-[900px] h-[650px] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
                    <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Import Tileset</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
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
                                <span className="text-sm font-medium">Click to Upload Spritesheet</span>
                                <span className="text-xs text-zinc-600 mt-1">PNG, JPG, WebP</span>
                            </div>
                        ) : (
                            <canvas
                                ref={canvasRef}
                                className="max-w-full max-h-full"
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
                    <div className="w-72 border-l border-zinc-800 bg-zinc-800/50 p-4 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                        {/* Name */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                                placeholder="Tileset Name"
                            />
                        </div>

                        {/* Frame Size */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Tile Size</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-zinc-500">Width</span>
                                    <input
                                        type="number"
                                        value={frameWidth}
                                        onChange={(e) => setFrameWidth(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-zinc-500">Height</span>
                                    <input
                                        type="number"
                                        value={frameHeight}
                                        onChange={(e) => setFrameHeight(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Padding */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Padding</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-zinc-500">X</span>
                                    <input
                                        type="number"
                                        value={paddingX}
                                        onChange={(e) => setPaddingX(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-zinc-500">Y</span>
                                    <input
                                        type="number"
                                        value={paddingY}
                                        onChange={(e) => setPaddingY(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Offset */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Offset</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-zinc-500">X</span>
                                    <input
                                        type="number"
                                        value={offsetX}
                                        onChange={(e) => setOffsetX(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-zinc-500">Y</span>
                                    <input
                                        type="number"
                                        value={offsetY}
                                        onChange={(e) => setOffsetY(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Tile Stats */}
                        {imageSrc && (
                            <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900/50">
                                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Tile Analysis</div>
                                <div className="flex flex-col gap-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Grid</span>
                                        <span className="font-mono text-zinc-300">{columns} × {rows}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Total Tiles</span>
                                        <span className="font-mono text-zinc-300">{totalTiles}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-red-400">Empty (transparent)</span>
                                        <span className="font-mono text-red-400">{emptyTiles}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-blue-400">Has transparency</span>
                                        <span className="font-mono text-blue-400">{transparentTiles}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold pt-1 border-t border-zinc-700">
                                        <span className="text-zinc-200">Will Import</span>
                                        <span className="font-mono text-emerald-400">{importCount}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Skip Empty Toggle */}
                        {imageSrc && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <EyeOff size={12} className="text-zinc-500" />
                                    <span className="text-[10px] text-zinc-400 uppercase">Skip Empty Tiles</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={skipEmpty}
                                        onChange={(e) => setSkipEmpty(e.target.checked)}
                                    />
                                    <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                            </div>
                        )}

                        <div className="mt-auto flex gap-2 pt-3">
                            {imageSrc && (
                                <button
                                    onClick={() => { setImageSrc(null); setImageEl(null); }}
                                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-zinc-700 transition-colors"
                                >
                                    Reset
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={!imageSrc || importCount === 0}
                                className={clsx(
                                    "flex-[2] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all",
                                    imageSrc && importCount > 0
                                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                )}
                            >
                                <Check size={16} />
                                Import {importCount > 0 ? `(${importCount})` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
