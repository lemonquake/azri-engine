import type { PeerJSOption } from 'peerjs';

export const PEER_CONFIG: PeerJSOption = {
    // Connect to our local PeerServer running on the Host's machine via Vite (port 9000).
    // Using window.location.hostname dynamically binds to the host's LAN IP or localhost.
    host: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    port: 9000,
    path: '/',

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
    // Optional: add debug mode to help trace connection issues in console
    debug: 2,
};
