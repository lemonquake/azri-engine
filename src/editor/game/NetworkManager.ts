import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export type MultiplayerDataType = 'map_sync' | 'player_state' | 'player_action' | 'chat_message' | 'ping' | 'pong';

export interface NetworkMessage {
    type: MultiplayerDataType;
    senderId: string;
    data: any;
}

export class NetworkManager {
    public peer: Peer | null = null;
    public connections: Map<string, DataConnection> = new Map();
    public isHost: boolean = false;
    public myPlayerIndex: number = 0; // 0 = Host (Player 1), 1 = Joiner 1 (Player 2), 2 = Joiner 2 (Player 3)

    private onMessageCallback: (msg: NetworkMessage) => void = () => { };
    private onConnectionCallback: (connId: string) => void = () => { };
    private onDisconnectCallback: (connId: string) => void = () => { };

    constructor(
        onMessage: (msg: NetworkMessage) => void,
        onConnection: (connId: string) => void = () => { },
        onDisconnect: (connId: string) => void = () => { }
    ) {
        this.onMessageCallback = onMessage;
        this.onConnectionCallback = onConnection;
        this.onDisconnectCallback = onDisconnect;
    }

    public hostGame(hostId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.isHost = true;
            this.myPlayerIndex = 0; // Host is always Player 1
            this.peer = new Peer(hostId);

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
                this.onConnectionCallback(conn.peer);
            });

            this.peer.on('error', (err) => {
                console.error('PeerJS Host Error:', err);
                reject(err);
            });
        });
    }

    public joinGame(myId: string, hostId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.isHost = false;
            // Client player index will be assigned by host later via a welcome message, but default to 1 for now
            this.myPlayerIndex = 1;

            const connectWithRetry = (retries: number, delayMs: number) => {
                // Destroy previous peer instance if it exists from a failed attempt
                if (this.peer) {
                    try { this.peer.destroy(); } catch (e) { }
                    this.peer = null;
                }

                // Suffix to ensure fresh ID on retry if needed
                const attemptId = retries < 5 ? myId : `${myId}_r${5 - retries}`;
                this.peer = new Peer(attemptId);

                this.peer.on('open', (id) => {
                    console.log(`[Join] Client created with ID: ${id}. Attempting to connect to Host: ${hostId}`);
                    const conn = this.peer!.connect(hostId, { reliable: true });

                    conn.on('open', () => {
                        console.log('[Join] Connected to Host!');
                        this.setupConnection(conn);
                        this.connections.set(conn.peer, conn);
                        resolve(id);
                    });

                    conn.on('error', (err) => {
                        console.error('[Join] Connection Error:', err);
                        // If it's a connection-level error, we might not want to retry the whole peer creation, 
                        // but for simplicity and robustness we'll let the peer error handler or timeout catch failures.
                    });
                });

                this.peer.on('error', (err: any) => {
                    console.error('[Join] PeerJS Client Error:', err);

                    if (err.type === 'peer-unavailable' && retries > 0) {
                        console.log(`[Join] Host unavailable, retrying in ${delayMs}ms... (${retries} retries left)`);
                        setTimeout(() => connectWithRetry(retries - 1, delayMs), delayMs);
                    } else {
                        reject(err);
                    }
                });
            };

            // Start with 10 retries, 500ms apart (total 5 seconds wait time for host to be ready)
            connectWithRetry(10, 500);
        });
    }

    private setupConnection(conn: DataConnection) {
        conn.on('data', (data) => {
            this.onMessageCallback(data as NetworkMessage);
        });

        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
            this.connections.delete(conn.peer);
            this.onDisconnectCallback(conn.peer);
        });

        conn.on('error', (err) => {
            console.error(`Connection error with ${conn.peer}:`, err);
        });
    }

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

    public disconnect() {
        this.connections.forEach(conn => conn.close());
        this.connections.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}
