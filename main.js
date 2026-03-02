const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid'); // npm install uuid

function getIconPath() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  if (isWindows) return path.join(__dirname, 'build/icon.ico');
  if (isMac) return path.join(__dirname, 'build/icon.icns');
  if (isLinux) return path.join(__dirname, 'build/icon.png');
  return undefined;
}

// ---- IPC обработчики ----
ipcMain.handle('add-model-to-library', async (event, { fileName, fileData, modelName, category, color }) => {
  try {
    // Определяем целевую категорию (по умолчанию 'user')
    const targetCategory = category || 'user';
    const modelsDir = path.join(__dirname, 'models', targetCategory);
    await fs.mkdir(modelsDir, { recursive: true });

    // Сохраняем STL-файл с уникальным именем
    const ext = path.extname(fileName);
    const uniqueName = `${Date.now()}_${uuidv4()}${ext}`;
    const filePath = path.join(modelsDir, uniqueName);
    await fs.writeFile(filePath, Buffer.from(fileData));

    // Обновляем items.json в этой категории
    const itemsPath = path.join(modelsDir, 'items.json');
    let items = [];
    try {
      const itemsContent = await fs.readFile(itemsPath, 'utf8');
      items = JSON.parse(itemsContent);
    } catch (e) {
      // файла нет - создаём пустой массив
    }

    const newItem = {
      id: `user_${Date.now()}`,
      name: modelName || fileName.replace(/\.[^/.]+$/, ''),
      type: 'stl_model',
      category: targetCategory,
      icon: '', // иконка не требуется
      modelPath: uniqueName,
      color: color || '0x8BC34A',
      author: 'Пользователь'
    };
    items.push(newItem);
    await fs.writeFile(itemsPath, JSON.stringify(items, null, 2));

    // Проверяем, есть ли категория 'user' в корневом categories.json
    const categoriesPath = path.join(__dirname, 'models', 'categories.json');
    let categories = [];
    try {
      const categoriesContent = await fs.readFile(categoriesPath, 'utf8');
      categories = JSON.parse(categoriesContent);
    } catch (e) {
      // если нет, создаём базовый набор категорий
      categories = [
        { id: 'all', name: 'Все', children: ['primitive', 'components', 'community', 'KontrBugTech', 'user'] },
        { id: 'primitive', name: 'Примитивы', path: 'models/primitive' },
        { id: 'components', name: 'Электронные компоненты', path: 'models/components' },
        { id: 'community', name: 'Сообщество', path: 'models/community' },
        { id: 'KontrBugTech', name: 'КонтрБагТех', path: 'models/kontrbugtech' }
      ];
    }

    // Если категории 'user' ещё нет, добавляем её
    if (!categories.some(c => c.id === 'user')) {
      categories.push({ id: 'user', name: 'Пользовательские', path: 'models/user' });
      // Также добавляем её в children категории 'all', если она существует
      const allCat = categories.find(c => c.id === 'all');
      if (allCat && allCat.children) {
        allCat.children.push('user');
      }
      await fs.writeFile(categoriesPath, JSON.stringify(categories, null, 2));
    }

    return { success: true, item: newItem };
  } catch (error) {
    console.error('Ошибка добавления модели:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: '3D Models', extensions: ['stl', 'obj', '3mf', 'ply', 'gltf', 'glb'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// ---- Меню ----
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Новый проект', accelerator: 'CmdOrCtrl+N', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'new-project') },
        { label: 'Открыть проект', accelerator: 'CmdOrCtrl+O', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'open-project') },
        { label: 'Сохранить проект', accelerator: 'CmdOrCtrl+S', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'save-project') },
        { type: 'separator' },
        { label: 'Экспорт модели', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'export') },
        { type: 'separator' },
        { label: 'Добавить модель в библиотеку', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'add-to-library') },
        { type: 'separator' },
        isMac ? { label: 'Закрыть окно', role: 'close' } : { label: 'Выход', role: 'quit' }
      ]
    },
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
        { label: 'Дублировать', accelerator: 'CmdOrCtrl+D', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'duplicate') }
      ]
    },
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
    {
      label: 'Справка',
      submenu: [
        { label: 'Гайд по редактору', click: async () => await shell.openExternal('https://3dtoday.ru/blogs/envalid/kratkii-gaid-po-moemu-3d-redaktoru-kontrbagcad') },
        { type: 'separator' },
        { label: 'О программе', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'about') }
      ]
    }
  ];

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

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require('fs').existsSync(preloadPath) ? preloadPath : undefined
    }
  });

  win.loadFile('index-desktop.html');
  // win.webContents.openDevTools();

  createMenu();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});