import React, { useState, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { Plus, Trash2, Eye, EyeOff, Image as ImageIcon, Palette, Move, Activity, Upload, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';


interface SliderInputProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (value: number) => void;
}

function SliderInput({ label, value, min, max, step, unit = '', onChange }: SliderInputProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">{label}</span>
                <span className="text-xs text-zinc-300 font-mono">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>
    );
}

export function SkyboxPanel() {
    const {
        skyboxLayers,
        addSkyboxLayer,
        removeSkyboxLayer,
        updateSkyboxLayer,
        reorderSkyboxLayers
    } = useEditorStore();

    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedLayerId) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const src = event.target?.result as string;
            updateSkyboxLayer(selectedLayerId, { value: src });
        };
        reader.readAsDataURL(file);
    };

    const handleAdd = (type: 'color' | 'image') => {
        addSkyboxLayer(type);
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image customization if needed
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault(); // Necessary to allow dropping
        if (draggedIndex === null || draggedIndex === index) return;

        // Optional: Real-time reordering visual feedback could be implemented here
        // For now, we'll just show the drop effect
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedIndex !== null && draggedIndex !== targetIndex) {
            reorderSkyboxLayers(draggedIndex, targetIndex);
        }
        setDraggedIndex(null);
    };

    const selectedLayer = skyboxLayers.find(l => l.id === selectedLayerId);

    return (
        <div className="flex flex-col h-full bg-slate-900 border-t border-slate-700 select-none overflow-hidden">
            {/* Header / Add Buttons */}
            <div className="p-2 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Skybox Layers</h3>
                <div className="flex gap-1">
                    <button
                        onClick={() => handleAdd('color')}
                        className="p-1 px-2 bg-zinc-700 hover:bg-zinc-600 rounded text-[10px] text-white flex items-center gap-1"
                        title="Add Color Layer"
                    >
                        <Plus size={10} />
                        <Palette size={10} />
                    </button>
                    <button
                        onClick={() => handleAdd('image')}
                        className="p-1 px-2 bg-indigo-600 hover:bg-indigo-500 rounded text-[10px] text-white flex items-center gap-1"
                        title="Add Image Layer"
                    >
                        <Plus size={10} />
                        <ImageIcon size={10} />
                    </button>
                </div>
            </div>

            {/* List and Details Split */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Layer List */}
                <div className="flex-1 overflow-y-auto min-h-[150px] border-b border-slate-700">
                    {skyboxLayers.map((layer, index) => {
                        const isSelected = layer.id === selectedLayerId;
                        const isDragging = draggedIndex === index;

                        return (
                            <div
                                key={layer.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                className={clsx(
                                    "flex items-center p-2 border-b border-slate-800 cursor-pointer group transition-colors",
                                    isSelected ? "bg-indigo-900/30 border-l-2 border-l-indigo-500" : "hover:bg-slate-800 border-l-2 border-l-transparent",
                                    isDragging && "opacity-50"
                                )}
                                onClick={() => setSelectedLayerId(layer.id)}
                            >
                                {/* Drag Handle */}
                                <div className="mr-2 cursor-grab text-zinc-600 hover:text-zinc-400">
                                    <GripVertical size={12} />
                                </div>

                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    {layer.type === 'color' ? <Palette size={12} className="text-zinc-500" /> : <ImageIcon size={12} className="text-zinc-500" />}
                                    <div className={clsx("text-sm", isSelected ? "text-white font-medium" : "text-slate-400")}>
                                        {layer.name}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 ml-2 opacity-100" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={() => updateSkyboxLayer(layer.id, { visible: !layer.visible })}
                                        className={clsx(
                                            "p-1 rounded hover:bg-slate-700 transition-colors",
                                            layer.visible ? "text-slate-400 hover:text-white" : "text-slate-600"
                                        )}
                                        title={layer.visible ? "Hide Layer" : "Show Layer"}
                                    >
                                        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (confirm('Delete skybox layer?')) {
                                                removeSkyboxLayer(layer.id);
                                                if (selectedLayerId === layer.id) setSelectedLayerId(null);
                                            }
                                        }}
                                        className="ml-1 p-1 rounded hover:bg-red-900/50 text-slate-600 hover:text-red-400 transition-colors"
                                        title="Delete Layer"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {skyboxLayers.length === 0 && (
                        <div className="p-4 text-center text-xs text-zinc-500 italic">
                            No skybox layers. Add one to start.
                        </div>
                    )}
                </div>

                {/* Layer Details (if selected) */}
                {selectedLayer && (
                    <div className="flex-1 min-h-[200px] bg-zinc-900 overflow-y-auto p-4 custom-scrollbar">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Layer Properties</div>

                        {/* Name */}
                        <div className="mb-3">
                            <span className="text-xs text-zinc-400 block mb-1">Name</span>
                            <input
                                type="text"
                                value={selectedLayer.name}
                                onChange={(e) => updateSkyboxLayer(selectedLayer.id, { name: e.target.value })}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        {/* Value (Color or Image URL) */}
                        <div className="mb-3">
                            <span className="text-xs text-zinc-400 block mb-1">{selectedLayer.type === 'color' ? 'Color' : 'Image URL'}</span>
                            {selectedLayer.type === 'color' ? (
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={selectedLayer.value}
                                        onChange={(e) => updateSkyboxLayer(selectedLayer.id, { value: e.target.value })}
                                        className="h-8 w-12 bg-transparent cursor-pointer rounded"
                                    />
                                    <input
                                        type="text"
                                        value={selectedLayer.value}
                                        onChange={(e) => updateSkyboxLayer(selectedLayer.id, { value: e.target.value })}
                                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 font-mono"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="text"
                                        value={selectedLayer.value}
                                        onChange={(e) => updateSkyboxLayer(selectedLayer.id, { value: e.target.value })}
                                        placeholder="https://example.com/sky.png"
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 font-mono focus:outline-none focus:border-indigo-500"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-white transition-colors"
                                    >
                                        <Upload size={12} />
                                        Upload Image
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileUpload}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Display Mode (Image Only) */}
                        {selectedLayer.type === 'image' && (
                            <div className="mb-3">
                                <span className="text-xs text-zinc-400 block mb-1">Display Mode</span>
                                <select
                                    value={selectedLayer.repeat}
                                    onChange={(e) => updateSkyboxLayer(selectedLayer.id, { repeat: e.target.value as any })}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
                                >
                                    <option value="clamp">Clamp (No Repeat)</option>
                                    <option value="repeat">Repeat Both</option>
                                    <option value="repeat-x">Repeat X</option>
                                    <option value="repeat-y">Repeat Y</option>
                                    <option value="stretch">Stretch to Fill (Static)</option>
                                    <option value="stretch-x">Stretch Width (Repeat Vertical)</option>
                                    <option value="stretch-y">Stretch Height (Repeat Horizontal)</option>
                                </select>
                            </div>
                        )}

                        {/* Opacity */}
                        <div className="mb-4">
                            <SliderInput
                                label="Opacity"
                                value={selectedLayer.opacity}
                                min={0}
                                max={1}
                                step={0.05}
                                onChange={(v) => updateSkyboxLayer(selectedLayer.id, { opacity: v })}
                            />
                        </div>

                        {/* Parallax */}
                        <div className="mb-4 pt-2 border-t border-zinc-800">
                            <div className="flex items-center gap-2 mb-2">
                                <Move size={12} className="text-zinc-500" />
                                <span className="text-[10px] text-zinc-500 uppercase">Parallax Factor</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <SliderInput label="X" value={selectedLayer.parallax.x} min={0} max={1.5} step={0.05} onChange={(v) => updateSkyboxLayer(selectedLayer.id, { parallax: { ...selectedLayer.parallax, x: v } })} />
                                <SliderInput label="Y" value={selectedLayer.parallax.y} min={0} max={1.5} step={0.05} onChange={(v) => updateSkyboxLayer(selectedLayer.id, { parallax: { ...selectedLayer.parallax, y: v } })} />
                            </div>
                            <div className="text-[9px] text-zinc-600">0 = Static (UI), 1 = Normal (Follow Camera).</div>
                        </div>

                        {/* Velocity */}
                        <div className="mb-4 pt-2 border-t border-zinc-800">
                            <div className="flex items-center gap-2 mb-2">
                                <Activity size={12} className="text-zinc-500" />
                                <span className="text-[10px] text-zinc-500 uppercase">Auto-Scroll Velocity</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <SliderInput label="X" value={selectedLayer.velocity.x} min={-200} max={200} step={5} unit="px/s" onChange={(v) => updateSkyboxLayer(selectedLayer.id, { velocity: { ...selectedLayer.velocity, x: v } })} />
                                <SliderInput label="Y" value={selectedLayer.velocity.y} min={-200} max={200} step={5} unit="px/s" onChange={(v) => updateSkyboxLayer(selectedLayer.id, { velocity: { ...selectedLayer.velocity, y: v } })} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
