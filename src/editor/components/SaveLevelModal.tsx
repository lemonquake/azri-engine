
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Download } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import LevelRepository from '../db/repositories/LevelRepository';

interface SaveLevelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SaveLevelModal({ isOpen, onClose }: SaveLevelModalProps) {
    const { levelId, levelName, setLevelName, tiles, characters, layers, skyboxLayers, levelImages, collisionShapes, physicsSettings, importedTilesheets, availableTiles, loadLevel } = useEditorStore();
    const [name, setName] = useState(levelName);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setName(levelName);
            setError(null);
        }
    }, [isOpen, levelName]);

    if (!isOpen) return null;

    const handleExport = async () => {
        if (!name.trim()) {
            setError("Level name cannot be empty");
            return;
        }

        try {
            const tilesData = JSON.stringify(Array.from(tiles.values()));
            const charactersData = JSON.stringify(Array.from(characters.values()));
            const layersData = JSON.stringify(layers);
            const skyboxData = JSON.stringify(skyboxLayers);
            const levelImagesData = JSON.stringify(levelImages);
            const collisionData = JSON.stringify(Array.from(collisionShapes.values()));
            const physicsData = JSON.stringify(physicsSettings);
            const tilesheetsData = JSON.stringify(importedTilesheets);

            // Filter auto-injected defaults
            const { DEFAULT_TILES } = await import('../types');
            const defaultTileIds = new Set(DEFAULT_TILES.map(t => t.id));
            const customTiles = availableTiles.filter(t => !defaultTileIds.has(t.id));
            const tileDefsData = JSON.stringify(customTiles);

            const levelData = {
                id: levelId || `level_${Date.now()}`,
                name: name,
                tiles_data: tilesData,
                characters_data: charactersData,
                layers_data: layersData,
                skybox_data: skyboxData,
                level_images_data: levelImagesData,
                collision_data: collisionData,
                physics_data: physicsData,
                tilesheets_data: tilesheetsData,
                tile_defs_data: tileDefsData,
                width: 0,
                height: 0
            };

            const jsonString = JSON.stringify(levelData, null, 2);

            try {
                if ('showSaveFilePicker' in window) {
                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: `${name}.json`,
                        types: [{
                            description: 'JSON Level File',
                            accept: { 'application/json': ['.json'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(jsonString);
                    await writable.close();
                } else {
                    const blob = new Blob([jsonString], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${name}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
                setLevelName(name);
                alert('Level saved to computer successfully!');
                onClose();
            } catch (e: any) {
                if (e.name !== 'AbortError') {
                    console.error("Save cancelled or failed", e);
                    setError("Failed to save file to computer");
                }
            }
        } catch (e) {
            console.error(e);
            setError("Error generating level data");
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError("Level name cannot be empty");
            return;
        }

        try {
            const tilesData = JSON.stringify(Array.from(tiles.values()));
            const charactersData = JSON.stringify(Array.from(characters.values()));
            const layersData = JSON.stringify(layers);
            const skyboxData = JSON.stringify(skyboxLayers);
            const levelImagesData = JSON.stringify(levelImages);
            const collisionData = JSON.stringify(Array.from(collisionShapes.values()));
            const physicsData = JSON.stringify(physicsSettings);
            const tilesheetsData = JSON.stringify(importedTilesheets);

            // Filter auto-injected defaults
            const { DEFAULT_TILES } = await import('../types');
            const defaultTileIds = new Set(DEFAULT_TILES.map(t => t.id));
            const customTiles = availableTiles.filter(t => !defaultTileIds.has(t.id));
            const tileDefsData = JSON.stringify(customTiles);

            const id = levelId || `level_${Date.now()}`;

            if (levelId) {
                // Update existing
                LevelRepository.update(levelId, {
                    name: name,
                    tiles_data: tilesData,
                    characters_data: charactersData,
                    layers_data: layersData,
                    skybox_data: skyboxData,
                    level_images_data: levelImagesData,
                    collision_data: collisionData,
                    physics_data: physicsData,
                    tilesheets_data: tilesheetsData,
                    tile_defs_data: tileDefsData,
                    width: 0,
                    height: 0
                });
            } else {
                // Create new
                LevelRepository.create({
                    id: id,
                    name: name,
                    tiles_data: tilesData,
                    characters_data: charactersData,
                    layers_data: layersData,
                    skybox_data: skyboxData,
                    level_images_data: levelImagesData,
                    collision_data: collisionData,
                    physics_data: physicsData,
                    tilesheets_data: tilesheetsData,
                    tile_defs_data: tileDefsData,
                    width: 0,
                    height: 0
                });
                // Update store with new ID
                loadLevel({
                    id,
                    name,
                    tiles: Array.from(tiles.values()),
                    characters: Array.from(characters.values()),
                    layers,
                    skyboxLayers,
                    levelImages,
                    collisionShapes: Array.from(collisionShapes.values()),
                    physics: physicsSettings,
                    importedTilesheets,
                    availableTiles
                });
            }

            setLevelName(name);
            alert('Level saved successfully!');
            onClose();
        } catch (e) {
            console.error(e);
            setError("Failed to save level");
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
            <div className="bg-[#1e1e2e] border border-[#2a2a4a] rounded-lg shadow-xl w-96 p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-white font-semibold flex items-center gap-2">
                        <Save size={18} className="text-emerald-400" />
                        Save Level
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-gray-400 text-sm mb-1">Level Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#11111b] border border-[#2a2a4a] text-white px-3 py-2 rounded focus:outline-none focus:border-[#818cf8]"
                            placeholder="My Awesome Level"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="text-red-400 text-sm bg-red-400/10 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-3 pt-2">
                        <button
                            onClick={handleExport}
                            className="w-full py-2 flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                        >
                            <Download size={18} />
                            Save to Computer (Export)
                        </button>

                        <div className="relative flex items-center py-2">
                            <div className="flex-grow border-t border-[#2a2a4a]"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase">Or internal database</span>
                            <div className="flex-grow border-t border-[#2a2a4a]"></div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded hover:bg-[#2a2a4a] text-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                            >
                                Save to DB
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
