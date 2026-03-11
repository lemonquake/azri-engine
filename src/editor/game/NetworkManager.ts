import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { PEER_CONFIG } from '../utils/peerConfig';

export interface LevelData {
    name: string;
    tiles: any[];
    characters: any[];
    layers?: any[];
    skyboxLayers?: any[];
    collisionShapes?: any[];
    levelImages?: any[];
    physics?: any;
}

export type MultiplayerDataType = 
    | 'welcome' 
    | 'player_joined' 
    | 'player_left' 
    | 'player_state' 
    | 'start_game' 
    | 'chat_message';

export interface NetworkMessage {
    type: MultiplayerDataType;
    senderId: string;
    data: any;
}

export class NetworkManager {
    public peer: Peer | null = null;
    public connections: Map<string, DataConnection> = new Map();
    public isHost: boolean = false;
    public myPlayerIndex: number = 0; // 1 = Host, 2 = Joiner 1, 3 = Joiner 2
    
    // Callbacks
    private onMessageCallback: (msg: NetworkMessage) => void = () => {};
    private onConnectionCallback: (connId: string) => void = () => {};
    private onDisconnectCallback: (connId: string) => void = () => {};

    // For Host: We keep the Map data in memory to send to joiners
    public currentMapData: LevelData | null = null;

    constructor(
        onMessage: (msg: NetworkMessage) => void,
        onConnection: (connId: string) => void = () => {},
        onDisconnect: (connId: string) => void = () => {}
    ) {
        this.onMessageCallback = onMessage;
        this.onConnectionCallback = onConnection;
        this.onDisconnectCallback = onDisconnect;
    }

    /**
     * Set the current map data (used by the Host to send to joiners)
     */
    public setMapData(mapData: LevelData) {
        this.currentMapData = mapData;
    }

    /**
     * Start hosting a game
     */
    public hostGame(hostId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.isHost = true;
            this.myPlayerIndex = 1; // Host is always Player 1
            this.peer = new Peer(hostId, PEER_CONFIG);

            this.peer.on('open', (id) => {
                console.log('Host created with ID:', id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                if (this.connections.size >= 2) {
                    console.warn('Game full! Rejecting connection:', conn.peer);
                    conn.close();
                    return;
                }

                console.log('Client connected:', conn.peer);
                this.setupConnection(conn);
                this.connections.set(conn.peer, conn);
                
                // When a client connects, send them a 'welcome' packet containing the map and their assigned player index
                conn.on('open', () => {
                    const assignedIndex = this.connections.size + 1; // 2nd or 3rd player
                    
                    if (this.currentMapData) {
                        conn.send({
                            type: 'welcome',
                            senderId: this.peer!.id,
                            data: {
                                playerIndex: assignedIndex,
                                mapData: this.currentMapData
                            }
                        } as NetworkMessage);
                    }

                    // Tell others that someone joined
                    this.broadcast('player_joined', { peerId: conn.peer, playerIndex: assignedIndex });
                    
                    this.onConnectionCallback(conn.peer);
                });
            });

            this.peer.on('error', (err) => {
                console.error('PeerJS Host Error:', err);
                reject(err);
            });
        });
    }

    /**
     * Join an existing game
     */
    public joinGame(hostId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.isHost = false;
            // Will be correctly assigned by the Host's 'welcome' message
            this.myPlayerIndex = 2; 

            // Initialize our peer connection
            this.peer = new Peer(PEER_CONFIG);

            this.peer.on('open', (myId) => {
                console.log(`[Join] Client created with ID: ${myId}. Connecting to Host: ${hostId}`);
                
                // Connect to the host using their ID
                const conn = this.peer!.connect(hostId, { reliable: true });

                conn.on('open', () => {
                    console.log('[Join] Connected to Host!');
                    this.setupConnection(conn);
                    this.connections.set(conn.peer, conn); // Track the host
                    resolve(myId);
                });

                conn.on('error', (err) => {
                    console.error('[Join] Connection Error:', err);
                    reject(err);
                });
            });

            this.peer.on('error', (err) => {
                console.error('[Join] PeerJS Client Error:', err);
                reject(err);
            });
        });
    }

    /**
     * Setup a DataConnection to handle incoming messages
     */
    private setupConnection(conn: DataConnection) {
        conn.on('data', (data) => {
            const msg = data as NetworkMessage;
            
            // Handle automatic assignment of Player Index from the Host's welcome message
            if (msg.type === 'welcome' && !this.isHost) {
                this.myPlayerIndex = msg.data.playerIndex;
                console.log(`[Join] Received welcome message! Assigned Player Index: ${this.myPlayerIndex}`);
            }

            this.onMessageCallback(msg);
        });

        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
            this.connections.delete(conn.peer);
            this.onDisconnectCallback(conn.peer);
            
            // If we are host, notify remaining players that someone left
            if (this.isHost) {
                 this.broadcast('player_left', { peerId: conn.peer });
            }
        });

        conn.on('error', (err) => {
            console.error(`Connection error with ${conn.peer}:`, err);
        });
    }

    /**
     * Send a message to all connected peers
     */
    public broadcast(type: MultiplayerDataType, data: any) {
        if (!this.peer) return;

        const message: NetworkMessage = {
            type,
            senderId: this.peer.id,
            data
        };

        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(message);
            }
        });
    }
    
    /**
     * Send a message to a specific peer
     */
    public sendTo(peerId: string, type: MultiplayerDataType, data: any) {
        if (!this.peer) return;
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send({
                type,
                senderId: this.peer.id,
                data
            } as NetworkMessage);
        }
    }

    public disconnect() {
        this.connections.forEach(conn => conn.close());
        this.connections.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.currentMapData = null;
    }
}
