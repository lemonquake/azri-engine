
import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
    User, Save, Plus, Trash2, Play,
    Check, Settings, Activity, Shield,
    Swords, Zap
} from 'lucide-react';

import dbService from '../../db/DatabaseService';
import characterRepo, { DEFAULT_CHARACTER_PROPERTIES } from '../../db/repositories/CharacterRepository';
import type { CharacterEntity, CharacterProperties } from '../../db/repositories/CharacterRepository';
import { useCharacterMasterStore } from '../characterMasterStore';

// Animation slots as defined by requirements
const ANIMATION_SLOTS = [
    { id: 'idle', label: 'Idle' },
    { id: 'idle_side', label: 'Idle Side' },
    { id: 'walk_front', label: 'Walk Front' },
    { id: 'walk_back', label: 'Walk Back' },
    { id: 'walk_side', label: 'Walk Side' },
    { id: 'jump_front', label: 'Jump Front' },
    { id: 'jump_back', label: 'Jump Back' },
    { id: 'jump_side', label: 'Jump Side' },
    { id: 'attack_side', label: 'Attack Side' },
    { id: 'attack_jump', label: 'Attack Jump' },
    { id: 'hit', label: 'Hit' },
    { id: 'death', label: 'Death' },
    { id: 'critical', label: 'Critical (Low HP)' },
];

export function CharacterCreator() {
    const [characters, setCharacters] = useState<CharacterEntity[]>([]);
    const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
    const [charName, setCharName] = useState("");
    const [properties, setProperties] = useState<CharacterProperties>(DEFAULT_CHARACTER_PROPERTIES);
    const [animAssignments, setAnimAssignments] = useState<Record<string, string>>({});
    const [activeTab, setActiveTab] = useState<'properties' | 'animations'>('properties');

    // Refresh character list
    const refreshList = () => {
        const list = characterRepo.getAll();
        setCharacters(list);
    };

    useEffect(() => {
        // Init DB if needed (should be done at app start, but safety check)
        dbService.init().then(refreshList);
    }, []);

    // Load selected character
    useEffect(() => {
        if (selectedCharId) {
            const char = characterRepo.getById(selectedCharId);
            if (char) {
                setCharName(char.name);
                try {
                    const parsedProps = JSON.parse(char.metadata);
                    setProperties({ ...DEFAULT_CHARACTER_PROPERTIES, ...parsedProps });
                } catch (e) {
                    console.warn("Failed to parse metadata", e);
                    setProperties(DEFAULT_CHARACTER_PROPERTIES);
                }
                const anims = characterRepo.getAnimations(selectedCharId);
                setAnimAssignments(anims);
            }
        } else {
            setCharName("");
            setProperties(DEFAULT_CHARACTER_PROPERTIES);
            setAnimAssignments({});
        }
    }, [selectedCharId]);

    const handleCreate = () => {
        const id = `char_${Date.now()}`;
        const newChar = {
            id,
            name: "New Character",
            metadata: JSON.stringify(DEFAULT_CHARACTER_PROPERTIES)
        };
        characterRepo.create(newChar);
        refreshList();
        setSelectedCharId(id);
        setActiveTab('properties');
    };

    const handleSave = () => {
        if (!selectedCharId) return;

        // Update name and metadata
        characterRepo.update(selectedCharId, {
            name: charName,
            metadata: JSON.stringify(properties)
        });

        // Update animations
        Object.entries(animAssignments).forEach(([type, animId]) => {
            characterRepo.setAnimation(selectedCharId, type, animId);
        });

        refreshList();
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this character?")) {
            characterRepo.delete(id);
            if (selectedCharId === id) setSelectedCharId(null);
            refreshList();
        }
    };

    const updateProperty = <K extends keyof CharacterProperties>(key: K, value: CharacterProperties[K]) => {
        setProperties(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="flex h-full text-zinc-200">
            {/* Sidebar: Character List */}
            <div className="w-64 border-r border-zinc-800 flex flex-col bg-zinc-950">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h2 className="font-bold flex items-center gap-2">
                        <User size={16} /> Characters
                    </h2>
                    <button
                        onClick={handleCreate}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                        title="Create New Character"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {characters.map(char => (
                        <div
                            key={char.id}
                            onClick={() => setSelectedCharId(char.id)}
                            className={clsx(
                                "p-2 rounded cursor-pointer flex justify-between items-center group transition-colors",
                                selectedCharId === char.id
                                    ? "bg-blue-600/20 text-blue-100 border border-blue-600/50"
                                    : "hover:bg-zinc-900 border border-transparent"
                            )}
                        >
                            <span className="truncate text-sm">{char.name}</span>
                            <button
                                onClick={(e) => handleDelete(char.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}

                    {characters.length === 0 && (
                        <div className="p-4 text-center text-xs text-zinc-500">
                            No characters found. Click + to create one.
                        </div>
                    )}
                </div>
            </div>

            {/* Main Area: Character Details */}
            <div className="flex-1 flex flex-col bg-zinc-925">
                {selectedCharId ? (
                    <>
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                            <div className="flex-1 max-w-md">
                                <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Character Name</label>
                                <input
                                    type="text"
                                    value={charName}
                                    onChange={(e) => setCharName(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                    placeholder="Enter character name..."
                                />
                            </div>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-900/20"
                            >
                                <Save size={16} /> Save Character
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-zinc-800 bg-zinc-900/50 px-4 pt-2 gap-2">
                            <button
                                onClick={() => setActiveTab('properties')}
                                className={clsx(
                                    "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2",
                                    activeTab === 'properties'
                                        ? "bg-zinc-800 text-white border-x border-t border-zinc-700 border-b-zinc-800 relative bottom-[-1px]"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                )}
                            >
                                <Settings size={14} /> Properties
                            </button>
                            <button
                                onClick={() => setActiveTab('animations')}
                                className={clsx(
                                    "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2",
                                    activeTab === 'animations'
                                        ? "bg-zinc-800 text-white border-x border-t border-zinc-700 border-b-zinc-800 relative bottom-[-1px]"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                )}
                            >
                                <Activity size={14} /> Animations
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-zinc-900/30">
                            {activeTab === 'properties' ? (
                                <div className="max-w-2xl space-y-6">
                                    {/* Physics & Type */}
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <Shield size={14} /> Physics & Collision
                                            </h3>
                                            <div className="space-y-3">
                                                <label className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800/50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={properties.hasCollision}
                                                        onChange={(e) => updateProperty('hasCollision', e.target.checked)}
                                                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                                    />
                                                    <span className="text-sm">Enable Collision</span>
                                                </label>
                                                <label className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800/50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={properties.hasGravity}
                                                        onChange={(e) => updateProperty('hasGravity', e.target.checked)}
                                                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                                    />
                                                    <span className="text-sm">Enable Gravity</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <User size={14} /> Behavior
                                            </h3>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-xs text-zinc-500 mb-1.5">NPC Type</label>
                                                    <select
                                                        value={properties.npcType}
                                                        onChange={(e) => updateProperty('npcType', e.target.value as any)}
                                                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                                    >
                                                        <option value="idle">Idle (Static)</option>
                                                        <option value="roam">Roam (Random Movement)</option>
                                                        <option value="path">Patrol Path</option>
                                                        <option value="follow">Follow Player</option>
                                                    </select>
                                                </div>
                                                <label className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800/50 cursor-pointer border border-transparent has-[:checked]:border-red-500/30 has-[:checked]:bg-red-500/10">
                                                    <input
                                                        type="checkbox"
                                                        checked={properties.isEnemy}
                                                        onChange={(e) => updateProperty('isEnemy', e.target.checked)}
                                                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-red-600 focus:ring-red-500 focus:ring-offset-zinc-900"
                                                    />
                                                    <span className={clsx("text-sm font-medium", properties.isEnemy ? "text-red-400" : "text-zinc-300")}>
                                                        Mark as Enemy
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Swords size={14} /> Stats
                                        </h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-xs text-zinc-500 mb-1.5">Max Health</label>
                                                <div className="relative">
                                                    <Activity size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                                                    <input
                                                        type="number"
                                                        value={properties.health}
                                                        onChange={(e) => updateProperty('health', parseInt(e.target.value) || 0)}
                                                        className="w-full bg-zinc-800 border border-zinc-700 rounded pl-10 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-zinc-500 mb-1.5">Max Mana</label>
                                                <div className="relative">
                                                    <Zap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
                                                    <input
                                                        type="number"
                                                        value={properties.mana}
                                                        onChange={(e) => updateProperty('mana', parseInt(e.target.value) || 0)}
                                                        className="w-full bg-zinc-800 border border-zinc-700 rounded pl-10 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4">Animation Assignments</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {ANIMATION_SLOTS.map(slot => (
                                            <AnimationSlot
                                                key={slot.id}
                                                label={slot.label}
                                                assignedId={animAssignments[slot.id]}
                                                onAssign={(animId) => setAnimAssignments(prev => ({ ...prev, [slot.id]: animId }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                        <User size={48} className="mb-4 opacity-20" />
                        <p>Select or create a character to edit</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function AnimationSlot({ label, assignedId, onAssign }: { label: string, assignedId?: string, onAssign: (id: string) => void }) {
    const animations = useCharacterMasterStore(s => s.animations);
    const [isEditing, setIsEditing] = useState(false);

    const assignedAnim = assignedId ? animations.get(assignedId) : null;
    const displayValue = assignedAnim ? assignedAnim.name : (assignedId ? "Unknown ID" : "None");

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value) {
            onAssign(value);
        } else {
            onAssign(""); // Allow clearing the assignment
        }
        setIsEditing(false);
    };

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors relative group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-zinc-400">{label}</span>
                {assignedId && <Check size={12} className="text-green-500" />}
            </div>

            {isEditing ? (
                <div className="absolute inset-0 bg-zinc-900 z-10 p-2 flex flex-col justify-center rounded-lg">
                    <select
                        className="w-full bg-zinc-800 border border-zinc-700 rounded text-xs p-2 text-white focus:outline-none focus:border-blue-500"
                        value={assignedId || ""}
                        onChange={handleSelectChange}
                        onBlur={() => setIsEditing(false)}
                        autoFocus
                    >
                        <option value="">Select Animation...</option>
                        {Array.from(animations.values()).map(anim => (
                            <option key={anim.id} value={anim.id}>
                                {anim.name}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <button
                    className={clsx(
                        "w-full h-24 rounded border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all",
                        assignedId
                            ? "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10"
                            : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50"
                    )}
                    onClick={() => setIsEditing(true)}
                >
                    {assignedId ? (
                        <>
                            <Play size={20} className="text-blue-500" />
                            <span className="text-xs text-blue-200 truncate w-full px-2 text-center">{displayValue}</span>
                        </>
                    ) : (
                        <>
                            <Plus size={20} className="text-zinc-600" />
                            <span className="text-xs text-zinc-500">Assign</span>
                        </>
                    )}
                </button>
            )}

            {/* Clear button */}
            {assignedId && !isEditing && (
                <button
                    className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAssign(""); // Clear assignment
                    }}
                    title="Clear Assignment"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
}
