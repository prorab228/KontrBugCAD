const { app, BrowserWindow, Menu, shell, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ElectronUpdater, setupIPCHandlers } = require('@capgo/electron-updater');

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ LIVE-UPDATE
// ============================================================
const updater = new ElectronUpdater({
    appId: 'com.kontrbugtech.cad',
    autoUpdate: false, // Проверку запускаем вручную из интерфейса
});

// ============================================================
//  НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
// ============================================================
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

try {
    if (!fsSync.existsSync(path.dirname(settingsPath))) {
        fsSync.mkdirSync(path.dirname(settingsPath), { recursive: true });
    }
} catch (e) {
    console.warn('Could not create settings directory:', e.message);
}

function getSettings() {
    try {
        const data = fsSync.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    try {
        fsSync.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('[Settings] Failed to save:', e.message);
    }
}

function getIconPath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    if (isWindows) return path.join(__dirname, 'build/icon.ico');
    if (isMac) return path.join(__dirname, 'build/icon.icns');
    if (isLinux) return path.join(__dirname, 'build/icon.png');
    return undefined;
}

// ============================================================
//  IPC ОБРАБОТЧИКИ
// ============================================================
ipcMain.handle('add-model-to-library', async (event, { fileName, fileData, modelName, category, color, previewData }) => {
    try {
        const targetCategory = category || 'user';
        const modelsDir = path.join(__dirname, 'models', targetCategory);
        const iconsDir = path.join(modelsDir, 'icons');

        await fs.mkdir(modelsDir, { recursive: true });
        await fs.mkdir(iconsDir, { recursive: true });

        const ext = path.extname(fileName);
        const uniqueName = `${Date.now()}_${uuidv4()}${ext}`;
        const filePath = path.join(modelsDir, uniqueName);

        const buffer = Buffer.from(fileData);
        if (buffer.length === 0) throw new Error('Buffer is empty');

        await fs.writeFile(filePath, buffer);

        let iconRelativePath = '';
        if (previewData) {
            const base64Data = previewData.split(',')[1];
            const iconFileName = `${path.basename(uniqueName, ext)}.png`;
            const iconFullPath = path.join(iconsDir, iconFileName);
            await fs.writeFile(iconFullPath, Buffer.from(base64Data, 'base64'));
            iconRelativePath = `icons/${iconFileName}`;
        }

        const itemsPath = path.join(modelsDir, 'items.json');
        let items = [];
        try {
            const itemsContent = await fs.readFile(itemsPath, 'utf8');
            items = JSON.parse(itemsContent);
        } catch (e) {}

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

        await fs.writeFile(itemsPath, JSON.stringify(items, null, 2), 'utf8');

        const categoriesPath = path.join(__dirname, 'models', 'categories.json');
        let categories = [];
        try {
            categories = JSON.parse(await fs.readFile(categoriesPath, 'utf8'));
        } catch (e) {
            categories = [
                { id: 'all', name: 'Все', children: ['primitive', 'components', 'community', 'KontrBugTech'] },
                { id: 'primitive', name: 'Примитивы', path: 'models/primitive' },
                { id: 'components', name: 'Электронные компоненты', path: 'models/components' },
                { id: 'community', name: 'Сообщество', path: 'models/community' },
                { id: 'KontrBugTech', name: 'КонтрБагТех', path: 'models/kontrbugtech' }
            ];
        }

        if (!categories.some(c => c.id === 'user')) {
            categories.push({ id: 'user', name: 'Пользовательские', path: 'models/user' });
            const allCat = categories.find(c => c.id === 'all');
            if (allCat && allCat.children) allCat.children.push('user');
            await fs.writeFile(categoriesPath, JSON.stringify(categories, null, 2));
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

ipcMain.on('focus-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        win.blur();
        win.hide();
        win.show();
        win.focus();
    }
});

// ============================================================
//  МЕНЮ
// ============================================================
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
                isMac ? { label: 'Закрыть окно', role: 'close' } : { label: 'Выход', role: 'quit' }
            ]
        },
        {
            label: 'Правка',
            submenu: [
                { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'undo') },
                { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'redo') },
                { type: 'separator' },
                { label: 'Копировать', accelerator: 'CmdOrCtrl+C', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'copy') },
                { label: 'Вставить', accelerator: 'CmdOrCtrl+V', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'paste') },
                { label: 'Удалить', accelerator: 'Delete', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-event', 'delete') },
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
                { label: 'Масштаб по умолчанию', role: 'resetZoom' },
                { type: 'separator' },
                {
                    id: 'useLegacy',
                    label: 'Использовать совместимый режим (Three.js r162)',
                    type: 'checkbox',
                    checked: false,
                    click: (menuItem, browserWindow) => {
                        const enabled = menuItem.checked;
                        saveSetting('useLegacy', enabled);
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.reload();
                    }
                }
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

    const menu = Menu.buildFromTemplate(template);
    const item = menu.getMenuItemById('useLegacy');
    if (item) item.checked = !!getSettings().useLegacy;
    Menu.setApplicationMenu(menu);
}

// ============================================================
//  ОКНО
// ============================================================
function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: getIconPath(),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: fsSync.existsSync(preloadPath) ? preloadPath : undefined
        }
    });

    win.loadURL('app://index.html').then(() => {
        win.maximize();
        win.show();
    });

    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
        win.focus();
    });

    createMenu();
}

// ============================================================
//  ПРОТОКОЛ APP
// ============================================================
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
]);

function registerAppProtocol() {
    protocol.handle('app', async (request) => {
        const url = request.url;
        let filePath = url.slice('app://'.length);
        if (filePath.startsWith('/')) filePath = filePath.slice(1);

        const baseDir = updater.getCurrentBundlePath() || __dirname;

        if (filePath === 'index.html' && !fsSync.existsSync(path.join(baseDir, 'index.html'))) {
            const settings = getSettings();
            filePath = settings.useLegacy ? 'index-desktop-legacy.html' : 'index-desktop.html';
        }

        const fullPath = path.join(baseDir, filePath);

        if (!fullPath.startsWith(baseDir)) {
            return new Response('Forbidden', { status: 403 });
        }

        try {
            const data = await fs.readFile(fullPath);
            const ext = path.extname(fullPath);
            const contentType = {
                '.js': 'application/javascript',
                '.wasm': 'application/wasm',
                '.json': 'application/json',
                '.css': 'text/css',
                '.html': 'text/html',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf'
            }[ext] || 'application/octet-stream';

            return new Response(data, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (err) {
            return new Response('Not Found', { status: 404 });
        }
    });
}

// ============================================================
//  ЗАПУСК
// ============================================================
app.whenReady().then(async () => {
    await updater.initialize();
    setupIPCHandlers(updater);

    registerAppProtocol();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});