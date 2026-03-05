/**
 * MultiplayerLobbyModal — Modern multiplayer lobby screen.
 * HOST flow: pick a map → generate ID → wait for players (real lobby peer)
 * JOIN flow: enter Host ID → connect via lobby peer → wait for host to start
 *
 * Lobby PeerJS IDs use a `lby_` prefix to avoid conflicting with the game's peer.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { PEER_CONFIG } from '../utils/peerConfig';
import { clsx } from 'clsx';
import { useEditorStore } from '../state/editorStore';
import levelRepo from '../db/repositories/LevelRepository';
import type { LevelEntity } from '../db/repositories/LevelRepository';
import {
    Users,
    Wifi,
    Play,
    LogOut,
    Gamepad2,
    Globe,
    Hash,
    Download,
    RefreshCw,
    CheckCircle2,
    Server,
    Clock,
    Copy,
    Check,
    Edit2,
    X
} from 'lucide-react';

// ─── Lobby types ──────────────────────────────────────────────────────────────
interface LobbyPlayer {
    peerId: string;
    username: string;
    slot: number; // 0 = host, 1 = P2, 2 = P3
    pingMs?: number | null; // null = not pinged, undefined = ping pending
}

interface SessionInfo {
    hostId: string;
    mapName: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
}

type BrokerMsg =
    | { type: 'REGISTER'; session: SessionInfo }
    | { type: 'UNREGISTER'; hostId: string }
    | { type: 'SESSION_UPDATE'; session: SessionInfo }
    | { type: 'LIST_REQUEST' }
    | { type: 'SESSION_LIST'; sessions: SessionInfo[] };

// Add LANSESSION to support the combined list
interface LAN_SessionInfo extends SessionInfo {
    isLan?: boolean;
    ip?: string;
}

type LobbyMsg =
    | { type: 'HELLO'; username: string }
    | { type: 'WELCOME'; players: LobbyPlayer[]; yourSlot: number }
    | { type: 'PLAYER_JOINED'; player: LobbyPlayer }
    | { type: 'PLAYER_LEFT'; peerId: string }
    | { type: 'USERNAME_UPDATE'; username: string; peerId?: string }  // peerId set when host re-broadcasts to others
    | { type: 'PING'; ts: number }
    | { type: 'PONG'; ts: number }
    | { type: 'KICK' }  // sent by host to a specific client
    | { type: 'START_GAME' };

const PLAYER_COLORS: Record<number, string> = {
    0: 'from-blue-500 to-indigo-600', // P1 / HOST
    1: 'from-emerald-400 to-teal-500', // P2
    2: 'from-pink-500 to-rose-500', // P3
};

// unused: const BORDER_COLORS: Record<number, string> = {
//     0: 'border-blue-500',
//     1: 'border-emerald-500',
//     2: 'border-pink-500',
// };

// unused: const TEXT_COLORS: Record<number, string> = {
//     0: 'text-blue-400',
//     1: 'text-emerald-400',
//     2: 'text-pink-400',
// };

const SLOT_LABELS = ['Host', 'Player 2', 'Player 3'];
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
    const bgGradient = PLAYER_COLORS[slot];
    // unused: const borderColor = BORDER_COLORS[slot];
    // unused: const textColor = TEXT_COLORS[slot];
    const isActive = isYou || isConnected;
    const label = SLOT_LABELS[slot];

    return (
        <div
            className={clsx(
                'relative overflow-hidden rounded-xl border flex flex-col items-center justify-center p-6 transition-all duration-300',
                isActive ? `bg-zinc-900 border-zinc-700 shadow-lg` : 'bg-zinc-950/50 border-zinc-800/50 dashed-border'
            )}
        >
            {isActive && (
                <div className={clsx("absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-80", bgGradient)}></div>
            )}

            {/* Avatar Circle */}
            <div
                className={clsx(
                    'w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-4 shadow-inner transition-all',
                    isActive ? `bg-gradient-to-br text-white shadow-md shadow-zinc-950 ${bgGradient}` : 'bg-zinc-800 text-zinc-600 border-2 border-zinc-700 border-dashed',
                    isWaiting && 'animate-pulse'
                )}
            >
                {isWaiting ? <Users size={24} className="opacity-50" /> : !isActive ? <Users size={24} className="opacity-20" /> : slot + 1}
            </div>

            {/* Slot label */}
            <div className={clsx("text-xs uppercase tracking-wider font-semibold mb-1", isActive ? "text-zinc-400" : "text-zinc-600")}>
                {label}
            </div>

            {/* Username */}
            {isActive && username ? (
                <div className="text-base text-zinc-100 font-medium text-center truncate w-full px-2" title={username}>
                    {username}
                </div>
            ) : (
                <div className="text-sm text-zinc-600 italic">Waiting...</div>
            )}

            {/* Status badge */}
            <div className="mt-3 min-h-[24px]">
                {isYou ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 text-[10px] uppercase font-semibold tracking-wide border border-zinc-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> You
                    </span>
                ) : isConnected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] uppercase font-semibold tracking-wide border border-emerald-500/20">
                        <CheckCircle2 size={12} /> Ready
                    </span>
                ) : null}
            </div>

            {/* Ping button */}
            {isConnected && !isYou && onPing && (
                <button
                    onClick={onPing}
                    title="Ping this player"
                    className={clsx(
                        "absolute top-3 right-3 p-1.5 rounded-md text-xs transition-colors",
                        pingMs === undefined ? 'bg-yellow-500/10 text-yellow-500' :
                            typeof pingMs === 'number' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' :
                                'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    )}
                >
                    {pingMs === undefined ? <Clock size={14} className="animate-spin-slow" /> :
                        typeof pingMs === 'number' ? <div className="text-[10px] font-mono">{pingMs}ms</div> :
                            <Wifi size={14} />}
                </button>
            )}
        </div>
    );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
type TabState = 'host' | 'join';
type HostFlowState = 'pick_map' | 'waiting';
type JoinFlowState = 'browse' | 'connecting' | 'connected';

export function MultiplayerLobbyModal() {
    const {
        setShowMultiplayerLobby,
        setIsMultiplayerHost,
        setMultiplayerHostId,
        togglePlayMode,
        isPlaying,
        loadLevel,
    } = useEditorStore();

    const [activeTab, setActiveTab] = useState<TabState>('host');
    const [hostScreen, setHostScreen] = useState<HostFlowState>('pick_map');
    const [joinScreen, setJoinScreen] = useState<JoinFlowState>('browse');

    // ── Levels
    const [levels, setLevels] = useState<(Pick<LevelEntity, 'id' | 'name' | 'updated_at'> & { isPhysicalFile?: boolean; filePath?: string; rawData?: any })[]>([]);
    const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
    const [selectedLevelName, setSelectedLevelName] = useState<string>('Unknown Map');

    // ── Host-specific
    const [generatedHostId, setGeneratedHostId] = useState('');
    const [copied, setCopied] = useState(false);

    // ── Join-specific (browse)
    const [sessions, setSessions] = useState<LAN_SessionInfo[]>([]);
    const [sessionsFetching, setSessionsFetching] = useState(false);
    // unused: const [showManualId, setShowManualId] = useState(false);
    const [joinInput, setJoinInput] = useState('');
    const joinInputRef = useRef<HTMLInputElement>(null);
    const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // ── Broker peer (session discovery)
    const BROKER_ID = 'azri_lobby_broker_v2';
    const brokerPeerRef = useRef<Peer | null>(null);
    const brokerConnRef = useRef<DataConnection | null>(null);
    const brokerRegPeerRef = useRef<Peer | null>(null);
    const brokerSessionsRef = useRef<Map<string, SessionInfo>>(new Map());
    const brokerWatchersRef = useRef<Map<string, DataConnection>>(new Map());

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
                                ...parsed, // Simplified for brevity in this template replacement
                                id: parsed.id || 'imported-' + Date.now(),
                                name: parsed.name || 'Imported Map',
                            };
                            if (existing) repo.update(parsed.id, payload); else repo.create(payload as any);
                            await loadLevels(true); setSelectedLevelId(parsed.id);
                        } else { throw new Error('Invalid map format'); }
                    } catch (err) { console.error(err); alert('Invalid map file'); }
                };
                reader.readAsText(file);
            };
            input.click();
        }
    };

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

    // ─── BROKER HELPERS ──────────────────────────────────────────────────────────
    const brokerBroadcastList = useCallback(() => {
        const list: SessionInfo[] = Array.from(brokerSessionsRef.current.values());
        const msg: BrokerMsg = { type: 'SESSION_LIST', sessions: list };
        brokerWatchersRef.current.forEach(conn => { try { if (conn.open) conn.send(msg); } catch { } });
    }, []);

    const becomeBroker = useCallback(() => {
        const bp = new Peer(BROKER_ID, PEER_CONFIG);
        brokerPeerRef.current = bp;
        bp.on('connection', (conn) => {
            conn.on('open', () => {
                brokerWatchersRef.current.set(conn.peer, conn);
                const list = Array.from(brokerSessionsRef.current.values());
                try { conn.send({ type: 'SESSION_LIST', sessions: list } as BrokerMsg); } catch { }
            });
            conn.on('data', (raw) => {
                const msg = raw as BrokerMsg;
                if (msg.type === 'REGISTER') { brokerSessionsRef.current.set(msg.session.hostId, msg.session); brokerBroadcastList(); }
                if (msg.type === 'UNREGISTER') { brokerSessionsRef.current.delete(msg.hostId); brokerBroadcastList(); }
                if (msg.type === 'SESSION_UPDATE') { brokerSessionsRef.current.set(msg.session.hostId, msg.session); brokerBroadcastList(); }
                if (msg.type === 'LIST_REQUEST') {
                    const list = Array.from(brokerSessionsRef.current.values());
                    try { conn.send({ type: 'SESSION_LIST', sessions: list } as BrokerMsg); } catch { }
                }
            });
            conn.on('close', () => brokerWatchersRef.current.delete(conn.peer));
        });
    }, [brokerBroadcastList]);

    const connectToBroker = useCallback((onList: (sessions: SessionInfo[]) => void) => {
        setSessionsFetching(true);
        if (brokerConnRef.current) { try { brokerConnRef.current.close(); } catch { } brokerConnRef.current = null; }

        const tempPeer = new Peer(PEER_CONFIG);
        tempPeer.on('open', () => {
            const conn = tempPeer.connect(BROKER_ID, { reliable: true });
            brokerConnRef.current = conn;
            const timeout = setTimeout(() => {
                setSessionsFetching(false); setSessions([]); try { conn.close(); tempPeer.destroy(); } catch { }
            }, 6000);
            conn.on('open', () => { conn.send({ type: 'LIST_REQUEST' } as BrokerMsg); });
            conn.on('data', (raw) => {
                const msg = raw as BrokerMsg;
                if (msg.type === 'SESSION_LIST') { clearTimeout(timeout); setSessionsFetching(false); setSessions(msg.sessions); onList(msg.sessions); }
            });
            conn.on('error', () => { clearTimeout(timeout); setSessionsFetching(false); setSessions([]); try { tempPeer.destroy(); } catch { } });
            conn.on('close', () => { clearTimeout(timeout); setSessionsFetching(false); try { tempPeer.destroy(); } catch { } });
        });
        tempPeer.on('error', (err) => {
            if ((err as any).type === 'unavailable-id') {
                try { tempPeer.destroy(); } catch { }
                setSessionsFetching(false);
                const retryPeer = new Peer(PEER_CONFIG);
                retryPeer.on('open', () => {
                    const conn = retryPeer.connect(BROKER_ID, { reliable: true });
                    brokerConnRef.current = conn;
                    const t = setTimeout(() => { setSessionsFetching(false); setSessions([]); try { retryPeer.destroy(); } catch { } }, 6000);
                    conn.on('open', () => conn.send({ type: 'LIST_REQUEST' } as BrokerMsg));
                    conn.on('data', (raw2) => {
                        const m = raw2 as BrokerMsg;
                        if (m.type === 'SESSION_LIST') { clearTimeout(t); setSessionsFetching(false); setSessions(m.sessions); onList(m.sessions); }
                    });
                    conn.on('error', () => { clearTimeout(t); setSessionsFetching(false); setSessions([]); try { retryPeer.destroy(); } catch { } });
                    conn.on('close', () => { clearTimeout(t); setSessionsFetching(false); try { retryPeer.destroy(); } catch { } });
                });
                return;
            }
            try { tempPeer.destroy(); } catch { }
            becomeBroker();
            setSessionsFetching(false); setSessions([]); onList([]);
        });
    }, [becomeBroker]);

    const registerSession = useCallback((session: SessionInfo) => {
        if (brokerPeerRef.current) { brokerSessionsRef.current.set(session.hostId, session); brokerBroadcastList(); return; }
        if (brokerRegPeerRef.current) { try { brokerRegPeerRef.current.destroy(); } catch { } brokerRegPeerRef.current = null; }
        const peer = new Peer(PEER_CONFIG);
        brokerRegPeerRef.current = peer;
        peer.on('open', () => {
            const conn = peer.connect(BROKER_ID, { reliable: true });
            conn.on('open', () => { conn.send({ type: 'REGISTER', session } as BrokerMsg); (peer as any)._regConn = conn; });
        });
        peer.on('error', () => { becomeBroker(); brokerSessionsRef.current.set(session.hostId, session); brokerRegPeerRef.current = null; });
    }, [becomeBroker, brokerBroadcastList]);

    const unregisterSession = useCallback((hostId: string) => {
        if (brokerPeerRef.current) { brokerSessionsRef.current.delete(hostId); brokerBroadcastList(); return; }
        const regConn = (brokerRegPeerRef.current as any)?._regConn as DataConnection | undefined;
        if (regConn && regConn.open) { try { regConn.send({ type: 'UNREGISTER', hostId } as BrokerMsg); } catch { } }
    }, [brokerBroadcastList]);

    const updateSessionCount = useCallback((hostId: string, mapName: string, hostName: string, playerCount: number) => {
        const session: SessionInfo = { hostId, mapName, hostName, playerCount, maxPlayers: 3 };
        if (brokerPeerRef.current) { brokerSessionsRef.current.set(hostId, session); brokerBroadcastList(); return; }
        const regConn = (brokerRegPeerRef.current as any)?._regConn as DataConnection | undefined;
        if (regConn && regConn.open) { try { regConn.send({ type: 'SESSION_UPDATE', session } as BrokerMsg); } catch { } }
    }, [brokerBroadcastList]);

    // ─── USERNAME ──────────────────────────────────────────────────────────────
    const commitUsername = (name: string) => {
        const trimmed = name.trim().slice(0, 20) || myUsername;
        setMyUsername(trimmed);
        saveUsername(trimmed);
        setEditingUsername(false);
        broadcastLobby({ type: 'USERNAME_UPDATE', username: trimmed });
        setLobbyPlayers(prev => prev.map(p => p.slot === myLobbySlot ? { ...p, username: trimmed } : p));
    };

    // ─── HOST FLOW ─────────────────────────────────────────────────────────────────────────
    const handleStartHosting = async () => {
        if (!selectedLevelId) return;
        const mapName = levels.find(l => l.id === selectedLevelId)?.name || 'Unknown Map';
        setSelectedLevelName(mapName);
        await handleLoadMap(selectedLevelId);
        const suffix = Math.random().toString(36).substring(2, 8);
        const newId = `azri${suffix}`;
        setGeneratedHostId(newId);
        setIsMultiplayerHost(true);
        setMultiplayerHostId(newId);
        setMyLobbySlot(0);

        const meAsHost: LobbyPlayer = { peerId: 'host', username: myUsername, slot: 0 };
        setLobbyPlayers([meAsHost]);

        setHostScreen('waiting');
        navigator.clipboard.writeText(newId).catch(() => { });

        // Announce our presence to the Local Area Network using the new API
        try {
            fetch('/api/lan/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'start',
                    session: {
                        hostId: newId,
                        mapName,
                        hostName: myUsername,
                        playerCount: 1,
                        maxPlayers: 3
                    }
                })
            }).catch(console.error);
        } catch (e) {
            console.error('Failed to notify LAN of host status', e);
        }
    };

    // ── LAN polling interval
    useEffect(() => {
        if (activeTab !== 'join') return;

        let isMounted = true;
        const fetchLanHosts = async () => {
            try {
                const res = await fetch('/api/lan/hosts');
                const data = await res.json();
                if (isMounted && data.hosts) {
                    // Prepend [LAN] badge to name or somehow handle them!
                    // We'll merge them into the session list state later, just tagging them for now.
                    const lanSessions = data.hosts.map((h: any) => ({ ...h, isLan: true }));

                    setSessions(prev => {
                        // Merge logic: keep all non-LAN broker sessions, and add the LAN sessions
                        const existingBrokerSessions = prev.filter(p => !p.isLan);
                        // Also, remove duplicates if a host is both LAN and Broker
                        const lanIds = new Set(lanSessions.map((l: any) => l.hostId));
                        const filteredBroker = existingBrokerSessions.filter(p => !lanIds.has(p.hostId));
                        return [...lanSessions, ...filteredBroker];
                    });
                }
            } catch (err) {
            }
        };

        // Poll every 2 seconds for LAN changes
        fetchLanHosts();
        const interval = setInterval(fetchLanHosts, 2000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'join') {
            connectToBroker((list) => {
                setSessions(prev => {
                    const lanSessions = prev.filter(p => p.isLan);
                    const listIds = new Set(lanSessions.map(l => l.hostId));
                    const uniqueNewList = list.filter(l => !listIds.has(l.hostId));
                    return [...lanSessions, ...uniqueNewList];
                });
            });
        }
    }, [activeTab]);

    useEffect(() => {
        if (hostScreen !== 'waiting' || !generatedHostId) return;

        setLobbyError(null);
        const lobbyId = LOBBY_PREFIX + generatedHostId;
        const peer = new Peer(lobbyId, PEER_CONFIG);
        lobbyPeerRef.current = peer;

        peer.on('open', () => { registerSession({ hostId: generatedHostId, mapName: selectedLevelName, hostName: myUsername, playerCount: 1, maxPlayers: 3 }); });

        peer.on('connection', (conn) => {
            conn.on('open', () => {
                lobbyConnsRef.current.set(conn.peer, conn);
                setLobbyPlayers(prev => {
                    const usedSlots = new Set(prev.map(p => p.slot));
                    const slot = [1, 2].find(s => !usedSlots.has(s)) ?? 1;
                    const newPlayer: LobbyPlayer = { peerId: conn.peer, username: 'Player???', slot };
                    const updated = [...prev, newPlayer];

                    sendToConn(conn, { type: 'WELCOME', players: updated, yourSlot: slot });
                    lobbyConnsRef.current.forEach((c, pid) => { if (pid !== conn.peer) sendToConn(c, { type: 'PLAYER_JOINED', player: newPlayer }); });
                    updateSessionCount(generatedHostId, selectedLevelName, myUsername, updated.length);
                    return updated;
                });
            });

            conn.on('data', (raw) => {
                const msg = raw as LobbyMsg;
                if (msg.type === 'HELLO') {
                    setLobbyPlayers(prev => {
                        const updated = prev.map(p => p.peerId === conn.peer ? { ...p, username: msg.username } : p);
                        sendToConn(conn, { type: 'WELCOME', players: updated, yourSlot: updated.find(p => p.peerId === conn.peer)?.slot ?? 1 });
                        const joining = updated.find(p => p.peerId === conn.peer);
                        if (joining) {
                            lobbyConnsRef.current.forEach((c, pid) => { if (pid !== conn.peer) sendToConn(c, { type: 'PLAYER_JOINED', player: joining }); });
                        }
                        return updated;
                    });
                }
                if (msg.type === 'USERNAME_UPDATE') {
                    setLobbyPlayers(prev => prev.map(p => p.peerId === conn.peer ? { ...p, username: msg.username } : p));
                    lobbyConnsRef.current.forEach((c, pid) => { if (pid !== conn.peer) sendToConn(c, { type: 'USERNAME_UPDATE', username: msg.username, peerId: conn.peer }); });
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
                lobbyConnsRef.current.delete(conn.peer);
                setLobbyPlayers(prev => {
                    const updated = prev.filter(p => p.peerId !== conn.peer);
                    updateSessionCount(generatedHostId, selectedLevelName, myUsername, updated.length);
                    return updated;
                });
                broadcastLobby({ type: 'PLAYER_LEFT', peerId: conn.peer });
            });
        });

        peer.on('error', (err) => { setLobbyError(`Lobby connection error: ${err.type}`); });
        return () => { destroyLobbyPeer(); };
    }, [hostScreen, generatedHostId]);

    // ─── Join a specific session ───────────────────────
    const handleJoinSession = (hostId: string) => {
        setJoinInput(hostId);
        setMultiplayerHostId(hostId);
        setIsMultiplayerHost(false);
        setJoinScreen('connecting');
        setLobbyError(null);

        if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
        destroyLobbyPeer();
        const joinConfig = { ...PEER_CONFIG };
        // If the user typed an IP or something that looks like an IP, use it. Otherwise, fallback to the local host.
        // For LAN play with local PeerServer, the join input MUST be the IP.

        let targetHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

        // Check if this is a LAN session from our list first
        const lanSession = sessions.find(s => s.hostId === hostId && s.isLan);
        if (lanSession && lanSession.ip) {
            targetHost = lanSession.ip;
        } else if (hostId.includes('.')) {
            targetHost = hostId;
        }

        joinConfig.host = targetHost;

        const peer = new Peer(joinConfig);
        lobbyPeerRef.current = peer;

        joinTimeoutRef.current = setTimeout(() => {
            if (lobbyPeerRef.current === peer) {
                setLobbyError(`Connection timed out (30s). Please check your VPN/Firewall or ensure the Host is still online.`);
                destroyLobbyPeer();
                setJoinScreen('browse');
            }
        }, 30000);

        peer.on('open', () => {
            // Since we're connecting to their specific PeerServer, the Host ID is predictable.
            // On the host machine, they registered with `LOBBY_PREFIX + hostId`.
            // Wait, what is `hostId` here? It's literally what the user typed in the Join box.
            // Let's assume the user typed "192.168.1.5::azri123", we must split it.
            let connectIp = targetHost;
            let connectLobbyId = LOBBY_PREFIX + hostId;
            if (hostId.includes('::')) {
                const parts = hostId.split('::');
                connectIp = parts[0];
                connectLobbyId = LOBBY_PREFIX + parts[1];
                joinConfig.host = connectIp;
            }

            const conn = peer.connect(connectLobbyId, { reliable: true });

            conn.on('open', () => {
                if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
                lobbyConnsRef.current.set(conn.peer, conn);
                sendToConn(conn, { type: 'HELLO', username: myUsername });
                setJoinScreen('connected');
            });

            conn.on('data', (raw) => {
                const msg = raw as LobbyMsg;
                if (msg.type === 'WELCOME') { setLobbyPlayers(msg.players); setMyLobbySlot(msg.yourSlot); }
                if (msg.type === 'PLAYER_JOINED') { setLobbyPlayers(prev => { if (prev.some(p => p.peerId === msg.player.peerId)) return prev; return [...prev, msg.player]; }); }
                if (msg.type === 'PLAYER_LEFT') { setLobbyPlayers(prev => prev.filter(p => p.peerId !== msg.peerId)); }
                if (msg.type === 'USERNAME_UPDATE' && msg.peerId) { setLobbyPlayers(prev => prev.map(p => p.peerId === msg.peerId ? { ...p, username: msg.username } : p)); }
                if (msg.type === 'KICK') {
                    destroyLobbyPeer(); setIsMultiplayerHost(false); setMultiplayerHostId(null); setLobbyPlayers([]);
                    setLobbyError('You were kicked from the lobby by the host.'); setJoinScreen('browse');
                }
                if (msg.type === 'START_GAME') {
                    destroyLobbyPeer();
                    if (!isPlaying) togglePlayMode();
                    setShowMultiplayerLobby(false);
                }
                if (msg.type === 'PING') { sendToConn(conn, { type: 'PONG', ts: msg.ts }); }
            });

            conn.on('close', () => {
                if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
                setLobbyError('Disconnected from host lobby.'); setJoinScreen('browse');
            });
            conn.on('error', () => {
                if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
                setLobbyError('Failed to connect to host.'); setJoinScreen('browse');
            });
        });

        peer.on('error', (err) => {
            if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
            setLobbyError(`Connection error: ${(err as any).type}.`); setJoinScreen('browse');
        });
    };

    const handlePing = useCallback((peerId: string) => {
        const conn = lobbyConnsRef.current.get(peerId);
        if (!conn || !conn.open) return;
        pingStartRef.current.set(peerId, Date.now());
        setPingStatus(prev => { const m = new Map(prev); m.set(peerId, undefined); return m; });
        sendToConn(conn, { type: 'PING', ts: Date.now() });
        setTimeout(() => {
            setPingStatus(prev => { if (prev.get(peerId) === undefined) { const m = new Map(prev); m.set(peerId, -1); return m; } return prev; });
        }, 5000);
    }, []);

    const stopLANBroadcast = (id: string) => {
        try {
            fetch('/api/lan/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop', hostId: id })
            }).catch(e => console.error('Failed to stop LAN broadcast', e));
        } catch (err) { }
    };

    const handleStartGame = () => {
        unregisterSession(generatedHostId);
        stopLANBroadcast(generatedHostId);
        broadcastLobby({ type: 'START_GAME' });
        destroyLobbyPeer();
        if (!isPlaying) togglePlayMode();
        setShowMultiplayerLobby(false);
    };

    const handleCopyId = () => {
        navigator.clipboard.writeText(generatedHostId).catch(() => { });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleClose = () => {
        if (activeTab === 'host' && generatedHostId) {
            stopLANBroadcast(generatedHostId);
        }
        destroyLobbyPeer();
        setShowMultiplayerLobby(false);
    };

    const getSlotProps = (slotIndex: number): PlayerSlotProps => {
        const player = lobbyPlayers.find(p => p.slot === slotIndex);
        const isMe = slotIndex === myLobbySlot;

        if (!player) { return { slot: slotIndex, isYou: false, isConnected: false, isWaiting: slotIndex <= 1, pingMs: null, onPing: undefined }; }
        const pms = pingStatus.get(player.peerId);
        return { slot: slotIndex, username: player.username, isYou: isMe, isConnected: !isMe, isWaiting: false, pingMs: pms === -1 ? null : pms, onPing: !isMe ? () => handlePing(player.peerId) : undefined };
    };

    // ─── UI Variables ────────────────────────────────────────────────
    const isLobbyActive = (activeTab === 'host' && hostScreen === 'waiting') || (activeTab === 'join' && joinScreen === 'connected');

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 bg-zinc-950/80 backdrop-blur-md">
            <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden flex flex-col h-[85vh] max-h-[800px]">

                {/* Header Area */}
                <div className="flex-shrink-0 bg-zinc-900/80 border-b border-zinc-800 relative z-10 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
                            <Gamepad2 size={28} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Multiplayer Lobby</h2>
                            <p className="text-sm text-zinc-500 font-medium tracking-wide">Peer-to-Peer Engine Link</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Profile Pill */}
                        <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-zinc-950/50 rounded-full border border-zinc-800">
                            <span className="text-xs font-semibold text-zinc-500 uppercase">Profile</span>
                            {editingUsername ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={usernameInputRef}
                                        type="text"
                                        className="bg-transparent text-white border-b border-indigo-500 focus:outline-none w-28 text-sm"
                                        value={usernameInput}
                                        maxLength={20}
                                        autoFocus
                                        onChange={e => setUsernameInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitUsername(usernameInput);
                                            if (e.key === 'Escape') setEditingUsername(false);
                                        }}
                                    />
                                    <button onClick={() => commitUsername(usernameInput)} className="text-emerald-400 hover:bg-emerald-400/10 p-1 rounded-md"><Check size={14} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setUsernameInput(myUsername); setEditingUsername(true); }}>
                                    <span className="text-sm font-semibold text-indigo-300 group-hover:text-indigo-200 transition-colors">{myUsername}</span>
                                    <Edit2 size={12} className="text-zinc-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors bg-zinc-950 border border-zinc-800"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 bg-zinc-950 relative overflow-hidden">
                    {/* Error Banner */}
                    {lobbyError && (
                        <div className="absolute top-4 left-4 right-4 z-20 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex items-center justify-between text-rose-400 shadow-lg shadow-rose-500/5 backdrop-blur-md">
                            <div className="flex items-center gap-3 text-sm font-medium">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                                {lobbyError}
                            </div>
                            <button onClick={() => setLobbyError(null)} className="p-1 hover:bg-rose-500/20 rounded-md transition-colors text-rose-400">
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* Content View */}
                    {isLobbyActive ? (
                        // Active Room View
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                            <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">

                                {/* Room Header */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-10 pb-6 border-b border-zinc-800/50">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
                                            <Globe className="text-white" size={24} />
                                        </div>
                                        <div>
                                            <div className="text-sm text-zinc-500 font-semibold uppercase tracking-wider mb-1">Active Session</div>
                                            <div className="text-xl text-zinc-100 font-medium">Map: <span className="text-indigo-300 font-semibold">{selectedLevelName}</span></div>
                                        </div>
                                    </div>

                                    {activeTab === 'host' && generatedHostId && (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-2 pr-4 shadow-sm">
                                                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800/50 text-zinc-400">
                                                    <Hash size={18} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">Invite Code</span>
                                                    <span className="font-mono text-zinc-100 text-sm tracking-widest">{generatedHostId}</span>
                                                </div>
                                                <button
                                                    onClick={handleCopyId}
                                                    className={clsx(
                                                        "ml-2 p-2 rounded-lg transition-all",
                                                        copied ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                                                    )}
                                                    title="Copy Code"
                                                >
                                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                                </button>
                                            </div>
                                            <div className="text-xs text-zinc-500 px-1 border-l-2 border-indigo-500/50 ml-1 pl-2">
                                                To play on LAN, Joiners must point their browser to <strong className="text-zinc-300">your laptop's IP address:5173</strong>.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Player Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-auto">
                                    {[0, 1, 2].map(slot => (
                                        <PlayerSlot key={slot} {...getSlotProps(slot)} />
                                    ))}
                                </div>

                                {/* Bottom Action Bar */}
                                <div className="mt-10 p-6 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex items-center justify-center">
                                            <div className="absolute w-full h-full rounded-full bg-emerald-500/20 animate-ping"></div>
                                            <div className="w-3 h-3 rounded-full bg-emerald-500 relative z-10 border-2 border-zinc-900"></div>
                                        </div>
                                        <span className="text-sm font-medium text-zinc-400">
                                            {lobbyPlayers.length} / 3 Players Connected
                                        </span>
                                    </div>

                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => {
                                                if (activeTab === 'host') {
                                                    unregisterSession(generatedHostId);
                                                    destroyLobbyPeer();
                                                    setIsMultiplayerHost(false);
                                                    setMultiplayerHostId(null);
                                                    setLobbyPlayers([]);
                                                    setHostScreen('pick_map');
                                                } else {
                                                    destroyLobbyPeer();
                                                    setIsMultiplayerHost(false);
                                                    setMultiplayerHostId(null);
                                                    setLobbyPlayers([]);
                                                    setJoinScreen('browse');
                                                }
                                            }}
                                            className="px-6 py-3 rounded-xl border border-zinc-700 text-zinc-300 font-semibold text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                        >
                                            <LogOut size={18} /> Leave Lobby
                                        </button>

                                        {activeTab === 'host' ? (
                                            <button
                                                onClick={handleStartGame}
                                                className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                                            >
                                                <Play size={18} className="fill-current" /> Start Mission
                                            </button>
                                        ) : (
                                            <div className="px-6 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 font-medium text-sm flex items-center gap-2">
                                                <Clock size={16} className="animate-spin-slow" /> Waiting for Host...
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    ) : (
                        // Navigation Tabs & Content (When not in active lobby)
                        <div className="flex-1 flex flex-col min-h-0 bg-zinc-900/30">
                            {/* Tab Headers */}
                            <div className="flex border-b border-zinc-800 bg-zinc-900/50">
                                <button
                                    onClick={() => setActiveTab('host')}
                                    className={clsx(
                                        "flex-1 py-4 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors relative",
                                        activeTab === 'host' ? "text-indigo-400 bg-zinc-900" : "text-zinc-600 hover:text-zinc-400 bg-zinc-950/80 hover:bg-zinc-900/80"
                                    )}
                                >
                                    <Server size={18} /> Deploy Server
                                    {activeTab === 'host' && (
                                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 shadow-[0_-2px_8px_rgba(99,102,241,0.5)]"></div>
                                    )}
                                </button>
                                <div className="w-px bg-zinc-800"></div>
                                <button
                                    onClick={() => setActiveTab('join')}
                                    className={clsx(
                                        "flex-1 py-4 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors relative",
                                        activeTab === 'join' ? "text-cyan-400 bg-zinc-900" : "text-zinc-600 hover:text-zinc-400 bg-zinc-950/80 hover:bg-zinc-900/80"
                                    )}
                                >
                                    <Wifi size={18} /> Connect to Game
                                    {activeTab === 'join' && (
                                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-500 shadow-[0_-2px_8px_rgba(6,182,212,0.5)]"></div>
                                    )}
                                </button>
                            </div>

                            {/* Tab Content Area */}
                            <div className="flex-1 overflow-y-auto p-6 hidden-scrollbar">

                                {/* HOST PANEL */}
                                {activeTab === 'host' && (
                                    <div className="max-w-2xl mx-auto flex flex-col gap-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2"><Globe className="text-indigo-400" size={20} /> Select Mission Area</h3>
                                                <p className="text-sm text-zinc-500 mt-1">Choose a map to host your multiplayer session.</p>
                                            </div>
                                            <button
                                                onClick={handleImportMap}
                                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium border border-zinc-700 transition-colors flex items-center gap-2"
                                            >
                                                <Download size={16} /> Import Map
                                            </button>
                                        </div>

                                        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden shadow-inner flex flex-col max-h-80">
                                            {levels.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-zinc-500">
                                                    <Server size={48} className="text-zinc-800 mb-4 opacity-50" />
                                                    <p className="text-base font-medium text-zinc-400 mb-1">No maps available</p>
                                                    <p className="text-sm">Create a map in the editor or import one to begin hosting.</p>
                                                </div>
                                            ) : (
                                                <div className="overflow-y-auto w-full">
                                                    <div className="divide-y divide-zinc-800/50">
                                                        {levels.map((lvl) => (
                                                            <button
                                                                key={lvl.id}
                                                                onClick={() => setSelectedLevelId(lvl.id)}
                                                                className={clsx(
                                                                    "w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-900 transition-colors text-left",
                                                                    selectedLevelId === lvl.id ? "bg-indigo-500/5 bg-opacity-20 border-l-2 border-indigo-500" : "border-l-2 border-transparent"
                                                                )}
                                                            >
                                                                <div>
                                                                    <div className={clsx("font-semibold text-base flex items-center gap-2", selectedLevelId === lvl.id ? "text-indigo-300" : "text-zinc-300")}>
                                                                        {lvl.name} {lvl.isPhysicalFile && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">File</span>}
                                                                    </div>
                                                                    <div className="text-xs text-zinc-600 mt-1 font-mono">ID: {lvl.id}</div>
                                                                </div>
                                                                {selectedLevelId === lvl.id && (
                                                                    <CheckCircle2 className="text-indigo-500" size={20} />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-end pt-4 border-t border-zinc-800/50">
                                            <button
                                                onClick={handleStartHosting}
                                                disabled={!selectedLevelId || levels.length === 0}
                                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl font-bold tracking-wide shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                                            >
                                                Launch Server <Play size={18} className="fill-current" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* JOIN PANEL */}
                                {activeTab === 'join' && (
                                    <div className="max-w-2xl flex flex-col gap-6 mx-auto h-full">
                                        {joinScreen === 'connecting' ? (
                                            <div className="flex-1 flex flex-col items-center justify-center p-10 min-h-[300px]">
                                                <div className="relative mb-8">
                                                    <div className="absolute inset-0 border-[3px] border-cyan-500/30 border-t-cyan-500 rounded-full w-16 h-16 animate-spin"></div>
                                                    <div className="absolute inset-2 border-[3px] border-indigo-500/30 border-b-indigo-500 rounded-full w-12 h-12 animate-spin-slow"></div>
                                                    <Wifi className="text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={24} />
                                                </div>
                                                <h3 className="text-xl font-semibold text-zinc-100 mb-2">Establishing Connection</h3>
                                                <p className="text-zinc-500 text-sm mb-8 flex items-center gap-2">Pinging Host: <span className="font-mono text-cyan-400 font-semibold px-2 py-0.5 bg-cyan-500/10 rounded">{joinInput.toUpperCase()}</span></p>
                                                <button
                                                    onClick={() => { destroyLobbyPeer(); setJoinScreen('browse'); }}
                                                    className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors border border-zinc-700"
                                                >
                                                    Abort Connection
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2"><Server className="text-cyan-400" size={20} /> Available Servers</h3>
                                                        <p className="text-sm text-zinc-500 mt-1">Join an active game or connect via direct ID.</p>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSessionsFetching(true); connectToBroker((list) => setSessions(list)); }}
                                                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded-lg text-xs font-semibold uppercase tracking-wider border border-zinc-700 transition-colors flex items-center gap-1.5"
                                                    >
                                                        <RefreshCw size={14} className={clsx(sessionsFetching && "animate-spin")} /> {sessionsFetching ? 'Scanning...' : 'Refresh'}
                                                    </button>
                                                </div>

                                                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden shadow-inner flex flex-col min-h-[240px]">
                                                    {sessionsFetching && sessions.length === 0 ? (
                                                        <div className="flex-1 flex flex-col items-center justify-center p-8">
                                                            <div className="relative flex items-center justify-center mb-4">
                                                                <div className="absolute w-12 h-12 rounded-full border border-cyan-500/30 animate-ping"></div>
                                                                <div className="w-4 h-4 rounded-full bg-cyan-500"></div>
                                                            </div>
                                                            <div className="text-zinc-500 font-medium text-sm">Searching network for active games...</div>
                                                        </div>
                                                    ) : sessions.length === 0 ? (
                                                        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center text-zinc-500">
                                                            <Wifi size={40} className="text-zinc-800 mb-4 opacity-50" />
                                                            <p className="text-base font-medium text-zinc-400 mb-1">No servers found</p>
                                                            <p className="text-sm">Refresh to scan again or connect via Direct ID below.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="overflow-y-auto w-full p-2 grid gap-2">
                                                            {sessions.map(s => (
                                                                <div key={s.hostId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between group hover:border-cyan-500/50 transition-colors">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                                                                            <Users size={18} />
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-semibold text-zinc-200 group-hover:text-cyan-300 transition-colors flex items-center gap-2">
                                                                                {s.hostName}'s Game
                                                                                {s.isLan && (
                                                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                                                                                        LAN
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-xs text-zinc-500 font-medium mt-1 flex items-center gap-3">
                                                                                <span className="flex items-center gap-1"><Globe size={12} /> {s.mapName}</span>
                                                                                <span className={clsx("flex items-center gap-1", s.playerCount >= s.maxPlayers ? "text-amber-500" : "text-emerald-500")}>
                                                                                    <Users size={12} /> {s.playerCount}/{s.maxPlayers}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleJoinSession(s.hostId)}
                                                                        disabled={s.playerCount >= s.maxPlayers}
                                                                        className="px-5 py-2.5 bg-zinc-800 hover:bg-cyan-600 disabled:opacity-50 disabled:bg-zinc-800 text-white font-semibold text-sm rounded-lg transition-colors border border-zinc-700 hover:border-transparent flex items-center gap-2"
                                                                    >
                                                                        {s.playerCount >= s.maxPlayers ? 'Full' : 'Join Game'}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 mt-auto">
                                                    <div className="flex flex-col sm:flex-row items-end gap-4">
                                                        <div className="flex-1 w-full">
                                                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Direct Connection ID</label>
                                                            <div className="relative">
                                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                                                                    <Hash size={16} />
                                                                </div>
                                                                <input
                                                                    ref={joinInputRef}
                                                                    type="text"
                                                                    value={joinInput}
                                                                    onChange={e => setJoinInput(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter' && joinInput.trim()) handleJoinSession(joinInput.trim().toLowerCase()); }}
                                                                    placeholder="e.g. azriXXXXXX"
                                                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-4 py-2.5 text-zinc-100 font-mono tracking-widest placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                                                    spellCheck={false}
                                                                />
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => { if (joinInput.trim()) handleJoinSession(joinInput.trim().toLowerCase()); }}
                                                            disabled={!joinInput.trim()}
                                                            className="w-full sm:w-auto px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-lg transition-colors border border-transparent disabled:border-zinc-700"
                                                        >
                                                            Connect
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
