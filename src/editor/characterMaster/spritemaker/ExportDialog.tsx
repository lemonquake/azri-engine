import { useState, useRef, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { useTimelineStore } from './stores/timelineStore'; // Assumed path
import { useDrawingStore } from './stores/drawingStore';   // Assumed path
import JSZip from 'jszip';
// @ts-ignore
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

interface ExportDialogProps {
    onClose: () => void;
}

type ExportTab = 'sheet' | 'frames' | 'gif';

export function ExportDialog({ onClose }: ExportDialogProps) {
    const [activeTab, setActiveTab] = useState<ExportTab>('sheet');
    const { frames, playback } = useTimelineStore();
    const { canvasWidth, canvasHeight } = useDrawingStore();

    // Sprite Sheet Settings
    const [columns, setColumns] = useState(0); // 0 = auto
    const [padding, setPadding] = useState(0);
    const [margin, setMargin] = useState(0);
    const [sheetBg, setSheetBg] = useState<'transparent' | 'white' | 'black'>('transparent');

    // GIF Settings
    const [gifScale, setGifScale] = useState(1);
    const [gifFps, setGifFps] = useState(playback.fps);
    const [gifLoop, setGifLoop] = useState(true);

    // Frames Settings
    const [framePrefix, setFramePrefix] = useState('sprite');

    // Auto-calculate columns if 0
    const effectiveColumns = columns > 0 ? columns : Math.ceil(Math.sqrt(frames.length));
    const effectiveRows = Math.ceil(frames.length / effectiveColumns);

    const previewCanvasRef = useRef<HTMLCanvasElement>(null);

    // Draw preview
    useEffect(() => {
        const canvas = previewCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw based on active tab
        if (activeTab === 'sheet') {
            const sheetWidth = effectiveColumns * (canvasWidth + padding) - padding + margin * 2;
            const sheetHeight = effectiveRows * (canvasHeight + padding) - padding + margin * 2;

            // Resize canvas for preview (scaled down if needed)
            // For now, let's just draw strictly to the preview size
            // Actually, we want to show the full sheet layout? 
            // Let's just draw the first few frames to show layout or fit the whole thing

            // To fit in preview area:
            const containerW = canvas.offsetWidth;
            const containerH = canvas.offsetHeight;
            canvas.width = containerW;
            canvas.height = containerH;

            // Background
            if (sheetBg === 'white') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else if (sheetBg === 'black') {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
                // Checkerboard
                // ... omitted for brevity
            }

            const scale = Math.min(containerW / sheetWidth, containerH / sheetHeight) * 0.9;
            const offsetX = (containerW - sheetWidth * scale) / 2;
            const offsetY = (containerH - sheetHeight * scale) / 2;

            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);

            // Draw margin/padding help?
            // Draw background of sheet rect
            if (sheetBg !== 'transparent') {
                ctx.fillStyle = sheetBg;
                ctx.fillRect(0, 0, sheetWidth, sheetHeight);
            }

            frames.forEach((frame, i) => {
                const col = i % effectiveColumns;
                const row = Math.floor(i / effectiveColumns);
                const x = margin + col * (canvasWidth + padding);
                const y = margin + row * (canvasHeight + padding);

                if (frame.imageData) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvasWidth;
                    tempCanvas.height = canvasHeight;
                    const tCtx = tempCanvas.getContext('2d');
                    if (tCtx) {
                        tCtx.putImageData(frame.imageData, 0, 0);
                        ctx.drawImage(tempCanvas, x, y);
                    }
                }
            });

            ctx.restore();

        } else if (activeTab === 'frames' || activeTab === 'gif') {
            // Show animation or just first frame
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;

            const scale = Math.min(canvas.width / canvasWidth, canvas.height / canvasHeight) * 0.8;
            const x = (canvas.width - canvasWidth * scale) / 2;
            const y = (canvas.height - canvasHeight * scale) / 2;

            ctx.imageSmoothingEnabled = false;

            const frame = frames[0]; // Just show first frame for now
            if (frame && frame.imageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasWidth;
                tempCanvas.height = canvasHeight;
                const tCtx = tempCanvas.getContext('2d');
                if (tCtx) {
                    tCtx.putImageData(frame.imageData, 0, 0);
                    ctx.drawImage(tempCanvas, x, y, canvasWidth * scale, canvasHeight * scale);
                }
            }
        }

    }, [activeTab, frames, effectiveColumns, effectiveRows, padding, margin, sheetBg, canvasWidth, canvasHeight]);


    const handleExport = async () => {
        if (activeTab === 'sheet') {
            const sheetWidth = effectiveColumns * (canvasWidth + padding) - padding + margin * 2;
            const sheetHeight = effectiveRows * (canvasHeight + padding) - padding + margin * 2;

            const canvas = document.createElement('canvas');
            canvas.width = sheetWidth;
            canvas.height = sheetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (sheetBg !== 'transparent') {
                ctx.fillStyle = sheetBg;
                ctx.fillRect(0, 0, sheetWidth, sheetHeight);
            }

            frames.forEach((frame, i) => {
                const col = i % effectiveColumns;
                const row = Math.floor(i / effectiveColumns);
                const x = margin + col * (canvasWidth + padding);
                const y = margin + row * (canvasHeight + padding);

                if (frame.imageData) {
                    ctx.putImageData(frame.imageData, x, y);
                }
            });

            const link = document.createElement('a');
            link.download = `spritesheet_${effectiveColumns}x${effectiveRows}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

        } else if (activeTab === 'frames') {
            const zip = new JSZip();

            frames.forEach((frame, i) => {
                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');
                if (ctx && frame.imageData) {
                    ctx.putImageData(frame.imageData, 0, 0);
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

            // Create a temporary canvas for scaling if needed
            const width = canvasWidth * gifScale;
            const height = canvasHeight * gifScale;

            frames.forEach(frame => {
                if (!frame.imageData) return;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.imageSmoothingEnabled = false;

                // Draw frame data to canvas
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasWidth;
                tempCanvas.height = canvasHeight;
                const tCtx = tempCanvas.getContext('2d');
                if (!tCtx) return;
                tCtx.putImageData(frame.imageData, 0, 0);

                ctx.drawImage(tempCanvas, 0, 0, width, height);

                const data = ctx.getImageData(0, 0, width, height).data;
                const palette = quantize(data, 256);
                const index = applyPalette(data, palette);

                // Delay in ms. 1 tick = 1/fps seconds? 
                // frames have duration in ticks. 
                // Duration in ms = (durationTicks / fps) * 1000
                const delay = (frame.duration / gifFps) * 1000;

                encoder.writeFrame(index, width, height, {
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
            link.download = 'animation.gif';
            link.click();
            URL.revokeObjectURL(link.href);
        }

        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 w-[600px] flex flex-col overflow-hidden max-h-[80vh]">
                <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-700 bg-zinc-700/50">
                    <h2 className="text-lg font-semibold text-zinc-200">Export Sprite</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Left: Settings */}
                    <div className="w-64 border-r border-zinc-700 flex flex-col bg-zinc-900/50">
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

                        <div className="p-4 space-y-4 overflow-y-auto">
                            {activeTab === 'sheet' && (
                                <>
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
                                        Total Size: {effectiveColumns * (canvasWidth + padding) - padding + margin * 2} x {effectiveRows * (canvasHeight + padding) - padding + margin * 2}
                                    </div>
                                </>
                            )}

                            {activeTab === 'frames' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs text-zinc-400">File Prefix</label>
                                        <input
                                            type="text"
                                            value={framePrefix}
                                            onChange={(e) => setFramePrefix(e.target.value)}
                                            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                        />
                                    </div>
                                    <p className="text-xs text-zinc-500">
                                        Exports each frame as a separate PNG file inside a ZIP archive.
                                    </p>
                                </>
                            )}

                            {activeTab === 'gif' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs text-zinc-400">Scale</label>
                                        <select
                                            value={gifScale}
                                            onChange={(e) => setGifScale(parseInt(e.target.value))}
                                            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                        >
                                            <option value="1">1x</option>
                                            <option value="2">2x</option>
                                            <option value="4">4x</option>
                                            <option value="8">8x</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-zinc-400">FPS</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="60"
                                            value={gifFps}
                                            onChange={(e) => setGifFps(Math.max(1, Math.min(60, parseInt(e.target.value) || 12)))}
                                            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-200"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 pt-2">
                                        <input
                                            type="checkbox"
                                            id="gifLoop"
                                            checked={gifLoop}
                                            onChange={(e) => setGifLoop(e.target.checked)}
                                            className="rounded bg-zinc-700 border-zinc-600"
                                        />
                                        <label htmlFor="gifLoop" className="text-sm text-zinc-300">Loop</label>
                                    </div>
                                </>
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
                        <canvas ref={previewCanvasRef} className="max-w-full max-h-full border border-zinc-700 shadow-xl relative z-10" />
                    </div>
                </div>

                <div className="flex justify-end items-center px-4 py-3 border-t border-zinc-700 bg-zinc-700/30 gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 flex items-center gap-2"
                    >
                        <Download size={14} />
                        Export {activeTab === 'sheet' ? 'Sheet' : activeTab === 'frames' ? 'ZIP' : 'GIF'}
                    </button>
                </div>
            </div>
        </div>
    );
}
