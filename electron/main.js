import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
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
            // Secure defaults: the renderer reaches Node/IPC only through the contextBridge
            // API exposed in preload.js (window.electronAPI), never via window.require.
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        // In production, we load the index.html created by Vite
        win.loadFile(path.join(__dirname, '../dist/index.html'));

        // Forward renderer console to the main-process log (no DevTools window in prod builds).
        win.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Renderer Console] ${message}`);
        });
    }
}

app.whenReady().then(() => {
    ipcMain.on('is-packaged', (event) => {
        event.returnValue = app.isPackaged;
    });

    // Sync path lookups used by DatabaseService (sql.js file persistence + wasm locateFile).
    // Without these, the packaged app's file-based DB path fails and silently falls back to IndexedDB.
    ipcMain.on('get-user-data-path', (event) => {
        event.returnValue = app.getPath('userData');
    });

    ipcMain.on('get-app-path', (event) => {
        event.returnValue = app.getAppPath();
    });

    // sql.js database file read/write (used by DatabaseService when running in Electron).
    const dbFilePath = () => path.join(app.getPath('userData'), 'azri_engine_db.sqlite');
    ipcMain.handle('read-db-file', async () => {
        try {
            const file = dbFilePath();
            if (fs.existsSync(file)) return fs.readFileSync(file);
        } catch (e) {
            console.error('read-db-file failed:', e);
        }
        return null;
    });
    ipcMain.handle('write-db-file', async (event, data) => {
        try {
            fs.writeFileSync(dbFilePath(), Buffer.from(data));
            return true;
        } catch (e) {
            console.error('write-db-file failed:', e);
            return false;
        }
    });

    const getMapsDir = () => {
        // Use public/maps inside the project root for dev/prod consistency if requested
        const isPackaged = app.isPackaged;
        const projectRoot = isPackaged ? path.join(app.getAppPath(), '..') : app.getAppPath();
        const mapsDir = path.join(projectRoot, 'public', 'maps');

        if (!fs.existsSync(mapsDir)) {
            fs.mkdirSync(mapsDir, { recursive: true });
        }
        return mapsDir;
    };

    ipcMain.handle('read-maps', async () => {
        try {
            const mapsDir = getMapsDir();
            const files = await fsPromises.readdir(mapsDir);
            const maps = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(mapsDir, file);
                    const content = await fsPromises.readFile(filePath, 'utf-8');
                    try {
                        const parsed = JSON.parse(content);
                        if (parsed.id && parsed.name) {
                            maps.push({
                                ...parsed,
                                isPhysicalFile: true,
                                filePath
                            });
                        }
                    } catch (err) {
                        console.error(`Error parsing map file ${file}:`, err);
                    }
                }
            }
            return maps;
        } catch (error) {
            console.error('Failed to read maps directory:', error);
            return [];
        }
    });

    ipcMain.handle('import-map', async (event) => {
        try {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(focusedWindow, {
                title: 'Import Map',
                filters: [{ name: 'JSON Levels', extensions: ['json'] }],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            const sourcePath = result.filePaths[0];
            const content = await fsPromises.readFile(sourcePath, 'utf-8');

            // Validate it's a map
            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (err) {
                throw new Error('Invalid JSON file');
            }

            if (!parsed.id || !parsed.name) {
                throw new Error('JSON file is not a valid map format (missing id or name)');
            }

            const mapsDir = getMapsDir();
            const destPath = path.join(mapsDir, path.basename(sourcePath));

            await fsPromises.copyFile(sourcePath, destPath);
            return {
                ...parsed,
                isPhysicalFile: true,
                filePath: destPath
            };
        } catch (error) {
            console.error('Failed to import map:', error);
            throw error;
        }
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
