const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

function getIconPath() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  if (isWindows) return path.join(__dirname, 'build/icon.ico');
  if (isMac) return path.join(__dirname, 'build/icon.icns');
  if (isLinux) return path.join(__dirname, 'build/icon.png');
  return undefined;
}

ipcMain.handle('add-model-to-library', async (event, { fileName, fileData, modelName, category, color, previewData }) => {
  console.log('=== ADD MODEL TO LIBRARY ===');
  console.log('Received params:', { fileName, modelName, category, color, hasPreview: !!previewData });
  console.log('fileData length:', fileData?.length);

  try {
    const targetCategory = category || 'user';
    const modelsDir = path.join(__dirname, 'models', targetCategory);
    const iconsDir = path.join(modelsDir, 'icons');

    console.log('Creating directories:', modelsDir, iconsDir);
    await fs.mkdir(modelsDir, { recursive: true });
    await fs.mkdir(iconsDir, { recursive: true });
    console.log('Directories created/verified');

    const ext = path.extname(fileName);
    const uniqueName = `${Date.now()}_${uuidv4()}${ext}`;
    const filePath = path.join(modelsDir, uniqueName);
    console.log('STL file path:', filePath);

    // Преобразуем массив чисел обратно в Buffer
    const buffer = Buffer.from(fileData);
    console.log('Buffer size:', buffer.length);

    if (buffer.length === 0) {
      throw new Error('Buffer is empty');
    }

    await fs.writeFile(filePath, buffer);
    console.log('STL file written, size:', (await fs.stat(filePath)).size);

    let iconRelativePath = '';
    if (previewData) {
      const base64Data = previewData.split(',')[1];
      const iconFileName = `${path.basename(uniqueName, ext)}.png`;
      const iconFullPath = path.join(iconsDir, iconFileName);
      await fs.writeFile(iconFullPath, Buffer.from(base64Data, 'base64'));
      iconRelativePath = `icons/${iconFileName}`;
      console.log('Icon saved:', iconFullPath, 'size:', (await fs.stat(iconFullPath)).size);
    }

    // Работа с items.json
    const itemsPath = path.join(modelsDir, 'items.json');
    console.log('Items.json path:', itemsPath);

    let items = [];
    try {
      const itemsContent = await fs.readFile(itemsPath, 'utf8');
      items = JSON.parse(itemsContent);
      console.log('Existing items count:', items.length);
    } catch (e) {
      console.log('No existing items.json, will create new');
    }

    const newItem = {
      id: `user_${Date.now()}`,
      name: modelName || fileName.replace(/\.[^/.]+$/, ''),
      type: 'stl_model',
      category: targetCategory,
      icon: iconRelativePath ? `models/${targetCategory}/${iconRelativePath}` : '',
      modelPath: `models/${targetCategory}/${uniqueName}`,
      color: color || '0x8BC34A',
      author: 'Пользователь'
    };
    items.push(newItem);
    console.log('New item to save:', newItem);

    const itemsJson = JSON.stringify(items, null, 2);
    console.log('Writing items.json, content length:', itemsJson.length);
    await fs.writeFile(itemsPath, itemsJson, 'utf8');
    console.log('items.json written, size:', (await fs.stat(itemsPath)).size);

    // Обновление categories.json (добавляем категорию user, если её нет)
    const categoriesPath = path.join(__dirname, 'models', 'categories.json');
    let categories = [];
    try {
      const categoriesContent = await fs.readFile(categoriesPath, 'utf8');
      categories = JSON.parse(categoriesContent);
    } catch (e) {
      console.log('categories.json not found, creating default');
      categories = [
        { id: 'all', name: 'Все', children: ['primitive', 'components', 'community', 'KontrBugTech'] },
        { id: 'primitive', name: 'Примитивы', path: 'models/primitive' },
        { id: 'components', name: 'Электронные компоненты', path: 'models/components' },
        { id: 'community', name: 'Сообщество', path: 'models/community' },
        { id: 'KontrBugTech', name: 'КонтрБагТех', path: 'models/kontrbugtech' }
      ];
    }

    if (!categories.some(c => c.id === 'user')) {
      console.log('Adding user category to categories.json');
      categories.push({ id: 'user', name: 'Пользовательские', path: 'models/user' });
      const allCat = categories.find(c => c.id === 'all');
      if (allCat && allCat.children) {
        allCat.children.push('user');
      }
      await fs.writeFile(categoriesPath, JSON.stringify(categories, null, 2));
      console.log('categories.json updated');
    }

    return { success: true, item: newItem };
  } catch (error) {
    console.error('ERROR in add-model-to-library:', error);
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
        { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'undo')},
        { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'redo')},
        { type: 'separator' },
        { label: 'Копировать', accelerator: 'CmdOrCtrl+C', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'copy')},
        { label: 'Вставить', accelerator: 'CmdOrCtrl+V', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'paste')},
        { label: 'Удалить', accelerator: 'Delete', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'delete')},
        { type: 'separator' },
        { label: 'Выделить всё', accelerator: 'CmdOrCtrl+A', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'selectAll') },
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
    show: false, // скрываем до готовности
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require('fs').existsSync(preloadPath) ? preloadPath : undefined
    }
  });

  win.loadFile('index-desktop.html').then(() => {
    win.maximize(); // разворачиваем на весь экран
    win.show();
  });

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