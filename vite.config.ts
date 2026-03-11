import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PeerServer } from 'peer'
import dgram from 'dgram'
import localtunnel from 'localtunnel'
// @ts-ignore
import ip from 'ip'

// Custom Vite plugin to run the local PeerServer and handle LAN discovery
function peerServerPlugin() {
  return {
    name: 'vite-plugin-peer-server',
    configureServer(server: any) {
      if (!server.httpServer) return

      // --- LAN Discovery State ---
      let isBroadcasting = false;
      let broadcastInterval: NodeJS.Timeout | null = null;
      let activeSession: any = null;
      // Map to store discovered hosts: hostId -> { ...sessionInfo, lastSeen: timestamp }
      const discoveredHosts = new Map<string, any>();
      let activeTunnel: localtunnel.Tunnel | null = null;

      // Clean up stale hosts (not seen in 10s)
      setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, host] of discoveredHosts.entries()) {
          if (now - host.lastSeen > 10000) {
            discoveredHosts.delete(id);
            changed = true;
          }
        }
        if (changed) console.log(`[LAN Discovery] Stale hosts removed. Active LAN hosts: ${discoveredHosts.size}`);
      }, 5000);

      // --- UDP Socket ---
      const LAN_PORT = 9002;
      const udpClient = dgram.createSocket('udp4');

      udpClient.on('error', (err) => {
        console.error(`[LAN Discovery] UDP error:\n${err.stack}`);
        udpClient.close();
      });

      udpClient.on('message', (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          // Ignore our own broadcasts
          if (data.ip === ip.address()) return;

          if (data.type === 'AZRI_HOST_ANNOUNCE') {
            const isNew = !discoveredHosts.has(data.session.hostId);
            discoveredHosts.set(data.session.hostId, {
              ...data.session,
              ip: data.ip,
              lastSeen: Date.now()
            });
            if (isNew) {
              console.log(`[LAN Discovery] Found new LAN host: ${data.session.hostName} (${data.ip})`);
            }
          } else if (data.type === 'AZRI_HOST_LEAVE') {
            if (discoveredHosts.has(data.hostId)) {
              discoveredHosts.delete(data.hostId);
              console.log(`[LAN Discovery] Host left: ${data.hostId}`);
            }
          }
        } catch (e) {
          // ignore invalid messages
        }
      });

      udpClient.on('listening', () => {
        // Enable broadcasting
        udpClient.setBroadcast(true);
        console.log(`[LAN Discovery] Listening for LAN games on UDP port ${LAN_PORT}`);
      });

      // Bind to 0.0.0.0 to receive broadcasts from anyone
      udpClient.bind(LAN_PORT);

      // --- API Endpoints ---
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Handle Broadcast Control
        if (req.url === '/api/lan/broadcast' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.action === 'start') {
                isBroadcasting = true;
                activeSession = data.session;

                // Announce immediately, then every 2 seconds
                const announce = () => {
                  if (!isBroadcasting || !activeSession) return;
                  const message = Buffer.from(JSON.stringify({
                    type: 'AZRI_HOST_ANNOUNCE',
                    ip: ip.address(),
                    session: activeSession
                  }));
                  // Broadcast to the subnet mask (using 255.255.255.255 for simplicity)
                  udpClient.send(message, 0, message.length, LAN_PORT, '255.255.255.255');
                };

                if (broadcastInterval) clearInterval(broadcastInterval);
                broadcastInterval = setInterval(announce, 2000);
                announce();
                console.log(`[LAN Discovery] Started broadcasting host: ${activeSession.hostId}`);

              } else if (data.action === 'stop') {
                isBroadcasting = false;
                if (broadcastInterval) clearInterval(broadcastInterval);
                broadcastInterval = null;

                if (data.hostId) {
                  const message = Buffer.from(JSON.stringify({
                    type: 'AZRI_HOST_LEAVE',
                    ip: ip.address(),
                    hostId: data.hostId
                  }));
                  udpClient.send(message, 0, message.length, LAN_PORT, '255.255.255.255');
                  console.log(`[LAN Discovery] Stopped broadcasting host: ${data.hostId}`);
                }
                activeSession = null;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.statusCode = 400;
              res.end('Bad Request');
            }
          });
          return;
        }

        // Handle Host Discovery List
        if (req.url === '/api/lan/hosts' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          // Return list of discovered hosts as an array
          res.end(JSON.stringify({ hosts: Array.from(discoveredHosts.values()) }));
          return;
        }

        // Handle Localtunnel (Internet Hosting)
        if (req.url === '/api/tunnel/start' && req.method === 'POST') {
          if (activeTunnel) {
            res.setHeader('Content-Type', 'application/json');
            let password = '';
            try {
              const pwdRes = await fetch('https://loca.lt/mytunnelpassword');
              password = (await pwdRes.text()).trim();
            } catch (e) { console.error('Failed to get tunnel password', e); }
            res.end(JSON.stringify({ success: true, url: activeTunnel.url, password }));
            return;
          }
          try {
            // Tunnel port 5173 (which Vite runs on, and proxies /peerjs to 9000)
            const tunnel = await localtunnel({ port: 5173 });
            activeTunnel = tunnel;
            tunnel.on('close', () => {
              activeTunnel = null;
            });
            console.log(`[Internet] Tunnel established at ${tunnel.url}`);
            
            let password = '';
            try {
              const pwdRes = await fetch('https://loca.lt/mytunnelpassword');
              password = (await pwdRes.text()).trim();
            } catch (e) { console.error('Failed to get tunnel password', e); }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, url: tunnel.url, password }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        if (req.url === '/api/tunnel/stop' && req.method === 'POST') {
          if (activeTunnel) {
            activeTunnel.close();
            activeTunnel = null;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
          return;
        }

        next();
      });


      server.httpServer.once('listening', () => {
        try {
          const peerServer = PeerServer({ port: 9000, path: '/peerjs' })
          console.log('\n[PeerServer] Running local signaling server on port 9000 (proxied via Vite at /peerjs)')

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
  server: {
    host: true, // Expose server to the local network
    proxy: {
      // Proxy /peerjs to the local PeerServer running on port 9000.
      // This means clients can reach the signaling server on the same
      // host:port they loaded the page from (5173), so no direct
      // access to port 9000 is needed across the LAN.
      '/peerjs': {
        target: 'http://localhost:9000',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  plugins: [react(), tailwindcss(), peerServerPlugin()],
})
