@echo off
title Azri Engine — Multiplayer
echo ============================================================
echo   AZRI ENGINE — MULTIPLAYER MODE
echo ============================================================
echo.
echo  Starting the editor...
echo  Open your browser to:  http://localhost:5173
echo.
echo  HOW TO HOST A GAME:
echo   1. Click the [LOBBY] button in the left sidebar
echo   2. Click "HOST A GAME"
echo   3. Select a map from your saved levels
echo   4. Click "HOST GAME" — your Host ID will be displayed
echo   5. Share the Host ID with your friends
echo   6. Click "START GAME" once players have joined
echo.
echo  HOW TO JOIN A GAME:
echo   1. Ask the host for their Host ID (e.g. azrix7k2qf)
echo   2. Click the [LOBBY] button in the left sidebar
echo   3. Click "JOIN A GAME"
echo   4. Load the same map as the host
echo   5. Enter the Host ID and click "JOIN GAME"
echo.
echo  NOTE: Both players must be on the same network
echo        or have port forwarding enabled (port 9000).
echo.
echo ============================================================
echo.
npm run dev
pause
