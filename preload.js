const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMenuEvent: (callback) => {
    ipcRenderer.on('menu-event', (event, command) => callback(command));
  },
  addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog')
});