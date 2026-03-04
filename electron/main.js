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

app.whenReady().then(() => {
    ipcMain.on('is-packaged', (event) => {
        event.returnValue = app.isPackaged;
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
