import type { PeerJSOption } from 'peerjs';

export const PEER_CONFIG: PeerJSOption = {
    // Use the official, public PeerJS cloud server for robust global multiplayer.
    // This avoids reliance on a local Vite proxy that drops WebSockets and won't
    // exist when the game is compiled to Electron or production builds.
    
    // host: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    // port: typeof window !== 'undefined' ? Number(window.location.port) || 5173 : 5173,
    // path: '/',

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
