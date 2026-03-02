import { app, BrowserWindow } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false // Temporary for easy local filesystem access if ever needed.
        },
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        // In production, we load the index.html created by Vite
        win.loadFile(path.join(__dirname, '../dist/index.html'));
        win.webContents.openDevTools({ mode: 'detach' });

        win.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Renderer Console] ${message}`);
        });
    }
}

import { ipcMain } from 'electron';

app.whenReady().then(() => {
    ipcMain.on('get-user-data-path', (event) => {
        event.returnValue = app.getPath('userData');
    });

    ipcMain.on('get-app-path', (event) => {
        event.returnValue = app.getAppPath();
    });

    ipcMain.on('is-packaged', (event) => {
        event.returnValue = app.isPackaged;
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
