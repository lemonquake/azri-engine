/**
 * FrameSelector - Controls for configuring sprite sheet frame dimensions
 */
import { useCallback } from 'react';
import { clsx } from 'clsx';
import { Grid3X3, ScanLine, Sparkles, RotateCcw, Info } from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import { detectBestConfig, suggestFrameSizes } from '../utils/spriteSheetDetector';
import { Tooltip, TooltipContent } from './Tooltip';
import { SpriteTypeSelector } from './SpriteTypeSelector';

interface NumberInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    tooltip?: string;
}

function NumberInput({ label, value, onChange, min = 1, max = 9999, step = 1, tooltip }: NumberInputProps) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-zinc-400">{label}</label>
                {tooltip && (
                    <Tooltip content={tooltip}>
                        <Info size={12} className="text-zinc-500 cursor-help" />
                    </Tooltip>
                )}
            </div>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
                min={min}
                max={max}
                step={step}
                className={clsx(
                    "w-full px-2 py-1.5 rounded-md text-sm",
                    "bg-zinc-700/50 border border-zinc-600",
                    "text-zinc-100 placeholder-zinc-500",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500",
                    "transition-colors"
                )}
            />
        </div>
    );
}

interface FrameSelectorProps {
    className?: string;
}

export function FrameSelector({ className }: FrameSelectorProps) {
    const {
        getActiveSpriteSheet,
        updateSpriteSheet,
        loadedImage,
        applyDetectionResult,
        lastDetectionResult,
    } = useCharacterMasterStore();

    const sheet = getActiveSpriteSheet();

    const handleAutoDetect = useCallback(async () => {
        if (!loadedImage) return;

        const result = await detectBestConfig(loadedImage);
        if (result) {
            applyDetectionResult(result);
        }
    }, [loadedImage, applyDetectionResult]);

    const handleUpdate = useCallback((field: string, value: number) => {
        if (!sheet) return;
        updateSpriteSheet(sheet.id, { [field]: value });
    }, [sheet, updateSpriteSheet]);

    const handleAutoColumns = useCallback(() => {
        if (!sheet || !loadedImage) return;
        const cols = Math.floor((loadedImage.width - sheet.offsetX) / (sheet.frameWidth + sheet.paddingX));
        updateSpriteSheet(sheet.id, { columns: Math.max(1, cols) });
    }, [sheet, loadedImage, updateSpriteSheet]);

    const handleAutoRows = useCallback(() => {
        if (!sheet || !loadedImage) return;
        const rows = Math.floor((loadedImage.height - sheet.offsetY) / (sheet.frameHeight + sheet.paddingY));
        updateSpriteSheet(sheet.id, { rows: Math.max(1, rows) });
    }, [sheet, loadedImage, updateSpriteSheet]);

    const suggestions = loadedImage ? suggestFrameSizes(loadedImage.width, loadedImage.height).slice(0, 6) : [];

    if (!sheet) {
        return (
            <div className={clsx("p-4 text-center text-zinc-500", className)}>
                <Grid3X3 size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No sprite sheet loaded</p>
            </div>
        );
    }

    return (
        <div className={clsx("flex flex-col gap-4", className)}>
            {/* Sprite Type Selector */}
            <SpriteTypeSelector compact={false} />

            {/* Auto-detect button */}
            <Tooltip
                content={
                    <TooltipContent
                        icon={<Sparkles size={14} />}
                        title="Auto-Detect Frames"
                        description="Analyzes the sprite sheet to automatically detect frame boundaries and grid configuration."
                    />
                }
            >
                <button
                    onClick={handleAutoDetect}
                    disabled={!loadedImage}
                    className={clsx(
                        "flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg",
                        "bg-gradient-to-r from-indigo-600 to-purple-600",
                        "hover:from-indigo-500 hover:to-purple-500",
                        "disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500",
                        "text-white font-medium text-sm",
                        "transition-all duration-200 transform hover:scale-[1.02]",
                        "shadow-lg shadow-indigo-500/20"
                    )}
                >
                    <Sparkles size={16} />
                    Auto-Detect Frames
                </button>
            </Tooltip>

            {/* Detection result badge */}
            {lastDetectionResult && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/30 border border-emerald-700/50 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-emerald-300">
                        Detected: {lastDetectionResult.frameWidth}×{lastDetectionResult.frameHeight}px
                        ({lastDetectionResult.columns}×{lastDetectionResult.rows})
                    </span>
                    <span className="ml-auto text-xs text-emerald-400/60">
                        {Math.round(lastDetectionResult.confidence * 100)}% confidence
                    </span>
                </div>
            )}

            {/* Frame dimensions */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    <ScanLine size={14} />
                    Frame Size
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                        label="Width"
                        value={sheet.frameWidth}
                        onChange={(v) => handleUpdate('frameWidth', v)}
                        min={1}
                        tooltip="Width of each frame in pixels"
                    />
                    <NumberInput
                        label="Height"
                        value={sheet.frameHeight}
                        onChange={(v) => handleUpdate('frameHeight', v)}
                        min={1}
                        tooltip="Height of each frame in pixels"
                    />
                </div>

                {/* Quick size suggestions */}
                {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s, i) => (
                            <Tooltip key={i} content={`Set frame size to ${s.width}×${s.height}px`}>
                                <button
                                    onClick={() => {
                                        updateSpriteSheet(sheet.id, { frameWidth: s.width, frameHeight: s.height });
                                        handleAutoColumns();
                                        handleAutoRows();
                                    }}
                                    className={clsx(
                                        "px-2 py-1 text-xs rounded",
                                        "bg-zinc-700/50 hover:bg-zinc-600/50",
                                        "text-zinc-400 hover:text-zinc-200",
                                        "border border-zinc-600/50",
                                        "transition-colors"
                                    )}
                                >
                                    {s.width}×{s.height}
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                )}
            </div>

            {/* Grid configuration */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    <Grid3X3 size={14} />
                    Grid Layout
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <NumberInput
                            label="Columns"
                            value={sheet.columns}
                            onChange={(v) => handleUpdate('columns', v)}
                            min={1}
                            tooltip="Number of columns in the grid"
                        />
                        <button
                            onClick={handleAutoColumns}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Auto-calculate
                        </button>
                    </div>
                    <div className="space-y-1">
                        <NumberInput
                            label="Rows"
                            value={sheet.rows}
                            onChange={(v) => handleUpdate('rows', v)}
                            min={1}
                            tooltip="Number of rows in the grid"
                        />
                        <button
                            onClick={handleAutoRows}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Auto-calculate
                        </button>
                    </div>
                </div>
            </div>

            {/* Offset & padding */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                        Offset & Padding
                    </span>
                    <Tooltip content="Reset offsets and padding to zero">
                        <button
                            onClick={() => updateSpriteSheet(sheet.id, { offsetX: 0, offsetY: 0, paddingX: 0, paddingY: 0 })}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors"
                        >
                            <RotateCcw size={12} className="text-zinc-500" />
                        </button>
                    </Tooltip>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                        label="Offset X"
                        value={sheet.offsetX}
                        onChange={(v) => handleUpdate('offsetX', v)}
                        min={0}
                        tooltip="Horizontal offset from the left edge"
                    />
                    <NumberInput
                        label="Offset Y"
                        value={sheet.offsetY}
                        onChange={(v) => handleUpdate('offsetY', v)}
                        min={0}
                        tooltip="Vertical offset from the top edge"
                    />
                    <NumberInput
                        label="Padding X"
                        value={sheet.paddingX}
                        onChange={(v) => handleUpdate('paddingX', v)}
                        min={0}
                        tooltip="Horizontal gap between frames"
                    />
                    <NumberInput
                        label="Padding Y"
                        value={sheet.paddingY}
                        onChange={(v) => handleUpdate('paddingY', v)}
                        min={0}
                        tooltip="Vertical gap between frames"
                    />
                </div>
            </div>

            {/* Sheet info */}
            <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-zinc-500">Image Size:</div>
                    <div className="text-zinc-300">{loadedImage?.width || 0} × {loadedImage?.height || 0}px</div>
                    <div className="text-zinc-500">Total Frames:</div>
                    <div className="text-zinc-300">{sheet.columns * sheet.rows}</div>
                </div>
            </div>
        </div>
    );
}
