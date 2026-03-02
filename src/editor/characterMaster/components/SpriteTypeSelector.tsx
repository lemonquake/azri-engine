/**
 * SpriteTypeSelector - Component for selecting sprite sheet types
 */
import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
    User, Grid3X3, Layout, Package, Sparkles, Image, Settings,
    ChevronDown, Check, Info
} from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import { SPRITE_TYPE_PRESETS } from '../types';
import type { SpriteType } from '../types';
import { Tooltip } from './Tooltip';

// Icon mapping for sprite types
const ICONS: Record<string, React.ElementType> = {
    User,
    Grid3X3,
    Layout,
    Package,
    Sparkles,
    Image,
    Settings,
};

// Color mapping for sprite types
const TYPE_COLORS: Record<SpriteType, string> = {
    character: 'from-cyan-500 to-blue-500',
    tileset: 'from-yellow-500 to-orange-500',
    ui: 'from-orange-500 to-red-500',
    props: 'from-green-500 to-emerald-500',
    effects: 'from-purple-500 to-pink-500',
    icons: 'from-blue-500 to-indigo-500',
    custom: 'from-gray-500 to-zinc-500',
};

interface SpriteTypeSelectorProps {
    className?: string;
    compact?: boolean;
}

export function SpriteTypeSelector({ className, compact = false }: SpriteTypeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { getActiveSpriteSheet, updateSpriteSheet } = useCharacterMasterStore();

    const sheet = getActiveSpriteSheet();
    const currentType = sheet?.spriteType || 'character';
    const preset = SPRITE_TYPE_PRESETS[currentType];
    const IconComponent = ICONS[preset.icon] || Settings;

    const handleSelectType = (type: SpriteType) => {
        if (!sheet) return;

        const newPreset = SPRITE_TYPE_PRESETS[type];
        updateSpriteSheet(sheet.id, {
            spriteType: type,
            frameWidth: newPreset.defaultFrameSize.width,
            frameHeight: newPreset.defaultFrameSize.height,
            gridSettings: newPreset.gridSettings,
            columns: Math.max(1, Math.floor(sheet.imageWidth / newPreset.defaultFrameSize.width)),
            rows: Math.max(1, Math.floor(sheet.imageHeight / newPreset.defaultFrameSize.height)),
        });
        setIsOpen(false);
    };

    if (!sheet) {
        return (
            <div className={clsx("p-4 text-center", className)}>
                <p className="text-sm text-zinc-500 italic">Load a sprite sheet first</p>
            </div>
        );
    }

    if (compact) {
        return (
            <div className={clsx("relative", className)}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={clsx(
                        "flex items-center gap-2 px-3 py-2 rounded-lg w-full",
                        "bg-gradient-to-r",
                        TYPE_COLORS[currentType],
                        "text-white font-medium text-sm",
                        "hover:brightness-110 transition-all"
                    )}
                >
                    <IconComponent size={16} />
                    <span>{preset.name}</span>
                    <ChevronDown
                        size={14}
                        className={clsx("ml-auto transition-transform", isOpen && "rotate-180")}
                    />
                </button>

                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
                        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl overflow-hidden">
                            {Object.values(SPRITE_TYPE_PRESETS).map((p) => {
                                const TypeIcon = ICONS[p.icon] || Settings;
                                const isSelected = p.type === currentType;
                                return (
                                    <button
                                        key={p.type}
                                        onClick={() => handleSelectType(p.type)}
                                        className={clsx(
                                            "w-full flex items-center gap-3 px-3 py-2.5 text-left",
                                            "hover:bg-zinc-700/50 transition-colors",
                                            isSelected && "bg-zinc-700/30"
                                        )}
                                    >
                                        <div className={clsx(
                                            "w-6 h-6 rounded flex items-center justify-center",
                                            "bg-gradient-to-r",
                                            TYPE_COLORS[p.type]
                                        )}>
                                            <TypeIcon size={12} className="text-white" />
                                        </div>
                                        <span className="text-sm text-zinc-200">{p.name}</span>
                                        {isSelected && (
                                            <Check size={14} className="ml-auto text-emerald-400" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className={clsx("space-y-4", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
                    Sprite Type
                </h3>
                <Tooltip content={preset.animationHint}>
                    <button className="p-1 rounded hover:bg-zinc-700/50 transition-colors">
                        <Info size={14} className="text-zinc-500" />
                    </button>
                </Tooltip>
            </div>

            {/* Type grid */}
            <div className="grid grid-cols-2 gap-2">
                {Object.values(SPRITE_TYPE_PRESETS).map((p) => {
                    const TypeIcon = ICONS[p.icon] || Settings;
                    const isSelected = p.type === currentType;
                    return (
                        <Tooltip key={p.type} content={p.description}>
                            <button
                                onClick={() => handleSelectType(p.type)}
                                className={clsx(
                                    "flex flex-col items-center gap-2 p-3 rounded-lg",
                                    "border-2 transition-all duration-200",
                                    isSelected
                                        ? "border-indigo-500 bg-indigo-500/10"
                                        : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                                )}
                            >
                                <div className={clsx(
                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                    "bg-gradient-to-br shadow-lg",
                                    TYPE_COLORS[p.type]
                                )}>
                                    <TypeIcon size={20} className="text-white" />
                                </div>
                                <span className={clsx(
                                    "text-xs font-medium",
                                    isSelected ? "text-indigo-300" : "text-zinc-400"
                                )}>
                                    {p.name}
                                </span>
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            {/* Current type info */}
            <div className={clsx(
                "p-3 rounded-lg bg-gradient-to-r",
                TYPE_COLORS[currentType],
                "bg-opacity-10"
            )}>
                <div className="flex items-start gap-3">
                    <div className={clsx(
                        "w-8 h-8 rounded flex items-center justify-center shrink-0",
                        "bg-gradient-to-br shadow",
                        TYPE_COLORS[currentType]
                    )}>
                        <IconComponent size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{preset.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{preset.description}</p>
                    </div>
                </div>
            </div>

            {/* Quick size presets */}
            {preset.commonSizes.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        Common Sizes
                    </h4>
                    <div className="flex flex-wrap gap-1">
                        {preset.commonSizes.map((size) => {
                            const isActive = sheet.frameWidth === size.width && sheet.frameHeight === size.height;
                            return (
                                <button
                                    key={size.label}
                                    onClick={() => updateSpriteSheet(sheet.id, {
                                        frameWidth: size.width,
                                        frameHeight: size.height,
                                        columns: Math.max(1, Math.floor(sheet.imageWidth / size.width)),
                                        rows: Math.max(1, Math.floor(sheet.imageHeight / size.height)),
                                    })}
                                    className={clsx(
                                        "px-2 py-1 rounded text-xs font-medium",
                                        "border transition-colors",
                                        isActive
                                            ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                                            : "border-zinc-700 hover:border-zinc-600 text-zinc-400"
                                    )}
                                >
                                    {size.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Animation hint */}
            <div className="p-2 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <p className="text-xs text-zinc-500 italic flex items-start gap-2">
                    <Sparkles size={12} className="text-indigo-400 mt-0.5 shrink-0" />
                    <span>{preset.animationHint}</span>
                </p>
            </div>
        </div>
    );
}
