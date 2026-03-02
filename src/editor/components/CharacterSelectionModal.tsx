import { useEffect, useState } from 'react';
import { User, Search, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useEditorStore } from '../state/editorStore';
import characterRepo from '../db/repositories/CharacterRepository';
import type { CharacterEntity } from '../db/repositories/CharacterRepository';
import { useCharacterMasterStore } from '../characterMaster/characterMasterStore';

interface CharacterSelectionModalProps {
    onClose: () => void;
}

export function CharacterSelectionModal({ onClose }: CharacterSelectionModalProps) {
    const [characters, setCharacters] = useState<CharacterEntity[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const { activeCharacterId, setActiveCharacterId, setActiveTool, activeTool } = useEditorStore();
    const setMode = useCharacterMasterStore((s: any) => s.setMode);

    useEffect(() => {
        setCharacters(characterRepo.getAll());
    }, []);

    const filtered = characters.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSelect = (id: string) => {
        if (activeTool === 'spawn') {
            const state = useEditorStore.getState();
            if (state.pendingSpawnPos) {
                // Push state before modifying
                state.pushHistoryState();

                useEditorStore.getState().placeCharacter({
                    id: `player_spawn`, // Fixed ID for single player spawn?
                    characterId: id,
                    gridX: state.pendingSpawnPos.x,
                    gridY: state.pendingSpawnPos.y,
                    layerId: state.activeLayerId,
                    overrideProperties: { isPlayer: true }
                });
                useEditorStore.getState().setPendingSpawnPos(null);
                useEditorStore.getState().setActiveTool('select'); // Switch back to select after placing?
            }
        } else {
            setActiveCharacterId(id);
            setActiveTool('character');
        }
        onClose();
    };

    const handleCreateNew = () => {
        // Switch to Character Master
        setMode('character'); // This might need a way to navigate to the MAIN tab if it's separate?
        // Assuming MainLayout handles view switching based on some state, but currently CharacterMaster is a view inside MainLayout.
        // We need to signal MainLayout to switch view.
        // For now, let's assume the user manually switches or we dispatch an event.
        // Actually, the requirement says "integrate 'New' button to switch to CharacterMaster tab/view".
        // Use a global event or store if available?
        // Let's dispatch a custom event for now since we don't have a global app store visible here.
        window.dispatchEvent(new CustomEvent('switch-view', { detail: 'character-master' }));
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[500px] flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <User size={20} className="text-indigo-500" />
                        Select Character
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search characters..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="space-y-1">
                        {/* Default Character Option for Spawn */}
                        {activeTool === 'spawn' && (
                            <button
                                onClick={() => handleSelect('default')}
                                className={clsx(
                                    "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left border border-dashed border-zinc-700 hover:border-zinc-500",
                                    "text-zinc-300 hover:bg-zinc-800"
                                )}
                            >
                                <span className="font-medium italic">Default Character</span>
                                <span className="text-xs text-zinc-500">System Default</span>
                            </button>
                        )}
                        {filtered.map(char => (
                            <button
                                key={char.id}
                                onClick={() => handleSelect(char.id)}
                                className={clsx(
                                    "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left",
                                    activeCharacterId === char.id
                                        ? "bg-indigo-600/20 border border-indigo-500/50 text-indigo-100"
                                        : "hover:bg-zinc-800 border border-transparent text-zinc-300"
                                )}
                            >
                                <span className="font-medium">{char.name}</span>
                                <span className="text-xs text-zinc-500">ID: {char.id.slice(-6)}</span>
                            </button>
                        ))}

                        {filtered.length === 0 && (
                            <div className="p-8 text-center text-zinc-500 flex flex-col items-center">
                                <User size={48} className="mb-4 opacity-20" />
                                <p>No characters found.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                    <span className="text-xs text-zinc-500">
                        {characters.length} characters available
                    </span>
                    <button
                        onClick={handleCreateNew}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors border border-zinc-700 hover:border-zinc-600"
                    >
                        <Plus size={16} /> Create New
                    </button>
                </div>
            </div>
        </div>
    );
}
