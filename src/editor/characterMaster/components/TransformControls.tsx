/**
 * TransformControls - Scale and transform adjustment panel
 */
import React, { useCallback } from 'react';
import { clsx } from 'clsx';
import {
    Maximize2, Move, RotateCcw, FlipHorizontal, FlipVertical,
    ZoomIn, Minus, Plus
} from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import { Tooltip, TooltipContent } from './Tooltip';

interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    formatValue?: (value: number) => string;
    icon?: React.ReactNode;
}

function Slider({ label, value, min, max, step, onChange, formatValue, icon }: SliderProps) {
    const displayValue = formatValue ? formatValue(value) : value.toString();
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {icon && <span className="text-zinc-400">{icon}</span>}
                    <span className="text-xs font-medium text-zinc-400">{label}</span>
                </div>
                <span className="text-sm font-mono text-zinc-200">{displayValue}</span>
            </div>
            <div className="relative">
                <input
                    type="range"
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className={clsx(
                        "w-full h-2 rounded-full appearance-none cursor-pointer",
                        "bg-zinc-700",
                        "[&::-webkit-slider-thumb]:appearance-none",
                        "[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                        "[&::-webkit-slider-thumb]:rounded-full",
                        "[&::-webkit-slider-thumb]:bg-indigo-500",
                        "[&::-webkit-slider-thumb]:hover:bg-indigo-400",
                        "[&::-webkit-slider-thumb]:transition-colors",
                        "[&::-webkit-slider-thumb]:shadow-lg",
                        "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-400"
                    )}
                    style={{
                        background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${percentage}%, #3f3f46 ${percentage}%, #3f3f46 100%)`
                    }}
                />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600">
                <span>{formatValue ? formatValue(min) : min}</span>
                <span>{formatValue ? formatValue(max) : max}</span>
            </div>
        </div>
    );
}

interface TransformControlsProps {
    className?: string;
}

export function TransformControls({ className }: TransformControlsProps) {
    const {
        transform,
        setTransform,
        resetTransform,
    } = useCharacterMasterStore();

    const handleScaleChange = useCallback((scale: number) => {
        setTransform({ scale });
    }, [setTransform]);

    const handleOffsetChange = useCallback((axis: 'offsetX' | 'offsetY', value: number) => {
        setTransform({ [axis]: value });
    }, [setTransform]);

    const toggleFlip = useCallback((axis: 'flipX' | 'flipY') => {
        setTransform({ [axis]: !transform[axis] });
    }, [transform, setTransform]);

    const presetScales = [0.5, 1, 2, 3, 4];

    return (
        <div className={clsx("flex flex-col gap-5", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Maximize2 size={14} className="text-indigo-400" />
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                        Transform
                    </span>
                </div>
                <Tooltip content="Reset all transform values to default">
                    <button
                        onClick={resetTransform}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                    >
                        <RotateCcw size={14} className="text-zinc-500" />
                    </button>
                </Tooltip>
            </div>

            {/* Scale slider */}
            <div className="space-y-3">
                <Slider
                    label="Scale"
                    value={transform.scale}
                    min={0.5}
                    max={4}
                    step={0.1}
                    onChange={handleScaleChange}
                    formatValue={(v) => `${v.toFixed(1)}x`}
                    icon={<ZoomIn size={14} />}
                />

                {/* Preset scale buttons */}
                <div className="flex gap-1.5">
                    {presetScales.map((scale) => (
                        <Tooltip key={scale} content={`Set scale to ${scale}x`}>
                            <button
                                onClick={() => handleScaleChange(scale)}
                                className={clsx(
                                    "flex-1 py-1.5 text-xs font-medium rounded",
                                    "transition-all duration-150",
                                    transform.scale === scale
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                        : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50 hover:text-zinc-200"
                                )}
                            >
                                {scale}x
                            </button>
                        </Tooltip>
                    ))}
                </div>
            </div>

            {/* Offset controls */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Move size={14} className="text-zinc-400" />
                    <span className="text-xs font-medium text-zinc-400">Offset</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase">X</label>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => handleOffsetChange('offsetX', transform.offsetX - 10)}
                                className="p-1 bg-zinc-700/50 hover:bg-zinc-600/50 rounded transition-colors"
                            >
                                <Minus size={12} className="text-zinc-400" />
                            </button>
                            <input
                                type="number"
                                value={transform.offsetX}
                                onChange={(e) => handleOffsetChange('offsetX', parseInt(e.target.value) || 0)}
                                className={clsx(
                                    "flex-1 px-2 py-1 text-sm text-center rounded",
                                    "bg-zinc-700/50 border border-zinc-600",
                                    "text-zinc-100 focus:outline-none focus:border-indigo-500"
                                )}
                            />
                            <button
                                onClick={() => handleOffsetChange('offsetX', transform.offsetX + 10)}
                                className="p-1 bg-zinc-700/50 hover:bg-zinc-600/50 rounded transition-colors"
                            >
                                <Plus size={12} className="text-zinc-400" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase">Y</label>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => handleOffsetChange('offsetY', transform.offsetY - 10)}
                                className="p-1 bg-zinc-700/50 hover:bg-zinc-600/50 rounded transition-colors"
                            >
                                <Minus size={12} className="text-zinc-400" />
                            </button>
                            <input
                                type="number"
                                value={transform.offsetY}
                                onChange={(e) => handleOffsetChange('offsetY', parseInt(e.target.value) || 0)}
                                className={clsx(
                                    "flex-1 px-2 py-1 text-sm text-center rounded",
                                    "bg-zinc-700/50 border border-zinc-600",
                                    "text-zinc-100 focus:outline-none focus:border-indigo-500"
                                )}
                            />
                            <button
                                onClick={() => handleOffsetChange('offsetY', transform.offsetY + 10)}
                                className="p-1 bg-zinc-700/50 hover:bg-zinc-600/50 rounded transition-colors"
                            >
                                <Plus size={12} className="text-zinc-400" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Flip controls */}
            <div className="space-y-2">
                <span className="text-xs font-medium text-zinc-400">Flip</span>
                <div className="flex gap-2">
                    <Tooltip
                        content={
                            <TooltipContent
                                icon={<FlipHorizontal size={14} />}
                                title="Flip Horizontal"
                                description="Mirror the sprite along the vertical axis"
                            />
                        }
                    >
                        <button
                            onClick={() => toggleFlip('flipX')}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg",
                                "transition-all duration-150",
                                transform.flipX
                                    ? "bg-indigo-600 text-white"
                                    : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50 hover:text-zinc-200"
                            )}
                        >
                            <FlipHorizontal size={16} />
                            <span className="text-xs font-medium">Horizontal</span>
                        </button>
                    </Tooltip>

                    <Tooltip
                        content={
                            <TooltipContent
                                icon={<FlipVertical size={14} />}
                                title="Flip Vertical"
                                description="Mirror the sprite along the horizontal axis"
                            />
                        }
                    >
                        <button
                            onClick={() => toggleFlip('flipY')}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg",
                                "transition-all duration-150",
                                transform.flipY
                                    ? "bg-indigo-600 text-white"
                                    : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50 hover:text-zinc-200"
                            )}
                        >
                            <FlipVertical size={16} />
                            <span className="text-xs font-medium">Vertical</span>
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Current values summary */}
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-zinc-500">Scale:</div>
                    <div className="text-zinc-300 font-mono">{transform.scale.toFixed(1)}x</div>
                    <div className="text-zinc-500">Offset:</div>
                    <div className="text-zinc-300 font-mono">({transform.offsetX}, {transform.offsetY})</div>
                    <div className="text-zinc-500">Flip:</div>
                    <div className="text-zinc-300">
                        {transform.flipX || transform.flipY
                            ? [transform.flipX && 'H', transform.flipY && 'V'].filter(Boolean).join(', ')
                            : 'None'}
                    </div>
                </div>
            </div>
        </div>
    );
}
