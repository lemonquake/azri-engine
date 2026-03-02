import { useState, useRef, useEffect, useMemo } from 'react';
import { Download, X } from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import type { SpriteFrame } from '../types';
import JSZip from 'jszip';
// @ts-ignore
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

interface AnimationExportDialogProps {
    onClose: () => void;
}

type ExportTab = 'sheet' | 'frames' | 'gif';

export function AnimationExportDialog({ onClose }: AnimationExportDialogProps) {
    const [activeTab, setActiveTab] = useState<ExportTab>('sheet');
    const activeAnimation = useCharacterMasterStore(s => s.getActiveAnimation());
    const loadedImage = useCharacterMasterStore(s => s.loadedImage);
    const getFrameAt = useCharacterMasterStore(s => s.getFrameAt);

    // Initial frames from store
    const baseFrames = activeAnimation?.frames.map(af => {
        const [row, col] = af.frameId.split(',').map(Number);
        return {
            ...getFrameAt(row, col),
            duration: af.duration
        };
    }).filter(f => f !== undefined) as (SpriteFrame & { duration: number })[] || [];

    // General Animation Settings
    const [reverse, setReverse] = useState(false);
    const [pingPong, setPingPong] = useState(false);
    const [overrideFps, setOverrideFps] = useState<number>(0);
    const [globalScale, setGlobalScale] = useState(1);

    // Sprite Sheet Settings
    const [columns, setColumns] = useState(0); // 0 = auto
    const [padding, setPadding] = useState(0);
    const [margin, setMargin] = useState(0);
    const [sheetBg, setSheetBg] = useState<'transparent' | 'white' | 'black'>('transparent');

    // GIF Settings
    const [gifLoop, setGifLoop] = useState(true);

    // Frames Settings
    const [framePrefix, setFramePrefix] = useState(activeAnimation?.name.replace(/\s+/g, '_').toLowerCase() || 'sprite');

    // Process frames based on settings
    const processedFrames = useMemo(() => {
        let frames: (SpriteFrame & { duration: number })[] = [...baseFrames];

        if (reverse) {
            frames.reverse();
        }

        if (pingPong && frames.length > 1) {
            // Append reversed frames (excluding first and last to avoid double frames at ends)
            // But usually ping-pong means: 0,1,2,3 -> 2,1 -> loop
            // So: 0, 1, 2, 3, 2, 1
            const reversed = [...frames].reverse().slice(1, -1);
            frames = [...frames, ...reversed];
        }

        if (overrideFps > 0) {
            const newDuration = Math.round(1000 / overrideFps);
            frames = frames.map(f => ({ ...f, duration: newDuration }));
        }

        return frames;
    }, [baseFrames, reverse, pingPong, overrideFps]);

    // Auto-calculate columns if 0
    const effectiveColumns = columns > 0 ? columns : Math.ceil(Math.sqrt(processedFrames.length));
    const effectiveRows = Math.ceil(processedFrames.length / effectiveColumns);

    // Determine max frame size
    const maxFrameWidth = Math.max(...processedFrames.map(f => f.width), 32);
    const maxFrameHeight = Math.max(...processedFrames.map(f => f.height), 32);

    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    // Preview Logic
    useEffect(() => {
        const canvas = previewCanvasRef.current;
        if (!canvas || !loadedImage || processedFrames.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Canvas Setup
        const containerW = canvas.parentElement?.offsetWidth || 300;
        const containerH = canvas.parentElement?.offsetHeight || 300;
        canvas.width = containerW;
        canvas.height = containerH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        if (activeTab === 'sheet') {
            // Cancel any animation loop
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

            const sheetWidth = effectiveColumns * (maxFrameWidth + padding) - padding + margin * 2;
            const sheetHeight = effectiveRows * (maxFrameHeight + padding) - padding + margin * 2;

            const scale = Math.min(containerW / sheetWidth, containerH / sheetHeight) * 0.9;
            const offsetX = (containerW - sheetWidth * scale) / 2;
            const offsetY = (containerH - sheetHeight * scale) / 2;

            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);

            // Background
            if (sheetBg !== 'transparent') {
                ctx.fillStyle = sheetBg;
                ctx.fillRect(0, 0, sheetWidth, sheetHeight);
            }

            // Draw Scale preview if applicable (Sheet ignores global scale usually, but let's apply general scale logic if requested?
            // Actually, usually sheet scale isn't desired in the *layout*, but let's assume globalScale applies to export.
            // If globalScale > 1, the sheet size increases. The preview should reflect relative layout.
            // For preview simplicity, we just show the layout.

            processedFrames.forEach((frame, i) => {
                const col = i % effectiveColumns;
                const row = Math.floor(i / effectiveColumns);
                const x = margin + col * (maxFrameWidth + padding);
                const y = margin + row * (maxFrameHeight + padding);

                ctx.drawImage(
                    loadedImage,
                    frame.x, frame.y, frame.width, frame.height,
                    x, y, frame.width, frame.height
                );
            });

            ctx.restore();

        } else {
            // Animation Preview (GIF / Frames)
            let currentFrameIndex = 0;
            let lastFrameTime = 0;

            const render = (timestamp: number) => {
                if (!startTimeRef.current) startTimeRef.current = timestamp;
                const elapsed = timestamp - lastFrameTime;

                const frame = processedFrames[currentFrameIndex];
                if (!frame) return; // Should not happen

                // Check if it's time to advance frame
                if (elapsed >= frame.duration) {
                    // Logic to advance
                    // If accumulated time is much greater, we should skip or just advance one?
                    // Simple approach:
                    currentFrameIndex = (currentFrameIndex + 1) % processedFrames.length;
                    lastFrameTime = timestamp;
                }

                // Draw current frame
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Calculate preview scale
                // We want to show the frame centered.
                // Apply globalScale to the visual size relative to container?
                // Or just fit to container.
                // Let's fit to container but respect aspect ratio.

                const frameW = frame.width * globalScale;
                const frameH = frame.height * globalScale;

                const scale = Math.min(containerW / frameW, containerH / frameH) * 0.8;
                const offsetX = (containerW - frameW * scale) / 2;
                const offsetY = (containerH - frameH * scale) / 2;

                ctx.save();
                ctx.translate(offsetX, offsetY);
                ctx.scale(scale * globalScale, scale * globalScale); // Apply global scale in preview? 
                // Wait, if we scale the drawing, it might look blurry if canvas is low res.
                // Better: drawImage with scaled destination.

                ctx.drawImage(
                    loadedImage,
                    frame.x, frame.y, frame.width, frame.height,
                    0, 0, frame.width, frame.height
                );

                ctx.restore();

                animFrameRef.current = requestAnimationFrame(render);
            };

            animFrameRef.current = requestAnimationFrame(render);
        }

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };

    }, [activeTab, processedFrames, loadedImage, effectiveColumns, effectiveRows, padding, margin, sheetBg, maxFrameWidth, maxFrameHeight, globalScale]);


    const handleExport = async () => {
        if (!loadedImage || processedFrames.length === 0) return;

        // Apply scale to dimensions
        const exportW = maxFrameWidth * globalScale;
        const exportH = maxFrameHeight * globalScale;

        if (activeTab === 'sheet') {

            // Simplified: if we scale, we scale the whole sheet? OR logic:
            // "Scale" usually means "Scale the sprite", then layout.
            // If padding is 1px, does it become 2px? 
            // Let's assume Global Scale scales the final output.

            // Let's recalculate sheet dimensions based on SCALED frames + SCALED padding.
            const scaledPadding = padding * globalScale;
            const scaledMargin = margin * globalScale;

            const sheetWidth = effectiveColumns * (exportW + scaledPadding) - scaledPadding + scaledMargin * 2;
            const sheetHeight = effectiveRows * (exportH + scaledPadding) - scaledPadding + scaledMargin * 2;

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, sheetWidth); // Safety
            canvas.height = Math.max(1, sheetHeight);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.imageSmoothingEnabled = false;

            if (sheetBg !== 'transparent') {
                ctx.fillStyle = sheetBg;
                ctx.fillRect(0, 0, sheetWidth, sheetHeight);
            }

            processedFrames.forEach((frame, i) => {
                const col = i % effectiveColumns;
                const row = Math.floor(i / effectiveColumns);
                const x = scaledMargin + col * (exportW + scaledPadding);
                const y = scaledMargin + row * (exportH + scaledPadding);

                ctx.drawImage(
                    loadedImage,
                    frame.x, frame.y, frame.width, frame.height,
                    x, y, exportW, exportH
                );
            });

            const link = document.createElement('a');
            link.download = `${framePrefix}_sheet.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

        } else if (activeTab === 'frames') {
            const zip = new JSZip();

            processedFrames.forEach((frame, i) => {
                const canvas = document.createElement('canvas');
                canvas.width = exportW;
                canvas.height = exportH;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(
                        loadedImage,
                        frame.x, frame.y, frame.width, frame.height,
                        0, 0, exportW, exportH
                    );
                    const dataUrl = canvas.toDataURL('image/png');
                    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
                    const fileName = `${framePrefix}_${i.toString().padStart(3, '0')}.png`;
                    zip.file(fileName, base64Data, { base64: true });
                }
            });

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${framePrefix}_frames.zip`;
            link.click();
            URL.revokeObjectURL(link.href);

        } else if (activeTab === 'gif') {
            const encoder = new GIFEncoder();
            // Use globalScale for GIF dimensions

            processedFrames.forEach(frame => {
                const canvas = document.createElement('canvas');
                canvas.width = exportW;
                canvas.height = exportH;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.imageSmoothingEnabled = false;

                // Draw frame scaled
                ctx.drawImage(
                    loadedImage,
                    frame.x, frame.y, frame.width, frame.height,
                    0, 0, exportW, exportH
                );

                const data = ctx.getImageData(0, 0, exportW, exportH).data;
                const palette = quantize(data, 256);
                const index = applyPalette(data, palette);

                // Duration in ms
                const delay = frame.duration;

                encoder.writeFrame(index, exportW, exportH, {
                    palette,
                    delay,
                    repeat: gifLoop ? 0 : -1,
                    transparent: true
                });
            });

            encoder.finish();
            const buffer = encoder.bytes();
            const blob = new Blob([buffer], { type: 'image/gif' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${framePrefix}.gif`;
            link.click();
            URL.revokeObjectURL(link.href);
        }

        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 w-[650px] flex flex-col overflow-hidden max-h-[85vh]">
                <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-700 bg-zinc-700/50">
                    <h2 className="text-lg font-semibold text-zinc-200">Export Animation</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Left: Settings */}
                    <div className="w-72 border-r border-zinc-700 flex flex-col bg-zinc-900/50">
                        <div className="flex border-b border-zinc-700">
                            {(['sheet', 'frames', 'gif'] as ExportTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 py-2 text-xs font-medium capitalize ${activeTab === tab
                                        ? 'bg-zinc-800 text-indigo-400 border-b-2 border-indigo-500'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="p-4 space-y-6 overflow-y-auto">
                            {!activeAnimation && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                                    No active animation selected.
                                </div>
                            )}

                            {/* --- General Settings Group --- */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Common Settings</h3>

                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-400">Scale Output</label>
                                    <select
                                        value={globalScale}
                                        onChange={(e) => setGlobalScale(parseInt(e.target.value))}
                                        className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                    >
                                        <option value="1">1x</option>
                                        <option value="2">2x</option>
                                        <option value="3">3x</option>
                                        <option value="4">4x</option>
                                        <option value="8">8x</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="reverseAnim"
                                            checked={reverse}
                                            onChange={(e) => setReverse(e.target.checked)}
                                            className="rounded bg-zinc-700 border-zinc-600"
                                        />
                                        <label htmlFor="reverseAnim" className="text-xs text-zinc-300">Reverse</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="pingPongAnim"
                                            checked={pingPong}
                                            onChange={(e) => setPingPong(e.target.checked)}
                                            className="rounded bg-zinc-700 border-zinc-600"
                                        />
                                        <label htmlFor="pingPongAnim" className="text-xs text-zinc-300">Ping-Pong</label>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-400">Override FPS (0 = Keep Original)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        value={overrideFps}
                                        onChange={(e) => setOverrideFps(parseInt(e.target.value) || 0)}
                                        className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                    />
                                    <p className="text-[10px] text-zinc-500">
                                        {overrideFps > 0 ? `Duration: ${Math.round(1000 / overrideFps)}ms per frame` : 'Using individual frame durations'}
                                    </p>
                                </div>
                            </div>

                            {/* --- Type Specific Settings --- */}
                            {activeTab === 'sheet' && (
                                <div className="space-y-3 pt-3 border-t border-zinc-700">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sheet Layout</h3>

                                    <div className="space-y-1">
                                        <label className="text-xs text-zinc-400">Columns (0 = Auto)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={columns}
                                            onChange={(e) => setColumns(parseInt(e.target.value) || 0)}
                                            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-xs text-zinc-400">Padding (px)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={padding}
                                                onChange={(e) => setPadding(parseInt(e.target.value) || 0)}
                                                className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-zinc-400">Margin (px)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={margin}
                                                onChange={(e) => setMargin(parseInt(e.target.value) || 0)}
                                                className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-zinc-400">Background</label>
                                        <select
                                            value={sheetBg}
                                            onChange={(e) => setSheetBg(e.target.value as any)}
                                            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                        >
                                            <option value="transparent">Transparent</option>
                                            <option value="white">White</option>
                                            <option value="black">Black</option>
                                        </select>
                                    </div>

                                    <div className="pt-2 text-xs text-zinc-500">
                                        Est. Size: {
                                            (effectiveColumns * (maxFrameWidth * globalScale + padding * globalScale) - padding * globalScale + margin * globalScale * 2)
                                        } x {
                                            (effectiveRows * (maxFrameHeight * globalScale + padding * globalScale) - padding * globalScale + margin * globalScale * 2)
                                        }
                                    </div>
                                </div>
                            )}

                            {activeTab === 'frames' && (
                                <div className="space-y-3 pt-3 border-t border-zinc-700">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">File Output</h3>
                                    <div className="space-y-1">
                                        <label className="text-xs text-zinc-400">File Prefix</label>
                                        <input
                                            type="text"
                                            value={framePrefix}
                                            onChange={(e) => setFramePrefix(e.target.value)}
                                            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'gif' && (
                                <div className="space-y-3 pt-3 border-t border-zinc-700">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">GIF Options</h3>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="gifLoop"
                                            checked={gifLoop}
                                            onChange={(e) => setGifLoop(e.target.checked)}
                                            className="rounded bg-zinc-700 border-zinc-600"
                                        />
                                        <label htmlFor="gifLoop" className="text-sm text-zinc-300">Loop Forever</label>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Preview */}
                    <div className="flex-1 bg-zinc-950 flex flex-col p-4 items-center justify-center checkerboard relative">
                        <div className="absolute inset-0 pointer-events-none opacity-20"
                            style={{
                                backgroundImage: `linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)`,
                                backgroundSize: `20px 20px`,
                                backgroundPosition: `0 0, 0 10px, 10px -10px, -10px 0`
                            }}
                        />
                        <div className='relative z-10 flex flex-col items-center gap-2'>
                            <canvas ref={previewCanvasRef} className="max-w-full max-h-[60vh] border border-zinc-700 shadow-xl" />
                            <span className='text-xs text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded'>{activeTab === 'sheet' ? 'Sheet Preview' : 'Animation Preview'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end items-center px-4 py-3 border-t border-zinc-700 bg-zinc-700/30 gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={!activeAnimation || processedFrames.length === 0}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={14} />
                        Export {activeTab === 'sheet' ? 'Sheet' : activeTab === 'frames' ? 'ZIP' : 'GIF'}
                    </button>
                </div>
            </div>
        </div>
    );
}
