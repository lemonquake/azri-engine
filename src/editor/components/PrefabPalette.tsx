import React, { useState, useEffect, useMemo } from 'react';
import { Search, Folder, Package, Eye, LayoutTemplate, Trash2 } from 'lucide-react';
import PrefabRepository from '../db/repositories/PrefabRepository';
import type { PrefabEntity } from '../db/repositories/PrefabRepository';
import { useEditorStore } from '../state/editorStore';
import clsx from 'clsx';

export const PrefabPalette: React.FC = () => {
    const [prefabs, setPrefabs] = useState<PrefabEntity[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [previewPrefabId, setPreviewPrefabId] = useState<string | null>(null);

    const { setActiveTool } = useEditorStore();

    useEffect(() => {
        loadPrefabs();
    }, []);

    const loadPrefabs = () => {
        const loaded = PrefabRepository.getAll();
        setPrefabs(loaded);
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this prefab?")) {
            PrefabRepository.delete(id);
            loadPrefabs();
        }
    };

    const handleSelectPrefab = (prefab: PrefabEntity) => {
        try {
            const parsedData = JSON.parse(prefab.data);
            useEditorStore.setState({ clipboard: parsedData });
            setActiveTool('paste');
        } catch (e) {
            console.error("Failed to parse prefab data", e);
            alert("This prefab data is corrupted.");
        }
    };

    const categories = useMemo(() => {
        const cats = new Set(prefabs.map(p => p.category));
        return ['All', ...Array.from(cats)].sort();
    }, [prefabs]);

    const filteredPrefabs = useMemo(() => {
        return prefabs.filter(p => {
            const matchesCat = activeCategory === 'All' || p.category === activeCategory;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [prefabs, activeCategory, searchQuery]);

    const getPrefabStats = (dataStr: string) => {
        try {
            const data = JSON.parse(dataStr);
            return {
                tiles: data.tiles?.length || 0,
                chars: data.characters?.length || 0,
                images: data.levelImages?.length || 0,
                width: data.width || 0,
                height: data.height || 0
            };
        } catch {
            return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900">
            {/* Header: Search & Categorization */}
            <div className="p-3 border-b border-zinc-800 space-y-3 shrink-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input
                        type="text"
                        placeholder="Search prefabs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                {/* Categories */}
                <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={clsx(
                                "px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors border",
                                activeCategory === cat
                                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                                    : "bg-zinc-800 text-zinc-500 border-transparent hover:bg-zinc-700 hover:text-zinc-300"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content: List / Previewing */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredPrefabs.length === 0 ? (
                    <div className="text-center p-4 text-xs text-zinc-500 flex flex-col items-center gap-2">
                        <Package size={24} className="opacity-50" />
                        <p>No prefabs found.</p>
                        <button onClick={loadPrefabs} className="text-indigo-400 hover:underline">Refresh</button>
                    </div>
                ) : (
                    filteredPrefabs.map(prefab => {
                        const stats = getPrefabStats(prefab.data);
                        const isPreviewing = previewPrefabId === prefab.id;

                        return (
                            <div
                                key={prefab.id}
                                className="group bg-zinc-800/50 border border-zinc-700/50 hover:border-indigo-500/50 hover:bg-zinc-800 transition-all rounded-lg overflow-hidden cursor-pointer"
                                onClick={() => handleSelectPrefab(prefab)}
                            >
                                <div className="p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-zinc-900 flex items-center justify-center border border-zinc-700">
                                            <LayoutTemplate size={16} className="text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-semibold text-zinc-200">{prefab.name}</h3>
                                            <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                                                <Folder size={10} />
                                                {prefab.category}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => setPreviewPrefabId(isPreviewing ? null : prefab.id)}
                                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                            title="Preview Details"
                                        >
                                            <Eye size={14} className={clsx(isPreviewing && "text-indigo-400")} />
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(prefab.id, e)}
                                            className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                                            title="Delete Prefab"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Preview Dropdown */}
                                {isPreviewing && stats && (
                                    <div className="px-3 py-2 bg-zinc-950/50 border-t border-zinc-700/50 grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="flex items-center justify-between text-zinc-400">
                                            <span>Tiles:</span>
                                            <span className="font-mono text-zinc-200">{stats.tiles}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-zinc-400">
                                            <span>Images:</span>
                                            <span className="font-mono text-zinc-200">{stats.images}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-zinc-400">
                                            <span>Characters:</span>
                                            <span className="font-mono text-zinc-200">{stats.chars}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-zinc-400">
                                            <span>Size:</span>
                                            <span className="font-mono text-zinc-200">{stats.width}x{stats.height}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
            {/* Helper text */}
            <div className="p-2 border-t border-zinc-800 text-center text-[10px] text-zinc-500">
                Click a prefab to select the Paste Tool.
            </div>
        </div>
    );
};
