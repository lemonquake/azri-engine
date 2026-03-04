# Hosting & Joining Azri Engine Multiplayer

This guide details how to launch instances of Azri Engine configured to connect over PeerJS dynamically via command-line arguments.

Because Azri Engine uses PeerJS, no dedicated game server is required. One player will act as the Host (Server) directly from their instance, and other players will act as Clients and join the Host's peer ID.

## Prerequisites

- Two or more running instances of standard Azri Engine (Windows `.exe` or locally via terminal).
- A valid saved map. Both host and clients must have the map stored locally for now, since `map_sync` only transmits the ID.

## Hosting a Game

1. Open the Azri Engine editor.
2. Load or create the map you want to play on. Ensure it contains **Spawn Point** characters assigned to Player 1, 2, and 3 via the **Properties Panel**.
3. In the left sidebar, locate the **Multiplayer** section under the Play/Stop controls.
4. Click **Host Game**.
5. The game will automatically enter Play mode, and your Host ID will be generated (you can see it in the console or future UI). Share this ID with your friends.

---

## Joining a Game

1. Open the Azri Engine editor.
2. Load the *exact same map* that the host is currently playing on.
3. In the left sidebar, locate the **Multiplayer** section.
4. Click **Join Game**.
5. An input box will appear. Enter the **Host ID** provided by your friend.
6. Click **GO** or press Enter. You will immediately enter Play mode and connect to the host.

### Visual Distinctions

There are no mechanical differences between any of the multiplayer characters.
- **Player 1 (Host)**: The classic Dark Red & Black scarf wearing ninja.
- **Player 2 (First Join)**: The Shadow Ninja, marked by a deep purple visor, purple glowing daggers, and rich dark purple tinted shadowy trail.
- **Player 3 (Second Join)**: The Heavy Golem, visually appearing as bulky dark grey stone chassis with bright yellow-amber eyes and yellow molten accents on their weapons.

*(If more than 3 join, they will revert back to the classic visual)*
