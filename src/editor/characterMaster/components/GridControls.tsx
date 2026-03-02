/**
 * GridControls - Component for controlling grid display settings
 */
import { clsx } from 'clsx';
import { Grid3X3, Eye, EyeOff, Tag, Crosshair, Palette } from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import type { GridSettings } from '../types';
import { Tooltip } from './Tooltip';

// Preset colors for quick selection
const GRID_COLORS = [
    { color: '#00ffff', name: 'Cyan' },
    { color: '#ff00ff', name: 'Magenta' },
    { color: '#ffff00', name: 'Yellow' },
    { color: '#00ff00', name: 'Green' },
    { color: '#ff8800', name: 'Orange' },
    { color: '#ffffff', name: 'White' },
    { color: '#ff4444', name: 'Red' },
    { color: '#44aaff', name: 'Blue' },
];

interface GridControlsProps {
    className?: string;
}

export function GridControls({ className }: GridControlsProps) {
    const { getActiveSpriteSheet, updateSpriteSheet } = useCharacterMasterStore();

    const sheet = getActiveSpriteSheet();
    const gridSettings = sheet?.gridSettings;

    if (!sheet || !gridSettings) {
        return (
            <div className={clsx("p-4 text-center", className)}>
                <Grid3X3 size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500 italic">No sprite sheet loaded</p>
            </div>
        );
    }

    const updateGridSetting = <K extends keyof GridSettings>(key: K, value: GridSettings[K]) => {
        updateSpriteSheet(sheet.id, {
            gridSettings: {
                ...gridSettings,
                [key]: value,
            },
        });
    };

    return (
        <div className={clsx("space-y-4", className)}>
            {/* Header with visibility toggle */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
                    <Grid3X3 size={14} className="text-zinc-500" />
                    Grid Display
                </h3>
                <Tooltip content={gridSettings.visible ? "Hide Grid" : "Show Grid"}>
                    <button
                        onClick={() => updateGridSetting('visible', !gridSettings.visible)}
                        className={clsx(
                            "p-1.5 rounded transition-colors",
                            gridSettings.visible
                                ? "bg-indigo-500/20 text-indigo-400"
                                : "bg-zinc-700/50 text-zinc-500"
                        )}
                    >
                        {gridSettings.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                </Tooltip>
            </div>

            {/* Grid color */}
            <div className="space-y-2">
                <label className="text-xs text-zinc-400 flex items-center gap-2">
                    <Palette size={12} />
                    Grid Color
                </label>
                <div className="flex flex-wrap gap-1">
                    {GRID_COLORS.map((c) => (
                        <Tooltip key={c.color} content={c.name}>
                            <button
                                onClick={() => updateGridSetting('color', c.color)}
                                className={clsx(
                                    "w-6 h-6 rounded border-2 transition-transform hover:scale-110",
                                    gridSettings.color === c.color
                                        ? "border-white scale-110"
                                        : "border-zinc-600"
                                )}
                                style={{ backgroundColor: c.color }}
                            />
                        </Tooltip>
                    ))}
                </div>
            </div>

            {/* Opacity slider */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400">Opacity</label>
                    <span className="text-xs font-mono text-zinc-500">{Math.round(gridSettings.opacity * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={gridSettings.opacity}
                    onChange={(e) => updateGridSetting('opacity', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
            </div>

            {/* Line width */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400">Line Width</label>
                    <span className="text-xs font-mono text-zinc-500">{gridSettings.lineWidth}px</span>
                </div>
                <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.5"
                    value={gridSettings.lineWidth}
                    onChange={(e) => updateGridSetting('lineWidth', parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
            </div>

            {/* Line style */}
            <div className="space-y-2">
                <label className="text-xs text-zinc-400">Line Style</label>
                <div className="grid grid-cols-3 gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                        <button
                            key={style}
                            onClick={() => updateGridSetting('style', style)}
                            className={clsx(
                                "px-2 py-1.5 rounded text-xs font-medium capitalize",
                                "border transition-colors",
                                gridSettings.style === style
                                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                                    : "border-zinc-700 hover:border-zinc-600 text-zinc-400"
                            )}
                        >
                            {style}
                        </button>
                    ))}
                </div>
            </div>

            {/* Toggle options */}
            <div className="space-y-2">
                <label className="text-xs text-zinc-400">Options</label>
                <div className="flex flex-col gap-1">
                    <button
                        onClick={() => updateGridSetting('showLabels', !gridSettings.showLabels)}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-left",
                            "border transition-colors text-sm",
                            gridSettings.showLabels
                                ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                                : "border-zinc-700 hover:border-zinc-600 text-zinc-400"
                        )}
                    >
                        <Tag size={14} />
                        <span>Show Frame Numbers</span>
                    </button>
                    <button
                        onClick={() => updateGridSetting('guideLines', !gridSettings.guideLines)}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-left",
                            "border transition-colors text-sm",
                            gridSettings.guideLines
                                ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                                : "border-zinc-700 hover:border-zinc-600 text-zinc-400"
                        )}
                    >
                        <Crosshair size={14} />
                        <span>Show Guide Lines</span>
                    </button>
                </div>
            </div>

            {/* Current settings preview */}
            <div
                className="h-12 rounded-lg border-2 flex items-center justify-center"
                style={{
                    borderColor: gridSettings.color,
                    borderStyle: gridSettings.style,
                    borderWidth: gridSettings.lineWidth,
                    opacity: gridSettings.opacity,
                }}
            >
                <span
                    className="text-xs font-mono"
                    style={{ color: gridSettings.color }}
                >
                    Preview
                </span>
            </div>
        </div>
    );
}
