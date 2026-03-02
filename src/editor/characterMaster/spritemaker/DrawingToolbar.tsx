/**
 * DrawingToolbar - Vibrant, modern tool palette
 */
import { useRef } from 'react';
import { clsx } from 'clsx';
import {
    Pencil, PaintBucket, Eraser, Pipette, Move,
    Sun, Moon, Split, ArrowLeftRight, Grid2X2, Sparkles,
    Upload, Wand2, Brush, Square, Circle, Minus, Lasso,
    Trash2
} from 'lucide-react';
import { useDrawingStore, type DrawingTool } from './stores/drawingStore';

interface ToolConfig {
    id: DrawingTool;
    icon: React.ElementType;
    label: string;
    shortcut: string;
}

const TOOLS: ToolConfig[] = [
    { id: 'pencil', icon: Pencil, label: 'Pencil', shortcut: 'P' },
    { id: 'brush', icon: Brush, label: 'Brush', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
    { id: 'fill', icon: PaintBucket, label: 'Fill Bucket', shortcut: 'G' },
    { id: 'color-replace', icon: ArrowLeftRight, label: 'Color Replace', shortcut: 'Shift+G' },
    { id: 'eyedropper', icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
    { id: 'select-rect', icon: Square, label: 'Marquee Select', shortcut: 'M' },
    { id: 'select-lasso', icon: Lasso, label: 'Lasso Select', shortcut: 'L' },
    { id: 'move', icon: Move, label: 'Move', shortcut: 'V' },
    { id: 'line', icon: Minus, label: 'Line', shortcut: 'U' },
    { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'R' },
    { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'O' },
    { id: 'lighten', icon: Sun, label: 'Lighten', shortcut: 'D' },
    { id: 'darken', icon: Moon, label: 'Darken', shortcut: 'F' },
];

interface DrawingToolbarProps {
    className?: string;
}

export function DrawingToolbar({ className }: DrawingToolbarProps) {
    const {
        currentTool,
        setTool,
        foregroundColor,
        backgroundColor,
        swapColors,
        brushSettings,
        setBrushSettings,
        clearCanvas,

        symmetry,
        setSymmetry,
        tiledPreview,
        toggleTiledPreview,

        applyOutline,
        removeBackground,
        updateLayerImageData,
        activeLayerId,
        canvasWidth,
        canvasHeight,
    } = useDrawingStore();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.imageSmoothingEnabled = false;

                // Center and float-fit
                const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
                const w = Math.floor(img.width * scale);
                const h = Math.floor(img.height * scale);
                const x = Math.floor((canvasWidth - w) / 2);
                const y = Math.floor((canvasHeight - h) / 2);

                ctx.drawImage(img, x, y, w, h);

                const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
                if (activeLayerId) {
                    updateLayerImageData(activeLayerId, imageData);
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const fgColorStr = `rgb(${foregroundColor.r}, ${foregroundColor.g}, ${foregroundColor.b})`;
    const bgColorStr = `rgb(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b})`;

    return (
        <div className={clsx("flex flex-col gap-3 p-3 bg-zinc-900 border-r border-white/5 h-full w-24 items-center", className)}>

            {/* Top Section: Brush Size & Colors */}
            <div className="flex flex-col gap-4 w-full shrink-0">
                {/* Brush Size Slider (Pinned Top) */}
                <div className="group relative flex flex-col items-center w-full bg-zinc-800/50 p-2 rounded-xl border border-white/5">
                    <div className="flex justify-between w-full mb-1">
                        <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Size</span>
                        <span className="text-[10px] text-indigo-400 font-mono">{brushSettings.size}px</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="32"
                        step="1"
                        list="brush-sizes"
                        value={brushSettings.size}
                        onChange={(e) => setBrushSettings({ size: parseInt(e.target.value) })}
                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                        title="Brush Size"
                    />
                    <datalist id="brush-sizes">
                        <option value="1"></option>
                        <option value="2"></option>
                        <option value="4"></option>
                        <option value="8"></option>
                        <option value="16"></option>
                        <option value="32"></option>
                    </datalist>
                </div>

                {/* Color Picker */}
                <div className="relative w-16 h-16 shrink-0 group cursor-pointer mx-auto" title="Colors (Click to Swap)">
                    <div
                        className="absolute bottom-0 right-0 w-10 h-10 rounded-xl border-2 border-zinc-600 shadow-sm transition-transform group-hover:scale-110"
                        style={{ backgroundColor: bgColorStr }}
                    />
                    <div
                        className="absolute top-0 left-0 w-10 h-10 rounded-xl border-2 border-white shadow-xl z-10 transition-transform group-hover:scale-110"
                        style={{ backgroundColor: fgColorStr }}
                    />
                    <button
                        onClick={swapColors}
                        className="absolute -bottom-1 -left-1 w-6 h-6 bg-zinc-700/90 backdrop-blur rounded-full text-zinc-300 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 shadow-lg"
                    >
                        ↔
                    </button>
                </div>
            </div>

            <div className="h-px w-full bg-white/10 shrink-0" />

            {/* Middle Section: Tools (Scrollable if needed) */}
            <div className="flex-1 w-full overflow-y-auto min-h-0 scrollbar-hide">
                <div className="grid grid-cols-2 gap-2 w-full">
                    {TOOLS.map((tool) => {
                        const Icon = tool.icon;
                        const isActive = currentTool === tool.id;

                        return (
                            <button
                                key={tool.id}
                                onClick={() => setTool(tool.id)}
                                title={`${tool.label} (${tool.shortcut})`}
                                className={clsx(
                                    "group relative p-2 rounded-xl transition-all duration-200 flex items-center justify-center aspect-square",
                                    isActive
                                        ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20 scale-105 z-10"
                                        : "hover:bg-white/10 text-zinc-400 hover:text-white bg-zinc-800/30"
                                )}
                            >
                                <Icon size={18} className={clsx(isActive && "animate-pulse-subtle")} />

                                {/* Hover Label - Adjusted for 2 cols */}
                                <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10 z-50 shadow-xl translate-x-1 group-hover:translate-x-0 transition-all font-medium">
                                    {tool.label} <span className="text-zinc-500 ml-1 font-mono text-[10px]">{tool.shortcut}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="h-px w-full bg-white/10 shrink-0" />

            {/* Bottom Section: Actions */}
            <div className="flex flex-col gap-2 w-full shrink-0">
                <div className="grid grid-cols-2 gap-2">
                    {/* Symmetry Toggle */}
                    <button
                        onClick={() => setSymmetry({ enabled: !symmetry.enabled })}
                        title={`Symmetry: ${symmetry.enabled ? 'ON' : 'OFF'}`}
                        className={clsx(
                            "p-2 rounded-lg transition-colors flex items-center justify-center aspect-square",
                            symmetry.enabled ? "bg-teal-500/20 text-teal-400 border border-teal-500/30" : "hover:bg-white/5 text-zinc-500 bg-zinc-800/30"
                        )}
                    >
                        <Split size={16} />
                    </button>

                    {/* Tiling */}
                    <button
                        onClick={toggleTiledPreview}
                        title="Tiled Preview"
                        className={clsx(
                            "p-2 rounded-lg transition-colors flex items-center justify-center aspect-square",
                            tiledPreview ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "hover:bg-white/5 text-zinc-500 bg-zinc-800/30"
                        )}
                    >
                        <Grid2X2 size={16} />
                    </button>

                    {/* Auto Outline */}
                    <button
                        onClick={applyOutline}
                        title="Auto Outline"
                        className="p-2 rounded-lg transition-colors hover:bg-yellow-500/20 text-zinc-500 hover:text-yellow-400 flex items-center justify-center aspect-square bg-zinc-800/30"
                    >
                        <Sparkles size={16} />
                    </button>

                    {/* Magic Remove BG */}
                    <button
                        onClick={removeBackground}
                        title="Magic Remove BG"
                        className="p-2 rounded-lg transition-colors hover:bg-pink-500/20 text-zinc-500 hover:text-pink-400 flex items-center justify-center aspect-square bg-zinc-800/30"
                    >
                        <Wand2 size={16} />
                    </button>
                </div>

                {/* Import hidden input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImport}
                />

                <div className="flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Import Image"
                        className="flex-1 p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors bg-zinc-800/30 flex items-center justify-center"
                    >
                        <Upload size={16} />
                    </button>

                    {/* Clear Canvas */}
                    <button
                        onClick={clearCanvas}
                        title="Clear Canvas"
                        className="flex-1 p-2 rounded-lg transition-colors hover:bg-red-500/20 text-zinc-500 hover:text-red-400 flex items-center justify-center bg-zinc-800/30"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>

            </div>
        </div>
    );
}
