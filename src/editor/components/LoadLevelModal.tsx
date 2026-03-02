
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Trash2, FileJson, Upload } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import LevelRepository from '../db/repositories/LevelRepository';
import type { LevelEntity } from '../db/repositories/LevelRepository';

interface LoadLevelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LoadLevelModal({ isOpen, onClose }: LoadLevelModalProps) {
    const { loadLevel } = useEditorStore();
    const [levels, setLevels] = useState<Pick<LevelEntity, 'id' | 'name' | 'updated_at'>[]>([]);

    useEffect(() => {
        if (isOpen) {
            refreshLevels();
        }
    }, [isOpen]);

    const refreshLevels = () => {
        const all = LevelRepository.getAll();
        setLevels(all);
    };

    if (!isOpen) return null;

    const parseAndLoadLevel = (fullLevel: any) => {
        try {
            const tiles = JSON.parse(fullLevel.tiles_data || "[]");
            const characters = JSON.parse(fullLevel.characters_data || "[]");
            const layers = fullLevel.layers_data ? JSON.parse(fullLevel.layers_data) : undefined;
            const skyboxLayers = fullLevel.skybox_data ? JSON.parse(fullLevel.skybox_data) : [];
            const levelImages = fullLevel.level_images_data ? JSON.parse(fullLevel.level_images_data) : [];
            const collisionShapes = fullLevel.collision_data ? JSON.parse(fullLevel.collision_data) : [];
            const physics = fullLevel.physics_data ? JSON.parse(fullLevel.physics_data) : undefined;
            const importedTilesheets = fullLevel.tilesheets_data ? JSON.parse(fullLevel.tilesheets_data) : undefined;
            const availableTiles = fullLevel.tile_defs_data ? JSON.parse(fullLevel.tile_defs_data) : undefined;

            loadLevel({
                id: fullLevel.id || `level_${Date.now()}`,
                name: fullLevel.name || 'Imported Level',
                tiles,
                characters,
                layers,
                skyboxLayers,
                levelImages,
                collisionShapes,
                physics,
                importedTilesheets,
                availableTiles
            });
            onClose();
        } catch (e) {
            console.error("Failed to parse level data", e);
            alert("Failed to load level data (corrupted?)");
        }
    };

    const handleLoad = (id: string) => {
        const fullLevel = LevelRepository.getById(id);
        if (fullLevel) {
            parseAndLoadLevel(fullLevel);
        }
    };

    const handleImport = async () => {
        try {
            if ('showOpenFilePicker' in window) {
                const [fileHandle] = await (window as any).showOpenFilePicker({
                    types: [{
                        description: 'JSON Level File',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const file = await fileHandle.getFile();
                const text = await file.text();
                parseAndLoadLevel(JSON.parse(text));
            } else {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            if (event.target?.result) {
                                try {
                                    parseAndLoadLevel(JSON.parse(event.target.result as string));
                                } catch (err) {
                                    alert("Invalid JSON file");
                                }
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error(e);
                alert("Failed to read file from computer");
            }
        }
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this level?")) {
            LevelRepository.delete(id);
            refreshLevels();
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
            <div className="bg-[#1e1e2e] border border-[#2a2a4a] rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-[#2a2a4a]">
                    <h2 className="text-white font-semibold flex items-center gap-2">
                        <FolderOpen size={18} className="text-blue-400" />
                        Load Level
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    <button
                        onClick={handleImport}
                        className="w-full py-3 mb-2 flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg"
                    >
                        <Upload size={18} />
                        Load from Computer (Import)
                    </button>

                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-[#2a2a4a]"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase">Or internal database</span>
                        <div className="flex-grow border-t border-[#2a2a4a]"></div>
                    </div>

                    {levels.length === 0 ? (
                        <div className="text-gray-500 text-center py-8">
                            No saved levels found.
                        </div>
                    ) : (
                        levels.map(level => (
                            <div
                                key={level.id}
                                onClick={() => handleLoad(level.id)}
                                className="group flex items-center justify-between p-3 rounded bg-[#11111b] hover:bg-[#2a2a4a] cursor-pointer transition-colors border border-transparent hover:border-[#818cf8]"
                            >
                                <div className="flex items-center gap-3">
                                    <FileJson size={20} className="text-gray-500 group-hover:text-white" />
                                    <div>
                                        <div className="text-gray-200 font-medium group-hover:text-white">{level.name}</div>
                                        <div className="text-xs text-gray-500">
                                            {new Date(level.updated_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(level.id, e)}
                                    className="p-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Delete Level"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
