// electron/preload.ts
// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
// We can selectively expose APIs to the renderer process here if needed.
const { contextBridge, ipcRenderer } = require('electron');
// Example: Expose a function to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url)
});
console.log('Preload script loaded and electronAPI exposed.');
