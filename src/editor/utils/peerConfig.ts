import type { PeerJSOption } from 'peerjs';

export const PEER_CONFIG: PeerJSOption = {
    // We add explicit public STUN servers to greatly improve NAT-traversal
    // over congested LANs and restrictive Windows Firewalls.
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
