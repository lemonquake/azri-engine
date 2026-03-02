import React, { useState, useRef, useEffect } from 'react';
import { X, Wand2, Eraser, Undo, Save, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface ImageEditorModalProps {
    src: string;
    onClose: () => void;
    onSave: (newSrc: string) => void;
}

type ToolType = 'magicWand' | 'eraser';

export function ImageEditorModal({ src, onClose, onSave }: ImageEditorModalProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [tool, setTool] = useState<ToolType>('magicWand');
    const [tolerance, setTolerance] = useState(32);
    const [eraserSize, setEraserSize] = useState(20);

    // History for undo
    const [history, setHistory] = useState<ImageData[]>([]);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // Smooth WASD panning
    const keys = useRef<{ [key: string]: boolean }>({});

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = true;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        let reqId: number;
        const moveSpeed = 10;

        const loop = () => {
            let dx = 0;
            let dy = 0;
            if (keys.current['w']) dy += moveSpeed;
            if (keys.current['s']) dy -= moveSpeed;
            if (keys.current['a']) dx += moveSpeed;
            if (keys.current['d']) dx -= moveSpeed;

            if (dx !== 0 || dy !== 0) {
                // Adjust speed based on zoom so it feels consistent
                setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            }
            reqId = requestAnimationFrame(loop);
        };
        reqId = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            cancelAnimationFrame(reqId);
        };
    }, []);

    // Interaction state
    const [isDragging, setIsDragging] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    // Initial state for history
                    setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
                }
            }
        };
        img.src = src;
    }, [src]);

    const pushHistory = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev, imageData]);
    };

    const handleUndo = () => {
        if (history.length <= 1) return; // Cannot undo initial state

        const newHistory = [...history];
        newHistory.pop(); // Remove current
        const previousState = newHistory[newHistory.length - 1];
        setHistory(newHistory);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx && previousState) {
            ctx.putImageData(previousState, 0, 0);
        }
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const newSrc = canvas.toDataURL('image/png');
            onSave(newSrc);
        }
        onClose();
    };

    const getPixelCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        let clientX, clientY;
        if ('touches' in e) {
            const touchEvent = e as unknown as React.TouchEvent;
            clientX = touchEvent.touches[0].clientX;
            clientY = touchEvent.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const rect = canvas.getBoundingClientRect();

        // Map from screen space to canvas pixel space
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = Math.floor((clientX - rect.left) * scaleX);
        const y = Math.floor((clientY - rect.top) * scaleY);

        return { x, y };
    };

    // Magic Wand (Flood Fill Algorithm)
    const applyMagicWand = (startX: number, startY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

        pushHistory();

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Get target color (the pixel clicked)
        const startIndex = (startY * width + startX) * 4;
        const targetR = data[startIndex];
        const targetG = data[startIndex + 1];
        const targetB = data[startIndex + 2];
        const targetA = data[startIndex + 3];

        if (targetA === 0) return; // Already transparent

        // Check color match within tolerance
        const matchesTarget = (r: number, g: number, b: number, a: number) => {
            // Also tolerate alpha differences maybe, or assume we only click opaque parts mostly
            if (a === 0) return false;

            const rDiff = Math.abs(r - targetR);
            const gDiff = Math.abs(g - targetG);
            const bDiff = Math.abs(b - targetB);

            // Simple max difference
            return rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance;
        };

        const stack = [[startX, startY]];
        const visited = new Uint8Array(width * height);

        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const pos = y * width + x;

            if (visited[pos]) continue;

            const i = pos * 4;
            if (matchesTarget(data[i], data[i + 1], data[i + 2], data[i + 3])) {
                // Set transparent
                data[i + 3] = 0;
                visited[pos] = 1;

                // Push neighbors
                if (x > 0) stack.push([x - 1, y]);
                if (x < width - 1) stack.push([x + 1, y]);
                if (y > 0) stack.push([x, y - 1]);
                if (y < height - 1) stack.push([x, y + 1]);
            }
        }

        ctx.putImageData(imageData, 0, 0);
    };

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Middle click = pan
        if ('button' in e && e.button === 1) {
            e.preventDefault();
            setIsDragging(true);
            const clientX = 'touches' in e ? (e as unknown as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? (e as unknown as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
            setLastPos({ x: clientX, y: clientY });
            return;
        }

        // Space bar for pan? Handled via keyboard listeners normally, skip for now.

        // Drawing / Magic Wand
        const coords = getPixelCoords(e);
        if (!coords) return;

        if (tool === 'magicWand') {
            applyMagicWand(coords.x, coords.y);
        } else if (tool === 'eraser') {
            setIsDrawing(true);
            pushHistory();
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(coords.x, coords.y, eraserSize / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over'; // reset
                setLastPos({ x: coords.x, y: coords.y });
            }
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        const clientX = 'touches' in e ? (e as unknown as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? (e as unknown as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;

        if (isDragging) {
            const dx = clientX - lastPos.x;
            const dy = clientY - lastPos.y;
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setLastPos({ x: clientX, y: clientY });
            return;
        }

        if (isDrawing && tool === 'eraser') {
            const coords = getPixelCoords(e);
            if (!coords) return;

            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = eraserSize;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(lastPos.x, lastPos.y);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over'; // reset
                setLastPos({ x: coords.x, y: coords.y });
            }
        }
    };

    const handlePointerUp = () => {
        setIsDragging(false);
        setIsDrawing(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        // Direct scroll to zoom
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(0.1, Math.min(10, z * zoomDelta)));
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
            onMouseUp={handlePointerUp}
            onTouchEnd={handlePointerUp}
            onMouseLeave={handlePointerUp}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wand2 size={20} className="text-purple-400" />
                        Image Editor (Remove Background)
                    </h2>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Toolbar */}
                    <div className="w-64 border-r border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-6 overflow-y-auto">

                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Tools</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setTool('magicWand')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${tool === 'magicWand'
                                        ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-750 hover:text-zinc-300'
                                        }`}
                                >
                                    <Wand2 size={24} />
                                    <span className="text-xs font-medium">Magic Wand</span>
                                </button>
                                <button
                                    onClick={() => setTool('eraser')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${tool === 'eraser'
                                        ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-750 hover:text-zinc-300'
                                        }`}
                                >
                                    <Eraser size={24} />
                                    <span className="text-xs font-medium">Eraser</span>
                                </button>
                            </div>
                        </div>

                        {/* Tool Settings */}
                        <div className="flex flex-col gap-4 pt-4 border-t border-zinc-800">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Settings</span>

                            {tool === 'magicWand' && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-300">Tolerance</span>
                                        <span className="text-zinc-500 font-mono">{tolerance}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0" max="255"
                                        value={tolerance}
                                        onChange={e => setTolerance(parseInt(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                            )}

                            {tool === 'eraser' && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-zinc-300">Brush Size</span>
                                        <span className="text-zinc-500 font-mono">{eraserSize}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1" max="100"
                                        value={eraserSize}
                                        onChange={e => setEraserSize(parseInt(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 pt-4 border-t border-zinc-800 mt-auto">
                            <button
                                onClick={handleUndo}
                                disabled={history.length <= 1}
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Undo size={16} /> Undo
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors shadow-lg shadow-purple-500/20"
                            >
                                <Save size={16} /> Save Changes
                            </button>
                        </div>
                    </div>

                    {/* Canvas Area */}
                    <div
                        ref={containerRef}
                        className="flex-1 bg-zinc-950 relative overflow-hidden"
                        onWheel={handleWheel}
                    >
                        {/* Background grid pattern for transparency */}
                        <div className="absolute inset-0" style={{
                            backgroundImage: 'linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}></div>

                        {/* View controls floating */}
                        <div className="absolute top-4 right-4 flex gap-1 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-lg p-1 z-10 shadow-lg shadow-black/50">
                            <button onClick={() => setZoom(z => z * 1.2)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded">
                                <ZoomIn size={16} />
                            </button>
                            <button onClick={() => setZoom(z => z / 1.2)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded">
                                <ZoomOut size={16} />
                            </button>
                            <button onClick={resetView} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded">
                                <Maximize size={16} />
                            </button>
                        </div>

                        {/* Transform Container */}
                        <div
                            className="absolute inset-0 transform origin-top-left"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                // Center it initially roughly if needed
                            }}
                        >
                            <div className="flex items-center justify-center min-w-full min-h-full">
                                <canvas
                                    ref={canvasRef}
                                    className={`shadow-2xl shadow-black ring-1 ring-zinc-700 bg-transparent ${tool === 'eraser' ? 'cursor-crosshair' : 'cursor-pointer'}`}
                                    onMouseDown={handlePointerDown}
                                    onMouseMove={handlePointerMove}
                                    onTouchStart={handlePointerDown}
                                    onTouchMove={handlePointerMove}
                                    style={{
                                        imageRendering: 'pixelated', // Keep pixel art sharp
                                        touchAction: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ImageEditorModal;
