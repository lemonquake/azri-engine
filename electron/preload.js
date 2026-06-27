// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency])
    }
})

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Resolved once at preload time — the main-process handlers are registered before the window loads.
const isPackaged = ipcRenderer.sendSync('is-packaged');
const appPath = ipcRenderer.sendSync('get-app-path');
const userDataPath = ipcRenderer.sendSync('get-user-data-path');

console.log("Preload script loaded, injecting electronAPI");
contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    isPackaged: () => isPackaged,
    getAppPath: () => appPath,
    getUserDataPath: () => userDataPath,
    getWasmPath: (file) => path.join(appPath, isPackaged ? 'dist' : 'public', file),
    readMaps: () => ipcRenderer.invoke('read-maps'),
    importMap: () => ipcRenderer.invoke('import-map'),
    readDbFile: () => ipcRenderer.invoke('read-db-file'),
    writeDbFile: (data) => ipcRenderer.invoke('write-db-file', data),
});
