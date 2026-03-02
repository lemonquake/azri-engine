import React, { useState } from 'react';
import { X, Save, LayoutTemplate } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import PrefabRepository from '../db/repositories/PrefabRepository';
import clsx from 'clsx';

interface SavePrefabModalProps {
    onClose: () => void;
}

export const SavePrefabModal: React.FC<SavePrefabModalProps> = ({ onClose }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('General');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            const store = useEditorStore.getState();
            store.copySelection(); // Populate clipboard with selected items
            const clipboard = store.clipboard;

            if (!clipboard || (clipboard.tiles.length === 0 && clipboard.characters.length === 0 && clipboard.levelImages.length === 0)) {
                alert("Nothing selected to save as prefab!");
                setIsSaving(false);
                return;
            }

            const id = `prefab_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const prefabData = JSON.stringify(clipboard);

            // Simple thumbnail strategy: could be customized later
            const thumb = '';

            const success = PrefabRepository.create({
                id,
                name: name.trim(),
                category: category.trim() || 'General',
                preview_image: thumb,
                data: prefabData,
                created_at: Date.now(),
                updated_at: Date.now(),
            });

            if (success) {
                console.log("Prefab saved!");
                onClose();
            } else {
                alert("Failed to save prefab to database.");
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred while saving the prefab.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-800/50">
                    <div className="flex items-center gap-2 text-zinc-100">
                        <LayoutTemplate size={18} className="text-indigo-400" />
                        <h2 className="text-sm font-semibold">Save Selected as Prefab</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 overflow-y-auto">
                    <form id="save-prefab-form" onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Prefab Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Castle Wall Segment"
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                                autoFocus
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Category</label>
                            <input
                                type="text"
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                placeholder="e.g. Walls, Environment, Traps..."
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                            />
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-md text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="save-prefab-form"
                        disabled={!name.trim() || isSaving}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all shadow-lg",
                            (!name.trim() || isSaving)
                                ? "bg-indigo-500/50 text-indigo-200 cursor-not-allowed"
                                : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/20"
                        )}
                    >
                        <Save size={16} />
                        {isSaving ? 'Saving...' : 'Save Prefab'}
                    </button>
                </div>
            </div>
        </div>
    );
};
