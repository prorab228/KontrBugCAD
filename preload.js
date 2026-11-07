const { contextBridge, ipcRenderer } = require('electron');
const { exposeUpdaterAPI } = require('@capgo/electron-updater/preload');

exposeUpdaterAPI();

contextBridge.exposeInMainWorld('electronAPI', {
    onMenuEvent: (callback) => ipcRenderer.on('menu-event', (event, ...args) => callback(...args)),
    addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    focusWindow: () => ipcRenderer.send('focus-window'),

    // MCP: callback должен ВЕРНУТЬ массив инструментов
    onMcpGetTools: (callback) => ipcRenderer.on('mcp-get-tools', () => {
        const tools = callback();
        ipcRenderer.send('mcp-tools-response', tools);
    }),
    onMcpCall: (callback) => ipcRenderer.on('mcp-call', async (event, req) => {
        const res = await callback(req);
        ipcRenderer.send('mcp-call-response', res);
    }),
    // ★ НОВОЕ: позволяет McpManager динамически обновлять список tools
    //    при активации новых групп через enable_tool_group
    sendMcpTools: (tools) => ipcRenderer.send('mcp-tools-response', tools)
});