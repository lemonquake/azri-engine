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

console.log("Preload script loaded, injecting electronAPI");
contextBridge.exposeInMainWorld('electronAPI', {
    isPackaged: () => ipcRenderer.sendSync('is-packaged'),
    readMaps: () => ipcRenderer.invoke('read-maps'),
    importMap: () => ipcRenderer.invoke('import-map')
});
