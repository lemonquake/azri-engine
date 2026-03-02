/**
 * Tooltip Component - Descriptive hover tooltips with rich content
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';

export interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    delay?: number;
    className?: string;
    maxWidth?: number;
}

/**
 * Single tooltip element that follows the mouse
 */
export function Tooltip({
    content,
    children,
    position = 'auto',
    delay = 300,
    className,
    maxWidth = 280,
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [actualPosition, setActualPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<number | null>(null);

    const showTooltip = useCallback((e: React.MouseEvent) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
            setIsVisible(true);
            updatePosition(e);
        }, delay);
    }, [delay]);

    const hideTooltip = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsVisible(false);
    }, []);

    const updatePosition = useCallback((e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const tooltipHeight = 40; // Estimated
        const tooltipWidth = Math.min(maxWidth, 200);
        const padding = 8;

        let x = e.clientX;
        let y = e.clientY;
        let pos: 'top' | 'bottom' | 'left' | 'right' = 'top';

        if (position === 'auto') {
            // Determine best position based on viewport
            const viewportWidth = window.innerWidth;


            if (y - tooltipHeight - padding > 0) {
                pos = 'top';
                y = y - padding - 8;
            } else {
                pos = 'bottom';
                y = y + padding + 8;
            }

            // Clamp x to viewport
            x = Math.max(tooltipWidth / 2 + padding, Math.min(viewportWidth - tooltipWidth / 2 - padding, x));
        } else {
            pos = position;
        }

        setActualPosition(pos);
        setTooltipPosition({ x, y });
    }, [position, maxWidth]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="relative inline-flex"
            onMouseEnter={showTooltip}
            onMouseMove={updatePosition}
            onMouseLeave={hideTooltip}
        >
            {children}

            {isVisible && (
                <div
                    ref={tooltipRef}
                    className={clsx(
                        "fixed z-[9999] pointer-events-none",
                        "animate-in fade-in-0 zoom-in-95 duration-150",
                        className
                    )}
                    style={{
                        left: tooltipPosition.x,
                        top: tooltipPosition.y,
                        transform: actualPosition === 'top'
                            ? 'translate(-50%, -100%)'
                            : actualPosition === 'bottom'
                                ? 'translate(-50%, 0)'
                                : actualPosition === 'left'
                                    ? 'translate(-100%, -50%)'
                                    : 'translate(0, -50%)',
                        maxWidth,
                    }}
                >
                    <div className={clsx(
                        "bg-zinc-900/95 backdrop-blur-sm border border-zinc-600/50",
                        "rounded-lg px-3 py-2 shadow-xl shadow-black/30",
                        "text-sm text-zinc-100"
                    )}>
                        {content}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Styled tooltip content with icon
 */
interface TooltipContentProps {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    shortcut?: string;
    extra?: React.ReactNode;
}

export function TooltipContent({ icon, title, description, shortcut, extra }: TooltipContentProps) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                {icon && <span className="text-indigo-400">{icon}</span>}
                {title && <span className="font-semibold">{title}</span>}
                {shortcut && (
                    <span className="ml-auto text-xs text-zinc-400 bg-zinc-700/50 px-1.5 py-0.5 rounded">
                        {shortcut}
                    </span>
                )}
            </div>
            {description && (
                <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
            )}
            {extra}
        </div>
    );
}

/**
 * Frame info tooltip content
 */
interface FrameTooltipProps {
    row: number;
    col: number;
    x: number;
    y: number;
    width: number;
    height: number;
    index?: number;
}

export function FrameTooltipContent({ row, col, x, y, width, height, index }: FrameTooltipProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="font-semibold">
                    Frame ({row}, {col})
                </span>
                {index !== undefined && (
                    <span className="text-xs text-zinc-500">#{index}</span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-zinc-400">
                <span>Position:</span>
                <span className="text-zinc-300">{x}, {y}</span>
                <span>Size:</span>
                <span className="text-zinc-300">{width} × {height}px</span>
            </div>
        </div>
    );
}

/**
 * Scale tooltip content
 */
export function ScaleTooltipContent({ scale }: { scale: number }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Current scale:</span>
            <span className="font-mono font-semibold text-emerald-400">{scale.toFixed(2)}x</span>
        </div>
    );
}

/**
 * Duration tooltip content
 */
export function DurationTooltipContent({ duration, fps }: { duration: number; fps?: number }) {
    const calculatedFps = fps ?? Math.round(1000 / duration);
    return (
        <div className="flex items-center gap-3">
            <div>
                <span className="text-xs text-zinc-400">Duration: </span>
                <span className="font-mono text-amber-400">{duration}ms</span>
            </div>
            <div className="text-zinc-500">|</div>
            <div>
                <span className="text-xs text-zinc-400">~</span>
                <span className="font-mono text-emerald-400">{calculatedFps} FPS</span>
            </div>
        </div>
    );
}
