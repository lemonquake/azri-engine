import { useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { Eye, EyeOff, Lock, Unlock, Trash2, ArrowUp, ArrowDown, Plus, MoreVertical, Copy, ArrowDownToLine, Maximize } from 'lucide-react';
import { clsx } from 'clsx';

export function LayersPanel() {
    const {
        layers,
        activeLayerId,
        selectedLayerIds,
        addLayer,
        removeLayer,
        setActiveLayer,
        toggleLayerSelection,
        selectLayerRange,
        toggleLayerVisibility,
        toggleLayerLock,
        reorderLayers,
        highlightActiveLayer,
        toggleHighlightActiveLayer,
        duplicateLayer,
        mergeLayerDown,
        setLayerOpacity,
        selectAllOnLayer
    } = useEditorStore();

    const [newLayerName, setNewLayerName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, layerId: string } | null>(null);

    const handleAdd = () => {
        if (newLayerName.trim()) {
            addLayer(newLayerName.trim());
            setNewLayerName('');
            setIsAdding(false);
        }
    };

    const handleMoveUp = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (index < layers.length - 1) {
            reorderLayers(index, index + 1);
        }
    };

    const handleMoveDown = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (index > 0) {
            reorderLayers(index, index - 1);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, layerId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, layerId });
    };

    const closeContextMenu = () => setContextMenu(null);

    // Reversed for display (Top layer first)
    const reversedLayers = [...layers].reverse();

    return (
        <div className="flex flex-col h-full bg-slate-900 border-t border-slate-700 select-none" onClick={closeContextMenu}>
            <div className="p-2 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Layers</h3>
                <div className="flex gap-1">
                    <button
                        onClick={toggleHighlightActiveLayer}
                        className={clsx(
                            "p-1 px-2 rounded text-[10px] flex items-center gap-1 transition-colors",
                            highlightActiveLayer ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-400 hover:text-white"
                        )}
                        title="Highlight Active Layer (Dim others)"
                    >
                        <Eye size={10} />
                        {highlightActiveLayer ? "ON" : "OFF"}
                    </button>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="p-1 px-2 bg-indigo-600 hover:bg-indigo-500 rounded text-[10px] text-white flex items-center gap-1"
                    >
                        <Plus size={10} />
                        NEW
                    </button>
                </div>
            </div>

            {isAdding && (
                <div className="p-2 bg-slate-800 border-b border-slate-700">
                    <input
                        type="text"
                        value={newLayerName}
                        onChange={(e) => setNewLayerName(e.target.value)}
                        placeholder="Layer Name"
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white mb-2"
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsAdding(false)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                        <button onClick={handleAdd} className="text-xs bg-indigo-600 px-2 py-1 rounded text-white">Create</button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {reversedLayers.map((layer, reverseIndex) => {
                    const realIndex = layers.length - 1 - reverseIndex;
                    const isActive = layer.id === activeLayerId;
                    const isSelected = selectedLayerIds.has(layer.id);

                    return (
                        <div
                            key={layer.id}
                            className={clsx(
                                "flex flex-col border-b border-slate-800 cursor-pointer group transition-colors",
                                isSelected ? "bg-indigo-900/30" : "hover:bg-slate-800",
                                isActive ? "border-l-2 border-l-indigo-500" : "border-l-2 border-l-transparent"
                            )}
                            onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                    toggleLayerSelection(layer.id);
                                } else if (e.shiftKey) {
                                    selectLayerRange(activeLayerId, layer.id);
                                } else {
                                    setActiveLayer(layer.id);
                                }
                            }}
                            onContextMenu={(e) => handleContextMenu(e, layer.id)}
                        >
                            <div className="flex items-center p-2">
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <div className={clsx("text-sm truncate", isActive ? "text-white font-medium" : "text-slate-400")}>
                                        {layer.name}
                                    </div>
                                    {isActive && (
                                        <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] text-slate-500">Opacity</span>
                                            <input
                                                type="range"
                                                min="0" max="1" step="0.1"
                                                value={layer.opacity ?? 1}
                                                onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))}
                                                className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-[10px] text-slate-400">{Math.round((layer.opacity ?? 1) * 100)}%</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 ml-2 opacity-100" onClick={(e) => e.stopPropagation()}>
                                    {/* Visibility */}
                                    <button
                                        onClick={() => toggleLayerVisibility(layer.id)}
                                        className={clsx(
                                            "p-1 rounded hover:bg-slate-700 transition-colors",
                                            layer.visible ? "text-slate-400 hover:text-white" : "text-slate-600"
                                        )}
                                        title={layer.visible ? "Hide" : "Show"}
                                    >
                                        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                    </button>

                                    {/* Lock */}
                                    <button
                                        onClick={() => toggleLayerLock(layer.id)}
                                        className={clsx(
                                            "p-1 rounded hover:bg-slate-700 transition-colors",
                                            layer.locked ? "text-amber-500" : "text-slate-600 hover:text-slate-400"
                                        )}
                                        title={layer.locked ? "Unlock" : "Lock"}
                                    >
                                        {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                    </button>

                                    {/* Move Buttons */}
                                    <div className="flex flex-col">
                                        <button
                                            onClick={(e) => handleMoveUp(realIndex, e)}
                                            disabled={realIndex >= layers.length - 1}
                                            className="text-slate-500 hover:text-white disabled:opacity-10 mb-0.5"
                                        >
                                            <ArrowUp size={8} />
                                        </button>
                                        <button
                                            onClick={(e) => handleMoveDown(realIndex, e)}
                                            disabled={realIndex <= 0}
                                            className="text-slate-500 hover:text-white disabled:opacity-10"
                                        >
                                            <ArrowDown size={8} />
                                        </button>
                                    </div>

                                    {/* Context Menu Trigger */}
                                    <button
                                        onClick={(e) => handleContextMenu(e, layer.id)}
                                        className="ml-1 p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white"
                                    >
                                        <MoreVertical size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {contextMenu && (
                <LayerContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    layerId={contextMenu.layerId}
                    onClose={closeContextMenu}
                    layers={layers}
                    actions={{
                        duplicateLayer,
                        mergeLayerDown,
                        removeLayer,
                        selectAllOnLayer
                    }}
                />
            )}
        </div>
    );
}

function LayerContextMenu({ x, y, layerId, onClose, layers, actions }: any) {
    // Simple click outside handler is handled by parent div onClick, but we need to stop propagation on the menu itself

    const layerIndex = layers.findIndex((l: any) => l.id === layerId);
    const isBottom = layerIndex === 0;
    const isOnly = layers.length === 1;

    // Adjust position to stay on screen
    const MENU_WIDTH = 200; // w-48 is 12rem (~192px) + padding/border
    const MENU_HEIGHT = 160; // Approximate height

    let styleLeft = x;
    let styleTop = y;

    // Check if window is available (client-side)
    if (typeof window !== 'undefined') {
        if (x + MENU_WIDTH > window.innerWidth) {
            styleLeft = x - MENU_WIDTH;
        }
        if (y + MENU_HEIGHT > window.innerHeight) {
            styleTop = y - MENU_HEIGHT;
        }
    }

    return (
        <div
            className="fixed z-50 bg-slate-800 border border-slate-600 rounded shadow-xl py-1 w-48 text-sm text-slate-200 flex flex-col"
            style={{ top: styleTop, left: styleLeft }}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={onClose}
        >
            <button
                className="text-left px-3 py-2 hover:bg-slate-700 flex items-center gap-2"
                onClick={() => { actions.selectAllOnLayer(layerId); onClose(); }}
            >
                <Maximize size={14} /> Select All Content
            </button>
            <div className="h-px bg-slate-700 my-1" />
            <button
                className="text-left px-3 py-2 hover:bg-slate-700 flex items-center gap-2"
                onClick={() => { actions.duplicateLayer(layerId); onClose(); }}
            >
                <Copy size={14} /> Duplicate Layer
            </button>
            <button
                className={clsx("text-left px-3 py-2 flex items-center gap-2", isBottom ? "text-slate-600 cursor-not-allowed" : "hover:bg-slate-700")}
                onClick={() => { if (!isBottom) { actions.mergeLayerDown(layerId); onClose(); } }}
                disabled={isBottom}
            >
                <ArrowDownToLine size={14} /> Merge Down
            </button>
            <div className="h-px bg-slate-700 my-1" />
            <button
                className={clsx("text-left px-3 py-2 flex items-center gap-2 text-red-400 hover:bg-slate-700", isOnly ? "text-slate-600 cursor-not-allowed" : "hover:text-red-300")}
                onClick={() => {
                    if (!isOnly && window.confirm('Delete layer?')) {
                        actions.removeLayer(layerId);
                        onClose();
                    }
                }}
                disabled={isOnly}
            >
                <Trash2 size={14} /> Delete Layer
            </button>
        </div>
    );
}
