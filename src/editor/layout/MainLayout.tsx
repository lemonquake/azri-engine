import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { PanelRight, Settings, Play, Square, Grid3X3, Users, ChevronDown } from 'lucide-react';
import { PropertiesPanel, LevelEditorSidebar, CharacterSelectionModal } from '../components';
import { MultiplayerLobbyModal } from '../components/MultiplayerLobbyModal';
import { CharacterMasterPanel } from '../characterMaster';
import { useEditorStore } from '../state/editorStore';
import { GameCanvas } from '../game/GameCanvas';

// Editor mode type
type EditorMode = 'tiles' | 'character';

interface MainLayoutProps {
    children: React.ReactNode; // The central canvas area (TileCanvas)
}

export function MainLayout({ children }: MainLayoutProps) {
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const [editorMode, setEditorMode] = useState<EditorMode>('tiles');
    const [modeMenuOpen, setModeMenuOpen] = useState(false);

    const modes = [
        { id: 'tiles' as EditorMode, name: 'Level Editor', icon: Grid3X3, color: 'text-emerald-400' },
        { id: 'character' as EditorMode, name: 'Character Master', icon: Users, color: 'text-purple-400' },
    ];

    const currentMode = modes.find(m => m.id === editorMode)!;

    const { showCharacterPicker, setShowCharacterPicker, showMultiplayerLobby, isPlaying, togglePlayMode } = useEditorStore();

    useEffect(() => {
        const handleSwitchView = (e: CustomEvent) => {
            if (e.detail === 'character-master') {
                setEditorMode('character');
            } else if (e.detail === 'level-editor') {
                setEditorMode('tiles');
            }
        };

        window.addEventListener('switch-view' as any, handleSwitchView);
        return () => window.removeEventListener('switch-view' as any, handleSwitchView);
    }, []);

    return (
        <div className="flex h-screen w-screen flex-col bg-zinc-900 text-zinc-100 overflow-hidden">
            {/* Top Navigation Bar */}
            <header className="h-12 border-b border-zinc-700 bg-zinc-800 flex items-center px-4 justify-between select-none">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-lg text-indigo-400">Lemon Engine</span>

                    <div className="h-6 w-px bg-zinc-600 mx-2" />

                    {/* Mode Selector */}
                    <div className="relative">
                        <button
                            onClick={() => !isPlaying && setModeMenuOpen(!modeMenuOpen)}
                            disabled={isPlaying}
                            className={clsx(
                                "flex items-center gap-2 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg px-3 py-1.5",
                                "transition-colors cursor-pointer",
                                isPlaying && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <currentMode.icon size={14} className={currentMode.color} />
                            <span className="text-xs font-medium text-zinc-300">{currentMode.name}</span>
                            <ChevronDown size={12} className={clsx("text-zinc-500 transition-transform", modeMenuOpen && "rotate-180")} />
                        </button>

                        {/* Dropdown menu */}
                        {modeMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setModeMenuOpen(false)}
                                />
                                <div className="absolute top-full left-0 mt-1 z-30 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                                    {modes.map((mode) => (
                                        <button
                                            key={mode.id}
                                            onClick={() => {
                                                setEditorMode(mode.id);
                                                setModeMenuOpen(false);
                                            }}
                                            className={clsx(
                                                "w-full flex items-center gap-3 px-3 py-2.5 text-left",
                                                "hover:bg-zinc-700/50 transition-colors",
                                                editorMode === mode.id && "bg-zinc-700/30"
                                            )}
                                        >
                                            <mode.icon size={16} className={mode.color} />
                                            <span className="text-sm text-zinc-200">{mode.name}</span>
                                            {editorMode === mode.id && (
                                                <span className="ml-auto w-2 h-2 rounded-full bg-indigo-500" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.currentTarget.blur();
                            togglePlayMode();
                        }}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition",
                            isPlaying
                                ? "bg-red-600 hover:bg-red-500"
                                : "bg-emerald-600 hover:bg-emerald-500"
                        )}
                    >
                        {isPlaying ? (
                            <>
                                <Square size={16} className="fill-current" />
                                Stop
                            </>
                        ) : (
                            <>
                                <Play size={16} className="fill-current" />
                                Play
                            </>
                        )}
                    </button>
                    <button className="p-2 hover:bg-zinc-700 rounded-full transition relative group">
                        <Settings size={20} />
                    </button>
                </div>
            </header>

            {/* Render based on mode */}
            {editorMode === 'character' ? (
                // Character Master takes over the entire content area
                <CharacterMasterPanel />
            ) : (
                // Level Editor mode with sidebars
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar (Tools & Palette) */}
                    {/* Hide sidebar when playing? Or keep it but disabled? Let's hide it for immersion */}
                    {!isPlaying && (
                        <aside className="relative z-10 flex h-full">
                            <LevelEditorSidebar />
                        </aside>
                    )}

                    {/* Center Canvas Viewport */}
                    <main className="flex-1 relative bg-black flex flex-col min-w-0">
                        {/* Viewport Toolbar */}
                        {!isPlaying && (
                            <div className="absolute top-2 right-2 z-10 flex gap-2">
                                <button
                                    onClick={() => setRightPanelOpen(!rightPanelOpen)}
                                    className={clsx("p-1.5 rounded bg-zinc-800/80 backdrop-blur border border-zinc-600 hover:bg-zinc-700 transition", !rightPanelOpen && "bg-indigo-600 border-indigo-500")}
                                >
                                    <PanelRight size={16} />
                                </button>
                            </div>
                        )}

                        {/* The rendering canvas */}
                        <div className="flex-1 w-full h-full overflow-hidden relative">
                            {isPlaying ? <GameCanvas /> : children}
                        </div>
                    </main>

                    {/* Right Sidebar (Properties) */}
                    {!isPlaying && (
                        <aside
                            className={clsx(
                                "flex flex-col border-l border-zinc-700 bg-zinc-800 transition-all duration-300 ease-in-out overflow-hidden",
                                rightPanelOpen ? "w-72" : "w-0 border-none"
                            )}
                        >
                            <PropertiesPanel />
                        </aside>
                    )}
                </div>
            )}

            {/* Modals */}
            {showCharacterPicker && (
                <CharacterSelectionModal onClose={() => setShowCharacterPicker(false)} />
            )}
            {showMultiplayerLobby && (
                <MultiplayerLobbyModal />
            )}
        </div>
    );
}
