# Azri Engine — Multiplayer Guide

Welcome to the Azri Engine Multiplayer mode! This guide explains how to properly set up, host, and join multiplayer games.

## 🎮 How to Play Multiplayer

Azri Engine's multiplayer mode is built directly into the game's UI and uses a peer-to-peer (P2P) connection system. This means players connect directly to each other rather than through a central dedicated server.

To play multiplayer smoothly, ensure:
- All players have the same version of the level/map you intend to play on.

### 🏠 How to Host

As a host, your job is to load the map and open your game to other players. Follow these steps:

1. **Start the Engine:** Run `Open Game.cmd` and go to `http://localhost:5173` in your browser.
2. **Open the Lobby:** Click the **[LOBBY]** button located in the left sidebar of the editor.
3. **Select Map:** Click on **"HOST A GAME"**, then choose a map from your saved levels or import one.
4. **Host the Game:** Click **"HOST GAME"**. The game will generate a unique, alphanumeric **Host ID**.
5. **(Optional) Expose to Internet:** If your friends are not on the same local network, click **"EXPOSE TO INTERNET"**. This generates a **Public Web Link** (e.g., `https://random-url.loca.lt`) that your friends can use to directly open the game.
6. **Share the Info:** Share your specific **Host ID** (e.g., `azrix7k2qf`). If playing over the internet, also share the **Public Web Link**.
7. **Wait for Players:** As players join, you will see their connection status update in the lobby UI.
8. **Start:** Once everyone is connected and ready, click **"START GAME"**.

### 🤝 How to Join

As a joiner, you connect directly to a host using their IP and Host ID, or by opening their **Public Web Link**.

1. **Ask your friend for their invite info:** You need their **Host ID**. If you are on the internet, you also need their **Public Web Link**.
2. **Start the Engine:** If you are on the internet, just open the **Public Web Link** in your browser. If you are on LAN, run `Open Game.cmd` and open `http://localhost:5173`.
3. **Load the Map:** Ensure you have the exact same level/map loaded in your editor as the host. The game will attempt to sync the map over the connection.
4. **Open the Lobby:** Click the **[LOBBY]** button in the left sidebar.
5. **Join the Game:** Click on **"JOIN A GAME"**.
6. **Enter ID:** Enter the ID in the format `IP_ADDRESS::HOST_ID`. (e.g. `192.168.1.5::azri123`). If you are playing locally on the same PC, just enter the `HOST_ID`.
7. **Connect:** Click **"JOIN GAME"** and wait for the connection to establish and for the host to start the game.

## ⚙️ Proper Network Setup

Because Azri Engine uses P2P connectivity, network configuration is important.

### Local Network (LAN)
If all players are on the same local network (e.g., connected to the same Wi-Fi router), you shouldn't need any additional setup. Hosting and joining should work automatically out of the box.

**New Feature: Auto-Discovery**
Host games on the same network will now automatically broadcast their presence. When you go to the **JOIN A GAME** tab, any game hosted on your Wi-Fi will appear in the "Available Servers" list with a `LAN` badge. You can simply click **JOIN** without needing to type the Host ID or IP address!

### Over the Internet (WAN)
If you are playing with friends over the internet, the PeerJS networking connection must be able to establish a link.

By using the **"EXPOSE TO INTERNET"** button in the lobby, the host's game frontend is tunneled to the web using `localtunnel`. This bypasses port forwarding and allows friends to join by simply clicking the provided URL.

1. **Signaling Server Tunneling:** Because the built-in PeerServer is proxied through the same port as the UI, friends loading the **Public Web Link** will seamlessly connect to the host's signaling server!
2. **NAT Traversal:** The connection between peers uses public Google STUN servers for WebRTC. In rare cases where strict NATs prevent direct connections and STUN fails, connections might drop.

---

*Enjoy building and playing together in Azri Engine!*
