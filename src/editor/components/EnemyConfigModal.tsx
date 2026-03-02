import React, { useState } from 'react';
import { X } from 'lucide-react';
import characterRepo from '../db/repositories/CharacterRepository';

interface EnemyConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: any) => void;
}

export function EnemyConfigModal({ isOpen, onClose, onConfirm }: EnemyConfigModalProps) {
    const [characterId, setCharacterId] = useState<string>('default');
    const [enemyType, setEnemyType] = useState<'melee' | 'shooter' | 'tank' | 'flyer' | 'assassin'>('shooter');
    const [maxHp, setMaxHp] = useState<number>(50);
    const [exp, setExp] = useState<number>(25);
    const [behavior, setBehavior] = useState<'standing' | 'pingpong' | 'follow'>('standing');

    const chars = characterRepo.getAll();

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm({ characterId, enemyType, maxHp, exp, behavior });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl w-full max-w-md shadow-2xl border border-slate-700/50 flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                    <h2 className="text-xl font-bold text-slate-100">Configure Enemy</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Base Character Definition</label>
                        <select
                            value={characterId}
                            onChange={(e) => setCharacterId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 mb-4"
                        >
                            <option value="default">Default Character</option>
                            {chars.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Enemy Type</label>
                        <select
                            value={enemyType}
                            onChange={(e) => setEnemyType(e.target.value as 'melee' | 'shooter' | 'tank' | 'flyer' | 'assassin')}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="shooter">Shooter (Ranged)</option>
                            <option value="melee">Melee</option>
                            <option value="tank">Tank (Heavy)</option>
                            <option value="flyer">Flyer (Airborne)</option>
                            <option value="assassin">Assassin (Fast)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Max HP</label>
                        <input
                            type="number"
                            min="1"
                            value={maxHp}
                            onChange={(e) => setMaxHp(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">EXP Given</label>
                        <input
                            type="number"
                            min="0"
                            value={exp}
                            onChange={(e) => setExp(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Movement Behavior</label>
                        <select
                            value={behavior}
                            onChange={(e) => setBehavior(e.target.value as 'standing' | 'pingpong' | 'follow')}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="standing">Standing</option>
                            <option value="pingpong">Pingpong (Patrol)</option>
                            <option value="follow">Follow Player</option>
                        </select>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors font-medium"
                        >
                            Place Enemy
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
