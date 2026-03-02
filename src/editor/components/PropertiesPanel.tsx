import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { RotateCw, Move, Maximize2, RefreshCw, Grid, Image as ImageIcon, Layers, Zap, Ghost, Tag, Box, Activity, User, Sparkles, Shield, Trash2, Lock, Unlock, Eye, EyeOff, ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine, FlipHorizontal, FlipVertical, LayoutTemplate, Type, Wand2, Skull } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import type { TileDefinition, Tilesheet, Tile, TileBehaviorType, CollisionShape } from '../types';
import { DEFAULT_BEHAVIORS } from '../types';
import ImportTextureModal from './ImportTextureModal';
import { SavePrefabModal } from './SavePrefabModal';
import { PrefabPalette } from './PrefabPalette';
import { ImageEditorModal } from './ImageEditorModal';

import { TilesheetPicker } from './TilesheetPicker';
import characterRepo from '../db/repositories/CharacterRepository';
import { LayersPanel } from './LayersPanel';
import { SkyboxPanel } from './SkyboxPanel';

interface SliderInputProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (value: number) => void;
}

function SliderInput({ label, value, min, max, step, unit = '', onChange }: SliderInputProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">{label}</span>
                <span className="text-xs text-zinc-300 font-mono">{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>
    );
}

interface TileButtonProps {
    tile: TileDefinition;
    isSelected: boolean;
    onClick: () => void;
}

function TileButton({ tile, isSelected, onClick }: TileButtonProps) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "w-10 h-10 rounded-lg border-2 transition-all hover:scale-105",
                isSelected
                    ? "border-indigo-500 shadow-lg shadow-indigo-500/30"
                    : "border-zinc-600 hover:border-zinc-500"
            )}
            style={{
                backgroundColor: tile.textureSrc ? 'transparent' : tile.color,
                backgroundImage: tile.textureSrc ? `url(${tile.textureSrc})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: tile.srcX !== undefined
                    ? `-${tile.srcX}px -${tile.srcY}px`
                    : 'center'
            }}
            title={tile.name}
        >
            {tile.srcX !== undefined && tile.textureSrc && (
                <div
                    className="w-full h-full rounded-md"
                    style={{
                        backgroundImage: `url(${tile.textureSrc})`,
                        backgroundPosition: `-${tile.srcX}px -${tile.srcY}px`,
                    }}
                />
            )}
        </button>
    );
}

function InspectorPanel() {
    const {
        getSelectedTiles,
        updateTiles,
        selectedTileType,
        setSelectedTileType,
        availableTiles,
        importedTilesheets,
        showCollisions,
        toggleCollisions,
        selectedCharacterIds,
        characters,
        updateCharacterInstance,
        // Collision
        collisionShapes,
        selectedCollisionIds,
        updateCollisionShape,
        removeCollisionShapes,
        // Level Images
        levelImages,
        selectedImageIds,
        updateLevelImage,
        removeLevelImage,
        bringToFront,
        sendToBack,
        stepForward,
        stepBackward,
        physicsSettings,
        setPhysicsSettings,
    } = useEditorStore();

    const [showImportTexture, setShowImportTexture] = useState(false);
    const [showImportTilesheet, setShowImportTilesheet] = useState(false);
    const [showSavePrefab, setShowSavePrefab] = useState(false);
    const [paletteTab, setPaletteTab] = useState<'tiles' | 'prefabs'>('tiles');
    const [editingImageId, setEditingImageId] = useState<string | null>(null);

    const selectedTiles = getSelectedTiles();
    const hasSelection = selectedTiles.length > 0;

    // Get common values for multi-selection
    const getCommonValue = <T,>(getter: (tile: Tile) => T): T | 'mixed' => {
        if (selectedTiles.length === 0) return 'mixed';
        const first = getter(selectedTiles[0]);
        const allSame = selectedTiles.every((t: Tile) => getter(t) === first);
        return allSame ? first : 'mixed';
    };

    const commonScaleX = getCommonValue(t => t.scaleX);
    const commonScaleY = getCommonValue(t => t.scaleY);
    const commonRotation = getCommonValue(t => t.rotation);
    const commonSprite = getCommonValue(t => t.spriteId);

    // New properties
    const commonCollision = getCommonValue(t => t.hasCollision);
    const commonOpacity = getCommonValue(t => t.opacity);
    const commonGlowLegacy = getCommonValue(t => t.glowColor);
    const commonGlow = getCommonValue(t => t.glow);
    const commonFriction = getCommonValue(t => t.physics?.friction);
    const commonBounciness = getCommonValue(t => t.physics?.bounciness);
    const commonTag = getCommonValue(t => t.tag);
    const commonBehaviorType = getCommonValue(t => t.behavior?.type);
    const commonBehavior2Type = getCommonValue(t => t.behavior2?.type);

    // Text Properties
    const commonText = getCommonValue(t => t.text);
    const commonFontFamily = getCommonValue(t => t.fontFamily);
    const commonFontSize = getCommonValue(t => t.fontSize);
    const commonFontColor = getCommonValue(t => t.fontColor);

    const handlePropertyChange = (property: keyof Tile, value: any) => {
        // Save for undo
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: { [property]: value },
        }));
        updateTiles(updates);
    };

    const handlePhysicsChange = (subProp: 'friction' | 'bounciness', value: number) => {
        // Save for undo
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: {
                physics: {
                    ...(tile.physics || { friction: 0, bounciness: 0 }),
                    [subProp]: value
                }
            },
        }));
        updateTiles(updates);
    };

    const handleBehaviorTypeChange = (behaviorKey: 'behavior' | 'behavior2', behaviorType: string) => {
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const behavior = behaviorType === 'none' ? undefined : { ...DEFAULT_BEHAVIORS[behaviorType as TileBehaviorType] };
        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: { [behaviorKey]: behavior },
        }));
        updateTiles(updates);
    };

    const handleBehaviorPropChange = (behaviorKey: 'behavior' | 'behavior2', prop: string, value: any) => {
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: {
                [behaviorKey]: tile[behaviorKey] ? { ...tile[behaviorKey]!, [prop]: value } : undefined
            },
        }));
        updateTiles(updates);
    };

    const handleGlowToggle = (enabled: boolean) => {
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: {
                glow: enabled ? { intensity: 15, style: 'solid', color: '#ffffff', speed: 1, colors: ['#ffffff', '#000000'] } as import('../types').TileGlow : undefined,
                glowColor: undefined
            },
        }));
        updateTiles(updates);
    };

    const handleGlowPropChange = (prop: string, value: any) => {
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: {
                glow: {
                    ...(tile.glow || { intensity: 15, style: 'solid', color: '#ffffff', speed: 1, colors: ['#ffffff', '#000000'] }),
                    [prop]: value
                } as import('../types').TileGlow
            },
        }));
        updateTiles(updates);
    };

    const handleReplaceTile = (newTileDef: TileDefinition) => {
        // Save for undo
        const state = useEditorStore.getState();
        state.pushHistoryState();

        const updates = selectedTiles.map((tile: Tile) => ({
            id: tile.id,
            changes: { spriteId: newTileDef.id },
        }));
        updateTiles(updates);
    };

    // Resolve Character
    // For now, if multiple are selected, just pick the first one or show "Multiple"
    // To match previous behavior of single select editor, let's only show if exactly one is selected.
    const selectedCharIdsArray = Array.from(selectedCharacterIds);
    const singleSelectedCharId = selectedCharIdsArray.length === 1 ? selectedCharIdsArray[0] : null;
    const selectedCharacter = singleSelectedCharId ? characters.get(singleSelectedCharId) : null;


    const renderBehaviorSection = (behaviorKey: 'behavior' | 'behavior2', commonType: string | undefined) => {
        return (
            <div className="flex flex-col">
                <div className="pt-3 border-t border-zinc-800 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={12} className="text-amber-400" />
                        <span className="text-[10px] text-amber-400 uppercase font-semibold">Tile Behavior</span>
                    </div>

                    {/* Behavior Type Selector */}
                    <select
                        value={typeof commonType === 'string' ? commonType : 'none'}
                        onChange={(e) => handleBehaviorTypeChange(behaviorKey, e.target.value)}
                        className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-amber-500 mb-3 cursor-pointer"
                    >
                        <option value="none">None</option>
                        {behaviorKey === 'behavior' ? (
                            <>
                                <option value="floating">🌊 Floating</option>
                                <option value="dead">💀 Dead</option>
                                <option value="bouncy">🏀 Bouncy</option>
                                <option value="slippery">❄️ Slippery</option>
                            </>
                        ) : (
                            <>
                                <option value="moving">🔄 Moving</option>
                                <option value="transitioning">🔄 Transitioning</option>
                                <option value="chaos">🌀 Chaos</option>
                            </>
                        )}
                    </select>

                    {/* ─── Moving Config ─── */}
                    {commonType === 'moving' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').MovingBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-3 pl-1 border-l-2 border-amber-500/30 ml-1">
                                <div className="pl-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] text-zinc-500 uppercase">Axis</span>
                                        <div className="flex gap-1">
                                            {(['horizontal', 'vertical'] as const).map(axis => (
                                                <button
                                                    key={axis}
                                                    onClick={() => handleBehaviorPropChange(behaviorKey, 'axis', axis)}
                                                    className={clsx(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                                        b.axis === axis ? "bg-amber-500/20 text-amber-300" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                                    )}
                                                >
                                                    {axis === 'horizontal' ? '↔ H' : '↕ V'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] text-zinc-500 uppercase">Initial Direction</span>
                                        <div className="flex gap-1">
                                            {([1, -1] as const).map(dir => (
                                                <button
                                                    key={dir}
                                                    onClick={() => handleBehaviorPropChange(behaviorKey, 'initialDirection', dir)}
                                                    className={clsx(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                                        (b.initialDirection ?? 1) === dir ? "bg-amber-500/20 text-amber-300" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                                    )}
                                                >
                                                    {dir === 1 ? (b.axis === 'horizontal' ? 'East (Right)' : 'South (Down)') : (b.axis === 'horizontal' ? 'West (Left)' : 'North (Up)')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <SliderInput label="Distance" value={b.distance} min={1} max={20} step={1} unit=" cells" onChange={v => handleBehaviorPropChange(behaviorKey, 'distance', v)} />
                                    <SliderInput label="Speed" value={b.speed} min={10} max={500} step={10} unit=" px/s" onChange={v => handleBehaviorPropChange(behaviorKey, 'speed', v)} />
                                    <SliderInput label="Speed Multiplier" value={b.speedMultiplier} min={0.1} max={5} step={0.1} unit="x" onChange={v => handleBehaviorPropChange(behaviorKey, 'speedMultiplier', v)} />
                                    <div className="flex flex-col gap-2 mt-2">
                                        {[
                                            { key: 'pingPong', label: 'Ping-Pong' },
                                            { key: 'speedUpOnPlayer', label: 'Speed Up On Player' },
                                            { key: 'slowDownOnPlayer', label: 'Slow Down On Player' },
                                        ].map(({ key, label }) => (
                                            <div key={key} className="flex items-center justify-between">
                                                <span className="text-[10px] text-zinc-500">{label}</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={(b as any)[key] === true}
                                                        onChange={e => handleBehaviorPropChange(behaviorKey, key, e.target.checked)}
                                                    />
                                                    <div className="w-8 h-4 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500" />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Floating Config ─── */}
                    {commonType === 'floating' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').FloatingBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-2 pl-1 border-l-2 border-cyan-500/30 ml-1">
                                <div className="pl-2">
                                    <SliderInput label="Tilt Amount" value={b.tiltAmount} min={0} max={30} step={1} unit="°" onChange={v => handleBehaviorPropChange(behaviorKey, 'tiltAmount', v)} />
                                    <SliderInput label="Sink Speed" value={b.sinkSpeed} min={5} max={200} step={5} unit=" px/s" onChange={v => handleBehaviorPropChange(behaviorKey, 'sinkSpeed', v)} />
                                    <SliderInput label="Recover Speed" value={b.recoverSpeed} min={5} max={200} step={5} unit=" px/s" onChange={v => handleBehaviorPropChange(behaviorKey, 'recoverSpeed', v)} />
                                    <SliderInput label="Max Sink" value={b.maxSink} min={2} max={64} step={2} unit=" px" onChange={v => handleBehaviorPropChange(behaviorKey, 'maxSink', v)} />
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Dead Config ─── */}
                    {commonType === 'dead' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').DeadBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-2 pl-1 border-l-2 border-red-500/30 ml-1">
                                <div className="pl-2">
                                    <SliderInput label="Delay" value={b.delay} min={0} max={5} step={0.1} unit="s" onChange={v => handleBehaviorPropChange(behaviorKey, 'delay', v)} />
                                    <SliderInput label="Fall Speed" value={b.fallSpeed} min={100} max={2000} step={50} unit=" px/s²" onChange={v => handleBehaviorPropChange(behaviorKey, 'fallSpeed', v)} />
                                    <div className="flex items-center justify-between mt-2">
                                        <span className="text-[10px] text-zinc-500">Shake Before Fall</span>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={b.shake === true}
                                                onChange={e => handleBehaviorPropChange(behaviorKey, 'shake', e.target.checked)}
                                            />
                                            <div className="w-8 h-4 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-500" />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Bouncy Config ─── */}
                    {commonType === 'bouncy' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').BouncyBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-2 pl-1 border-l-2 border-green-500/30 ml-1">
                                <div className="pl-2">
                                    <SliderInput label="Bounce Force" value={b.force} min={100} max={2000} step={50} unit=" px/s" onChange={v => handleBehaviorPropChange(behaviorKey, 'force', v)} />
                                    <SliderInput label="Cooldown" value={b.cooldown} min={0} max={2} step={0.05} unit="s" onChange={v => handleBehaviorPropChange(behaviorKey, 'cooldown', v)} />
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Slippery Config ─── */}
                    {commonType === 'slippery' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').SlipperyBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-2 pl-1 border-l-2 border-blue-400/30 ml-1">
                                <div className="pl-2">
                                    <SliderInput label="Friction" value={b.friction} min={0} max={1} step={0.01} onChange={v => handleBehaviorPropChange(behaviorKey, 'friction', v)} />
                                    <SliderInput label="Acceleration" value={b.acceleration} min={10} max={500} step={10} unit=" px/s²" onChange={v => handleBehaviorPropChange(behaviorKey, 'acceleration', v)} />
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Transitioning Config ─── */}
                    {commonType === 'transitioning' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').TransitioningBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-3 pl-1 border-l-2 border-indigo-500/30 ml-1">
                                <div className="pl-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] text-zinc-500 uppercase">Initial Axis</span>
                                        <div className="flex gap-1">
                                            {(['horizontal', 'vertical'] as const).map(axis => (
                                                <button
                                                    key={axis}
                                                    onClick={() => handleBehaviorPropChange(behaviorKey, 'axis', axis)}
                                                    className={clsx(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                                        b.axis === axis ? "bg-indigo-500/20 text-indigo-300" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                                    )}
                                                >
                                                    {axis === 'horizontal' ? '↔ H' : '↕ V'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] text-zinc-500 uppercase">Initial Direction</span>
                                        <div className="flex gap-1">
                                            {([1, -1] as const).map(dir => (
                                                <button
                                                    key={dir}
                                                    onClick={() => handleBehaviorPropChange(behaviorKey, 'initialDirection', dir)}
                                                    className={clsx(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                                        (b.initialDirection ?? 1) === dir ? "bg-indigo-500/20 text-indigo-300" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                                    )}
                                                >
                                                    {dir === 1 ? (b.axis === 'horizontal' ? 'East (Right)' : 'South (Down)') : (b.axis === 'horizontal' ? 'West (Left)' : 'North (Up)')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <SliderInput label="Distance" value={b.distance} min={1} max={20} step={1} unit=" cells" onChange={v => handleBehaviorPropChange(behaviorKey, 'distance', v)} />
                                    <SliderInput label="Speed" value={b.speed} min={10} max={500} step={10} unit=" px/s" onChange={v => handleBehaviorPropChange(behaviorKey, 'speed', v)} />
                                    <SliderInput label="Delay" value={b.delay} min={0} max={5} step={0.1} unit="s" onChange={v => handleBehaviorPropChange(behaviorKey, 'delay', v)} />
                                    <div className="flex flex-col gap-2 mt-2">
                                        {[
                                            { key: 'pingPong', label: 'Ping-Pong' },
                                        ].map(({ key, label }) => (
                                            <div key={key} className="flex items-center justify-between">
                                                <span className="text-[10px] text-zinc-500">{label}</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={(b as any)[key] === true}
                                                        onChange={e => handleBehaviorPropChange(behaviorKey, key, e.target.checked)}
                                                    />
                                                    <div className="w-8 h-4 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500" />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Chaos Config ─── */}
                    {commonType === 'chaos' && (() => {
                        const b = selectedTiles[0]?.[behaviorKey] as import('../types').ChaosBehavior | undefined;
                        if (!b) return null;
                        return (
                            <div className="space-y-2 pl-1 border-l-2 border-fuchsia-500/30 ml-1">
                                <div className="pl-2">
                                    <SliderInput label="Speed" value={b.speed} min={10} max={500} step={10} unit=" px/s" onChange={v => handleBehaviorPropChange(behaviorKey, 'speed', v)} />
                                    <SliderInput label="Max Distance" value={b.maxDistance} min={1} max={10} step={1} unit=" cells" onChange={v => handleBehaviorPropChange(behaviorKey, 'maxDistance', v)} />
                                    <SliderInput label="Erraticness" value={b.erraticness} min={1} max={10} step={1} unit="" onChange={v => handleBehaviorPropChange(behaviorKey, 'erraticness', v)} />
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        );
    };

    // ─── Level Image Inspector ───
    const selectedImages = levelImages.filter(img => selectedImageIds.has(img.id));

    if (selectedImages.length > 0) {
        const singleImage = selectedImages.length === 1 ? selectedImages[0] : null;
        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                        <ImageIcon size={14} />
                        Level Image
                    </span>
                    <div className="flex items-center gap-1">
                        {singleImage && (
                            <>
                                <button
                                    onClick={() => updateLevelImage(singleImage.id, { visible: !singleImage.visible })}
                                    className={clsx(
                                        "p-1.5 rounded transition-colors",
                                        singleImage.visible ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                                    )}
                                    title={singleImage.visible ? "Hide" : "Show"}
                                >
                                    {singleImage.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                                <button
                                    onClick={() => updateLevelImage(singleImage.id, { locked: !singleImage.locked })}
                                    className={clsx(
                                        "p-1.5 rounded transition-colors",
                                        singleImage.locked ? "text-orange-400 hover:text-orange-300" : "text-zinc-600 hover:text-zinc-400"
                                    )}
                                    title={singleImage.locked ? "Unlock" : "Lock"}
                                >
                                    {singleImage.locked ? <Lock size={14} /> : <Unlock size={14} />}
                                </button>
                                <div className="w-px h-4 bg-zinc-700 mx-1" />
                            </>
                        )}
                        <button
                            onClick={() => selectedImages.forEach(img => removeLevelImage(img.id))}
                            className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete selected images"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                <div className="p-4 overflow-y-auto">
                    {singleImage ? (
                        <div className="space-y-6">

                            <button
                                onClick={() => setEditingImageId(singleImage.id)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors shadow-lg shadow-indigo-500/20"
                            >
                                <Wand2 size={16} />
                                REMOVE BG
                            </button>

                            {/* Transform Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Move size={12} className="text-zinc-500" />
                                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Transform</span>
                                    </div>
                                    <button
                                        onClick={() => updateLevelImage(singleImage.id, { rotation: 0, flipX: false, flipY: false })}
                                        className="text-[10px] text-zinc-600 hover:text-zinc-400"
                                        title="Reset Transform"
                                    >
                                        <RefreshCw size={10} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">X</span>
                                        <input
                                            type="number"
                                            value={Math.round(singleImage.x)}
                                            onChange={(e) => updateLevelImage(singleImage.id, { x: parseFloat(e.target.value) || 0 })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">Y</span>
                                        <input
                                            type="number"
                                            value={Math.round(singleImage.y)}
                                            onChange={(e) => updateLevelImage(singleImage.id, { y: parseFloat(e.target.value) || 0 })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">Width</span>
                                        <input
                                            type="number"
                                            value={Math.round(singleImage.width)}
                                            onChange={(e) => updateLevelImage(singleImage.id, { width: Math.max(1, parseFloat(e.target.value) || 1) })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">Height</span>
                                        <input
                                            type="number"
                                            value={Math.round(singleImage.height)}
                                            onChange={(e) => updateLevelImage(singleImage.id, { height: Math.max(1, parseFloat(e.target.value) || 1) })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>
                                </div>

                                <SliderInput
                                    label="Rotation"
                                    value={singleImage.rotation || 0}
                                    min={0}
                                    max={360}
                                    step={1}
                                    unit="°"
                                    onChange={(v) => updateLevelImage(singleImage.id, { rotation: v })}
                                />

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => updateLevelImage(singleImage.id, { flipX: !singleImage.flipX })}
                                        className={clsx(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-xs border transition-colors",
                                            singleImage.flipX
                                                ? "bg-purple-500/20 border-purple-500 text-purple-300"
                                                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                        )}
                                    >
                                        <FlipHorizontal size={14} /> Flip X
                                    </button>
                                    <button
                                        onClick={() => updateLevelImage(singleImage.id, { flipY: !singleImage.flipY })}
                                        className={clsx(
                                            "flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-xs border transition-colors",
                                            singleImage.flipY
                                                ? "bg-purple-500/20 border-purple-500 text-purple-300"
                                                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                        )}
                                    >
                                        <FlipVertical size={14} /> Flip Y
                                    </button>
                                </div>
                            </div>

                            {/* Appearance Section */}
                            <div className="space-y-4 pt-4 border-t border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={12} className="text-zinc-500" />
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Appearance</span>
                                </div>

                                <SliderInput
                                    label="Opacity"
                                    value={singleImage.opacity ?? 1}
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    onChange={(v) => updateLevelImage(singleImage.id, { opacity: v })}
                                />

                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-zinc-400">Tint Color</span>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            value={singleImage.tint || "#ffffff"}
                                            onChange={(e) => updateLevelImage(singleImage.id, { tint: e.target.value })}
                                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-none appearance-none p-0"
                                        />
                                        <div className="flex-1 flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={singleImage.tint || ""}
                                                placeholder="None"
                                                onChange={(e) => updateLevelImage(singleImage.id, { tint: e.target.value })}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
                                            />
                                            {singleImage.tint && (
                                                <button
                                                    onClick={() => updateLevelImage(singleImage.id, { tint: undefined })}
                                                    className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500"
                                                    title="Clear Tint"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Arrangement Section */}
                            <div className="space-y-4 pt-4 border-t border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <Layers size={12} className="text-zinc-500" />
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Arrangement</span>
                                </div>
                                <div className="grid grid-cols-4 gap-1">
                                    <button onClick={bringToFront} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 flex justify-center" title="Bring to Front">
                                        <ArrowUpToLine size={16} />
                                    </button>
                                    <button onClick={stepForward} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 flex justify-center" title="Bring Forward">
                                        <ArrowUp size={16} />
                                    </button>
                                    <button onClick={stepBackward} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 flex justify-center" title="Send Backward">
                                        <ArrowDown size={16} />
                                    </button>
                                    <button onClick={sendToBack} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 flex justify-center" title="Send to Back">
                                        <ArrowDownToLine size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-sm text-zinc-500">
                            {selectedImages.length} Level Images Selected
                        </div>
                    )}
                </div>

                {editingImageId && (
                    <ImageEditorModal
                        src={levelImages.find(i => i.id === editingImageId)?.src || ''}
                        onClose={() => setEditingImageId(null)}
                        onSave={(newSrc) => {
                            if (editingImageId) {
                                updateLevelImage(editingImageId, { src: newSrc });
                            }
                            setEditingImageId(null);
                        }}
                    />
                )}
            </div>
        );
    }

    // ─── Collision Shape Inspector ───
    const selectedCollisionArray = Array.from(selectedCollisionIds).map(id => collisionShapes.get(id)).filter(Boolean) as CollisionShape[];

    if (selectedCollisionArray.length > 0) {
        const singleShape = selectedCollisionArray.length === 1 ? selectedCollisionArray[0] : null;
        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                        <Shield size={14} />
                        Collision Shape
                    </span>
                    <button
                        onClick={() => removeCollisionShapes(Array.from(selectedCollisionIds))}
                        className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete selected collision shapes"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>

                <div className="p-4">
                    {singleShape ? (
                        <div className="space-y-4">
                            {/* Type Badge */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">Type</span>
                                <span className="text-xs font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">
                                    {singleShape.type}
                                </span>
                            </div>

                            {/* Position */}
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Move size={12} className="text-zinc-500" />
                                    <span className="text-[10px] text-zinc-500 uppercase">Position</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">X</span>
                                        <input
                                            type="number"
                                            value={Math.round(singleShape.x)}
                                            onChange={(e) => updateCollisionShape(singleShape.id, { x: parseFloat(e.target.value) || 0 })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">Y</span>
                                        <input
                                            type="number"
                                            value={Math.round(singleShape.y)}
                                            onChange={(e) => updateCollisionShape(singleShape.id, { y: parseFloat(e.target.value) || 0 })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Size (box only) */}
                            {singleShape.type === 'box' && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Maximize2 size={12} className="text-zinc-500" />
                                        <span className="text-[10px] text-zinc-500 uppercase">Dimensions</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-zinc-400">Width</span>
                                            <input
                                                type="number"
                                                value={Math.round(singleShape.width)}
                                                onChange={(e) => updateCollisionShape(singleShape.id, { width: Math.max(1, parseFloat(e.target.value) || 1) })}
                                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-zinc-400">Height</span>
                                            <input
                                                type="number"
                                                value={Math.round(singleShape.height)}
                                                onChange={(e) => updateCollisionShape(singleShape.id, { height: Math.max(1, parseFloat(e.target.value) || 1) })}
                                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Radius (circle only) */}
                            {singleShape.type === 'circle' && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-zinc-400">Radius</span>
                                    <input
                                        type="number"
                                        value={Math.round(singleShape.radius)}
                                        onChange={(e) => updateCollisionShape(singleShape.id, { radius: Math.max(1, parseFloat(e.target.value) || 1) })}
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                            )}

                            {/* Polygon vertex count (read-only) */}
                            {singleShape.type === 'polygon' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500">Vertices</span>
                                    <span className="text-xs font-mono text-zinc-300">{singleShape.vertices.length}</span>
                                </div>
                            )}

                            {/* Rotation */}
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <RotateCw size={12} className="text-zinc-500" />
                                    <span className="text-[10px] text-zinc-500 uppercase">Rotation</span>
                                </div>
                                <SliderInput
                                    label="Angle"
                                    value={singleShape.rotation}
                                    min={0}
                                    max={360}
                                    step={5}
                                    unit="°"
                                    onChange={(v) => updateCollisionShape(singleShape.id, { rotation: v })}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-sm text-zinc-500">
                            {selectedCollisionArray.length} Collision Shapes Selected
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (selectedCharacterIds.size > 1) {
        const allDefs = characterRepo.getAll();
        const selectedChars = Array.from(selectedCharacterIds).map(id => characters.get(id)).filter(Boolean);
        const commonParentId = selectedChars.length > 0 && selectedChars.every(c => c!.characterId === selectedChars[0]!.characterId) ? selectedChars[0]!.characterId : '';

        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Character Properties</span>
                </div>
                <div className="p-4 text-center text-sm text-zinc-500 border-b border-zinc-700">
                    {selectedCharacterIds.size} Characters Selected
                </div>

                <div className="p-4 border-b border-zinc-700">
                    <div className="flex items-center gap-2 mb-4">
                        <User size={14} className="text-zinc-400" />
                        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Base Character</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <select
                            value={commonParentId}
                            onChange={(e) => {
                                const newId = e.target.value;
                                if (newId) {
                                    selectedChars.forEach(char => {
                                        updateCharacterInstance(char!.id, { characterId: newId });
                                    });
                                }
                            }}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="" disabled>--- Mixed Values ---</option>
                            <option value="default">Default Character</option>
                            {allDefs.map(def => (
                                <option key={def.id} value={def.id}>
                                    {def.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="p-4 text-center text-sm text-zinc-500">
                    <span className="text-xs opacity-50">More multi-editing properties coming soon</span>
                </div>
            </div>
        );
    }

    if (selectedCharacter) {
        // We'll fetch def here inside render (safe for sync localstorage repo)
        let def = characterRepo.getById(selectedCharacter.characterId);
        if (!def && selectedCharacter.characterId === 'default') {
            def = {
                id: 'default',
                name: 'Default Character',
                metadata: JSON.stringify({
                    hasCollision: true,
                    hasGravity: true,
                    npcType: 'idle',
                    health: 100,
                    mana: 0,
                    isEnemy: false
                }),
                created_at: 0,
                updated_at: 0
            };
        }
        const props = def ? JSON.parse(def.metadata) : {};

        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Character Properties</span>
                </div>

                <div className="p-4 border-b border-zinc-700">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded bg-violet-500 flex items-center justify-center text-white font-bold">
                            {def?.name.charAt(0) || '?'}
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-bold text-white leading-tight">{def?.name || 'Unknown'}</div>
                            <div className="text-xs text-zinc-500 capitalize">{props.type || 'NPC'}</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-400">Base Character</span>
                        <select
                            value={selectedCharacter.characterId}
                            onChange={(e) => updateCharacterInstance(selectedCharacter.id, { characterId: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                        >
                            {!props?.isEnemy && <option value="default">Default Character</option>}
                            {characterRepo.getAll().filter(d => {
                                // If the current instance is an enemy, only show other enemies
                                if (props?.isEnemy) {
                                    try {
                                        return JSON.parse(d.metadata).isEnemy === true;
                                    } catch { return false; }
                                }
                                // If not an enemy (e.g., player spawn/NPCs), don't show enemies 
                                // (or maybe we do? Let's assume we don't for now, or just show all non-enemies)
                                try {
                                    return JSON.parse(d.metadata).isEnemy !== true;
                                } catch { return true; }
                            }).map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                            {selectedCharacter.characterId !== 'default' && !characterRepo.getById(selectedCharacter.characterId) && (
                                <option value={selectedCharacter.characterId}>Unknown Character (Missing)</option>
                            )}
                        </select>
                    </div>

                    {props?.isEnemy && (
                        <div className="mt-4 pt-4 border-t border-zinc-700">
                            <div className="text-xs font-semibold text-zinc-300 mb-3 uppercase tracking-wide">Enemy Properties</div>

                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-zinc-400 uppercase">Max HP Override</span>
                                    <input
                                        type="number"
                                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 w-full"
                                        placeholder={props.health?.toString() || "100"}
                                        value={selectedCharacter.overrideProperties?.maxHp || ''}
                                        onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                            overrideProperties: {
                                                ...selectedCharacter.overrideProperties,
                                                maxHp: e.target.value ? parseInt(e.target.value, 10) : undefined
                                            }
                                        })}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-zinc-400 uppercase">Movement Behavior</span>
                                    <select
                                        value={selectedCharacter.overrideProperties?.behavior || 'standing'}
                                        onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                            overrideProperties: {
                                                ...selectedCharacter.overrideProperties,
                                                behavior: e.target.value as any
                                            }
                                        })}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="standing">Standing (Idle)</option>
                                        <option value="pingpong">Ping-Pong (Patrol)</option>
                                        <option value="follow">Follow Player</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-b border-zinc-700">
                    <div className="flex items-center gap-2 mb-4">
                        <Move size={14} className="text-zinc-400" />
                        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Transform</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-400">Grid X</span>
                            <input
                                type="number"
                                value={selectedCharacter.gridX}
                                onChange={(e) => updateCharacterInstance(selectedCharacter.id, { gridX: parseInt(e.target.value) || 0 })}
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-400">Grid Y</span>
                            <input
                                type="number"
                                value={selectedCharacter.gridY}
                                onChange={(e) => updateCharacterInstance(selectedCharacter.id, { gridY: parseInt(e.target.value) || 0 })}
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4">
                    <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">Stats (Definition)</div>
                    <div className="flex flex-col gap-2 text-xs text-zinc-400">
                        <div className="flex justify-between border-b border-zinc-800 pb-1">
                            <span>Health</span>
                            <span className="font-mono text-zinc-300">{props.health || 100}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-1">
                            <span>Mana</span>
                            <span className="font-mono text-zinc-300">{props.mana || 0}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-1">
                            <span>Collision</span>
                            <span className={clsx("font-mono", props.hasCollision ? "text-green-400" : "text-zinc-600")}>
                                {props.hasCollision ? "Yes" : "No"}
                            </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-1">
                            <span>Enemy</span>
                            <span className={clsx("font-mono", props.isEnemy ? "text-red-400" : "text-zinc-600")}>
                                {props.isEnemy ? "Yes" : "No"}
                            </span>
                        </div>
                    </div>

                    {(props.isEnemy || selectedCharacter.overrideProperties?.isEnemy) && (
                        <div className="mt-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-center gap-2 mb-4">
                                <Activity size={12} className="text-zinc-500" />
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">Enemy Overrides</span>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-zinc-400">Enemy Type</span>
                                    <select
                                        value={selectedCharacter.overrideProperties?.enemyType || props.enemyType || 'melee'}
                                        onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                            overrideProperties: {
                                                ...selectedCharacter.overrideProperties,
                                                enemyType: e.target.value as any
                                            }
                                        })}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-red-500"
                                    >
                                        <option value="shooter">Shooter (Ranged)</option>
                                        <option value="melee">Melee</option>
                                        <option value="tank">Tank (Heavy)</option>
                                        <option value="flyer">Flyer (Airborne)</option>
                                        <option value="assassin">Assassin (Fast)</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-zinc-400">Behavior</span>
                                    <select
                                        value={selectedCharacter.overrideProperties?.behavior || props.behavior || 'standing'}
                                        onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                            overrideProperties: {
                                                ...selectedCharacter.overrideProperties,
                                                behavior: e.target.value as any
                                            }
                                        })}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-red-500"
                                    >
                                        <option value="standing">Standing</option>
                                        <option value="pingpong">Ping Pong (Patrol)</option>
                                        <option value="follow">Follow Player</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">Max HP</span>
                                        <input
                                            type="number"
                                            value={selectedCharacter.overrideProperties?.maxHp ?? props.maxHp ?? 100}
                                            onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                                overrideProperties: {
                                                    ...selectedCharacter.overrideProperties,
                                                    maxHp: Math.max(1, parseInt(e.target.value) || 1)
                                                }
                                            })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-zinc-400">EXP Yield</span>
                                        <input
                                            type="number"
                                            value={selectedCharacter.overrideProperties?.exp ?? props.exp ?? 10}
                                            onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                                overrideProperties: {
                                                    ...selectedCharacter.overrideProperties,
                                                    exp: Math.max(0, parseInt(e.target.value) || 0)
                                                }
                                            })}
                                            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-red-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <User size={12} className="text-zinc-500" />
                                <span className="text-[10px] text-zinc-500 uppercase">Is Player Start</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={selectedCharacter.overrideProperties?.isPlayer === true}
                                    onChange={(e) => updateCharacterInstance(selectedCharacter.id, {
                                        overrideProperties: {
                                            ...selectedCharacter.overrideProperties,
                                            isPlayer: e.target.checked
                                        }
                                    })}
                                />
                                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </div>

                    <div className="mt-4 text-[10px] text-zinc-600 italic">
                        * Stats are defined in Character Master and shared across instances.
                    </div>
                </div>
            </div>
        );
    }

    if (!hasSelection) {
        return (
            <div className="flex flex-col h-full">
                {/* Tile Palette Header */}
                <div className="p-3 border-b border-zinc-700 bg-zinc-800/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Palette</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleCollisions}
                                className={clsx(
                                    "p-1.5 rounded transition-colors",
                                    showCollisions ? "bg-red-500/20 text-red-400" : "hover:bg-zinc-700 text-zinc-500"
                                )}
                                title="Show Collisions"
                            >
                                <Box size={14} />
                            </button>
                            <button
                                onClick={() => {
                                    const isEnabling = !physicsSettings?.isDeathLineEnabled;
                                    setPhysicsSettings({
                                        isDeathLineEnabled: isEnabling,
                                        // Initialize to a visible default position if it doesn't exist
                                        ...(isEnabling && physicsSettings?.deathLineY === undefined ? { deathLineY: 1000 } : {})
                                    });
                                }}
                                className={clsx(
                                    "p-1.5 rounded transition-colors",
                                    physicsSettings?.isDeathLineEnabled ? "bg-red-500/20 text-red-400" : "hover:bg-zinc-700 text-zinc-500"
                                )}
                                title="Toggle Death Line"
                            >
                                <Skull size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="flex bg-zinc-900/80 p-1 rounded-lg">
                        <button
                            onClick={() => setPaletteTab('tiles')}
                            className={clsx(
                                "flex-1 py-1 text-xs font-medium rounded-md transition-all",
                                paletteTab === 'tiles' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Tiles
                        </button>
                        <button
                            onClick={() => setPaletteTab('prefabs')}
                            className={clsx(
                                "flex-1 py-1 text-xs font-medium rounded-md transition-all",
                                paletteTab === 'prefabs' ? "bg-indigo-500/20 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Prefabs
                        </button>
                    </div>
                </div>

                {paletteTab === 'prefabs' ? (
                    <div className="flex-1 overflow-hidden min-h-0">
                        <PrefabPalette />
                    </div>
                ) : (
                    <>
                        {/* Import Buttons */}
                        <div className="p-3 grid grid-cols-2 gap-2 border-b border-zinc-800">
                            <button
                                onClick={() => setShowImportTexture(true)}
                                className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                            >
                                <ImageIcon size={14} />
                                Texture
                            </button>
                            <button
                                onClick={() => setShowImportTilesheet(true)}
                                className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                            >
                                <Grid size={14} />
                                Tileset
                            </button>
                            <button
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*';
                                    input.onchange = (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (ev) => {
                                                const src = ev.target?.result as string;
                                                const img = new Image();
                                                img.onload = () => {
                                                    const state = useEditorStore.getState();
                                                    // TODO: Position center of screen using pan/zoom logic
                                                    // For now 0,0
                                                    state.addLevelImage({
                                                        id: `img_${Date.now()}`,
                                                        name: file.name,
                                                        src,
                                                        layerId: state.activeLayerId,
                                                        x: 0,
                                                        y: 0,
                                                        width: img.naturalWidth,
                                                        height: img.naturalHeight,
                                                        rotation: 0,
                                                        opacity: 1,
                                                        locked: false,
                                                        visible: true,
                                                    });
                                                };
                                                img.src = src;
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    };
                                    input.click();
                                }}
                                className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                            >
                                <ImageIcon size={14} className="text-purple-400" />
                                Image (Prop)
                            </button>
                            {/* Add more buttons if needed - 2 col grid handles it */}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {/* Default/Imported Single Tiles (exclude tilesheet tiles) */}
                            <div className="p-4">
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Basic Tiles</div>
                                <div className="grid grid-cols-4 gap-2">
                                    {availableTiles.filter((t: TileDefinition) => !t.tilesheetId).map((tile: TileDefinition) => (
                                        <TileButton
                                            key={tile.id}
                                            tile={tile}
                                            isSelected={selectedTileType.id === tile.id}
                                            onClick={() => setSelectedTileType(tile)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Imported Tilesheets */}
                            {importedTilesheets.length > 0 && (
                                <div className="p-4 pt-0 border-t border-zinc-800 mt-2">
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 mt-4">Tilesets</div>
                                    <div className="flex flex-col gap-4">
                                        {importedTilesheets.map((sheet: Tilesheet) => (
                                            <TilesheetPicker key={sheet.id} sheet={sheet} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 text-center text-sm text-zinc-500 italic border-t border-zinc-800">
                            Select a tile to view properties
                            <br />
                            <span className="text-xs opacity-50">Active: {selectedTileType.name}</span>
                        </div>
                    </>
                )}

                {/* Modals */}
                {showImportTexture && (
                    <ImportTextureModal onClose={() => setShowImportTexture(false)} initialMode="single" />
                )}
                {showImportTilesheet && (
                    <ImportTextureModal onClose={() => setShowImportTilesheet(false)} initialMode="tileset" />
                )}
                {showSavePrefab && (
                    <SavePrefabModal onClose={() => setShowSavePrefab(false)} />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Selection Info */}
            <div className="p-3 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {selectedTiles.length === 1 ? 'Tile Properties' : `${selectedTiles.length} Tiles Selected`}
                </span>

                <div className="flex gap-2">
                    {hasSelection && (selectedTiles.length > 1 || selectedImages.length > 0) && (
                        <button
                            onClick={() => setShowSavePrefab(true)}
                            className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors flex items-center justify-center"
                            title="Save as Prefab"
                        >
                            <LayoutTemplate size={14} />
                        </button>
                    )}
                    <button
                        onClick={toggleCollisions}
                        className={clsx(
                            "p-1.5 rounded transition-colors",
                            showCollisions ? "bg-red-500/20 text-red-400" : "hover:bg-zinc-700 text-zinc-500"
                        )}
                        title="Show Collisions"
                    >
                        <Box size={14} />
                    </button>
                </div>
            </div>

            {/* Transform Section */}
            <div className="p-4 border-b border-zinc-700">
                <div className="flex items-center gap-2 mb-4">
                    <Move size={14} className="text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Transform</span>
                </div>

                <div className="space-y-4">
                    {/* Position (read-only for now) */}
                    {selectedTiles.length === 1 && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-400">Grid X</span>
                                <div className="bg-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300">
                                    {selectedTiles[0].gridX}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-400">Grid Y</span>
                                <div className="bg-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300">
                                    {selectedTiles[0].gridY}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Scale */}
                    <div className="flex items-center gap-2 mb-2">
                        <Maximize2 size={12} className="text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 uppercase">Scale</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <SliderInput
                            label="X"
                            value={commonScaleX === 'mixed' ? 1 : commonScaleX}
                            min={0.1}
                            max={3}
                            step={0.1}
                            onChange={(v) => handlePropertyChange('scaleX', v)}
                        />
                        <SliderInput
                            label="Y"
                            value={commonScaleY === 'mixed' ? 1 : commonScaleY}
                            min={0.1}
                            max={3}
                            step={0.1}
                            onChange={(v) => handlePropertyChange('scaleY', v)}
                        />
                    </div>

                    {/* Rotation */}
                    <div className="flex items-center gap-2 mb-2 mt-4">
                        <RotateCw size={12} className="text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 uppercase">Rotation</span>
                    </div>
                    <SliderInput
                        label="Angle"
                        value={commonRotation === 'mixed' ? 0 : commonRotation}
                        min={0}
                        max={360}
                        step={15}
                        unit="°"
                        onChange={(v) => handlePropertyChange('rotation', v)}
                    />
                </div>
            </div>

            {/* Text Properties */}
            {commonText !== undefined && (
                <div className="p-4 border-b border-zinc-700">
                    <div className="flex items-center gap-2 mb-4">
                        <Type size={14} className="text-zinc-400" />
                        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Text</span>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-400">Content</span>
                            <input
                                type="text"
                                value={typeof commonText === 'string' ? commonText : ''}
                                onChange={(e) => handlePropertyChange('text', e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-400">Font Family</span>
                                <select
                                    value={typeof commonFontFamily === 'string' ? commonFontFamily : 'sans-serif'}
                                    onChange={(e) => handlePropertyChange('fontFamily', e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 outline-none"
                                >
                                    <option value="sans-serif">Sans Serif</option>
                                    <option value="serif">Serif</option>
                                    <option value="monospace">Monospace</option>
                                    <option value="Impact">Impact</option>
                                    <option value="Comic Sans MS">Comic Sans</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-400">Color</span>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={typeof commonFontColor === 'string' ? commonFontColor : '#ffffff'}
                                        onChange={(e) => handlePropertyChange('fontColor', e.target.value)}
                                        className="w-full h-7 rounded cursor-pointer bg-transparent border-none appearance-none p-0"
                                    />
                                </div>
                            </div>
                        </div>

                        <SliderInput
                            label="Font Size"
                            value={typeof commonFontSize === 'number' ? commonFontSize : 32}
                            min={8}
                            max={256}
                            step={1}
                            unit="px"
                            onChange={(v) => handlePropertyChange('fontSize', v)}
                        />
                    </div>
                </div>
            )}

            {/* Gameplay Properties */}
            <div className="p-4 border-b border-zinc-700">
                <div className="flex items-center gap-2 mb-4">
                    <Activity size={14} className="text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Gameplay</span>
                </div>

                <div className="space-y-4">
                    {/* Collision */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Box size={12} className="text-zinc-500" />
                            <span className="text-[10px] text-zinc-500 uppercase">Collision</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={commonCollision === true}
                                onChange={(e) => handlePropertyChange('hasCollision', e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                        </label>
                    </div>

                    {/* Opacity */}
                    <div className="flex items-center gap-2 mb-1">
                        <Ghost size={12} className="text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 uppercase">Opacity</span>
                    </div>
                    <SliderInput
                        label="Alpha"
                        value={typeof commonOpacity === 'number' ? commonOpacity : 1}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={(v) => handlePropertyChange('opacity', v)}
                    />


                    {/* Advanced Glow */}
                    <div className="pt-2 border-t border-zinc-800">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Zap size={12} className={commonGlow || commonGlowLegacy ? "text-yellow-400" : "text-zinc-500"} />
                                <span className={clsx("text-[10px] uppercase font-semibold", commonGlow || commonGlowLegacy ? "text-yellow-400" : "text-zinc-500")}>Glow Effect</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={!!commonGlow || !!commonGlowLegacy}
                                    onChange={(e) => handleGlowToggle(e.target.checked)}
                                />
                                <div className="w-8 h-4 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-yellow-500" />
                            </label>
                        </div>

                        {(commonGlow || commonGlowLegacy) && typeof commonGlow === 'object' && (
                            <div className="space-y-3 pl-1 border-l-2 border-yellow-500/30 ml-1">
                                <div className="pl-2">
                                    <select
                                        value={commonGlow.style || 'solid'}
                                        onChange={(e) => handleGlowPropChange('style', e.target.value)}
                                        className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-yellow-500 mb-2 cursor-pointer"
                                    >
                                        <option value="solid">Solid Color</option>
                                        <option value="pulsing">Pulsing</option>
                                        <option value="multi-color">Multi-Color</option>
                                        <option value="random">Random Noise</option>
                                    </select>

                                    <SliderInput
                                        label="Intensity"
                                        value={commonGlow.intensity || 15}
                                        min={0} max={100} step={1}
                                        onChange={(v) => handleGlowPropChange('intensity', v)}
                                    />

                                    {(commonGlow.style === 'solid' || commonGlow.style === 'pulsing') && (
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="text-[10px] text-zinc-500 uppercase">Base Color</span>
                                            <input
                                                type="color"
                                                value={commonGlow.color || '#ffffff'}
                                                onChange={(e) => handleGlowPropChange('color', e.target.value)}
                                                className="w-6 h-6 rounded bg-transparent cursor-pointer"
                                            />
                                        </div>
                                    )}

                                    {commonGlow.style === 'multi-color' && (
                                        <div className="mt-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-zinc-500 uppercase">Colors</span>
                                                <button
                                                    onClick={() => {
                                                        const colors = commonGlow.colors || ['#ff0000', '#00ff00'];
                                                        if (colors.length < 5) handleGlowPropChange('colors', [...colors, '#ffffff']);
                                                    }}
                                                    className="text-[10px] text-yellow-500 hover:text-yellow-400"
                                                >
                                                    + Add Color
                                                </button>
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                {(commonGlow.colors || ['#ff0000', '#00ff00']).map((c, i) => (
                                                    <div key={i} className="relative group">
                                                        <input
                                                            type="color"
                                                            value={c}
                                                            onChange={(e) => {
                                                                const newCols = [...(commonGlow.colors || ['#ff0000', '#00ff00'])];
                                                                newCols[i] = e.target.value;
                                                                handleGlowPropChange('colors', newCols);
                                                            }}
                                                            className="w-6 h-6 rounded bg-transparent cursor-pointer"
                                                        />
                                                        {(commonGlow.colors || []).length > 2 && (
                                                            <button
                                                                onClick={() => {
                                                                    const newCols = [...(commonGlow.colors || ['#ff0000', '#00ff00'])];
                                                                    newCols.splice(i, 1);
                                                                    handleGlowPropChange('colors', newCols);
                                                                }}
                                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100"
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(commonGlow.style === 'pulsing' || commonGlow.style === 'multi-color' || commonGlow.style === 'random') && (
                                        <div className="mt-2">
                                            <SliderInput
                                                label="Animation Speed"
                                                value={commonGlow.speed || 1}
                                                min={0.1} max={10} step={0.1} unit="x"
                                                onChange={(v) => handleGlowPropChange('speed', v)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Physics */}
                    <div className="pt-2 border-t border-zinc-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Layers size={12} className="text-zinc-500" />
                            <span className="text-[10px] text-zinc-500 uppercase">Physics</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <SliderInput
                                label="Friction"
                                value={typeof commonFriction === 'number' ? commonFriction : 0}
                                min={0}
                                max={1}
                                step={0.1}
                                onChange={(v) => handlePhysicsChange('friction', v)}
                            />
                            <SliderInput
                                label="Bounce"
                                value={typeof commonBounciness === 'number' ? commonBounciness : 0}
                                min={0}
                                max={1}
                                step={0.1}
                                onChange={(v) => handlePhysicsChange('bounciness', v)}
                            />
                        </div>
                    </div>

                    {/* Tag */}
                    <div className="pt-2">
                        <div className="flex items-center gap-2 mb-2">
                            <Tag size={12} className="text-zinc-500" />
                            <span className="text-[10px] text-zinc-500 uppercase">Tag</span>
                        </div>
                        <input
                            type="text"
                            value={typeof commonTag === 'string' ? commonTag : ''}
                            onChange={(e) => handlePropertyChange('tag', e.target.value)}
                            placeholder="e.g. 'ground', 'water'"
                            className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    {/* ─── Tile Behaviors ─── */}
                    {renderBehaviorSection('behavior', commonBehaviorType)}
                    {renderBehaviorSection('behavior2', commonBehavior2Type)}

                    {/* Replace Tile Section */}
                    <div className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <RefreshCw size={14} className="text-zinc-400" />
                            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Replace Tile</span>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {availableTiles.filter((t: TileDefinition) => !t.tilesheetId).map((tile: TileDefinition) => (
                                <TileButton
                                    key={tile.id}
                                    tile={tile}
                                    isSelected={commonSprite === tile.id}
                                    onClick={() => handleReplaceTile(tile)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PropertiesPanel() {
    const { selectedTileIds, selectedCharacterIds, selectedCollisionIds, activeTool } = useEditorStore();
    const [activeTab, setActiveTab] = useState<'inspector' | 'layers' | 'skybox'>('inspector');

    // Auto-switch to inspector on selection
    useEffect(() => {
        if (selectedTileIds.size > 0 || selectedCharacterIds.size > 0 || selectedCollisionIds.size > 0) {
            setActiveTab('inspector');
        }
    }, [selectedTileIds, selectedCharacterIds, selectedCollisionIds]);

    // Auto-switch to inspector when selecting a drawing tool
    useEffect(() => {
        if (['brush', 'bucket', 'rectangle', 'circle', 'line', 'text', 'spawn', 'character'].includes(activeTool)) {
            setActiveTab('inspector');
        }
    }, [activeTool]);

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
            {/* Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-800">
                <button
                    onClick={() => setActiveTab('inspector')}
                    className={clsx(
                        "flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                        activeTab === 'inspector' ? "text-white bg-slate-700/50 border-b-2 border-indigo-500" : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
                    )}
                >
                    Inspector
                </button>
                <button
                    onClick={() => setActiveTab('layers')}
                    className={clsx(
                        "flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                        activeTab === 'layers' ? "text-white bg-slate-700/50 border-b-2 border-indigo-500" : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
                    )}
                >
                    Layers
                </button>
                <button
                    onClick={() => setActiveTab('skybox')}
                    className={clsx(
                        "flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                        activeTab === 'skybox' ? "text-white bg-slate-700/50 border-b-2 border-indigo-500" : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
                    )}
                >
                    Skybox
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto relative">
                {activeTab === 'inspector' && <InspectorPanel />}
                {activeTab === 'layers' && <LayersPanel />}
                {activeTab === 'skybox' && <SkyboxPanel />}
            </div>
        </div>
    );
}
