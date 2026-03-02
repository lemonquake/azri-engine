/**
 * PreviewPanel - Independent playback and zoom for animations
 */
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import {
    Play, Pause, Square,
    ZoomIn, ZoomOut, Maximize, Repeat, Plus, Trash2
} from 'lucide-react';
import { useTimelineStore } from './stores/timelineStore';

interface PreviewPanelProps {
    className?: string;
}

export function PreviewPanel({ className }: PreviewPanelProps) {
    const {
        frames,
        currentFrameIndex,
        playback,
        play,
        pause,
        stop,
        toggleLoop,
        animations,
        previewAnimationId,
        setPreviewAnimation,
        addAnimation,
        removeAnimation
    } = useTimelineStore();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [zoom, setZoom] = useState(4);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize canvas to container
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Clear
        ctx.fillStyle = '#18181b'; // Zinc 900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Checkerboard
        ctx.save();
        ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);

        // Draw frame
        const frame = frames[currentFrameIndex];
        if (frame && frame.imageData) {
            const fw = frame.imageData.width;
            const fh = frame.imageData.height;

            ctx.translate(-fw * zoom / 2, -fh * zoom / 2);

            // Draw checkerboard behind frame
            for (let y = 0; y < fh; y++) {
                for (let x = 0; x < fw; x++) {
                    ctx.fillStyle = (x + y) % 2 === 0 ? '#27272a' : '#3f3f46';
                    ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
                }
            }

            // Draw image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = fw;
            tempCanvas.height = fh;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.putImageData(frame.imageData, 0, 0);

                // Draw layers? Use flattened frame.imageData for now.
                // Actually the store updates 'imageData' on the frame with the flattened version, so this is correct.

                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(tempCanvas, 0, 0, fw * zoom, fh * zoom);
            }
        }

        ctx.restore();

    }, [frames, currentFrameIndex, zoom, pan, canvasRef.current?.width, canvasRef.current?.height]);

    // Pan Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setPan({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault(); // Might need passive: false listener if this doesn't work
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(1, Math.min(32, z * delta)));
    };

    // Animation Management
    const [showAnimInput, setShowAnimInput] = useState(false);
    const [newAnimName, setNewAnimName] = useState('');

    const handleAddAnimation = () => {
        // Default to current selection or full range?
        // For now, let's default to full range or 0-1
        addAnimation(newAnimName || 'New Animation', 0, Math.max(0, frames.length - 1));
        setNewAnimName('');
        setShowAnimInput(false);
    };

    return (
        <div className={clsx("flex flex-col h-full bg-zinc-900", className)}>
            {/* Viewport */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden cursor-move"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <canvas ref={canvasRef} className="block w-full h-full" />

                {/* Overlay Controls */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 bg-zinc-800/80 p-1 rounded backdrop-blur">
                    <button onClick={() => setZoom(z => z * 1.5)} className="p-1 hover:bg-zinc-700 rounded text-zinc-300"><ZoomIn size={14} /></button>
                    <button onClick={() => setZoom(z => z / 1.5)} className="p-1 hover:bg-zinc-700 rounded text-zinc-300"><ZoomOut size={14} /></button>
                    <button onClick={() => { setZoom(4); setPan({ x: 0, y: 0 }); }} className="p-1 hover:bg-zinc-700 rounded text-zinc-300"><Maximize size={14} /></button>
                </div>
            </div>

            {/* Controls */}
            <div className="p-4 border-t border-zinc-700 space-y-4">
                {/* Playback */}
                <div className="flex items-center justify-center gap-2">
                    <button onClick={stop} className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"><Square size={14} fill="currentColor" /></button>
                    <button onClick={playback.isPlaying ? pause : play} className={clsx("p-3 rounded-full", playback.isPlaying ? "bg-zinc-700 text-zinc-200" : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500")}>
                        {playback.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </button>
                    <button onClick={toggleLoop} className={clsx("p-2 rounded", playback.isLooping ? "bg-emerald-600/20 text-emerald-400" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700")}>
                        <Repeat size={14} />
                    </button>
                </div>

                {/* Animation Select */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>Animation</span>
                        <button onClick={() => setShowAnimInput(true)} className="p-1 hover:text-white"><Plus size={12} /></button>
                    </div>

                    {showAnimInput && (
                        <div className="flex gap-1 mb-2">
                            <input
                                value={newAnimName}
                                onChange={e => setNewAnimName(e.target.value)}
                                placeholder="Name..."
                                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleAddAnimation()}
                            />
                            <button onClick={handleAddAnimation} className="px-2 bg-indigo-600 rounded text-xs text-white">Add</button>
                        </div>
                    )}

                    <select
                        value={previewAnimationId || ''}
                        onChange={(e) => setPreviewAnimation(e.target.value || null)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
                    >
                        <option value="">Full Timeline ({frames.length} frames)</option>
                        {animations.map(anim => (
                            <option key={anim.id} value={anim.id}>{anim.name} ({anim.startFrame + 1}-{anim.endFrame + 1})</option>
                        ))}
                    </select>
                </div>

                {/* Current Animation Details (Editable?) */}
                {previewAnimationId && (
                    <div className="p-2 bg-zinc-800/50 rounded text-xs space-y-2">
                        {(() => {
                            const anim = animations.find(a => a.id === previewAnimationId);
                            if (!anim) return null;
                            return (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Range</span>
                                        <span className="text-zinc-300">{anim.startFrame + 1} - {anim.endFrame + 1}</span>
                                    </div>
                                    <button
                                        onClick={() => removeAnimation(anim.id)}
                                        className="w-full flex items-center justify-center gap-1 py-1 bg-red-600/10 text-red-400 hover:bg-red-600/20 rounded"
                                    >
                                        <Trash2 size={12} /> Delete Animation
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}
