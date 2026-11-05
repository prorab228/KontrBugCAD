const { app, BrowserWindow, Menu, shell, ipcMain, dialog, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ElectronUpdater, setupIPCHandlers } = require('@capgo/electron-updater');
// ★ Безопасное подключение MCP SDK (чтобы не падало без пакета)
let Server, StdioServerTransport;
try {
    Server = require('@modelcontextprotocol/sdk/server/index.js').Server;
    StdioServerTransport = require('@modelcontextprotocol/sdk/server/stdio.js').StdioServerTransport;
} catch (e) {
    // Пакет не установлен локально — MCP-режим будет недоступен, но приложение запустится
}
// ============================================================
//  ИНИЦИАЛИЗАЦИЯ LIVE-UPDATE
// ============================================================
const updater = new ElectronUpdater({
    appId: 'com.kontrbugtech.cad',
    autoUpdate: false,
});

// ============================================================
//  ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let mainWindow = null;

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
    if (mainWindow) {
        mainWindow.blur();
        mainWindow.hide();
        mainWindow.show();
        mainWindow.focus();
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
                { label: 'Новый проект', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu-event', 'new-project') },
                { label: 'Открыть проект', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu-event', 'open-project') },
                { label: 'Сохранить проект', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu-event', 'save-project') },
                { type: 'separator' },
                { label: 'Экспорт модели', click: () => mainWindow?.webContents.send('menu-event', 'export') },
                { type: 'separator' },
                isMac ? { label: 'Закрыть окно', role: 'close' } : { label: 'Выход', role: 'quit' }
            ]
        },
        {
            label: 'Правка',
            submenu: [
                { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('menu-event', 'undo') },
                { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow?.webContents.send('menu-event', 'redo') },
                { type: 'separator' },
                { label: 'Копировать', accelerator: 'CmdOrCtrl+C', click: () => mainWindow?.webContents.send('menu-event', 'copy') },
                { label: 'Вставить', accelerator: 'CmdOrCtrl+V', click: () => mainWindow?.webContents.send('menu-event', 'paste') },
                { label: 'Удалить', accelerator: 'Delete', click: () => mainWindow?.webContents.send('menu-event', 'delete') },
                { type: 'separator' },
                { label: 'Выделить всё', accelerator: 'CmdOrCtrl+A', click: () => mainWindow?.webContents.send('menu-event', 'selectAll') },
                { label: 'Дублировать', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('menu-event', 'duplicate') }
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
                    click: (menuItem) => {
                        const enabled = menuItem.checked;
                        saveSetting('useLegacy', enabled);
                        if (mainWindow) mainWindow.reload();
                    }
                }
            ]
        },
        {
            label: 'Справка',
            submenu: [
                {
                    label: 'Проверить обновления',
                    click: () => mainWindow?.webContents.send('menu-event', 'check-updates')
                },
                { type: 'separator' },
                { label: 'Гайд по редактору', click: async () => await shell.openExternal('https://3dtoday.ru/blogs/envalid/kratkii-gaid-po-moemu-3d-redaktoru-kontrbagcad') },
                { type: 'separator' },
                { label: 'О программе', click: () => mainWindow?.webContents.send('menu-event', 'about') }
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

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: getIconPath(),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // <--- КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отключаем песочницу, чтобы preload мог загружать npm-модули
            preload: fsSync.existsSync(preloadPath) ? preloadPath : undefined
        }
    });

    mainWindow.loadURL('app://local/index-desktop.html').then(() => {
        mainWindow.maximize();
        mainWindow.show();
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
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
        // Парсим URL, чтобы правильно извлечь хост (local, lib) и путь
        const urlObj = new URL(request.url);
        let host = urlObj.host;
        let pathname = urlObj.pathname;

        // Если хост 'local' или '-', мы не включаем его в путь к файлу
        if (host === 'local' || host === '-') {
            host = '';
        }

        let filePath = host ? `${host}${pathname}` : pathname;

        // Убираем ведущий слеш
        if (filePath.startsWith('/')) filePath = filePath.slice(1);

        // Если это корень, отдаем index-desktop.html
        if (filePath === '' || filePath === 'index.html') {
            filePath = 'index-desktop.html';
        }

        // Декодируем пробелы (например, Arial%20Narrow -> Arial Narrow)
        filePath = decodeURIComponent(filePath);

        const baseDir = updater.getCurrentBundlePath() || __dirname;
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
            console.error(`[app://] 404 Not Found: ${fullPath}`);
            return new Response('Not Found', { status: 404 });
        }
    });
}

// ============================================================
//  ЗАПУСК
// ============================================================
app.whenReady().then(async () => {
    // ФИКС CORS
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.url.startsWith('https://www.kontrcad.ru/api/') || details.url.startsWith('https://www.kontrcad.ru/editor')) {
            const headers = details.responseHeaders || {};

            let origin = details.initiator || 'app://local';
            if (origin === 'app://-' || origin === 'app://local/') {
                origin = 'app://local';
            }

            for (const key in headers) {
                if (key.toLowerCase().startsWith('access-control-')) {
                    delete headers[key];
                }
            }

            headers['Access-Control-Allow-Origin'] = [origin];
            headers['Access-Control-Allow-Credentials'] = ['true'];
            headers['Access-Control-Allow-Methods'] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
            headers['Access-Control-Allow-Headers'] = ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'];

            callback({ responseHeaders: headers });
        } else {
            callback({ responseHeaders: details.responseHeaders });
        }
    });

    await updater.initialize();
    setupIPCHandlers(updater);

    // ★ ДОБАВЛЕНА ПРОВЕРКА: запускаем MCP только если пакет установлен
    if (process.argv.includes('--mcp')) {
        if (!Server || !StdioServerTransport) {
            console.error('[MCP] SDK не установлен. Выполните npm install @modelcontextprotocol/sdk');
            app.quit();
            return;
        }

        const server = new Server(
            { name: 'kontrcad', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        const mcpWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: path.join(__dirname, 'preload.js')
            }
        });

        registerAppProtocol();
        mcpWindow.loadURL('app://local/index-desktop.html');

        mcpWindow.webContents.on('did-finish-load', () => {
            mcpWindow.webContents.send('mcp-get-tools');
        });

        let toolsList = [];

        ipcMain.once('mcp-tools-response', (event, tools) => {
            toolsList = tools;

            server.setRequestHandler('tools/list', async () => ({ tools: toolsList }));

            server.setRequestHandler('tools/call', async (req) => {
                return new Promise((resolve) => {
                    mcpWindow.webContents.send('mcp-call', req.params);

                    ipcMain.once('mcp-call-response', (e, res) => {
                        if (res.error) {
                            resolve({ content: [{ type: 'text', text: res.error }], isError: true });
                        } else {
                            resolve(res.result);
                        }
                    });
                });
            });

            const transport = new StdioServerTransport();
            server.connect(transport);
            console.error('[MCP] STDIO server started');
        });

        return;
    }

    registerAppProtocol();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});