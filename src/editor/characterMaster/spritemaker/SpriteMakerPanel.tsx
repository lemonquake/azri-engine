/**
 * SpriteMakerPanel - Main panel integrating all sprite maker components
 */
import { useEffect, useState, useRef } from 'react';
import { clsx } from 'clsx';
import {
    Image as ImageIcon, Download, Grid3X3, FileImage, Upload, Undo2, Redo2
} from 'lucide-react';
import { DrawingToolbar } from './DrawingToolbar';
import { SpriteEditorCanvas } from './SpriteEditorCanvas';
import { FlashTimeline } from './FlashTimeline';
import { ColorPicker } from './ColorPicker';
import { LayersPanel } from './LayersPanel';
import { PreviewPanel } from './PreviewPanel';
import { useDrawingStore, type Layer } from './stores/drawingStore';
import { useTimelineStore } from './stores/timelineStore';
import { ExportDialog } from './ExportDialog';

interface SpriteMakerPanelProps {
    className?: string;
}

// Size presets
const SIZE_PRESETS = [
    { label: '16×16', width: 16, height: 16 },
    { label: '32×32', width: 32, height: 32 },
    { label: '48×48', width: 48, height: 48 },
    { label: '64×64', width: 64, height: 64 },
    { label: '128×128', width: 128, height: 128 },
    { label: '256×256', width: 256, height: 256 },
];

export function SpriteMakerPanel({ className }: SpriteMakerPanelProps) {
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [newWidth, setNewWidth] = useState(32);
    const [newHeight, setNewHeight] = useState(32);
    const [rightPanel, setRightPanel] = useState<'color' | 'layers' | 'preview'>('color');
    const [showExportDialog, setShowExportDialog] = useState(false);

    const {
        initializeCanvas, canvasWidth, canvasHeight, setLayers,
        undo, redo, showGrid, toggleGrid
    } = useDrawingStore();
    const { initializeTimeline, frames, currentFrameIndex } = useTimelineStore();

    // Sync frame data to drawing store when current frame changes
    useEffect(() => {
        const currentFrame = frames[currentFrameIndex];
        if (!currentFrame) return;

        // If frame has layers, use them
        if (currentFrame.layers && currentFrame.layers.length > 0) {
            const newLayers: Layer[] = currentFrame.layers.map(l => ({
                id: l.layerId,
                name: `Layer ${l.layerId.split('_').pop()}`,
                visible: l.visible,
                locked: false,
                opacity: 100,
                blendMode: 'normal',
                imageData: l.imageData
            }));
            setLayers(newLayers);
        } else if (currentFrame.imageData) {
            // Legacy/Flattened frame - create 1 layer
            const newLayer: Layer = {
                id: 'layer_base',
                name: 'Layer 1',
                visible: true,
                locked: false,
                opacity: 100,
                blendMode: 'normal',
                imageData: currentFrame.imageData
            };
            setLayers([newLayer]);
        } else {
            // Empty frame - create 1 blank layer
            // We need a unique ID for the new layer to avoid React key issues if we switch between empty frames
            // But we can't easily generate a unique ID here without a helper or randomness which might cause hydration mismatch if SSR (not an issue here)
            const newLayer: Layer = {
                id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                name: 'Layer 1',
                visible: true,
                locked: false,
                opacity: 100,
                blendMode: 'normal',
                imageData: null
            };
            setLayers([newLayer]);
        }
    }, [currentFrameIndex, frames, setLayers]);

    // Initialize on mount
    useEffect(() => {
        if (frames.length === 0) {
            initializeCanvas(32, 32);
            initializeTimeline(32, 32);
        }
    }, [frames.length, initializeCanvas, initializeTimeline]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new window.Image();
            img.onload = () => {
                // Use the user-selected dimensions from the dialog
                const targetWidth = newWidth;
                const targetHeight = newHeight;

                // Init canvas with SELECTED size
                initializeCanvas(targetWidth, targetHeight);
                initializeTimeline(targetWidth, targetHeight);

                // Draw image to get data, scaling it to fit
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.imageSmoothingEnabled = false; // Pixel art scaling? Or smooth for downsizing? 
                    // Usually for importing hi-res to pixel art, we might want smoothing to average colors, 
                    // or nearest neighbor if it's already pixel art. 
                    // Let's assume user wants to convert generic image to pixel art -> smoothing might be better for downsizing?
                    // But if it's a pixel art image being imported, we want nearest.
                    // Let's stick to default (smooth) for downsizing large images, 
                    // OR nearest if we want to preserve exact pixels of a small image.
                    // Actually, for "converting" a photo to pixel art, you want averaging (linear).
                    // For importing a sprite sheet, you want nearest.
                    // Let's default to false (nearest) as it's a sprite editor.
                    ctx.imageSmoothingEnabled = false;

                    // Fit logic (contain)
                    const scale = Math.min(targetWidth / img.width, targetHeight / img.height);
                    const w = Math.floor(img.width * scale);
                    const h = Math.floor(img.height * scale);
                    const x = Math.floor((targetWidth - w) / 2);
                    const y = Math.floor((targetHeight - h) / 2);

                    ctx.drawImage(img, x, y, w, h);

                    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

                    // Update active layer
                    const state = useDrawingStore.getState();
                    if (state.activeLayerId) {
                        state.updateLayerImageData(state.activeLayerId, imageData);
                    }
                }
                setShowNewDialog(false);
            };
            img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleNewSprite = () => {
        initializeCanvas(newWidth, newHeight);
        initializeTimeline(newWidth, newHeight);
        setShowNewDialog(false);
    };

    return (
        <div className={clsx("flex flex-col h-full bg-zinc-900", className)}>
            {/* Top bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-zinc-800">
                {/* New sprite */}
                <button
                    onClick={() => setShowNewDialog(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
                >
                    <ImageIcon size={14} />
                    New Sprite
                </button>

                <div className="w-px h-6 bg-zinc-600" />

                {/* Canvas size */}
                <div className="flex items-center gap-2 px-2 py-1 bg-zinc-700/50 rounded text-xs text-zinc-400">
                    <Grid3X3 size={12} />
                    <span className="font-mono text-zinc-300">{canvasWidth}×{canvasHeight}</span>
                </div>

                {/* Frame info */}
                <div className="flex items-center gap-2 px-2 py-1 bg-zinc-700/50 rounded text-xs text-zinc-400">
                    <FileImage size={12} />
                    <span>Frame</span>
                    <span className="font-mono text-zinc-300">{currentFrameIndex + 1}/{frames.length}</span>
                </div>

                <div className="w-px h-6 bg-zinc-600" />

                {/* Undo/Redo */}
                <div className="flex items-center gap-1">
                    <button onClick={undo} className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-700 transition-colors" title="Undo (Ctrl+Z)">
                        <Undo2 size={16} />
                    </button>
                    <button onClick={redo} className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-700 transition-colors" title="Redo (Ctrl+Y)">
                        <Redo2 size={16} />
                    </button>
                </div>

                <div className="w-px h-6 bg-zinc-600" />

                {/* Grid Toggle */}
                <button
                    onClick={toggleGrid}
                    className={clsx(
                        "p-1.5 rounded hover:bg-zinc-700 transition-colors",
                        showGrid ? "text-indigo-400 bg-indigo-500/10" : "text-zinc-400 hover:text-white"
                    )}
                    title="Toggle Grid"
                >
                    <Grid3X3 size={16} />
                </button>

                <div className="flex-1" />

                {/* Export */}
                <button
                    onClick={() => setShowExportDialog(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 text-sm border border-emerald-500/30 hover:bg-emerald-600/30"
                >
                    <Download size={14} />
                    Export
                </button>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Tools */}
                <DrawingToolbar className="shrink-0" />

                {/* Center: Canvas */}
                <div className="flex-1 flex flex-col min-w-0">
                    <SpriteEditorCanvas className="flex-1" />
                    <FlashTimeline className="h-36 shrink-0" />
                </div>

                {/* Right: Panels */}
                <div className="w-64 shrink-0 border-l border-zinc-700 flex flex-col">
                    {/* Panel tabs */}
                    <div className="flex border-b border-zinc-700">
                        <button
                            onClick={() => setRightPanel('color')}
                            className={clsx(
                                "flex-1 py-2 text-xs font-medium",
                                rightPanel === 'color'
                                    ? "bg-zinc-800 text-indigo-400 border-b-2 border-indigo-500"
                                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Color
                        </button>
                        <button
                            onClick={() => setRightPanel('layers')}
                            className={clsx(
                                "flex-1 py-2 text-xs font-medium",
                                rightPanel === 'layers'
                                    ? "bg-zinc-800 text-indigo-400 border-b-2 border-indigo-500"
                                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Layers
                        </button>
                        <button
                            onClick={() => setRightPanel('preview')}
                            className={clsx(
                                "flex-1 py-2 text-xs font-medium",
                                rightPanel === 'preview'
                                    ? "bg-zinc-800 text-indigo-400 border-b-2 border-indigo-500"
                                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Preview
                        </button>
                    </div>

                    {/* Panel content */}
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        {rightPanel === 'color' && <ColorPicker />}
                        {rightPanel === 'layers' && <LayersPanel />}
                        {rightPanel === 'preview' && <PreviewPanel className="flex-1" />}
                    </div>
                </div>
            </div>

            {/* New Sprite Dialog */}
            {showNewDialog && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 w-96 overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-700 bg-zinc-700/50">
                            <h2 className="text-lg font-semibold text-zinc-200">New Sprite</h2>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Size presets */}
                            <div className="space-y-2">
                                <label className="text-sm text-zinc-400">Presets</label>
                                <div className="flex flex-wrap gap-1">
                                    {SIZE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => {
                                                setNewWidth(preset.width);
                                                setNewHeight(preset.height);
                                            }}
                                            className={clsx(
                                                "px-2 py-1 rounded text-xs font-medium border",
                                                newWidth === preset.width && newHeight === preset.height
                                                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                                                    : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom size */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm text-zinc-400">Width</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="512"
                                        value={newWidth}
                                        onChange={(e) => setNewWidth(parseInt(e.target.value) || 32)}
                                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-200"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm text-zinc-400">Height</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="512"
                                        value={newHeight}
                                        onChange={(e) => setNewHeight(parseInt(e.target.value) || 32)}
                                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-200"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center px-4 py-3 border-t border-zinc-700 bg-zinc-700/30">
                            <div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImportImage}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                                >
                                    <Upload size={14} />
                                    Import Image...
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowNewDialog(false)}
                                    className="px-4 py-2 rounded-lg text-zinc-400 hover:text-zinc-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleNewSprite}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Dialog */}
            {showExportDialog && (
                <ExportDialog onClose={() => setShowExportDialog(false)} />
            )}
        </div >
    );
}
