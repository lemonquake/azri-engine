/**
 * LayersPanel - Layer management panel
 */
import { clsx } from 'clsx';
import {
    Layers, Eye, EyeOff, Lock, Unlock, Plus, Trash2,
    ChevronUp, ChevronDown, Copy, Merge
} from 'lucide-react';
import { useDrawingStore } from './stores/drawingStore';

interface LayersPanelProps {
    className?: string;
}

export function LayersPanel({ className }: LayersPanelProps) {
    const {
        layers,
        activeLayerId,
        addLayer,
        removeLayer,
        setActiveLayer,
        toggleLayerVisibility,
        setLayerOpacity,
        reorderLayers,
        mergeDown,
    } = useDrawingStore();

    const handleMoveUp = (index: number) => {
        if (index < layers.length - 1) {
            reorderLayers(index, index + 1);
        }
    };

    const handleMoveDown = (index: number) => {
        if (index > 0) {
            reorderLayers(index, index - 1);
        }
    };

    return (
        <div className={clsx("flex flex-col bg-zinc-800 rounded-lg overflow-hidden", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-700/50 border-b border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <Layers size={14} />
                    Layers
                </h3>
                <button
                    onClick={() => addLayer()}
                    title="Add Layer"
                    className="p-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Layer List */}
            <div className="flex-1 overflow-y-auto">
                {[...layers].reverse().map((layer, _reverseIndex) => {

                    const isActive = layer.id === activeLayerId;

                    return (
                        <div
                            key={layer.id}
                            onClick={() => setActiveLayer(layer.id)}
                            className={clsx(
                                "flex items-center gap-2 px-2 py-1.5 border-b border-zinc-700/50 cursor-pointer",
                                "hover:bg-zinc-700/30 transition-colors",
                                isActive && "bg-indigo-600/20 border-l-2 border-l-indigo-500"
                            )}
                        >
                            {/* Visibility */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLayerVisibility(layer.id);
                                }}
                                className={clsx(
                                    "p-1 rounded",
                                    layer.visible ? "text-zinc-300" : "text-zinc-600"
                                )}
                            >
                                {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>

                            {/* Lock */}
                            <button
                                onClick={(e) => e.stopPropagation()}
                                className={clsx(
                                    "p-1 rounded",
                                    layer.locked ? "text-yellow-400" : "text-zinc-600"
                                )}
                            >
                                {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>

                            {/* Layer preview */}
                            <div className="w-8 h-8 bg-zinc-900 rounded border border-zinc-600 flex items-center justify-center">
                                {layer.imageData ? (
                                    <div className="w-6 h-6 bg-zinc-700" />
                                ) : (
                                    <span className="text-[8px] text-zinc-600">Empty</span>
                                )}
                            </div>

                            {/* Layer name */}
                            <span className={clsx(
                                "flex-1 text-xs truncate",
                                isActive ? "text-indigo-300" : "text-zinc-400"
                            )}>
                                {layer.name}
                            </span>

                            {/* Opacity */}
                            <span className="text-[10px] font-mono text-zinc-500">
                                {layer.opacity}%
                            </span>
                        </div>
                    );
                })}

                {layers.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">
                        No layers
                    </div>
                )}
            </div>

            {/* Active layer controls */}
            {activeLayerId && (
                <div className="border-t border-zinc-700 p-2 space-y-2 bg-zinc-800/50">
                    {/* Opacity slider */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 w-12">Opacity</span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={layers.find(l => l.id === activeLayerId)?.opacity || 100}
                            onChange={(e) => setLayerOpacity(activeLayerId, parseInt(e.target.value))}
                            className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">
                            {layers.find(l => l.id === activeLayerId)?.opacity}%
                        </span>
                    </div>

                    {/* Layer actions */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleMoveUp(layers.findIndex(l => l.id === activeLayerId))}
                            title="Move Up"
                            className="p-1 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white"
                        >
                            <ChevronUp size={12} />
                        </button>
                        <button
                            onClick={() => handleMoveDown(layers.findIndex(l => l.id === activeLayerId))}
                            title="Move Down"
                            className="p-1 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white"
                        >
                            <ChevronDown size={12} />
                        </button>
                        <button
                            onClick={() => addLayer()}
                            title="Duplicate Layer"
                            className="p-1 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white"
                        >
                            <Copy size={12} />
                        </button>
                        <button
                            onClick={() => mergeDown(activeLayerId)}
                            title="Merge Down"
                            className="p-1 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white"
                        >
                            <Merge size={12} />
                        </button>
                        <div className="flex-1" />
                        <button
                            onClick={() => removeLayer(activeLayerId)}
                            disabled={layers.length <= 1}
                            title="Delete Layer"
                            className={clsx(
                                "p-1 rounded",
                                layers.length <= 1
                                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                    : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                            )}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
