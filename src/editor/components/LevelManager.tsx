

import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';
import { Save, FolderOpen, Trash2 } from 'lucide-react';
import { DraggableModal } from './ui/DraggableModal';


interface LevelEntity {
    id: string;
    name: string;
    updated_at: number;
}

export const SaveLevelModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { levelName, setLevelName, saveLevel } = useEditorStore();
    const [name, setName] = useState(levelName);

    const handleSave = async () => {
        setLevelName(name);
        useEditorStore.setState({ levelName: name });
        await saveLevel();
        onClose();
    };

    return (
        <DraggableModal title="Save Level" isOpen={true} onClose={onClose} width={400} icon={Save}>
            <div className="p-6">
                <div className="mb-4">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Level Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                        autoFocus
                    />
                </div>
            </div>
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-xl flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded hover:bg-zinc-800 text-zinc-400">Cancel</button>
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium">Save</button>
            </div>
        </DraggableModal>
    );
};

export const LoadLevelModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { loadLevel } = useEditorStore();
    const [levels, setLevels] = useState<Pick<LevelEntity, 'id' | 'name' | 'updated_at'>[]>([]);

    useEffect(() => {
        const fetchLevels = async () => {
            const { default: levelRepo } = await import('../db/repositories/LevelRepository');
            const list = levelRepo.getAll();
            setLevels(list);
        };
        fetchLevels();
    }, []);

    const handleLoad = async (id: string) => {
        const { default: levelRepo } = await import('../db/repositories/LevelRepository');
        const level = levelRepo.getById(id);
        if (level) {
            loadLevel({
                id: level.id,
                name: level.name,
                tiles: JSON.parse(level.tiles_data),
                characters: JSON.parse(level.characters_data),
                layers: level.layers_data ? JSON.parse(level.layers_data) : undefined,
                collisionShapes: level.collision_data ? JSON.parse(level.collision_data) : [],
            });
            onClose();
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this level?')) {
            const { default: levelRepo } = await import('../db/repositories/LevelRepository');
            levelRepo.delete(id);
            setLevels(prev => prev.filter(l => l.id !== id));
        }
    };

    return (
        <DraggableModal title="Load Level" isOpen={true} onClose={onClose} width={500} icon={FolderOpen}>
            <div className="p-4 flex-1 overflow-y-auto min-h-[300px] space-y-2 custom-scrollbar">
                {levels.length === 0 ? (
                    <div className="text-zinc-500 text-center py-8">No saved levels found.</div>
                ) : (
                    levels.map(level => (
                        <div
                            key={level.id}
                            onClick={() => handleLoad(level.id)}
                            className="bg-zinc-800/50 p-3 rounded-lg cursor-pointer hover:bg-zinc-800 border border-transparent hover:border-zinc-700 flex justify-between items-center group transition-colors"
                        >
                            <div>
                                <div className="font-medium text-zinc-200">{level.name}</div>
                                <div className="text-xs text-zinc-500">{new Date(level.updated_at).toLocaleString()}</div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(level.id, e)}
                                className="p-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete Level"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-xl flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded hover:bg-zinc-800 text-zinc-400">Cancel</button>
            </div>
        </DraggableModal>
    );
};
