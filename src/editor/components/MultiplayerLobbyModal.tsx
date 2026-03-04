/**
 * MultiplayerLobbyModal — Retro-styled multiplayer lobby screen.
 * HOST flow: pick a map → generate ID → wait for players
 * JOIN flow: enter Host ID → connect → see slot assigned
 */
import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useEditorStore } from '../state/editorStore';
import levelRepo from '../db/repositories/LevelRepository';
import type { LevelEntity } from '../db/repositories/LevelRepository';

// ─── Slot indicator ────────────────────────────────────────────────────────────
type SlotState = 'you' | 'connected' | 'waiting' | 'empty';

const PLAYER_COLORS: Record<number, string> = {
    1: '#818cf8', // indigo
    2: '#34d399', // emerald
    3: '#f472b6', // pink
};

const PLAYER_LABELS = ['P1 (HOST)', 'P2', 'P3'];

function PlayerSlot({ index, state: slotState }: { index: number; state: SlotState }) {
    const color = PLAYER_COLORS[index + 1];
    const label = PLAYER_LABELS[index];
    const isActive = slotState === 'you' || slotState === 'connected';

    return (
        <div
            className={clsx(
                'flex flex-col items-center gap-2 p-4 border-2 transition-all duration-300',
                isActive ? 'bg-zinc-900' : 'bg-zinc-950 opacity-50'
            )}
            style={{ borderColor: isActive ? color : '#3f3f46' }}
        >
            {/* Avatar */}
            <div
                className={clsx(
                    'w-14 h-14 flex items-center justify-center text-3xl font-bold border-2',
                    slotState === 'waiting' && 'animate-pulse'
                )}
                style={{
                    borderColor: color,
                    color,
                    backgroundColor: isActive ? `${color}22` : 'transparent',
                    fontFamily: "'VT323', monospace",
                }}
            >
                {slotState === 'waiting' ? '?' : slotState === 'empty' ? '—' : index + 1}
            </div>

            {/* Label */}
            <div
                className="text-xs uppercase tracking-widest font-bold"
                style={{ fontFamily: "'VT323', monospace", color }}
            >
                {label}
            </div>

            {/* Status */}
            <div
                className="text-[11px] uppercase tracking-wider"
                style={{ fontFamily: "'VT323', monospace", color: '#71717a' }}
            >
                {slotState === 'you' ? '▶ YOU' :
                    slotState === 'connected' ? '✓ READY' :
                        slotState === 'waiting' ? '· · ·' :
                            'EMPTY'}
            </div>
        </div>
    );
}

// ─── Main modal ────────────────────────────────────────────────────────────────
type LobbyScreen = 'menu' | 'host_pick_map' | 'host_waiting' | 'join_input' | 'join_connecting' | 'join_connected';

export function MultiplayerLobbyModal() {
    const {
        setShowMultiplayerLobby,
        setIsMultiplayerHost,
        setMultiplayerHostId,
        togglePlayMode,
        isPlaying,
        loadLevel,
    } = useEditorStore();

    const [screen, setScreen] = useState<LobbyScreen>('menu');
    const [levels, setLevels] = useState<Pick<LevelEntity, 'id' | 'name' | 'updated_at'>[]>([]);
    const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
    const [generatedHostId, setGeneratedHostId] = useState<string>('');
    const [joinInput, setJoinInput] = useState('');
    const [connectedCount] = useState(0);
    const [copied, setCopied] = useState(false);
    const joinInputRef = useRef<HTMLInputElement>(null);

    // Load saved levels
    useEffect(() => {
        const all = levelRepo.getAll();
        setLevels(all);
        if (all.length > 0) setSelectedLevelId(all[0].id);
    }, []);

    // Focus join input when screen changes
    useEffect(() => {
        if (screen === 'join_input') {
            setTimeout(() => joinInputRef.current?.focus(), 100);
        }
    }, [screen]);


    const handleClose = () => setShowMultiplayerLobby(false);

    // ─── HOST FLOW ───────────────────────────────────────────────────────────
    const handleLoadMap = async (levelId: string) => {
        const { default: repo } = await import('../db/repositories/LevelRepository');
        const data = repo.getById(levelId);
        if (!data) return;
        try {
            const tiles = JSON.parse(data.tiles_data || '[]');
            const characters = JSON.parse(data.characters_data || '[]');
            const layers = JSON.parse(data.layers_data || '[]');
            const skyboxLayers = JSON.parse(data.skybox_data || '[]');
            const levelImages = JSON.parse(data.level_images_data || '[]');
            const physics = JSON.parse(data.physics_data || '{}');
            const collisionShapes = JSON.parse(data.collision_data || '[]');
            const importedTilesheets = JSON.parse(data.tilesheets_data || '[]');
            const availableTiles = JSON.parse(data.tile_defs_data || '[]');
            loadLevel({
                id: data.id,
                name: data.name,
                tiles, characters, layers, skyboxLayers, levelImages,
                physics, collisionShapes, importedTilesheets, availableTiles
            });
        } catch (e) {
            console.error('Failed to load level for lobby:', e);
        }
    };

    const handleStartHosting = async () => {
        if (!selectedLevelId) return;
        // Load the map into the editor
        await handleLoadMap(selectedLevelId);
        // Generate a PeerJS-safe alphanumeric ID
        const suffix = Math.random().toString(36).substring(2, 8);
        const newId = `azri${suffix}`;
        setGeneratedHostId(newId);
        setIsMultiplayerHost(true);
        setMultiplayerHostId(newId);
        setScreen('host_waiting');
        navigator.clipboard.writeText(newId).catch(() => { });
    };

    const handleStartGame = () => {
        if (!isPlaying) togglePlayMode();
        setShowMultiplayerLobby(false);
    };

    const handleCopyId = () => {
        navigator.clipboard.writeText(generatedHostId).catch(() => { });
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // ─── JOIN FLOW ───────────────────────────────────────────────────────────
    const handleJoin = () => {
        const hostId = joinInput.trim().toLowerCase();
        if (!hostId) return;
        setMultiplayerHostId(hostId);
        setIsMultiplayerHost(false);
        setScreen('join_connecting');

        // Simulate connecting state, then launch game
        // Real success/failure comes from GameRunner's NetworkManager
        setTimeout(() => {
            setScreen('join_connected');
        }, 1800);
    };

    const handleJoinGame = () => {
        if (!isPlaying) togglePlayMode();
        setShowMultiplayerLobby(false);
    };

    // ─── Slot states ─────────────────────────────────────────────────────────
    const hostSlots: SlotState[] = [
        'you',
        connectedCount >= 1 ? 'connected' : 'waiting',
        connectedCount >= 2 ? 'connected' : 'empty',
    ];
    const joinSlots: SlotState[] = ['connected', 'you', 'empty'];

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
        >
            {/* Scanline effect */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
                    zIndex: 1
                }}
            />

            <div
                className="relative z-10 w-full max-w-2xl mx-4 flex flex-col border-4"
                style={{
                    borderColor: '#6366f1',
                    backgroundColor: '#09090b',
                    boxShadow: '0 0 60px rgba(99,102,241,0.4), 0 0 120px rgba(99,102,241,0.15)',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b-4"
                    style={{ borderColor: '#6366f1', backgroundColor: '#18181b' }}
                >
                    <div>
                        <div
                            className="text-3xl text-indigo-400 uppercase tracking-widest"
                            style={{ fontFamily: "'VT323', monospace", textShadow: '0 0 20px rgba(99,102,241,0.8)' }}
                        >
                            ⚔ MULTIPLAYER LOBBY
                        </div>
                        <div
                            className="text-xs text-zinc-500 uppercase tracking-widest mt-0.5"
                            style={{ fontFamily: "'VT323', monospace" }}
                        >
                            AZRI ENGINE — ONLINE
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-zinc-600 hover:text-zinc-300 text-2xl transition-colors"
                        style={{ fontFamily: "'VT323', monospace" }}
                        title="Close"
                    >
                        [X]
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">

                    {/* ── MAIN MENU ── */}
                    {screen === 'menu' && (
                        <div className="flex flex-col gap-4">
                            <p
                                className="text-zinc-400 text-sm uppercase tracking-widest text-center mb-2"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                SELECT AN OPTION
                            </p>

                            <button
                                onClick={() => setScreen('host_pick_map')}
                                className="w-full py-5 border-2 border-indigo-500 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 transition-all uppercase tracking-widest text-2xl flex items-center justify-center gap-3 shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                🏠 HOST A GAME
                            </button>

                            <button
                                onClick={() => setScreen('join_input')}
                                className="w-full py-5 border-2 border-cyan-600 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 transition-all uppercase tracking-widest text-2xl flex items-center justify-center gap-3 shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                🌐 JOIN A GAME
                            </button>

                            <p
                                className="text-[11px] text-center text-zinc-600 mt-2 uppercase tracking-wider"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                PEER-TO-PEER — NO SERVER REQUIRED
                            </p>
                        </div>
                    )}

                    {/* ── HOST: PICK MAP ── */}
                    {screen === 'host_pick_map' && (
                        <div className="flex flex-col gap-4">
                            <div
                                className="text-xl text-indigo-400 uppercase tracking-widest mb-2"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                📂 SELECT A MAP TO HOST
                            </div>

                            {levels.length === 0 ? (
                                <div
                                    className="text-center text-zinc-500 py-8 border-2 border-zinc-800"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    NO SAVED LEVELS FOUND.<br />
                                    <span className="text-xs text-zinc-600">SAVE A LEVEL FIRST FROM THE EDITOR.</span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                                    {levels.map(lvl => (
                                        <button
                                            key={lvl.id}
                                            onClick={() => setSelectedLevelId(lvl.id)}
                                            className={clsx(
                                                'w-full flex items-center justify-between px-4 py-3 border-2 transition-all text-left',
                                                selectedLevelId === lvl.id
                                                    ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
                                                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                                            )}
                                        >
                                            <div>
                                                <div
                                                    className="text-lg uppercase tracking-wider"
                                                    style={{ fontFamily: "'VT323', monospace" }}
                                                >
                                                    {selectedLevelId === lvl.id ? '▶ ' : '  '}{lvl.name}
                                                </div>
                                                <div
                                                    className="text-[11px] text-zinc-600"
                                                    style={{ fontFamily: "'VT323', monospace" }}
                                                >
                                                    ID: {lvl.id} · {new Date(Number(lvl.updated_at)).toLocaleDateString()}
                                                </div>
                                            </div>
                                            {selectedLevelId === lvl.id && (
                                                <span className="text-indigo-400 text-xl" style={{ fontFamily: "'VT323', monospace" }}>✓</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-3 mt-2">
                                <button
                                    onClick={() => setScreen('menu')}
                                    className="flex-1 py-3 border-2 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-lg"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ← BACK
                                </button>
                                <button
                                    onClick={handleStartHosting}
                                    disabled={!selectedLevelId || levels.length === 0}
                                    className="flex-1 py-3 border-2 border-indigo-500 bg-indigo-600 hover:bg-indigo-500 text-white uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xl"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    HOST GAME →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── HOST: WAITING ROOM ── */}
                    {screen === 'host_waiting' && (
                        <div className="flex flex-col gap-5">
                            <div
                                className="text-xl text-indigo-400 uppercase tracking-widest"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                🏠 WAITING FOR PLAYERS…
                            </div>

                            {/* Host ID */}
                            <div className="border-2 border-indigo-500 bg-indigo-950/40 p-4">
                                <div
                                    className="text-xs text-zinc-400 uppercase tracking-widest mb-1"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    SHARE THIS HOST ID WITH YOUR FRIENDS:
                                </div>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="flex-1 text-2xl text-white bg-black px-4 py-3 border-2 border-indigo-700 uppercase tracking-widest font-mono select-all"
                                        style={{ fontFamily: "'VT323', monospace", letterSpacing: '0.25em', textShadow: '0 0 15px rgba(99,102,241,0.8)' }}
                                    >
                                        {generatedHostId}
                                    </div>
                                    <button
                                        onClick={handleCopyId}
                                        className={clsx(
                                            'px-4 py-3 border-2 uppercase text-sm font-bold transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
                                            copied
                                                ? 'border-emerald-500 bg-emerald-600 text-white'
                                                : 'border-indigo-500 bg-indigo-700 hover:bg-indigo-600 text-white'
                                        )}
                                        style={{ fontFamily: "'VT323', monospace" }}
                                    >
                                        {copied ? '✓ COPIED' : 'COPY'}
                                    </button>
                                </div>
                            </div>

                            {/* Player slots */}
                            <div className="grid grid-cols-3 gap-3">
                                {hostSlots.map((s, i) => (
                                    <PlayerSlot key={i} index={i} state={s} />
                                ))}
                            </div>

                            {/* Map info */}
                            <div
                                className="text-xs text-zinc-500 uppercase tracking-wider text-center"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                MAP: {levels.find(l => l.id === selectedLevelId)?.name || selectedLevelId}
                                <br />
                                <span className="text-zinc-600">Tell your friends to load this same map before joining.</span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setIsMultiplayerHost(false);
                                        setMultiplayerHostId(null);
                                        setScreen('host_pick_map');
                                    }}
                                    className="flex-1 py-3 border-2 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-lg"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleStartGame}
                                    className="flex-1 py-3 border-2 border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-white uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-xl"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ▶ START GAME
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── JOIN: ENTER ID ── */}
                    {screen === 'join_input' && (
                        <div className="flex flex-col gap-4">
                            <div
                                className="text-xl text-cyan-400 uppercase tracking-widest mb-2"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                🌐 ENTER HOST ID TO JOIN
                            </div>

                            <div className="border-2 border-cyan-700 bg-cyan-950/20 p-4">
                                <div
                                    className="text-xs text-zinc-400 uppercase tracking-widest mb-2"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    HOST ID (ASK THE HOST FOR THEIR ID):
                                </div>
                                <input
                                    ref={joinInputRef}
                                    type="text"
                                    value={joinInput}
                                    onChange={e => setJoinInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                                    placeholder="e.g.  azrix7k2qf"
                                    className="w-full bg-black border-2 border-cyan-800 focus:border-cyan-400 outline-none text-white uppercase font-mono text-2xl px-4 py-3 tracking-widest transition-colors"
                                    style={{ fontFamily: "'VT323', monospace", letterSpacing: '0.2em' }}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                <div
                                    className="text-xs text-zinc-600 uppercase tracking-wider mt-2"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ⚠ MAKE SURE YOU LOADED THE SAME MAP AS THE HOST FIRST.
                                </div>
                            </div>

                            {/* Map reminder */}
                            {levels.length > 0 && (
                                <div className="border-2 border-zinc-800 p-3">
                                    <div
                                        className="text-xs text-zinc-500 uppercase tracking-wider mb-2"
                                        style={{ fontFamily: "'VT323', monospace" }}
                                    >
                                        LOAD MAP (SELECT THE SAME AS HOST):
                                    </div>
                                    <select
                                        value={selectedLevelId || ''}
                                        onChange={e => setSelectedLevelId(e.target.value)}
                                        className="w-full bg-zinc-900 border-2 border-zinc-700 text-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                                        style={{ fontFamily: "'VT323', monospace" }}
                                    >
                                        <option value="">-- Don't load any map --</option>
                                        {levels.map(l => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                    {selectedLevelId && (
                                        <button
                                            onClick={() => handleLoadMap(selectedLevelId)}
                                            className="mt-2 w-full py-2 border-2 border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white text-sm uppercase tracking-wider transition-all"
                                            style={{ fontFamily: "'VT323', monospace" }}
                                        >
                                            LOAD MAP INTO EDITOR
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 mt-2">
                                <button
                                    onClick={() => setScreen('menu')}
                                    className="flex-1 py-3 border-2 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-lg"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ← BACK
                                </button>
                                <button
                                    onClick={handleJoin}
                                    disabled={!joinInput.trim()}
                                    className="flex-1 py-3 border-2 border-cyan-500 bg-cyan-700 hover:bg-cyan-600 text-white uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xl"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    JOIN GAME →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── JOIN: CONNECTING ── */}
                    {screen === 'join_connecting' && (
                        <div className="flex flex-col items-center gap-6 py-8">
                            <div
                                className="text-4xl text-cyan-400 animate-pulse"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                🌐 CONNECTING…
                            </div>
                            <div
                                className="text-lg text-zinc-400 uppercase tracking-widest"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                REACHING HOST: <span className="text-cyan-400">{joinInput.trim().toUpperCase()}</span>
                            </div>
                            {/* Animated dots */}
                            <div className="flex gap-3">
                                {[0, 1, 2, 3, 4].map(i => (
                                    <div
                                        key={i}
                                        className="w-3 h-3 bg-cyan-500"
                                        style={{ animation: `pulse 1s ${i * 0.15}s infinite` }}
                                    />
                                ))}
                            </div>
                            <div
                                className="text-xs text-zinc-600 uppercase tracking-wider"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                THIS MAY TAKE A FEW SECONDS…
                            </div>
                        </div>
                    )}

                    {/* ── JOIN: CONNECTED ── */}
                    {screen === 'join_connected' && (
                        <div className="flex flex-col gap-5">
                            <div
                                className="text-2xl text-emerald-400 uppercase tracking-widest"
                                style={{ fontFamily: "'VT323', monospace", textShadow: '0 0 15px rgba(52,211,153,0.8)' }}
                            >
                                ✓ CONNECTED TO HOST!
                            </div>

                            {/* Player slots */}
                            <div className="grid grid-cols-3 gap-3">
                                {joinSlots.map((s, i) => (
                                    <PlayerSlot key={i} index={i} state={s} />
                                ))}
                            </div>

                            <div
                                className="text-sm text-zinc-400 text-center uppercase tracking-wider border-2 border-cyan-900/60 p-3 bg-cyan-950/20"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                YOU ARE <span className="text-emerald-400">PLAYER 2</span>.<br />
                                WAIT FOR THE HOST TO START THE GAME.
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setIsMultiplayerHost(false);
                                        setMultiplayerHostId(null);
                                        setScreen('menu');
                                    }}
                                    className="flex-1 py-3 border-2 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-lg"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    LEAVE
                                </button>
                                <button
                                    onClick={handleJoinGame}
                                    className="flex-1 py-3 border-2 border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-white uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-xl"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ▶ JOIN GAME
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div
                    className="px-6 py-3 border-t-2 border-zinc-800 flex items-center justify-between"
                >
                    <div
                        className="text-xs text-zinc-600 uppercase tracking-widest"
                        style={{ fontFamily: "'VT323', monospace" }}
                    >
                        P2P VIA PEERJS — NO DEDICATED SERVER
                    </div>
                    <div
                        className="text-xs text-zinc-600 uppercase tracking-widest"
                        style={{ fontFamily: "'VT323', monospace" }}
                    >
                        {screen === 'menu' ? 'HOST OR JOIN A GAME' :
                            screen.startsWith('host') ? '🏠 HOST MODE' : '🌐 JOIN MODE'}
                    </div>
                </div>
            </div>
        </div>
    );
}
