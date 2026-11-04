const { contextBridge, ipcRenderer } = require('electron');
const { exposeUpdaterAPI } = require('@capgo/electron-updater/preload');

// Внедряем API апдейтера
exposeUpdaterAPI();

// Основной API
contextBridge.exposeInMainWorld('electronAPI', {
    onMenuEvent: (callback) => ipcRenderer.on('menu-event', (event, ...args) => callback(...args)),
    addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    focusWindow: () => ipcRenderer.send('focus-window')
});