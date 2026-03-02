/**
 * FlashTimeline - Flash-style frame timeline with playback controls
 */
import { useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import {
    Play, Pause, Square, SkipBack, SkipForward, ChevronLeft, ChevronRight,
    Plus, Trash2, Repeat, Eye, EyeOff, Key, Clock, FilePlus
} from 'lucide-react';
import { useTimelineStore } from './stores/timelineStore';

interface FlashTimelineProps {
    className?: string;
}

export function FlashTimeline({ className }: FlashTimelineProps) {
    const {
        frames,
        currentFrameIndex,
        selectedFrameIndices,
        playback,
        onionSkin,
        addFrame,
        removeFrame,
        duplicateFrame,
        moveFrame,
        selectFrame,
        selectFrameRange,
        setFrameDuration,
        toggleKeyframe,
        play,
        pause,
        stop,
        toggleLoop,
        setFps,
        nextFrame,
        prevFrame,
        tick,
        toggleOnionSkin,
    } = useTimelineStore();

    const frameStripRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | undefined>(undefined);
    const lastTickTime = useRef<number>(0);

    // Animation loop
    useEffect(() => {
        if (!playback.isPlaying) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            return;
        }

        const msPerFrame = 1000 / playback.fps;

        const animate = (time: number) => {
            if (time - lastTickTime.current >= msPerFrame) {
                tick();
                lastTickTime.current = time;
            }
            animationRef.current = requestAnimationFrame(animate);
        };

        lastTickTime.current = performance.now();
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [playback.isPlaying, playback.fps, tick]);

    // Scroll current frame into view
    useEffect(() => {
        if (frameStripRef.current) {
            const frameElement = frameStripRef.current.children[currentFrameIndex] as HTMLElement;
            if (frameElement) {
                frameElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [currentFrameIndex]);

    // Handle frame drag
    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('frameIndex', index.toString());
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('frameIndex'));
        if (fromIndex !== targetIndex) {
            moveFrame(fromIndex, targetIndex);
        }
    }, [moveFrame]);

    // Handle click with modifiers
    const handleFrameClick = useCallback((e: React.MouseEvent, index: number) => {
        if (e.shiftKey && selectedFrameIndices.size > 0) {
            const lastSelected = Array.from(selectedFrameIndices).pop() || 0;
            selectFrameRange(lastSelected, index);
        } else {
            selectFrame(index, e.ctrlKey || e.metaKey);
        }
    }, [selectedFrameIndices, selectFrame, selectFrameRange]);

    return (
        <div className={clsx("flex flex-col bg-zinc-900 border-t border-zinc-700", className)}>
            {/* Playback Controls */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-zinc-800">
                {/* Transport */}
                <div className="flex items-center gap-1 bg-zinc-700/50 rounded-lg p-1">
                    <button
                        onClick={stop}
                        title="Stop"
                        className="p-1.5 rounded hover:bg-zinc-600 text-zinc-300"
                    >
                        <Square size={14} fill="currentColor" />
                    </button>
                    <button
                        onClick={prevFrame}
                        title="Previous Frame"
                        className="p-1.5 rounded hover:bg-zinc-600 text-zinc-300"
                    >
                        <SkipBack size={14} />
                    </button>
                    <button
                        onClick={playback.isPlaying ? pause : play}
                        title={playback.isPlaying ? "Pause" : "Play"}
                        className={clsx(
                            "p-2 rounded-lg",
                            playback.isPlaying
                                ? "bg-emerald-600 text-white"
                                : "bg-indigo-600 text-white hover:bg-indigo-500"
                        )}
                    >
                        {playback.isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                    </button>
                    <button
                        onClick={nextFrame}
                        title="Next Frame"
                        className="p-1.5 rounded hover:bg-zinc-600 text-zinc-300"
                    >
                        <SkipForward size={14} />
                    </button>
                </div>

                {/* Loop Toggle */}
                <button
                    onClick={toggleLoop}
                    title={playback.isLooping ? "Loop On" : "Loop Off"}
                    className={clsx(
                        "p-1.5 rounded",
                        playback.isLooping
                            ? "bg-emerald-600/30 text-emerald-400"
                            : "bg-zinc-700/50 text-zinc-500"
                    )}
                >
                    <Repeat size={16} />
                </button>

                {/* FPS Control */}
                <div className="flex items-center gap-2 px-2 py-1 bg-zinc-700/50 rounded">
                    <span className="text-xs text-zinc-400">FPS</span>
                    <input
                        type="number"
                        min="1"
                        max="60"
                        value={playback.fps}
                        onChange={(e) => setFps(parseInt(e.target.value) || 12)}
                        className="w-10 bg-zinc-800 border border-zinc-600 rounded px-1 text-sm text-center text-zinc-200"
                    />
                </div>

                {/* Frame Info */}
                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-700/50 rounded text-xs text-zinc-400">
                    <span>Frame</span>
                    <span className="font-mono text-zinc-200">{currentFrameIndex + 1}</span>
                    <span>/</span>
                    <span className="font-mono text-zinc-200">{frames.length}</span>
                </div>

                <div className="flex-1" />

                {/* Onion Skin Toggle */}
                <button
                    onClick={toggleOnionSkin}
                    title={onionSkin.enabled ? "Onion Skin On" : "Onion Skin Off"}
                    className={clsx(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded text-xs",
                        onionSkin.enabled
                            ? "bg-purple-600/30 text-purple-300"
                            : "bg-zinc-700/50 text-zinc-500"
                    )}
                >
                    {onionSkin.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                    Onion
                </button>

                {/* Frame Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => duplicateFrame(currentFrameIndex)}
                        title="Duplicate Frame"
                        className="p-1.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        onClick={() => addFrame()}
                        title="New Empty Frame"
                        className="p-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        onClick={() => removeFrame(currentFrameIndex)}
                        disabled={frames.length <= 1}
                        title="Delete Frame"
                        className={clsx(
                            "p-1.5 rounded",
                            frames.length <= 1
                                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                        )}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Frame Strip */}
            <div className="flex items-center">
                {/* Left scroll button */}
                <button
                    onClick={() => frameStripRef.current?.scrollBy({ left: -100, behavior: 'smooth' })}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                >
                    <ChevronLeft size={16} />
                </button>

                {/* Frame thumbnails */}
                <div
                    ref={frameStripRef}
                    className="flex-1 flex gap-1 overflow-x-auto py-2 px-2 scrollbar-thin scrollbar-thumb-zinc-600"
                >
                    {frames.map((frame, index) => {
                        const isSelected = selectedFrameIndices.has(index);
                        const isCurrent = index === currentFrameIndex;

                        return (
                            <div
                                key={frame.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, index)}
                                onClick={(e) => handleFrameClick(e, index)}
                                className={clsx(
                                    "flex flex-col items-center gap-1 p-1 rounded cursor-pointer",
                                    "min-w-[60px] transition-all duration-150",
                                    "hover:bg-zinc-700/50",
                                    isCurrent && "ring-2 ring-indigo-500",
                                    isSelected && !isCurrent && "bg-indigo-600/20"
                                )}
                            >
                                {/* Frame thumbnail */}
                                <div className={clsx(
                                    "w-12 h-12 bg-zinc-800 border-2 rounded",
                                    "flex items-center justify-center",
                                    frame.isKeyframe ? "border-yellow-500" : "border-zinc-600"
                                )}>
                                    {frame.imageData ? (
                                        <div className="w-full h-full bg-zinc-700 overflow-hidden">
                                            {/* Would render thumbnail here */}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-zinc-600">Empty</span>
                                    )}
                                </div>

                                {/* Frame number */}
                                <div className="flex items-center gap-1">
                                    <span className={clsx(
                                        "text-[10px] font-mono",
                                        isCurrent ? "text-indigo-300" : "text-zinc-500"
                                    )}>
                                        {index + 1}
                                    </span>
                                    {frame.isKeyframe && (
                                        <Key size={8} className="text-yellow-500" />
                                    )}
                                </div>

                                {/* Duration indicator */}
                                {frame.duration > 1 && (
                                    <div className="flex items-center gap-0.5 text-[9px] text-zinc-500">
                                        <Clock size={8} />
                                        ×{frame.duration}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Right scroll button */}
                <button
                    onClick={() => frameStripRef.current?.scrollBy({ left: 100, behavior: 'smooth' })}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Duration Editor (for selected frame) */}
            {frames[currentFrameIndex] && (
                <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Duration:</span>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={frames[currentFrameIndex].duration}
                            onChange={(e) => setFrameDuration(currentFrameIndex, parseInt(e.target.value) || 1)}
                            className="w-12 bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-sm text-center text-zinc-200"
                        />
                        <span className="text-xs text-zinc-600">ticks</span>
                    </div>

                    <button
                        onClick={() => toggleKeyframe(currentFrameIndex)}
                        className={clsx(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs",
                            frames[currentFrameIndex].isKeyframe
                                ? "bg-yellow-600/20 text-yellow-400"
                                : "bg-zinc-700/50 text-zinc-500"
                        )}
                    >
                        <Key size={12} />
                        Keyframe
                    </button>
                </div>
            )}
        </div>
    );
}
