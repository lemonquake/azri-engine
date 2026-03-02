/**
 * Bottom Toolbar Component - Tool selection and undo/redo
 */
import React from 'react';
import { clsx } from 'clsx';
import {
    Paintbrush,
    PaintBucket,
    Eraser,
    MousePointer2,
    BoxSelect,
    Undo2,
    Redo2,
    Grid3X3,
    Trash2,
    Spline,
    Square,
    Circle,
    UserPlus, // Changed icon for Spawn (Add Character)
    Skull,    // Enemy
    Shield,
    Focus,
    Type
} from 'lucide-react';

import { useEditorStore } from '../state/editorStore';
import { useHistoryStore } from '../state/historyStore';
import type { ToolType } from '../types';

interface ToolButtonProps {
    tool: ToolType;
    icon: React.ReactNode;
    label: string;
    shortcut: string;
    colorClass?: string;
}

function ToolButton({ tool, icon, label, shortcut, colorClass = "text-zinc-400 hover:text-white" }: ToolButtonProps) {
    const { activeTool, setActiveTool } = useEditorStore();
    const isActive = activeTool === tool;

    return (
        <button
            onClick={() => setActiveTool(tool)}
            className={clsx(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-none border-2 transition-all duration-75 relative overflow-hidden group",
                isActive
                    ? "bg-zinc-800 border-indigo-500 shadow-[inset_0_0_10px_rgba(99,102,241,0.5)]"
                    : "bg-zinc-900 border-zinc-700 hover:border-zinc-500 shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            )}
            style={{ fontFamily: "'VT323', monospace" }}
            title={`${label} (${shortcut})`}
        >
            <div className={clsx("transition-transform", isActive ? "scale-110 text-indigo-400" : colorClass)}>
                {icon}
            </div>
            <span className={clsx(
                "text-[14px] uppercase tracking-wider mt-1",
                isActive ? "text-indigo-300" : "text-zinc-400 group-hover:text-zinc-200"
            )}>
                {label}
            </span>
            {isActive && <div className="absolute top-0 left-0 w-full h-[2px] bg-indigo-400/50" />}
        </button>
    );
}

export function Toolbar() {
    const { tiles, selectedTileIds, showGrid, toggleGrid, clearAllTiles } = useEditorStore();
    const { canUndo, canRedo, undo, redo } = useHistoryStore();

    const handleUndo = () => {
        const state = useEditorStore.getState();
        const restored = undo(
            state.tiles,
            state.characters,
            state.layers,
            state.skyboxLayers,
            state.levelImages,
            state.collisionShapes,
            state.selectedTileIds,
            state.selectedCharacterIds,
            state.selectedLayerIds,
            state.selectedImageIds,
            state.selectedCollisionIds
        );
        if (restored) {
            useEditorStore.setState({
                tiles: restored.tiles,
                characters: restored.characters,
                layers: restored.layers,
                skyboxLayers: restored.skyboxLayers,
                levelImages: restored.levelImages,
                collisionShapes: restored.collisionShapes,
                selectedTileIds: restored.selectedTileIds,
                selectedCharacterIds: restored.selectedCharacterIds,
                selectedLayerIds: restored.selectedLayerIds,
                selectedImageIds: restored.selectedImageIds,
                selectedCollisionIds: restored.selectedCollisionIds,
            });
        }
    };

    const handleRedo = () => {
        const state = useEditorStore.getState();
        const restored = redo(
            state.tiles,
            state.characters,
            state.layers,
            state.skyboxLayers,
            state.levelImages,
            state.collisionShapes,
            state.selectedTileIds,
            state.selectedCharacterIds,
            state.selectedLayerIds,
            state.selectedImageIds,
            state.selectedCollisionIds
        );
        if (restored) {
            useEditorStore.setState({
                tiles: restored.tiles,
                characters: restored.characters,
                layers: restored.layers,
                skyboxLayers: restored.skyboxLayers,
                levelImages: restored.levelImages,
                collisionShapes: restored.collisionShapes,
                selectedTileIds: restored.selectedTileIds,
                selectedCharacterIds: restored.selectedCharacterIds,
                selectedLayerIds: restored.selectedLayerIds,
                selectedImageIds: restored.selectedImageIds,
                selectedCollisionIds: restored.selectedCollisionIds,
            });
        }
    };

    return (
        <div className="h-20 border-t-4 border-b-4 border-zinc-950 bg-zinc-800 flex items-center px-4 gap-4 select-none overflow-x-auto overflow-y-hidden custom-scrollbar" style={{ boxShadow: 'inset 0 4px 6px rgba(0,0,0,0.5)' }}>

            {/* Draw Group */}
            <div className="flex flex-col items-center">
                <span className="text-zinc-500 text-[10px] uppercase mb-1" style={{ fontFamily: "'VT323', monospace" }}>Draw</span>
                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <ToolButton
                        tool="brush"
                        icon={<Paintbrush size={20} />}
                        label="Brush"
                        shortcut="B"
                        colorClass="text-emerald-400 hover:text-emerald-300"
                    />
                    <ToolButton
                        tool="bucket"
                        icon={<PaintBucket size={20} />}
                        label="Fill"
                        shortcut="G"
                        colorClass="text-sky-400 hover:text-sky-300"
                    />
                    <ToolButton
                        tool="eraser"
                        icon={<Eraser size={20} />}
                        label="Erase"
                        shortcut="E"
                        colorClass="text-rose-400 hover:text-rose-300"
                    />
                </div>
            </div>

            {/* Select Group */}
            <div className="flex flex-col items-center">
                <span className="text-zinc-500 text-[10px] uppercase mb-1" style={{ fontFamily: "'VT323', monospace" }}>Select</span>
                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <ToolButton
                        tool="select"
                        icon={<MousePointer2 size={20} />}
                        label="Cursor"
                        shortcut="V"
                        colorClass="text-indigo-400 hover:text-indigo-300"
                    />
                    <ToolButton
                        tool="multiSelect"
                        icon={<BoxSelect size={20} />}
                        label="Area"
                        shortcut="M"
                        colorClass="text-purple-400 hover:text-purple-300"
                    />
                </div>
            </div>

            {/* Shapes Group */}
            <div className="flex flex-col items-center">
                <span className="text-zinc-500 text-[10px] uppercase mb-1" style={{ fontFamily: "'VT323', monospace" }}>Shapes & Physics</span>
                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <ToolButton
                        tool="line"
                        icon={<Spline size={20} />}
                        label="Line"
                        shortcut="L"
                        colorClass="text-amber-400 hover:text-amber-300"
                    />
                    <ToolButton
                        tool="rectangle"
                        icon={<Square size={20} />}
                        label="Rect"
                        shortcut="R"
                        colorClass="text-amber-400 hover:text-amber-300"
                    />
                    <ToolButton
                        tool="circle"
                        icon={<Circle size={20} />}
                        label="Circle"
                        shortcut="C"
                        colorClass="text-amber-400 hover:text-amber-300"
                    />
                    <div className="w-1 h-8 bg-zinc-800 border-l border-zinc-900 mx-1" />
                    <ToolButton
                        tool="collision"
                        icon={<Shield size={20} />}
                        label="Blocks"
                        shortcut="K"
                        colorClass="text-lime-400 hover:text-lime-300"
                    />
                    <ToolButton
                        tool="selectCollision"
                        icon={<Focus size={20} />}
                        label="Modify"
                        shortcut="O"
                        colorClass="text-lime-400 hover:text-lime-300"
                    />
                </div>
            </div>

            {/* Entities Group */}
            <div className="flex flex-col items-center">
                <span className="text-zinc-500 text-[10px] uppercase mb-1" style={{ fontFamily: "'VT323', monospace" }}>Entities</span>
                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <ToolButton
                        tool="spawn"
                        icon={<UserPlus size={20} />}
                        label="Player"
                        shortcut="S"
                        colorClass="text-cyan-400 hover:text-cyan-300"
                    />
                    <ToolButton
                        tool="enemy"
                        icon={<Skull size={20} />}
                        label="Enemy"
                        shortcut="Y"
                        colorClass="text-rose-500 hover:text-rose-400 shadow-[inset_0_0_8px_rgba(244,63,94,0.2)]"
                    />
                </div>
            </div>

            {/* Extras Group */}
            <div className="flex flex-col items-center">
                <span className="text-zinc-500 text-[10px] uppercase mb-1" style={{ fontFamily: "'VT323', monospace" }}>Misc</span>
                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <ToolButton
                        tool="text"
                        icon={<Type size={20} />}
                        label="Text"
                        shortcut="T"
                        colorClass="text-slate-300 hover:text-white"
                    />
                </div>
            </div>

            {/* Divider */}
            < div className="min-w-px h-12 bg-zinc-900 mx-2" />

            {/* History & View Options */}
            < div className="flex gap-4 ml-auto" >
                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <button
                        onClick={handleUndo}
                        disabled={!canUndo()}
                        className={clsx(
                            "flex flex-col items-center gap-1 px-3 py-2 border-2 transition-all relative overflow-hidden",
                            canUndo()
                                ? "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                : "bg-black/50 border-black text-zinc-700 cursor-not-allowed"
                        )}
                        style={{ fontFamily: "'VT323', monospace" }}
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo2 size={20} />
                        <span className="text-[14px] uppercase tracking-wide mt-1">Undo</span>
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={!canRedo()}
                        className={clsx(
                            "flex flex-col items-center gap-1 px-3 py-2 border-2 transition-all relative overflow-hidden",
                            canRedo()
                                ? "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                : "bg-black/50 border-black text-zinc-700 cursor-not-allowed"
                        )}
                        style={{ fontFamily: "'VT323', monospace" }}
                        title="Redo (Ctrl+Y)"
                    >
                        <Redo2 size={20} />
                        <span className="text-[14px] uppercase tracking-wide mt-1">Redo</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 bg-black/40 p-1.5 border-2 border-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                    <button
                        onClick={toggleGrid}
                        className={clsx(
                            "flex flex-col items-center gap-1 px-3 py-2 border-2 transition-all relative",
                            showGrid
                                ? "bg-emerald-900 border-emerald-500 text-emerald-300 shadow-[inset_0_0_10px_rgba(16,185,129,0.3)]"
                                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        )}
                        style={{ fontFamily: "'VT323', monospace" }}
                        title="Toggle Grid"
                    >
                        <Grid3X3 size={20} />
                        <span className="text-[14px] uppercase tracking-wide mt-1">Grid</span>
                        {showGrid && <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-500/50" />}
                    </button>
                    <button
                        onClick={clearAllTiles}
                        className="flex flex-col items-center gap-1 px-3 py-2 bg-zinc-900 border-2 border-zinc-700 text-rose-500 hover:border-rose-500 hover:text-rose-400 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        style={{ fontFamily: "'VT323', monospace" }}
                        title="Clear All"
                    >
                        <Trash2 size={20} />
                        <span className="text-[14px] uppercase tracking-wide mt-1">Nuke</span>
                    </button>
                </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-zinc-400">
                <span>Tiles: <strong className="text-zinc-200">{tiles.size}</strong></span>
                <span>Selected: <strong className="text-zinc-200">{selectedTileIds.size}</strong></span>
            </div>
        </div>
    );
}
