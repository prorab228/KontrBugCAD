const { contextBridge, ipcRenderer } = require('electron');
const { exposeUpdaterAPI } = require('@capgo/electron-updater/preload');

// Внедряем API апдейтера (скачивание, установка)
exposeUpdaterAPI();

// Ваш основной API для взаимодействия с файловой системой и меню
contextBridge.exposeInMainWorld('electronAPI', {
    onMenuEvent: (callback) => ipcRenderer.on('menu-event', (event, ...args) => callback(...args)),
    checkServerForUpdate: () => ipcRenderer.invoke('check-for-updates'),
    addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    focusWindow: () => ipcRenderer.send('focus-window')
});