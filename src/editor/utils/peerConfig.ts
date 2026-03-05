import type { PeerJSOption } from 'peerjs';

export const PEER_CONFIG: PeerJSOption = {
    // Connect to the PeerServer via the Vite dev server proxy at /peerjs.
    // This uses the same host and port the page was loaded from (e.g. 192.168.x.x:5173),
    // so it works across the LAN without needing direct access to port 9000.
    host: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    port: typeof window !== 'undefined' ? Number(window.location.port) || 5173 : 5173,
    path: '/peerjs',

    // Explicit public STUN servers for WebRTC NAT traversal.
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ]
    },
    debug: 2,
};
