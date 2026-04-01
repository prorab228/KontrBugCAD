const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMenuEvent: (callback) => {
    ipcRenderer.on('menu-event', (event, command) => callback(command));
  },
  addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  // Новый метод для возврата фокуса
  focusWindow: () => ipcRenderer.send('focus-window')
});

ipcRenderer.on('force-focus', () => {
  // Пытаемся сфокусироваться на любом поле ввода
  const active = document.activeElement;
  if (active && active !== document.body && active.tagName === 'INPUT') {
    active.focus();
  } else {
    const firstInput = document.querySelector('input, textarea');
    if (firstInput) firstInput.focus();
  }
  // Активируем canvas (для Three.js)
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.click();
});