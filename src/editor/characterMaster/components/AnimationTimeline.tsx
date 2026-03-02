/**
 * AnimationTimeline - Horizontal timeline for animation frame management
 */
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
    Plus, Trash2, Play, Pause, Square, ChevronLeft, ChevronRight,
    Clock, GripVertical
} from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import { Tooltip, DurationTooltipContent } from './Tooltip';

interface AnimationTimelineProps {
    className?: string;
}

export function AnimationTimeline({ className }: AnimationTimelineProps) {
    const isPlaying = useCharacterMasterStore(s => s.playback.isPlaying);
    const currentFrameIndex = useCharacterMasterStore(s => s.playback.currentFrameIndex);

    // Construct minimal playback object for existing code compatibility if needed, or update usage
    const playback = { isPlaying, currentFrameIndex };

    const frames = useCharacterMasterStore(s => s.frames);
    const selection = useCharacterMasterStore(s => s.selection);
    const activeAnimationId = useCharacterMasterStore(s => s.activeAnimationId);


    const animations = useCharacterMasterStore(s => s.animations);
    const animation = activeAnimationId ? animations.get(activeAnimationId) : null;

    const loadedImage = useCharacterMasterStore(s => s.loadedImage);

    const addFramesToAnimation = useCharacterMasterStore(s => s.addFramesToAnimation);
    const removeFrameFromAnimation = useCharacterMasterStore(s => s.removeFrameFromAnimation);
    const reorderAnimationFrame = useCharacterMasterStore(s => s.reorderAnimationFrame);
    const updateFrameDuration = useCharacterMasterStore(s => s.updateFrameDuration);
    const play = useCharacterMasterStore(s => s.play);
    const pause = useCharacterMasterStore(s => s.pause);
    const stop = useCharacterMasterStore(s => s.stop);
    const nextFrame = useCharacterMasterStore(s => s.nextFrame);
    const prevFrame = useCharacterMasterStore(s => s.prevFrame);
    const setCurrentFrame = useCharacterMasterStore(s => s.setCurrentFrame);
    const tick = useCharacterMasterStore(s => s.tick);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const lastTickRef = useRef(0);
    const animationFrameRef = useRef<number>(0);

    // Animation loop for playback
    useEffect(() => {
        const animate = (timestamp: number) => {
            if (playback.isPlaying) {
                const delta = lastTickRef.current ? timestamp - lastTickRef.current : 16;
                tick(delta);
            }
            lastTickRef.current = timestamp;
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [playback.isPlaying, tick]);

    const handleAddFrames = useCallback(() => {
        if (!activeAnimationId || selection.frames.size === 0) return;
        const keys = Array.from(selection.frames);
        addFramesToAnimation(activeAnimationId, keys);
    }, [activeAnimationId, selection.frames, addFramesToAnimation]);

    const handleDragStart = useCallback((index: number) => {
        setDragIndex(index);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    }, []);

    const handleDrop = useCallback((index: number) => {
        if (dragIndex !== null && activeAnimationId && dragIndex !== index) {
            reorderAnimationFrame(activeAnimationId, dragIndex, index);
        }
        setDragIndex(null);
        setDragOverIndex(null);
    }, [dragIndex, activeAnimationId, reorderAnimationFrame]);

    const handleDurationChange = useCallback((index: number, duration: number) => {
        if (!activeAnimationId) return;
        updateFrameDuration(activeAnimationId, index, Math.max(10, duration));
    }, [activeAnimationId, updateFrameDuration]);

    if (!animation) {
        return (
            <div className={clsx("flex items-center justify-center p-8 text-zinc-500", className)}>
                <p className="text-sm">Create or select an animation to edit</p>
            </div>
        );
    }

    const totalDuration = animation.frames.reduce((sum, f) => sum + f.duration, 0);

    return (
        <div className={clsx("flex flex-col bg-zinc-800 border-t border-zinc-700", className)}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700/50">
                {/* Playback controls */}
                <div className="flex items-center gap-1 bg-zinc-700/50 rounded-lg p-1">
                    <Tooltip content="Previous Frame (←)">
                        <button
                            onClick={prevFrame}
                            disabled={animation.frames.length === 0}
                            className="p-1.5 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50"
                        >
                            <ChevronLeft size={16} className="text-zinc-300" />
                        </button>
                    </Tooltip>

                    {playback.isPlaying ? (
                        <Tooltip content="Pause (Enter)">
                            <button
                                onClick={pause}
                                className="p-1.5 hover:bg-zinc-600 rounded transition-colors"
                            >
                                <Pause size={16} className="text-amber-400" />
                            </button>
                        </Tooltip>
                    ) : (
                        <Tooltip content="Play Animation (Enter)">
                            <button
                                onClick={play}
                                disabled={animation.frames.length === 0}
                                className="p-1.5 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50"
                            >
                                <Play size={16} className="text-emerald-400" />
                            </button>
                        </Tooltip>
                    )}

                    <Tooltip content="Stop (Esc)">
                        <button
                            onClick={stop}
                            className="p-1.5 hover:bg-zinc-600 rounded transition-colors"
                        >
                            <Square size={14} className="text-zinc-400" />
                        </button>
                    </Tooltip>

                    <Tooltip content="Next Frame (→)">
                        <button
                            onClick={nextFrame}
                            disabled={animation.frames.length === 0}
                            className="p-1.5 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50"
                        >
                            <ChevronRight size={16} className="text-zinc-300" />
                        </button>
                    </Tooltip>
                </div>

                <div className="w-px h-6 bg-zinc-600" />

                {/* Add frames */}
                <Tooltip content={`Add ${selection.frames.size} selected frame(s) to animation`}>
                    <button
                        onClick={handleAddFrames}
                        disabled={selection.frames.size === 0}
                        className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm",
                            "bg-indigo-600/20 border border-indigo-500/30",
                            "hover:bg-indigo-600/30 text-indigo-300",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "transition-colors"
                        )}
                    >
                        <Plus size={14} />
                        Add Frames ({selection.frames.size})
                    </button>
                </Tooltip>

                <div className="flex-1" />

                {/* Animation info */}
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span>Frames: <strong className="text-zinc-200">{animation.frames.length}</strong></span>
                    <span>Duration: <strong className="text-zinc-200">{totalDuration}ms</strong></span>
                    <span>
                        Current: <strong className="text-indigo-400">{playback.currentFrameIndex + 1}</strong>
                    </span>
                </div>
            </div>

            {/* Timeline track */}
            <div className="flex-1 overflow-x-auto p-4">
                {animation.frames.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-zinc-500 border-2 border-dashed border-zinc-700 rounded-lg">
                        <p className="text-sm">Select frames and click "Add Frames" to build your animation</p>
                    </div>
                ) : (
                    <div className="flex gap-2 min-w-max">
                        {animation.frames.map((animFrame, index) => {

                            const frameData = frames.get(animFrame.frameId);
                            const isCurrentFrame = index === playback.currentFrameIndex;
                            const isDragging = dragIndex === index;
                            const isDragOver = dragOverIndex === index;

                            return (
                                <div
                                    key={`${animFrame.frameId}-${index}`}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={() => {
                                        setDragIndex(null);
                                        setDragOverIndex(null);
                                    }}
                                    onDrop={() => handleDrop(index)}
                                    onClick={() => setCurrentFrame(index)}
                                    className={clsx(
                                        "flex flex-col items-center gap-2 p-2 rounded-lg cursor-pointer",
                                        "border-2 transition-all duration-150",
                                        "hover:scale-105",
                                        isCurrentFrame
                                            ? "border-indigo-500 bg-indigo-500/20 shadow-lg shadow-indigo-500/20"
                                            : "border-zinc-600 bg-zinc-700/50 hover:border-zinc-500",
                                        isDragging && "opacity-50",
                                        isDragOver && "border-emerald-500"
                                    )}
                                >
                                    {/* Drag handle */}
                                    <div className="flex items-center gap-1 w-full">
                                        <GripVertical size={12} className="text-zinc-500 cursor-grab" />
                                        <span className="text-[10px] text-zinc-500">#{index + 1}</span>
                                        <div className="flex-1" />
                                        <Tooltip content="Remove frame">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFrameFromAnimation(activeAnimationId!, index);
                                                }}
                                                className="p-0.5 hover:bg-red-500/20 rounded transition-colors"
                                            >
                                                <Trash2 size={10} className="text-red-400" />
                                            </button>
                                        </Tooltip>
                                    </div>

                                    {/* Frame preview */}
                                    <div
                                        className={clsx(
                                            "w-16 h-16 rounded bg-zinc-800 border border-zinc-600",
                                            "relative overflow-hidden"
                                        )}
                                        style={{
                                            backgroundImage: 'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)',
                                            backgroundSize: '8px 8px',
                                            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
                                        }}
                                    >
                                        {frameData && loadedImage && (
                                            <div
                                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                                                style={{
                                                    width: frameData.width,
                                                    height: frameData.height,
                                                    backgroundImage: `url(${loadedImage.src})`,
                                                    backgroundPosition: `-${frameData.x}px -${frameData.y}px`,
                                                    imageRendering: 'pixelated',
                                                    // Scale down if too big for preview
                                                    transform: `scale(${Math.min(1, 60 / Math.max(frameData.width, frameData.height))})`
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* Duration input */}
                                    <Tooltip content={<DurationTooltipContent duration={animFrame.duration} />}>
                                        <div className="flex items-center gap-1">
                                            <Clock size={10} className="text-zinc-500" />
                                            <input
                                                type="number"
                                                value={animFrame.duration}
                                                onChange={(e) => handleDurationChange(index, parseInt(e.target.value) || 100)}
                                                onClick={(e) => e.stopPropagation()}
                                                className={clsx(
                                                    "w-14 px-1 py-0.5 text-[10px] text-center rounded",
                                                    "bg-zinc-800 border border-zinc-600",
                                                    "text-zinc-300 focus:outline-none focus:border-indigo-500"
                                                )}
                                            />
                                            <span className="text-[10px] text-zinc-500">ms</span>
                                        </div>
                                    </Tooltip>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
