const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

// ---- Путь к иконке в зависимости от ОС ----
function getIconPath() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  if (isWindows) {
    return path.join(__dirname, 'build/icon.ico');
  }
  if (isMac) {
    return path.join(__dirname, 'build/icon.icns');
  }
  if (isLinux) {
    // для Linux можно использовать PNG
    return path.join(__dirname, 'build/icon.png');
  }
  return undefined; // иконка по умолчанию
}

// ---- Создание меню ----
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // Файл
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Новый проект',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu-new-project');
          }
        },
        {
          label: 'Открыть проект',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu-open-project');
          }
        },
        {
          label: 'Сохранить проект',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu-save-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Экспорт модели',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu-export');
          }
        },
        { type: 'separator' },
        isMac
          ? { label: 'Закрыть окно', role: 'close' }
          : { label: 'Выход', role: 'quit' }
      ]
    },
    // Правка
    {
      label: 'Правка',
      submenu: [
        { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Вырезать', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Копировать', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Вставить', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Удалить', accelerator: 'Delete', role: 'delete' },
        { type: 'separator' },
        { label: 'Выделить всё', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        {
          label: 'Дублировать',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu-duplicate');
          }
        }
      ]
    },
    // Вид
    {
      label: 'Вид',
      submenu: [
        { label: 'Перезагрузить', role: 'reload' },
        { label: 'Полноэкранный режим', role: 'togglefullscreen' },
        { label: 'Инструменты разработчика', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Увеличить', role: 'zoomIn' },
        { label: 'Уменьшить', role: 'zoomOut' },
        { label: 'Масштаб по умолчанию', role: 'resetZoom' }
      ]
    },
    // Справка
    {
      label: 'Справка',
      submenu: [
        {
          label: 'Гайд по редактору',
          click: async () => {
            await shell.openExternal(
              'https://3dtoday.ru/blogs/envalid/kratkii-gaid-po-moemu-3d-redaktoru-kontrbagcad'
            );
          }
        },
        { type: 'separator' },
        {
          label: 'О программе',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu-about');
          }
        }
      ]
    }
  ];

  // macOS: добавляем меню приложения (стандарт платформы)
  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { label: `О ${app.name}`, role: 'about' },
        { type: 'separator' },
        { label: 'Скрыть', role: 'hide' },
        { label: 'Скрыть остальные', role: 'hideOthers' },
        { label: 'Показать все', role: 'unhide' },
        { type: 'separator' },
        { label: 'Выйти', role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---- Создание окна ----
function createWindow() {
  // Путь к preload-скрипту
  const preloadPath = path.join(__dirname, 'preload.js');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(), // ← иконка окна
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // используем preload, если файл существует, иначе undefined
      preload: require('fs').existsSync(preloadPath) ? preloadPath : undefined
    }
  });

  win.loadFile('index.html');
  // Открыть DevTools при разработке (можно закомментировать)
  // win.webContents.openDevTools();

  createMenu();
}

// ---- Запуск приложения ----
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});