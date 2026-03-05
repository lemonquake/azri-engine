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
5. **Share the ID:** Share your specific **Host ID** (e.g., `azrix7k2qf`) with your friends.
6. **Wait for Players:** As players join, you will see their connection status update in the lobby UI.
7. **Start:** Once everyone is connected and ready, click **"START GAME"**.

### 🤝 How to Join

As a joiner, you connect directly to a host using their IP and Host ID.

1. **Get the Info:** Ask the host for their active **Invite Code (Host ID)** and their **LAN IP Address**.
2. **Start the Engine:** Run `Open Game.cmd` and open `http://localhost:5173`.
3. **Load the Map:** Ensure you have the exact same level/map loaded in your editor as the host.
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

In most cases, PeerJS broker servers will seamlessly connect two players without issue via WebRTC. However, if connections are failing or timing out:
1. **Port Forwarding:** The host may need to check their router settings to ensure their firewall is not blocking P2P traffic. Commonly, configuring port forwarding for WebRTC or explicitly opening up the application's required ports (default `9000` or the one configured in your setup) can help.
2. **Dedicated Host Mode (Optional):** If implemented or supported, running the engine in a headless/dedicated host mode on a Virtual Private Server (VPS) allows players to connect to a stable, centralized IP address instead of relying solely on the host player's residential connection.

---

*Enjoy building and playing together in Azri Engine!*
