/**
 * TilesheetPicker — renders an imported tilesheet as a grid of individually
 * selectable tile cells with checkerboard transparency backgrounds.
 *
 * Performance: uses a shared image cache so the spritesheet is decoded once,
 * not per-tile-cell.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import type { TileDefinition, Tilesheet } from '../types';

// ── Shared image cache ──────────────────────────────────────────────
// Prevents decoding the same base64 spritesheet hundreds of times.
const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(src: string): Promise<HTMLImageElement> {
    const cached = imageCache.get(src);
    if (cached && cached.complete) return Promise.resolve(cached);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            imageCache.set(src, img);
            resolve(img);
        };
        img.src = src;
    });
}

// ── TileCell ─────────────────────────────────────────────────────────

interface TileCellProps {
    tile: TileDefinition;
    isSelected: boolean;
    onClick: () => void;
    sharedImage: HTMLImageElement | null;
}

function TileCell({ tile, isSelected, onClick, sharedImage }: TileCellProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !sharedImage) return;

        const size = 40;
        canvas.width = size;
        canvas.height = size;

        // Checkerboard for transparent tiles
        if (tile.hasTransparency) {
            const cs = 5;
            for (let y = 0; y < size; y += cs) {
                for (let x = 0; x < size; x += cs) {
                    ctx.fillStyle = (Math.floor(x / cs) + Math.floor(y / cs)) % 2 === 0 ? '#27272a' : '#3f3f46';
                    ctx.fillRect(x, y, cs, cs);
                }
            }
        } else {
            ctx.fillStyle = '#18181b';
            ctx.fillRect(0, 0, size, size);
        }

        const srcX = tile.srcX ?? 0;
        const srcY = tile.srcY ?? 0;
        const srcW = tile.srcWidth ?? 32;
        const srcH = tile.srcHeight ?? 32;

        ctx.drawImage(sharedImage, srcX, srcY, srcW, srcH, 0, 0, size, size);
    }, [tile, sharedImage]);

    return (
        <button
            onClick={onClick}
            className={clsx(
                "relative rounded-md border-2 transition-all hover:scale-110 hover:z-10 overflow-hidden",
                isSelected
                    ? "border-amber-400 shadow-lg shadow-amber-400/30 ring-1 ring-amber-400/50"
                    : "border-zinc-700 hover:border-zinc-500"
            )}
            title={tile.name}
            style={{ width: 40, height: 40 }}
        >
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ imageRendering: 'pixelated' }}
            />
        </button>
    );
}

// ── TilesheetPicker ──────────────────────────────────────────────────

interface TilesheetPickerProps {
    sheet: Tilesheet;
}

export function TilesheetPicker({ sheet }: TilesheetPickerProps) {
    const {
        selectedTileType,
        setSelectedTileType,
        availableTiles,
        removeTilesheet,
    } = useEditorStore();

    const [collapsed, setCollapsed] = useState(false);
    const [sharedImage, setSharedImage] = useState<HTMLImageElement | null>(null);

    // Load the spritesheet image once for all cells
    useEffect(() => {
        if (!sheet.imageSrc) return;
        getCachedImage(sheet.imageSrc).then(setSharedImage);
    }, [sheet.imageSrc]);

    const sheetTiles = availableTiles.filter(t => t.tilesheetId === sheet.id);

    const handleSelect = useCallback((tile: TileDefinition) => {
        setSelectedTileType(tile);
    }, [setSelectedTileType]);

    const handleDelete = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(`Delete tileset "${sheet.name}" and its ${sheetTiles.length} tiles?`)) {
            removeTilesheet(sheet.id);
        }
    }, [removeTilesheet, sheet.id, sheet.name, sheetTiles.length]);

    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-700/30 transition-colors group"
            >
                <div className="flex items-center gap-2">
                    {collapsed ? (
                        <ChevronRight size={14} className="text-zinc-500" />
                    ) : (
                        <ChevronDown size={14} className="text-zinc-500" />
                    )}
                    <span className="text-xs font-semibold text-zinc-300 truncate max-w-[120px]">{sheet.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{sheetTiles.length} tiles</span>
                </div>
                <button
                    onClick={handleDelete}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-zinc-600 transition-all"
                    title="Delete Tileset"
                >
                    <Trash2 size={12} />
                </button>
            </button>

            {/* Tile Grid */}
            {!collapsed && (
                <div className="px-2 pb-2">
                    <div className="flex flex-wrap gap-1">
                        {sheetTiles.map((tile) => (
                            <TileCell
                                key={tile.id}
                                tile={tile}
                                isSelected={selectedTileType.id === tile.id}
                                onClick={() => handleSelect(tile)}
                                sharedImage={sharedImage}
                            />
                        ))}
                    </div>
                    {sheetTiles.length === 0 && (
                        <div className="text-xs text-zinc-500 italic py-2 text-center">
                            No tiles in this tileset
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
