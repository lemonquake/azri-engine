import { defineConfig } from 'vitest/config';

// Standalone test config — intentionally NOT extending vite.config.ts, whose
// peerServerPlugin binds UDP/PeerServer sockets and only makes sense for `vite dev`.
export default defineConfig({
    test: {
        // Default to node; engine/physics tests are pure. A test needing the DOM can opt in
        // per-file with `// @vitest-environment jsdom`.
        environment: 'node',
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
});
