/**
 * MultiplayerLobbyModal — Retro-styled multiplayer lobby screen.
 * HOST flow: pick a map → generate ID → wait for players (real lobby peer)
 * JOIN flow: enter Host ID → connect via lobby peer → wait for host to start
 *
 * Lobby PeerJS IDs use a `lby_` prefix to avoid conflicting with the game's peer.
 * e.g. host lobby peer = `lby_azrixxxx`, game peer = `azrixxxx`
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { clsx } from 'clsx';
import { useEditorStore } from '../state/editorStore';
import levelRepo from '../db/repositories/LevelRepository';
import type { LevelEntity } from '../db/repositories/LevelRepository';

// ─── Lobby types ──────────────────────────────────────────────────────────────
interface LobbyPlayer {
    peerId: string;
    username: string;
    slot: number; // 0 = host, 1 = P2, 2 = P3
    pingMs?: number | null; // null = not pinged, undefined = ping pending
}

type LobbyMsg =
    | { type: 'HELLO'; username: string }
    | { type: 'WELCOME'; players: LobbyPlayer[]; yourSlot: number }
    | { type: 'PLAYER_JOINED'; player: LobbyPlayer }
    | { type: 'PLAYER_LEFT'; peerId: string }
    | { type: 'USERNAME_UPDATE'; username: string; peerId?: string }  // peerId set when host re-broadcasts to others
    | { type: 'PING'; ts: number }
    | { type: 'PONG'; ts: number }
    | { type: 'START_GAME' };

const PLAYER_COLORS: Record<number, string> = {
    0: '#818cf8', // indigo  – HOST / P1
    1: '#34d399', // emerald – P2
    2: '#f472b6', // pink    – P3
};

const SLOT_LABELS = ['P1 (HOST)', 'P2', 'P3'];
const LOBBY_PREFIX = 'lby_';

// ─── Local username persistence ───────────────────────────────────────────────
function getStoredUsername(): string {
    try {
        return localStorage.getItem('azri_lobby_username') || `Player${Math.floor(Math.random() * 900) + 100}`;
    } catch { return `Player${Math.floor(Math.random() * 900) + 100}`; }
}
function saveUsername(name: string) {
    try { localStorage.setItem('azri_lobby_username', name); } catch { }
}

// ─── Player Slot component ─────────────────────────────────────────────────────
interface PlayerSlotProps {
    slot: number;
    username?: string;
    isYou: boolean;
    isConnected: boolean;
    isWaiting: boolean;
    pingMs?: number | null;   // undefined = pending, null = not yet pinged
    onPing?: () => void;
}

function PlayerSlot({ slot, username, isYou, isConnected, isWaiting, pingMs, onPing }: PlayerSlotProps) {
    const color = PLAYER_COLORS[slot];
    const isActive = isYou || isConnected;
    const label = SLOT_LABELS[slot];

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
                    isWaiting && 'animate-pulse'
                )}
                style={{
                    borderColor: color,
                    color,
                    backgroundColor: isActive ? `${color}22` : 'transparent',
                    fontFamily: "'VT323', monospace",
                }}
            >
                {isWaiting ? '?' : !isActive ? '—' : slot + 1}
            </div>

            {/* Slot label */}
            <div
                className="text-xs uppercase tracking-widest font-bold"
                style={{ fontFamily: "'VT323', monospace", color }}
            >
                {label}
            </div>

            {/* Username */}
            {isActive && username && (
                <div
                    className="text-sm text-white text-center truncate w-full px-1"
                    style={{ fontFamily: "'VT323', monospace", maxWidth: '100%' }}
                    title={username}
                >
                    {username}
                </div>
            )}

            {/* Status badge */}
            <div
                className="text-[11px] uppercase tracking-wider"
                style={{ fontFamily: "'VT323', monospace", color: '#71717a' }}
            >
                {isYou ? '▶ YOU' :
                    isConnected ? '✓ READY' :
                        isWaiting ? '· · ·' :
                            'EMPTY'}
            </div>

            {/* Ping button (only for non-local connected slots) */}
            {isConnected && !isYou && onPing && (
                <button
                    onClick={onPing}
                    title="Ping this player"
                    className="px-2 py-0.5 border text-[11px] uppercase tracking-wider transition-all hover:brightness-125 active:scale-95"
                    style={{
                        fontFamily: "'VT323', monospace",
                        borderColor: color,
                        color: pingMs === undefined ? '#facc15' : typeof pingMs === 'number' ? '#4ade80' : color,
                        backgroundColor: 'transparent',
                    }}
                >
                    {pingMs === undefined ? '⏳ PINGING…' :
                        typeof pingMs === 'number' ? `🏓 ${pingMs}ms` :
                            '🏓 PING'}
                </button>
            )}
        </div>
    );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
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

    // ── Levels
    const [levels, setLevels] = useState<(Pick<LevelEntity, 'id' | 'name' | 'updated_at'> & { isPhysicalFile?: boolean; filePath?: string; rawData?: any })[]>([]);
    const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);

    // ── Host-specific
    const [generatedHostId, setGeneratedHostId] = useState('');
    const [copied, setCopied] = useState(false);

    // ── Join-specific
    const [joinInput, setJoinInput] = useState('');
    const joinInputRef = useRef<HTMLInputElement>(null);

    // ── Username
    const [myUsername, setMyUsername] = useState(getStoredUsername);
    const [editingUsername, setEditingUsername] = useState(false);
    const [usernameInput, setUsernameInput] = useState('');
    const usernameInputRef = useRef<HTMLInputElement>(null);

    // ── Lobby peer (pre-game signalling)
    const lobbyPeerRef = useRef<Peer | null>(null);
    // host→clients connections Map, or (client) single connection to host
    const lobbyConnsRef = useRef<Map<string, DataConnection>>(new Map());
    const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
    const [myLobbySlot, setMyLobbySlot] = useState<number>(0);
    // peerId → pending ping timestamp
    const pingStartRef = useRef<Map<string, number>>(new Map());
    const [pingStatus, setPingStatus] = useState<Map<string, number | undefined>>(new Map());
    // Peer-level errors
    const [lobbyError, setLobbyError] = useState<string | null>(null);

    // ─── Level loading ─────────────────────────────────────────────────────────
    const loadLevels = async (keepSelection = false) => {
        const dbLevels = levelRepo.getAll();
        let physicalMaps: any[] = [];

        // @ts-ignore
        if (window.electronAPI?.readMaps) {
            // @ts-ignore
            physicalMaps = await window.electronAPI.readMaps();
        } else {
            try {
                // @ts-ignore
                const mapModules = import.meta.glob('/public/maps/*.json', { query: '?raw', import: 'default' });
                for (const path in mapModules) {
                    try {
                        const content = await mapModules[path]();
                        const parsed = JSON.parse(content as string);
                        if (parsed.id && parsed.name) physicalMaps.push({ ...parsed, filePath: path });
                    } catch { }
                }
            } catch { }
        }

        const formattedPhysical = physicalMaps.map((m: any) => ({
            id: m.id, name: m.name,
            updated_at: m.updated_at || Date.now(),
            isPhysicalFile: true, filePath: m.filePath, rawData: m,
        }));

        const physicalIds = new Set(formattedPhysical.map((m: any) => m.id));
        const uniqueDbLevels = dbLevels.filter(lvl => !physicalIds.has(lvl.id));
        const all = [...formattedPhysical, ...uniqueDbLevels];

        // Deduplicate by id just in case
        const seen = new Set<string>();
        const deduped = all.filter(lvl => { if (seen.has(lvl.id)) return false; seen.add(lvl.id); return true; });

        setLevels(deduped);
        if (deduped.length > 0 && !keepSelection) setSelectedLevelId(deduped[0].id);
    };

    useEffect(() => { loadLevels(); }, []);

    // ─── Import map ────────────────────────────────────────────────────────────
    const handleImportMap = async () => {
        // @ts-ignore
        if (window.electronAPI?.importMap) {
            try {
                // @ts-ignore
                const newMap = await window.electronAPI.importMap();
                if (newMap) { await loadLevels(true); setSelectedLevelId(newMap.id); }
            } catch (e) { console.error('Failed to import map:', e); alert('Failed to import map.'); }
        } else {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = async (e: any) => {
                const file = e.target.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const content = event.target?.result as string;
                        const parsed = JSON.parse(content);
                        if (parsed.id && parsed.name) {
                            const { default: repo } = await import('../db/repositories/LevelRepository');
                            const existing = repo.getById(parsed.id);
                            const payload = {
                                id: parsed.id || 'imported-' + Date.now(),
                                name: parsed.name || 'Imported Map',
                                width: parsed.width || 1000, height: parsed.height || 1000,
                                tiles_data: typeof parsed.tiles_data === 'string' ? parsed.tiles_data : JSON.stringify(parsed.tiles_data || []),
                                characters_data: typeof parsed.characters_data === 'string' ? parsed.characters_data : JSON.stringify(parsed.characters_data || []),
                                layers_data: typeof parsed.layers_data === 'string' ? parsed.layers_data : JSON.stringify(parsed.layers_data || []),
                                skybox_data: typeof parsed.skybox_data === 'string' ? parsed.skybox_data : JSON.stringify(parsed.skybox_data || []),
                                collision_data: typeof parsed.collision_data === 'string' ? parsed.collision_data : JSON.stringify(parsed.collision_data || []),
                                level_images_data: typeof parsed.level_images_data === 'string' ? parsed.level_images_data : JSON.stringify(parsed.level_images_data || []),
                                physics_data: typeof parsed.physics_data === 'string' ? parsed.physics_data : JSON.stringify(parsed.physics_data || {}),
                                tilesheets_data: typeof parsed.tilesheets_data === 'string' ? parsed.tilesheets_data : JSON.stringify(parsed.tilesheets_data || []),
                                tile_defs_data: typeof parsed.tile_defs_data === 'string' ? parsed.tile_defs_data : JSON.stringify(parsed.tile_defs_data || []),
                            };
                            if (existing) repo.update(parsed.id, payload); else repo.create(payload);
                            await loadLevels(true); setSelectedLevelId(parsed.id);
                        } else { throw new Error('Invalid map format'); }
                    } catch (err) { console.error(err); alert('Invalid map file'); }
                };
                reader.readAsText(file);
            };
            input.click();
        }
    };

    // ─── Focus join input ──────────────────────────────────────────────────────
    useEffect(() => {
        if (screen === 'join_input') setTimeout(() => joinInputRef.current?.focus(), 100);
    }, [screen]);

    // ─── Load a level into the editor ─────────────────────────────────────────
    const handleLoadMap = async (levelId: string) => {
        const targetMap = levels.find(l => l.id === levelId);
        let data: any;

        if (targetMap?.isPhysicalFile) {
            data = targetMap.rawData;
        } else {
            const { default: repo } = await import('../db/repositories/LevelRepository');
            data = repo.getById(levelId);
        }
        if (!data) return;

        const sp = (val: any, fb: any) => { if (!val) return fb; if (typeof val === 'string') return JSON.parse(val); return val; };
        loadLevel({
            id: data.id, name: data.name,
            tiles: sp(data.tiles_data, []),
            characters: sp(data.characters_data, []),
            layers: sp(data.layers_data, []),
            skyboxLayers: sp(data.skybox_data, []),
            levelImages: sp(data.level_images_data, []),
            physics: sp(data.physics_data, {}),
            collisionShapes: sp(data.collision_data, []),
            importedTilesheets: sp(data.tilesheets_data, []),
            availableTiles: sp(data.tile_defs_data, []),
        });
    };

    // ─── Lobby peer helpers ────────────────────────────────────────────────────
    const sendToConn = (conn: DataConnection, msg: LobbyMsg) => { try { if (conn.open) conn.send(msg); } catch { } };

    const broadcastLobby = useCallback((msg: LobbyMsg) => {
        lobbyConnsRef.current.forEach(conn => sendToConn(conn, msg));
    }, []);

    const destroyLobbyPeer = useCallback(() => {
        lobbyConnsRef.current.forEach(conn => { try { conn.close(); } catch { } });
        lobbyConnsRef.current.clear();
        if (lobbyPeerRef.current) {
            try { lobbyPeerRef.current.destroy(); } catch { }
            lobbyPeerRef.current = null;
        }
    }, []);

    // ─── USERNAME ──────────────────────────────────────────────────────────────
    const commitUsername = (name: string) => {
        const trimmed = name.trim().slice(0, 20) || myUsername;
        setMyUsername(trimmed);
        saveUsername(trimmed);
        setEditingUsername(false);
        // Broadcast to lobby if connected
        broadcastLobby({ type: 'USERNAME_UPDATE', username: trimmed });
        // Update local slot
        setLobbyPlayers(prev => prev.map(p => p.slot === myLobbySlot ? { ...p, username: trimmed } : p));
    };

    // ─── HOST FLOW ─────────────────────────────────────────────────────────────
    const handleStartHosting = async () => {
        if (!selectedLevelId) return;
        await handleLoadMap(selectedLevelId);
        const suffix = Math.random().toString(36).substring(2, 8);
        const newId = `azri${suffix}`;
        setGeneratedHostId(newId);
        setIsMultiplayerHost(true);
        setMultiplayerHostId(newId);
        setMyLobbySlot(0);

        // Seed the lobby players with ourselves as host
        const meAsHost: LobbyPlayer = { peerId: 'host', username: myUsername, slot: 0 };
        setLobbyPlayers([meAsHost]);

        setScreen('host_waiting');
        navigator.clipboard.writeText(newId).catch(() => { });
    };

    // Start lobby peer when host enters waiting room
    useEffect(() => {
        if (screen !== 'host_waiting' || !generatedHostId) return;

        setLobbyError(null);
        const lobbyId = LOBBY_PREFIX + generatedHostId;
        const peer = new Peer(lobbyId);
        lobbyPeerRef.current = peer;

        peer.on('open', () => { console.log('[Lobby] Host peer open:', lobbyId); });

        peer.on('connection', (conn) => {
            conn.on('open', () => {
                console.log('[Lobby] Client connected:', conn.peer);
                lobbyConnsRef.current.set(conn.peer, conn);

                // Determine slot for new joiner
                setLobbyPlayers(prev => {
                    const usedSlots = new Set(prev.map(p => p.slot));
                    const slot = [1, 2].find(s => !usedSlots.has(s)) ?? 1;
                    const newPlayer: LobbyPlayer = { peerId: conn.peer, username: 'Player???', slot };
                    const updated = [...prev, newPlayer];

                    // Send WELCOME to new joiner
                    sendToConn(conn, { type: 'WELCOME', players: updated, yourSlot: slot });
                    // Broadcast PLAYER_JOINED to everyone else
                    lobbyConnsRef.current.forEach((c, pid) => {
                        if (pid !== conn.peer) sendToConn(c, { type: 'PLAYER_JOINED', player: newPlayer });
                    });
                    return updated;
                });
            });

            conn.on('data', (raw) => {
                const msg = raw as LobbyMsg;
                if (msg.type === 'HELLO') {
                    setLobbyPlayers(prev => {
                        const updated = prev.map(p => p.peerId === conn.peer ? { ...p, username: msg.username } : p);
                        // Send refreshed WELCOME with correct username
                        sendToConn(conn, { type: 'WELCOME', players: updated, yourSlot: updated.find(p => p.peerId === conn.peer)?.slot ?? 1 });
                        // Broadcast updated PLAYER_JOINED
                        const joining = updated.find(p => p.peerId === conn.peer);
                        if (joining) {
                            lobbyConnsRef.current.forEach((c, pid) => {
                                if (pid !== conn.peer) sendToConn(c, { type: 'PLAYER_JOINED', player: joining });
                            });
                        }
                        return updated;
                    });
                }
                if (msg.type === 'USERNAME_UPDATE') {
                    setLobbyPlayers(prev => prev.map(p => p.peerId === conn.peer ? { ...p, username: msg.username } : p));
                    // Re-broadcast to other connected clients with the sender's peerId attached
                    lobbyConnsRef.current.forEach((c, pid) => {
                        if (pid !== conn.peer) sendToConn(c, { type: 'USERNAME_UPDATE', username: msg.username, peerId: conn.peer });
                    });
                }
                if (msg.type === 'PONG') {
                    const sent = pingStartRef.current.get(conn.peer);
                    if (sent !== undefined) {
                        const rtt = Date.now() - sent;
                        pingStartRef.current.delete(conn.peer);
                        setPingStatus(prev => { const m = new Map(prev); m.set(conn.peer, rtt); return m; });
                    }
                }
            });

            conn.on('close', () => {
                console.log('[Lobby] Client left:', conn.peer);
                lobbyConnsRef.current.delete(conn.peer);
                setLobbyPlayers(prev => prev.filter(p => p.peerId !== conn.peer));
                broadcastLobby({ type: 'PLAYER_LEFT', peerId: conn.peer });
            });
        });

        peer.on('error', (err) => {
            console.error('[Lobby] Host peer error:', err);
            setLobbyError(`Lobby connection error: ${err.type}`);
        });

        return () => { destroyLobbyPeer(); };
    }, [screen, generatedHostId]);

    // ─── JOIN FLOW ─────────────────────────────────────────────────────────────
    const handleJoin = () => {
        const hostId = joinInput.trim().toLowerCase();
        if (!hostId) return;
        setMultiplayerHostId(hostId);
        setIsMultiplayerHost(false);
        setScreen('join_connecting');

        // Create lobby peer for client
        destroyLobbyPeer();
        const peer = new Peer(); // random PeerJS-assigned ID
        lobbyPeerRef.current = peer;

        peer.on('open', (myId) => {
            console.log('[Lobby] Client peer open:', myId);
            const lobbyHostId = LOBBY_PREFIX + hostId;
            const conn = peer.connect(lobbyHostId, { reliable: true });

            conn.on('open', () => {
                console.log('[Lobby] Connected to host lobby');
                lobbyConnsRef.current.set(conn.peer, conn);
                // Send HELLO with our username
                sendToConn(conn, { type: 'HELLO', username: myUsername });
                setScreen('join_connected');
            });

            conn.on('data', (raw) => {
                const msg = raw as LobbyMsg;
                if (msg.type === 'WELCOME') {
                    setLobbyPlayers(msg.players);
                    setMyLobbySlot(msg.yourSlot);
                }
                if (msg.type === 'PLAYER_JOINED') {
                    setLobbyPlayers(prev => {
                        if (prev.some(p => p.peerId === msg.player.peerId)) return prev;
                        return [...prev, msg.player];
                    });
                }
                if (msg.type === 'PLAYER_LEFT') {
                    setLobbyPlayers(prev => prev.filter(p => p.peerId !== msg.peerId));
                }
                if (msg.type === 'USERNAME_UPDATE' && msg.peerId) {
                    setLobbyPlayers(prev => prev.map(p => p.peerId === msg.peerId ? { ...p, username: msg.username } : p));
                }
                if (msg.type === 'START_GAME') {
                    console.log('[Lobby] Host started game, joining...');
                    destroyLobbyPeer();
                    if (!isPlaying) togglePlayMode();
                    setShowMultiplayerLobby(false);
                }
                if (msg.type === 'PING') {
                    sendToConn(conn, { type: 'PONG', ts: msg.ts });
                }
            });

            conn.on('close', () => {
                console.log('[Lobby] Disconnected from host');
                setLobbyError('Disconnected from host lobby.');
            });

            conn.on('error', (err) => {
                console.error('[Lobby] Connection error:', err);
                setLobbyError('Failed to connect to host. Make sure the ID is correct.');
                setScreen('join_input');
            });
        });

        peer.on('error', (err) => {
            console.error('[Lobby] Client peer error:', err);
            setLobbyError(`Lobby error: ${err.type}. Try again.`);
            setScreen('join_input');
        });
    };

    // ─── Ping a player ─────────────────────────────────────────────────────────
    const handlePing = useCallback((peerId: string) => {
        const conn = lobbyConnsRef.current.get(peerId);
        if (!conn || !conn.open) return;
        pingStartRef.current.set(peerId, Date.now());
        setPingStatus(prev => { const m = new Map(prev); m.set(peerId, undefined); return m; });
        sendToConn(conn, { type: 'PING', ts: Date.now() });

        // Timeout after 5s
        setTimeout(() => {
            setPingStatus(prev => {
                if (prev.get(peerId) === undefined) {
                    const m = new Map(prev); m.set(peerId, -1); return m;
                }
                return prev;
            });
        }, 5000);
    }, []);

    // ─── Start game (HOST ONLY) ────────────────────────────────────────────────
    const handleStartGame = () => {
        // Signal clients to start
        broadcastLobby({ type: 'START_GAME' });
        destroyLobbyPeer();
        if (!isPlaying) togglePlayMode();
        setShowMultiplayerLobby(false);
    };

    const handleCopyId = () => {
        navigator.clipboard.writeText(generatedHostId).catch(() => { });
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleClose = () => {
        destroyLobbyPeer();
        setShowMultiplayerLobby(false);
    };

    // ─── Build slot display ────────────────────────────────────────────────────
    const getSlotProps = (slotIndex: number): PlayerSlotProps => {
        const player = lobbyPlayers.find(p => p.slot === slotIndex);
        const isMe = slotIndex === myLobbySlot;

        if (!player) {
            return { slot: slotIndex, isYou: false, isConnected: false, isWaiting: slotIndex <= 1, pingMs: null, onPing: undefined };
        }

        const pms = pingStatus.get(player.peerId);
        return {
            slot: slotIndex,
            username: player.username,
            isYou: isMe,
            isConnected: !isMe,
            isWaiting: false,
            pingMs: pms === -1 ? null : pms,
            onPing: !isMe ? () => handlePing(player.peerId) : undefined,
        };
    };

    // ─── Username editor widget ────────────────────────────────────────────────
    const UsernameEditor = () => (
        <div className="border-2 border-zinc-800 bg-zinc-950 p-3 flex items-center gap-3">
            <div className="text-zinc-500 text-xs uppercase tracking-widest" style={{ fontFamily: "'VT323', monospace" }}>
                YOUR NAME:
            </div>
            {editingUsername ? (
                <input
                    ref={usernameInputRef}
                    className="flex-1 bg-black text-white border-2 border-indigo-500 outline-none px-2 py-1 text-lg uppercase tracking-widest"
                    style={{ fontFamily: "'VT323', monospace" }}
                    value={usernameInput}
                    maxLength={20}
                    autoFocus
                    onChange={e => setUsernameInput(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commitUsername(usernameInput);
                        if (e.key === 'Escape') setEditingUsername(false);
                    }}
                />
            ) : (
                <div
                    className="flex-1 text-indigo-300 text-lg uppercase tracking-widest"
                    style={{ fontFamily: "'VT323', monospace" }}
                >
                    {myUsername}
                </div>
            )}
            <button
                onClick={() => {
                    if (editingUsername) { commitUsername(usernameInput); }
                    else { setUsernameInput(myUsername); setEditingUsername(true); }
                }}
                className="px-3 py-1 border-2 border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white text-sm uppercase tracking-wider transition-all"
                style={{ fontFamily: "'VT323', monospace" }}
            >
                {editingUsername ? '✓ OK' : '✏ EDIT'}
            </button>
        </div>
    );

    // ─── Render ────────────────────────────────────────────────────────────────
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
                    zIndex: 1,
                }}
            />

            <div
                className="relative z-10 w-full max-w-2xl mx-4 flex flex-col border-4"
                style={{
                    borderColor: '#6366f1',
                    backgroundColor: '#09090b',
                    boxShadow: '0 0 60px rgba(99,102,241,0.4), 0 0 120px rgba(99,102,241,0.15)',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b-4 sticky top-0 z-10"
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
                <div className="p-6 flex flex-col gap-4">

                    {/* Lobby error banner */}
                    {lobbyError && (
                        <div
                            className="border-2 border-red-600 bg-red-950/40 px-4 py-2 text-red-400 text-sm uppercase tracking-wider flex items-center justify-between"
                            style={{ fontFamily: "'VT323', monospace" }}
                        >
                            <span>⚠ {lobbyError}</span>
                            <button onClick={() => setLobbyError(null)} className="text-red-600 hover:text-red-300 ml-4">✕</button>
                        </div>
                    )}

                    {/* ── MAIN MENU ── */}
                    {screen === 'menu' && (
                        <div className="flex flex-col gap-4">
                            <UsernameEditor />

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
                            <UsernameEditor />

                            <div
                                className="text-xl text-indigo-400 uppercase tracking-widest"
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
                                    {levels.map((lvl, i) => (
                                        <button
                                            key={`${lvl.id}_${i}`}
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
                                                    {selectedLevelId === lvl.id ? '▶ ' : '  '}
                                                    {lvl.name}{lvl.isPhysicalFile && <span className="text-yellow-400 text-sm ml-2">(MAPS FOLDER)</span>}
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
                                    onClick={handleImportMap}
                                    className="flex-1 py-3 border-2 border-yellow-600 text-yellow-500 hover:text-white hover:bg-yellow-600 hover:border-yellow-500 uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-lg"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    📥 IMPORT MAP
                                </button>
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
                                    className="flex-2 py-3 px-6 border-2 border-indigo-500 bg-indigo-600 hover:bg-indigo-500 text-white uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xl"
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
                            <div className="flex items-center justify-between">
                                <div
                                    className="text-xl text-indigo-400 uppercase tracking-widest"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    🏠 WAITING FOR PLAYERS…
                                </div>
                                <div
                                    className="text-xs text-emerald-400 uppercase tracking-widest animate-pulse"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ● LOBBY ACTIVE
                                </div>
                            </div>

                            <UsernameEditor />

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
                                {[0, 1, 2].map(slot => (
                                    <PlayerSlot key={slot} {...getSlotProps(slot)} />
                                ))}
                            </div>

                            {/* Connected player count */}
                            <div
                                className="text-xs text-zinc-500 uppercase tracking-wider text-center"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                {lobbyPlayers.length - 1} PLAYER(S) CONNECTED · MAP: {levels.find(l => l.id === selectedLevelId)?.name || selectedLevelId}
                            </div>

                            {/* Actions — only HOST can start */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        destroyLobbyPeer();
                                        setIsMultiplayerHost(false);
                                        setMultiplayerHostId(null);
                                        setLobbyPlayers([]);
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
                            <UsernameEditor />

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
                                        {levels.map((l, i) => (
                                            <option key={`${l.id}_${i}`} value={l.id}>{l.name}{l.isPhysicalFile ? ' (MAPS FOLDER)' : ''}</option>
                                        ))}
                                    </select>
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={handleImportMap}
                                            className="px-4 py-2 border-2 border-yellow-600 text-yellow-500 hover:text-white hover:bg-yellow-600 text-sm uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                            style={{ fontFamily: "'VT323', monospace" }}
                                        >
                                            📥 IMPORT MAP
                                        </button>
                                        {selectedLevelId && (
                                            <button
                                                onClick={() => handleLoadMap(selectedLevelId)}
                                                className="flex-1 py-2 border-2 border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white text-sm uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                                style={{ fontFamily: "'VT323', monospace" }}
                                            >
                                                LOAD MAP INTO EDITOR
                                            </button>
                                        )}
                                    </div>
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
                            <button
                                onClick={() => { destroyLobbyPeer(); setScreen('join_input'); }}
                                className="px-4 py-2 border-2 border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 uppercase tracking-widest text-sm transition-all"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                CANCEL
                            </button>
                        </div>
                    )}

                    {/* ── JOIN: CONNECTED (waiting for host to start) ── */}
                    {screen === 'join_connected' && (
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center justify-between">
                                <div
                                    className="text-2xl text-emerald-400 uppercase tracking-widest"
                                    style={{ fontFamily: "'VT323', monospace", textShadow: '0 0 15px rgba(52,211,153,0.8)' }}
                                >
                                    ✓ CONNECTED TO HOST!
                                </div>
                                <div
                                    className="text-xs text-emerald-400 uppercase tracking-widest animate-pulse"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    ● LIVE
                                </div>
                            </div>

                            <UsernameEditor />

                            {/* Player slots */}
                            <div className="grid grid-cols-3 gap-3">
                                {[0, 1, 2].map(slot => (
                                    <PlayerSlot key={slot} {...getSlotProps(slot)} />
                                ))}
                            </div>

                            {/* Status message — CLIENT cannot start the game */}
                            <div
                                className="text-sm text-zinc-400 text-center uppercase tracking-wider border-2 border-cyan-900/60 p-4 bg-cyan-950/20 animate-pulse"
                                style={{ fontFamily: "'VT323', monospace" }}
                            >
                                YOU ARE <span className="text-emerald-400">PLAYER {myLobbySlot + 1}</span>.<br />
                                <span className="text-zinc-500 text-xs">WAITING FOR THE HOST TO START THE GAME…</span>
                            </div>

                            {/* Ping the host */}
                            {lobbyPlayers.find(p => p.slot === 0) && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => {
                                            const host = lobbyPlayers.find(p => p.slot === 0);
                                            if (host) handlePing(host.peerId);
                                        }}
                                        className="px-5 py-2 border-2 border-indigo-700 text-indigo-400 hover:border-indigo-400 hover:text-indigo-200 uppercase tracking-widest text-sm transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                        style={{ fontFamily: "'VT323', monospace" }}
                                    >
                                        {(() => {
                                            const host = lobbyPlayers.find(p => p.slot === 0);
                                            if (!host) return '🏓 PING HOST';
                                            const pms = pingStatus.get(host.peerId);
                                            return pms === undefined ? '⏳ PINGING…' : typeof pms === 'number' ? `🏓 PING HOST (${pms}ms)` : '🏓 PING HOST';
                                        })()}
                                    </button>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        destroyLobbyPeer();
                                        setIsMultiplayerHost(false);
                                        setMultiplayerHostId(null);
                                        setLobbyPlayers([]);
                                        setScreen('menu');
                                    }}
                                    className="flex-1 py-3 border-2 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 uppercase tracking-widest shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all text-lg"
                                    style={{ fontFamily: "'VT323', monospace" }}
                                >
                                    LEAVE
                                </button>
                                {/* NOTE: No START GAME button for clients — host controls when game begins */}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t-2 border-zinc-800 flex items-center justify-between">
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
