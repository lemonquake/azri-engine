import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PeerServer } from 'peer'

// Custom Vite plugin to run the local PeerServer
function peerServerPlugin() {
  return {
    name: 'vite-plugin-peer-server',
    configureServer(server: any) {
      if (!server.httpServer) return

      server.httpServer.once('listening', () => {
        try {
          const peerServer = PeerServer({ port: 9000, path: '/' })
          console.log('\n[PeerServer] Running local signaling server on port 9000')

          peerServer.on('connection', (client: any) => {
            console.log(`[PeerServer] Client connected: ${client.getId()}`)
          })

          peerServer.on('disconnect', (client: any) => {
            console.log(`[PeerServer] Client disconnected: ${client.getId()}`)
          })
        } catch (e) {
          console.error('[PeerServer] Failed to start:', e)
        }
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), peerServerPlugin()],
})
