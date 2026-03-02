import { useEditorStore } from '../state/editorStore';
import { clsx } from 'clsx';
import { useState } from 'react';
import { DraggableModal } from './ui/DraggableModal';
import { Settings } from 'lucide-react';

interface ProjectSettingsModalProps {
    onClose: () => void;
}

export function ProjectSettingsModal({ onClose }: ProjectSettingsModalProps) {
    const {
        levelName, setLevelName,
        physicsSettings, setPhysicsSettings
    } = useEditorStore();

    const [activeTab, setActiveTab] = useState<'general' | 'physics'>('general');

    return (
        <DraggableModal
            title="Project Settings"
            isOpen={true}
            onClose={onClose}
            width={500}
            icon={Settings}
        >
            {/* Tabs */}
            <div className="flex border-b border-zinc-800 px-4 pt-2">
                <button
                    onClick={() => setActiveTab('general')}
                    className={clsx(
                        "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                        activeTab === 'general'
                            ? "border-indigo-500 text-indigo-400"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                    )}
                >
                    General
                </button>
                <button
                    onClick={() => setActiveTab('physics')}
                    className={clsx(
                        "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                        activeTab === 'physics'
                            ? "border-indigo-500 text-indigo-400"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                    )}
                >
                    Physics
                </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar max-h-[60vh]">

                {activeTab === 'general' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Level Name</label>
                            <input
                                type="text"
                                value={levelName}
                                onChange={(e) => setLevelName(e.target.value)}
                                className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                                placeholder="My Awesome Level"
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'physics' && (
                    <div className="flex flex-col gap-6">
                        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                            <p className="text-sm text-indigo-200">
                                These settings affect how the player moves and interacts with the world.
                            </p>
                        </div>

                        {/* Gravity */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Gravity</label>
                                <span className="text-xs font-mono text-zinc-400">{physicsSettings.gravity}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="3000"
                                step="50"
                                value={physicsSettings.gravity}
                                onChange={(e) => setPhysicsSettings({ gravity: parseInt(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                            <p className="text-xs text-zinc-500">Higher values make the player fall faster.</p>
                        </div>

                        {/* Jump Force */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Jump Force</label>
                                <span className="text-xs font-mono text-zinc-400">{physicsSettings.jumpForce}</span>
                            </div>
                            <input
                                type="range"
                                min="200"
                                max="1000"
                                step="10"
                                value={physicsSettings.jumpForce}
                                onChange={(e) => setPhysicsSettings({ jumpForce: parseInt(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                            <p className="text-xs text-zinc-500">How high the player jumps.</p>
                        </div>

                        {/* Move Speed */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Move Speed</label>
                                <span className="text-xs font-mono text-zinc-400">{physicsSettings.moveSpeed}</span>
                            </div>
                            <input
                                type="range"
                                min="50"
                                max="600"
                                step="10"
                                value={physicsSettings.moveSpeed}
                                onChange={(e) => setPhysicsSettings({ moveSpeed: parseInt(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                            <p className="text-xs text-zinc-500">How fast the player runs.</p>
                        </div>

                        {/* Death Line settings */}
                        <div className="flex flex-col gap-4 mt-2 pt-4 border-t border-zinc-700">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-red-500 uppercase tracking-wider">Enable Death Line</label>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={physicsSettings.isDeathLineEnabled ?? false}
                                        onChange={(e) => setPhysicsSettings({ isDeathLineEnabled: e.target.checked })}
                                    />
                                    <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                                </label>
                            </div>

                            {(physicsSettings.isDeathLineEnabled ?? false) && (
                                <div className="flex flex-col gap-2 bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-red-400 uppercase tracking-wider">Death Line Y Position</label>
                                        <span className="text-xs font-mono text-red-300">{physicsSettings.deathLineY ?? 2000}</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={physicsSettings.deathLineY ?? 2000}
                                        onChange={(e) => setPhysicsSettings({ deathLineY: parseInt(e.target.value) || 0 })}
                                        className="bg-zinc-950 border border-red-500/30 rounded-lg p-2 text-red-100 focus:outline-none focus:border-red-500 transition-colors w-full"
                                    />
                                    <p className="text-xs text-red-400/70">
                                        If the player falls below this Y coordinate, they will die. Can also be adjusted by dragging the red line in the editor canvas.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-xl flex justify-end">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                >
                    Done
                </button>
            </div>
        </DraggableModal>
    );
}
