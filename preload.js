const { contextBridge, ipcRenderer } = require('electron');
const { exposeUpdaterAPI } = require('@capgo/electron-updater/preload');

// Внедряем API апдейтера в глобальную область видимости (window.electronUpdater)
exposeUpdaterAPI();

// Ваш основной API
contextBridge.exposeInMainWorld('electronAPI', {
    onMenuEvent: (callback) => ipcRenderer.on('menu-event', (event, ...args) => callback(...args)),
    addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    focusWindow: () => ipcRenderer.send('focus-window'),

    // ★ НОВОЕ: Методы для MCP
    onMcpGetTools: (callback) => ipcRenderer.on('mcp-get-tools', () => {
        const tools = callback();
        ipcRenderer.send('mcp-tools-response', tools);
    }),
    onMcpCall: (callback) => ipcRenderer.on('mcp-call', async (event, req) => {
        const res = await callback(req);
        ipcRenderer.send('mcp-call-response', res);
    })
});