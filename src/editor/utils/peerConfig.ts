import type { PeerJSOption } from 'peerjs';

// WebRTC ICE servers. STUN handles most NATs; a TURN server is required for clients behind
// symmetric NATs (otherwise ~10-20% of peer connections silently fail). TURN is optional and
// configured via .env (see .env.example):
//   VITE_TURN_URL=turn:your.turn.host:3478
//   VITE_TURN_USERNAME=user
//   VITE_TURN_CREDENTIAL=pass
const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
];

const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
if (turnUrl) {
    iceServers.push({
        urls: turnUrl,
        username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
        credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    });
}

export const PEER_CONFIG: PeerJSOption = {
    // Signaling uses the public PeerJS cloud server, which (unlike the Vite-proxied local
    // PeerServer) also works in production and Electron builds. Connect by host code.
    config: { iceServers },
    debug: 2,
};
