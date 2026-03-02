/**
 * LivePreviewOverlay - Floating, draggable preview window
 */
import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Move, Minus, Maximize2, X } from 'lucide-react';
import { AnimationPreview } from './AnimationPreview';

interface LivePreviewOverlayProps {
    onClose?: () => void;
    className?: string;
}

export function LivePreviewOverlay({ onClose, className }: LivePreviewOverlayProps) {
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isMinimized, setIsMinimized] = useState(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) {
            setIsDragging(true);
            setDragStart({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Global mouse up to catch drops outside the handle
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('mousemove', handleMouseMove as any);
        }
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove as any);
        };
    }, [isDragging]);

    return (
        <div
            className={clsx(
                "absolute z-50 rounded-lg shadow-xl border border-zinc-700 bg-zinc-900 overflow-hidden flex flex-col transition-all duration-200",
                isMinimized ? "w-48 h-auto" : "w-64 h-64",
                className
            )}
            style={{
                left: position.x,
                top: position.y,
            }}
        >
            {/* Drag Handle / Header */}
            <div
                className={clsx(
                    "flex items-center justify-between px-2 py-1.5 bg-zinc-800 cursor-move border-b border-zinc-700",
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <Move size={12} className="text-zinc-500" />
                    <span className="text-xs font-medium text-zinc-300">Live Preview</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-zinc-700 rounded text-zinc-400"
                    >
                        {isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-zinc-400"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {!isMinimized && (
                <div className="flex-1 relative bg-zinc-950">
                    <AnimationPreview className="w-full h-full" />
                </div>
            )}
        </div>
    );
}
