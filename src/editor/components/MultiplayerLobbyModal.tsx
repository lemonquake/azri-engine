import { useState, useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';
import { X, Server, Loader2, Play, Users, RefreshCw } from 'lucide-react';
import { NetworkManager } from '../game/NetworkManager';
const LAN_API_URL = '/api/lan';

interface LANHost {
    id: string;
    username: string;
    lastSeen: number;
}

// Generate a random 4-character ID
const generateId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

// Helper to get local username
const getUsername = () => localStorage.getItem('azri_mp_username') || `Player_${Math.floor(Math.random() * 1000)}`;

export function MultiplayerLobbyModal() {
    const { 
        setShowMultiplayerLobby, 
        setIsMultiplayerHost, 
        setMultiplayerHostId,
        loadLevel,
        togglePlayMode
    } = useEditorStore();

    const [activeTab, setActiveTab] = useState<'host' | 'join'>('host');
    const [username, setUsername] = useState(getUsername());
    const [hostId, setHostId] = useState('');
    const [networkManager, setNetworkManager] = useState<NetworkManager | null>(null);
    const [players, setPlayers] = useState<{ id: string; username: string; index: number }[]>([]);
    
    // Join State
    const [joinInputId, setJoinInputId] = useState('');
    const [lanHosts, setLanHosts] = useState<LANHost[]>([]);
    const [statusText, setStatusText] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);

    // Save username
    useEffect(() => {
        if (username) localStorage.setItem('azri_mp_username', username);
    }, [username]);

    // Cleanup network manager on unmount IF not playing
    useEffect(() => {
        return () => {
            // We do NOT disconnect here if they are moving into the game!
            // The GameRunner will take over the network manager logic.
            // For now, let's let GameRunner create its own instance, or we pass it via store.
            // Actually, the simplest architectural fix: 
            // GameRunner creates NetworkManager fresh on play based on store state.
            // So we CAN disconnect the lobby's NetworkManager when unmounting, 
            // but we need to pass the Host ID to the store.
            if (networkManager) {
                // If we are actually connecting in the lobby (we could), wait...
                // Actually the existing GameRunner initializes NetworkManager on transition.
                // Let's stick to that: Lobby just sets up Host ID and lets GameRunner take over.
            }
        };
    }, []);

    // LAN Polling
    useEffect(() => {
        const fetchHosts = async () => {
            if (activeTab === 'host') return;
            try {
                const res = await fetch(`${LAN_API_URL}/hosts`);
                if (res.ok) {
                    const data = await res.json();
                    setLanHosts(data.hosts || []);
                }
            } catch (e) {
                console.log("LAN polling failed", e);
            }
        };

        const interval = setInterval(fetchHosts, 2000);
        fetchHosts();
        return () => clearInterval(interval);
    }, [activeTab]);

    const handleHostGame = async () => {
        setStatusText('Loading default map...');
        setIsConnecting(true);
        
        try {
            // 1. Fetch default map unconditionally
            const res = await fetch('/maps/World 1 - 1.json');
            if (!res.ok) throw new Error("Could not load default map: World 1 - 1.json");
            const mapData = await res.json();
            
            // 2. Load it into the editor store so GameRunner sees it
            const parsedMap = {
                id: mapData.id || `level_${Date.now()}`,
                name: mapData.name || 'World 1',
                tiles: JSON.parse(mapData.tiles_data || "[]"),
                characters: JSON.parse(mapData.characters_data || "[]"),
                layers: mapData.layers_data ? JSON.parse(mapData.layers_data) : undefined,
                skyboxLayers: mapData.skybox_data ? JSON.parse(mapData.skybox_data) : [],
                levelImages: mapData.level_images_data ? JSON.parse(mapData.level_images_data) : [],
                collisionShapes: mapData.collision_data ? JSON.parse(mapData.collision_data) : [],
                physics: mapData.physics_data ? JSON.parse(mapData.physics_data) : undefined,
                importedTilesheets: mapData.tilesheets_data ? JSON.parse(mapData.tilesheets_data) : undefined,
                availableTiles: mapData.tile_defs_data ? JSON.parse(mapData.tile_defs_data) : undefined
            };

            loadLevel(parsedMap);
            
            // 3. Generate ID & setup host state
            const newHostId = generateId();
            setHostId(newHostId);
            setIsMultiplayerHost(true);
            setMultiplayerHostId(newHostId);
            
            // 4. Broadcast to LAN
            try {
                await fetch(`${LAN_API_URL}/broadcast`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: newHostId,
                        username: username,
                        port: 9000
                    })
                });
            } catch (e) {
                console.log("Could not broadcast to LAN, continuing anyway...");
            }

            // 5. Create lobby NetworkManager to handle joiners while waiting
            const lobbyNm = new NetworkManager((msg) => {
                if (msg.type === 'player_joined') {
                    setPlayers(p => [...p, { id: msg.senderId, username: `Player ${msg.data.playerIndex}`, index: msg.data.playerIndex }]);
                }
            });
            
            // We feed it the map data we just loaded!
            lobbyNm.setMapData(mapData);
            await lobbyNm.hostGame(newHostId);
            setNetworkManager(lobbyNm);
            
            setPlayers([{ id: newHostId, username, index: 1 }]);
            setIsConnecting(false);
            setStatusText('');

            // Copy code to clipboard safely (clipboard is undefined in insecure contexts HTTP)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(newHostId).catch(() => {});
            }

        } catch (err: any) {
            console.error(err);
            setStatusText(`Error: ${err.message}`);
            setIsConnecting(false);
        }
    };

    const handleJoinGame = async (targetHostId: string) => {
        if (!targetHostId) return;
        setIsConnecting(true);
        setStatusText('Connecting to host...');
        setHostId(targetHostId);
        
        try {
            const tempId = `join_${generateId()}`;
            const joinNm = new NetworkManager((msg) => {
                // When we connect, the host will immediately send the 'welcome' packet with map data!
                if (msg.type === 'welcome') {
                    console.log("Received map data from host!", msg.data.mapData);
                    setStatusText('Loading map payload...');
                    
                    // Automatically load the map into our editor
                    loadLevel(msg.data.mapData);
                    
                    setPlayers([
                        { id: targetHostId, username: 'Host', index: 1 },
                        { id: tempId, username, index: msg.data.playerIndex }
                    ]);
                    
                    setIsMultiplayerHost(false);
                    setMultiplayerHostId(targetHostId);
                    setStatusText('Waiting for host to start...');
                } else if (msg.type === 'start_game') {
                    // Start!
                    startGameplay(joinNm);
                }
            });

            await joinNm.joinGame(targetHostId);
            setNetworkManager(joinNm);

        } catch (err: any) {
            setStatusText(`Failed to connect: ${err.message || 'Host not found'}`);
            setIsConnecting(false);
        }
    };

    const handleStartMission = async () => {
        if (!networkManager || !isHostReady) return;
        
        // Notify joiners to start
        networkManager.broadcast('start_game', {});
        
        // Clean up LAN broadcast via API
        try {
            await fetch(`${LAN_API_URL}/hosts`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: hostId })
            });
        } catch (e) { }

        // Give them a tiny bit of time to process the start message
        setTimeout(() => {
            startGameplay(networkManager);
        }, 100);
    };

    const startGameplay = (nm: NetworkManager | null) => {
        // We actually want the GameRunner to take our connected NetworkManager 
        // to avoid re-connecting! For now, we'll store it globally or on window
        // since GameRunner expects to init its own. Let's patch GameRunner to check window.lobbyNm.
        if (nm) {
            (window as any)._lobbyNetworkManager = nm;
        }

        setShowMultiplayerLobby(false);
        setTimeout(() => {
            if (!useEditorStore.getState().isPlaying) {
                togglePlayMode();
            }
        }, 500);
    };

    // Derived states
    const isHosting = !!(activeTab === 'host' && hostId);
    const isWaitingJoin = !!(activeTab === 'join' && hostId && players.length > 0);
    const isHostReady = isHosting && !isConnecting;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[600px] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 px-6 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Server className="text-indigo-400" size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Multiplayer</h2>
                    </div>
                    <button onClick={() => {
                        if (networkManager) networkManager.disconnect();
                        setShowMultiplayerLobby(false);
                    }} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Persistent Player Name Input (Always Visible) */}
                <div className="px-6 pt-6 pb-2">
                    <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Your Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => {
                            const newName = e.target.value;
                            setUsername(newName);
                            // Live update our own display name in the lobby list
                            setPlayers(prev => prev.map(p => {
                                if (isHosting && p.index === 1) return { ...p, username: newName };
                                if (isWaitingJoin && p.id !== hostId) return { ...p, username: newName };
                                return p;
                            }));
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="Enter username..."
                    />
                </div>

                {!isHosting && !isWaitingJoin ? (
                    <div className="flex flex-col flex-1 px-6 pb-6 pt-2 gap-6">
                        {/* Tab Selector */}
                        <div className="flex bg-zinc-950 p-1.5 rounded-lg">
                            <button
                                onClick={() => setActiveTab('host')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                    activeTab === 'host' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Host Game
                            </button>
                            <button
                                onClick={() => setActiveTab('join')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                    activeTab === 'join' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            >
                                Join Game
                            </button>
                        </div>

                        {/* Active Area */}
                        <div className="flex-1 min-h-[220px]">
                            {activeTab === 'host' ? (
                                <div className="h-full flex flex-col items-center justify-center text-center gap-4 bg-zinc-950/50 rounded-lg border border-zinc-800/50 p-6">
                                    <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2">
                                        <Play size={28} className="ml-1" />
                                    </div>
                                    <h3 className="text-lg font-medium text-white">Start a New Session</h3>
                                    <p className="text-sm text-zinc-400 max-w-[280px]">
                                        Host a game using the default map. Other players can join instantly via code or LAN.
                                    </p>
                                    <button 
                                        onClick={handleHostGame}
                                        disabled={isConnecting}
                                        className="mt-2 w-full max-w-[240px] bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-900/20 disabled:opacity-50 flex items-center justify-center"
                                    >
                                        {isConnecting ? <Loader2 className="animate-spin" /> : "HOST GAME"}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {/* LAN Servers */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Local Network Games</label>
                                            <span className="text-[10px] text-emerald-400 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Polling</span>
                                        </div>
                                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg min-h-[140px] max-h-[160px] overflow-y-auto">
                                            {lanHosts.length === 0 ? (
                                                <div className="flex items-center justify-center h-[140px] text-sm text-zinc-500">
                                                    No local games found.
                                                </div>
                                            ) : (
                                                <div className="p-2 space-y-2">
                                                    {lanHosts.map(host => (
                                                        <div key={host.id} className="flex items-center justify-between bg-zinc-900 p-3 rounded-md border border-zinc-800/50 hover:border-indigo-500/50 transition-colors">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium text-white">{host.username}'s Game</span>
                                                                <span className="text-xs text-zinc-500 font-mono">ID: {host.id}</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleJoinGame(host.id)}
                                                                disabled={isConnecting}
                                                                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-sm font-medium transition-colors"
                                                            >
                                                                Join
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Manual ID Join */}
                                    <div className="pt-2 border-t border-zinc-800/50">
                                        <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Direct Invite Code</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={joinInputId}
                                                onChange={(e) => setJoinInputId(e.target.value.toUpperCase())}
                                                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 font-mono text-lg"
                                                placeholder="e.g. A1B2"
                                            />
                                            <button 
                                                onClick={() => handleJoinGame(joinInputId)}
                                                disabled={isConnecting || !joinInputId.trim()}
                                                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-6 rounded-lg font-bold"
                                            >
                                                {isConnecting ? <Loader2 className="animate-spin" /> : "JOIN"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status Message */}
                        {statusText && (
                            <div className="text-center text-sm text-emerald-400 font-medium">
                                {statusText}
                            </div>
                        )}
                    </div>
                ) : (
                    /* The Active Lobby Screen (shows for Host wait and Join wait) */
                    <div className="flex flex-col flex-1 p-6 gap-6">
                        {isHosting ? (
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-5 flex flex-col items-center justify-center text-center">
                                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Invite Code</span>
                                <h1 className="text-4xl font-black text-white font-mono tracking-wider">{hostId}</h1>
                                <p className="text-xs text-zinc-400 mt-2">Copied to clipboard. Share this with friends!</p>
                            </div>
                        ) : (
                            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 flex flex-col items-center justify-center text-center">
                                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">Connected to Host</span>
                                <h1 className="text-xl font-bold text-white font-mono">{hostId}</h1>
                            </div>
                        )}

                        <div className="flex-1">
                            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">Players ({players.length}/3)</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {/* Always show 3 slots */}
                                {[1, 2, 3].map(slotIndex => {
                                    const player = players.find(p => p.index === slotIndex);
                                    
                                    // Visual color mapping logic roughly matches the engine's DefaultCharacter
                                    let slotColor = 'border-zinc-800 bg-zinc-950/50';
                                    let iconColor = 'text-zinc-600';
                                    
                                    if (player) {
                                        if (slotIndex === 1) { slotColor = 'border-red-900/50 bg-red-950/20'; iconColor = 'text-red-500'; }
                                        else if (slotIndex === 2) { slotColor = 'border-purple-900/50 bg-purple-950/20'; iconColor = 'text-purple-500'; }
                                        else if (slotIndex === 3) { slotColor = 'border-amber-900/50 bg-amber-950/20'; iconColor = 'text-amber-500'; }
                                    }

                                    return (
                                        <div key={slotIndex} className={`flex items-center gap-4 p-4 rounded-lg border ${slotColor} transition-all`}>
                                            <div className={`w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center ${iconColor}`}>
                                                <Users size={20} />
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                {player ? (
                                                    <>
                                                        <span className="font-bold text-white text-lg leading-tight">{player.username}</span>
                                                        <span className="text-xs font-medium text-zinc-500 uppercase">
                                                            P{slotIndex} {slotIndex === 1 ? '(Host)' : ''}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="italic text-zinc-600">Waiting for player...</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Action Area */}
                        {isHosting ? (
                            <button 
                                onClick={handleStartMission}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-lg font-bold text-lg shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Play size={20} className="fill-current" />
                                START MISSION
                            </button>
                        ) : (
                            <div className="w-full bg-zinc-950 border border-zinc-800 text-zinc-400 py-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                {statusText || 'Waiting for host to start the game...'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
