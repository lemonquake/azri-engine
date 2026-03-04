/**
 * LevelEditorSidebar - Left panel with tools, brush settings, and tile palette
 */
import { clsx } from 'clsx';
import {
    Brush, PaintBucket, Eraser, MousePointer2, BoxSelect,
    Minus, Square, Circle, Split, Shield, UserPlus, Skull,
    Save, FolderOpen, FilePlus, Play, Settings, Crosshair, Type
} from 'lucide-react';
import { useState } from 'react';

import { useEditorStore } from '../state/editorStore';
import type { ToolType } from '../types';
import { SaveLevelModal } from './SaveLevelModal';
import { LoadLevelModal } from './LoadLevelModal';
import { ProjectSettingsModal } from './ProjectSettingsModal';

interface ToolButtonProps {
    tool: ToolType;
    icon: React.ElementType;
    label: string;
    shortcut: string;
}

function ToolButton({ tool, icon: Icon, label, shortcut }: ToolButtonProps) {
    const { activeTool, setActiveTool, setShowCharacterPicker } = useEditorStore();
    const isActive = activeTool === tool;

    const handleClick = () => {
        if (tool === 'character') {
            setActiveTool('character');
            setShowCharacterPicker(true);
        } else if (tool === 'spawn') {
            setActiveTool('spawn');
            // We might want to show picker here too, or let user pick after clicking?
            // Plan says: On click on canvas -> Open Modal.
            // So here we just set active tool.
        } else {
            setActiveTool(tool);
        }
    };

    return (
        <button
            onClick={handleClick}
            title={`${label} (${shortcut})`}
            className={clsx(
                "group relative p-3 transition-all duration-75 flex items-center justify-center aspect-square border-2",
                isActive
                    ? "bg-zinc-800 border-indigo-500 shadow-[inset_0_0_15px_rgba(99,102,241,0.6)] text-indigo-400"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            )}
        >
            <Icon size={24} className={clsx(isActive && "scale-110 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]")} />

            {/* Tooltip on hover */}
            <div className="absolute left-full ml-4 px-3 py-1.5 bg-black text-white text-[16px] uppercase tracking-wider opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border-2 border-zinc-600 z-50 shadow-[4px_4px_0px_#000] transition-all translate-x-2 group-hover:translate-x-0" style={{ fontFamily: "'VT323', monospace" }}>
                {label} <span className="text-zinc-500 ml-2">[{shortcut}]</span>
            </div>
            {isActive && <div className="absolute top-0 left-0 w-full h-[2px] bg-indigo-400/50" />}
        </button>
    );
}

export function LevelEditorSidebar() {
    const {
        activeTool,
        brushSize, setBrushSize,
        symmetry, setSymmetry,
        toolSettings, setToolSettings,
        showCollisions, toggleCollisions,
        createNewLevel,
        isPlaying, togglePlayMode,
        isPlacingSymmetry, setIsPlacingSymmetry,
        collisionToolMode, setCollisionToolMode,
        smoothShapeType, setSmoothShapeType,
        collisionBrushSize, setCollisionBrushSize,
        isMultiplayerHost, setIsMultiplayerHost,
        multiplayerHostId, setMultiplayerHostId,
        spawnPlayerIndex, setSpawnPlayerIndex
    } = useEditorStore();

    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [joinInput, setJoinInput] = useState("");

    const shapeMode = toolSettings.shapeMode;

    const handleNew = () => {
        if (confirm("Create new level? Unsaved changes will be lost.")) {
            createNewLevel();
        }
    };

    // Tools configuration
    const tools: ToolButtonProps[] = [
        { tool: 'brush', icon: Brush, label: 'Brush', shortcut: 'B' },
        { tool: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
        { tool: 'bucket', icon: PaintBucket, label: 'Fill', shortcut: 'G' },
        { tool: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
        { tool: 'multiSelect', icon: BoxSelect, label: 'Multi', shortcut: 'M' },
        { tool: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
        { tool: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'R' },
        { tool: 'circle', icon: Circle, label: 'Circle', shortcut: 'C' },
        { tool: 'collision', icon: Shield, label: 'Collision', shortcut: 'K' },
        { tool: 'text', icon: Type, label: 'Text', shortcut: 'T' },
        { tool: 'spawn', icon: UserPlus, label: 'Player', shortcut: 'S' },
        { tool: 'enemy', icon: Skull, label: 'Enemy', shortcut: 'Y' },
    ];

    return (
        <div className="flex flex-col h-full w-[120px] bg-zinc-950 border-r-4 border-black shadow-[4px_0_15px_rgba(0,0,0,0.8)] z-20 custom-scrollbar overflow-y-auto overflow-x-hidden select-none">
            {/* Top Section: Brush Settings */}
            <div className="flex flex-col p-3 gap-4 border-b-4 border-zinc-900 bg-zinc-900/50">
                {/* Size Slider */}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between w-full" style={{ fontFamily: "'VT323', monospace" }}>
                        <span className="text-[16px] text-zinc-400 uppercase tracking-wider">Size</span>
                        <span className="text-[16px] text-indigo-400">{brushSize}px</span>
                    </div>
                    <div className="h-24 flex items-center justify-center py-2 px-1 bg-black/60 border-2 border-zinc-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] relative">
                        <input
                            type="range"
                            min="1"
                            max="8"
                            step="1"
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-24 -rotate-90 bg-transparent appearance-none cursor-pointer accent-indigo-500"
                            style={{
                                backgroundImage: 'linear-gradient(to right, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
                                backgroundSize: `100% 4px`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'center'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Tools Grid */}
            <div className="p-3 grid grid-cols-2 gap-2 shrink-0 bg-black/20">
                {tools.map(t => <ToolButton key={t.tool} {...t} />)}
            </div>

            <div className="w-full h-1 bg-zinc-900 my-1" />

            {/* Shape Options (Only visible for shapes) */}
            {['rectangle', 'circle'].includes(activeTool) && (
                <div className="px-3 py-2 flex flex-col gap-2 animate-in fade-in slide-in-from-left-4 duration-200">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Shape</span>
                    <div className="flex gap-1 bg-zinc-800/80 p-1 rounded-lg">
                        <button
                            onClick={() => setToolSettings({ shapeMode: 'outline' })}
                            title="Outline Only"
                            className={clsx(
                                "flex-1 p-1 rounded transition-colors flex justify-center",
                                shapeMode === 'outline' ? "bg-zinc-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <Square size={14} className="stroke-2 fill-none" />
                        </button>
                        <button
                            onClick={() => setToolSettings({ shapeMode: 'fill' })}
                            title="Filled"
                            className={clsx(
                                "flex-1 p-1 rounded transition-colors flex justify-center",
                                shapeMode === 'fill' ? "bg-zinc-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <Square size={14} className="fill-current stroke-none" />
                        </button>
                    </div>
                </div>
            )}

            {/* Collision Tool Options */}
            {activeTool === 'collision' && (
                <div className="px-3 py-2 flex flex-col gap-2 animate-in fade-in slide-in-from-left-4 duration-200">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Mode</span>
                    <div className="flex gap-1 bg-zinc-800/80 p-1 rounded-lg">
                        <button
                            onClick={() => setCollisionToolMode('box')}
                            title="Box Mode"
                            className={clsx(
                                "flex-1 p-1.5 rounded transition-colors text-xs font-medium flex items-center justify-center",
                                collisionToolMode === 'box' ? "bg-emerald-500/30 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Box
                        </button>
                        <button
                            onClick={() => setCollisionToolMode('brush')}
                            title="Brush Mode"
                            className={clsx(
                                "flex-1 p-1.5 rounded transition-colors text-xs font-medium flex items-center justify-center",
                                collisionToolMode === 'brush' ? "bg-emerald-500/30 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <Brush size={14} />
                        </button>
                        <button
                            onClick={() => setCollisionToolMode('fill')}
                            title="Fill Mode"
                            className={clsx(
                                "flex-1 p-1.5 rounded transition-colors text-xs font-medium flex items-center justify-center",
                                collisionToolMode === 'fill' ? "bg-emerald-500/30 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <PaintBucket size={14} />
                        </button>
                        <button
                            onClick={() => setCollisionToolMode('smooth')}
                            title="Smooth Mode"
                            className={clsx(
                                "flex-1 p-1.5 rounded transition-colors text-xs font-medium flex items-center justify-center",
                                collisionToolMode === 'smooth' ? "bg-emerald-500/30 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            Smooth
                        </button>
                    </div>

                    {collisionToolMode === 'brush' && (
                        <div className="flex flex-col gap-2 mt-1">
                            <div className="flex justify-between w-full">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Brush Size</span>
                                <span className="text-[10px] text-emerald-400 font-mono">{collisionBrushSize}</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="8"
                                step="1"
                                value={collisionBrushSize}
                                onChange={(e) => setCollisionBrushSize(parseInt(e.target.value))}
                                className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                        </div>
                    )}

                    {collisionToolMode === 'smooth' && (
                        <>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Shape</span>
                            <div className="flex gap-1 bg-zinc-800/80 p-1 rounded-lg">
                                <button
                                    onClick={() => setSmoothShapeType('circle')}
                                    title="Circle"
                                    className={clsx(
                                        "flex-1 p-1 rounded transition-colors flex justify-center",
                                        smoothShapeType === 'circle' ? "bg-emerald-500/30 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                >
                                    <Circle size={14} />
                                </button>
                                <button
                                    onClick={() => setSmoothShapeType('polygon')}
                                    title="Polygon (click vertices, double-click to close)"
                                    className={clsx(
                                        "flex-1 p-1 rounded transition-colors flex justify-center",
                                        smoothShapeType === 'polygon' ? "bg-emerald-500/30 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                >
                                    <Crosshair size={14} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Player Spawn Tool Options */}
            {activeTool === 'spawn' && (
                <div className="px-3 py-2 flex flex-col gap-2 animate-in fade-in slide-in-from-left-4 duration-200">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Player Index</span>
                    <div className="flex gap-1 bg-zinc-800/80 p-1 rounded-lg">
                        {[
                            { value: true, label: 'P1 (Host)' },
                            { value: 2 as const, label: 'P2' },
                            { value: 3 as const, label: 'P3' },
                        ].map(({ value, label }) => (
                            <button
                                key={label}
                                onClick={() => setSpawnPlayerIndex(value)}
                                title={`Player ${label}`}
                                className={clsx(
                                    "flex-1 p-1.5 rounded transition-colors text-xs font-bold flex items-center justify-center",
                                    spawnPlayerIndex === value ? "bg-indigo-500/30 text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {label.split(' ')[0]}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Symmetry Toggle */}
            <div className="px-3 py-2 flex flex-col gap-2 border-t-4 border-zinc-900 mt-2 bg-black/40">
                <span className="text-[16px] text-zinc-500 uppercase tracking-wider" style={{ fontFamily: "'VT323', monospace" }}>Symmetry</span>
                <button
                    onClick={() => setSymmetry({ enabled: !symmetry.enabled })}
                    className={clsx(
                        "w-full py-3 border-2 transition-all flex items-center justify-center gap-2 relative overflow-hidden",
                        symmetry.enabled
                            ? "bg-teal-900 border-teal-500 text-teal-300 shadow-[inset_0_0_15px_rgba(20,184,166,0.5)]"
                            : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    )}
                    title={symmetry.enabled ? "Disable Symmetry" : "Enable Symmetry"}
                >
                    <Split size={20} />
                </button>
                {symmetry.enabled && (
                    <div className="flex flex-col gap-2 mt-2">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSymmetry({ axis: 'x' })}
                                className={clsx("flex-1 text-[16px] py-1 border-2 transition-all", symmetry.axis === 'x' ? "bg-teal-900 border-teal-500 text-teal-300 shadow-[inset_0_0_10px_rgba(20,184,166,0.3)]" : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 shadow-[2px_2px_0px_#000]")}
                                style={{ fontFamily: "'VT323', monospace" }}
                            >X</button>
                            <button
                                onClick={() => setSymmetry({ axis: 'y' })}
                                className={clsx("flex-1 text-[16px] py-1 border-2 transition-all", symmetry.axis === 'y' ? "bg-teal-900 border-teal-500 text-teal-300 shadow-[inset_0_0_10px_rgba(20,184,166,0.3)]" : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 shadow-[2px_2px_0px_#000]")}
                                style={{ fontFamily: "'VT323', monospace" }}
                            >Y</button>
                        </div>
                        <button
                            onClick={() => setIsPlacingSymmetry(!isPlacingSymmetry)}
                            className={clsx(
                                "w-full text-[16px] py-1.5 border-2 transition-all flex items-center justify-center gap-2",
                                isPlacingSymmetry
                                    ? "bg-teal-900 border-teal-500 text-teal-300 shadow-[inset_0_0_10px_rgba(20,184,166,0.3)] animate-pulse"
                                    : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 shadow-[2px_2px_0px_#000]"
                            )}
                            style={{ fontFamily: "'VT323', monospace" }}
                            title="Click on canvas to set symmetry center"
                        >
                            <Crosshair size={14} />
                            Set Center
                        </button>
                    </div>
                )}
            </div>

            {/* View Options */}
            <div className="px-3 py-2 flex flex-col gap-2 border-t-4 border-zinc-900 bg-black/40">
                <span className="text-[16px] text-zinc-500 uppercase tracking-wider" style={{ fontFamily: "'VT323', monospace" }}>View</span>
                <button
                    onClick={toggleCollisions}
                    className={clsx(
                        "w-full py-3 border-2 transition-all flex items-center justify-center gap-2",
                        showCollisions
                            ? "bg-red-900 border-red-500 text-red-300 shadow-[inset_0_0_15px_rgba(239,68,68,0.5)]"
                            : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    )}
                    title={showCollisions ? "Hide Collisions" : "Show All Collisions"}
                >
                    <Shield size={20} />
                </button>
            </div>

            {/* Game Controls */}
            <div className="px-3 py-2 mt-auto">
                <button
                    onClick={(e) => {
                        e.currentTarget.blur();
                        // Standard play mode clears multiplayer network flags
                        setIsMultiplayerHost(false);
                        setMultiplayerHostId(null);
                        togglePlayMode();
                    }}
                    className={clsx(
                        "w-full py-4 border-2 transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-[20px] shadow-[4px_4px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
                        isPlaying
                            ? "bg-red-600 border-red-400 text-white hover:bg-red-500"
                            : "bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500"
                    )}
                    style={{ fontFamily: "'VT323', monospace" }}
                >
                    {isPlaying ? <Square size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}
                    {isPlaying ? "STOP" : "PLAY"}
                </button>
            </div>

            {/* Multiplayer Controls */}
            <div className="px-3 py-2 flex flex-col gap-2 bg-black/40">
                <span className="text-[14px] text-zinc-500 uppercase tracking-wider font-bold">Multiplayer</span>

                {isMultiplayerHost && isPlaying ? (
                    <div className="flex flex-col gap-1 w-full p-2 border-2 border-indigo-500 bg-zinc-900 shadow-[2px_2px_0px_#000]">
                        <span className="text-xs text-indigo-400 font-bold uppercase">Your Host ID:</span>
                        <div className="flex gap-1 items-center">
                            <span className="text-white font-mono text-xs uppercase bg-black px-1 py-1 flex-1 border border-zinc-700 overflow-hidden text-ellipsis whitespace-nowrap" title={multiplayerHostId || ''}>{multiplayerHostId}</span>
                            <button
                                onClick={() => navigator.clipboard.writeText(multiplayerHostId || '')}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white p-1 text-xs"
                                title="Copy ID"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={(e) => {
                            e.currentTarget.blur();
                            const newId = `host_${Date.now() % 10000}`;
                            setIsMultiplayerHost(true);
                            setMultiplayerHostId(newId);
                            navigator.clipboard.writeText(newId).catch(() => { });
                            togglePlayMode();
                        }}
                        className="w-full py-2 bg-indigo-600 border-2 border-indigo-400 text-white hover:bg-indigo-500 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase text-[14px]"
                    >
                        Host Game
                    </button>
                )}

                {!isJoining ? (
                    <button
                        onClick={() => setIsJoining(true)}
                        className="w-full py-2 bg-cyan-700 border-2 border-cyan-500 text-white hover:bg-cyan-600 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase text-[14px]"
                    >
                        Join Game
                    </button>
                ) : (
                    <div className="flex flex-col gap-1 w-full p-2 border-2 border-cyan-500 bg-zinc-900 shadow-[2px_2px_0px_#000]">
                        <input
                            type="text"
                            placeholder="Host ID"
                            value={joinInput}
                            onChange={e => setJoinInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && joinInput.trim().length > 0) {
                                    setIsMultiplayerHost(false);
                                    setMultiplayerHostId(joinInput.trim());
                                    setIsJoining(false);
                                    togglePlayMode();
                                }
                            }}
                            className="w-full bg-black border border-zinc-700 p-1 text-white font-mono text-sm uppercase outline-none focus:border-cyan-400"
                            autoFocus
                        />
                        <div className="flex gap-1 mt-1">
                            <button
                                onClick={() => {
                                    if (joinInput.trim().length > 0) {
                                        setIsMultiplayerHost(false);
                                        setMultiplayerHostId(joinInput.trim());
                                        setIsJoining(false);
                                        togglePlayMode();
                                    }
                                }}
                                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs py-1 font-bold"
                            >
                                GO
                            </button>
                            <button
                                onClick={() => setIsJoining(false)}
                                className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs py-1 font-bold"
                            >
                                X
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* File Operations */}
            <div className="px-3 py-2 flex flex-col gap-2 border-t-4 border-zinc-900 mt-2 bg-black/40">
                <span className="text-[16px] text-zinc-500 uppercase tracking-wider" style={{ fontFamily: "'VT323', monospace" }}>File</span>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleNew} className="bg-zinc-900 border-2 border-zinc-700 p-2 hover:border-zinc-400 text-zinc-400 hover:text-white transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" title="New Level">
                        <FilePlus size={18} className="mx-auto" />
                    </button>
                    <button onClick={() => setShowSaveModal(true)} className="bg-zinc-900 border-2 border-zinc-700 p-2 hover:border-blue-500 text-zinc-400 hover:text-blue-400 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" title="Save Level">
                        <Save size={18} className="mx-auto" />
                    </button>
                    <button onClick={() => setShowLoadModal(true)} className="bg-zinc-900 border-2 border-zinc-700 p-2 hover:border-green-500 text-zinc-400 hover:text-green-400 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" title="Load Level">
                        <FolderOpen size={18} className="mx-auto" />
                    </button>
                    <button onClick={() => setShowSettingsModal(true)} className="bg-zinc-900 border-2 border-zinc-700 p-2 hover:border-indigo-500 text-zinc-400 hover:text-indigo-400 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" title="Project Settings">
                        <Settings size={18} className="mx-auto" />
                    </button>
                </div>
            </div>

            {showSaveModal && <SaveLevelModal isOpen={true} onClose={() => setShowSaveModal(false)} />}
            {showLoadModal && <LoadLevelModal isOpen={true} onClose={() => setShowLoadModal(false)} />}
            {showSettingsModal && <ProjectSettingsModal onClose={() => setShowSettingsModal(false)} />}
        </div>
    );
}
